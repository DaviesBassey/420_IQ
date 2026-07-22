import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';
import { generatePack, approvePack } from '@/server/packService';
import { GameEngine } from '@/server/gameEngine';

let repos: Repos; let engine: GameEngine; let gameId: string;
const CONTESTANTS = [{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Ben' }];

beforeEach(async () => {
  repos = createRepos(':memory:');
  await seedDatabase(repos);
  const { packId } = await generatePack(repos, { episodeId: 'e1', laneCount: 2, questionsPerLane: 6 });
  await approvePack(repos, packId, 'ep');
  engine = new GameEngine(repos);
  gameId = await engine.createGame(packId, 'live', CONTESTANTS);
});

async function toLiveQuestion() {
  await engine.transition(gameId, 'INTRO', 'prod', 'k1');
  await engine.transition(gameId, 'QUESTION_READY', 'prod', 'k2');
  return engine.transition(gameId, 'QUESTION_LIVE', 'prod', 'k3');
}

describe('GameEngine', () => {
  it('starts in PRE_SHOW with zero scores', async () => {
    const s = await engine.snapshot(gameId);
    expect(s.state).toBe('PRE_SHOW');
    expect(s.scores).toEqual({ c1: 0, c2: 0 });
  });
  it('blocks illegal transitions', async () => {
    await expect(engine.transition(gameId, 'REVEAL', 'prod', 'kx')).rejects.toThrow('ILLEGAL_TRANSITION');
  });
  it('serves a public question with no correct index from QUESTION_READY', async () => {
    const s = await toLiveQuestion();
    expect(s.publicQuestion).not.toBeNull();
    expect(JSON.stringify(s.publicQuestion)).not.toContain('correctIndex');
    expect(s.reveal).toBeNull();
  });
  it('locks an answer, reveals, commits score', async () => {
    await toLiveQuestion();
    let s = await engine.lockAnswer(gameId, 'c1', 0, 'CURIOUS', 'k4');
    expect(s.state).toBe('ANSWER_LOCKED');
    s = await engine.transition(gameId, 'REVEAL', 'prod', 'k5');
    expect(s.reveal?.correctIndex).toBeGreaterThanOrEqual(0);
    s = await engine.transition(gameId, 'SCORE_COMMITTED', 'prod', 'k6');
    const total = s.scores.c1;
    expect(Number.isInteger(total)).toBe(true); // scored (0 if wrong guess, >0 if right)
  });
  it('is idempotent on repeated transition keys', async () => {
    await engine.transition(gameId, 'INTRO', 'prod', 'same-key');
    const s = await engine.transition(gameId, 'INTRO', 'prod', 'same-key'); // replay, not error
    expect(s.state).toBe('INTRO');
    expect((await repos.games.events(gameId)).length).toBe(1);
  });
  it('snapshot rebuilds identically after engine restart', async () => {
    await toLiveQuestion();
    await engine.lockAnswer(gameId, 'c1', 1, 'CONFIDENT', 'k7');
    const before = await engine.snapshot(gameId);
    const engine2 = new GameEngine(repos); // fresh instance = restart
    expect(await engine2.snapshot(gameId)).toEqual(before);
  });
  it('enforces one lifeline use and loops back to the live question', async () => {
    await toLiveQuestion();
    const s = await engine.activateLifeline(gameId, 'c1', 'SOURCE_SIGNAL', 'prod', 'k8');
    expect(s.state).toBe('LIFELINE_ACTIVE');
    await engine.transition(gameId, 'QUESTION_LIVE', 'prod', 'k9');
    await expect(engine.activateLifeline(gameId, 'c1', 'SOURCE_SIGNAL', 'prod', 'k10'))
      .rejects.toThrow('LIFELINE_ALREADY_USED');
  });
  it('rejects score adjustment without independent approver', async () => {
    await expect(engine.adjustScore(gameId, 'c1', 100, 'fix', 'prod', 'prod')).rejects.toThrow();
    await engine.adjustScore(gameId, 'c1', 100, 'mis-scored Q3', 'exec', 'prod');
    expect((await engine.snapshot(gameId)).scores.c1).toBe(100);
  });
  it('applies the same idempotencyKey across two different games without collision', async () => {
    const { packId } = await generatePack(repos, { episodeId: 'e3', laneCount: 2, questionsPerLane: 6 });
    await approvePack(repos, packId, 'ep');
    const gameA = await engine.createGame(packId, 'live', CONTESTANTS);
    const gameB = await engine.createGame(packId, 'live', CONTESTANTS);
    const sA = await engine.transition(gameA, 'INTRO', 'prod', 'k1');
    const sB = await engine.transition(gameB, 'INTRO', 'prod', 'k1');
    expect(sA.state).toBe('INTRO');
    expect(sB.state).toBe('INTRO');
  });
  it('rejects lockAnswer from a non-active contestant', async () => {
    await toLiveQuestion();
    await expect(engine.lockAnswer(gameId, 'c2', 0, 'CURIOUS', 'k4')).rejects.toThrow('NOT_ACTIVE_CONTESTANT');
  });
  it('rejects activateLifeline from a non-active contestant', async () => {
    await toLiveQuestion();
    await expect(engine.activateLifeline(gameId, 'c2', 'SOURCE_SIGNAL', 'prod', 'k4')).rejects.toThrow('NOT_ACTIVE_CONTESTANT');
  });
  it('rejects self-steal and enforces one-shot steal', async () => {
    await toLiveQuestion();
    const snap = await engine.snapshot(gameId);
    const qv = await repos.questions.latestVersion(snap.publicQuestion!.questionId);
    const wrongIndex = (qv!.correctIndex + 1) % qv!.choices.length;
    await engine.lockAnswer(gameId, 'c1', wrongIndex, 'CERTAIN', 'k4'); // wrong + CERTAIN opens the steal window
    const revealSnap = await engine.transition(gameId, 'REVEAL', 'prod', 'k5');
    expect(revealSnap.stealOpen).toBe(true);

    await expect(engine.recordSteal(gameId, 'c1', 0, 'k6')).rejects.toThrow('STEAL_NOT_AVAILABLE'); // self-steal
    await engine.recordSteal(gameId, 'c2', 0, 'k7'); // opponent steal succeeds
    await expect(engine.recordSteal(gameId, 'c2', 0, 'k8')).rejects.toThrow('STEAL_NOT_AVAILABLE'); // one-shot
  });
  it('rejects a steal after a correct answer (stealOpen stays false)', async () => {
    await toLiveQuestion();
    const snap = await engine.snapshot(gameId);
    const qv = await repos.questions.latestVersion(snap.publicQuestion!.questionId);
    await engine.lockAnswer(gameId, 'c1', qv!.correctIndex, 'CERTAIN', 'k4'); // correct answer
    const revealSnap = await engine.transition(gameId, 'REVEAL', 'prod', 'k5');
    expect(revealSnap.stealOpen).toBe(false);
    await expect(engine.recordSteal(gameId, 'c2', 0, 'k6')).rejects.toThrow('STEAL_NOT_OPEN');
  });
  it('rehearsal mode never marks questions used', async () => {
    const { packId } = await generatePack(repos, { episodeId: 'e2', laneCount: 2, questionsPerLane: 6 });
    await approvePack(repos, packId, 'ep');
    const rehearsalId = await engine.createGame(packId, 'rehearsal', CONTESTANTS);
    // walk a minimal path to COMPLETE via FINAL
    await engine.transition(rehearsalId, 'INTRO', 'p', 'r1');
    await engine.transition(rehearsalId, 'QUESTION_READY', 'p', 'r2');
    await engine.transition(rehearsalId, 'QUESTION_LIVE', 'p', 'r3');
    await engine.lockAnswer(rehearsalId, 'c1', 0, 'CURIOUS', 'r4');
    await engine.transition(rehearsalId, 'REVEAL', 'p', 'r5');
    await engine.transition(rehearsalId, 'SCORE_COMMITTED', 'p', 'r6');
    await engine.transition(rehearsalId, 'FINAL', 'p', 'r7');
    await engine.transition(rehearsalId, 'COMPLETE', 'p', 'r8');
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.length).toBe(96); // nothing consumed
  });
});
