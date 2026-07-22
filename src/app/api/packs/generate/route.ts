import { z } from 'zod';
import { getRepos } from '@/server/context';
import { generatePack } from '@/server/packService';

const bodySchema = z.object({
  episodeId: z.string(),
  laneCount: z.number().int().positive(),
  questionsPerLane: z.number().int().positive(),
  seed: z.string().optional(),
});

export async function POST(req: Request) {
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
    const result = await generatePack(getRepos(), parsed.data);
    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && (err.message === 'POOL_TOO_SMALL' || err.message === 'NO_VALID_SEQUENCE')) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
