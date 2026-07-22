import { getRepos } from '@/server/context';
import { seedDatabase } from '@/data/seedData';

// Dev/test-only convenience route: re-runs the same seed the `pnpm seed`
// script uses (prototype question import + labelled demo bank), so E2E specs
// can populate a fresh database over HTTP instead of shelling out. Hard-gated
// on NODE_ENV so it can never be reached in a production deployment.
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const result = await seedDatabase(getRepos());
  return Response.json(result);
}
