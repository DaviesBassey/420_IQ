import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createSeededRng, seededShuffle, generateSeed } from '@/domain/rng';

describe('rng', () => {
  it('same seed produces identical sequences', () => {
    const a = createSeededRng('seed-1'), b = createSeededRng('seed-1');
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('different seeds diverge', () => {
    const a = createSeededRng('seed-1'), b = createSeededRng('seed-2');
    expect(Array.from({ length: 5 }, a)).not.toEqual(Array.from({ length: 5 }, b));
  });
  it('values are uniform in [0,1)', () => {
    const r = createSeededRng('u');
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('seededShuffle is a permutation and deterministic', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = seededShuffle(items, createSeededRng('s'));
    const s2 = seededShuffle(items, createSeededRng('s'));
    expect(s1).toEqual(s2);
    expect([...s1].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });
  it('generateSeed returns 32 hex chars, unique across calls', () => {
    const s = generateSeed();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSeed()).not.toBe(s);
  });
  it('property: shuffle preserves multiset for any array', () => {
    fc.assert(fc.property(fc.array(fc.integer(), { maxLength: 40 }), fc.string(), (arr, seed) => {
      const out = seededShuffle(arr, createSeededRng(seed));
      return out.length === arr.length &&
        JSON.stringify([...out].sort()) === JSON.stringify([...arr].sort());
    }));
  });
});
