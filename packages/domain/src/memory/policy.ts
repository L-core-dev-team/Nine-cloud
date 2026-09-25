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

export function createNpcMemory(npcId: string, policyVersion: MemoryPolicyVersion): NpcMemory {
  if (!npcId.trim()) throw new Error('NPC ID is required');
  return { npcId, policyVersion, observations: [] };
}
