import { randomUUID, createHash } from 'node:crypto';
import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { createDb, type Db } from './db';
import * as schema from './schema';
import type { QuestionVersionData, QuestionStatus, SessionMode, LifelineType } from '../domain/types';
import type { ScoreEvent } from '../domain/scoring';

export type GameEventInsert = {
  gameId: string;
  idempotencyKey: string;
  actor: string;
  prevState: string;
  nextState: string;
  payloadJson: string;
};

export type GameEventRow = GameEventInsert & { seq: number; at: string };

export interface GameSessionRow {
  id: string;
  packId: string;
  mode: SessionMode;
  contestants: { id: string; name: string }[];
  createdAt: string;
}

export const QUESTION_WORKFLOW: Record<QuestionStatus, QuestionStatus[]> = {
  DRAFT: ['EDITORIAL_REVIEW'],
  EDITORIAL_REVIEW: ['COUNCIL_REVIEW', 'APPROVED'],
  COUNCIL_REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['LOCKED', 'RETIRED'],
  LOCKED: ['USED', 'RETIRED'],
  USED: ['RETIRED'],
  RETIRED: [],
  EXPIRED: [],
};

function canTransition(from: QuestionStatus, to: QuestionStatus): boolean {
  if (to === 'EXPIRED') return true;
  return QUESTION_WORKFLOW[from].includes(to);
}

// Canonical JSON: recursively sort object keys so structurally-identical
// content always serializes to the same string, regardless of key order.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function rowToQuestionVersionData(row: typeof schema.questionVersions.$inferSelect): QuestionVersionData {
  return {
    questionId: row.questionId,
    version: row.version,
    domain: row.domain as QuestionVersionData['domain'],
    difficulty: row.difficulty as QuestionVersionData['difficulty'],
    stem: row.stem,
    choices: JSON.parse(row.choicesJson) as string[],
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    knowledgeDrop: row.knowledgeDrop,
    sourceTitle: row.sourceTitle,
    sourceUrl: row.sourceUrl,
    correctAsOf: row.correctAsOf,
    jurisdiction: row.jurisdiction,
    sensitivityTier: row.sensitivityTier as QuestionVersionData['sensitivityTier'],
    expiresAt: row.expiresAt,
    readTimeSec: row.readTimeSec,
    factKey: row.factKey,
    demoFlag: row.demoFlag,
  };
}

export interface Repos {
  questions: {
    create(q: QuestionVersionData & { status: QuestionStatus }): Promise<string>;
    latestVersion(questionId: string): Promise<QuestionVersionData | null>;
    listByStatus(status: QuestionStatus): Promise<(QuestionVersionData & { status: QuestionStatus })[]>;
    setStatus(questionId: string, status: QuestionStatus, actor: string): Promise<void>;
    eligibleForPack(nowIso: string): Promise<QuestionVersionData[]>;
    existsByFactKey(factKey: string): Promise<boolean>;
  };
  packs: {
    create(p: { episodeId: string; seed: string; lanes: string[][]; reportJson: string }): Promise<string>;
    approve(packId: string, approver: string): Promise<{ checksum: string }>;
    get(packId: string): Promise<{ id: string; episodeId: string; seed: string; lanes: string[][]; approvedBy: string | null; checksum: string | null; reportJson: string } | null>;
    list(): Promise<{ id: string; episodeId: string; seed: string; approvedBy: string | null; checksum: string | null; createdAt: string }[]>;
  };
  games: {
    create(g: { packId: string; mode: SessionMode; contestants: { id: string; name: string }[] }): Promise<string>;
    get(gameId: string): Promise<GameSessionRow | null>;
    appendEvent(e: GameEventInsert): Promise<boolean>;
    events(gameId: string): Promise<GameEventRow[]>;
    appendScoreEvent(gameId: string, ev: ScoreEvent): Promise<void>;
    scoreEvents(gameId: string): Promise<ScoreEvent[]>;
    recordLifelineUse(gameId: string, contestantId: string, type: LifelineType): Promise<void>;
    lifelineUsed(gameId: string, contestantId: string, type: LifelineType): Promise<boolean>;
    markQuestionsUsed(questionIds: string[]): Promise<void>;
  };
  audit: {
    log(e: { actor: string; action: string; detail: string }): Promise<void>;
    list(): Promise<{ actor: string; action: string; detail: string; at: string }[]>;
  };
  contacts: {
    add(c: { contestantId: string; name: string; consentRecordedAt: string; available: boolean }): Promise<string>;
    forContestant(contestantId: string): Promise<{ id: string; name: string; available: boolean }[]>;
    setAvailability(id: string, available: boolean): Promise<void>;
  };
  signals: {
    set(questionId: string, signals: { text: string; kind: 'VERIFIED' | 'UNRELIABLE' | 'DISTRACTOR' }[]): Promise<void>;
    get(questionId: string): Promise<{ text: string; kind: string }[] | null>;
  };
}

