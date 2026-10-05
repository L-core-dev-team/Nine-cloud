import { createHash } from 'node:crypto';
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
import {
  createPrologueV1EventReducer,
  createPrologueV1RuleModule,
  type PrologueV1Rulebook,
} from './prologue-v1-rules.js';
import { replayEvents } from './event-log.js';

const rulebook: PrologueV1Rulebook = PROLOGUE_V1_RULEBOOK_CANDIDATE;
const candidateModule = createPrologueV1RuleModule({
  rulebook,
  mechanics: PROLOGUE_V1,
  messages: PROLOGUE_V1_ERROR_MESSAGES,
});
const candidateReducer = createPrologueV1EventReducer({
  rulebook,
  mechanics: PROLOGUE_V1,
  messages: PROLOGUE_V1_ERROR_MESSAGES,
});
const eventIds = Array.from({ length: 20 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
let requestCounter = 0;

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
  locationGraph: structuredClone(rulebook.initialLocationGraph),
  idleCount: 0,
  obstacleState: 'blocked',
  ferryState: 'aground',
};

function save(overrides: Partial<PrologueV1Facts> = {}, locationId = 'loc_luhuadu'): SaveEnvelope {
  return {
    schemaVersion: 1,
    saveId: 'p1-candidate-save',
    canonVersion: rulebook.canonVersion,
    ruleVersion: rulebook.ruleVersion,
    memoryPolicyVersion: 'continue-v1',
    revision: 0,
    state: {
      playerId: 'p1-candidate-player',
      locationId,
      elapsedMinutes: 0,
      facts: { ...structuredClone(initialFacts), ...structuredClone(overrides) },
    },
  };
}

function act(kind: ActionIntent['kind'], payload: Record<string, unknown>, current = save()) {
  requestCounter += 1;
  const intent = ActionIntentSchema.parse({
    saveId: current.saveId,
    actorId: current.state.playerId,
    expectedRevision: current.revision,
    idempotencyKey: `00000000-0000-4000-9000-${String(requestCounter).padStart(12, '0')}`,
    branchId: 'root',
    kind,
    payload,
  }) as ActionIntent;
  const decision = evaluate(intent, current, {
    occurredAt: '2026-10-05T00:00:00.000Z',
    eventIds,
    module: candidateModule,
  });
  return { decision, current };
}

function replay(result: ReturnType<typeof act>): SaveEnvelope {
  expect(result.decision.status).toBe('accepted');
  if (result.decision.status !== 'accepted') throw new Error('EXPECTED_ACCEPTED_CANDIDATE_ACTION');
  return replayEvents(result.current, result.decision.events, candidateReducer);
}

function decisionEvents(result: ReturnType<typeof act>) {
  return result.decision.status === 'accepted' ? result.decision.events : [];
}

describe('candidate-only P1 prologue rulebook', () => {
  it('remains outside public content exports and carries a reproducible canonical digest', async () => {
    expect(PROLOGUE_V1_RULEBOOK_CANDIDATE.candidateOnly).toBe(true);
    const publicContent = await import('../../content/src/index.js');
    expect(publicContent).not.toHaveProperty('PROLOGUE_V1_RULEBOOK_CANDIDATE');
    const digest = createHash('sha256').update(canonicalJson(rulebook)).digest('hex');
    expect(digest).toBe('dbdb44603c50cfcf68f6e5eed55eb4ee16c82c47caab4c4defee19c932448cdd');
  });

  it('encodes the accepted three-location graph, empty inventory, initial technique, and NPC presence', () => {
    expect(rulebook.locationIds).toHaveLength(3);
    expect(rulebook.initialKnownLocationIds).toEqual(['loc_luhuadu', 'loc_wangqitai']);
    expect(initialFacts).toMatchObject({
      inventory: [],
      knownTechniques: ['tech_breath_basic'],
      npcPresence: ['npc_cenjiu', 'npc_shuiyuya'],
      locationGraph: [
        { from: 'loc_luhuadu', to: 'loc_wangqitai', state: 'open' },
        { from: 'loc_wangqitai', to: 'loc_luhuadu', state: 'blocked' },
        { from: 'loc_wangqitai', to: 'loc_zheguiping', state: 'locked' },
        { from: 'loc_zheguiping', to: 'loc_wangqitai', state: 'locked' },
      ],
    });
  });

  it('settles the authored initial breathing technique and hard-rejects unavailable or over-limit cultivation', () => {
    const cultivated = act('cultivate', { techniqueId: 'tech_breath_basic', minutes: 1 });
    expect(cultivated.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(replay(cultivated).state.facts).toMatchObject({
      gameMinute: 315,
      stamina: 80,
      cultivationProgress: 800,
      knownTechniques: ['tech_breath_basic'],
    });

    const missingTechnique = act('cultivate', { techniqueId: 'tech_unknown', minutes: 1 });
    expect(missingTechnique.decision).toMatchObject({
      status: 'rejected', code: 'ENV_TECHNIQUE_LOCKED', revision: 0,
    });
    expect(missingTechnique.current).toEqual(save());

    const overLimit = act('cultivate', { techniqueId: 'tech_breath_basic', minutes: 9 });
    expect(overLimit.decision).toMatchObject({
      status: 'rejected', code: 'INPUT_CULTIVATION_LIMIT', revision: 0,
    });
    expect(overLimit.current).toEqual(save());
  });

  it('gates bypass on the observed clue, charges the signed costs, and opens the return edge', () => {
    const atWangqitai = replay(act('move', { destinationId: 'loc_wangqitai' }));
    const blocked = act('move', { destinationId: 'loc_luhuadu' }, atWangqitai);
    expect(blocked.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_ROAD_BLOCKED' });
    expect(decisionEvents(blocked)[0]?.payload).toMatchObject({ reason: 'rockslide', kecCount: 1 });
    expect(replay(blocked).state).toMatchObject({
      locationId: 'loc_wangqitai',
      elapsedMinutes: 30,
      facts: { gameMinute: 330, stamina: 85, obstacleState: 'blocked' },
    });

    const observed = replay(act('observe', { targetId: 'obstacle_rockslide', method: 'scan' }, atWangqitai));
    expect(observed.state.facts).toMatchObject({ clues: ['clue_rockslide'], gameMinute: 330, stamina: 92 });
    const bypass = act('move', { destinationId: 'loc_luhuadu' }, observed);
    expect(bypass.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(decisionEvents(bypass)[0]?.payload).toMatchObject({
      from: 'loc_wangqitai', to: 'loc_luhuadu', routeId: 'route_reef_ledge', via: 'subloc_reef_ledge',
      kecCount: 2, extraKecCount: 1,
    });
    expect(replay(bypass).state).toMatchObject({
      locationId: 'loc_luhuadu',
      elapsedMinutes: 60,
      facts: {
        gameMinute: 360,
        stamina: 77,
        obstacleState: 'cleared',
        injuryFlags: ['shoulder_scrape'],
        questState: { status: 'completed', rewardClaimed: false },
        locationGraph: expect.arrayContaining([
          { from: 'loc_wangqitai', to: 'loc_luhuadu', state: 'open', via: 'subloc_reef_ledge' },
        ]),
      },
    });
  });

  it('exposes observation levels by target and blocks dark observation without awarding clues', () => {
    const ferryScan = replay(act('observe', { targetId: 'obj_ferry', method: 'scan' }));
    expect(ferryScan.state.facts).toMatchObject({ clues: ['clue_ferry_stuck'], gameMinute: 315 });
    const ferryStudy = replay(act('observe', { targetId: 'obj_ferry', method: 'study' }, ferryScan));
    expect(ferryStudy.state.facts.clues).toEqual(['clue_ferry_stuck', 'clue_ferry_scrubbed']);

    const gearStudy = replay(act('observe', { targetId: 'obj_ferry_gear', method: 'study' }));
    expect(gearStudy.state.facts.clues).toEqual(['clue_wrong_way']);

    const night = act('observe', { targetId: 'obstacle_rockslide', method: 'study' },
      save({ gameMinute: 1020 }, 'loc_wangqitai'));
    expect(night.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_OBSERVE_BLOCKED' });
    expect(replay(night).state.facts).toMatchObject({
      gameMinute: 1050,
      clues: [],
      observationLog: [{ result: 'blocked', blockedReason: 'too_dark' }],
    });
  });

  it('records refusal topics without granting a clue or clearing the obstacle', () => {
    for (const utterance of ['这石头怎么办', '怎么过去', '有别的路吗', '能动吗', '不要去望气台']) {
      const result = act('talk', { npcId: 'npc_cenjiu', utterance });
      expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
      expect(decisionEvents(result).map(event => event.type)).toEqual(['talk.occurred']);
      expect(decisionEvents(result)[0]?.payload).toMatchObject({ outcome: 'refuse', kecCount: 1 });
      expect(JSON.stringify(result.decision)).not.toContain(utterance);
      expect(replay(result).state.facts).toMatchObject({
        gameMinute: 315,
        clues: [],
        obstacleState: 'blocked',
        npcInteractionLog: [{ npcId: 'npc_cenjiu', outcome: 'refuse' }],
      });
    }

    const absent = act('talk', { npcId: 'npc_cenjiu', utterance: '怎么过去' }, save({ npcPresence: ['npc_shuiyuya'] }));
    expect(absent.decision).toMatchObject({ status: 'rejected', code: 'AUTH_NPC_ABSENT', revision: 0 });
    expect(absent.current.state.facts).toMatchObject({ gameMinute: 300, clues: [], obstacleState: 'blocked' });
  });

  it('rejects wrong item targets with zero side effects and consumes a valid use once', () => {
    const holdingWard = save({ inventory: [{ itemId: 'item_bishuifu', quantity: 1 }] });
    const mismatch = act('use_item', { itemId: 'item_bishuifu', targetId: 'loc_wangqitai' }, holdingWard);
    expect(mismatch.decision).toMatchObject({ status: 'rejected', code: 'RULE_TARGET_MISMATCH', revision: 0 });
    expect(mismatch.current).toEqual(holdingWard);

    const atBerm = save({
      inventory: [{ itemId: 'item_bishuifu', quantity: 1 }],
      currentSublocationId: 'subloc_ferry_berm',
    });
    const used = act('use_item', { itemId: 'item_bishuifu', targetId: 'subloc_ferry_berm' }, atBerm);
    expect(decisionEvents(used).map(event => event.type)).toEqual(['item.consumed', 'item.depleted']);
    expect(replay(used).state.facts).toMatchObject({
      gameMinute: 315,
      inventory: [],
      effectFlags: ['effect_ward_water'],
    });

    const unauthorized = act('use_item', { itemId: 'item_bishuifu', targetId: 'subloc_reef_ledge' }, holdingWard);
    expect(unauthorized.decision).toMatchObject({ status: 'rejected', code: 'AUTH_UNAUTHORIZED_TARGET' });
    expect(unauthorized.current).toEqual(holdingWard);
  });

  it('picks up the mapped single-use source once and hard-rejects a full inventory', () => {
    const pickedUp = replay(act('acquire_item', { itemId: 'item_bishuifu', quantity: 1 }));
    expect(pickedUp.state.facts).toMatchObject({
      gameMinute: 315,
      inventory: [{ itemId: 'item_bishuifu', quantity: 1 }],
      collectedSources: ['src_ferry_shore'],
    });
    const duplicate = act('acquire_item', { itemId: 'item_bishuifu', quantity: 1 }, pickedUp);
    expect(duplicate.decision).toMatchObject({ status: 'rejected', code: 'ENV_SOURCE_ALREADY_CLAIMED' });
    expect(duplicate.current).toEqual(pickedUp);
  });

  it('implements deterministic daylight, dusk, and retreat combat without HP or random draws', () => {
    const atWorksite = save({ currentSublocationId: 'subloc_ferry_berm' });
    const daylight = act('combat', { targetId: 'npc_shuiyuya' }, atWorksite);
    expect(daylight.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(decisionEvents(daylight)[0]?.payload).toMatchObject({ outcome: 'clear', kecCount: 2 });
    expect(replay(daylight).state.facts).toMatchObject({
      stamina: 75,
      spiritStamina: 75,
      injuryFlags: [],
      obstacleState: 'cleared',
      questState: { status: 'completed' },
    });

    const dusk = act('combat', { targetId: 'npc_shuiyuya' }, save({
      gameMinute: 1020,
      currentSublocationId: 'subloc_reef_ledge',
    }, 'loc_wangqitai'));
    expect(dusk.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(decisionEvents(dusk)[0]?.payload).toMatchObject({ outcome: 'clear' });
    expect(replay(dusk).state.facts).toMatchObject({
      stamina: 75,
      spiritStamina: 75,
      injuryFlags: ['crowding_bite'],
      obstacleState: 'cleared',
    });

    const wounded = act('combat', { targetId: 'npc_shuiyuya' }, save({
      currentSublocationId: 'subloc_reef_ledge',
    }, 'loc_wangqitai'));
    expect(decisionEvents(wounded)[0]?.payload).toMatchObject({ outcome: 'clear_wounded' });
    expect(replay(wounded).state.facts.injuryFlags).toEqual(['crow_scratch']);

    const retreat = act('combat', { targetId: 'npc_shuiyuya' }, save({
      spiritStamina: 0,
      currentSublocationId: 'subloc_ferry_berm',
    }));
    expect(retreat.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_COMBAT_RETREAT' });
    expect(decisionEvents(retreat)[0]?.payload).toMatchObject({ outcome: 'retreat' });
    expect(replay(retreat).state).toMatchObject({ locationId: 'loc_luhuadu', facts: {
      spiritStamina: 5,
      obstacleState: 'blocked',
      questState: { status: 'unavailable' },
      injuryFlags: ['retreated'],
    } });
  });

  it('opens both directed reward edges atomically and only then reveals the third location', () => {
    const cleared = save({
      obstacleState: 'cleared',
      ferryState: 'clear',
      questState: { status: 'completed', rewardClaimed: false },
      locationGraph: rulebook.initialLocationGraph.map(edge =>
        edge.from === 'loc_wangqitai' && edge.to === 'loc_luhuadu'
          ? { ...edge, state: 'open' as const, via: 'subloc_reef_ledge' }
          : edge),
    });
    const claimResult = act('quest', { questId: 'quest_first_clearance', choiceId: 'claim_reward' }, cleared);
    expect(decisionEvents(claimResult)[0]?.payload).toMatchObject({ sourceId: 'src_quest_clearance', quantity: 1 });
    const claim = replay(claimResult);
    expect(claim.state.facts).toMatchObject({
      knownLocations: ['loc_luhuadu', 'loc_wangqitai', 'loc_zheguiping'],
      inventory: [{ itemId: 'item_jiuyifu', quantity: 1 }],
      questState: { status: 'completed', rewardClaimed: true },
      locationGraph: expect.arrayContaining([
        { from: 'loc_wangqitai', to: 'loc_zheguiping', state: 'open' },
        { from: 'loc_zheguiping', to: 'loc_wangqitai', state: 'open' },
      ]),
    });
  });
});
