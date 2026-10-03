import { z } from 'zod';
import { WorldStateSchema } from './world.js';

export const SAVE_SCHEMA_VERSION = 2;

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
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
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

/** New saves use v2; imported v1 saves remain distinguishable until explicit migration. */
export const SaveEnvelopeSchema = z.union([SaveEnvelopeV2Schema, SaveEnvelopeV1Schema]);

export type MemoryMode = z.infer<typeof MemoryModeSchema>;
export type SaveMemoryPolicy = z.infer<typeof SaveMemoryPolicySchema>;
export type SaveEnvelopeV1 = z.infer<typeof SaveEnvelopeV1Schema>;
export type SaveEnvelopeV2 = z.infer<typeof SaveEnvelopeV2Schema>;
export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
