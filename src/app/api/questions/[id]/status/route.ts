import { z } from 'zod';
import { getRepos } from '@/server/context';
import { requireRole } from '@/server/auth';
import { ALL_STATUSES, advanceStatus, questionErrorStatus } from '@/server/questionService';

const bodySchema = z.object({
  to: z.enum(ALL_STATUSES),
  actor: z.string(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(req, ['producer', 'editor']);
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
    await advanceStatus(getRepos(), id, parsed.data.to, parsed.data.actor);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: questionErrorStatus(err) },
    );
  }
}
