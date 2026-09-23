import { z } from 'zod';
import { DomainEventSchema } from './event.js';

export const DecisionSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('accepted'), events: z.array(DomainEventSchema).min(1), nextRevision: z.int().positive() }),
  z.strictObject({ status: z.literal('rejected'), code: z.string().min(1), message: z.string().min(1), revision: z.int().nonnegative() }),
  z.strictObject({ status: z.literal('clarify'), question: z.string().min(1), revision: z.int().nonnegative() }),
]);

export type Decision = z.infer<typeof DecisionSchema>;
