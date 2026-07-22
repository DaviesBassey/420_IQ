import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TRANSITIONS, canTransition, type GameState } from '@/domain/fsm';

describe('fsm', () => {
  it('allows the happy path', () => {
    const path: GameState[] = ['PRE_SHOW','INTRO','QUESTION_READY','QUESTION_LIVE','ANSWER_LOCKED','REVEAL','KNOWLEDGE_DROP','SCORE_COMMITTED','NEXT_QUESTION','QUESTION_READY'];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it('blocks illegal transitions', () => {
    expect(canTransition('PRE_SHOW', 'REVEAL')).toBe(false);
    expect(canTransition('QUESTION_LIVE', 'SCORE_COMMITTED')).toBe(false);
    expect(canTransition('COMPLETE', 'PRE_SHOW')).toBe(false);
    expect(canTransition('REVEAL', 'QUESTION_LIVE')).toBe(false);
  });
  it('lifeline loops back to live question or straight to lock', () => {
    expect(canTransition('QUESTION_LIVE', 'LIFELINE_ACTIVE')).toBe(true);
    expect(canTransition('LIFELINE_ACTIVE', 'QUESTION_LIVE')).toBe(true);
    expect(canTransition('LIFELINE_ACTIVE', 'ANSWER_LOCKED')).toBe(true);
  });
  it('property: canTransition agrees exactly with the table', () => {
    const states = Object.keys(TRANSITIONS) as GameState[];
    fc.assert(fc.property(fc.constantFrom(...states), fc.constantFrom(...states), (a, b) =>
      canTransition(a, b) === TRANSITIONS[a].includes(b)));
  });
});
