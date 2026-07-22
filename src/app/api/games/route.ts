import { z } from 'zod';
import { getEngine, engineErrorStatus } from '@/server/gameEngine';
import { requireRole } from '@/server/auth';

const bodySchema = z.object({
  packId: z.string(),
  mode: z.enum(['rehearsal', 'live']),
  contestants: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
});

export async function POST(req: Request) {
  try {
    await requireRole(req, ['producer']);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const engine = getEngine();
    const gameId = await engine.createGame(parsed.data.packId, parsed.data.mode, parsed.data.contestants);
    const snapshot = await engine.snapshot(gameId);
    return Response.json({ gameId, snapshot });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: engineErrorStatus(err) });
  }
}
