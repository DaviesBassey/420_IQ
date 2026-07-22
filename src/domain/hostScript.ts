import type { GameState } from '@/domain/fsm';

const LINES: Record<GameState, string> = {
  PRE_SHOW: 'Welcome to 420 IQ. Let us find out how high your knowledge really is.',
  INTRO: 'Meet tonight\'s minds. The Knowledge Ring is open.',
  QUESTION_READY: 'Here comes your category. Read carefully.',
  QUESTION_LIVE: 'The question is live. Take your time — but not too much.',
  ANSWER_LOCKED: 'Locked in. No turning back now.',
  LIFELINE_ACTIVE: 'A lifeline is in play. Let us see if it lifts your IQ.',
  REVEAL: 'Let us light up the truth.',
  KNOWLEDGE_DROP: 'And here is something worth keeping — your Knowledge Drop.',
  SCORE_COMMITTED: 'The ring records it. On we climb.',
  NEXT_QUESTION: 'Reset the ring. Next mind, next question.',
  FINAL: 'This is the 420 Decision. Choose your risk, and reason it out.',
  COMPLETE: 'The ring is complete. Tonight\'s knowledge belongs to our champion.',
};

export function hostLineFor(state: GameState): string {
  return LINES[state];
}
