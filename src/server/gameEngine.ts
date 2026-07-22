import type { Repos, GameEventRow } from '@/data/repos';
import { canTransition, type GameState } from '@/domain/fsm';
import { computeScore, type ScoreEvent } from '@/domain/scoring';
import { FORMAT_V1 } from '@/domain/formatConfig';
import { toPublicQuestion, toRevealPayload, type PublicQuestion, type RevealPayload } from '@/domain/publicQuestion';
import type { Confidence, Difficulty, SessionMode, LifelineType } from '@/domain/types';
import { getRepos } from '@/server/context';
import { bus } from '@/server/bus';

export interface GameSnapshot {
  gameId: string;
  state: GameState;
  mode: SessionMode;
  questionIndex: number; // position in the active lane sequence
  activeContestantId: string | null;
  scores: Record<string, number>;
  lifelines: Record<string, Record<LifelineType, boolean>>; // used flags
  publicQuestion: PublicQuestion | null; // present from QUESTION_READY
  reveal: RevealPayload | null; // present only in REVEAL/KNOWLEDGE_DROP/SCORE_COMMITTED
  confidence: Confidence | null;
  stealOpen: boolean;
}

// --- Event payload shapes -------------------------------------------------
// Every appended GameEvent carries a discriminated payload so the fold can
// interpret it without relying on prevState/nextState alone (recordSteal, for
// instance, does not change FSM state).
type LockedAnswer = {
  contestantId: string;
  choiceIndex: number;
  confidence: Confidence;
  correct: boolean;
  difficulty: Difficulty;
};

type EventPayload =
  | { kind: 'TRANSITION'; raw?: unknown } // `raw` is stored verbatim for audit only; the fold never reads it
  | ({ kind: 'ANSWER_LOCKED' } & LockedAnswer)
  | { kind: 'LIFELINE_ACTIVATED'; contestantId: string; type: LifelineType }
  | { kind: 'STEAL'; contestantId: string; choiceIndex: number; correct: boolean };

const QUESTION_STATES: GameState[] = [
  'QUESTION_READY', 'QUESTION_LIVE', 'ANSWER_LOCKED', 'LIFELINE_ACTIVE', 'REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED',
];
const REVEAL_STATES: GameState[] = ['REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED'];
const CONFIDENCE_VISIBLE_STATES: GameState[] = ['ANSWER_LOCKED', 'REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED'];

interface FoldResult {
  state: GameState;
  questionIndex: number;
  lastAnswer: LockedAnswer | null;
  confidenceUses: Record<string, number>; // non-CURIOUS uses per contestant
  scoreEvents: ScoreEvent[]; // synthesized ANSWER/STEAL events, in game order
  seenKeys: Set<string>;
  stealRecorded: boolean; // one-shot guard: has a STEAL already landed for the current question?
}

// Pure reducer: folds the ordered event log into the derived game state.
// Nothing here is cached across calls — this is the refresh/restart guarantee.
function fold(events: GameEventRow[]): FoldResult {
  let state: GameState = 'PRE_SHOW';
  let questionIndex = 0;
  let lastAnswer: LockedAnswer | null = null;
  let pendingAnswer: LockedAnswer | null = null;
  let pendingSteal: { contestantId: string; choiceIndex: number; correct: boolean } | null = null;
  let stealRecorded = false;
  const confidenceUses: Record<string, number> = {};
  const scoreEvents: ScoreEvent[] = [];
  const seenKeys = new Set<string>();

  for (const ev of events) {
    seenKeys.add(ev.idempotencyKey);
    const payload = JSON.parse(ev.payloadJson) as EventPayload;
    state = ev.nextState as GameState;

    if (payload.kind === 'ANSWER_LOCKED') {
      lastAnswer = {
        contestantId: payload.contestantId,
        choiceIndex: payload.choiceIndex,
        confidence: payload.confidence,
        correct: payload.correct,
        difficulty: payload.difficulty,
      };
      pendingAnswer = lastAnswer;
      stealRecorded = false; // new question round: steal eligibility resets
      if (payload.confidence !== 'CURIOUS') {
        confidenceUses[payload.contestantId] = (confidenceUses[payload.contestantId] ?? 0) + 1;
      }
    } else if (payload.kind === 'STEAL') {
      pendingSteal = { contestantId: payload.contestantId, choiceIndex: payload.choiceIndex, correct: payload.correct };
      stealRecorded = true;
    } else if (payload.kind === 'TRANSITION') {
      if (ev.nextState === 'SCORE_COMMITTED') {
        if (pendingAnswer) {
          scoreEvents.push({
            kind: 'ANSWER',
            contestantId: pendingAnswer.contestantId,
            difficulty: pendingAnswer.difficulty,
            confidence: pendingAnswer.confidence,
            correct: pendingAnswer.correct,
          });
          pendingAnswer = null;
        }
        if (pendingSteal) {
          scoreEvents.push({ kind: 'STEAL', contestantId: pendingSteal.contestantId, correct: pendingSteal.correct });
          pendingSteal = null;
        }
      }
      if (ev.nextState === 'NEXT_QUESTION') {
        questionIndex += 1;
      }
    }
  }

  return { state, questionIndex, lastAnswer, confidenceUses, scoreEvents, seenKeys, stealRecorded };
}

