// Role-scoped projection of a GameSnapshot: the single tested source of truth
// for what each connected client may see. Never mutates the input snapshot —
// every field is copied explicitly so a spread can never accidentally leak
// `reveal` or an un-masked `difficulty` to a role that shouldn't have it.

import type { GameSnapshot } from '@/server/gameEngine';
import type { PublicQuestion, RevealPayload } from '@/domain/publicQuestion';
import type { Role } from '@/server/auth';

export interface ProjectedSnapshot extends Omit<GameSnapshot, 'reveal'> {
  reveal: RevealPayload | null; // stripped per role/state rules below
  hold: boolean;
}

const REVEAL_VISIBLE_STATES: GameSnapshot['state'][] = ['REVEAL', 'KNOWLEDGE_DROP', 'SCORE_COMMITTED'];

// gameId -> display hold flag. Producer-controlled; consulted by the stream
// route on connect and re-emit, and flipped by the hold route.
export const holdFlags = new Map<string, boolean>();

function projectPublicQuestion(pq: PublicQuestion | null, role: Role, state: GameSnapshot['state']): PublicQuestion | null {
  if (!pq) return null;
  const maskDifficulty = (role === 'contestant' || role === 'stage') && state === 'QUESTION_READY';
  return {
    questionId: pq.questionId,
    domain: pq.domain,
    difficulty: maskDifficulty ? 'HIDDEN' : pq.difficulty,
    stem: pq.stem,
    choices: [...pq.choices],
    knowledgeDropAvailable: pq.knowledgeDropAvailable,
  };
}

export function projectForRole(snap: GameSnapshot, role: Role, hold: boolean): ProjectedSnapshot {
  const revealVisible = REVEAL_VISIBLE_STATES.includes(snap.state);

  return {
    gameId: snap.gameId,
    state: snap.state,
    mode: snap.mode,
    questionIndex: snap.questionIndex,
    activeContestantId: snap.activeContestantId,
    scores: { ...snap.scores },
    lifelines: Object.fromEntries(
      Object.entries(snap.lifelines).map(([id, used]) => [id, { ...used }]),
    ),
    publicQuestion: projectPublicQuestion(snap.publicQuestion, role, snap.state),
    reveal: revealVisible && snap.reveal ? { ...snap.reveal, choices: Array.isArray(snap.reveal.choices) ? [...snap.reveal.choices] : snap.reveal.choices } : null,
    confidence: snap.confidence,
    stealOpen: snap.stealOpen,
    hold,
  };
}
