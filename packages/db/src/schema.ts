import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const authAccounts = pgTable('auth_accounts', {
  id: text('id').primaryKey(), email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, table => [uniqueIndex('auth_accounts_email_idx').on(table.email)]);
export const accountOperations = pgTable('account_operations', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => authAccounts.id, { onDelete:'cascade' }),
  sessionHash: text('session_hash').notNull(), operation: text('operation').notNull(), oldEmail: text('old_email'), newEmail: text('new_email'),
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
/** Maps Supabase Auth subjects to the existing immutable game-data owner. Phone values are stored only as HMAC digests. */
export const authExternalIdentities = pgTable('auth_external_identities', {
  providerSubject: text('provider_subject').notNull(), identityKind: text('identity_kind').notNull(),
  identifierDigest: text('identifier_digest').notNull(), ownerId: text('owner_id').notNull().references(() => authAccounts.id, { onDelete: 'cascade' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => [
  primaryKey({ columns: [table.providerSubject, table.identityKind] }),
  uniqueIndex('auth_external_identity_digest_idx').on(table.identityKind, table.identifierDigest).where(sql`${table.revokedAt} IS NULL`),
  uniqueIndex('auth_external_identity_owner_kind_idx').on(table.ownerId, table.identityKind).where(sql`${table.revokedAt} IS NULL`),
  check('auth_external_identity_kind_check', sql`${table.identityKind} IN ('email', 'phone')`),
  check('auth_external_identity_digest_check', sql`${table.identifierDigest} ~ '^[a-f0-9]{64}$'`),
]);
export const authProviderIpLimits = pgTable('auth_provider_ip_limits', {
  ipDigest: text('ip_digest').primaryKey(), windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  hourCount: integer('hour_count').notNull().default(0), dayStartedAt: date('day_started_at', { mode: 'string' }).notNull(),
  dayCount: integer('day_count').notNull().default(0),
}, table => [index('auth_provider_ip_limits_day_started_at_idx').on(table.dayStartedAt)]);
export const authProviderAccountLimits = pgTable('auth_provider_account_limits', {
  ownerDigest: text('owner_digest').primaryKey(), windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  hourCount: integer('hour_count').notNull().default(0), dayStartedAt: date('day_started_at', { mode: 'string' }).notNull(),
  dayCount: integer('day_count').notNull().default(0),
}, table => [index('auth_provider_account_limits_day_started_at_idx').on(table.dayStartedAt)]);
export const authMailLimits = pgTable('auth_mail_limits', {
  bucket: bigint('bucket', { mode: 'number' }).primaryKey(), sent: integer('sent').notNull(),
});
/** SEC-02: per-IP hourly budget for verification-code mails (global bucket remains the backstop). */
export const authIpMailLimits = pgTable('auth_ip_mail_limits', {
  ip: text('ip').primaryKey(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
});

export const gameSaves = pgTable('game_saves', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull().default(0),
  schemaVersion: integer('schema_version').notNull(),
  canonVersion: text('canon_version').notNull(),
  ruleVersion: text('rule_version').notNull(),
  memoryPolicyVersion: text('memory_policy_version').notNull(),
  memoryMode: text('memory_mode'),
  memoryPolicy: jsonb('memory_policy'),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('game_saves_owner_id_idx').on(table.ownerId, table.id),
  foreignKey({ columns: [table.ownerId], foreignColumns: [authAccounts.id], name: 'game_saves_account_fk' }),
  check('game_saves_memory_policy_check', sql`(
    (
      (${table.schemaVersion} = 1 AND ${table.memoryMode} IS NULL AND ${table.memoryPolicy} IS NULL)
      OR (
        ${table.schemaVersion} = 2
        AND ${table.memoryMode} IN ('continue', 'forgetting')
        AND jsonb_typeof(${table.memoryPolicy}) = 'object'
        AND (${table.memoryPolicy} - ARRAY['mode','policyVersion','schemaVersion','clockBasis','policyArtifactHash','cueDictionaryHash','normalizerVersion','retrievalVersion','visibilityPolicyVersion','visibilityPolicyHash','createdAtRevision']) = '{}'::jsonb
        AND ${table.memoryPolicy} ?& ARRAY['mode','policyVersion','schemaVersion','clockBasis','policyArtifactHash','cueDictionaryHash','normalizerVersion','retrievalVersion','visibilityPolicyVersion','visibilityPolicyHash','createdAtRevision']
        AND ${table.memoryPolicy}->>'mode' = ${table.memoryMode}
        AND ${table.memoryPolicy}->>'policyVersion' = ${table.memoryPolicyVersion}
        AND ${table.memoryPolicy}->>'clockBasis' = 'game-minute+npc-grant-sequence-v1'
        AND ${table.memoryPolicy}->>'policyArtifactHash' ~ '^sha256:[0-9A-Fa-f]{64}$'
        AND ${table.memoryPolicy}->>'cueDictionaryHash' ~ '^sha256:[0-9A-Fa-f]{64}$'
        AND ${table.memoryPolicy}->>'visibilityPolicyHash' ~ '^sha256:[0-9A-Fa-f]{64}$'
        AND jsonb_typeof(${table.memoryPolicy}->'schemaVersion') = 'number'
        AND ${table.memoryPolicy}->>'schemaVersion' ~ '^[1-9][0-9]{0,15}$'
        AND (${table.memoryPolicy}->>'schemaVersion')::numeric <= 9007199254740991
        AND jsonb_typeof(${table.memoryPolicy}->'createdAtRevision') = 'number'
        AND ${table.memoryPolicy}->>'createdAtRevision' ~ '^(0|[1-9][0-9]{0,15})$'
        AND (${table.memoryPolicy}->>'createdAtRevision')::numeric <= 9007199254740991
        AND jsonb_typeof(${table.memoryPolicy}->'policyVersion') = 'string'
        AND length(${table.memoryPolicy}->>'policyVersion') BETWEEN 1 AND 200
        AND jsonb_typeof(${table.memoryPolicy}->'normalizerVersion') = 'string'
        AND length(${table.memoryPolicy}->>'normalizerVersion') BETWEEN 1 AND 200
        AND jsonb_typeof(${table.memoryPolicy}->'retrievalVersion') = 'string'
        AND length(${table.memoryPolicy}->>'retrievalVersion') BETWEEN 1 AND 200
        AND jsonb_typeof(${table.memoryPolicy}->'visibilityPolicyVersion') = 'string'
        AND length(${table.memoryPolicy}->>'visibilityPolicyVersion') BETWEEN 1 AND 200
      )
    ) IS TRUE
  )`),
]);

export const cloudArchiveTrash = pgTable('cloud_archive_trash', {
  saveId: text('save_id').primaryKey().references(() => gameSaves.id), ownerId: text('owner_id').notNull(),
  deletedRevision: integer('deleted_revision').notNull(), backup: jsonb('backup').notNull(), digest: text('digest').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
},table=>[foreignKey({columns:[table.ownerId,table.saveId],foreignColumns:[gameSaves.ownerId,gameSaves.id],name:'trash_owner_save_fk'})]);

export const turnRequests = pgTable('turn_requests', {
  saveId: text('save_id').notNull().references(() => gameSaves.id),
  idempotencyKey: text('idempotency_key').notNull(),
  expectedRevision: integer('expected_revision').notNull(),
  result: jsonb('result'),
  narrativeAttemptId: text('narrative_attempt_id'),
  narrativeStatus: text('narrative_status').notNull().default('not_requested'),
  narrativeUpdatedAt: timestamp('narrative_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.saveId, table.idempotencyKey] })]);

export const turnEvents = pgTable('turn_events', {
  id: text('id').primaryKey(),
  saveId: text('save_id').notNull().references(() => gameSaves.id),
  branchId: text('branch_id').notNull().default('root'),
  idempotencyKey: text('idempotency_key').notNull(),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  previousHash: text('previous_hash').notNull(),eventHash:text('event_hash').notNull(),
  source: text('source').notNull(),
  ruleVersion: text('rule_version').notNull(),
  beforeRevision: integer('before_revision').notNull(),
  afterRevision: integer('after_revision').notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  }, table => [
    uniqueIndex('turn_events_save_sequence_idx').on(table.saveId, table.sequence),
    uniqueIndex('turn_events_save_id_id_idx').on(table.saveId, table.id),
    check('turn_events_branch_id_check', sql`${table.branchId} = 'root'`),
  ]);

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

/** Mode-neutral, frozen authorization facts. Never contains raw event payloads or narrative output. */
export const npcAuthorizedObservationOutbox = pgTable('npc_authorized_observation_outbox', {
  grantId: text('grant_id').primaryKey(),
  saveId: text('save_id').notNull().references(() => gameSaves.id, { onDelete: 'cascade' }),
  branchId: text('branch_id').notNull(),
  npcId: text('npc_id').notNull(),
  eventId: text('event_id').notNull(),
  eventRevision: integer('event_revision').notNull(),
  observedAtMinute: bigint('observed_at_minute', { mode: 'number' }).notNull(),
  channel: text('channel').notNull(),
  memoryClass: text('memory_class').notNull().default('unclassified'),
  authorizationPolicyVersion: text('authorization_policy_version').notNull(),
  authorizedFields: jsonb('authorized_fields').notNull(),
  authorizedFacts: jsonb('authorized_facts').notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('npc_authorized_observation_identity_idx').on(table.saveId, table.branchId, table.npcId, table.eventId),
  foreignKey({ columns: [table.saveId, table.eventId], foreignColumns: [turnEvents.saveId, turnEvents.id], name: 'npc_authorized_observation_event_fk' }).onDelete('cascade'),
  index('npc_authorized_observation_page_idx').on(table.saveId, table.npcId, table.eventRevision, table.grantId),
  check('npc_authorized_observation_revision_check', sql`${table.eventRevision} > 0`),
  check('npc_authorized_observation_minute_check', sql`${table.observedAtMinute} >= 0`),
  check('npc_authorized_observation_branch_check', sql`${table.branchId} = 'root'`),
  check('npc_authorized_observation_channel_check', sql`${table.channel} IN ('witnessed', 'reported')`),
  check('npc_authorized_observation_memory_class_check', sql`${table.memoryClass} IN ('current-state', 'historical-event', 'subjective-belief', 'unclassified')`),
  check('npc_authorized_observation_fields_check', sql`jsonb_typeof(${table.authorizedFields}) = 'array'`),
  check('npc_authorized_observation_facts_check', sql`jsonb_typeof(${table.authorizedFacts}) = 'object'`),
  check('npc_authorized_observation_text_check', sql`length(${table.grantId}) BETWEEN 1 AND 2000 AND length(${table.npcId}) BETWEEN 1 AND 200 AND length(${table.authorizationPolicyVersion}) BETWEEN 1 AND 200 AND length(${table.summary}) BETWEEN 1 AND 4000`),
  index('npc_authorized_observation_recall_idx').on(table.saveId, table.branchId, table.npcId, table.memoryClass, table.eventRevision, table.grantId),
]);

/** Append-only references from a superseding rules event to one current-state observation. */
export const npcMemoryObservationSupersessions = pgTable('npc_memory_observation_supersessions', {
  saveId: text('save_id').notNull().references(() => gameSaves.id, { onDelete: 'cascade' }),
  branchId: text('branch_id').notNull(),
  npcId: text('npc_id').notNull(),
  observationGrantId: text('observation_grant_id').notNull().references(() => npcAuthorizedObservationOutbox.grantId, { onDelete: 'cascade' }),
  supersededByEventId: text('superseded_by_event_id').notNull(),
  supersededAtRevision: integer('superseded_at_revision').notNull(),
  kind: text('kind').notNull(),
  reason: text('reason').notNull(),
  policyVersion: text('policy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.observationGrantId], name: 'npc_memory_supersession_pk' }),
  foreignKey({ columns: [table.saveId, table.supersededByEventId], foreignColumns: [turnEvents.saveId, turnEvents.id], name: 'npc_memory_supersession_event_fk' }).onDelete('cascade'),
  index('npc_memory_supersession_save_npc_idx').on(table.saveId, table.branchId, table.npcId, table.supersededByEventId),
  check('npc_memory_supersession_branch_check', sql`${table.branchId} = 'root'`),
  check('npc_memory_supersession_revision_check', sql`${table.supersededAtRevision} > 1`),
  check('npc_memory_supersession_kind_check', sql`${table.kind} IN ('premise-revised', 'relation-changed', 'entity-dead', 'item-moved', 'clue-invalid')`),
  check('npc_memory_supersession_text_check', sql`length(${table.npcId}) BETWEEN 1 AND 200 AND length(${table.reason}) BETWEEN 1 AND 500 AND length(${table.policyVersion}) BETWEEN 1 AND 200`),
]);

export const accountRateLimits=pgTable('account_rate_limits',{key:text('key').primaryKey(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),hits:integer('hits').notNull()});
export const accountLifecycleAudit=pgTable('account_lifecycle_audit',{id:text('id').primaryKey(),ownerDigest:text('owner_digest').notNull(),operation:text('operation').notNull(),policyVersion:text('policy_version').notNull(),occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull().defaultNow()});
