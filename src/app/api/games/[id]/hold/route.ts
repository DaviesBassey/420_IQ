import { z } from 'zod';
import { getEngine } from '@/server/gameEngine';
import { requireRole } from '@/server/auth';
import { holdFlags } from '@/server/projection';
import { bus } from '@/server/bus';

const bodySchema = z.object({
  on: z.boolean(),
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

  holdFlags.set(id, parsed.data.on);

  const snap = await getEngine().snapshot(id);
  bus.emit(`game:${id}`, snap);

  return Response.json({ ok: true, hold: parsed.data.on });
}
