import { describe, it, expect } from 'vitest';
import { generateLanes } from '@/domain/laneGenerator';
import type { LaneQuestion } from '@/domain/fairness';
import { FORMAT_V1 } from '@/domain/formatConfig';

const DOMAINS = ['SCIENCE','HISTORY','AFRICA_INDIGENOUS','LAW_POLICY','HEALTH_SAFETY','CULTURE_MEDIA','BUSINESS_ETHICS','FUTURE_INNOVATION'] as const;
const DIFFS = ['SPARK','SPARK','FLAME','FLAME','INFERNO','WILD_420'] as const;

function makePool(size: number): LaneQuestion[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `q${i}`,
    domain: DOMAINS[i % DOMAINS.length],
    difficulty: DIFFS[i % DIFFS.length],
    readTimeSec: 8 + (i % 5),
    sensitivityTier: (i % 10 === 0 ? 3 : 1) as 1 | 3,
    factKey: `fact-${i}`,
  }));
}

describe('generateLanes', () => {
  it('produces a violation-free pack from an adequate pool', () => {
    const pack = generateLanes(makePool(80), { seed: 'abc', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    expect(pack.report.violations).toEqual([]);
    expect(pack.lanes).toHaveLength(2);
    expect(pack.lanes[0]).toHaveLength(6);
  });
  it('is reproducible: same seed + pool ⇒ identical lanes', () => {
    const pool = makePool(80);
    const a = generateLanes(pool, { seed: 'seed-x', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    const b = generateLanes(pool, { seed: 'seed-x', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    expect(a.lanes.map(l => l.map(q => q.id))).toEqual(b.lanes.map(l => l.map(q => q.id)));
  });
  it('different seeds give different lanes', () => {
    const pool = makePool(80);
    const a = generateLanes(pool, { seed: 's1', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    const b = generateLanes(pool, { seed: 's2', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1);
    expect(a.lanes.map(l => l.map(q => q.id))).not.toEqual(b.lanes.map(l => l.map(q => q.id)));
  });
  it('never assigns the same question to two lanes', () => {
    const pack = generateLanes(makePool(80), { seed: 'abc', laneCount: 3, questionsPerLane: 6 }, FORMAT_V1);
    const ids = pack.lanes.flat().map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('throws POOL_TOO_SMALL when pool cannot fill lanes', () => {
    expect(() => generateLanes(makePool(10), { seed: 'a', laneCount: 2, questionsPerLane: 6 }, FORMAT_V1))
      .toThrow('POOL_TOO_SMALL');
  });
  it('handles full episode scale (2 lanes x 17 questions) without violations', () => {
    const pack = generateLanes(
      makePool(150),
      { seed: 'full-ep', laneCount: 2, questionsPerLane: 17 },
      FORMAT_V1,
    );
    expect(pack.report.violations).toEqual([]);
    expect(pack.lanes).toHaveLength(2);
    expect(pack.lanes[0]).toHaveLength(17);
    expect(pack.lanes[1]).toHaveLength(17);
  });
});
