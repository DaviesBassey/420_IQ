import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';
import { generatePack, approvePack } from '@/server/packService';
import { GameEngine } from '@/server/gameEngine';

let repos: Repos; let engine: GameEngine; let gameId: string; let packId: string;

beforeEach(async () => {
  repos = createRepos(':memory:');
  await seedDatabase(repos);
  ({ packId } = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6 }));
  await approvePack(repos, packId, 'ep');
  engine = new GameEngine(repos);
  gameId = await engine.createGame(packId, 'live', [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }]);
  for (const [to, k] of [['INTRO','k1'],['QUESTION_READY','k2'],['QUESTION_LIVE','k3']] as const)
    await engine.transition(gameId, to, 'prod', k);
});

describe('timers', () => {
  it('QUESTION_LIVE carries a question deadline that survives restart', async () => {
    const s = await engine.snapshot(gameId);
    expect(s.timer?.kind).toBe('question');
    expect(new Date(s.timer!.deadline).getTime()).toBeGreaterThan(Date.now());
    expect((await new GameEngine(repos).snapshot(gameId)).timer).toEqual(s.timer);
  });
});

describe('Trusted Circle', () => {
  it('selects an available contact deterministically, else falls back to consensus', async () => {
    await repos.contacts.add({ contestantId: 'c1', name: 'Zik', consentRecordedAt: '2026-07-20', available: true });
    await repos.contacts.add({ contestantId: 'c1', name: 'Efe', consentRecordedAt: '2026-07-20', available: false });
    const s = await engine.activateLifeline(gameId, 'c1', 'TRUSTED_CIRCLE', 'prod', 'kA');
    expect(s.lifelineDetail).toMatchObject({ type: 'TRUSTED_CIRCLE', contactName: 'Zik', phase: 'CONNECTING' });
  });
  it('falls back to Circle Consensus when no contact is available', async () => {
    // NOTE (deviation from the brief's literal snippet): the brief's test used
    // contestantId 'c2' here, but at questionIndex 0 the active contestant is
    // 'c1' (contestants[questionIndex % contestants.length]) — activating a
    // lifeline as the non-active contestant already throws NOT_ACTIVE_CONTESTANT,
    // an established Task 12 rule (see gameEngine.test.ts's "rejects
    // activateLifeline from a non-active contestant"). Using 'c1' instead
    // preserves that rule while exercising the identical no-contacts-registered
    // fallback path the test is actually about.
    const s = await engine.activateLifeline(gameId, 'c1', 'TRUSTED_CIRCLE', 'prod', 'kB');
    expect(s.lifelineDetail).toMatchObject({ type: 'TRUSTED_CIRCLE', contactName: null, phase: 'CONSENSUS_FALLBACK' });
  });
});

describe('Source Signal', () => {
  it('serves three unlabelled signals and reveals verified only after selection', async () => {
    const s = await engine.activateLifeline(gameId, 'c1', 'SOURCE_SIGNAL', 'prod', 'kC');
    if (s.lifelineDetail?.type !== 'SOURCE_SIGNAL') throw new Error('wrong detail');
    expect(s.lifelineDetail.signals).toHaveLength(3);
    expect(s.lifelineDetail.verifiedIndex).toBeNull();
    // Case-insensitive: no signal text may self-label as the verified one
    // (scoped to the signals themselves — s.lifelineDetail.verifiedIndex is a
    // legitimate field name that would otherwise false-positive the match).
    expect(JSON.stringify(s.lifelineDetail.signals)).not.toMatch(/verified/i);
    // ...and no signal may hand over the answer by quoting the correct choice.
    const qv = await repos.questions.latestVersion(s.publicQuestion!.questionId);
    const correctChoiceText = qv!.choices[qv!.correctIndex];
    for (const signal of s.lifelineDetail.signals) {
      expect(signal.text).not.toContain(correctChoiceText);
    }
    const after = await engine.selectSignal(gameId, 1, 'kD');
    if (after.lifelineDetail?.type !== 'SOURCE_SIGNAL') throw new Error('wrong detail');
    expect(after.lifelineDetail.verifiedIndex).not.toBeNull();
  });

  it('throws NO_SIGNALS_FOR_QUESTION when the active question has no stored signals', async () => {
    // DEMO_BANK questions always get seeded signals (Step 3), so to exercise
    // the missing-signals branch we build a standalone pack around a
    // hand-created question that was never passed to repos.signals.set.
    const bareRepos = createRepos(':memory:');
    const qId = await bareRepos.questions.create({
      questionId: '', version: 1, domain: 'SCIENCE', difficulty: 'SPARK', stem: 'no signals here',
      choices: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e', knowledgeDrop: null,
      sourceTitle: 't', sourceUrl: 'https://x', correctAsOf: '2026-01-01', jurisdiction: null,
      sensitivityTier: 1, expiresAt: null, readTimeSec: 8, factKey: 'no-signal-q', demoFlag: null,
      status: 'APPROVED',
    });
    const packId = await bareRepos.packs.create({ episodeId: 'e', seed: 's', lanes: [[qId], [qId]], reportJson: '{}' });
    await bareRepos.packs.approve(packId, 'ep');
    const bareEngine = new GameEngine(bareRepos);
    const gid = await bareEngine.createGame(packId, 'live', [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }]);
    await bareEngine.transition(gid, 'INTRO', 'p', 'n1');
    await bareEngine.transition(gid, 'QUESTION_READY', 'p', 'n2');
    await bareEngine.transition(gid, 'QUESTION_LIVE', 'p', 'n3');
    await expect(bareEngine.activateLifeline(gid, 'c1', 'SOURCE_SIGNAL', 'prod', 'n4')).rejects.toThrow('NO_SIGNALS_FOR_QUESTION');
  });
});

