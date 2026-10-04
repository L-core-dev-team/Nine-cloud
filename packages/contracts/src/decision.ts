import { z } from 'zod';
import { isBoundedJson } from './json-bounds.js';
import { DomainEventSchema, DomainEventV1Schema } from './event.js';

export const CLARIFICATION_ACTION_ORDER = [
  'move', 'cultivate', 'acquire_item', 'use_item', 'talk', 'observe', 'combat', 'quest',
] as const;

const ClarificationActionSchema = z.enum(CLARIFICATION_ACTION_ORDER);

export const ClarificationCandidateSchema = z.strictObject({
  kind: ClarificationActionSchema,
  label: z.string().min(1).max(160),
  slots: z.record(z.string(), z.unknown())
    .refine(value => isBoundedJson(value), { message: 'Candidate slots exceed JSON bounds' }),
});

const ClarificationCandidatesSchema = z.array(ClarificationCandidateSchema).max(4).superRefine((candidates, context) => {
  const rank = new Map(CLARIFICATION_ACTION_ORDER.map((kind, index) => [kind, index]));
  for (let index = 1; index < candidates.length; index += 1) {
    const previousRank = rank.get(candidates[index - 1]!.kind)!;
    const currentRank = rank.get(candidates[index]!.kind)!;
    if (currentRank < previousRank) {
      context.addIssue({
        code: 'custom',
        path: [index, 'kind'],
        message: 'Clarification candidates must follow the canonical action order',
      });
    }
  }
});

const AcceptedDecisionV1Schema = z.strictObject({
  status: z.literal('accepted'),
  events: z.array(DomainEventV1Schema).min(1),
  nextRevision: z.int().positive(),
});

const AcceptedDecisionV2Schema = z.strictObject({
  status: z.literal('accepted'),
  outcome: z.enum(['success', 'legal_failure']),
  code: z.string().regex(/^RULE_[A-Z0-9_]+$/).optional(),
  events: z.array(DomainEventSchema).min(1),
  nextRevision: z.int().positive(),
}).superRefine((decision, context) => {
  if (decision.outcome === 'legal_failure' && !decision.code) {
    context.addIssue({ code: 'custom', path: ['code'], message: 'A committed legal failure requires a RULE_ code' });
  }
  if (decision.outcome === 'success' && decision.code !== undefined) {
    context.addIssue({ code: 'custom', path: ['code'], message: 'Successful decisions cannot carry a failure code' });
  }
});

const RejectedDecisionV1Schema = z.strictObject({
  status: z.literal('rejected'),
  code: z.string().min(1),
  message: z.string().min(1),
  revision: z.int().nonnegative(),
});

const RejectedDecisionV2Schema = z.strictObject({
  status: z.literal('rejected'),
  code: z.string().regex(/^(INPUT|AUTH|ENV)_[A-Z0-9_]+$/),
  message: z.string().min(1),
  revision: z.int().nonnegative(),
});

const ClarifyDecisionV1Schema = z.strictObject({
  status: z.literal('clarify'),
  question: z.string().min(1),
  revision: z.int().nonnegative(),
});

const ClarifyDecisionV2Schema = z.strictObject({
  status: z.literal('clarify'),
  question: z.string().min(1).max(500),
  missingSlots: z.array(z.string().min(1).max(80)).max(8),
  candidates: ClarificationCandidatesSchema,
  interactionId: z.string().min(1).max(128),
  revision: z.int().nonnegative(),
});

/** New decisions use v2 shapes; v1 shapes remain readable for stored receipts. */
export const DecisionV2Schema = z.union([
  AcceptedDecisionV2Schema,
  RejectedDecisionV2Schema,
  ClarifyDecisionV2Schema,
]);

export type DecisionV2 = z.infer<typeof DecisionV2Schema>;

export const DecisionV1Schema = z.discriminatedUnion('status', [
  AcceptedDecisionV1Schema,
  RejectedDecisionV1Schema,
  ClarifyDecisionV1Schema,
]);

export const DecisionSchema = z.union([DecisionV2Schema, DecisionV1Schema]);

export type Decision = z.infer<typeof DecisionSchema>;
