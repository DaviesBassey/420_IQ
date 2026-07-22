import { z } from 'zod';
import { getEngine, engineErrorStatus } from '@/server/gameEngine';

const typeSchema = z.enum(['TRUSTED_CIRCLE', 'SOURCE_SIGNAL']);

const bodySchema = z.object({
  contestantId: z.string(),
  actor: z.string(),
  idempotencyKey: z.string(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params;

  const parsedType = typeSchema.safeParse(type);
  if (!parsedType.success) {
    return Response.json({ error: parsedType.error.message }, { status: 400 });
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
    const snapshot = await getEngine().activateLifeline(
      id, parsed.data.contestantId, parsedType.data, parsed.data.actor, parsed.data.idempotencyKey,
    );
    return Response.json(snapshot);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: engineErrorStatus(err) });
  }
}
