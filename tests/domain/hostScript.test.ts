import { describe, it, expect } from 'vitest';
import { hostLineFor } from '@/domain/hostScript';
import { TRANSITIONS, type GameState } from '@/domain/fsm';

describe('hostLineFor', () => {
  it('returns a non-empty original line for every game state', () => {
    const states = Object.keys(TRANSITIONS) as GameState[];
    for (const s of states) {
      const line = hostLineFor(s);
      expect(typeof line).toBe('string');
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
  it('gives distinct lines for the key show beats', () => {
    const beats: GameState[] = ['INTRO', 'QUESTION_LIVE', 'REVEAL', 'FINAL', 'COMPLETE'];
    const lines = beats.map(hostLineFor);
    expect(new Set(lines).size).toBe(beats.length);
  });
});
