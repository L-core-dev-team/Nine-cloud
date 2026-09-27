import { describe, expect, it } from 'vitest';
import type { DomainEvent, WorldState } from '@jiuxiao/contracts';
import { rememberObservedEvent } from './belief.js';
import { createNpcMemory } from './policy.js';
import { retrieveNpcMemories } from './retrieve.js';

const event: DomainEvent = {
  id: 'b7a749f2-f374-4436-bd92-444a33c35a08', saveId: 'save-1', type: 'fixture.observed',
  beforeRevision: 0, afterRevision: 1, occurredAt: '2026-09-25T00:00:00.000Z',
  source: 'RULES', ruleVersion: 'fixture-v1', payload: { ownerId: 'player-1', privateText: 'not for NPC' },
};

describe('NPC memory projection boundary', () => {
  it('requires an explicit matching observation grant and exposes only its visible summary', () => {
    const memory = createNpcMemory('npc-1', 'exact-recall-v1');
    expect(() => rememberObservedEvent(memory, event, undefined, 0)).toThrow('Observation grant');
    expect(() => rememberObservedEvent(memory, event, { npcId: 'npc-2', eventId: event.id, channel: 'witnessed', visibleSummary: '看见来客' }, 0)).toThrow('Observation grant');
    const grant = { npcId: 'npc-1', eventId: event.id, channel: 'witnessed' as const, visibleSummary: '看见来客' };
    const next = rememberObservedEvent(memory, event, grant, 0);
    expect(next.observations).toHaveLength(1);
    expect(JSON.stringify(next)).not.toContain('not for NPC');
    expect(rememberObservedEvent(next, event, grant, 0)).toBe(next);
    expect(() => rememberObservedEvent(next, event, { ...grant, visibleSummary: '另一版本' }, 0)).toThrow('Conflicting observation');
    expect(memory.observations).toHaveLength(0);
  });

  it('rejects malformed persisted memories and invalid creation policies', () => {
    expect(() => createNpcMemory('npc-1', 'unknown-policy' as never)).toThrow('policy version');
    const malformed = createNpcMemory('npc-1', 'exact-recall-v1');
    malformed.observations = [{
      npcId: 'npc-1', eventId: event.id, eventRevision: 1, observedAtMinute: -1,
      channel: 'witnessed', summary: '看见来客',
    }];
    expect(() => retrieveNpcMemories(malformed, { nowMinute: 0, query: '', limit: 5, minAccessibility: 0 }))
      .toThrow('Invalid NPC memory observation');
    expect(() => retrieveNpcMemories(createNpcMemory('npc-1', 'exact-recall-v1'), {
      nowMinute: 0, query: null as never, limit: 5, minAccessibility: 0,
    })).toThrow('Invalid recall parameters');
  });

  it('rejects malformed observation grants before storing any NPC-visible summary', () => {
    const memory = createNpcMemory('npc-1', 'exact-recall-v1');
    const grant = { npcId: 'npc-1', eventId: event.id, channel: 'unknown', visibleSummary: '看见来客' };
    expect(() => rememberObservedEvent(memory, event, grant as never, 0)).toThrow('Invalid visible observation');
    expect(memory.observations).toHaveLength(0);
  });

  it('can fail to recall an old belief without changing the authoritative event or world state', () => {
    const state: WorldState = { playerId: 'player-1', locationId: 'gate', elapsedMinutes: 0, facts: { alive: false, itemOwner: 'player-1' } };
    const grant = { npcId: 'npc-1', eventId: event.id, channel: 'reported' as const, visibleSummary: '来客带着旧物' };
    const exact = rememberObservedEvent(createNpcMemory('npc-1', 'exact-recall-v1'), event, grant, 0);
    const accessibility = rememberObservedEvent(createNpcMemory('npc-1', 'accessibility-v1'), event, grant, 0);
    const options = { nowMinute: 14400, query: '旧物', limit: 4, minAccessibility: 0.5 };
    expect(retrieveNpcMemories(exact, options)).toHaveLength(1);
    expect(retrieveNpcMemories(accessibility, options)).toHaveLength(0);
    expect(accessibility.observations).toHaveLength(1);
    expect(state.facts).toEqual({ alive: false, itemOwner: 'player-1' });
    expect(event.payload).toEqual({ ownerId: 'player-1', privateText: 'not for NPC' });
  });
});