describe('FOLD-IN A: lockFinal', () => {
  // Advance from QUESTION_LIVE (set up in beforeEach) all the way to FINAL via
  // the shortest legal path: lock c1's first lane question, reveal, commit,
  // then FINAL. Returns the *final* question — c1's own lane's first
  // not-yet-committed question (lane position 1, since position 0 was just
  // committed above) — which is a different question from the one just
  // revealed; that's the behavior under test (IMPORTANT 3).
  async function walkToFinal(): Promise<{ questionId: string; correctIndex: number; choices: string[] }> {
    const snap = await engine.snapshot(gameId);
    const revealedQuestionId = snap.publicQuestion!.questionId;
    const qv = await repos.questions.latestVersion(revealedQuestionId);
    await engine.lockAnswer(gameId, 'c1', qv!.correctIndex, 'CURIOUS', 'fa1');
    await engine.transition(gameId, 'REVEAL', 'prod', 'fa2');
    await engine.transition(gameId, 'SCORE_COMMITTED', 'prod', 'fa3');
    await engine.transition(gameId, 'FINAL', 'prod', 'fa4');

    const pack = await repos.packs.get(packId);
    const finalQuestionId = pack!.lanes[0][1]; // c1 is lane 0; position 0 just committed
    expect(finalQuestionId).not.toBe(revealedQuestionId);
    const finalQv = await repos.questions.latestVersion(finalQuestionId);
    return { questionId: finalQuestionId, correctIndex: finalQv!.correctIndex, choices: finalQv!.choices };
  }

  it('rejects lockFinal outside FINAL state', async () => {
    await expect(engine.lockFinal(gameId, 'c1', 'RISE', 0, 'flx')).rejects.toThrow('ILLEGAL_TRANSITION');
  });

  it('grades against the first unplayed lane question, not the last-revealed one', async () => {
    const { questionId, correctIndex } = await walkToFinal();
    const s = await engine.lockFinal(gameId, 'c1', 'RISE', correctIndex, 'flk-grade');
    expect(s.state).toBe('FINAL'); // grading is deferred to COMPLETE
    expect(s.publicQuestion?.questionId).toBe(questionId); // displays already show the final question
  });

  it('changes score by +band on a correct final and never drops below zero on a wrong one', async () => {
    const { correctIndex } = await walkToFinal();
    const beforeScore = (await engine.snapshot(gameId)).scores.c1;
    let s = await engine.lockFinal(gameId, 'c1', 'RISE', correctIndex, 'flk1');
    expect(s.state).toBe('FINAL'); // grading is deferred to COMPLETE
    s = await engine.transition(gameId, 'COMPLETE', 'prod', 'flk2');
    expect(s.scores.c1).toBe(beforeScore + 500); // FORMAT_V1.final.RISE

    // Wrong final answer on a fresh game floors at zero rather than going negative.
    const { packId: packId2 } = await generatePack(repos, { episodeId: 'e2', laneCount: 2, questionsPerLane: 6 });
    await approvePack(repos, packId2, 'ep');
    const gameId2 = await engine.createGame(packId2, 'live', [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }]);
    for (const [to, k] of [['INTRO','g1'],['QUESTION_READY','g2'],['QUESTION_LIVE','g3']] as const)
      await engine.transition(gameId2, to, 'prod', k);
    const snap2 = await engine.snapshot(gameId2);
    const qv2 = await repos.questions.latestVersion(snap2.publicQuestion!.questionId);
    await engine.lockAnswer(gameId2, 'c1', qv2!.correctIndex, 'CURIOUS', 'g4');
    await engine.transition(gameId2, 'REVEAL', 'prod', 'g5');
    await engine.transition(gameId2, 'SCORE_COMMITTED', 'prod', 'g6');
    await engine.transition(gameId2, 'FINAL', 'prod', 'g7');
    const pack2 = await repos.packs.get(packId2);
    const finalQv2 = await repos.questions.latestVersion(pack2!.lanes[0][1]);
    const wrongIndex = (finalQv2!.correctIndex + 1) % finalQv2!.choices.length;
    await engine.lockFinal(gameId2, 'c1', 'REACH', wrongIndex, 'g8');
    const final2 = await engine.transition(gameId2, 'COMPLETE', 'prod', 'g9');
    expect(final2.scores.c1).toBeGreaterThanOrEqual(0);
  });

  it('rejects a second lockFinal under a different idempotencyKey and preserves the original wager through COMPLETE scoring', async () => {
    const { correctIndex } = await walkToFinal();
    const beforeScore = (await engine.snapshot(gameId)).scores.c1;
    await engine.lockFinal(gameId, 'c1', 'RISE', correctIndex, 'flk-first');
    const wrongIndex = (correctIndex + 1) % 4;
    await expect(engine.lockFinal(gameId, 'c1', 'REACH', wrongIndex, 'flk-second')).rejects.toThrow('FINAL_ALREADY_LOCKED');

    // The original RISE/correct wager should still be the one that scores.
    const s = await engine.transition(gameId, 'COMPLETE', 'prod', 'flk-complete');
    expect(s.scores.c1).toBe(beforeScore + 500); // FORMAT_V1.final.RISE
  });

  it('rejects lockFinal for a contestantId not in the session', async () => {
    await walkToFinal();
    await expect(engine.lockFinal(gameId, 'ghost', 'RISE', 0, 'flk-ghost')).rejects.toThrow('UNKNOWN_CONTESTANT');
  });

  it('throws NO_FINAL_QUESTION once the wagering contestant\'s lane is exhausted', async () => {
    // Build a standalone one-question-per-lane pack so a single committed
    // question exhausts c1's lane entirely.
    const bareRepos = createRepos(':memory:');
    const makeQ = async (factKey: string) => bareRepos.questions.create({
      questionId: '', version: 1, domain: 'SCIENCE', difficulty: 'SPARK', stem: `${factKey}?`,
      choices: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e', knowledgeDrop: null,
      sourceTitle: 't', sourceUrl: 'https://x', correctAsOf: '2026-01-01', jurisdiction: null,
      sensitivityTier: 1, expiresAt: null, readTimeSec: 8, factKey, demoFlag: null,
      status: 'APPROVED',
    });
    const q1 = await makeQ('exhaust-lane-c1');
    const q2 = await makeQ('exhaust-lane-c2');
    const barePackId = await bareRepos.packs.create({ episodeId: 'e', seed: 's', lanes: [[q1], [q2]], reportJson: '{}' });
    await bareRepos.packs.approve(barePackId, 'ep');
    const bareEngine = new GameEngine(bareRepos);
    const gid = await bareEngine.createGame(barePackId, 'live', [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }]);
    await bareEngine.transition(gid, 'INTRO', 'p', 'n1');
    await bareEngine.transition(gid, 'QUESTION_READY', 'p', 'n2');
    await bareEngine.transition(gid, 'QUESTION_LIVE', 'p', 'n3');
    await bareEngine.lockAnswer(gid, 'c1', 0, 'CURIOUS', 'n4');
    await bareEngine.transition(gid, 'REVEAL', 'p', 'n5');
    await bareEngine.transition(gid, 'SCORE_COMMITTED', 'p', 'n6');
    await bareEngine.transition(gid, 'FINAL', 'p', 'n7');
    await expect(bareEngine.lockFinal(gid, 'c1', 'HOLD', 0, 'n8')).rejects.toThrow('NO_FINAL_QUESTION');
  });
});

describe('FOLD-IN B: adjustScore idempotency', () => {
  it('applies the adjustment once when the same idempotencyKey is sent twice', async () => {
    await engine.adjustScore(gameId, 'c1', 50, 'bonus', 'exec', 'prod', 'adj-key-1');
    const s = await engine.adjustScore(gameId, 'c1', 50, 'bonus', 'exec', 'prod', 'adj-key-1');
    expect(s.scores.c1).toBe(50);
  });
});
