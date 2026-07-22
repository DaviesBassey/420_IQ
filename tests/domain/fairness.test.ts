import { describe, it, expect } from 'vitest';
import { evaluateLanes, type Lane, type LaneQuestion } from '@/domain/fairness';
import { FORMAT_V1 } from '@/domain/formatConfig';

let n = 0;
const q = (difficulty: LaneQuestion['difficulty'], domain: LaneQuestion['domain'] = 'SCIENCE',
  over: Partial<LaneQuestion> = {}): LaneQuestion => ({
  id: `q${n++}`, domain, difficulty, readTimeSec: 10, sensitivityTier: 1, factKey: `f${n}`, ...over,
});

// A balanced 6-question lane: S F S F I W (weights 1+2+1+2+4+3 = 13)
const balancedLane = (domain2: LaneQuestion['domain']): Lane => [
  q('SPARK'), q('FLAME', domain2), q('SPARK', domain2), q('FLAME'), q('INFERNO'), q('WILD_420', domain2),
];

describe('evaluateLanes', () => {
  it('passes a balanced two-lane pack', () => {
    const r = evaluateLanes([balancedLane('HISTORY'), balancedLane('HISTORY')], FORMAT_V1);
    expect(r.violations).toEqual([]);
    expect(r.balanceScore).toBeGreaterThan(0);
  });
  it('flags unequal lane lengths', () => {
    const r = evaluateLanes([balancedLane('HISTORY'), balancedLane('HISTORY').slice(1)], FORMAT_V1);
    expect(r.violations.some(v => v.includes('length'))).toBe(true);
  });
  it('flags weight imbalance beyond ±5%', () => {
    const heavy: Lane = [q('SPARK'), q('INFERNO'), q('SPARK'), q('INFERNO'), q('INFERNO'), q('INFERNO')]; // 1+4+1+4+4+4=18
    const r = evaluateLanes([balancedLane('HISTORY'), heavy], FORMAT_V1);
    expect(r.violations.some(v => v.includes('weight'))).toBe(true);
  });
  it('flags three same difficulties in a row', () => {
    const streaky: Lane = [q('SPARK'), q('FLAME'), q('FLAME'), q('FLAME'), q('INFERNO'), q('WILD_420')];
    const r = evaluateLanes([streaky, streaky.map(x => ({ ...x, id: x.id + 'b', factKey: x.factKey + 'b' }))], FORMAT_V1);
    expect(r.violations.some(v => v.includes('consecutive'))).toBe(true);
  });
  it('flags missing early Spark and missing Inferno', () => {
    const noSparkEarly: Lane = [q('FLAME'), q('FLAME'), q('INFERNO'), q('SPARK'), q('SPARK'), q('WILD_420')];
    const r1 = evaluateLanes([noSparkEarly], FORMAT_V1);
    expect(r1.violations.some(v => v.includes('Spark'))).toBe(true);
    const noInferno: Lane = [q('SPARK'), q('FLAME'), q('SPARK'), q('FLAME'), q('SPARK'), q('WILD_420')];
    const r2 = evaluateLanes([noInferno], FORMAT_V1);
    expect(r2.violations.some(v => v.includes('Inferno'))).toBe(true);
  });
  it('flags duplicate factKey across lanes', () => {
    const l1 = balancedLane('HISTORY');
    const l2 = balancedLane('HISTORY').map((x, i) => i === 0 ? { ...x, factKey: l1[0].factKey } : x);
    const r = evaluateLanes([l1, l2], FORMAT_V1);
    expect(r.violations.some(v => v.includes('duplicate'))).toBe(true);
  });
  it('flags sensitive-question imbalance > 1', () => {
    const l1 = balancedLane('HISTORY').map(x => ({ ...x, sensitivityTier: 3 as const }));
    const l2 = balancedLane('HISTORY');
    const r = evaluateLanes([l1, l2], FORMAT_V1);
    expect(r.violations.some(v => v.includes('sensitive'))).toBe(true);
  });
  it('flags domain exposure difference > 1', () => {
    const l1: Lane = [q('SPARK','LAW_POLICY'), q('FLAME','LAW_POLICY'), q('SPARK','LAW_POLICY'), q('FLAME'), q('INFERNO'), q('WILD_420')];
    const l2 = balancedLane('HISTORY');
    const r = evaluateLanes([l1, l2], FORMAT_V1);
    expect(r.violations.some(v => v.includes('domain'))).toBe(true);
  });
});