export function createRepos(dbPath: string): Repos {
  const db: Db = createDb(dbPath);

  async function latestVersion(questionId: string): Promise<QuestionVersionData | null> {
    const rows = await db
      .select()
      .from(schema.questionVersions)
      .where(eq(schema.questionVersions.questionId, questionId))
      .orderBy(asc(schema.questionVersions.version));
    if (rows.length === 0) return null;
    return rowToQuestionVersionData(rows[rows.length - 1]);
  }

  const questions: Repos['questions'] = {
    async create(q) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.questions).values({ id, status: q.status, createdAt: now }).run();
      db.insert(schema.questionVersions).values({
        questionId: id,
        version: q.version,
        domain: q.domain,
        difficulty: q.difficulty,
        stem: q.stem,
        choicesJson: JSON.stringify(q.choices),
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        knowledgeDrop: q.knowledgeDrop,
        sourceTitle: q.sourceTitle,
        sourceUrl: q.sourceUrl,
        correctAsOf: q.correctAsOf,
        jurisdiction: q.jurisdiction,
        sensitivityTier: q.sensitivityTier,
        expiresAt: q.expiresAt,
        readTimeSec: q.readTimeSec,
        factKey: q.factKey,
        demoFlag: q.demoFlag,
      }).run();
      return id;
    },

    latestVersion,

    async listByStatus(status) {
      const qRows = await db.select().from(schema.questions).where(eq(schema.questions.status, status));
      const out: (QuestionVersionData & { status: QuestionStatus })[] = [];
      for (const row of qRows) {
        const latest = await latestVersion(row.id);
        if (latest) out.push({ ...latest, status: row.status as QuestionStatus });
      }
      return out;
    },

    async setStatus(questionId, status, actor) {
      const rows = await db.select().from(schema.questions).where(eq(schema.questions.id, questionId));
      const current = rows[0];
      if (!current) throw new Error(`Question not found: ${questionId}`);
      const currentStatus = current.status as QuestionStatus;
      if (!canTransition(currentStatus, status)) {
        throw new Error(`Illegal workflow transition: ${currentStatus} -> ${status}`);
      }
      if (status === 'APPROVED') {
        const latest = await latestVersion(questionId);
        if (latest && latest.sensitivityTier === 3 && !latest.expiresAt) {
          throw new Error('TIER3_REQUIRES_EXPIRY');
        }
      }
      db.update(schema.questions).set({ status }).where(eq(schema.questions.id, questionId)).run();
      await audit.log({
        actor,
        action: 'question.setStatus',
        detail: JSON.stringify({ questionId, from: currentStatus, to: status }),
      });
    },

    async eligibleForPack(nowIso) {
      const qRows = await db.select().from(schema.questions).where(eq(schema.questions.status, 'APPROVED'));
      const out: QuestionVersionData[] = [];
      for (const row of qRows) {
        const latest = await latestVersion(row.id);
        if (latest && (latest.expiresAt === null || latest.expiresAt > nowIso)) out.push(latest);
      }
      return out;
    },

    async existsByFactKey(factKey) {
      const rows = await db
        .select()
        .from(schema.questionVersions)
        .where(eq(schema.questionVersions.factKey, factKey));
      return rows.length > 0;
    },
  };

  const packs: Repos['packs'] = {
    async create(p) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.packs).values({
        id,
        episodeId: p.episodeId,
        seed: p.seed,
        lanesJson: JSON.stringify(p.lanes),
        reportJson: p.reportJson,
        approvedBy: null,
        checksum: null,
        createdAt: now,
      }).run();
      return id;
    },

    async approve(packId, approver) {
      const rows = await db.select().from(schema.packs).where(eq(schema.packs.id, packId));
      const row = rows[0];
      if (!row) throw new Error(`Pack not found: ${packId}`);
      const lanes = JSON.parse(row.lanesJson) as string[][];
      const checksum = createHash('sha256').update(canonicalJson({ seed: row.seed, lanes })).digest('hex');
      db.update(schema.packs).set({ approvedBy: approver, checksum }).where(eq(schema.packs.id, packId)).run();
      return { checksum };
    },

    async get(packId) {
      const rows = await db.select().from(schema.packs).where(eq(schema.packs.id, packId));
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        episodeId: row.episodeId,
        seed: row.seed,
        lanes: JSON.parse(row.lanesJson) as string[][],
        approvedBy: row.approvedBy,
        checksum: row.checksum,
        reportJson: row.reportJson,
      };
    },

    async list() {
      const rows = await db.select().from(schema.packs).orderBy(desc(schema.packs.createdAt));
      return rows.map((row) => ({
        id: row.id,
        episodeId: row.episodeId,
        seed: row.seed,
        approvedBy: row.approvedBy,
        checksum: row.checksum,
        createdAt: row.createdAt,
      }));
    },
  };

  const games: Repos['games'] = {
    async create(g) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.insert(schema.gameSessions).values({
        id,
        packId: g.packId,
        mode: g.mode,
        contestantsJson: JSON.stringify(g.contestants),
        createdAt: now,
      }).run();
      return id;
    },

    async get(gameId) {
      const rows = await db.select().from(schema.gameSessions).where(eq(schema.gameSessions.id, gameId));
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        packId: row.packId,
        mode: row.mode as SessionMode,
        contestants: JSON.parse(row.contestantsJson) as { id: string; name: string }[],
        createdAt: row.createdAt,
      };
    },

    async appendEvent(e) {
      // Atomic idempotency: rely on the (game_id, idempotency_key) UNIQUE
      // constraint and onConflictDoNothing rather than a check-then-insert,
      // which has a race window between the SELECT and the INSERT under
      // concurrent callers. Returns true when the row was inserted, false
      // when the insert was a no-op due to conflict (same game + key).
      const now = new Date().toISOString();
      const result = db.insert(schema.gameEvents).values({
        gameId: e.gameId,
        idempotencyKey: e.idempotencyKey,
        actor: e.actor,
        prevState: e.prevState,
        nextState: e.nextState,
        payloadJson: e.payloadJson,
        at: now,
      }).onConflictDoNothing().run();
      return result.changes > 0;
    },

    async events(gameId) {
      const rows = await db
        .select()
        .from(schema.gameEvents)
        .where(eq(schema.gameEvents.gameId, gameId))
        .orderBy(asc(schema.gameEvents.seq));
      return rows.map((row) => ({
        seq: row.seq,
        gameId: row.gameId,
        idempotencyKey: row.idempotencyKey,
        actor: row.actor,
        prevState: row.prevState,
        nextState: row.nextState,
        payloadJson: row.payloadJson,
        at: row.at,
      }));
    },

    async appendScoreEvent(gameId, ev) {
      const now = new Date().toISOString();
      db.insert(schema.scoreEvents).values({ gameId, eventJson: JSON.stringify(ev), at: now }).run();
    },

    async scoreEvents(gameId) {
      const rows = await db
        .select()
        .from(schema.scoreEvents)
        .where(eq(schema.scoreEvents.gameId, gameId))
        .orderBy(asc(schema.scoreEvents.seq));
      return rows.map((row) => JSON.parse(row.eventJson) as ScoreEvent);
    },

    async recordLifelineUse(gameId, contestantId, type) {
      // Atomic insert guarded by the (game_id, contestant_id, type) UNIQUE
      // constraint: a check-then-insert has a race window under concurrent
      // callers, so we insert first and inspect `changes` to detect a
      // conflict, translating it into a domain error rather than leaking the
      // raw driver's UNIQUE constraint message.
      const now = new Date().toISOString();
      const result = db
        .insert(schema.lifelineUses)
        .values({ gameId, contestantId, type, at: now })
        .onConflictDoNothing()
        .run();
      if (result.changes === 0) throw new Error('LIFELINE_ALREADY_USED');
    },

    async lifelineUsed(gameId, contestantId, type) {
      const existing = await db
        .select()
        .from(schema.lifelineUses)
        .where(and(
          eq(schema.lifelineUses.gameId, gameId),
          eq(schema.lifelineUses.contestantId, contestantId),
          eq(schema.lifelineUses.type, type),
        ));
      return existing.length > 0;
    },

    async markQuestionsUsed(questionIds) {
      // Invariant: only questions currently APPROVED or LOCKED may become
      // USED (APPROVED -> LOCKED -> USED is the legal chain; this guarded
      // UPDATE collapses both legal predecessor states in one step).
      // Questions in any other status are left unchanged rather than thrown
      // on — pack-level code already guarantees eligibility before this is
      // called, so this is defense in depth, not the primary check.
      for (const id of questionIds) {
        db.update(schema.questions)
          .set({ status: 'USED' })
          .where(and(eq(schema.questions.id, id), inArray(schema.questions.status, ['APPROVED', 'LOCKED'])))
          .run();
      }
    },
  };

  const audit: Repos['audit'] = {
    async log(e) {
      const now = new Date().toISOString();
      db.insert(schema.auditEvents).values({ actor: e.actor, action: e.action, detail: e.detail, at: now }).run();
    },

    async list() {
      const rows = await db.select().from(schema.auditEvents).orderBy(asc(schema.auditEvents.seq));
      return rows.map((row) => ({ actor: row.actor, action: row.action, detail: row.detail, at: row.at }));
    },
  };

  const contacts: Repos['contacts'] = {
    async add(c) {
      const id = randomUUID();
      db.insert(schema.trustedContacts).values({
        id,
        contestantId: c.contestantId,
        name: c.name,
        consentRecordedAt: c.consentRecordedAt,
        available: c.available ? 1 : 0,
      }).run();
      return id;
    },

    async forContestant(contestantId) {
      const rows = await db
        .select()
        .from(schema.trustedContacts)
        .where(eq(schema.trustedContacts.contestantId, contestantId));
      return rows.map((row) => ({ id: row.id, name: row.name, available: row.available === 1 }));
    },

    async setAvailability(id, available) {
      db.update(schema.trustedContacts).set({ available: available ? 1 : 0 }).where(eq(schema.trustedContacts.id, id)).run();
    },
  };

  const signals: Repos['signals'] = {
    async set(questionId, signalsIn) {
      if (signalsIn.length !== 3) throw new Error('SIGNALS_MUST_BE_EXACTLY_THREE');
      if (signalsIn.filter((s) => s.kind === 'VERIFIED').length !== 1) throw new Error('SIGNALS_MUST_HAVE_ONE_VERIFIED');
      // Replace semantics: delete any previously stored signals for this
      // question, then insert the new set, so re-seeding never leaves stale
      // duplicate rows behind.
      db.delete(schema.sourceSignals).where(eq(schema.sourceSignals.questionId, questionId)).run();
      for (const s of signalsIn) {
        db.insert(schema.sourceSignals).values({ questionId, text: s.text, kind: s.kind }).run();
      }
    },

    async get(questionId) {
      const rows = await db
        .select()
        .from(schema.sourceSignals)
        .where(eq(schema.sourceSignals.questionId, questionId))
        .orderBy(asc(schema.sourceSignals.seq));
      if (rows.length === 0) return null;
      return rows.map((row) => ({ text: row.text, kind: row.kind }));
    },
  };

  return { questions, packs, games, audit, contacts, signals };
}
