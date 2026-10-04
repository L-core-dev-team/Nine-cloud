import { describe, expect, it } from 'vitest';
import { ActionIntentSchema, type ActionIntent, type PrologueV1Facts, type SaveEnvelope } from '@jiuxiao/contracts';
import { PROLOGUE_V1, PROLOGUE_V1_ERROR_MESSAGES, PROLOGUE_V1_RULE_VERSION } from '../../content/src/rules/prologue-v1.constants.js';
import { evaluate } from './rules.js';
import { createPrologueV1EventReducer, createPrologueV1RuleModule, type PrologueV1Rulebook } from './prologue-v1-rules.js';
import { replayEvents } from './event-log.js';
import { parseActionText } from './nlu/action-parser.js';

const baseFacts: PrologueV1Facts = {
  gameMinute: 300,
  stamina: 100,
  staminaDayIndex: 0,
  spiritStamina: 100,
  cultivationProgress: 0,
  fatigueCount: 0,
  inventory: [{ itemId: 'item_ward', quantity: 1 }],
  collectedSources: [],
  effectFlags: [],
  clues: [],
  observationLog: [],
  npcInteractionLog: [],
  travelLog: [],
  injuryFlags: [],
  questState: { status: 'unavailable', rewardClaimed: false },
  knownLocations: ['loc_gate', 'loc_town'],
  locationGraph: [
    { from: 'loc_gate', to: 'loc_town', state: 'blocked' },
    { from: 'loc_town', to: 'loc_gate', state: 'open' },
    { from: 'loc_town', to: 'loc_rock', state: 'locked' },
  ],
  idleCount: 0,
  obstacleState: 'blocked',
  ferryState: 'aground',
};

const book: PrologueV1Rulebook = {
  ruleVersion: PROLOGUE_V1_RULE_VERSION,
  canonVersion: 'synthetic-fixture-v1',
  locationIds: ['loc_gate', 'loc_town', 'loc_rock'],
  initialKnownLocationIds: ['loc_gate', 'loc_town'],
  itemIds: ['item_ward', 'item_herb', 'item_reward'],
  clueIds: ['clue_surface', 'clue_detail', 'clue_route'],
  effectFlagIds: ['effect_warded', 'effect_herb_used'],
  injuryFlagIds: ['injury_shoulder', 'injury_scratched', 'injury_crowded', 'injury_retreat'],
  targetIds: ['loc_rock', 'loc_town', 'npc_guide', 'target_stones', 'target_crow'],
  initialLocationGraph: [
    { from: 'loc_gate', to: 'loc_town', state: 'blocked' },
    { from: 'loc_town', to: 'loc_gate', state: 'open' },
    { from: 'loc_town', to: 'loc_rock', state: 'locked' },
  ],
  obstacleRoute: { from: 'loc_gate', to: 'loc_town' },
  unexploredEdges: [{ from: 'loc_gate', to: 'loc_rock' }],
  bypassRoutes: [{ from: 'loc_gate', to: 'loc_town', via: 'route_shallow_bypass', clearsObstacle: true }],
  cultivationTechniqueIds: ['tech_fixture'],
  combatTechniqueIds: ['combat_fixture'],
  acquisitionSources: [{ sourceId: 'source_herb', locationId: 'loc_gate', itemId: 'item_herb', source: 'field', quantity: 1 }],
  itemUses: [
    { itemId: 'item_ward', targetIds: ['target_crow'], effectFlags: ['effect_warded'] },
    { itemId: 'item_herb', targetIds: [], effectFlags: ['effect_herb_used'] },
  ],
  npcs: [{ npcId: 'npc_guide', locationId: 'loc_gate', topics: [
    { topicTag: 'topic_route', utterances: ['说渡口'], clueId: 'clue_route', clearsObstacle: true },
  ] }],
  observations: [{ targetId: 'target_stones', locationId: 'loc_gate', scanClueId: 'clue_surface',
    studyClueId: 'clue_detail', blocked: { when: 'dark', reason: 'too_dark' } }],
  combatTargets: [{ targetId: 'target_crow', locationId: 'loc_gate', clearsObstacle: true,
    protectionItemId: 'item_ward', retreatLocationId: 'loc_gate',
    daytimeInjuryFlag: 'injury_scratched', darkInjuryFlag: 'injury_crowded', retreatInjuryFlag: 'injury_retreat' }],
  quest: { questId: 'quest_fixture', rewardItemId: 'item_reward', unlockEdge: { from: 'loc_town', to: 'loc_rock', state: 'open' } },
  injuryFlags: { shoulderScrape: 'injury_shoulder' },
};

