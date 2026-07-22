import { describe, it, expect } from 'vitest';
import { selectCues } from '@/audio/transitions';
import type { ProjectedSnapshot } from '@/server/projection';

const base = (over: Partial<ProjectedSnapshot>): ProjectedSnapshot => ({
  gameId: 'g', state: 'PRE_SHOW', mode: 'live', questionIndex: 0,
  activeContestantId: 'c1', contestants: [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }],
  scores: { c1: 0, c2: 0 }, lifelines: {}, publicQuestion: null, reveal: null,
  confidence: null, stealOpen: false, lockedChoice: null, timer: null,
  lifelineDetail: null, hold: false, ...over,
} as ProjectedSnapshot);

describe('selectCues', () => {
  it('category on entering QUESTION_READY', () => {
    expect(selectCues(base({ state: 'INTRO' }), base({ state: 'QUESTION_READY' }))).toEqual(['category']);
  });
  it('tensionStart on entering QUESTION_LIVE', () => {
    expect(selectCues(base({ state: 'QUESTION_READY' }), base({ state: 'QUESTION_LIVE' }))).toEqual(['tensionStart']);
  });
  it('lock + tensionStop on entering ANSWER_LOCKED', () => {
    expect(selectCues(base({ state: 'QUESTION_LIVE' }), base({ state: 'ANSWER_LOCKED' }))).toEqual(['lock', 'tensionStop']);
  });
  it('correct when locked choice matches on REVEAL', () => {
    const prev = base({ state: 'ANSWER_LOCKED', lockedChoice: 2 });
    const next = base({ state: 'REVEAL', lockedChoice: 2, reveal: { correctIndex: 2 } as any });
    expect(selectCues(prev, next)).toEqual(['correct']);
  });
  it('wrong when locked choice differs on REVEAL', () => {
    const prev = base({ state: 'ANSWER_LOCKED', lockedChoice: 0 });
    const next = base({ state: 'REVEAL', lockedChoice: 0, reveal: { correctIndex: 3 } as any });
    expect(selectCues(prev, next)).toEqual(['wrong']);
  });
  it('wrong + steal when steal window opens', () => {
    const prev = base({ state: 'ANSWER_LOCKED', lockedChoice: 0 });
    const next = base({ state: 'REVEAL', lockedChoice: 0, reveal: { correctIndex: 3 } as any, stealOpen: true });
    expect(selectCues(prev, next)).toEqual(['wrong', 'steal']);
  });
  it('victory on COMPLETE', () => {
    expect(selectCues(base({ state: 'FINAL' }), base({ state: 'COMPLETE' }))).toEqual(['victory']);
  });
  it('lifeline cue when a lifeline detail appears', () => {
    const prev = base({ state: 'QUESTION_LIVE', lifelineDetail: null });
    const circle = base({ state: 'LIFELINE_ACTIVE', lifelineDetail: { type: 'TRUSTED_CIRCLE' } as any });
    expect(selectCues(prev, circle)).toEqual(['lifelineCircle']);
    const signal = base({ state: 'LIFELINE_ACTIVE', lifelineDetail: { type: 'SOURCE_SIGNAL', signals: [], verifiedIndex: null } as any });
    expect(selectCues(prev, signal)).toEqual(['lifelineSignal']);
  });
  it('nothing when state is unchanged', () => {
    expect(selectCues(base({ state: 'QUESTION_LIVE' }), base({ state: 'QUESTION_LIVE' }))).toEqual([]);
  });
  it('nothing while on hold', () => {
    expect(selectCues(base({ state: 'QUESTION_READY' }), base({ state: 'REVEAL', hold: true, lockedChoice: 1, reveal: { correctIndex: 1 } as any }))).toEqual([]);
  });
  it('first snapshot (prev null) does not fire a stale transition', () => {
    expect(selectCues(null, base({ state: 'PRE_SHOW' }))).toEqual([]);
  });
});
