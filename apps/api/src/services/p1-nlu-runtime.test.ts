import { describe, expect, it, vi } from 'vitest';
import type { ActionIntent, Decision, SaveEnvelope } from '@jiuxiao/contracts';
import { PROLOGUE_V1_ACTION_TEMPLATES } from '../../../../packages/domain/src/nlu/prologue-v1-nlu-fixtures.js';
import { createP1NluRuntime, type P1NluDependencies } from './p1-nlu-runtime.js';

const dependencies: P1NluDependencies = {
  rulebook: {
    locationIds: ['loc_luhuadu', 'loc_wangqitai', 'loc_zheguiping'],
    sublocations: [{ id: 'subloc_ferry_berm', locationId: 'loc_luhuadu' }],
    npcPresenceIds: ['npc_cenjiu', 'npc_shuiyuya'],
    npcs: [
      { npcId: 'npc_cenjiu', locationId: 'loc_luhuadu', topics: [{}] },
      { npcId: 'npc_shuiyuya', locationId: 'loc_luhuadu', topics: [] },
    ],
    observations: [
      { targetId: 'obj_ferry', locationId: 'loc_luhuadu' },
      { targetId: 'obj_ferry_gear', locationId: 'loc_luhuadu' },
      { targetId: 'obstacle_rockslide', locationId: 'loc_wangqitai' },
    ],
    combatTargets: [{ targetId: 'npc_shuiyuya', locationId: 'loc_luhuadu', accessibleFromSublocationIds: ['subloc_ferry_berm'] }],
    itemUses: [{ itemId: 'item_bishuifu', targetIds: ['subloc_ferry_berm'] }],
  },
  contentPack: { entries: [
    { id: 'loc_luhuadu', kind: 'location', content: { name: '芦花渡' } },
    { id: 'loc_wangqitai', kind: 'location', content: { name: '望气台' } },
    { id: 'loc_zheguiping', kind: 'location', content: { name: '折桂坪' } },
    { id: 'subloc_ferry_berm', kind: 'sublocation', content: { name: '渡口作业位' } },
    { id: 'npc_cenjiu', kind: 'npc', content: { name: '岑九' } },
    { id: 'npc_shuiyuya', kind: 'combatTarget', content: { name: '灰羽鸦' } },
    { id: 'obj_ferry', kind: 'object', content: { name: '渡船' } },
    { id: 'item_bishuifu', kind: 'item', content: { name: '避水符' } },
  ] },
  templates: PROLOGUE_V1_ACTION_TEMPLATES,
};

function makeSave(overrides: Record<string, unknown> = {}): SaveEnvelope {
  return {
    schemaVersion: 1,
    saveId: 'save-nlu-test',
    revision: 4,
    ruleVersion: 'candidate-v1',
    canonVersion: 'candidate-canon-v1',
    memoryPolicyVersion: 'memory-v1',
    state: {
      playerId: 'player-nlu-test',
      locationId: 'loc_luhuadu',
      elapsedMinutes: 0,
      facts: {
        gameMinute: 300,
        currentSublocationId: null,
        npcPresence: ['npc_cenjiu', 'npc_shuiyuya'],
        stamina: 100,
        staminaDayIndex: 0,
        spiritStamina: 100,
        cultivationProgress: 0,
        fatigueCount: 0,
        inventory: [{ itemId: 'item_bishuifu', quantity: 1 }],
        collectedSources: [],
        effectFlags: [],
        clues: [],
        observationLog: [],
        npcInteractionLog: [],
        travelLog: [],
        injuryFlags: [],
        questState: { status: 'unavailable', rewardClaimed: false },
        knownLocations: ['loc_luhuadu', 'loc_wangqitai'],
        creationRequestHash: 'non-gameplay-idempotency-metadata',
        knownTechniques: [],
        locationGraph: [],
        idleCount: 0,
        obstacleState: 'blocked',
        ferryState: 'aground',
        ...overrides,
      },
    },
  };
}

const freeText = (text: string): Extract<ActionIntent, { kind: 'free_text' }> => ({
  kind: 'free_text', saveId: 'save-nlu-test', actorId: 'player-nlu-test', branchId: 'root',
  expectedRevision: 4, idempotencyKey: '11111111-1111-4111-8111-111111111111', payload: { text },
});

