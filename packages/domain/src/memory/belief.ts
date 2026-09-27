import type { DomainEvent } from '@jiuxiao/contracts';
import { assertNpcMemory, type NpcMemory, type NpcObservation, type ObservationGrant } from './policy.js';

/**
 * Records an explicitly granted observation. The caller must prove visibility
 * before creating the grant; this function cannot infer it from event payload.
 */
export function rememberObservedEvent(
  memory: NpcMemory,
  event: DomainEvent,
  grant: ObservationGrant | undefined,
  observedAtMinute: number,
): NpcMemory {
  assertNpcMemory(memory);
  if (!grant || typeof grant !== 'object' || grant.npcId !== memory.npcId || grant.eventId !== event.id) {
    throw new Error('Observation grant does not match event and NPC');
  }
  if ((grant.channel !== 'witnessed' && grant.channel !== 'reported')
    || typeof grant.visibleSummary !== 'string' || !grant.visibleSummary.trim()
    || !Number.isSafeInteger(observedAtMinute) || observedAtMinute < 0
    || !event || typeof event.id !== 'string' || !event.id.trim()
    || !Number.isSafeInteger(event.afterRevision) || event.afterRevision < 1) {
    throw new Error('Invalid visible observation');
  }
  const observation: NpcObservation = {
    npcId: memory.npcId,
    eventId: event.id,
    eventRevision: event.afterRevision,
    observedAtMinute,
    channel: grant.channel,
    summary: grant.visibleSummary,
  };
  const prior = memory.observations.find(item => item.eventId === event.id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(observation)) throw new Error('Conflicting observation for the same event');
    return memory;
  }
  return { ...memory, observations: [...memory.observations, observation] };
}
