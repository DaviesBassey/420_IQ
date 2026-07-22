import { z } from 'zod';
import { QUESTION_WORKFLOW, type Repos } from '@/data/repos';
import type { QuestionStatus, QuestionVersionData } from '@/domain/types';

export const ALL_STATUSES = Object.keys(QUESTION_WORKFLOW) as [QuestionStatus, ...QuestionStatus[]];

const DOMAINS = [
  'SCIENCE', 'HISTORY', 'AFRICA_INDIGENOUS', 'LAW_POLICY',
  'HEALTH_SAFETY', 'CULTURE_MEDIA', 'BUSINESS_ETHICS', 'FUTURE_INNOVATION',
] as const;
const DIFFICULTIES = ['SPARK', 'FLAME', 'INFERNO', 'WILD_420'] as const;

// Mirrors QuestionVersionData minus questionId/version, which the server
// assigns on create. Cross-field rules (tier-3 gating, correctIndex bounds)
// are enforced in superRefine since zod's base object schema can't see
// sibling fields.
export const createQuestionSchema = z
  .object({
    domain: z.enum(DOMAINS),
    difficulty: z.enum(DIFFICULTIES),
    stem: z.string().min(1),
    choices: z.array(z.string().min(1)).min(2).max(5),
    correctIndex: z.number().int().min(0),
    explanation: z.string().min(1),
    knowledgeDrop: z.string().nullable(),
    sourceTitle: z.string().min(1),
    sourceUrl: z.string().min(1),
    correctAsOf: z.string().min(1),
    jurisdiction: z.string().nullable(),
    sensitivityTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    expiresAt: z.string().nullable(),
    readTimeSec: z.number().int().positive(),
    factKey: z.string().min(1),
    demoFlag: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.correctIndex >= data.choices.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctIndex'],
        message: 'correctIndex must be less than choices.length',
      });
    }
    if (data.sensitivityTier === 3 && (!data.expiresAt || !data.jurisdiction)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sensitivityTier'],
        message: 'Tier 3 questions require both expiresAt and jurisdiction',
      });
    }
  });

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export async function createQuestion(repos: Repos, input: CreateQuestionInput): Promise<string> {
  const data: QuestionVersionData & { status: QuestionStatus } = {
    questionId: '', // assigned by repos.questions.create; ignored on insert
    version: 1,
    ...input,
    status: 'DRAFT',
  };
  return repos.questions.create(data);
}

export async function listQuestions(repos: Repos, status: QuestionStatus) {
  return repos.questions.listByStatus(status);
}

export async function advanceStatus(
  repos: Repos,
  questionId: string,
  to: QuestionStatus,
  actor: string,
): Promise<void> {
  await repos.questions.setStatus(questionId, to, actor);
}

// Mirrors repos.ts's canTransition (not exported): EXPIRED is reachable from
// any non-terminal status as a manual override, in addition to the
// status's normal QUESTION_WORKFLOW successors. Lets the editor UI derive
// its per-row "advance to X" buttons from the API response instead of
// hardcoding the workflow client-side.
export function legalNextStatuses(status: QuestionStatus): QuestionStatus[] {
  if (status === 'EXPIRED') return [];
  const next = QUESTION_WORKFLOW[status];
  return next.includes('EXPIRED') ? next : [...next, 'EXPIRED'];
}

// Local error map for question workflow failures — mirrors the
// engineErrorStatus pattern used for game routes, scoped to the
// question-specific error strings thrown by repos.questions.setStatus.
export function questionErrorStatus(err: unknown): number {
  if (err instanceof Error) {
    if (err.message === 'TIER3_REQUIRES_EXPIRY') return 422;
    if (err.message.startsWith('Illegal workflow transition')) return 409;
    if (err.message.startsWith('Question not found')) return 404;
  }
  return 500;
}
