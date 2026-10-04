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
  authorizationPolicyVersion: string;
  /** Exact field allowlist represented by authorizedFacts; raw event payloads are forbidden. */
  authorizedFields: readonly string[];
  authorizedFacts: Readonly<Record<string, unknown>>;
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

/** Validate frozen authorized facts without accepting undefined or executable values. */
export function validAuthorizedFacts(
  fields: readonly string[],
  facts: Readonly<Record<string, unknown>>,
  summary: string,
): boolean {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 200 || !facts || typeof facts !== 'object' || Array.isArray(facts)
    || (Object.getPrototypeOf(facts) !== Object.prototype && Object.getPrototypeOf(facts) !== null)) return false;
  const keys = Object.keys(facts).sort();
  const allowed = [...fields].sort();
  if (new Set(fields).size !== fields.length || keys.length !== allowed.length
    || keys.some((key, index) => key !== allowed[index])
    || !fields.every(field => /^[a-z][a-zA-Z0-9_.-]{0,99}$/.test(field) && !['__proto__', 'prototype', 'constructor'].includes(field))
    || facts.summary !== summary || !isJsonValue(facts, 0)) return false;
  try {
    const encoded = JSON.stringify(facts);
    return typeof encoded === 'string' && new TextEncoder().encode(encoded).byteLength <= 16_000
      && JSON.stringify(JSON.parse(encoded)) === encoded;
  } catch {
    return false;
  }
}

function isJsonValue(value: unknown, depth: number): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 200 && value.every(item => isJsonValue(item, depth + 1));
  if (!value || typeof value !== 'object'
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const entries = Object.entries(value);
  return entries.length <= 200 && entries.every(([key, item]) =>
    !['__proto__', 'prototype', 'constructor'].includes(key) && isJsonValue(item, depth + 1));
}

export function createNpcMemory(npcId: string, policyVersion: MemoryPolicyVersion): NpcMemory {
  if (typeof npcId !== 'string' || !npcId.trim()) throw new Error('NPC ID is required');
  if (!POLICY_VERSIONS.has(policyVersion)) throw new Error('Invalid memory policy version');
  return { npcId, policyVersion, observations: [] };
}
