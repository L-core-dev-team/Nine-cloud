import { z } from 'zod';
import { DecisionV1Schema, DecisionV2Schema } from './decision.js';
import { DomainEventSchema } from './event.js';

/**
 * The durable idempotency receipt contains only a one-way request fingerprint,
 * never the player's raw utterance or API credentials.
 */
const receiptIdentity = {
  idempotencyKey: z.uuid(),
  saveId: z.string().min(1),
  requestFingerprint: z.string().regex(/^sha256:v1:[\da-f]{64}$/i),
};

const RngReceiptSchema = z.strictObject({
  seed: z.string().min(1).nullable(),
  draws: z.int().nonnegative(),
}).superRefine((rng, context) => {
  if (rng.draws > 0 && rng.seed === null) {
    context.addIssue({ code: 'custom', path: ['seed'], message: 'Random draws require a replayable seed' });
  }
});

const LegacyTurnReceiptSchema = z.strictObject({
  ...receiptIdentity,
  decision: DecisionV1Schema,
  resultingRevision: z.int().nonnegative(),
});

const CurrentTurnReceiptSchema = z.strictObject({
  ...receiptIdentity,
  branchId: z.literal('root'),
  rulesVersion: z.string().min(1).max(200),
  clockMinute: z.int().nonnegative(),
  rng: RngReceiptSchema,
  decision: DecisionV2Schema,
  resultingRevision: z.int().nonnegative(),
});

function validateReceipt(receipt: z.infer<typeof LegacyTurnReceiptSchema> | z.infer<typeof CurrentTurnReceiptSchema>, context: z.RefinementCtx): void {
  const isCurrent = 'branchId' in receipt;
  if (receipt.decision.status === 'accepted' && receipt.resultingRevision !== receipt.decision.nextRevision) {
    context.addIssue({ code: 'custom', message: 'Accepted receipt revision does not match its decision' });
  }
  if (receipt.decision.status !== 'accepted' && receipt.resultingRevision !== receipt.decision.revision) {
    context.addIssue({ code: 'custom', message: 'Uncommitted receipt must retain its input revision' });
  }
  if (receipt.decision.status !== 'accepted') return;

  const seenIds = new Set<string>();
  const firstEvent = receipt.decision.events[0];
  for (const [index, event] of receipt.decision.events.entries()) {
    if (seenIds.has(event.id)) {
      context.addIssue({ code: 'custom', path: ['decision', 'events', index, 'id'], message: 'Event ids must be unique in a receipt' });
    }
    seenIds.add(event.id);
    if (event.saveId !== receipt.saveId || event.beforeRevision !== receipt.resultingRevision - 1 ||
        event.afterRevision !== receipt.resultingRevision || event.source !== 'RULES' ||
        event.ruleVersion !== firstEvent?.ruleVersion ||
        (isCurrent && (!('branchId' in event) || event.branchId !== receipt.branchId || event.ruleVersion !== receipt.rulesVersion))) {
      context.addIssue({ code: 'custom', path: ['decision', 'events', index], message: 'Accepted receipt events do not match the committed transition' });
    }
  }
}

/** V1 stored receipts are accepted for replay; all new receipts use the v2 shape. */
export const TurnReceiptSchema = z.union([
  CurrentTurnReceiptSchema,
  LegacyTurnReceiptSchema,
]).superRefine(validateReceipt);

export const TurnReceiptV2Schema = CurrentTurnReceiptSchema.superRefine(validateReceipt);

export type TurnReceipt = z.infer<typeof TurnReceiptSchema>;
export type TurnReceiptV2 = z.infer<typeof TurnReceiptV2Schema>;
