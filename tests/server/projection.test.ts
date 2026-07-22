import { describe, it, expect } from 'vitest';
import { projectForRole } from '@/server/projection';
import type { GameSnapshot } from '@/server/gameEngine';

const base = (over: Partial<GameSnapshot>): GameSnapshot => ({
  gameId: 'g', state: 'QUESTION_READY', mode: 'live', questionIndex: 0,
  activeContestantId: 'c1', scores: { c1: 0 }, lifelines: { c1: { TRUSTED_CIRCLE: false, SOURCE_SIGNAL: false } },
  publicQuestion: { questionId: 'q', domain: 'SCIENCE', difficulty: 'INFERNO', stem: 's', choices: ['a','b'], knowledgeDropAvailable: false },
  reveal: null, confidence: null, stealOpen: false, ...over,
});

describe('projectForRole', () => {
  it('never leaks reveal outside reveal states, any role', () => {
    const withReveal = base({ state: 'ANSWER_LOCKED', reveal: { correctIndex: 1 } as any });
    for (const role of ['producer','host','contestant','stage'] as const)
      expect(projectForRole(withReveal, role, false).reveal).toBeNull();
  });
  it('passes reveal through in REVEAL state', () => {
    const s = base({ state: 'REVEAL', reveal: { correctIndex: 1 } as any });
    expect(projectForRole(s, 'host', false).reveal).not.toBeNull();
  });
  it('masks difficulty for contestant and stage before commit', () => {
    expect(projectForRole(base({}), 'contestant', false).publicQuestion?.difficulty).toBe('HIDDEN');
    expect(projectForRole(base({}), 'stage', false).publicQuestion?.difficulty).toBe('HIDDEN');
    expect(projectForRole(base({}), 'producer', false).publicQuestion?.difficulty).toBe('INFERNO');
    expect(projectForRole(base({ state: 'QUESTION_LIVE' }), 'contestant', false).publicQuestion?.difficulty).toBe('INFERNO');
  });
  it('carries the hold flag', () => {
    expect(projectForRole(base({}), 'stage', true).hold).toBe(true);
  });
  it('copies the reveal object rather than aliasing it', () => {
    const s = base({ state: 'REVEAL', reveal: { correctIndex: 1, choices: ['a','b'] } as any });
    const p = projectForRole(s, 'host', false);
    expect(p.reveal).not.toBe(s.reveal);
    expect(p.reveal).toEqual(expect.objectContaining({ correctIndex: 1 }));
  });
});
