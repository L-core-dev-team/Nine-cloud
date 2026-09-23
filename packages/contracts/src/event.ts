import { z } from 'zod';

export const DomainEventSchema = z.strictObject({
  id: z.uuid(),
  saveId: z.string().min(1),
  type: z.string().min(1),
  beforeRevision: z.int().nonnegative(),
  afterRevision: z.int().positive(),
  occurredAt: z.iso.datetime(),
  source: z.enum(['RULES', 'MIGRATION']),
  ruleVersion: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
}).refine(event => event.afterRevision > event.beforeRevision,
  { message: 'Event revision must advance' });

export type DomainEvent = z.infer<typeof DomainEventSchema>;
