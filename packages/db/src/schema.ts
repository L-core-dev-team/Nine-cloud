import { integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Authentication tables and ownership checks arrive with S6. No save API uses these yet.
export const gameSaves = pgTable('game_saves', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull().default(0),
  schemaVersion: integer('schema_version').notNull(),
  canonVersion: text('canon_version').notNull(),
  ruleVersion: text('rule_version').notNull(),
  memoryPolicyVersion: text('memory_policy_version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('game_saves_owner_id_idx').on(table.ownerId, table.id)]);

export const turnRequests = pgTable('turn_requests', {
  saveId: text('save_id').notNull().references(() => gameSaves.id),
  idempotencyKey: text('idempotency_key').notNull(),
  expectedRevision: integer('expected_revision').notNull(),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.saveId, table.idempotencyKey] })]);

export const turnEvents = pgTable('turn_events', {
  id: text('id').primaryKey(),
  saveId: text('save_id').notNull().references(() => gameSaves.id),
  idempotencyKey: text('idempotency_key').notNull(),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  beforeRevision: integer('before_revision').notNull(),
  afterRevision: integer('after_revision').notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
}, table => [uniqueIndex('turn_events_save_sequence_idx').on(table.saveId, table.sequence)]);
