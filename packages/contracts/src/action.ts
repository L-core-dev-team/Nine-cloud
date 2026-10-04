import { z } from 'zod';

export const MAX_CULTIVATION_KES_PER_ACTION = 8 as const;

const common = z.strictObject({
  saveId: z.string().min(1),
  actorId: z.string().min(1),
  branchId: z.literal('root').default('root'),
  expectedRevision: z.int().nonnegative(),
  idempotencyKey: z.uuid(),
});

// These are candidates. Only the domain rules may accept one and emit events.
export const ActionIntentSchema = z.discriminatedUnion('kind', [
  common.extend({ kind: z.literal('move'), payload: z.strictObject({ destinationId: z.string().min(1) }) }),
  common.extend({ kind: z.literal('cultivate'), payload: z.strictObject({ techniqueId: z.string().min(1), minutes: z.int().positive().max(MAX_CULTIVATION_KES_PER_ACTION) }) }),
  common.extend({ kind: z.literal('acquire_item'), payload: z.strictObject({ itemId: z.string().min(1), quantity: z.int().positive() }) }),
  common.extend({ kind: z.literal('use_item'), payload: z.strictObject({ itemId: z.string().min(1), targetId: z.string().min(1).optional() }) }),
  common.extend({ kind: z.literal('talk'), payload: z.strictObject({ npcId: z.string().min(1), utterance: z.string().min(1) }) }),
  common.extend({ kind: z.literal('observe'), payload: z.strictObject({ targetId: z.string().min(1), method: z.enum(['scan', 'study']) }) }),
  common.extend({ kind: z.literal('combat'), payload: z.strictObject({ targetId: z.string().min(1), techniqueId: z.string().min(1).optional() }) }),
  common.extend({ kind: z.literal('quest'), payload: z.strictObject({ questId: z.string().min(1), choiceId: z.string().min(1) }) }),
  common.extend({ kind: z.literal('free_text'), payload: z.strictObject({ text: z.string().min(1) }) }),
]);

export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ActionIntentInput = z.input<typeof ActionIntentSchema>;
