import { z } from 'zod';
import { getRepos } from '@/server/context';
import { requireRole } from '@/server/auth';
import {
  ALL_STATUSES,
  createQuestion,
  createQuestionSchema,
  legalNextStatuses,
  listQuestions,
} from '@/server/questionService';

const statusSchema = z.enum(ALL_STATUSES);

export async function GET(req: Request) {
  try {
    await requireRole(req, ['producer', 'editor']);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const parsed = statusSchema.safeParse(searchParams.get('status'));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const questions = await listQuestions(getRepos(), parsed.data);
  const withNextStatuses = questions.map((q) => ({
    ...q,
    nextStatuses: legalNextStatuses(q.status),
  }));
  return Response.json({ questions: withNextStatuses });
}

export async function POST(req: Request) {
  try {
    await requireRole(req, ['producer', 'editor']);
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

  // Any client-supplied `status` is dropped by createQuestionSchema (it has
  // no such field) — every question is created as DRAFT, full stop.
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  const id = await createQuestion(getRepos(), parsed.data);
  return Response.json({ id });
}
