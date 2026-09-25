import { z } from 'zod';
import { DecisionSchema } from './decision.js';

/**
 * The durable idempotency receipt contains only a one-way request fingerprint,
 * never the player's raw utterance or API credentials.
 */
export const TurnReceiptSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  saveId: z.string().min(1),
  requestFingerprint: z.string().regex(/^sha256:v1:[\da-f]{64}$/i),
  decision: DecisionSchema,
  resultingRevision: z.int().nonnegative(),
}).superRefine((receipt, context) => {
  if (receipt.decision.status === 'accepted' && receipt.resultingRevision !== receipt.decision.nextRevision) {
    context.addIssue({ code: 'custom', message: 'Accepted receipt revision does not match its decision' });
  }
  if (receipt.decision.status !== 'accepted' && receipt.resultingRevision !== receipt.decision.revision) {
    context.addIssue({ code: 'custom', message: 'Uncommitted receipt must retain its input revision' });
  }
  if (receipt.decision.status === 'accepted') {
    const seenIds = new Set<string>();
    const ruleVersion = receipt.decision.events[0]?.ruleVersion;
    for (const [index, event] of receipt.decision.events.entries()) {
      if (seenIds.has(event.id)) {
        context.addIssue({ code: 'custom', path: ['decision', 'events', index, 'id'], message: 'Event ids must be unique in a receipt' });
      }
      seenIds.add(event.id);
      if (event.saveId !== receipt.saveId || event.beforeRevision !== receipt.resultingRevision - 1 ||
          event.afterRevision !== receipt.resultingRevision || event.source !== 'RULES' || event.ruleVersion !== ruleVersion) {
        context.addIssue({ code: 'custom', path: ['decision', 'events', index], message: 'Accepted receipt events do not match the committed transition' });
      }
    }
  }
});

export type TurnReceipt = z.infer<typeof TurnReceiptSchema>;