describe('P1 review-only natural-language runtime', () => {
  it('builds state-scoped suggestions from known places, present talk targets, visible observations, and owned items', () => {
    const runtime = createP1NluRuntime(dependencies);
    const rows = runtime.actionSuggestions(makeSave());
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'move', text: '去望气台' }),
      expect.objectContaining({ kind: 'move', text: '去渡口作业位' }),
      expect.objectContaining({ kind: 'observe', text: '观察渡船' }),
      expect.objectContaining({ kind: 'observe', text: '细察舟具' }),
      expect.objectContaining({ kind: 'talk', text: '对岑九说：' }),
    ]));
    expect(rows.some(row => row.text.includes('折桂坪'))).toBe(false);
    expect(rows.some(row => row.text.includes('灰羽鸦'))).toBe(false);
    expect(rows.some(row => row.kind === 'use_item')).toBe(false);
  });

  it('suggests and parses an item use only for an owned item and the current authorized target', () => {
    const runtime = createP1NluRuntime(dependencies);
    const atBerm = makeSave({ currentSublocationId: 'subloc_ferry_berm' });
    expect(runtime.actionSuggestions(atBerm)).toContainEqual({
      id: 'use_item:item_bishuifu:subloc_ferry_berm', kind: 'use_item',
      label: '使用避水符（渡口作业位）', text: '使用避水符在渡口作业位',
    });
    const decide = vi.fn((_intent: ActionIntent, _save: SaveEnvelope) => ({
      status: 'rejected', code: 'ENV_PAYLOAD_INVALID', message: 'fixture', revision: 4,
    } as Decision));
    runtime.resolveFreeText(freeText('使用避水符在渡口作业位'), atBerm, decide);
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'use_item', payload: { itemId: 'item_bishuifu', targetId: 'subloc_ferry_berm' },
    }), expect.any(Object));
  });

  it('offers combat only after the named clue and from an allowed sublocation', () => {
    const runtime = createP1NluRuntime(dependencies);
    const unavailable = runtime.actionSuggestions(makeSave({ clues: ['clue_crow_nest'] }));
    expect(unavailable.some(row => row.kind === 'combat')).toBe(false);
    const available = runtime.actionSuggestions(makeSave({ clues: ['clue_crow_nest'], currentSublocationId: 'subloc_ferry_berm' }));
    expect(available).toContainEqual({ id: 'combat:npc_shuiyuya', kind: 'combat', label: '赶走灰羽鸦', text: '赶走灰羽鸦' });
  });

  it('routes an accepted move phrase through the same rule decision callback', () => {
    const runtime = createP1NluRuntime(dependencies);
    const decide = vi.fn((_intent: ActionIntent, _save: SaveEnvelope) => ({
      status: 'rejected', code: 'ENV_PAYLOAD_INVALID', message: 'fixture', revision: 4,
    } as Decision));
    const result = runtime.resolveFreeText(freeText('去望气台'), makeSave(), decide);
    expect(result.status).toBe('rejected');
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ kind: 'move', payload: { destinationId: 'loc_wangqitai' } }), expect.any(Object));
  });

  it('maps the clue-unlocked combat phrase to an existing rule intent without inventing a result', () => {
    const runtime = createP1NluRuntime(dependencies);
    const decide = vi.fn((_intent: ActionIntent, _save: SaveEnvelope) => ({
      status: 'rejected', code: 'ENV_PAYLOAD_INVALID', message: 'fixture', revision: 4,
    } as Decision));
    runtime.resolveFreeText(freeText('驱退灰羽鸦'), makeSave({ currentSublocationId: 'subloc_ferry_berm' }), decide);
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ kind: 'combat', payload: { targetId: 'npc_shuiyuya' } }), expect.any(Object));
  });

  it('stores a generic clarification for unsupported language without echoing the utterance', () => {
    const runtime = createP1NluRuntime(dependencies);
    const decide = vi.fn();
    const text = '去那边';
    const result = runtime.resolveFreeText(freeText(text), makeSave(), decide);
    expect(decide).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'clarify', interactionId: freeText(text).idempotencyKey, revision: 4 });
    expect(JSON.stringify(result)).not.toContain(text);
  });
});
