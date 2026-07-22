import { getRepos } from '@/server/context';
import { requireRole } from '@/server/auth';

export async function GET(req: Request) {
  try {
    await requireRole(req, ['producer', 'editor']);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    throw err;
  }

  const packs = await getRepos().packs.list();
  return Response.json({ packs });
}
