import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import type { QuestionVersionData } from '@/domain/types';

const qv = (over: Partial<QuestionVersionData> = {}): QuestionVersionData & { status: 'DRAFT' } => ({
  questionId: '', version: 1, domain: 'SCIENCE', difficulty: 'SPARK', stem: 'S?',
  choices: ['a','b','c','d'], correctIndex: 0, explanation: 'e', knowledgeDrop: null,
  sourceTitle: 't', sourceUrl: 'u', correctAsOf: '2026-07-01', jurisdiction: null,
  sensitivityTier: 1, expiresAt: null, readTimeSec: 8, factKey: `f${Math.random()}`,
  demoFlag: 'demo-seed', status: 'DRAFT', ...over,
});

let repos: Repos;
beforeEach(() => { repos = createRepos(':memory:'); });

describe('question workflow', () => {
  it('walks Draft → Editorial → Approved and appears in eligible pool', async () => {
    const id = await repos.questions.create(qv());
    await repos.questions.setStatus(id, 'EDITORIAL_REVIEW', 'editor');
    await repos.questions.setStatus(id, 'APPROVED', 'editor');
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.map(p => p.questionId)).toContain(id);
  });
  it('rejects illegal workflow jumps', async () => {
    const id = await repos.questions.create(qv());
    await expect(repos.questions.setStatus(id, 'USED', 'editor')).rejects.toThrow();
  });
  it('blocks Tier 3 approval without expiry, and expired Tier 3 from the pool', async () => {
    const id = await repos.questions.create(qv({ sensitivityTier: 3 }));
    await repos.questions.setStatus(id, 'EDITORIAL_REVIEW', 'editor');
    await repos.questions.setStatus(id, 'COUNCIL_REVIEW', 'editor');
    await expect(repos.questions.setStatus(id, 'APPROVED', 'council')).rejects.toThrow('TIER3_REQUIRES_EXPIRY');

    const id2 = await repos.questions.create(qv({ sensitivityTier: 3, expiresAt: '2026-01-01' }));
    await repos.questions.setStatus(id2, 'EDITORIAL_REVIEW', 'e');
    await repos.questions.setStatus(id2, 'COUNCIL_REVIEW', 'e');
    await repos.questions.setStatus(id2, 'APPROVED', 'c');
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.map(p => p.questionId)).not.toContain(id2); // expired
  });
});

describe('game events', () => {
  it('is idempotent on duplicate idempotencyKey', async () => {
    const g = await repos.games.create({ packId: 'p', mode: 'live', contestants: [{ id: 'c1', name: 'A' }] });
    const e = { gameId: g, idempotencyKey: 'k1', actor: 'producer', prevState: 'PRE_SHOW', nextState: 'INTRO', payloadJson: '{}' };
    await repos.games.appendEvent(e);
    await repos.games.appendEvent(e);
    expect(await repos.games.events(g)).toHaveLength(1);
  });
  it('enforces one lifeline use per contestant per type', async () => {
    const g = await repos.games.create({ packId: 'p', mode: 'live', contestants: [{ id: 'c1', name: 'A' }] });
    await repos.games.recordLifelineUse(g, 'c1', 'TRUSTED_CIRCLE');
    await expect(repos.games.recordLifelineUse(g, 'c1', 'TRUSTED_CIRCLE')).rejects.toThrow('LIFELINE_ALREADY_USED');
    await repos.games.recordLifelineUse(g, 'c1', 'SOURCE_SIGNAL'); // other type still fine
  });
  it('round-trips score events in order', async () => {
    const g = await repos.games.create({ packId: 'p', mode: 'live', contestants: [{ id: 'c1', name: 'A' }] });
    await repos.games.appendScoreEvent(g, { kind: 'ANSWER', contestantId: 'c1', difficulty: 'SPARK', confidence: 'CURIOUS', correct: true });
    await repos.games.appendScoreEvent(g, { kind: 'STEAL', contestantId: 'c1', correct: true });
    const evs = await repos.games.scoreEvents(g);
    expect(evs.map(e => e.kind)).toEqual(['ANSWER', 'STEAL']);
  });
});

describe('packs', () => {
  it('approve freezes a checksum; same content ⇒ same checksum', async () => {
    const p1 = await repos.packs.create({ episodeId: 'ep1', seed: 's', lanes: [['q1'],['q2']], reportJson: '{}' });
    const p2 = await repos.packs.create({ episodeId: 'ep2', seed: 's', lanes: [['q1'],['q2']], reportJson: '{}' });
    const { checksum: c1 } = await repos.packs.approve(p1, 'ep');
    const { checksum: c2 } = await repos.packs.approve(p2, 'ep');
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
  });
});
