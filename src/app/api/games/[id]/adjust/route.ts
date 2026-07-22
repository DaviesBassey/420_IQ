import { z } from 'zod';
import { getEngine, engineErrorStatus } from '@/server/gameEngine';
import { requireRole } from '@/server/auth';

const bodySchema = z.object({
  contestantId: z.string(),
  delta: z.number(),
  reason: z.string(),
  approvedBy: z.string(),
  actor: z.string(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ['producer']);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    throw err;
  }

  const { id } = await params;

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
    const snapshot = await getEngine().adjustScore(
      id, parsed.data.contestantId, parsed.data.delta, parsed.data.reason, parsed.data.approvedBy, parsed.data.actor,
    );
    return Response.json(snapshot);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: engineErrorStatus(err) });
  }
}
