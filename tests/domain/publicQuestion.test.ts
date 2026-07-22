import { describe, it, expect } from 'vitest';
import { toPublicQuestion, toRevealPayload } from '@/domain/publicQuestion';
import type { QuestionVersionData } from '@/domain/types';

const qv: QuestionVersionData = {
  questionId: 'q1', version: 1, domain: 'SCIENCE', difficulty: 'FLAME',
  stem: 'Which compound?', choices: ['A', 'B', 'C', 'D'], correctIndex: 2,
  explanation: 'Because.', knowledgeDrop: 'Drop.', sourceTitle: 'Src', sourceUrl: 'https://x',
  correctAsOf: '2026-07-01', jurisdiction: null, sensitivityTier: 1, expiresAt: null,
  readTimeSec: 9, factKey: 'compound-x', demoFlag: 'demo-seed',
};

describe('answer security', () => {
  it('public projection contains no correct answer, explanation or source detail', () => {
    const pub = toPublicQuestion(qv);
    const json = JSON.stringify(pub);
    expect(json).not.toContain('correctIndex');
    expect(json).not.toContain('"2"');
    expect((pub as Record<string, unknown>).correctIndex).toBeUndefined();
    expect((pub as Record<string, unknown>).explanation).toBeUndefined();
    expect(pub.choices).toEqual(['A', 'B', 'C', 'D']);
  });
  it('reveal payload carries answer and provenance', () => {
    const r = toRevealPayload(qv);
    expect(r.correctIndex).toBe(2);
    expect(r.sourceTitle).toBe('Src');
    expect(r.correctAsOf).toBe('2026-07-01');
  });
});
