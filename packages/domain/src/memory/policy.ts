/** These policies affect recall only. Neither can amend rules events or state. */
export type MemoryPolicyVersion = 'exact-recall-v1' | 'accessibility-v1';

export type NpcObservation = {
  npcId: string;
  eventId: string;
  eventRevision: number;
  observedAtMinute: number;
  channel: 'witnessed' | 'reported';
  summary: string;
};

export type NpcMemory = {
  npcId: string;
  policyVersion: MemoryPolicyVersion;
  observations: readonly NpcObservation[];
};

export type ObservationGrant = {
  npcId: string;
  eventId: string;
  channel: NpcObservation['channel'];
  /** Text already filtered by the caller's event visibility policy. */
  visibleSummary: string;
};

const POLICY_VERSIONS = new Set<MemoryPolicyVersion>(['exact-recall-v1', 'accessibility-v1']);
const OBSERVATION_CHANNELS = new Set<NpcObservation['channel']>(['witnessed', 'reported']);

/** Validate memory data again at runtime because it may have come from persisted JSON. */
export function assertNpcMemory(memory: NpcMemory): void {
  if (!memory || typeof memory !== 'object' || typeof memory.npcId !== 'string' || !memory.npcId.trim()
    || !POLICY_VERSIONS.has(memory.policyVersion) || !Array.isArray(memory.observations)) {
    throw new Error('Invalid NPC memory');
  }

  const eventIds = new Set<string>();
  for (const observation of memory.observations) {
    if (!observation || typeof observation !== 'object'
      || observation.npcId !== memory.npcId
      || typeof observation.eventId !== 'string' || !observation.eventId.trim()
      || eventIds.has(observation.eventId)
      || !Number.isSafeInteger(observation.eventRevision) || observation.eventRevision < 1
      || !Number.isSafeInteger(observation.observedAtMinute) || observation.observedAtMinute < 0
      || !OBSERVATION_CHANNELS.has(observation.channel)
      || typeof observation.summary !== 'string' || !observation.summary.trim()) {
      throw new Error('Invalid NPC memory observation');
    }
    eventIds.add(observation.eventId);
  }
}

export function createNpcMemory(npcId: string, policyVersion: MemoryPolicyVersion): NpcMemory {
  if (typeof npcId !== 'string' || !npcId.trim()) throw new Error('NPC ID is required');
  if (!POLICY_VERSIONS.has(policyVersion)) throw new Error('Invalid memory policy version');
  return { npcId, policyVersion, observations: [] };
}