const module = createPrologueV1RuleModule({
  rulebook: book,
  mechanics: PROLOGUE_V1,
  messages: PROLOGUE_V1_ERROR_MESSAGES,
});

it('routes parser observation targets to the rulebook targetId, not the locationId', () => {
  const current = save();
  const target = book.observations.find(candidate => candidate.locationId === current.state.locationId)!;
  const parsed = parseActionText({
    text: '观察石堆',
    identity: {
      saveId: current.saveId,
      actorId: current.state.playerId,
      branchId: 'root',
      expectedRevision: current.revision,
      idempotencyKey: '00000000-0000-4000-9000-000000000099',
    },
    visible: {
      knownLocations: [],
      npcPresence: [],
      observationTargets: [{ id: target.targetId, label: '石堆' }],
      clues: [],
      inventory: [],
    },
    visibilityRevision: current.revision,
    templates: [{ id: 'observe-scene-target', kind: 'observe', prefix: '观察', entitySource: 'observationTargets', fixedPayload: { method: 'scan' } }],
  });
  expect(parsed.status).toBe('ready');
  if (parsed.status !== 'ready') throw new Error('EXPECTED_OBSERVE_INTENT');
  expect(parsed.intent.payload).toEqual({ targetId: target.targetId, method: 'scan' });
  const decision = evaluate(parsed.intent, current, {
    occurredAt: '2026-10-03T10:00:00.000Z',
    eventIds: allocatedIds,
    module,
  });
  expect(decision.status).toBe('accepted');
  if (decision.status === 'accepted') expect(decision.events[0]?.type).toBe('observe.result');
});

