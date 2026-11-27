/**
 * P1 freeze (ADR 0010): `prologue-v1` is a frozen rule version. Shared
 * contracts and the turn pipeline may evolve, but every journey below must keep
 * producing exactly the same decisions, events and saves. A change here means
 * the frozen rules changed: put it in a new rule version instead.
 *
 * The golden file is written only by an explicit, local
 * `P1_GOLDEN_WRITE=1 pnpm --filter @jiuxiao/domain test` run; CI never writes it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ActionIntentSchema,
  type ActionIntent,
  type PrologueV1Facts,
  type SaveEnvelope,
} from '@jiuxiao/contracts';
import { PROLOGUE_V1_RULEBOOK_CANDIDATE } from '../../content/src/prologue/prologue-v1.rulebook-candidate.js';
import { PROLOGUE_V1, PROLOGUE_V1_ERROR_MESSAGES } from '../../content/src/rules/prologue-v1.constants.js';
import { canonicalJson } from './state-delta.js';
import { evaluate } from './rules.js';
import { createPrologueV1EventReducer, createPrologueV1RuleModule } from './prologue-v1-rules.js';
import { replayEvents } from './event-log.js';

const goldenPath = fileURLToPath(new URL('./__golden__/prologue-v1-replay.json', import.meta.url));
const dependencies = { rulebook: PROLOGUE_V1_RULEBOOK_CANDIDATE, mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES };
const ruleModule = createPrologueV1RuleModule(dependencies);
const reducer = createPrologueV1EventReducer(dependencies);
const eventIds = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);

const initialFacts: PrologueV1Facts = {
  gameMinute: 300,
  currentSublocationId: null,
  npcPresence: ['npc_cenjiu', 'npc_shuiyuya'],
  stamina: 100,
  staminaDayIndex: 0,
  spiritStamina: 100,
  cultivationProgress: 0,
  fatigueCount: 0,
  inventory: [],
  collectedSources: [],
  effectFlags: [],
  clues: [],
  observationLog: [],
  npcInteractionLog: [],
  travelLog: [],
  injuryFlags: [],
  questState: { status: 'unavailable', rewardClaimed: false },
  knownLocations: ['loc_luhuadu', 'loc_wangqitai'],
  knownTechniques: ['tech_breath_basic'],
  locationGraph: structuredClone(PROLOGUE_V1_RULEBOOK_CANDIDATE.initialLocationGraph),
  idleCount: 0,
  obstacleState: 'blocked',
  ferryState: 'aground',
};

function start(overrides: Partial<PrologueV1Facts> = {}, locationId = 'loc_luhuadu'): SaveEnvelope {
  return {
    schemaVersion: 1,
    saveId: 'p1-frozen-replay',
    canonVersion: PROLOGUE_V1_RULEBOOK_CANDIDATE.canonVersion,
    ruleVersion: PROLOGUE_V1_RULEBOOK_CANDIDATE.ruleVersion,
    memoryPolicyVersion: 'continue-v1',
    revision: 0,
    state: {
      playerId: 'p1-frozen-player',
      locationId,
      elapsedMinutes: 0,
      facts: { ...structuredClone(initialFacts), ...structuredClone(overrides) },
    },
  };
}

type Step = readonly [ActionIntent['kind'], Record<string, unknown>];

/** Runs a journey and returns the full trace: every decision and every save. */
function run(name: string, initial: SaveEnvelope, steps: readonly Step[]) {
  let save = initial;
  const trace: unknown[] = [];
  steps.forEach(([kind, payload], index) => {
    const intent = ActionIntentSchema.parse({
      saveId: save.saveId,
      actorId: save.state.playerId,
      expectedRevision: save.revision,
      idempotencyKey: `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`,
      branchId: 'root',
      kind,
      payload,
    }) as ActionIntent;
    const decision = evaluate(intent, save, { occurredAt: '2026-10-05T00:00:00.000Z', eventIds, module: ruleModule });
    if (decision.status === 'accepted') save = replayEvents(save, decision.events, reducer);
    trace.push({ step: index + 1, kind, payload, decision, save });
  });
  const canonical = canonicalJson({ name, trace });
  return {
    sha256: createHash('sha256').update(canonical).digest('hex'),
    steps: steps.length,
    finalRevision: save.revision,
    finalLocation: save.state.locationId,
    finalFacts: save.state.facts,
  };
}