// Steal round opens in REVEAL only when the last answer was wrong AND the
// question was high-stakes (INFERNO difficulty or a CERTAIN confidence call).
function computeStealOpen(state: GameState, lastAnswer: LockedAnswer | null): boolean {
  return state === 'REVEAL' && lastAnswer !== null && !lastAnswer.correct
    && (lastAnswer.difficulty === 'INFERNO' || lastAnswer.confidence === 'CERTAIN');
}

// Lane sequencing: contestants alternate by questionIndex. Pure function of
// (lanes, contestants, questionIndex) — no state, so restart-safe.
function questionRefFor(
  lanes: string[][],
  contestants: { id: string; name: string }[],
  questionIndex: number,
): { contestantId: string; questionId: string } {
  const laneIdx = questionIndex % contestants.length;
  const pos = Math.floor(questionIndex / contestants.length);
  return { contestantId: contestants[laneIdx].id, questionId: lanes[laneIdx][pos] };
}

const LIFELINE_TYPES: LifelineType[] = ['TRUSTED_CIRCLE', 'SOURCE_SIGNAL'];

// Whose turn it is: pure function of (contestants, state, questionIndex), so
// it can be computed identically in snapshot() and in the turn-enforcement
// checks inside lockAnswer/activateLifeline without duplicating the rule.
function activeContestantIdFor(
  contestants: { id: string; name: string }[],
  state: GameState,
  questionIndex: number,
): string | null {
  if (state === 'PRE_SHOW') return null;
  return contestants[questionIndex % contestants.length].id;
}

export class GameEngine {
  constructor(private repos: Repos) {}

  async createGame(packId: string, mode: SessionMode, contestants: { id: string; name: string }[]): Promise<string> {
    return this.repos.games.create({ packId, mode, contestants });
  }

  private async loadCore(gameId: string) {
    const session = await this.repos.games.get(gameId);
    if (!session) throw new Error(`GAME_NOT_FOUND:${gameId}`);
    const pack = await this.repos.packs.get(session.packId);
    if (!pack) throw new Error(`PACK_NOT_FOUND:${session.packId}`);
    const events = await this.repos.games.events(gameId);
    return { session, pack, folded: fold(events) };
  }

  async snapshot(gameId: string): Promise<GameSnapshot> {
    const { session, pack, folded } = await this.loadCore(gameId);

    let publicQuestion: PublicQuestion | null = null;
    let reveal: RevealPayload | null = null;
    if (QUESTION_STATES.includes(folded.state)) {
      const { questionId } = questionRefFor(pack.lanes, session.contestants, folded.questionIndex);
      const qv = await this.repos.questions.latestVersion(questionId);
      if (qv) {
        publicQuestion = toPublicQuestion(qv);
        if (REVEAL_STATES.includes(folded.state)) reveal = toRevealPayload(qv);
      }
    }

    const adjustments = await this.repos.games.scoreEvents(gameId); // ADJUSTMENT events only (see adjustScore)
    const allScoreEvents = [...folded.scoreEvents, ...adjustments];
    const scores: Record<string, number> = {};
    for (const c of session.contestants) scores[c.id] = computeScore(allScoreEvents, c.id, FORMAT_V1);

    const lifelines: Record<string, Record<LifelineType, boolean>> = {};
    for (const c of session.contestants) {
      const used: Record<LifelineType, boolean> = { TRUSTED_CIRCLE: false, SOURCE_SIGNAL: false };
      for (const type of LIFELINE_TYPES) used[type] = await this.repos.games.lifelineUsed(gameId, c.id, type);
      lifelines[c.id] = used;
    }

    const activeContestantId = activeContestantIdFor(session.contestants, folded.state, folded.questionIndex);

    const confidence = CONFIDENCE_VISIBLE_STATES.includes(folded.state) ? (folded.lastAnswer?.confidence ?? null) : null;

    const stealOpen = computeStealOpen(folded.state, folded.lastAnswer);

    return {
      gameId,
      state: folded.state,
      mode: session.mode,
      questionIndex: folded.questionIndex,
      activeContestantId,
      scores,
      lifelines,
      publicQuestion,
      reveal,
      confidence,
      stealOpen,
    };
  }

