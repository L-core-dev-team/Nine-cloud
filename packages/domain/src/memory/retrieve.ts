import { assertNpcMemory, type NpcMemory, type NpcObservation } from './policy.js';

export type Recall = { observation: NpcObservation; accessibility: number };

/** Provisional P1 Forgetting curve. Values are game minutes and NPC-authorized observations. */
export const FORGETTING_HALF_LIFE_GAME_MINUTES = 10_080;
export const FORGETTING_HALF_LIFE_OBSERVED_EVENTS = 16;
export const FORGETTING_CUE_FLOOR = 0.35;

/** Deterministic retrieval. Low accessibility hides a memory from this query; it never deletes it. */
export function retrieveNpcMemories(memory: NpcMemory, options: {
  nowMinute: number;
  query: string;
  limit: number;
  minAccessibility: number;
}): Recall[] {
  assertNpcMemory(memory);
  if (!options || typeof options.query !== 'string'
    || !Number.isSafeInteger(options.nowMinute) || options.nowMinute < 0
    || !Number.isSafeInteger(options.limit) || options.limit < 0 || options.limit > 100
    || !Number.isFinite(options.minAccessibility) || options.minAccessibility < 0 || options.minAccessibility > 1) {
    throw new Error('Invalid recall parameters');
  }
  const needle = options.query.trim().normalize('NFKC').toLowerCase();
  return memory.observations.flatMap((observation, observationIndex) => {
    if (observation.npcId !== memory.npcId || observation.observedAtMinute > options.nowMinute) throw new Error('Memory chronology or owner mismatch');
    const text = observation.summary.normalize('NFKC').toLowerCase();
    if (needle && !text.includes(needle)) return [];
    const elapsed = options.nowMinute - observation.observedAtMinute;
    const accessibility = memory.policyVersion === 'exact-recall-v1' || memory.policyVersion === 'continue-v1'
      ? 1
      : memory.policyVersion === 'forgetting-v1'
        ? forgettingAccessibility(memory, observationIndex, elapsed, needle.length > 0)
        : 1 / (1 + elapsed / 1440);
    return accessibility >= options.minAccessibility ? [{ observation, accessibility }] : [];
  }).sort((left, right) => right.accessibility - left.accessibility
    || right.observation.observedAtMinute - left.observation.observedAtMinute
    || (left.observation.eventId < right.observation.eventId ? -1 : left.observation.eventId > right.observation.eventId ? 1 : 0))
    .slice(0, options.limit);
}

function forgettingAccessibility(memory: NpcMemory, observationIndex: number, elapsed: number, cueMatched: boolean): number {
  // Journal order is the stable NPC-authorized event sequence. Revisions alone
  // miss multiple witnessed events committed in one turn at the same revision.
  const laterObservedEvents = memory.observations.length - observationIndex - 1;
  const halfLives = elapsed / FORGETTING_HALF_LIFE_GAME_MINUTES
    + laterObservedEvents / FORGETTING_HALF_LIFE_OBSERVED_EVENTS;
  const accessibility = 0.5 ** halfLives;
  return cueMatched ? Math.max(accessibility, FORGETTING_CUE_FLOOR) : accessibility;
}
