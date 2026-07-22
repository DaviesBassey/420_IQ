import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeScore, type ScoreEvent } from '@/domain/scoring';
import { FORMAT_V1 } from '@/domain/formatConfig';

const C = 'c1';
const ans = (difficulty: any, confidence: any, correct: boolean): ScoreEvent =>
  ({ kind: 'ANSWER', contestantId: C, difficulty, confidence, correct });

describe('computeScore', () => {
  it('scores a correct Spark at face value', () => {
    expect(computeScore([ans('SPARK', 'CURIOUS', true)], C, FORMAT_V1)).toBe(100);
  });
  it('applies confidence multiplier with whole numbers (Flame ×1.5 = 375)', () => {
    expect(computeScore([ans('FLAME', 'CONFIDENT', true)], C, FORMAT_V1)).toBe(375);
  });
  it('penalises a wrong Flame ×1.5 as −75, floored at zero', () => {
    expect(computeScore([ans('FLAME', 'CONFIDENT', false)], C, FORMAT_V1)).toBe(0);
    expect(computeScore([ans('SPARK', 'CURIOUS', true), ans('FLAME', 'CONFIDENT', false)], C, FORMAT_V1)).toBe(25);
  });
  it('wrong Spark costs nothing', () => {
    expect(computeScore([ans('SPARK', 'CERTAIN', false)], C, FORMAT_V1)).toBe(0);
  });
  it('steal awards 200 on success, 0 on failure', () => {
    expect(computeScore([{ kind: 'STEAL', contestantId: C, correct: true }], C, FORMAT_V1)).toBe(200);
    expect(computeScore([{ kind: 'STEAL', contestantId: C, correct: false }], C, FORMAT_V1)).toBe(0);
  });
  it('final Reach swings ±1000 but never below zero', () => {
    const base: ScoreEvent[] = [ans('INFERNO', 'CURIOUS', true)]; // 500
    expect(computeScore([...base, { kind: 'FINAL', contestantId: C, band: 'REACH', correct: false }], C, FORMAT_V1)).toBe(0);
    expect(computeScore([...base, { kind: 'FINAL', contestantId: C, band: 'REACH', correct: true }], C, FORMAT_V1)).toBe(1500);
  });
  it('ignores other contestants events', () => {
    expect(computeScore([{ ...ans('SPARK', 'CURIOUS', true), contestantId: 'other' } as ScoreEvent], C, FORMAT_V1)).toBe(0);
  });
  it('adjustment applies delta with floor', () => {
    expect(computeScore([{ kind: 'ADJUSTMENT', contestantId: C, delta: -50, reason: 'x', approvedBy: 'p' }], C, FORMAT_V1)).toBe(0);
    expect(computeScore([ans('SPARK','CURIOUS',true), { kind: 'ADJUSTMENT', contestantId: C, delta: 42, reason: 'x', approvedBy: 'p' }], C, FORMAT_V1)).toBe(142);
  });

  it('property: score is never negative and always an integer', () => {
    const arbEvent: fc.Arbitrary<ScoreEvent> = fc.oneof(
      fc.record({
        kind: fc.constant('ANSWER' as const), contestantId: fc.constant(C),
        difficulty: fc.constantFrom('SPARK', 'FLAME', 'INFERNO', 'WILD_420') as any,
        confidence: fc.constantFrom('CURIOUS', 'CONFIDENT', 'CERTAIN') as any,
        correct: fc.boolean(),
      }),
      fc.record({ kind: fc.constant('STEAL' as const), contestantId: fc.constant(C), correct: fc.boolean() }),
      fc.record({
        kind: fc.constant('FINAL' as const), contestantId: fc.constant(C),
        band: fc.constantFrom('HOLD', 'RISE', 'REACH') as any, correct: fc.boolean(),
      }),
      fc.record({
        kind: fc.constant('ADJUSTMENT' as const), contestantId: fc.constant(C),
        delta: fc.integer({ min: -2000, max: 2000 }), reason: fc.constant('r'), approvedBy: fc.constant('p'),
      }),
    );

    fc.assert(fc.property(fc.array(arbEvent, { maxLength: 60 }), (evs) => {
      const s = computeScore(evs, C, FORMAT_V1);
      return s >= 0 && Number.isInteger(s);
    }));
  });
});
