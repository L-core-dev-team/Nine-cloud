import { DomainEventSchema, type DomainEvent } from '@jiuxiao/contracts';
import { rememberObservedEvent } from './belief.js';
import { assertNpcMemory, createNpcMemory, type MemoryPolicyVersion, type NpcMemory, type ObservationGrant } from './policy.js';

export type NpcMemoryTurnMarker = {
  fromRevision: number;
  toRevision: number;
  eventIds: readonly string[];
};

export type NpcMemoryJournal = {
  schemaVersion: 1;
  saveId: string;
  revision: number;
  memories: readonly NpcMemory[];
  lastTurn: NpcMemoryTurnMarker | null;
};

export type NpcMemoryTurnPreparation =
  | { status: 'prepared'; journal: NpcMemoryJournal; recordedObservations: number }
  | { status: 'duplicate'; journal: NpcMemoryJournal; recordedObservations: 0 };

export type PrepareNpcMemoryTurnOptions = {
  journal: NpcMemoryJournal;
  saveId: string;
  beforeRevision: number;
  afterRevision: number;
  events: readonly DomainEvent[];
  observedAtMinute: number;
  /**
   * Return grants only after applying NPC-specific visibility and disclosure
   * rules. Never copy an event payload into visibleSummary without filtering it.
   */
  grantsForEvent: (event: DomainEvent) => readonly ObservationGrant[];
  policyForNpc: (npcId: string) => MemoryPolicyVersion;
};

const MAX_EVENTS_PER_TURN = 1000;
const MAX_VISIBLE_SUMMARY_LENGTH = 4000;
const MAX_JOURNAL_BYTES = 64_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Creates a per-save journal at the same revision as its authoritative snapshot.
 * The caller must persist the journal with the turn snapshot in one transaction.
 */
export function createNpcMemoryJournal(saveId: string, revision: number): NpcMemoryJournal {
  if (typeof saveId !== 'string' || !saveId.trim()) throw new Error('Save ID is required');
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid NPC memory journal revision');
  return { schemaVersion: 1, saveId, revision, memories: [], lastTurn: null };
}

/** Reject unknown fields as well as malformed values at JSON persistence boundaries. */
export function assertNpcMemoryJournal(value: unknown): asserts value is NpcMemoryJournal {
  assertRecord(value, 'Invalid NPC memory journal');
  assertExactKeys(value, ['schemaVersion', 'saveId', 'revision', 'memories', 'lastTurn'], 'Invalid NPC memory journal');
  if (value.schemaVersion !== 1 || typeof value.saveId !== 'string' || !value.saveId.trim()
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || !Array.isArray(value.memories)) {
    throw new Error('Invalid NPC memory journal');
  }

  const npcIds = new Set<string>();
  for (const rawMemory of value.memories) {
    assertRecord(rawMemory, 'Invalid NPC memory');
    assertExactKeys(rawMemory, ['npcId', 'policyVersion', 'observations'], 'Invalid NPC memory');
    if (!Array.isArray(rawMemory.observations)) throw new Error('Invalid NPC memory');
    for (const rawObservation of rawMemory.observations) {
      assertRecord(rawObservation, 'Invalid NPC memory observation');
      assertExactKeys(rawObservation,
        ['npcId', 'eventId', 'eventRevision', 'observedAtMinute', 'channel', 'summary'],
        'Invalid NPC memory observation');
      if (typeof rawObservation.eventId !== 'string' || !UUID_PATTERN.test(rawObservation.eventId)) {
        throw new Error('Invalid NPC memory observation event ID');
      }
    }
    const memory = rawMemory as unknown as NpcMemory;
    assertNpcMemory(memory);
    if (npcIds.has(memory.npcId)) throw new Error('Duplicate NPC memory owner');
    npcIds.add(memory.npcId);
  }

  if (value.lastTurn !== null) {
    assertRecord(value.lastTurn, 'Invalid NPC memory turn marker');
    assertExactKeys(value.lastTurn, ['fromRevision', 'toRevision', 'eventIds'], 'Invalid NPC memory turn marker');
    const marker = value.lastTurn;
    if (!Number.isSafeInteger(marker.fromRevision) || (marker.fromRevision as number) < 0
      || !Number.isSafeInteger(marker.toRevision) || marker.toRevision !== (marker.fromRevision as number) + 1
      || marker.toRevision !== value.revision || !Array.isArray(marker.eventIds)
      || marker.eventIds.length < 1 || marker.eventIds.length > MAX_EVENTS_PER_TURN) {
      throw new Error('Invalid NPC memory turn marker');
    }
    const eventIds = new Set<string>();
    for (const eventId of marker.eventIds) {
      if (typeof eventId !== 'string' || !UUID_PATTERN.test(eventId) || eventIds.has(eventId)) {
        throw new Error('Invalid NPC memory turn marker event IDs');
      }
      eventIds.add(eventId);
    }
  }
}