let requestCounter = 0;
const allocatedIds = Array.from({ length: 16 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);

function save(overrides: Partial<PrologueV1Facts> = {}, locationId = 'loc_gate'): SaveEnvelope {
  return {
    schemaVersion: 1,
    saveId: 'fixture-save',
    canonVersion: book.canonVersion,
    ruleVersion: book.ruleVersion,
    memoryPolicyVersion: 'fixture-memory-v1',
    revision: 0,
    state: {
      playerId: 'fixture-player',
      locationId,
      elapsedMinutes: 0,
      facts: { ...structuredClone(baseFacts), ...structuredClone(overrides) },
    },
  };
}

function act(kind: ActionIntent['kind'], payload: Record<string, unknown>, current = save(), activeModule = module) {
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
  const context = {
    occurredAt: '2026-10-03T10:00:00.000Z',
    eventIds: allocatedIds,
    module: activeModule,
  };
  return { intent, decision: evaluate(intent, current, context), current };
}

function replay(result: ReturnType<typeof act>) {
  expect(result.decision.status).toBe('accepted');
  if (result.decision.status !== 'accepted') throw new Error('Expected accepted decision');
  return replayEvents(result.current, result.decision.events, createPrologueV1EventReducer({
    rulebook: book, mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES,
  }));
}

describe('versioned P1 prologue rule reducers', () => {
  it('rejects rulebooks that exceed the three signed locations', () => {
    expect(() => createPrologueV1RuleModule({
      rulebook: { ...book, locationIds: [...book.locationIds, 'loc_four'] },
      mechanics: PROLOGUE_V1,
      messages: PROLOGUE_V1_ERROR_MESSAGES,
    })).toThrow('INVALID_PROLOGUE_LOCATION_SET');
  });

  it('validates the clearance resource margin and rejects duplicate source identities', () => {
    expect(() => createPrologueV1RuleModule({
      rulebook: { ...book, acquisitionSources: [...book.acquisitionSources, ...book.acquisitionSources] },
      mechanics: PROLOGUE_V1,
      messages: PROLOGUE_V1_ERROR_MESSAGES,
    })).toThrow('DUPLICATE_ACQUISITION_SOURCE_IDS');
    expect(() => createPrologueV1RuleModule({
      rulebook: book,
      mechanics: { ...PROLOGUE_V1, STAMINA_MAX: 200 },
      messages: PROLOGUE_V1_ERROR_MESSAGES,
    })).toThrow('CLEARANCE_STAMINA_MARGIN_OUT_OF_RANGE');
  });

  it('fails closed on a save containing facts outside the pinned rulebook', () => {
    const invalid = act('move', { destinationId: 'loc_town' }, save({
      inventory: [{ itemId: 'unreviewed_item', quantity: 1 }],
    }));
    expect(invalid.decision).toMatchObject({ status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0 });
    const futureResetIndex = act('talk', { npcId: 'npc_guide', utterance: '无关的话' }, save({ staminaDayIndex: 1 }));
    expect(futureResetIndex.decision).toMatchObject({ status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0 });
    const unknownCurrentLocation = act('move', { destinationId: 'loc_town' }, save({
      knownLocations: ['loc_town'],
    }));
    expect(unknownCurrentLocation.decision).toMatchObject({ status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0 });
    const openedWithoutClearing = act('talk', { npcId: 'npc_guide', utterance: '无关的话' }, save({
      locationGraph: baseFacts.locationGraph.map(edge => edge.from === 'loc_gate' && edge.to === 'loc_town'
        ? { ...edge, state: 'open' as const } : edge),
    }));
    expect(openedWithoutClearing.decision).toMatchObject({
      status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0,
    });
  });

  it('rejects an unauthorized early unlock of the third location', () => {
    const invalid = act('move', { destinationId: 'loc_rock' }, save({
      knownLocations: [...baseFacts.knownLocations, 'loc_rock'],
      locationGraph: baseFacts.locationGraph.map(edge => edge.from === 'loc_town' && edge.to === 'loc_rock'
        ? { ...edge, state: 'open' as const } : edge),
    }));
    expect(invalid.decision).toMatchObject({ status: 'rejected', code: 'ENV_PAYLOAD_INVALID', revision: 0 });
  });

  it('allows an explicitly configured bypass to open a route without clearing its obstacle', () => {
    const nonClearingBook = { ...book, bypassRoutes: book.bypassRoutes.map(route => ({ ...route, clearsObstacle: false })) };
    const nonClearingModule = createPrologueV1RuleModule({ rulebook: nonClearingBook,
      mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES });
    const result = act('move', { destinationId: 'loc_town' }, save(), nonClearingModule);
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    if (result.decision.status !== 'accepted') throw new Error('Expected an accepted bypass');
    const replayed = replayEvents(result.current, result.decision.events, createPrologueV1EventReducer({
      rulebook: nonClearingBook, mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES,
    }));
    expect(replayed.state.facts.obstacleState).toBe('blocked');
    expect(replayed.state.facts.locationGraph).toContainEqual({
      from: 'loc_gate', to: 'loc_town', state: 'open', via: 'route_shallow_bypass',
    });
  });

  it('moves over an open edge and replays the committed time/resource projection', () => {
    const result = act('move', { destinationId: 'loc_gate' }, save({}, 'loc_town'));
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'success', nextRevision: 1 });
    expect(replay(result)).toMatchObject({ revision: 1, state: {
      locationId: 'loc_gate', elapsedMinutes: 15,
      facts: { gameMinute: 315, stamina: 95, staminaDayIndex: 0 },
    } });
  });

  it('clamps low move stamina, covers cultivation hard rejections, and records normal cultivation progress', () => {
    expect(act('move', { destinationId: 'loc_absent' }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_NO_SUCH_TARGET' });
    expect(act('move', { destinationId: 'loc_rock' }, save({}, 'loc_town')).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_ROUTE_NOT_CONNECTED' });
    const exhaustedMove = act('move', { destinationId: 'loc_town' }, save({
      stamina: 0,
      obstacleState: 'cleared',
      ferryState: 'clear',
      questState: { status: 'completed', rewardClaimed: false },
      locationGraph: baseFacts.locationGraph.map(edge => edge.from === 'loc_gate' && edge.to === 'loc_town'
        ? { ...edge, state: 'open' as const } : edge),
    }));
    expect(exhaustedMove.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(replay(exhaustedMove).state).toMatchObject({ locationId: 'loc_town',
      facts: { stamina: 0, gameMinute: 315 } });

    const lockedGraph = baseFacts.locationGraph.map(edge => edge.from === 'loc_town' && edge.to === 'loc_gate'
      ? { ...edge, state: 'locked' as const } : edge);
    const lockedBook = { ...book, initialLocationGraph: lockedGraph };
    const lockedModule = createPrologueV1RuleModule({
      rulebook: lockedBook, mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES,
    });
    expect(act('move', { destinationId: 'loc_gate' }, save({ locationGraph: lockedGraph }, 'loc_town'), lockedModule).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_ROUTE_LOCKED' });

    const cultivated = act('cultivate', { techniqueId: 'tech_fixture', minutes: 2 }, save({ stamina: 60 }));
    expect(cultivated.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(replay(cultivated).state.facts).toMatchObject({ stamina: 20, cultivationProgress: 1600, gameMinute: 330 });
    expect(act('cultivate', { techniqueId: 'unreviewed', minutes: 1 }).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_TECHNIQUE_LOCKED' });
    expect(act('cultivate', { techniqueId: 'tech_fixture', minutes: 1 }, save({ stamina: 0 })).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_STAMINA_EMPTY' });
    expect(act('cultivate', { techniqueId: 'tech_fixture', minutes: 1 }, save({ cultivationProgress: 10_000 }))
      .decision).toMatchObject({ status: 'rejected', code: 'ENV_CULTIVATION_COMPLETE', revision: 0 });
  });

  it('records road blockage as a committed legal failure with cost and time', () => {
    const noBypass = createPrologueV1RuleModule({
      rulebook: { ...book, bypassRoutes: book.bypassRoutes.map(route => ({ ...route, requiredItemId: 'item_herb' })) },
      mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES,
    });
    const result = act('move', { destinationId: 'loc_town' }, save(), noBypass);
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_ROAD_BLOCKED' });
    expect(replay(result)).toMatchObject({ state: { locationId: 'loc_gate', elapsedMinutes: 15,
      facts: { gameMinute: 315, stamina: 90, travelLog: [{ toward: 'loc_town', reason: 'rockslide' }] } } });
  });

  it('allows the quest location to produce an unexplored failure without revealing it', () => {
    const result = act('move', { destinationId: 'loc_rock' });
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_LOCATION_UNEXPLORED' });
    expect(replay(result)).toMatchObject({ state: { locationId: 'loc_gate', facts: {
      knownLocations: ['loc_gate', 'loc_town'],
      travelLog: [{ toward: 'loc_rock', reason: 'unexplored' }],
      stamina: 95,
    } } });
  });

  it('uses the configured bypass, records its injury, and completes the quest in one revision', () => {
    const result = act('move', { destinationId: 'loc_town' });
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'success', nextRevision: 1 });
    expect(result.decision.status === 'accepted' && result.decision.events.map(event => event.type))
      .toEqual(['move.bypassed', 'quest.completed']);
    expect(replay(result)).toMatchObject({ revision: 1, state: { locationId: 'loc_town', elapsedMinutes: 30,
      facts: { gameMinute: 330, stamina: 85, obstacleState: 'cleared', ferryState: 'clear',
        questState: { status: 'completed', rewardClaimed: false }, injuryFlags: ['injury_shoulder'] } } });
  });

  it('hard rejects cultivation above eight Kec before creating an event', () => {
    const current = save({ stamina: 100 });
    const stateBefore = structuredClone(current.state);
    const intent: ActionIntent = {
      saveId: current.saveId, actorId: current.state.playerId, expectedRevision: current.revision,
      idempotencyKey: '00000000-0000-4000-9000-000000000099', branchId: 'root',
      kind: 'cultivate', payload: { techniqueId: 'tech_fixture', minutes: 9 },
    };
    const decision = module.decide(intent, current, { occurredAt: '2026-10-03T10:00:00.000Z', eventIds: allocatedIds, module });
    expect(decision).toMatchObject({ status: 'rejected', code: 'INPUT_CULTIVATION_LIMIT', revision: 0 });
    expect(decision.status === 'rejected' && 'events' in decision).toBe(false);
    expect(current.state).toEqual(stateBefore);

    const evaluated = evaluate(intent, current, {
      occurredAt: '2026-10-03T10:00:00.000Z', eventIds: allocatedIds, module,
    });
    expect(evaluated).toMatchObject({ status: 'rejected', code: 'INPUT_CULTIVATION_LIMIT', revision: 0 });
  });

  it('caps cultivation work by available stamina and records one fatigue attempt', () => {
    const result = act('cultivate', { techniqueId: 'tech_fixture', minutes: 4 }, save({ stamina: 25 }));
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_STAMINA_LOW' });
    const event = result.decision.status === 'accepted' ? result.decision.events[0] : undefined;
    expect(event?.payload).toMatchObject({ kecCount: 2, requestedKecCount: 4, attemptedKecCount: 2 });
    expect(replay(result)).toMatchObject({ state: { elapsedMinutes: 30, facts: {
      gameMinute: 330, stamina: 0, cultivationProgress: 1000, fatigueCount: 1,
    } } });
  });

  it('collects a source exactly once, including after the acquired stack is consumed', () => {
    const first = act('acquire_item', { itemId: 'item_herb', quantity: 1 });
    const collected = replay(first);
    expect(collected.state.facts).toMatchObject({ collectedSources: ['source_herb'],
      inventory: [{ itemId: 'item_ward', quantity: 1 }, { itemId: 'item_herb', quantity: 1 }] });
    const consumed = replay(act('use_item', { itemId: 'item_herb' }, collected));
    expect(consumed.state.facts).toMatchObject({ collectedSources: ['source_herb'],
      inventory: [{ itemId: 'item_ward', quantity: 1 }] });
    const repeat = act('acquire_item', { itemId: 'item_herb', quantity: 1 }, consumed);
    expect(repeat.decision).toMatchObject({ status: 'rejected', code: 'ENV_SOURCE_ALREADY_CLAIMED' });
    const useWithoutTarget = act('use_item', { itemId: 'item_herb' }, collected);
    expect(useWithoutTarget.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(replay(useWithoutTarget).state.facts.inventory).toEqual([{ itemId: 'item_ward', quantity: 1 }]);
  });

  it('rejects missing, mismatched, and full acquisition sources without committing', () => {
    expect(act('acquire_item', { itemId: 'item_reward', quantity: 1 }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_NO_SUCH_TARGET' });
    expect(act('acquire_item', { itemId: 'item_herb', quantity: 2 }).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_SOURCE_QUANTITY_INVALID' });

    const fullItemIds = ['item_ward', 'item_reward', ...Array.from({ length: 6 }, (_, index) => `item_extra_${index}`)];
    const fullBook = { ...book, itemIds: [...book.itemIds, ...fullItemIds.filter(itemId => !book.itemIds.includes(itemId))] };
    const fullModule = createPrologueV1RuleModule({
      rulebook: fullBook, mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES,
    });
    const fullInventory = fullItemIds.map(itemId => ({ itemId, quantity: 1 }));
    const fullSave = save({ inventory: fullInventory });
    const stateBefore = structuredClone(fullSave.state);
    const fullAttempt = act('acquire_item', { itemId: 'item_herb', quantity: 1 }, fullSave, fullModule);
    expect(fullAttempt.decision).toMatchObject({ status: 'rejected', code: 'INPUT_INVENTORY_FULL', revision: 0 });
    expect(fullAttempt.decision.status === 'rejected' && 'events' in fullAttempt.decision).toBe(false);
    expect(fullAttempt.current.state).toEqual(stateBefore);
  });

  it('rejects item target mismatch without consuming it and commits a valid use', () => {
    const invalid = act('use_item', { itemId: 'item_ward', targetId: 'loc_town' });
    expect(invalid.decision).toMatchObject({ status: 'rejected', code: 'ENV_TARGET_MISMATCH', revision: 0 });
    expect(act('use_item', { itemId: 'item_herb' }).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_ITEM_NOT_OWNED' });
    const valid = act('use_item', { itemId: 'item_ward', targetId: 'target_crow' });
    expect(valid.decision.status === 'accepted' && valid.decision.events.map(event => event.type))
      .toEqual(['item.consumed', 'item.depleted']);
    expect(replay(valid).state.facts).toMatchObject({ inventory: [], effectFlags: ['effect_warded'], gameMinute: 315 });
  });

  it('keeps raw utterance out of events while matching a configured topic and deriving quest completion', () => {
    const result = act('talk', { npcId: 'npc_guide', utterance: '说渡口！' });
    expect(result.decision.status === 'accepted' && result.decision.events.map(event => event.type))
      .toEqual(['talk.occurred', 'talk.topic_learned', 'quest.completed']);
    expect(JSON.stringify(result.decision)).not.toContain('说渡口');
    expect(replay(result).state.facts).toMatchObject({
      npcInteractionLog: [{ npcId: 'npc_guide', topicTag: 'topic_route', outcome: 'on_topic' }],
      clues: ['clue_route'], obstacleState: 'cleared', questState: { status: 'completed', rewardClaimed: false },
      locationGraph: [
        { from: 'loc_gate', to: 'loc_town', state: 'open' },
        { from: 'loc_town', to: 'loc_gate', state: 'open' },
        { from: 'loc_town', to: 'loc_rock', state: 'locked' },
      ],
    });
    const opened = replay(result);
    expect(opened.state.facts.knownLocations).toEqual(['loc_gate', 'loc_town']);
    const move = act('move', { destinationId: 'loc_rock' }, opened);
    expect(move.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_LOCATION_UNEXPLORED' });
    expect(replay(move).state).toMatchObject({ locationId: 'loc_gate', elapsedMinutes: 30,
      facts: { stamina: 95, knownLocations: ['loc_gate', 'loc_town'] } });
  });

  it('records unmatched talk as a time-advancing legal failure', () => {
    const result = act('talk', { npcId: 'npc_guide', utterance: '无关的话' });
    expect(result.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_TALK_IDLE' });
    expect(replay(result).state.facts).toMatchObject({ idleCount: 1, gameMinute: 315,
      npcInteractionLog: [{ outcome: 'idle', topicTag: 'unmatched' }] });
  });

  it('rejects unknown or absent targets and permits observation at zero stamina with a clamped debit', () => {
    expect(act('talk', { npcId: 'npc_missing', utterance: '借问' }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_NO_SUCH_TARGET' });
    expect(act('talk', { npcId: 'npc_guide', utterance: '借问' }, save({}, 'loc_town')).decision)
      .toMatchObject({ status: 'rejected', code: 'AUTH_NPC_ABSENT' });
    const exhaustedObservation = act('observe', { targetId: 'target_stones', method: 'scan' }, save({ stamina: 0 }));
    expect(exhaustedObservation.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(replay(exhaustedObservation).state.facts).toMatchObject({ stamina: 0, clues: ['clue_surface'] });
    expect(act('observe', { targetId: 'target_missing', method: 'scan' }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_NO_SUCH_TARGET' });
    expect(act('observe', { targetId: 'target_stones', method: 'scan' }, save({}, 'loc_town')).decision)
      .toMatchObject({ status: 'rejected', code: 'AUTH_UNAUTHORIZED_TARGET' });
    expect(act('combat', { targetId: 'target_missing' }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_NO_SUCH_TARGET' });
    expect(act('combat', { targetId: 'target_crow' }, save({}, 'loc_town')).decision)
      .toMatchObject({ status: 'rejected', code: 'AUTH_UNAUTHORIZED_TARGET' });
  });

  it('supports scan, first study, repeated study, and dark-obstructed observations', () => {
    const scan = replay(act('observe', { targetId: 'target_stones', method: 'scan' }));
    expect(scan.state.facts).toMatchObject({ clues: ['clue_surface'], knownLocations: ['loc_gate', 'loc_town'],
      observationLog: [{ result: 'found', clueLevel: 1 }], stamina: 97 });
    const repeatedScan = act('observe', { targetId: 'target_stones', method: 'scan' }, scan);
    expect(repeatedScan.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_NO_NEW_DISCOVERY' });
    expect(replay(repeatedScan).state.facts.observationLog.at(-1)).toMatchObject({ result: 'none' });
    const study = replay(act('observe', { targetId: 'target_stones', method: 'study' }, scan));
    expect(study.state.facts).toMatchObject({ clues: ['clue_surface', 'clue_detail'], stamina: 91 });
    expect((study.state.facts as PrologueV1Facts).observationLog.at(-1)).toMatchObject({ result: 'found', clueLevel: 2 });
    const repeat = act('observe', { targetId: 'target_stones', method: 'study' }, study);
    expect(repeat.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_NO_NEW_DISCOVERY' });
    const dark = act('observe', { targetId: 'target_stones', method: 'study' }, save({ gameMinute: 1020 }));
    expect(dark.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_OBSERVE_BLOCKED' });
    expect(replay(dark).state.facts).toMatchObject({ observationLog: [{ result: 'blocked', blockedReason: 'too_dark' }] });
  });

  it('resolves prepared daylight combat, dark combat injury, and stamina retreat', () => {
    const prepared = act('combat', { targetId: 'target_crow', techniqueId: 'combat_fixture' });
    expect(prepared.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(replay(prepared).state.facts).toMatchObject({ stamina: 75, spiritStamina: 75,
      obstacleState: 'cleared', questState: { status: 'completed' },
      locationGraph: [
        { from: 'loc_gate', to: 'loc_town', state: 'open' },
        { from: 'loc_town', to: 'loc_gate', state: 'open' },
        { from: 'loc_town', to: 'loc_rock', state: 'locked' },
      ],
    });
    const combatCleared = replay(prepared);
    const moveAfterCombat = act('move', { destinationId: 'loc_rock' }, combatCleared);
    expect(moveAfterCombat.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_LOCATION_UNEXPLORED' });
    expect(replay(moveAfterCombat).state.facts.knownLocations).toEqual(['loc_gate', 'loc_town']);
    expect(act('combat', { targetId: 'target_crow' }, combatCleared).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_TARGET_ALREADY_RESOLVED', revision: combatCleared.revision });

    const dark = act('combat', { targetId: 'target_crow' }, save({ gameMinute: 1020 }));
    expect(dark.decision).toMatchObject({ status: 'accepted', outcome: 'success' });
    expect(dark.decision.status === 'accepted' && dark.decision.events[0]?.payload)
      .toMatchObject({ outcome: 'clear_wounded' });
    expect(replay(dark).state.facts).toMatchObject({ injuryFlags: ['injury_crowded'], obstacleState: 'cleared' });

    const unprepared = act('combat', { targetId: 'target_crow' }, save({ inventory: [] }));
    expect(unprepared.decision.status === 'accepted' && unprepared.decision.events[0]?.payload)
      .toMatchObject({ outcome: 'clear_wounded' });
    expect(replay(unprepared).state.facts).toMatchObject({ injuryFlags: ['injury_scratched'] });

    const retreat = act('combat', { targetId: 'target_crow' }, save({ stamina: 10, spiritStamina: 100,
      inventory: [] }));
    expect(retreat.decision).toMatchObject({ status: 'accepted', outcome: 'legal_failure', code: 'RULE_COMBAT_RETREAT' });
    expect(replay(retreat).state.facts).toMatchObject({ stamina: 0, spiritStamina: 5, obstacleState: 'blocked',
      injuryFlags: ['injury_retreat'] });
  });

  it('restores combat spirit on the following game day and rejects combat at zero spirit', () => {
    const nextDay = act('combat', { targetId: 'target_crow' }, save({ gameMinute: 1740,
      stamina: 20, staminaDayIndex: 0, spiritStamina: 5 }));
    expect(replay(nextDay).state.facts).toMatchObject({ stamina: 75, spiritStamina: 75, staminaDayIndex: 1 });
    const empty = act('combat', { targetId: 'target_crow' }, save({ spiritStamina: 0 }));
    expect(empty.decision).toMatchObject({ status: 'rejected', code: 'ENV_SPIRIT_STAMINA_EMPTY' });
    const unknownTechnique = act('combat', { targetId: 'target_crow', techniqueId: 'unreviewed_technique' });
    expect(unknownTechnique.decision).toMatchObject({ status: 'rejected', code: 'ENV_TECHNIQUE_LOCKED' });
  });

  it('claims the completed quest reward once and opens the configured edge', () => {
    const result = act('quest', { questId: 'quest_fixture', choiceId: 'claim_reward' }, save({
      locationGraph: baseFacts.locationGraph.map(edge => edge.from === 'loc_gate' && edge.to === 'loc_town'
        ? { ...edge, state: 'open' as const } : edge),
      obstacleState: 'cleared', questState: { status: 'completed', rewardClaimed: false }, ferryState: 'clear',
    }));
    expect(replay(result).state.facts).toMatchObject({ inventory: [
      { itemId: 'item_ward', quantity: 1 }, { itemId: 'item_reward', quantity: 1 },
    ], knownLocations: ['loc_gate', 'loc_town', 'loc_rock'], questState: { status: 'completed', rewardClaimed: true },
      locationGraph: baseFacts.locationGraph.map(edge => {
        if (edge.from === 'loc_gate' && edge.to === 'loc_town') return { ...edge, state: 'open' };
        if (edge.from === 'loc_town' && edge.to === 'loc_rock') return { ...edge, state: 'open' };
        return edge;
      }) });
    const completed = replay(result);
    expect(act('quest', { questId: 'quest_fixture', choiceId: 'claim_reward' }, completed).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_QUEST_ALREADY_CLAIMED' });
  });

  it('rejects an unavailable or malformed quest claim and protects the reward inventory slot', () => {
    expect(act('quest', { questId: 'quest_missing', choiceId: 'claim_reward' }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_NO_SUCH_TARGET' });
    expect(act('quest', { questId: 'quest_fixture', choiceId: 'start' }).decision)
      .toMatchObject({ status: 'rejected', code: 'INPUT_UNKNOWN_ACTION' });
    expect(act('quest', { questId: 'quest_fixture', choiceId: 'claim_reward' }).decision)
      .toMatchObject({ status: 'rejected', code: 'ENV_QUEST_NOT_READY' });

    const fullItemIds = ['item_ward', 'item_herb', ...Array.from({ length: 6 }, (_, index) => `item_extra_${index}`)];
    const fullBook = { ...book, itemIds: [...book.itemIds, ...fullItemIds.filter(itemId => !book.itemIds.includes(itemId))] };
    const fullModule = createPrologueV1RuleModule({
      rulebook: fullBook, mechanics: PROLOGUE_V1, messages: PROLOGUE_V1_ERROR_MESSAGES,
    });
    const fullInventory = fullItemIds.map(itemId => ({ itemId, quantity: 1 }));
    const fullSave = save({
      inventory: fullInventory,
      locationGraph: baseFacts.locationGraph.map(edge => edge.from === 'loc_gate' && edge.to === 'loc_town'
        ? { ...edge, state: 'open' as const } : edge),
      obstacleState: 'cleared',
      questState: { status: 'completed', rewardClaimed: false },
      ferryState: 'clear',
    });
    const stateBefore = structuredClone(fullSave.state);
    const invalid = act('quest', { questId: 'quest_fixture', choiceId: 'claim_reward' }, fullSave, fullModule);
    expect(invalid.decision).toMatchObject({ status: 'rejected', code: 'INPUT_INVENTORY_FULL', revision: 0 });
    expect(invalid.decision.status === 'rejected' && 'events' in invalid.decision).toBe(false);
    expect(invalid.current.state).toEqual(stateBefore);
  });

  it('clarifies unparsed natural language without writing an event', () => {
    const result = act('free_text', { text: '我想去看看石头' });
    expect(result.decision).toMatchObject({ status: 'clarify', missingSlots: ['action'], candidates: [], revision: 0 });
  });
});
