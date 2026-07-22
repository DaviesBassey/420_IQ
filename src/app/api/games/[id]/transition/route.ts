import { z } from 'zod';
import { TRANSITIONS, type GameState } from '@/domain/fsm';
import { getEngine, engineErrorStatus } from '@/server/gameEngine';
import { requireRole } from '@/server/auth';

const GAME_STATES = Object.keys(TRANSITIONS) as [GameState, ...GameState[]];

const bodySchema = z.object({
  to: z.enum(GAME_STATES),
  actor: z.string(),
  idempotencyKey: z.string(),
  payload: z.unknown().optional(),
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
    const snapshot = await getEngine().transition(id, parsed.data.to, parsed.data.actor, parsed.data.idempotencyKey, parsed.data.payload);
    return Response.json(snapshot);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: engineErrorStatus(err) });
  }
}
