import { z } from 'zod';

const id = z.string().min(1).max(128);

const inventoryEntrySchema = z.strictObject({
  itemId: id,
  quantity: z.int().positive(),
});

const locationEdgeSchema = z.strictObject({
  from: id,
  to: id,
  state: z.enum(['open', 'blocked', 'locked']),
  via: id.optional(),
});

const observationEntrySchema = z.strictObject({
  targetId: id,
  method: z.enum(['scan', 'study']),
  result: z.enum(['found', 'none', 'blocked']),
  clueId: id.optional(),
  blockedReason: id.optional(),
  clueLevel: z.int().positive().optional(),
});

const npcInteractionEntrySchema = z.strictObject({
  npcId: id,
  topicTag: id,
  outcome: z.enum(['on_topic', 'idle', 'refuse']),
});

const travelEntrySchema = z.strictObject({
  toward: id,
  reason: z.enum(['rockslide', 'unexplored']),
});

/**
 * Closed P1 prologue facts. This is intentionally separate from WorldStateSchema:
 * legacy saves remain readable, while the signed prologue rules reject unknown
 * projection fields instead of treating facts as an extension bag.
 */
export const PrologueV1FactsSchema = z.strictObject({
  gameMinute: z.int().nonnegative(),
  stamina: z.int().min(0).max(100),
  staminaDayIndex: z.int().nonnegative(),
  spiritStamina: z.int().min(0).max(100),
  cultivationProgress: z.int().min(0).max(10_000),
  fatigueCount: z.int().nonnegative(),
  inventory: z.array(inventoryEntrySchema).max(32),
  effectFlags: z.array(id).max(256),
  clues: z.array(id).max(512),
  observationLog: z.array(observationEntrySchema).max(2048),
  npcInteractionLog: z.array(npcInteractionEntrySchema).max(2048),
  travelLog: z.array(travelEntrySchema).max(2048),
  injuryFlags: z.array(id).max(256),
  questState: z.strictObject({
    status: z.enum(['unavailable', 'completed']),
    rewardClaimed: z.boolean(),
  }),
  knownLocations: z.array(id).max(256),
  locationGraph: z.array(locationEdgeSchema).max(512),
  idleCount: z.int().nonnegative(),
  obstacleState: z.enum(['blocked', 'cleared']),
  ferryState: z.enum(['aground', 'clear']),
});

export type PrologueV1Facts = z.infer<typeof PrologueV1FactsSchema>;

export function parsePrologueV1Facts(value: unknown): PrologueV1Facts {
  return PrologueV1FactsSchema.parse(value);
}
