import { describe, expect, it } from 'vitest';
import type { SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import { buildP1NarrativeHints, ensureP1NarrativeHints, P1_NARRATIVE_HINT_TEXT } from './p1-narrative-hints.js';

function makeSave(overrides: Record<string, unknown> = {}, revision = 9): SaveEnvelope {
  return {
    schemaVersion: 2, saveId: 'save', revision, ruleVersion: 'rules', canonVersion: 'canon',
    memoryPolicyVersion: 'memory', memoryMode: 'continue', memoryPolicy: {
      mode: 'continue', policyVersion: 'memory', visibilityVersion: 'visibility',
      decay: { algorithm: 'none', parameters: {} }, cueAccessibilityFloor: 0,
      createdAtRevision: 0, policyHash: `sha256:v1:${'a'.repeat(64)}`,
    },
    state: { playerId: 'player', locationId: 'loc_luhuadu', elapsedMinutes: 0, facts: {
      gameMinute: 300, currentSublocationId: null, npcPresence: ['npc_cenjiu'], stamina: 100,
      staminaDayIndex: 0, spiritStamina: 100, cultivationProgress: 0, fatigueCount: 0,
      inventory: [], collectedSources: [], effectFlags: [], clues: [], observationLog: [],
      npcInteractionLog: [], travelLog: [], injuryFlags: [],
      questState: { status: 'unavailable', rewardClaimed: false },
      knownLocations: ['loc_luhuadu', 'loc_wangqitai'], knownTechniques: [], locationGraph: [],
      idleCount: 0, obstacleState: 'blocked', ferryState: 'aground', ...overrides,
    } },
  } as SaveEnvelope;
}

function makeReceipt(input: { npcId?: string; outcome?: string; beforeIdle?: number; afterIdle?: number } = {}): TurnReceipt {
  return {
    saveId: 'save', idempotencyKey: 'key', requestFingerprint: `sha256:v1:${'b'.repeat(64)}`,
    branchId: 'root', rulesVersion: 'rules', clockMinute: 315, rng: { seed: null, draws: 0 },
    resultingRevision: 9,
    decision: { status: 'accepted', outcome: 'success', nextRevision: 9, events: [{
      id: 'event', saveId: 'save', type: 'talk.occurred', branchId: 'root', beforeRevision: 8,
      afterRevision: 9, occurredAt: '2026-10-05T00:00:00.000Z', source: 'RULES', ruleVersion: 'rules',
      payload: {
        npcId: input.npcId ?? 'npc_cenjiu', topicTag: 'unmatched', outcome: input.outcome ?? 'idle',
        stateDelta: input.beforeIdle === undefined ? { factChanges: [] } : { factChanges: [{
          key: 'idleCount', before: { present: true, value: input.beforeIdle }, after: { present: true, value: input.afterIdle },
        }] },
      },
    }] },
  } as unknown as TurnReceipt;
}

describe('P1 deterministic narrative hints', () => {
  it('shows the low-stamina body cue without exposing a numeric stat', () => {
    expect(buildP1NarrativeHints(makeReceipt(), makeSave({ stamina: 19 })).playerConditionLines)
      .toEqual([P1_NARRATIVE_HINT_TEXT.lowStamina]);
    expect(buildP1NarrativeHints(makeReceipt(), makeSave({ stamina: 20 })).playerConditionLines).toEqual([]);
  });

  it('binds the shoulder question to Cenjiu only when the committed save retains that injury', () => {
    const hints = buildP1NarrativeHints(makeReceipt({ outcome: 'on_topic' }), makeSave({ injuryFlags: ['shoulder_scrape'] }));
    expect(hints.npcUtterances).toEqual([{ npcId: 'npc_cenjiu', line: P1_NARRATIVE_HINT_TEXT.cenjiuShoulderQuestion }]);
    expect(buildP1NarrativeHints(makeReceipt({ npcId: 'npc_shuiyuya' }), makeSave({ injuryFlags: ['shoulder_scrape'] })).npcUtterances).toEqual([]);
  });

  it('fires the idle hook exactly when the committed event increments idleCount from two to three', () => {
    const third = buildP1NarrativeHints(makeReceipt({ beforeIdle: 2, afterIdle: 3 }), makeSave());
    expect(third.npcUtterances).toContainEqual({ npcId: 'npc_cenjiu', line: P1_NARRATIVE_HINT_TEXT.cenjiuThirdIdleHook });
    expect(buildP1NarrativeHints(makeReceipt({ beforeIdle: 3, afterIdle: 4 }), makeSave()).npcUtterances).toEqual([]);
  });

  it('does not use a later save revision to narrate fatigue or injury in an older receipt', () => {
    const receipt = makeReceipt({ outcome: 'on_topic' });
    const laterSave = makeSave({ stamina: 1, injuryFlags: ['shoulder_scrape'] }, 10);
    expect(buildP1NarrativeHints(receipt, laterSave)).toEqual({ playerConditionLines: [], npcUtterances: [] });
  });

  it('enforces the exact authored line once and only for a matching speaker event', () => {
    const receipt = makeReceipt({ outcome: 'on_topic' });
    const context = { npcMemories: [], playerConditionLines: [P1_NARRATIVE_HINT_TEXT.lowStamina],
      npcUtterances: [{ npcId: 'npc_cenjiu', line: P1_NARRATIVE_HINT_TEXT.cenjiuShoulderQuestion }] };
    const text = ensureP1NarrativeHints('船没坏。水浅了。', receipt, context);
    expect(text).toBe(`船没坏。水浅了。\n${P1_NARRATIVE_HINT_TEXT.lowStamina}\n${P1_NARRATIVE_HINT_TEXT.cenjiuShoulderQuestion}`);
    expect(ensureP1NarrativeHints(text, receipt, context)).toBe(text);
    const otherSpeaker = makeReceipt({ npcId: 'npc_shuiyuya', outcome: 'on_topic' });
    expect(ensureP1NarrativeHints('story', otherSpeaker, context)).toBe(`story\n${P1_NARRATIVE_HINT_TEXT.lowStamina}`);
  });
});
