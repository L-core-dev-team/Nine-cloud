import { z } from 'zod';
/** Explicit compare-and-set facts: distinguishes absence from a JSON null. */
export const FactValueSchema = z.discriminatedUnion('present', [z.strictObject({ present: z.literal(false) }), z.strictObject({ present: z.literal(true), value: z.json() })]);
export const StateDeltaSchema = z.strictObject({
  timeChange: z.int().nonnegative(),
  locationChange: z.strictObject({ before: z.string().min(1), after: z.string().min(1) }).nullable(),
  factChanges: z.array(z.strictObject({ key: z.string().min(1).max(200), before: FactValueSchema, after: FactValueSchema })).max(500),
}).superRefine((delta, ctx) => {
  const keys = new Set<string>();
  for (const [index, change] of delta.factChanges.entries()) {
    if (keys.has(change.key) || ['__proto__','prototype','constructor','archiveKind','localArchive','creationRequestHash'].includes(change.key)) ctx.addIssue({ code:'custom',path:['factChanges',index,'key'],message:'Duplicate or protected fact key' });
    keys.add(change.key);
  }
});
export type StateDelta = z.infer<typeof StateDeltaSchema>;
