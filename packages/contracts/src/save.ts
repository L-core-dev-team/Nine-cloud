import { z } from 'zod';
import { WorldStateSchema } from './world.js';

export const SAVE_SCHEMA_VERSION = 1;

export const SaveEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  saveId: z.string().min(1),
  canonVersion: z.string().min(1),
  ruleVersion: z.string().min(1),
  memoryPolicyVersion: z.string().min(1),
  revision: z.int().nonnegative(),
  state: WorldStateSchema,
});

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