  async transition(gameId: string, to: GameState, actor: string, idempotencyKey: string, callerPayload?: unknown): Promise<GameSnapshot> {
    const { session, pack, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (!canTransition(folded.state, to)) throw new Error(`ILLEGAL_TRANSITION:${folded.state}->${to}`);

    const payload: EventPayload = { kind: 'TRANSITION', raw: callerPayload };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor, prevState: folded.state, nextState: to, payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    if (to === 'COMPLETE' && session.mode === 'live') {
      await this.repos.games.markQuestionsUsed(pack.lanes.flat());
    }

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  async lockAnswer(gameId: string, contestantId: string, choiceIndex: number, confidence: Confidence, idempotencyKey: string): Promise<GameSnapshot> {
    const { session, pack, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (!canTransition(folded.state, 'ANSWER_LOCKED')) {
      throw new Error(`ILLEGAL_TRANSITION:${folded.state}->ANSWER_LOCKED`);
    }

    const activeContestantId = activeContestantIdFor(session.contestants, folded.state, folded.questionIndex);
    if (contestantId !== activeContestantId) throw new Error('NOT_ACTIVE_CONTESTANT');

    if (confidence !== 'CURIOUS') {
      const used = folded.confidenceUses[contestantId] ?? 0;
      if (used + 1 > FORMAT_V1.maxConfidenceUses) throw new Error('CONFIDENCE_EXHAUSTED');
    }

    const { questionId } = questionRefFor(pack.lanes, session.contestants, folded.questionIndex);
    const qv = await this.repos.questions.latestVersion(questionId);
    if (!qv) throw new Error(`QUESTION_NOT_FOUND:${questionId}`);
    const correct = choiceIndex === qv.correctIndex;

    const payload: EventPayload = { kind: 'ANSWER_LOCKED', contestantId, choiceIndex, confidence, correct, difficulty: qv.difficulty };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor: contestantId, prevState: folded.state, nextState: 'ANSWER_LOCKED', payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  async recordSteal(gameId: string, contestantId: string, choiceIndex: number, idempotencyKey: string): Promise<GameSnapshot> {
    const { session, pack, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (!computeStealOpen(folded.state, folded.lastAnswer)) throw new Error('STEAL_NOT_OPEN');
    if (folded.stealRecorded) throw new Error('STEAL_NOT_AVAILABLE'); // one-shot: already stolen this question
    if (contestantId === folded.lastAnswer?.contestantId) throw new Error('STEAL_NOT_AVAILABLE'); // no self-steal

    const { questionId } = questionRefFor(pack.lanes, session.contestants, folded.questionIndex);
    const qv = await this.repos.questions.latestVersion(questionId);
    if (!qv) throw new Error(`QUESTION_NOT_FOUND:${questionId}`);
    const correct = choiceIndex === qv.correctIndex;

    const payload: EventPayload = { kind: 'STEAL', contestantId, choiceIndex, correct };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor: contestantId, prevState: folded.state, nextState: folded.state, payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  async activateLifeline(gameId: string, contestantId: string, type: LifelineType, actor: string, idempotencyKey: string): Promise<GameSnapshot> {
    const { session, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (!canTransition(folded.state, 'LIFELINE_ACTIVE')) {
      throw new Error(`ILLEGAL_TRANSITION:${folded.state}->LIFELINE_ACTIVE`);
    }

    const activeContestantId = activeContestantIdFor(session.contestants, folded.state, folded.questionIndex);
    if (contestantId !== activeContestantId) throw new Error('NOT_ACTIVE_CONTESTANT');

    await this.repos.games.recordLifelineUse(gameId, contestantId, type); // throws LIFELINE_ALREADY_USED

    const payload: EventPayload = { kind: 'LIFELINE_ACTIVATED', contestantId, type };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor, prevState: folded.state, nextState: 'LIFELINE_ACTIVE', payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  async adjustScore(gameId: string, contestantId: string, delta: number, reason: string, approvedBy: string, actor: string): Promise<GameSnapshot> {
    if (!reason.trim()) throw new Error('ADJUSTMENT_REASON_REQUIRED');
    if (approvedBy === actor) throw new Error('ADJUSTMENT_REQUIRES_INDEPENDENT_APPROVER');

    await this.repos.games.appendScoreEvent(gameId, { kind: 'ADJUSTMENT', contestantId, delta, reason, approvedBy });
    await this.repos.audit.log({
      actor, action: 'game.adjustScore', detail: JSON.stringify({ gameId, contestantId, delta, reason, approvedBy }),
    });

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }
}

let singleton: GameEngine | null = null;
export function getEngine(): GameEngine {
  if (!singleton) singleton = new GameEngine(getRepos());
  return singleton;
}

// Shared error -> HTTP status mapping for the thin API routes.
export function engineErrorStatus(err: unknown): number {
  if (err instanceof Error) {
    if (
      err.message.startsWith('ILLEGAL_TRANSITION')
      || err.message === 'CONFIDENCE_EXHAUSTED'
      || err.message === 'LIFELINE_ALREADY_USED'
      || err.message === 'NOT_ACTIVE_CONTESTANT'
      || err.message === 'STEAL_NOT_AVAILABLE'
      || err.message === 'IDEMPOTENCY_CONFLICT'
    ) {
      return 409;
    }
    if (err.message.startsWith('PACK_NOT_FOUND')) return 404;
  }
  return 500;
}