export function parseNpcMemoryJournalJson(json: string): NpcMemoryJournal {
  if (typeof json !== 'string') throw new Error('Invalid NPC memory journal JSON');
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error('Invalid NPC memory journal JSON');
  }
  assertNpcMemoryJournal(value);
  return value;
}

export function serializeNpcMemoryJournal(journal: NpcMemoryJournal): string {
  assertNpcMemoryJournal(journal);
  const normalized: NpcMemoryJournal = {
    schemaVersion: 1,
    saveId: journal.saveId,
    revision: journal.revision,
    memories: [...journal.memories].sort((left, right) => left.npcId < right.npcId ? -1 : left.npcId > right.npcId ? 1 : 0),
    lastTurn: journal.lastTurn ? {
      fromRevision: journal.lastTurn.fromRevision,
      toRevision: journal.lastTurn.toRevision,
      eventIds: [...journal.lastTurn.eventIds],
    } : null,
  };
  const json = JSON.stringify(normalized);
  if (new TextEncoder().encode(json).byteLength > MAX_JOURNAL_BYTES) throw new Error('NPC memory journal exceeds storage limit');
  return json;
}

/**
 * Prepares the NPC-visible memory projection for one already-decided rules turn.
 * This function is pure with respect to its input journal. Persist its returned
 * journal atomically with the accepted snapshot and turn receipt.
 */
export function prepareNpcMemoryTurn(input: PrepareNpcMemoryTurnOptions): NpcMemoryTurnPreparation {
  if (!input || typeof input !== 'object') throw new Error('Invalid NPC memory turn input');
  assertNpcMemoryJournal(input.journal);
  if (typeof input.saveId !== 'string' || input.saveId !== input.journal.saveId) {
    throw new Error('NPC memory save ID mismatch');
  }
  if (!Number.isSafeInteger(input.beforeRevision) || input.beforeRevision < 0
    || !Number.isSafeInteger(input.afterRevision) || input.afterRevision !== input.beforeRevision + 1
    || !Number.isSafeInteger(input.observedAtMinute) || input.observedAtMinute < 0
    || !Array.isArray(input.events) || input.events.length < 1 || input.events.length > MAX_EVENTS_PER_TURN
    || typeof input.grantsForEvent !== 'function' || typeof input.policyForNpc !== 'function') {
    throw new Error('Invalid NPC memory turn input');
  }

  const events = input.events.map(event => DomainEventSchema.parse(event));
  const first = events[0];
  if (!first) throw new Error('An accepted turn must contain events');
  const seenEventIds = new Set<string>();
  for (const event of events) {
    if (seenEventIds.has(event.id)) throw new Error('Duplicate event ID in NPC memory turn');
    seenEventIds.add(event.id);
    if (event.saveId !== input.saveId || event.beforeRevision !== input.beforeRevision
      || event.afterRevision !== input.afterRevision || event.source !== 'RULES'
      || event.ruleVersion !== first.ruleVersion) {
      throw new Error('NPC memory events do not match the committed rules turn');
    }
  }

  const marker: NpcMemoryTurnMarker = {
    fromRevision: input.beforeRevision,
    toRevision: input.afterRevision,
    eventIds: events.map(event => event.id),
  };
  if (input.journal.revision === input.afterRevision && sameTurn(input.journal.lastTurn, marker)) {
    return { status: 'duplicate', journal: input.journal, recordedObservations: 0 };
  }
  if (input.journal.revision !== input.beforeRevision) {
    throw new Error('NPC memory journal revision mismatch');
  }

  const memories = new Map<string, NpcMemory>();
  for (const memory of input.journal.memories) memories.set(memory.npcId, memory);
  let recordedObservations = 0;
  for (const event of events) {
    const grants = input.grantsForEvent(event);
    if (!Array.isArray(grants)) throw new Error('NPC visibility grants must be an array');
    const seenNpcIds = new Set<string>();
    for (const grant of grants) {
      assertObservationGrantShape(grant);
      if (seenNpcIds.has(grant.npcId)) throw new Error('Duplicate NPC observation grant for an event');
      seenNpcIds.add(grant.npcId);
      let memory = memories.get(grant.npcId);
      if (!memory) {
        memory = createNpcMemory(grant.npcId, input.policyForNpc(grant.npcId));
      } else if (memory.policyVersion !== input.policyForNpc(grant.npcId)) {
        throw new Error('NPC memory policy change requires an explicit migration');
      }
      const alreadyObserved = memory.observations.some(item => item.eventId === event.id);
      const nextMemory = rememberObservedEvent(memory, event, grant, input.observedAtMinute);
      assertNpcMemory(nextMemory);
      if (!alreadyObserved) recordedObservations += 1;
      memories.set(grant.npcId, nextMemory);
    }
  }

  const journal: NpcMemoryJournal = {
    schemaVersion: 1,
    saveId: input.saveId,
    revision: input.afterRevision,
    memories: [...memories.values()].sort((left, right) => left.npcId < right.npcId ? -1 : left.npcId > right.npcId ? 1 : 0),
    lastTurn: marker,
  };
  const bounded = trimJournal(journal);
  assertNpcMemoryJournal(bounded);
  return { status: 'prepared', journal: bounded, recordedObservations };
}

