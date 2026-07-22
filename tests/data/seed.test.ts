import { describe, it, expect } from 'vitest';
import { createRepos } from '@/data/repos';
import { seedDatabase } from '@/data/seedData';

describe('seedDatabase', () => {
  it('imports 16 prototype drafts and 96 approved demo questions', async () => {
    const repos = createRepos(':memory:');
    const r = await seedDatabase(repos);
    expect(r.imported).toBe(16);
    expect(r.demo).toBe(96);
    expect((await repos.questions.listByStatus('DRAFT'))).toHaveLength(16);
    const pool = await repos.questions.eligibleForPack('2026-07-22');
    expect(pool.length).toBe(96);
    expect(pool.every(q => q.demoFlag !== null)).toBe(true);
  });
  it('is idempotent (second run adds nothing)', async () => {
    const repos = createRepos(':memory:');
    await seedDatabase(repos);
    const again = await seedDatabase(repos);
    expect(again.imported + again.demo).toBe(0);
  });
});
