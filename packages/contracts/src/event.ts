import { z } from 'zod';
import { isBoundedJson } from './json-bounds.js';

export const DomainEventSchema = z.strictObject({
  id: z.uuid(),
  saveId: z.string().min(1),
  type: z.string().min(1),
  beforeRevision: z.int().nonnegative(),
  afterRevision: z.int().positive(),
  occurredAt: z.iso.datetime(),
  source: z.enum(['RULES', 'MIGRATION']),
  ruleVersion: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).refine(value => isBoundedJson(value), { message: 'Event payload exceeds JSON bounds' }),
}).refine(event => event.afterRevision > event.beforeRevision,
  { message: 'Event revision must advance' });

// All events emitted by one accepted turn share the same before/after pair.
// The batch is applied atomically and advances the save by exactly one revision.
export type DomainEvent = z.infer<typeof DomainEventSchema>;
