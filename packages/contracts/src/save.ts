import { z } from 'zod';
import { WorldStateSchema } from './world.js';

export const SAVE_SCHEMA_VERSION = 3;

export const MemoryModeSchema = z.enum(['continue', 'forgetting']);

const sha256ArtifactHash = z.string().regex(/^sha256:[\da-f]{64}$/i);

/** Immutable, versioned retrieval policy identity. Values are pinned at save creation. */
export const SaveMemoryPolicySchema = z.strictObject({
  mode: MemoryModeSchema,
  policyVersion: z.string().min(1).max(200),
  schemaVersion: z.int().positive(),
  clockBasis: z.literal('game-minute+npc-grant-sequence-v1'),
  policyArtifactHash: sha256ArtifactHash,
  cueDictionaryHash: sha256ArtifactHash,
  normalizerVersion: z.string().min(1).max(200),
  retrievalVersion: z.string().min(1).max(200),
  visibilityPolicyVersion: z.string().min(1).max(200),
  visibilityPolicyHash: sha256ArtifactHash,
  createdAtRevision: z.int().nonnegative(),
});

/** Existing v1 envelopes stay readable and are never assigned a memory mode implicitly. */
export const SaveEnvelopeV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  saveId: z.string().min(1),
  canonVersion: z.string().min(1),
  ruleVersion: z.string().min(1),
  memoryPolicyVersion: z.string().min(1),
  revision: z.int().nonnegative(),
  state: WorldStateSchema,
});

export const SaveEnvelopeV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  saveId: z.string().min(1),
  canonVersion: z.string().min(1),
  ruleVersion: z.string().min(1),
  memoryPolicyVersion: z.string().min(1),
  memoryMode: MemoryModeSchema,
  memoryPolicy: SaveMemoryPolicySchema,
  revision: z.int().nonnegative(),
  state: WorldStateSchema,
}).superRefine((save, context) => {
  if (save.memoryMode !== save.memoryPolicy.mode) {
    context.addIssue({ code: 'custom', path: ['memoryMode'], message: 'Save memory mode must match its pinned memory policy' });
  }
  if (save.memoryPolicyVersion !== save.memoryPolicy.policyVersion) {
    context.addIssue({ code: 'custom', path: ['memoryPolicyVersion'], message: 'Legacy policy version must match the pinned memory policy' });
  }
});

/** Branch lineage is explicit on v3 saves. Legacy envelopes are never backfilled. */
export const SaveBranchLineageSchema = z.strictObject({
  branchId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
  parentBranchId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/).nullable(),
  forkRevision: z.int().nonnegative(),
  createdPolicyVersion: z.string().min(1).max(200),
  sourceMigrationId: z.string().min(1).max(200).nullable(),
});

export const SaveEnvelopeV3Schema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  saveId: z.string().min(1),
  canonVersion: z.string().min(1),
  /** Exact public Canon runtime artifact; distinct from a candidate ruleset's canonVersion label. */
  canonArtifactHash: sha256ArtifactHash,
  ruleVersion: z.string().min(1),
  memoryPolicyVersion: z.string().min(1),
  memoryMode: MemoryModeSchema,
  memoryPolicy: SaveMemoryPolicySchema,
  ...SaveBranchLineageSchema.shape,
  revision: z.int().nonnegative(),
  state: WorldStateSchema,
}).superRefine((save, context) => {
  if (save.memoryMode !== save.memoryPolicy.mode) {
    context.addIssue({ code: 'custom', path: ['memoryMode'], message: 'Save memory mode must match its pinned memory policy' });
  }
  if (save.memoryPolicyVersion !== save.memoryPolicy.policyVersion
    || save.createdPolicyVersion !== save.memoryPolicy.policyVersion) {
    context.addIssue({ code: 'custom', path: ['memoryPolicyVersion'], message: 'Save policy lineage must match the pinned memory policy' });
  }
  if ((save.parentBranchId === null && (save.branchId !== 'root' || save.forkRevision !== 0))
    || (save.parentBranchId !== null && (save.branchId === 'root' || save.parentBranchId === save.branchId))
    || save.forkRevision > save.revision) {
    context.addIssue({ code: 'custom', path: ['branchId'], message: 'Save branch lineage is inconsistent' });
  }
});

/** V1/V2 exports remain readable without inventing mode or lineage metadata. */
export const SaveEnvelopeSchema = z.union([SaveEnvelopeV3Schema, SaveEnvelopeV2Schema, SaveEnvelopeV1Schema]);

export type MemoryMode = z.infer<typeof MemoryModeSchema>;
export type SaveMemoryPolicy = z.infer<typeof SaveMemoryPolicySchema>;
export type SaveEnvelopeV1 = z.infer<typeof SaveEnvelopeV1Schema>;
export type SaveEnvelopeV2 = z.infer<typeof SaveEnvelopeV2Schema>;
export type SaveEnvelopeV3 = z.infer<typeof SaveEnvelopeV3Schema>;
export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
