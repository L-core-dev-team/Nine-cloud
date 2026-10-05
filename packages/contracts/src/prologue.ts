import { z } from 'zod';

const id = z.string().min(1).max(128);

export const PROLOGUE_V1_LOCATION_LIMIT = 3 as const;

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
  /** Active child location within locationId; it is not a world-map location. */
  currentSublocationId: id.nullable().default(null),
  /** Authoritative NPC presence facts, distinct from interaction/visibility catalogs. */
  npcPresence: z.array(id).max(128).default([]).refine(values => new Set(values).size === values.length),
  stamina: z.int().min(0).max(100),
  staminaDayIndex: z.int().nonnegative(),
  spiritStamina: z.int().min(0).max(100),
  cultivationProgress: z.int().min(0).max(10_000),
  fatigueCount: z.int().nonnegative(),
  inventory: z.array(inventoryEntrySchema).max(8).refine(
    entries => new Set(entries.map(entry => entry.itemId)).size === entries.length,
    'inventory must contain one stack per item ID',
  ),
  collectedSources: z.array(id).max(512).refine(
    sourceIds => new Set(sourceIds).size === sourceIds.length,
    'collectedSources must not contain duplicate source IDs',
  ),
  effectFlags: z.array(id).max(256).refine(values => new Set(values).size === values.length),
  clues: z.array(id).max(512).refine(values => new Set(values).size === values.length),
  observationLog: z.array(observationEntrySchema).max(2048),
  npcInteractionLog: z.array(npcInteractionEntrySchema).max(2048),
  travelLog: z.array(travelEntrySchema).max(2048),
  injuryFlags: z.array(id).max(256).refine(values => new Set(values).size === values.length),
  questState: z.strictObject({
    status: z.enum(['unavailable', 'completed']),
    rewardClaimed: z.boolean(),
  }),
  knownLocations: z.array(id).max(PROLOGUE_V1_LOCATION_LIMIT).refine(values => new Set(values).size === values.length),
  /** Techniques the player knows; the rulebook supplies the allow-list. */
  knownTechniques: z.array(id).max(128).default([]).refine(values => new Set(values).size === values.length),
  locationGraph: z.array(locationEdgeSchema).max(512).refine(
    edges => new Set(edges.map(edge => `${edge.from}\0${edge.to}`)).size === edges.length,
    'locationGraph must contain one directed edge per location pair',
  ),
  idleCount: z.int().nonnegative(),
  obstacleState: z.enum(['blocked', 'cleared']),
  ferryState: z.enum(['aground', 'clear']),
});

export type PrologueV1Facts = z.infer<typeof PrologueV1FactsSchema>;

export function parsePrologueV1Facts(value: unknown): PrologueV1Facts {
  return PrologueV1FactsSchema.parse(value);
}
