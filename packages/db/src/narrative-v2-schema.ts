/** Pending 0023 declarations. SQL deferred FK, trigger and role policies remain authoritative;
 * never use schema push to replace them. Kept separate from the historical 0022 declarations. */
import {sql} from 'drizzle-orm';
import {pgTable,text,integer,boolean,timestamp,uuid,customType,primaryKey,uniqueIndex,foreignKey,check} from 'drizzle-orm/pg-core';
import {authAccounts,turnRequests,narrativeGenerationRequests} from './schema.js';
const bytea=customType<{data:Buffer;driverData:Buffer}>({dataType:()=> 'bytea'});
export const narrativeWriterFence=pgTable('narrative_writer_fence',{
 singleton:boolean('singleton').primaryKey(),protocolVersion:integer('protocol_version').notNull(),
 phase:text('phase').notNull(),fleetManifestSha:text('fleet_manifest_sha').notNull(),rendererVersion:text('renderer_version').notNull(),
 oldWriterDrained:boolean('old_writer_drained').notNull().default(false),oldRoleRevoked:boolean('old_role_revoked').notNull().default(false),
 validUntil:timestamp('valid_until',{withTimezone:true}).notNull(),retiredRoles:text('retired_roles').array().notNull().default(sql`'{}'::text[]`),
 drainEvidenceSha:text('drain_evidence_sha'),attestedBy:text('attested_by'),attestedAt:timestamp('attested_at',{withTimezone:true}),
},t=>[
 check('narrative_fence_singleton',sql`${t.singleton}`),check('narrative_fence_protocol',sql`${t.protocolVersion}=2`),
 check('narrative_fence_phase',sql`${t.phase} IN ('fenced','managed')`),check('narrative_fence_renderer',sql`length(${t.rendererVersion})>0`),
]);
export const narrativeReceiptOwnership=pgTable('narrative_receipt_ownership',{
 ownerId:text('owner_id').notNull().references(()=>authAccounts.id,{onDelete:'cascade'}),saveId:text('save_id').notNull(),
 requestKey:text('request_key').notNull(),receiptSha:text('receipt_sha').notNull(),protocolVersion:integer('protocol_version').notNull(),
 ownership:text('ownership').notNull(),requestNarrative:boolean('request_narrative').notNull(),rendererVersion:text('renderer_version').notNull(),
 contextVersion:text('context_version').notNull(),branchId:text('branch_id').notNull(),
 generationId:uuid('generation_id').references(()=>narrativeGenerationRequests.id),
 legacyInventorySha:text('legacy_inventory_sha'),legacyBody:bytea('legacy_body'),legacyBodySha:text('legacy_body_sha'),
 legacyGeneratorSource:text('legacy_generator_source'),
},t=>[
 primaryKey({columns:[t.saveId,t.requestKey]}),uniqueIndex('narrative_ownership_identity').on(t.ownerId,t.saveId,t.requestKey,t.receiptSha),
 foreignKey({columns:[t.saveId,t.requestKey],foreignColumns:[turnRequests.saveId,turnRequests.idempotencyKey]}).onDelete('cascade'),
 check('narrative_ownership_receipt_sha',sql`${t.receiptSha} ~ '^[a-f0-9]{64}$'`),
 check('narrative_ownership_protocol',sql`${t.protocolVersion} IN (1,2)`),check('narrative_ownership_kind',sql`${t.ownership} IN ('managed','suppressed','legacy')`),
 check('narrative_ownership_branch',sql`${t.branchId}='root'`),
 check('narrative_ownership_generator',sql`${t.legacyGeneratorSource} IN ('model','deterministic')`),
 check('narrative_ownership_choice',sql`(${t.ownership}='managed' AND ${t.requestNarrative} AND ${t.protocolVersion}=2)
 OR (${t.ownership}='suppressed' AND NOT ${t.requestNarrative} AND ${t.protocolVersion}=2 AND ${t.generationId} IS NULL)
 OR (${t.ownership}='legacy' AND ${t.protocolVersion}=1 AND ${t.generationId} IS NULL AND ${t.legacyInventorySha} IS NOT NULL AND ${t.legacyInventorySha} ~ '^[a-f0-9]{64}$')`),
 check('narrative_ownership_legacy_fields',sql`${t.ownership}='legacy' OR (${t.legacyBody} IS NULL AND ${t.legacyBodySha} IS NULL AND ${t.legacyInventorySha} IS NULL AND ${t.legacyGeneratorSource} IS NULL)`),
 check('narrative_ownership_legacy_bytes',sql`(${t.legacyBody} IS NULL AND ${t.legacyBodySha} IS NULL)
 OR (${t.legacyBody} IS NOT NULL AND ${t.legacyBodySha} IS NOT NULL AND ${t.legacyGeneratorSource} IS NOT NULL AND ${t.legacyBodySha}=encode(sha256(${t.legacyBody}),'hex'))`),
]);
