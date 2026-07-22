import type { Confidence, Difficulty, RiskBand } from './types';

export const FORMAT_V1 = {
  id: 'format-v1',
  difficulties: {
    SPARK:   { points: 100, missPenalty: 0,  weight: 1, opensSteal: false },
    FLAME:   { points: 250, missPenalty: 50, weight: 2, opensSteal: false },
    INFERNO: { points: 500, missPenalty: 0,  weight: 4, opensSteal: true },
    WILD_420:{ points: 420, missPenalty: 0,  weight: 3, opensSteal: false },
  } satisfies Record<Difficulty, { points: number; missPenalty: number; weight: number; opensSteal: boolean }>,
  confidence: { CURIOUS: 1, CONFIDENT: 1.5, CERTAIN: 2 } satisfies Record<Confidence, number>,
  certainMissOpensSteal: true,
  maxConfidenceUses: 3,
  stealPoints: 200,
  final: { HOLD: 250, RISE: 500, REACH: 1000 } satisfies Record<RiskBand, number>,
  scoreFloor: 0,
  timersSec: { question: 30, steal: 10, circleAdvice: 25, circleLock: 10, sourceSignal: 20 },
} as const;
export type FormatConfig = typeof FORMAT_V1;
