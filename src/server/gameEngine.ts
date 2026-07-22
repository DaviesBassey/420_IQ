import type { Repos, GameEventRow } from '@/data/repos';
import { canTransition, type GameState } from '@/domain/fsm';
import { computeScore, type ScoreEvent } from '@/domain/scoring';
import { FORMAT_V1 } from '@/domain/formatConfig';
import { toPublicQuestion, toRevealPayload, type PublicQuestion, type RevealPayload } from '@/domain/publicQuestion';
import { createSeededRng, seededShuffle } from '@/domain/rng';
import type { Confidence, Difficulty, SessionMode, LifelineType, RiskBand } from '@/domain/types';
import { getRepos } from '@/server/context';
import { bus } from '@/server/bus';

export type TimerKind = 'question' | 'steal' | 'circleAdvice' | 'circleLock' | 'sourceSignal';
export type TimerState = { kind: TimerKind; deadline: string } | null;

export type LifelineDetail =
  | { type: 'TRUSTED_CIRCLE'; contactName: string | null; phase: 'CONNECTING' | 'ADVICE' | 'LOCK' | 'CONSENSUS_FALLBACK' }
  | { type: 'SOURCE_SIGNAL'; signals: { text: string }[]; verifiedIndex: number | null } // verifiedIndex null until contestant selects
  | null;