const ward = [{ itemId: 'item_bishuifu', quantity: 1 }];
const journeys = {
  // The real opening chain: move, scan, study, blocked return, bypass, talk, cultivate, claim.
  openingPath: () => run('openingPath', start(), [
    ['move', { destinationId: 'loc_wangqitai' }],
    ['observe', { targetId: 'obstacle_rockslide', method: 'scan' }],
    ['observe', { targetId: 'obstacle_rockslide', method: 'study' }],
    ['move', { destinationId: 'loc_luhuadu' }],
    ['talk', { npcId: 'npc_cenjiu', utterance: '这石头怎么办' }],
    ['cultivate', { techniqueId: 'tech_breath_basic', minutes: 2 }],
    ['quest', { questId: 'quest_first_clearance', choiceId: 'claim_reward' }],
  ]),
  ferryClues: () => run('ferryClues', start(), [
    ['observe', { targetId: 'obj_ferry', method: 'scan' }],
    ['observe', { targetId: 'obj_ferry', method: 'study' }],
    ['observe', { targetId: 'obj_ferry_gear', method: 'study' }],
    ['acquire_item', { itemId: 'item_bishuifu', quantity: 1 }],
    ['acquire_item', { itemId: 'item_bishuifu', quantity: 1 }],
    ['move', { destinationId: 'loc_unlisted' }],
    ['cultivate', { techniqueId: 'tech_breath_basic', minutes: 9 }],
  ]),
  wardAndCombat: () => run('wardAndCombat', start({ inventory: ward, currentSublocationId: 'subloc_ferry_berm' }), [
    ['use_item', { itemId: 'item_bishuifu', targetId: 'loc_wangqitai' }],
    ['use_item', { itemId: 'item_bishuifu', targetId: 'subloc_ferry_berm' }],
    ['combat', { targetId: 'npc_shuiyuya' }],
    ['quest', { questId: 'quest_first_clearance', choiceId: 'claim_reward' }],
  ]),
  duskAtReef: () => run('duskAtReef', start({ gameMinute: 1020, currentSublocationId: 'subloc_reef_ledge' }, 'loc_wangqitai'), [
    ['observe', { targetId: 'obstacle_rockslide', method: 'study' }],
    ['combat', { targetId: 'npc_shuiyuya' }],
  ]),
  woundedAndRetreat: () => run('woundedAndRetreat', start({ spiritStamina: 0, currentSublocationId: 'subloc_ferry_berm' }), [
    ['combat', { targetId: 'npc_shuiyuya' }],
    ['talk', { npcId: 'npc_cenjiu', utterance: '有别的路吗' }],
    ['cultivate', { techniqueId: 'tech_unknown', minutes: 1 }],
  ]),
  reefWithoutWard: () => run('reefWithoutWard', start({ currentSublocationId: 'subloc_reef_ledge' }, 'loc_wangqitai'), [
    ['combat', { targetId: 'npc_shuiyuya' }],
  ]),
} as const;

describe('prologue-v1 frozen replay (ADR 0010)', () => {
  const actual = Object.fromEntries(Object.entries(journeys).map(([name, journey]) => [name, journey()]));

  if (process.env.P1_GOLDEN_WRITE === '1') {
    writeFileSync(goldenPath, `${JSON.stringify({
      format: 'jiuxiao-p1-frozen-replay-v1',
      ruleVersion: PROLOGUE_V1_RULEBOOK_CANDIDATE.ruleVersion,
      note: 'Frozen prologue-v1 golden traces (ADR 0010). Never regenerate to make a change pass; a new rule version gets its own golden file.',
      journeys: actual,
    }, null, 2)}\n`);
  }

  it('has a golden file', () => {
    expect(existsSync(goldenPath)).toBe(true);
  });

  const golden = existsSync(goldenPath)
    ? JSON.parse(readFileSync(goldenPath, 'utf8')) as { ruleVersion: string; journeys: Record<string, unknown> }
    : { ruleVersion: '', journeys: {} };

  it('pins the frozen rule version', () => {
    expect(golden.ruleVersion).toBe(PROLOGUE_V1_RULEBOOK_CANDIDATE.ruleVersion);
    expect(Object.keys(golden.journeys).sort()).toEqual(Object.keys(journeys).sort());
  });

  for (const name of Object.keys(journeys)) {
    it(`replays ${name} byte-for-byte`, () => {
      expect(actual[name]).toEqual(golden.journeys[name]);
    });
  }
});
