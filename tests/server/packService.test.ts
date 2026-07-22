import { describe, it, expect, beforeEach } from 'vitest';
import { createRepos, type Repos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';
import { generatePack, approvePack } from '@/server/packService';

let repos: Repos;
beforeEach(async () => { repos = createRepos(':memory:'); await seedDatabase(repos); });

describe('packService', () => {
  it('generates a violation-free pack from the seeded pool', async () => {
    const r = await generatePack(repos, { episodeId: 'ep1', laneCount: 2, questionsPerLane: 6 });
    expect(r.report.violations).toEqual([]);
    expect(r.lanes[0]).toHaveLength(6);
    expect(r.seed).toMatch(/^[0-9a-f]{32}$/);
  });
  it('same explicit seed reproduces identical lanes', async () => {
    const a = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6, seed: 'f'.repeat(32) });
    const b = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6, seed: 'f'.repeat(32) });
    expect(a.lanes).toEqual(b.lanes);
  });
  it('approve freezes checksum and stores approver', async () => {
    const { packId } = await generatePack(repos, { episodeId: 'e', laneCount: 2, questionsPerLane: 6 });
    const { checksum } = await approvePack(repos, packId, 'exec-producer');
    const stored = await repos.packs.get(packId);
    expect(stored?.checksum).toBe(checksum);
    expect(stored?.approvedBy).toBe('exec-producer');
  });
});