export interface GameSnapshot {
  gameId: string;
  state: GameState;
  mode: SessionMode;
  questionIndex: number; // position in the active lane sequence
  activeContestantId: string | null;
  contestants: { id: string; name: string }[];
  scores: Record<string, number>;
  lifelines: Record<string, Record<LifelineType, boolean>>; // used flags
  publicQuestion: PublicQuestion | null; // present from QUESTION_READY
  reveal: RevealPayload | null; // present only in REVEAL/KNOWLEDGE_DROP/SCORE_COMMITTED
  confidence: Confidence | null;
  stealOpen: boolean;
  lockedChoice: number | null; // last ANSWER_LOCKED choiceIndex; cleared on NEXT_QUESTION. Not privileged — public in-studio.
  timer: TimerState; // ISO deadline; displays compute remaining locally
  lifelineDetail: LifelineDetail;
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

// Internal fold-side tracking of the active lifeline — a superset of the
// public GameSnapshot['lifelineDetail']: it also carries the contestantId and
// (for TRUSTED_CIRCLE) the selected contactId, neither of which is exposed on
// the snapshot, so selectSignal() can identify the acting contestant without
// requiring the caller to pass one.
type FoldLifelineDetail =
  | { type: 'TRUSTED_CIRCLE'; contestantId: string; contactId: string | null; contactName: string | null; phase: 'CONNECTING' | 'ADVICE' | 'LOCK' | 'CONSENSUS_FALLBACK' }
  | { type: 'SOURCE_SIGNAL'; contestantId: string; selectedIndex: number | null }
  | null;

type EventPayload =
  | { kind: 'TRANSITION'; raw?: unknown; timer: TimerState } // `raw` is stored verbatim for audit only; the fold never reads it
  | ({ kind: 'ANSWER_LOCKED'; timer: TimerState } & LockedAnswer)
  | { kind: 'LIFELINE_ACTIVATED'; contestantId: string; type: 'TRUSTED_CIRCLE'; contactId: string | null; contactName: string | null; phase: 'CONNECTING' | 'CONSENSUS_FALLBACK'; timer: TimerState }
  | { kind: 'LIFELINE_ACTIVATED'; contestantId: string; type: 'SOURCE_SIGNAL'; timer: TimerState }
  | { kind: 'CIRCLE_PHASE'; phase: 'ADVICE' | 'LOCK'; timer: TimerState }
  | { kind: 'SIGNAL_SELECTED'; contestantId: string; index: number }
  | { kind: 'STEAL'; contestantId: string; choiceIndex: number; correct: boolean }
  | { kind: 'FINAL_LOCK'; contestantId: string; band: RiskBand; choiceIndex: number; correct: boolean }
  | { kind: 'ADJUSTMENT_MARKER' }; // idempotency marker only — the actual score effect lives in the score_events table

const QUESTION_STATES: GameState[] = [
  'QUESTION_READY', 'QUESTION_LIVE', 'ANSWER_LOCKED', 'LIFELINE_ACTIVE', 'REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED',
];
const REVEAL_STATES: GameState[] = ['REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED'];
const CONFIDENCE_VISIBLE_STATES: GameState[] = ['ANSWER_LOCKED', 'REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED'];

interface FoldResult {
  state: GameState;
  questionIndex: number;
  lastAnswer: LockedAnswer | null;
  lockedChoice: number | null;
  confidenceUses: Record<string, number>; // non-CURIOUS uses per contestant
  scoreEvents: ScoreEvent[]; // synthesized ANSWER/STEAL/FINAL events, in game order
  seenKeys: Set<string>;
  stealRecorded: boolean; // one-shot guard: has a STEAL already landed for the current question?
  timer: TimerState;
  lifelineDetail: FoldLifelineDetail;
  pendingFinal: { contestantId: string; band: RiskBand; correct: boolean } | null; // one-shot guard: has a FINAL_LOCK already landed while still in FINAL?
}

// Pure helper, isolated from fold()'s loop so TypeScript can narrow the
// discriminated union on a function parameter rather than a repeatedly
// reassigned closure variable (the latter defeats control-flow narrowing
// across many conditional branches in a loop).
function nextLifelineDetail(current: FoldLifelineDetail, nextState: GameState, payload: EventPayload): FoldLifelineDetail {
  if (nextState !== 'LIFELINE_ACTIVE') return null;
  if (payload.kind === 'LIFELINE_ACTIVATED') {
    return payload.type === 'TRUSTED_CIRCLE'
      ? { type: 'TRUSTED_CIRCLE', contestantId: payload.contestantId, contactId: payload.contactId, contactName: payload.contactName, phase: payload.phase }
      : { type: 'SOURCE_SIGNAL', contestantId: payload.contestantId, selectedIndex: null };
  }
  if (payload.kind === 'CIRCLE_PHASE' && current !== null && current.type === 'TRUSTED_CIRCLE') {
    return { ...current, phase: payload.phase };
  }
  if (payload.kind === 'SIGNAL_SELECTED' && current !== null && current.type === 'SOURCE_SIGNAL') {
    return { ...current, selectedIndex: payload.index };
  }
  return current;
}

// Pure reducer: folds the ordered event log into the derived game state.
// Nothing here is cached across calls — this is the refresh/restart guarantee.
function fold(events: GameEventRow[]): FoldResult {
  let state: GameState = 'PRE_SHOW';
  let questionIndex = 0;
  let lastAnswer: LockedAnswer | null = null;
  let lockedChoice: number | null = null;
  let pendingAnswer: LockedAnswer | null = null;
  let pendingSteal: { contestantId: string; choiceIndex: number; correct: boolean } | null = null;
  let pendingFinal: { contestantId: string; band: RiskBand; correct: boolean } | null = null;
  let stealRecorded = false;
  let timer: TimerState = null;
  let lifelineDetail: FoldLifelineDetail = null;
  const confidenceUses: Record<string, number> = {};
  const scoreEvents: ScoreEvent[] = [];
  const seenKeys = new Set<string>();

  for (const ev of events) {
    seenKeys.add(ev.idempotencyKey);
    const payload = JSON.parse(ev.payloadJson) as EventPayload;
    state = ev.nextState as GameState;

    // Leaving LIFELINE_ACTIVE (looping back to QUESTION_LIVE, or answering
    // straight out of it) always clears the active lifeline's detail;
    // nextLifelineDetail re-populates it when a LIFELINE_ACTIVATED event
    // re-enters LIFELINE_ACTIVE in the same iteration.
    lifelineDetail = nextLifelineDetail(lifelineDetail, state, payload);

    if ('timer' in payload) timer = payload.timer;

    if (payload.kind === 'ANSWER_LOCKED') {
      lastAnswer = {
        contestantId: payload.contestantId,
        choiceIndex: payload.choiceIndex,
        confidence: payload.confidence,
        correct: payload.correct,
        difficulty: payload.difficulty,
      };
      lockedChoice = payload.choiceIndex;
      pendingAnswer = lastAnswer;
      stealRecorded = false; // new question round: steal eligibility resets
      if (payload.confidence !== 'CURIOUS') {
        confidenceUses[payload.contestantId] = (confidenceUses[payload.contestantId] ?? 0) + 1;
      }
    } else if (payload.kind === 'STEAL') {
      pendingSteal = { contestantId: payload.contestantId, choiceIndex: payload.choiceIndex, correct: payload.correct };
      stealRecorded = true;
    } else if (payload.kind === 'FINAL_LOCK') {
      pendingFinal = { contestantId: payload.contestantId, band: payload.band, correct: payload.correct };
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
      if (ev.nextState === 'COMPLETE' && pendingFinal) {
        scoreEvents.push({ kind: 'FINAL', contestantId: pendingFinal.contestantId, band: pendingFinal.band, correct: pendingFinal.correct });
        pendingFinal = null;
      }
      if (ev.nextState === 'NEXT_QUESTION') {
        questionIndex += 1;
        lockedChoice = null;
      }
    }
  }

  return { state, questionIndex, lastAnswer, lockedChoice, confidenceUses, scoreEvents, seenKeys, stealRecorded, timer, lifelineDetail, pendingFinal };
}

// Steal round opens in REVEAL only when the last answer was wrong AND the
// question was high-stakes (INFERNO difficulty or a CERTAIN confidence call).
function computeStealOpen(state: GameState, lastAnswer: LockedAnswer | null): boolean {
  return state === 'REVEAL' && lastAnswer !== null && !lastAnswer.correct
    && (lastAnswer.difficulty === 'INFERNO' || lastAnswer.confidence === 'CERTAIN');
}

// Deadline computation for the generic transition() route. Only entering
// QUESTION_LIVE or a steal-eligible REVEAL carries a real countdown in this
// pilot — every other state is producer-paced, so timer is cleared (null).
function timerForTransition(to: GameState, stealOpen: boolean): TimerState {
  const now = Date.now();
  if (to === 'QUESTION_LIVE') {
    return { kind: 'question', deadline: new Date(now + FORMAT_V1.timersSec.question * 1000).toISOString() };
  }
  if (to === 'REVEAL' && stealOpen) {
    return { kind: 'steal', deadline: new Date(now + FORMAT_V1.timersSec.steal * 1000).toISOString() };
  }
  return null;
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

// True when `questionIndex` still has a corresponding question in the lanes
// (i.e. the per-lane position it maps to is within that lane's bounds). Used
// both to reject a NEXT_QUESTION transition that would run off the end of the
// pack, and (via committedLaneCount below) to locate the Final Round question.
function questionExistsAt(lanes: string[][], contestantsLength: number, questionIndex: number): boolean {
  const laneIdx = questionIndex % contestantsLength;
  const pos = Math.floor(questionIndex / contestantsLength);
  return pos < (lanes[laneIdx]?.length ?? 0);
}

// How many of `contestantId`'s own lane questions have already been committed
// (i.e. reached SCORE_COMMITTED with them as the answering contestant). Only
// ANSWER score events count — a STEAL is recorded against the stealing
// contestant, not the lane owner, so it never advances the owner's own lane
// position.
function committedLaneCount(scoreEvents: ScoreEvent[], contestantId: string): number {
  return scoreEvents.filter((e) => e.kind === 'ANSWER' && e.contestantId === contestantId).length;
}

// The Final Round question for a specific wagering contestant: their own
// lane's first not-yet-committed question (never the one they, or anyone
// else, just answered/revealed). Returns null when that contestant's lane is
// exhausted (every question in it has already been committed).
function finalQuestionRefFor(
  lanes: string[][],
  contestants: { id: string; name: string }[],
  contestantId: string,
  scoreEvents: ScoreEvent[],
): { contestantId: string; questionId: string } | null {
  const laneIdx = contestants.findIndex((c) => c.id === contestantId);
  if (laneIdx === -1) return null;
  const position = committedLaneCount(scoreEvents, contestantId);
  const lane = lanes[laneIdx];
  if (!lane || position >= lane.length) return null;
  return { contestantId, questionId: lane[position] };
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
    const pack = await this.repos.packs.get(packId);
    if (!pack) throw new Error('PACK_NOT_FOUND');
    if (!pack.approvedBy) throw new Error('PACK_NOT_APPROVED');
    if (contestants.length !== pack.lanes.length) throw new Error('CONTESTANT_COUNT_MISMATCH');
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

    const activeContestantId = activeContestantIdFor(session.contestants, folded.state, folded.questionIndex);

    let publicQuestion: PublicQuestion | null = null;
    let reveal: RevealPayload | null = null;
    if (QUESTION_STATES.includes(folded.state)) {
      const { questionId } = questionRefFor(pack.lanes, session.contestants, folded.questionIndex);
      const qv = await this.repos.questions.latestVersion(questionId);
      if (qv) {
        publicQuestion = toPublicQuestion(qv);
        if (REVEAL_STATES.includes(folded.state)) reveal = toRevealPayload(qv);
      }
    } else if (folded.state === 'FINAL' && activeContestantId) {
      // The Final Round question is scoped to whichever contestant is set to
      // wager (activeContestantId, carried over from the last question turn):
      // their own lane's first not-yet-committed question, never the one
      // whose answer was just revealed. Public projection only — no
      // correctIndex — same as every other in-round publicQuestion.
      const ref = finalQuestionRefFor(pack.lanes, session.contestants, activeContestantId, folded.scoreEvents);
      if (ref) {
        const qv = await this.repos.questions.latestVersion(ref.questionId);
        if (qv) publicQuestion = toPublicQuestion(qv);
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

    const confidence = CONFIDENCE_VISIBLE_STATES.includes(folded.state) ? (folded.lastAnswer?.confidence ?? null) : null;

    const stealOpen = computeStealOpen(folded.state, folded.lastAnswer);

    let lifelineDetail: LifelineDetail = null;
    if (folded.state === 'LIFELINE_ACTIVE' && folded.lifelineDetail) {
      if (folded.lifelineDetail.type === 'TRUSTED_CIRCLE') {
        lifelineDetail = {
          type: 'TRUSTED_CIRCLE',
          contactName: folded.lifelineDetail.contactName,
          phase: folded.lifelineDetail.phase,
        };
      } else {
        // Deterministic re-derivation, not stored state: the same seed
        // (gameId + questionIndex) over the same stored signals always
        // reshuffles identically, so the shuffled order and the position of
        // the VERIFIED signal can be recomputed on every call — including
        // after a restart — without persisting the signal contents or their
        // kinds in the event payload (which would otherwise defeat the
        // "no kind labels before selection" rule for the raw audit log too).
        const { questionId } = questionRefFor(pack.lanes, session.contestants, folded.questionIndex);
        const stored = await this.repos.signals.get(questionId);
        const rng = createSeededRng(`${gameId}${folded.questionIndex}`);
        const shuffled = stored ? seededShuffle(stored, rng) : [];
        const signals = shuffled.map((s) => ({ text: s.text }));
        const verifiedIndex = folded.lifelineDetail.selectedIndex !== null
          ? shuffled.findIndex((s) => s.kind === 'VERIFIED')
          : null;
        lifelineDetail = { type: 'SOURCE_SIGNAL', signals, verifiedIndex };
      }
    }

    return {
      gameId,
      state: folded.state,
      mode: session.mode,
      questionIndex: folded.questionIndex,
      activeContestantId,
      contestants: session.contestants,
      scores,
      lifelines,
      publicQuestion,
      reveal,
      confidence,
      stealOpen,
      lockedChoice: folded.lockedChoice,
      timer: folded.timer,
      lifelineDetail,
    };
  }

  async transition(gameId: string, to: GameState, actor: string, idempotencyKey: string, callerPayload?: unknown): Promise<GameSnapshot> {
    const { session, pack, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (!canTransition(folded.state, to)) throw new Error(`ILLEGAL_TRANSITION:${folded.state}->${to}`);

    // NEXT_QUESTION must land on a real question — reject it once the
    // incremented questionIndex would run past the end of every lane. FINAL
    // remains legal from SCORE_COMMITTED regardless (that's the producer's
    // way out once the lanes are exhausted).
    if (to === 'NEXT_QUESTION' && !questionExistsAt(pack.lanes, session.contestants.length, folded.questionIndex + 1)) {
      throw new Error('LANES_EXHAUSTED');
    }

    const stealOpen = computeStealOpen(to, folded.lastAnswer);
    const timer = timerForTransition(to, stealOpen);
    const payload: EventPayload = { kind: 'TRANSITION', raw: callerPayload, timer };
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

    // Locking an answer stops any in-flight countdown (question timer no
    // longer applies once the contestant has committed).
    const payload: EventPayload = { kind: 'ANSWER_LOCKED', contestantId, choiceIndex, confidence, correct, difficulty: qv.difficulty, timer: null };
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
    const { session, pack, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (!canTransition(folded.state, 'LIFELINE_ACTIVE')) {
      throw new Error(`ILLEGAL_TRANSITION:${folded.state}->LIFELINE_ACTIVE`);
    }

    const activeContestantId = activeContestantIdFor(session.contestants, folded.state, folded.questionIndex);
    if (contestantId !== activeContestantId) throw new Error('NOT_ACTIVE_CONTESTANT');

    let payload: EventPayload;
    if (type === 'TRUSTED_CIRCLE') {
      const contacts = await this.repos.contacts.forContestant(contestantId);
      const available = contacts.filter((c) => c.available).sort((a, b) => a.name.localeCompare(b.name));
      const rng = createSeededRng(`${gameId}${folded.questionIndex}`);
      let contactId: string | null = null;
      let contactName: string | null = null;
      let phase: 'CONNECTING' | 'CONSENSUS_FALLBACK' = 'CONSENSUS_FALLBACK';
      if (available.length > 0) {
        const idx = Math.floor(rng() * available.length);
        contactId = available[idx].id;
        contactName = available[idx].name;
        phase = 'CONNECTING';
      }
      // CONNECTING/CONSENSUS_FALLBACK are producer-paced (no fixed duration
      // defined in FORMAT_V1.timersSec); a real deadline appears once the
      // producer advances to ADVICE or LOCK via /lifelines/circle/resolve.
      payload = { kind: 'LIFELINE_ACTIVATED', contestantId, type: 'TRUSTED_CIRCLE', contactId, contactName, phase, timer: null };
    } else {
      const { questionId } = questionRefFor(pack.lanes, session.contestants, folded.questionIndex);
      const stored = await this.repos.signals.get(questionId);
      if (!stored || stored.length !== 3) throw new Error('NO_SIGNALS_FOR_QUESTION');
      const timer: TimerState = { kind: 'sourceSignal', deadline: new Date(Date.now() + FORMAT_V1.timersSec.sourceSignal * 1000).toISOString() };
      payload = { kind: 'LIFELINE_ACTIVATED', contestantId, type: 'SOURCE_SIGNAL', timer };
    }

    // recordLifelineUse throws LIFELINE_ALREADY_USED before any event is
    // appended, so a rejected activation never leaves a dangling event.
    await this.repos.games.recordLifelineUse(gameId, contestantId, type);

    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor, prevState: folded.state, nextState: 'LIFELINE_ACTIVE', payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  // Advances the Trusted Circle phase (CONNECTING -> ADVICE -> LOCK), each
  // hop setting a fresh deadline from FORMAT_V1.timersSec. Only legal while
  // LIFELINE_ACTIVE with an active TRUSTED_CIRCLE detail that actually has a
  // connected contact (CONSENSUS_FALLBACK has no advice/lock phases).
  async advanceCirclePhase(gameId: string, phase: 'ADVICE' | 'LOCK', actor: string, idempotencyKey: string): Promise<GameSnapshot> {
    const { folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (folded.state !== 'LIFELINE_ACTIVE' || folded.lifelineDetail?.type !== 'TRUSTED_CIRCLE') {
      throw new Error('ILLEGAL_TRANSITION:CIRCLE_PHASE_NOT_ACTIVE');
    }
    const currentPhase = folded.lifelineDetail.phase;
    const legalNext: Record<string, string[]> = { CONNECTING: ['ADVICE'], ADVICE: ['LOCK'], LOCK: [], CONSENSUS_FALLBACK: [] };
    if (!legalNext[currentPhase]?.includes(phase)) {
      throw new Error(`ILLEGAL_TRANSITION:${currentPhase}->${phase}`);
    }

    const seconds = phase === 'ADVICE' ? FORMAT_V1.timersSec.circleAdvice : FORMAT_V1.timersSec.circleLock;
    const timer: TimerState = { kind: phase === 'ADVICE' ? 'circleAdvice' : 'circleLock', deadline: new Date(Date.now() + seconds * 1000).toISOString() };
    const payload: EventPayload = { kind: 'CIRCLE_PHASE', phase, timer };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor, prevState: folded.state, nextState: folded.state, payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  // Reveals which shuffled Source Signal position is VERIFIED. Takes no
  // contestantId/actor: the acting contestant is the one who activated the
  // lifeline (tracked internally on the fold's lifelineDetail), matching the
  // brief's (gameId, index, idempotencyKey) signature.
  async selectSignal(gameId: string, index: number, idempotencyKey: string): Promise<GameSnapshot> {
    const { folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (folded.state !== 'LIFELINE_ACTIVE' || folded.lifelineDetail?.type !== 'SOURCE_SIGNAL') {
      throw new Error('ILLEGAL_TRANSITION:SIGNAL_SELECTION_NOT_AVAILABLE');
    }

    const payload: EventPayload = { kind: 'SIGNAL_SELECTED', contestantId: folded.lifelineDetail.contestantId, index };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor: folded.lifelineDetail.contestantId, prevState: folded.state, nextState: folded.state, payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  // FOLD-IN A: the Final Round wager lock. Valid only in FINAL state. Grades
  // against the wagering contestant's own FIRST UNPLAYED lane question (their
  // committed-lane position — see committedLaneCount/finalQuestionRefFor) —
  // never the last-revealed question — so the Final Round is always a fresh
  // question the contestant hasn't already seen the answer to.
  async lockFinal(gameId: string, contestantId: string, band: RiskBand, choiceIndex: number, idempotencyKey: string): Promise<GameSnapshot> {
    const { session, pack, folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    if (folded.state !== 'FINAL') throw new Error(`ILLEGAL_TRANSITION:${folded.state}->FINAL_LOCK`);

    // Guard against a second FINAL_LOCK (under a different idempotencyKey)
    // silently overwriting the fold's pendingFinal — same-key replay is
    // already handled above via seenKeys, so this only fires for a genuinely
    // new lock attempt while one is already pending for this FINAL round.
    if (folded.pendingFinal) throw new Error('FINAL_ALREADY_LOCKED');

    if (!session.contestants.some((c) => c.id === contestantId)) throw new Error('UNKNOWN_CONTESTANT');

    const ref = finalQuestionRefFor(pack.lanes, session.contestants, contestantId, folded.scoreEvents);
    if (!ref) throw new Error('NO_FINAL_QUESTION');
    const qv = await this.repos.questions.latestVersion(ref.questionId);
    if (!qv) throw new Error(`QUESTION_NOT_FOUND:${ref.questionId}`);
    const correct = choiceIndex === qv.correctIndex;

    // The scoring effect itself is deferred: fold() only flushes the FINAL
    // ScoreEvent once the FINAL -> COMPLETE transition is processed, mirroring
    // how ANSWER_LOCKED/STEAL are flushed on the SCORE_COMMITTED transition.
    const payload: EventPayload = { kind: 'FINAL_LOCK', contestantId, band, choiceIndex, correct };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor: contestantId, prevState: folded.state, nextState: folded.state, payloadJson: JSON.stringify(payload),
    });
    if (!inserted && !folded.seenKeys.has(idempotencyKey)) throw new Error('IDEMPOTENCY_CONFLICT');

    const snap = await this.snapshot(gameId);
    bus.emit(`game:${gameId}`, snap);
    return snap;
  }

  // FOLD-IN B: idempotencyKey dedupes via the same (game_id, idempotency_key)
  // unique constraint every other engine method relies on. The ADJUSTMENT
  // marker GameEvent carries no scoring payload of its own — it exists only
  // so a duplicate call is detected via folded.seenKeys before the ScoreEvent
  // (still recorded separately in the score_events table, unchanged) is ever
  // appended.
  async adjustScore(gameId: string, contestantId: string, delta: number, reason: string, approvedBy: string, actor: string, idempotencyKey: string): Promise<GameSnapshot> {
    if (!reason.trim()) throw new Error('ADJUSTMENT_REASON_REQUIRED');
    if (approvedBy === actor) throw new Error('ADJUSTMENT_REQUIRES_INDEPENDENT_APPROVER');

    const { folded } = await this.loadCore(gameId);
    if (folded.seenKeys.has(idempotencyKey)) return this.snapshot(gameId); // idempotent replay

    const payload: EventPayload = { kind: 'ADJUSTMENT_MARKER' };
    const inserted = await this.repos.games.appendEvent({
      gameId, idempotencyKey, actor, prevState: folded.state, nextState: folded.state, payloadJson: JSON.stringify(payload),
    });
    if (!inserted) throw new Error('IDEMPOTENCY_CONFLICT'); // race: key consumed between load and insert

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
      || err.message === 'STEAL_NOT_OPEN'
      || err.message === 'IDEMPOTENCY_CONFLICT'
      || err.message === 'NO_SIGNALS_FOR_QUESTION'
      || err.message === 'ADJUSTMENT_REASON_REQUIRED'
      || err.message === 'ADJUSTMENT_REQUIRES_INDEPENDENT_APPROVER'
      || err.message === 'FINAL_ALREADY_LOCKED'
      || err.message === 'UNKNOWN_CONTESTANT'
      || err.message === 'PACK_NOT_APPROVED'
      || err.message === 'CONTESTANT_COUNT_MISMATCH'
      || err.message === 'NO_FINAL_QUESTION'
      || err.message === 'LANES_EXHAUSTED'
    ) {
      return 409;
    }
    if (err.message.startsWith('PACK_NOT_FOUND')) return 404;
    if (err.message.startsWith('GAME_NOT_FOUND')) return 404;
  }
  return 500;
}
