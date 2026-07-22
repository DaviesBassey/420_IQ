import { sqliteTable, text, integer, primaryKey, unique } from 'drizzle-orm/sqlite-core';

export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});

export const questionVersions = sqliteTable('question_versions', {
  questionId: text('question_id').notNull(),
  version: integer('version').notNull(),
  domain: text('domain').notNull(),
  difficulty: text('difficulty').notNull(),
  stem: text('stem').notNull(),
  choicesJson: text('choices_json').notNull(),
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation').notNull(),
  knowledgeDrop: text('knowledge_drop'),
  sourceTitle: text('source_title').notNull(),
  sourceUrl: text('source_url').notNull(),
  correctAsOf: text('correct_as_of').notNull(),
  jurisdiction: text('jurisdiction'),
  sensitivityTier: integer('sensitivity_tier').notNull(),
  expiresAt: text('expires_at'),
  readTimeSec: integer('read_time_sec').notNull(),
  factKey: text('fact_key').notNull(),
  demoFlag: text('demo_flag'),
}, (t) => [primaryKey({ columns: [t.questionId, t.version] })]);

export const packs = sqliteTable('packs', {
  id: text('id').primaryKey(),
  episodeId: text('episode_id').notNull(),
  seed: text('seed').notNull(),
  lanesJson: text('lanes_json').notNull(),
  reportJson: text('report_json').notNull(),
  approvedBy: text('approved_by'),
  checksum: text('checksum'),
  createdAt: text('created_at').notNull(),
});

export const gameSessions = sqliteTable('game_sessions', {
  id: text('id').primaryKey(),
  packId: text('pack_id').notNull(),
  mode: text('mode').notNull(),
  contestantsJson: text('contestants_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const gameEvents = sqliteTable('game_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  actor: text('actor').notNull(),
  prevState: text('prev_state').notNull(),
  nextState: text('next_state').notNull(),
  payloadJson: text('payload_json').notNull(),
  at: text('at').notNull(),
}, (t) => [unique().on(t.gameId, t.idempotencyKey)]);

export const scoreEvents = sqliteTable('score_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull(),
  eventJson: text('event_json').notNull(),
  at: text('at').notNull(),
});

export const lifelineUses = sqliteTable('lifeline_uses', {
  gameId: text('game_id').notNull(),
  contestantId: text('contestant_id').notNull(),
  type: text('type').notNull(),
  at: text('at').notNull(),
}, (t) => [unique().on(t.gameId, t.contestantId, t.type)]);

export const auditEvents = sqliteTable('audit_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  detail: text('detail').notNull(),
  at: text('at').notNull(),
});

export const trustedContacts = sqliteTable('trusted_contacts', {
  id: text('id').primaryKey(),
  contestantId: text('contestant_id').notNull(),
  name: text('name').notNull(),
  consentRecordedAt: text('consent_recorded_at').notNull(),
  available: integer('available').notNull(), // 0/1 — no boolean mode used elsewhere in this schema
});

export const sourceSignals = sqliteTable('source_signals', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  questionId: text('question_id').notNull(),
  text: text('text').notNull(),
  kind: text('kind').notNull(), // 'VERIFIED' | 'UNRELIABLE' | 'DISTRACTOR'
});
