import { z } from 'zod';
import { isBoundedJson } from './json-bounds.js';

export const WorldStateSchema = z.strictObject({
  playerId: z.string().min(1),
  locationId: z.string().min(1),
  elapsedMinutes: z.int().nonnegative(),
  facts: z.record(z.string(), z.unknown()),
}).refine(value => isBoundedJson(value.facts, value.facts.archiveKind === 'local-untrusted-v1' ? 1_000_000 : 256_000),
  { message: 'World facts exceed JSON bounds' });

export type WorldState = z.infer<typeof WorldStateSchema>;
