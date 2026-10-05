import { describe, expect, it } from 'vitest';
import { createNpcMemory } from './policy.js';
import { retrieveNpcMemories } from './retrieve.js';

const observations = Array.from({ length: 81 }, (_, index) => ({
  npcId: 'npc_cenjiu',
  eventId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  eventRevision: index + 1,
  observedAtMinute: 300 + index * 15,
  channel: 'witnessed' as const,
  summary: index === 0 ? '玩家与你交谈。' : `后来发生的第${index}次亲历事件。`,
}));

describe('versioned Continue and Forgetting retrieval', () => {
  it('keeps Continue recall independent of game-time age', () => {
    const memory = { ...createNpcMemory('npc_cenjiu', 'continue-v1'), observations };
    expect(retrieveNpcMemories(memory, { nowMinute: 100_000, query: '玩家与你交谈', limit: 10, minAccessibility: 0.99 }))
      .toMatchObject([{ accessibility: 1, observation: observations[0] }]);
  });

  it('decays by game time and NPC-observed event count while allowing a cue to wake a retained observation', () => {
    const memory = { ...createNpcMemory('npc_cenjiu', 'forgetting-v1'), observations };
    expect(retrieveNpcMemories(memory, { nowMinute: 100_000, query: '', limit: 100, minAccessibility: 0.35 }))
      .toHaveLength(0);
    expect(retrieveNpcMemories(memory, { nowMinute: 100_000, query: '玩家与你交谈', limit: 10, minAccessibility: 0.3 }))
      .toMatchObject([{ accessibility: 0.35, observation: observations[0] }]);
    expect(memory.observations).toHaveLength(81);
  });

  it('does not depend on real time or mutate the stored memory', () => {
    const memory = { ...createNpcMemory('npc_cenjiu', 'forgetting-v1'), observations };
    const first = retrieveNpcMemories(memory, { nowMinute: 1500, query: '玩家与你交谈', limit: 10, minAccessibility: 0 });
    const second = retrieveNpcMemories(memory, { nowMinute: 1500, query: '玩家与你交谈', limit: 10, minAccessibility: 0 });
    expect(first).toEqual(second);
    expect(memory.observations[0]).toEqual(observations[0]);
  });

  it('counts later NPC-authorized events committed within the same turn revision', () => {
    const sameTurn = observations.slice(0, 3).map(observation => ({
      ...observation,
      eventRevision: 7,
      observedAtMinute: 405,
    }));
    const memory = { ...createNpcMemory('npc_cenjiu', 'forgetting-v1'), observations: sameTurn };
    const recalls = retrieveNpcMemories(memory, { nowMinute: 405, query: '', limit: 10, minAccessibility: 0 });
    const first = recalls.find(({ observation }) => observation.eventId === sameTurn[0]?.eventId);
    const last = recalls.find(({ observation }) => observation.eventId === sameTurn[2]?.eventId);
    expect(first?.accessibility).toBeCloseTo(0.5 ** (2 / 16));
    expect(last?.accessibility).toBe(1);
  });
});
