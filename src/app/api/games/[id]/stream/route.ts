import { z } from 'zod';
import { getEngine, engineErrorStatus, type GameSnapshot } from '@/server/gameEngine';
import { projectForRole, holdFlags } from '@/server/projection';
import { bus } from '@/server/bus';
import { ROLE_PINS, type Role } from '@/server/auth';

const ROLE_VALUES = Object.keys(ROLE_PINS) as [Role, ...Role[]];
const roleSchema = z.enum(ROLE_VALUES);

const HEARTBEAT_MS = 15_000;

// No cookie/session check on this route: for this pilot, projection is the
// security boundary, not the connection. That holds for every role — even
// 'producer'/'host' see reveal stripped until state ∈ {REVEAL, KNOWLEDGE_DROP,
// SCORE_COMMITTED} (per projectForRole), so gating the connection itself
// would add no protection the projection doesn't already provide.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const parsedRole = roleSchema.safeParse(searchParams.get('role'));
  if (!parsedRole.success) {
    return Response.json({ error: parsedRole.error.message }, { status: 400 });
  }
  const role = parsedRole.data;

  let initial;
  try {
    const snap = await getEngine().snapshot(id);
    initial = projectForRole(snap, role, holdFlags.get(id) ?? false);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: engineErrorStatus(err) });
  }

  const encoder = new TextEncoder();
  const channel = `game:${id}`;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`));

      const handler = (snap: GameSnapshot) => {
        const projected = projectForRole(snap, role, holdFlags.get(id) ?? false);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(projected)}\n\n`));
      };
      bus.on(channel, handler);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, HEARTBEAT_MS);

      const cleanup = () => {
        bus.off(channel, handler);
        clearInterval(heartbeat);
      };

      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
