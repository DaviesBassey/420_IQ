import { describe, it, expect } from 'vitest';
import { createQuestionSchema } from '@/server/questionService';

describe('createQuestionSchema', () => {
  const valid = {
    domain: 'SCIENCE', difficulty: 'FLAME', stem: 'Q?', choices: ['a','b','c','d'],
    correctIndex: 1, explanation: 'e', knowledgeDrop: null, sourceTitle: 't', sourceUrl: 'https://x',
    correctAsOf: '2026-07-01', jurisdiction: null, sensitivityTier: 1, expiresAt: null,
    readTimeSec: 9, factKey: 'k1', demoFlag: null,
  };
  it('accepts a valid tier-1 question', () => {
    expect(createQuestionSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects tier 3 without expiry or jurisdiction', () => {
    expect(createQuestionSchema.safeParse({ ...valid, sensitivityTier: 3 }).success).toBe(false);
    expect(createQuestionSchema.safeParse({ ...valid, sensitivityTier: 3, expiresAt: '2027-01-01', jurisdiction: 'NG' }).success).toBe(true);
  });
  it('rejects correctIndex outside choices', () => {
    expect(createQuestionSchema.safeParse({ ...valid, correctIndex: 9 }).success).toBe(false);
  });
});
