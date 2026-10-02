import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const authAccounts = pgTable('auth_accounts', {
  id: text('id').primaryKey(), email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, table => [uniqueIndex('auth_accounts_email_idx').on(table.email)]);
export const accountOperations = pgTable('account_operations', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => authAccounts.id, { onDelete:'cascade' }),
  sessionHash: text('session_hash').notNull(), operation: text('operation').notNull(), oldEmail: text('old_email').notNull(), newEmail: text('new_email'),
  phase: text('phase').notNull(), digest: text('digest'), attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone:true }).notNull().defaultNow(), expiresAt: timestamp('expires_at', { withTimezone:true }).notNull(),
});
export const authChallenges = pgTable('auth_challenges', {
  email: text('email').primaryKey(), digest: text('digest'), attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  windowCount: integer('window_count').notNull(),
});
export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(), ownerId: text('owner_id').notNull().references(() => authAccounts.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const authMailLimits = pgTable('auth_mail_limits', {
  bucket: bigint('bucket', { mode: 'number' }).primaryKey(), sent: integer('sent').notNull(),
});

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

export const cloudArchiveTrash = pgTable('cloud_archive_trash', {
  saveId: text('save_id').primaryKey().references(() => gameSaves.id), ownerId: text('owner_id').notNull(),
  deletedRevision: integer('deleted_revision').notNull(), backup: jsonb('backup').notNull(), digest: text('digest').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  source: text('source'),
  ruleVersion: text('rule_version'),
  beforeRevision: integer('before_revision').notNull(),
  afterRevision: integer('after_revision').notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
}, table => [uniqueIndex('turn_events_save_sequence_idx').on(table.saveId, table.sequence)]);

/** S7 usage entitlements only. Monetary value and payment-provider records stay separate. */
export const entitlementBalances = pgTable('entitlement_balances', {
  ownerId: text('owner_id').notNull(),
  entitlementKey: text('entitlement_key').notNull(),
  availableUnits: bigint('available_units', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.ownerId, table.entitlementKey] }),
  check('entitlement_balances_nonnegative_check', sql`${table.availableUnits} >= 0`),
  check('entitlement_balances_safe_integer_check', sql`${table.availableUnits} <= 9007199254740991`),
]);

export const entitlementLedgerEntries = pgTable('entitlement_ledger_entries', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  entitlementKey: text('entitlement_key').notNull(),
  entryType: text('entry_type').notNull(),
  deltaUnits: bigint('delta_units', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  reversesEntryId: text('reverses_entry_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.ownerId, table.entitlementKey], foreignColumns: [entitlementBalances.ownerId, entitlementBalances.entitlementKey], name: 'entitlement_ledger_balance_fk' }),
  foreignKey({ columns: [table.reversesEntryId], foreignColumns: [table.id], name: 'entitlement_ledger_reversal_fk' }),
  uniqueIndex('entitlement_ledger_owner_idempotency_idx').on(table.ownerId, table.idempotencyKey),
  uniqueIndex('entitlement_ledger_single_reversal_idx').on(table.reversesEntryId).where(sql`${table.reversesEntryId} IS NOT NULL`),
  check('entitlement_ledger_entry_type_check', sql`${table.entryType} IN ('grant', 'consume', 'refund')`),
  check('entitlement_ledger_delta_sign_check', sql`(
    (${table.entryType} = 'grant' AND ${table.deltaUnits} > 0 AND ${table.reversesEntryId} IS NULL) OR
    (${table.entryType} = 'consume' AND ${table.deltaUnits} < 0 AND ${table.reversesEntryId} IS NULL) OR
    (${table.entryType} = 'refund' AND ${table.deltaUnits} > 0 AND ${table.reversesEntryId} IS NOT NULL)
  )`),
  check('entitlement_ledger_balance_check', sql`${table.balanceAfter} >= 0 AND ${table.balanceAfter} <= 9007199254740991`),
]);

export const npcMemoryJournals = pgTable('npc_memory_journals', {
  saveId: text('save_id').primaryKey().references(() => gameSaves.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  revision: integer('revision').notNull().default(0),
  payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
