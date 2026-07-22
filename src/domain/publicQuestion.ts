import type { Domain, Difficulty, QuestionVersionData } from './types';

export interface PublicQuestion {
  questionId: string; domain: Domain; difficulty: Difficulty | 'HIDDEN';
  stem: string; choices: string[]; knowledgeDropAvailable: boolean;
}

export function toPublicQuestion(qv: QuestionVersionData): PublicQuestion {
  return {
    questionId: qv.questionId,
    domain: qv.domain,
    difficulty: qv.difficulty,
    stem: qv.stem,
    choices: [...qv.choices],
    knowledgeDropAvailable: qv.knowledgeDrop !== null,
  };
}

export interface RevealPayload extends PublicQuestion {
  correctIndex: number; explanation: string; knowledgeDrop: string | null;
  sourceTitle: string; correctAsOf: string;
}

export function toRevealPayload(qv: QuestionVersionData): RevealPayload {
  return {
    ...toPublicQuestion(qv),
    correctIndex: qv.correctIndex,
    explanation: qv.explanation,
    knowledgeDrop: qv.knowledgeDrop,
    sourceTitle: qv.sourceTitle,
    correctAsOf: qv.correctAsOf,
  };
}