function trimJournal(journal: NpcMemoryJournal): NpcMemoryJournal {
  const working = journal.memories.map(memory => ({ ...memory, observations: [...memory.observations] }));
  const oldest = working.flatMap(memory => memory.observations.map(observation => ({ memory, observation })))
    .sort((a, b) => a.observation.observedAtMinute - b.observation.observedAtMinute
      || a.observation.eventRevision - b.observation.eventRevision
      || (a.observation.eventId < b.observation.eventId ? -1 : a.observation.eventId > b.observation.eventId ? 1 : 0));
  let candidate: NpcMemoryJournal = { ...journal, memories: working };
  let bytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
  for (const [index, item] of oldest.entries()) {
    if (bytes <= MAX_JOURNAL_BYTES) return candidate;
    item.memory.observations.splice(item.memory.observations.indexOf(item.observation), 1);
    candidate = { ...journal, memories: working.filter(memory => memory.observations.length > 0) };
    if (index % 8 === 7 || index === oldest.length - 1) bytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
  }
  if (bytes > MAX_JOURNAL_BYTES) throw new Error('NPC memory journal exceeds storage limit');
  return candidate;
}

function sameTurn(left: NpcMemoryTurnMarker | null, right: NpcMemoryTurnMarker): boolean {
  return left !== null && left.fromRevision === right.fromRevision && left.toRevision === right.toRevision
    && left.eventIds.length === right.eventIds.length
    && left.eventIds.every((eventId, index) => eventId === right.eventIds[index]);
}

function assertObservationGrantShape(value: unknown): asserts value is ObservationGrant {
  assertRecord(value, 'Invalid NPC visibility grant');
  assertExactKeys(value, ['npcId', 'eventId', 'channel', 'visibleSummary'], 'Invalid NPC visibility grant');
  if (typeof value.npcId !== 'string' || !value.npcId.trim()
    || typeof value.eventId !== 'string' || !UUID_PATTERN.test(value.eventId)
    || (value.channel !== 'witnessed' && value.channel !== 'reported')
    || typeof value.visibleSummary !== 'string' || !value.visibleSummary.trim()
    || value.visibleSummary.length > MAX_VISIBLE_SUMMARY_LENGTH) {
    throw new Error('Invalid NPC visibility grant');
  }
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], message: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    throw new Error(message);
  }
}
