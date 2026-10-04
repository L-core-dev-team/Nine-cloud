import {
  ActionIntentSchema,
  MAX_CULTIVATION_KES_PER_ACTION,
  PROLOGUE_V1_LOCATION_LIMIT,
  DomainEventSchema,
  PrologueV1FactsSchema,
  StateDeltaSchema,
  WorldStateSchema,
  type ActionIntent,
  type DecisionV2,
  type DomainEvent,
  type PrologueV1Facts,
  type SaveEnvelope,
  type StateDelta,
  type WorldState,
} from '@jiuxiao/contracts';
import { applyStateDelta, canonicalJson } from './state-delta.js';
import { bindRuleEvents, type RuleInvocationContext, type RuleEventDraft, type VersionedRuleModule } from './rules.js';
import { isDaylight, projectDailyStamina } from './prologue-v1-time.js';

export interface PrologueV1Mechanics {
  readonly GAME_MINUTES_PER_KEC: number;
  readonly DAY_KEC_COUNT: number;
  readonly SAVE_START_GAME_MINUTE: number;
  readonly DUSK_START_KEC: number;
  readonly STAMINA_MAX: number;
  readonly SPIRIT_MAX: number;
  readonly CULTIVATION_MAX: number;
  readonly CULTIVATION_PER_KE: number;
  readonly CULTIVATION_FATIGUE: number;
  readonly FATIGUE_THRESHOLD: number;
  readonly SLOT_MAX: number;
  readonly MOVE_COST: number;
  readonly MOVE_BLOCKED_COST: number;
  readonly MOVE_BYPASS_COST: number;
  readonly OBSERVE_SCAN_COST: number;
  readonly OBSERVE_STUDY_COST: number;
  readonly CULTIVATE_COST_PER_KE: number;
  readonly COMBAT_COST: number;
  readonly CLEAR_THRESHOLD: number;
  readonly RETREAT_SPIRIT: number;
};

export interface PrologueV1Rulebook {
  readonly ruleVersion: string;
  readonly canonVersion: string;
  readonly locationIds: readonly string[];
  readonly initialKnownLocationIds: readonly string[];
  readonly itemIds: readonly string[];
  readonly clueIds: readonly string[];
  readonly effectFlagIds: readonly string[];
  readonly injuryFlagIds: readonly string[];
  readonly targetIds: readonly string[];
  /** Complete content-owned graph at new-game creation. */
  readonly initialLocationGraph: readonly {
    readonly from: string;
    readonly to: string;
    readonly state: 'open' | 'blocked' | 'locked';
    readonly via?: string;
  }[];
  /** The blocked map edge opened by any of the signed obstacle-clearance routes. */
  readonly obstacleRoute: { readonly from: string; readonly to: string };
  readonly unexploredEdges: readonly { readonly from: string; readonly to: string }[];
  readonly bypassRoutes: readonly {
    readonly from: string;
    readonly to: string;
    readonly via: string;
    readonly requiredItemId?: string;
    readonly clearsObstacle?: boolean;
  }[];
  readonly cultivationTechniqueIds: readonly string[];
  readonly combatTechniqueIds: readonly string[];
  readonly acquisitionSources: readonly {
    readonly sourceId: string;
    readonly locationId: string;
    readonly itemId: string;
    readonly source: 'field' | 'npc' | 'quest';
    readonly quantity: number;
  }[];
  readonly itemUses: readonly {
    readonly itemId: string;
    readonly targetIds: readonly string[];
    readonly effectFlags: readonly string[];
  }[];
  readonly npcs: readonly {
    readonly npcId: string;
    readonly locationId: string;
    readonly topics: readonly {
      readonly topicTag: string;
      readonly utterances: readonly string[];
      readonly clueId?: string;
      readonly clearsObstacle?: boolean;
    }[];
  }[];
  readonly observations: readonly {
    readonly targetId: string;
    readonly locationId: string;
    readonly scanClueId?: string;
    readonly studyClueId?: string;
    readonly blocked?: { readonly when: 'always' | 'dark'; readonly reason: string };
  }[];
  readonly combatTargets: readonly {
    readonly targetId: string;
    readonly locationId: string;
    readonly clearsObstacle?: boolean;
    readonly workSiteLocationId?: string;
    readonly protectionItemId?: string;
    readonly retreatLocationId: string;
    readonly daytimeInjuryFlag: string;
    readonly darkInjuryFlag: string;
    readonly retreatInjuryFlag: string;
  }[];
  readonly quest: {
    readonly questId: string;
    readonly rewardItemId: string;
    readonly unlockEdge: {
      readonly from: string;
      readonly to: string;
      readonly state: 'open';
      readonly via?: string;
    };
  };
  readonly injuryFlags: {
    readonly shoulderScrape: string;
  };
}

export interface PrologueV1RuleDependencies {
  readonly rulebook: PrologueV1Rulebook;
  /** Production callers pass the single content-owned constants object. */
  readonly mechanics: PrologueV1Mechanics;
  readonly messages: Readonly<Record<string, string>>;
}

interface Transition {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly before: WorldState;
  readonly after: WorldState;
}

type Resolution =
  | { readonly status: 'accepted'; readonly outcome: 'success' | 'legal_failure'; readonly code?: string; readonly transitions: readonly Transition[] }
  | { readonly status: 'rejected'; readonly code: string }
  | { readonly status: 'clarify'; readonly question: string; readonly missingSlots: readonly string[]; readonly candidates: readonly []; readonly interactionId: string };

/**
 * Create a pure, version-bound P1 rules module. Canon facts arrive as a separate
 * immutable rulebook, so synthetic tests can exercise mechanics without
 * activating unreviewed prologue content.
 */
export function createPrologueV1RuleModule(dependencies: PrologueV1RuleDependencies): VersionedRuleModule {
  validateDependencies(dependencies);
  const rulebook = deepFreeze(structuredClone(dependencies.rulebook));
  const mechanics = deepFreeze(structuredClone(dependencies.mechanics));
  const messages = deepFreeze(structuredClone(dependencies.messages));

  return Object.freeze({
    ruleVersion: rulebook.ruleVersion,
    canonVersion: rulebook.canonVersion,
    decide(intent: ActionIntent, save: SaveEnvelope, context: RuleInvocationContext): DecisionV2 {
      const rawIntent = intent as unknown as { kind?: unknown; payload?: { minutes?: unknown } };
      if (rawIntent.kind === 'cultivate' && typeof rawIntent.payload?.minutes === 'number' &&
          rawIntent.payload.minutes > MAX_CULTIVATION_KES_PER_ACTION) {
        return rejected('INPUT_CULTIVATION_LIMIT', save.revision, messages);
      }
      const parsedIntent = ActionIntentSchema.safeParse(intent);
      const parsedSave = WorldStateSchema.safeParse(save.state);
      if (!parsedIntent.success || !parsedSave.success) return rejected('ENV_PAYLOAD_INVALID', save.revision, messages);

      let facts: PrologueV1Facts;
      try {
        facts = PrologueV1FactsSchema.parse(parsedSave.data.facts);
      } catch {
        return rejected('ENV_PAYLOAD_INVALID', save.revision, messages);
      }

      const state = WorldStateSchema.parse({ ...parsedSave.data, facts });
      try {
        validateFactsAgainstRulebook(state, facts, rulebook, mechanics);
      } catch {
        return rejected('ENV_PAYLOAD_INVALID', save.revision, messages);
      }
      let resolution: Resolution;
      try {
        resolution = resolveAction(parsedIntent.data, state, facts, rulebook, mechanics, messages);
      } catch {
        return rejected('ENV_PAYLOAD_INVALID', save.revision, messages);
      }
      if (resolution.status === 'rejected') return rejected(resolution.code, save.revision, messages);
      if (resolution.status === 'clarify') {
        return {
          status: 'clarify',
          question: resolution.question,
          missingSlots: [...resolution.missingSlots],
          candidates: [],
          interactionId: resolution.interactionId,
          revision: save.revision,
        };
      }
      if (resolution.transitions.length === 0) return rejected('ENV_PAYLOAD_INVALID', save.revision, messages);

      try {
        const drafts: RuleEventDraft[] = resolution.transitions.map(transition => ({
          type: transition.type,
          payload: {
            ...transition.payload,
            stateDelta: stateDeltaBetween(transition.before, transition.after),
          },
        }));
        const events = bindRuleEvents(drafts, parsedIntent.data, save, context);
        return {
          status: 'accepted',
          outcome: resolution.outcome,
          ...(resolution.code ? { code: resolution.code } : {}),
          events,
          nextRevision: save.revision + 1,
        };
      } catch {
        return rejected('ENV_PAYLOAD_INVALID', save.revision, messages);
      }
    },
  });
}

/** Apply only rule events produced by this versioned prologue reducer. */
export function createPrologueV1EventReducer(dependencies: PrologueV1RuleDependencies): (state: WorldState, event: DomainEvent) => WorldState {
  validateDependencies(dependencies);
  const book = deepFreeze(structuredClone(dependencies.rulebook));
  const mechanics = deepFreeze(structuredClone(dependencies.mechanics));
  return (rawState, rawEvent) => {
    const state = WorldStateSchema.parse(rawState);
    const event = DomainEventSchema.parse(rawEvent);
    if (event.source !== 'RULES' || event.ruleVersion !== book.ruleVersion || !PROLOGUE_EVENT_TYPES.has(event.type)) {
      throw new Error('INVALID_PROLOGUE_RULE_EVENT');
    }
    validateFactsAgainstRulebook(state, PrologueV1FactsSchema.parse(state.facts), book, mechanics);
    const delta = StateDeltaSchema.parse(event.payload.stateDelta);
    const projected = applyStateDelta(state, delta);
    const facts = PrologueV1FactsSchema.parse(projected.facts);
    validateFactsAgainstRulebook(projected, facts, book, mechanics);
    return projected;
  };
}

const PROLOGUE_EVENT_TYPES = new Set([
  'move.arrived', 'move.blocked', 'move.bypassed', 'cultivate.attempted',
  'item.acquired', 'item.consumed', 'item.depleted', 'talk.occurred',
  'talk.topic_learned', 'combat.resolved', 'observe.result',
  'quest.completed', 'quest.reward_claimed',
]);

function resolveAction(
  action: ActionIntent,
  state: WorldState,
  initialFacts: PrologueV1Facts,
  book: PrologueV1Rulebook,
  m: PrologueV1Mechanics,
  messages: Readonly<Record<string, string>>,
): Resolution {
  switch (action.kind) {
    case 'move': return resolveMove(action, state, initialFacts, book, m);
    case 'cultivate': return resolveCultivation(action, state, initialFacts, book, m);
    case 'acquire_item': return resolveAcquisition(action, state, initialFacts, book, m);
    case 'use_item': return resolveItemUse(action, state, initialFacts, book, m);
    case 'talk': return resolveTalk(action, state, initialFacts, book, m);
    case 'observe': return resolveObservation(action, state, initialFacts, book, m);
    case 'combat': return resolveCombat(action, state, initialFacts, book, m);
    case 'quest': return resolveQuest(action, state, initialFacts, book, m);
    case 'free_text': return {
      status: 'clarify', question: messages.INPUT_UNKNOWN_ACTION ?? '我没听清你要做什么，换种说法试试。',
      missingSlots: ['action'], candidates: [], interactionId: action.idempotencyKey,
    };
  }
}

function resolveMove(action: Extract<ActionIntent, { kind: 'move' }>, state: WorldState, facts: PrologueV1Facts,
  book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  const to = action.payload.destinationId;
  if (!book.locationIds.includes(to)) return reject('INPUT_NO_SUCH_TARGET');
  const dailyFacts = readDailyResources(facts, m);
  const edge = facts.locationGraph.find(candidate => candidate.from === state.locationId && candidate.to === to);
  const unexplored = book.unexploredEdges.some(candidate => candidate.from === state.locationId && candidate.to === to);

  if (!facts.knownLocations.includes(to)) {
    if (!unexplored) return reject('ENV_ROUTE_NOT_CONNECTED');
    const after = advance(state, { ...dailyFacts,
      stamina: debit(dailyFacts.stamina, m.MOVE_COST),
      travelLog: [...facts.travelLog, { toward: to, reason: 'unexplored' }],
    }, 1, m, state.locationId);
    return accepted('legal_failure', 'RULE_LOCATION_UNEXPLORED', [transition('move.blocked', {
      toward: to, reason: 'unexplored', kecCount: 1,
    }, state, after)]);
  }
  if (!edge) return reject('ENV_ROUTE_NOT_CONNECTED');
  if (edge.state === 'locked') return reject('ENV_ROUTE_LOCKED');

  if (edge.state === 'blocked') {
    const bypass = book.bypassRoutes.find(route => route.from === state.locationId && route.to === to &&
      (!route.requiredItemId || owns(facts, route.requiredItemId)));
    if (bypass) {
      const flags = appendUnique(facts.injuryFlags, book.injuryFlags.shoulderScrape);
    const graph = facts.locationGraph.map(candidate => candidate.from === edge.from && candidate.to === edge.to
        ? { ...candidate, state: 'open' as const, ...(bypass.via ? { via: bypass.via } : {}) }
        : candidate);
      const after = advance(state, { ...dailyFacts,
        stamina: debit(dailyFacts.stamina, m.MOVE_BYPASS_COST),
        obstacleState: bypass.clearsObstacle ? 'cleared' : facts.obstacleState,
        locationGraph: graph,
        injuryFlags: flags,
      }, 2, m, to);
      const transitions = [transition('move.bypassed', {
        toward: to, via: bypass.via, kecCount: 2, extraKecCount: 1,
      }, state, after)];
      return includeQuestCompletion(transitions, after, facts, book);
    }
    const after = advance(state, { ...dailyFacts,
      stamina: debit(dailyFacts.stamina, m.MOVE_BLOCKED_COST),
      travelLog: [...facts.travelLog, { toward: to, reason: 'rockslide' }],
    }, 1, m, state.locationId);
    return accepted('legal_failure', 'RULE_ROAD_BLOCKED', [transition('move.blocked', {
      toward: to, reason: 'rockslide', kecCount: 1,
    }, state, after)]);
  }

  const after = advance(state, { ...dailyFacts,
    stamina: debit(dailyFacts.stamina, m.MOVE_COST),
  }, 1, m, to);
  return accepted('success', undefined, [transition('move.arrived', {
    from: state.locationId, to, kecCount: 1,
  }, state, after)]);
}

function resolveCultivation(action: Extract<ActionIntent, { kind: 'cultivate' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  if (!book.cultivationTechniqueIds.includes(action.payload.techniqueId)) return reject('ENV_TECHNIQUE_LOCKED');
  if (facts.cultivationProgress >= m.CULTIVATION_MAX) return reject('ENV_CULTIVATION_COMPLETE');
  const ready = readDailyResources(facts, m);
  if (ready.stamina === 0) return reject('ENV_STAMINA_EMPTY');

  const requestedKecCount = action.payload.minutes;
  if (requestedKecCount > MAX_CULTIVATION_KES_PER_ACTION) return reject('INPUT_CULTIVATION_LIMIT');
  const normalKecCount = Math.min(requestedKecCount, Math.floor(ready.stamina / m.CULTIVATE_COST_PER_KE));
  const remaining = ready.stamina - normalKecCount * m.CULTIVATE_COST_PER_KE;
  const fatiguedKec = normalKecCount < requestedKecCount && remaining > 0;
  const attemptedKecCount = normalKecCount + (fatiguedKec ? 1 : 0);
  if (attemptedKecCount < 1) return reject('ENV_STAMINA_EMPTY');

  const progress = Math.min(m.CULTIVATION_MAX,
    facts.cultivationProgress + normalKecCount * m.CULTIVATION_PER_KE + (fatiguedKec ? m.CULTIVATION_FATIGUE : 0));
  const after = advance(state, {
    ...ready,
    stamina: fatiguedKec ? 0 : remaining,
    cultivationProgress: progress,
    fatigueCount: facts.fatigueCount + (fatiguedKec ? 1 : 0),
  }, attemptedKecCount, m, state.locationId);
  const result = fatiguedKec ? 'fatigue' : 'progress';
  const payload = {
    techniqueId: action.payload.techniqueId,
    kecCount: attemptedKecCount,
    requestedKecCount,
    attemptedKecCount,
    result,
  };
  return accepted(fatiguedKec ? 'legal_failure' : 'success', fatiguedKec ? 'RULE_STAMINA_LOW' : undefined,
    [transition('cultivate.attempted', payload, state, after)]);
}

function resolveAcquisition(action: Extract<ActionIntent, { kind: 'acquire_item' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  const source = book.acquisitionSources.find(candidate => candidate.itemId === action.payload.itemId &&
    candidate.locationId === state.locationId);
  if (!source) return reject('INPUT_NO_SUCH_TARGET');
  if (facts.collectedSources.includes(source.sourceId)) return reject('ENV_SOURCE_ALREADY_CLAIMED');
  if (source.quantity !== action.payload.quantity) return reject('ENV_SOURCE_QUANTITY_INVALID');
  if (!canAddInventory(facts, source.itemId, source.quantity, m.SLOT_MAX)) return reject('INPUT_INVENTORY_FULL');

  const afterFacts = {
    ...facts,
    inventory: addInventory(facts.inventory, source.itemId, source.quantity),
    collectedSources: [...facts.collectedSources, source.sourceId],
  };
  const after = advance(state, afterFacts, 1, m, state.locationId);
  return accepted('success', undefined, [transition('item.acquired', {
    itemId: source.itemId, quantity: source.quantity, source: source.source, sourceId: source.sourceId,
    kecCount: 1,
  }, state, after)]);
}

function resolveItemUse(action: Extract<ActionIntent, { kind: 'use_item' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  const item = facts.inventory.find(entry => entry.itemId === action.payload.itemId);
  if (!item) return reject('ENV_ITEM_NOT_OWNED');
  const use = book.itemUses.find(candidate => candidate.itemId === item.itemId);
  if (!use || (use.targetIds.length === 0 ? action.payload.targetId !== undefined
      : action.payload.targetId === undefined || !use.targetIds.includes(action.payload.targetId))) {
    return reject('ENV_TARGET_MISMATCH');
  }
  const inventory = item.quantity === 1
    ? facts.inventory.filter(entry => entry.itemId !== item.itemId)
    : facts.inventory.map(entry => entry.itemId === item.itemId ? { ...entry, quantity: entry.quantity - 1 } : entry);
  const after = advance(state, {
    ...facts,
    inventory,
    effectFlags: use.effectFlags.reduce((flags, effect) => appendUnique(flags, effect), [...facts.effectFlags]),
  }, 1, m, state.locationId);
  const transitions = [transition('item.consumed', {
    itemId: item.itemId, quantity: 1, effect: [...use.effectFlags], kecCount: 1,
  }, state, after)];
  if (item.quantity === 1) transitions.push(transition('item.depleted', { itemId: item.itemId }, after, after));
  return accepted('success', undefined, transitions);
}

function resolveTalk(action: Extract<ActionIntent, { kind: 'talk' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  const npc = book.npcs.find(candidate => candidate.npcId === action.payload.npcId);
  if (!npc) return reject('INPUT_NO_SUCH_TARGET');
  if (npc.locationId !== state.locationId) return reject('AUTH_NPC_ABSENT');
  const normalized = normalizeUtterance(action.payload.utterance);
  const matches = npc.topics.filter(topic => topic.utterances.some(utterance => normalizeUtterance(utterance) === normalized));
  if (matches.length > 1) return reject('INPUT_AMBIGUOUS');
  const topic = matches[0];
  const tag = topic?.topicTag ?? 'unmatched';
  let after = advance(state, {
    ...facts,
    idleCount: facts.idleCount + (topic ? 0 : 1),
    npcInteractionLog: [...facts.npcInteractionLog, {
      npcId: npc.npcId, topicTag: tag, outcome: topic ? 'on_topic' : 'idle',
    }],
    ...(topic?.clearsObstacle ? { obstacleState: 'cleared' as const } : {}),
    ...(topic?.clearsObstacle ? { locationGraph: openObstacleRoute(facts.locationGraph, book) } : {}),
  }, 1, m, state.locationId);
  const transitions: Transition[] = [transition('talk.occurred', {
    npcId: npc.npcId, topicTag: tag, outcome: topic ? 'on_topic' : 'idle', kecCount: 1,
  }, state, after)];

  if (topic?.clueId && !facts.clues.includes(topic.clueId)) {
    const withClue = withFacts(after, { ...PrologueV1FactsSchema.parse(after.facts),
      clues: appendUnique(PrologueV1FactsSchema.parse(after.facts).clues, topic.clueId),
    });
    transitions.push(transition('talk.topic_learned', { npcId: npc.npcId, clueId: topic.clueId }, after, withClue));
    after = withClue;
  }
  if (topic?.clearsObstacle) {
    return includeQuestCompletion(transitions, after, facts, book,
      topic ? 'success' : 'legal_failure', topic ? undefined : 'RULE_TALK_IDLE');
  }
  return accepted(topic ? 'success' : 'legal_failure', topic ? undefined : 'RULE_TALK_IDLE', transitions);
}

function resolveObservation(action: Extract<ActionIntent, { kind: 'observe' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  const target = book.observations.find(candidate => candidate.targetId === action.payload.targetId);
  if (!target) return reject('INPUT_NO_SUCH_TARGET');
  if (target.locationId !== state.locationId) return reject('AUTH_UNAUTHORIZED_TARGET');
  const ready = readDailyResources(facts, m);
  const kes = action.payload.method === 'scan' ? 1 : 2;
  const cost = action.payload.method === 'scan' ? m.OBSERVE_SCAN_COST : m.OBSERVE_STUDY_COST;
  const repeatedStudy = action.payload.method === 'study' && facts.observationLog.some(entry =>
    entry.targetId === target.targetId && entry.method === 'study' && entry.result === 'found');
  const dark = !isDaylight(facts.gameMinute, {
    dayStartGameMinute: m.SAVE_START_GAME_MINUTE,
    dayKecCount: m.DAY_KEC_COUNT,
    gameMinutesPerKec: m.GAME_MINUTES_PER_KEC,
    duskStartKec: m.DUSK_START_KEC,
  });
  const blockedReason = target.blocked && (target.blocked.when === 'always' || dark)
    ? target.blocked.reason : undefined;
  const clueId = action.payload.method === 'scan' ? target.scanClueId : target.studyClueId;
  const alreadyKnown = clueId !== undefined && facts.clues.includes(clueId);
  const result: 'blocked' | 'none' | 'found' = blockedReason ? 'blocked'
    : repeatedStudy || alreadyKnown || !clueId ? 'none' : 'found';
  const observation: PrologueV1Facts['observationLog'][number] = {
    targetId: target.targetId,
    method: action.payload.method,
    result,
    ...(clueId && result === 'found' ? { clueId, clueLevel: kes } : {}),
    ...(blockedReason ? { blockedReason } : {}),
  };
  const after = advance(state, {
    ...ready,
    stamina: debit(ready.stamina, cost),
    observationLog: [...facts.observationLog, observation],
    ...(result === 'found' && clueId ? { clues: appendUnique(facts.clues, clueId) } : {}),
  }, kes, m, state.locationId);
  const typePayload = {
    targetId: target.targetId, method: action.payload.method, result,
    kecCount: kes,
    ...(result === 'found' && clueId ? { clueId, clueLevel: kes } : {}),
    ...(blockedReason ? { blockedReason } : {}),
  };
  if (blockedReason) return accepted('legal_failure', 'RULE_OBSERVE_BLOCKED', [transition('observe.result', typePayload, state, after)]);
  if (result === 'none') return accepted('legal_failure', 'RULE_NO_NEW_DISCOVERY', [transition('observe.result', typePayload, state, after)]);
  return accepted('success', undefined, [transition('observe.result', typePayload, state, after)]);
}

function resolveCombat(action: Extract<ActionIntent, { kind: 'combat' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  if (action.payload.techniqueId && !book.combatTechniqueIds.includes(action.payload.techniqueId)) {
    return reject('ENV_TECHNIQUE_LOCKED');
  }
  const target = book.combatTargets.find(candidate => candidate.targetId === action.payload.targetId);
  if (!target) return reject('INPUT_NO_SUCH_TARGET');
  if (target.locationId !== state.locationId) return reject('AUTH_UNAUTHORIZED_TARGET');
  if (target.clearsObstacle && facts.obstacleState === 'cleared') return reject('ENV_TARGET_ALREADY_RESOLVED');
  const ready = readDailyResources(facts, m);
  if (ready.spiritStamina === 0) return reject('ENV_SPIRIT_STAMINA_EMPTY');

  const retreat = ready.stamina < m.CLEAR_THRESHOLD || ready.spiritStamina < m.CLEAR_THRESHOLD;
  const dark = !isDaylight(facts.gameMinute, {
    dayStartGameMinute: m.SAVE_START_GAME_MINUTE,
    dayKecCount: m.DAY_KEC_COUNT,
    gameMinutesPerKec: m.GAME_MINUTES_PER_KEC,
    duskStartKec: m.DUSK_START_KEC,
  });
  const prepared = ready.stamina >= m.CLEAR_THRESHOLD &&
    ((target.workSiteLocationId !== undefined && state.locationId === target.workSiteLocationId) ||
      (target.protectionItemId !== undefined && owns(facts, target.protectionItemId)));
  const injury = retreat ? target.retreatInjuryFlag : dark ? target.darkInjuryFlag : prepared ? undefined : target.daytimeInjuryFlag;
  const outcome = retreat ? 'retreat' : injury ? 'clear_wounded' : 'clear';
  const nextFacts: PrologueV1Facts = {
    ...ready,
    stamina: debit(ready.stamina, m.COMBAT_COST),
    spiritStamina: retreat ? m.RETREAT_SPIRIT : Math.max(0, ready.spiritStamina - m.COMBAT_COST),
    injuryFlags: injury ? appendUnique(ready.injuryFlags, injury) : [...ready.injuryFlags],
    ...(retreat ? {} : target.clearsObstacle ? { obstacleState: 'cleared' as const } : {}),
    ...(retreat || !target.clearsObstacle ? {} : { locationGraph: openObstacleRoute(ready.locationGraph, book) }),
  };
  const after = advance(state, nextFacts, 2, m,
    retreat ? target.retreatLocationId : state.locationId);
  const transitions: Transition[] = [transition('combat.resolved', {
    targetId: target.targetId, outcome, ruleVersion: book.ruleVersion, kecCount: 2,
  }, state, after)];
  if (!retreat && target.clearsObstacle) {
    const withQuest = questCompletionState(after, facts, book);
    if (withQuest) {
      transitions.push(transition('quest.completed', { questId: book.quest!.questId }, after, withQuest));
    }
  }
  return retreat
    ? accepted('legal_failure', 'RULE_COMBAT_RETREAT', transitions)
    : accepted('success', undefined, transitions);
}

function resolveQuest(action: Extract<ActionIntent, { kind: 'quest' }>, state: WorldState,
  facts: PrologueV1Facts, book: PrologueV1Rulebook, m: PrologueV1Mechanics): Resolution {
  const quest = book.quest;
  if (!quest || action.payload.questId !== quest.questId) return reject('INPUT_NO_SUCH_TARGET');
  if (action.payload.choiceId !== 'claim_reward') return reject('INPUT_UNKNOWN_ACTION');
  if (facts.questState.status !== 'completed') return reject('ENV_QUEST_NOT_READY');
  if (facts.questState.rewardClaimed) return reject('ENV_QUEST_ALREADY_CLAIMED');
  if (!canAddInventory(facts, quest.rewardItemId, 1, m.SLOT_MAX)) return reject('INPUT_INVENTORY_FULL');

  const edge = facts.locationGraph.find(candidate => candidate.from === quest.unlockEdge.from && candidate.to === quest.unlockEdge.to);
  const graph = edge
    ? facts.locationGraph.map(candidate => candidate === edge ? { ...candidate, state: 'open' as const,
      ...(quest.unlockEdge.via ? { via: quest.unlockEdge.via } : {}) } : candidate)
    : [...facts.locationGraph, quest.unlockEdge];
  const after = advance(state, {
    ...facts,
    inventory: addInventory(facts.inventory, quest.rewardItemId, 1),
    questState: { ...facts.questState, rewardClaimed: true },
    knownLocations: appendUnique(facts.knownLocations, quest.unlockEdge.to),
    locationGraph: graph,
  }, 1, m, state.locationId);
  return accepted('success', undefined, [transition('quest.reward_claimed', {
    questId: quest.questId, rewardItemId: quest.rewardItemId, kecCount: 1,
  }, state, after)]);
}

function includeQuestCompletion(transitions: readonly Transition[], after: WorldState, beforeFacts: PrologueV1Facts,
  book: PrologueV1Rulebook, outcome: 'success' | 'legal_failure' = 'success', code?: string): Resolution {
  const completed = questCompletionState(after, beforeFacts, book);
  const all = [...transitions];
  if (completed) all.push(transition('quest.completed', { questId: book.quest!.questId }, after, completed));
  return accepted(outcome, code, all);
}

function questCompletionState(after: WorldState, beforeFacts: PrologueV1Facts, book: PrologueV1Rulebook): WorldState | undefined {
  const afterFacts = PrologueV1FactsSchema.parse(after.facts);
  if (!book.quest || beforeFacts.obstacleState === 'cleared' || afterFacts.obstacleState !== 'cleared' ||
      afterFacts.questState.status === 'completed') return undefined;
  return withFacts(after, {
    ...afterFacts,
    questState: { ...afterFacts.questState, status: 'completed' },
    ferryState: 'clear',
  });
}

function readDailyResources(facts: PrologueV1Facts, m: PrologueV1Mechanics): PrologueV1Facts {
  const daily = projectDailyStamina(facts.gameMinute, {
    stamina: facts.stamina,
    staminaDayIndex: facts.staminaDayIndex,
  }, {
    maxStamina: m.STAMINA_MAX,
    resetAnchorGameMinute: m.SAVE_START_GAME_MINUTE,
    dayKecCount: m.DAY_KEC_COUNT,
    gameMinutesPerKec: m.GAME_MINUTES_PER_KEC,
  });
  return PrologueV1FactsSchema.parse({
    ...facts,
    ...daily,
    // The signed rule says a retreat is recoverable the following game day.
    ...(daily.staminaDayIndex > facts.staminaDayIndex ? { spiritStamina: m.SPIRIT_MAX } : {}),
  });
}

function advance(state: WorldState, facts: PrologueV1Facts, kecCount: number, mechanics: PrologueV1Mechanics, locationId: string): WorldState {
  if (!Number.isSafeInteger(kecCount) || kecCount < 0) throw new RangeError('INVALID_ACTION_KEC_COUNT');
  const gameMinuteDelta = kecCount * mechanics.GAME_MINUTES_PER_KEC;
  if (!Number.isSafeInteger(gameMinuteDelta)) throw new RangeError('INVALID_ACTION_GAME_MINUTE_DELTA');
  const projectedFacts = PrologueV1FactsSchema.parse({ ...facts, gameMinute: facts.gameMinute + gameMinuteDelta });
  return WorldStateSchema.parse({
    ...state,
    locationId,
    elapsedMinutes: state.elapsedMinutes + gameMinuteDelta,
    facts: projectedFacts,
  });
}

function withFacts(state: WorldState, facts: PrologueV1Facts): WorldState {
  return WorldStateSchema.parse({ ...state, facts: PrologueV1FactsSchema.parse(facts) });
}

function transition(type: string, payload: Readonly<Record<string, unknown>>, before: WorldState, after: WorldState): Transition {
  return { type, payload, before, after };
}

function stateDeltaBetween(before: WorldState, after: WorldState): StateDelta {
  const oldFacts = before.facts as Record<string, unknown>;
  const newFacts = after.facts as Record<string, unknown>;
  const factChanges = [...new Set([...Object.keys(oldFacts), ...Object.keys(newFacts)])]
    .sort()
    .filter(key => Object.hasOwn(oldFacts, key) !== Object.hasOwn(newFacts, key) ||
      (Object.hasOwn(oldFacts, key) && canonicalJson(oldFacts[key]) !== canonicalJson(newFacts[key])))
    .map(key => ({
      key,
      before: Object.hasOwn(oldFacts, key) ? { present: true as const, value: oldFacts[key] as never } : { present: false as const },
      after: Object.hasOwn(newFacts, key) ? { present: true as const, value: newFacts[key] as never } : { present: false as const },
    }));
  return StateDeltaSchema.parse({
    timeChange: after.elapsedMinutes - before.elapsedMinutes,
    locationChange: before.locationId === after.locationId ? null : { before: before.locationId, after: after.locationId },
    factChanges,
  });
}

function addInventory(inventory: PrologueV1Facts['inventory'], itemId: string, quantity: number) {
  const existing = inventory.find(item => item.itemId === itemId);
  return existing
    ? inventory.map(item => item.itemId === itemId ? { ...item, quantity: item.quantity + quantity } : item)
    : [...inventory, { itemId, quantity }];
}

function canAddInventory(facts: PrologueV1Facts, itemId: string, quantity: number, slotMax: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 &&
    (facts.inventory.some(item => item.itemId === itemId) || facts.inventory.length < slotMax) &&
    (!facts.inventory.some(item => item.itemId === itemId) ||
      Number.isSafeInteger(facts.inventory.find(item => item.itemId === itemId)!.quantity + quantity));
}

function owns(facts: PrologueV1Facts, itemId: string): boolean {
  return facts.inventory.some(item => item.itemId === itemId && item.quantity > 0);
}

function debit(value: number, cost: number): number {
  return Math.max(0, value - cost);
}

function appendUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function normalizeUtterance(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]/gu, '');
}

function accepted(outcome: 'success' | 'legal_failure', code: string | undefined, transitions: readonly Transition[]): Resolution {
  return { status: 'accepted', outcome, ...(code ? { code } : {}), transitions };
}

function reject(code: string): Resolution {
  return { status: 'rejected', code };
}

function rejected(code: string, revision: number, messages: Readonly<Record<string, string>>): DecisionV2 {
  return { status: 'rejected', code: code as `AUTH_${string}` | `ENV_${string}` | `INPUT_${string}`,
    message: messages[code] ?? '行动未结算。', revision };
}

function validateDependencies({ rulebook, mechanics, messages }: PrologueV1RuleDependencies): void {
  assertId(rulebook.ruleVersion, 'RULE_VERSION_REQUIRED');
  assertId(rulebook.canonVersion, 'CANON_VERSION_REQUIRED');
  assertUnique(rulebook.locationIds, 'LOCATION_IDS');
  assertUnique(rulebook.initialKnownLocationIds, 'INITIAL_KNOWN_LOCATION_IDS');
  if (rulebook.locationIds.length !== PROLOGUE_V1_LOCATION_LIMIT ||
      rulebook.initialKnownLocationIds.length !== PROLOGUE_V1_LOCATION_LIMIT - 1 ||
      rulebook.initialKnownLocationIds.some(id => !rulebook.locationIds.includes(id))) {
    throw new TypeError('INVALID_PROLOGUE_LOCATION_SET');
  }
  assertUnique(rulebook.itemIds, 'ITEM_IDS');
  assertUnique(rulebook.clueIds, 'CLUE_IDS');
  assertUnique(rulebook.effectFlagIds, 'EFFECT_FLAG_IDS');
  assertUnique(rulebook.injuryFlagIds, 'INJURY_FLAG_IDS');
  assertUnique(rulebook.targetIds, 'TARGET_IDS');
  for (const id of rulebook.initialKnownLocationIds) assertId(id, 'INVALID_INITIAL_KNOWN_LOCATION_ID');
  assertUnique(rulebook.initialLocationGraph.map(edge => `${edge.from}\0${edge.to}`), 'INITIAL_LOCATION_EDGES');
  assertUnique(rulebook.cultivationTechniqueIds, 'TECHNIQUE_IDS');
  assertUnique(rulebook.combatTechniqueIds, 'COMBAT_TECHNIQUE_IDS');
  assertUnique(rulebook.acquisitionSources.map(source => source.sourceId), 'ACQUISITION_SOURCE_IDS');
  assertUnique(rulebook.acquisitionSources.map(source => `${source.locationId}\0${source.itemId}`), 'ACQUISITION_SOURCE_MATCHES');
  assertUnique(rulebook.itemUses.map(item => item.itemId), 'ITEM_USE_IDS');
  assertUnique(rulebook.npcs.map(npc => npc.npcId), 'NPC_IDS');
  assertUnique(rulebook.observations.map(target => target.targetId), 'OBSERVATION_TARGET_IDS');
  assertUnique(rulebook.combatTargets.map(target => target.targetId), 'COMBAT_TARGET_IDS');
  assertUnique(rulebook.unexploredEdges.map(edge => `${edge.from}\0${edge.to}`), 'UNEXPLORED_EDGES');
  assertUnique(rulebook.bypassRoutes.map(route => `${route.from}\0${route.to}`), 'BYPASS_ROUTES');
  for (const id of rulebook.locationIds) assertId(id, 'INVALID_LOCATION_ID');
  for (const id of rulebook.itemIds) assertId(id, 'INVALID_ITEM_ID');
  for (const id of rulebook.clueIds) assertId(id, 'INVALID_CLUE_ID');
  for (const id of rulebook.effectFlagIds) assertId(id, 'INVALID_EFFECT_FLAG');
  for (const id of rulebook.injuryFlagIds) assertId(id, 'INVALID_INJURY_FLAG');
  for (const id of rulebook.targetIds) assertId(id, 'INVALID_TARGET_ID');
  for (const id of rulebook.cultivationTechniqueIds) assertId(id, 'INVALID_CULTIVATION_TECHNIQUE_ID');
  for (const id of rulebook.combatTechniqueIds) assertId(id, 'INVALID_COMBAT_TECHNIQUE_ID');
  for (const edge of rulebook.initialLocationGraph) {
    assertId(edge.from, 'INVALID_INITIAL_ROUTE_FROM'); assertId(edge.to, 'INVALID_INITIAL_ROUTE_TO');
    if (edge.via !== undefined) assertId(edge.via, 'INVALID_INITIAL_ROUTE_ID');
    if (!['open', 'blocked', 'locked'].includes(edge.state) ||
        !rulebook.locationIds.includes(edge.from) || !rulebook.locationIds.includes(edge.to)) {
      throw new TypeError('INITIAL_ROUTE_REFERENCE_NOT_FOUND');
    }
  }
  assertId(rulebook.obstacleRoute.from, 'INVALID_OBSTACLE_ROUTE_FROM');
  assertId(rulebook.obstacleRoute.to, 'INVALID_OBSTACLE_ROUTE_TO');
  const obstacleEdge = rulebook.initialLocationGraph.find(edge => edge.from === rulebook.obstacleRoute.from &&
    edge.to === rulebook.obstacleRoute.to);
  if (!obstacleEdge || obstacleEdge.state !== 'blocked') throw new TypeError('OBSTACLE_ROUTE_MUST_START_BLOCKED');
  if (!rulebook.bypassRoutes.some(route => route.from === rulebook.obstacleRoute.from &&
      route.to === rulebook.obstacleRoute.to)) throw new TypeError('OBSTACLE_ROUTE_BYPASS_REQUIRED');
  for (const source of rulebook.acquisitionSources) {
    assertId(source.sourceId, 'INVALID_SOURCE_ID'); assertId(source.locationId, 'INVALID_SOURCE_LOCATION');
    assertId(source.itemId, 'INVALID_SOURCE_ITEM');
    if (!rulebook.locationIds.includes(source.locationId) || !rulebook.itemIds.includes(source.itemId)) {
      throw new TypeError('ACQUISITION_SOURCE_REFERENCE_NOT_FOUND');
    }
    if (!Number.isSafeInteger(source.quantity) || source.quantity <= 0) throw new TypeError('INVALID_SOURCE_QUANTITY');
    if (!['field', 'npc', 'quest'].includes(source.source)) throw new TypeError('INVALID_ACQUISITION_SOURCE_KIND');
  }
  for (const rule of rulebook.itemUses) {
    assertId(rule.itemId, 'INVALID_ITEM_USE_ID');
    if (!rulebook.itemIds.includes(rule.itemId)) throw new TypeError('ITEM_USE_REFERENCE_NOT_FOUND');
    if (rule.effectFlags.length === 0) throw new TypeError('ITEM_USE_EFFECT_REQUIRED');
    for (const effect of rule.effectFlags) {
      assertId(effect, 'INVALID_ITEM_EFFECT');
      if (!rulebook.effectFlagIds.includes(effect)) throw new TypeError('ITEM_EFFECT_REFERENCE_NOT_FOUND');
    }
    for (const target of rule.targetIds) if (!rulebook.targetIds.includes(target)) throw new TypeError('ITEM_TARGET_REFERENCE_NOT_FOUND');
  }
  for (const npc of rulebook.npcs) {
    assertId(npc.npcId, 'INVALID_NPC_ID'); assertId(npc.locationId, 'INVALID_NPC_LOCATION');
    if (!rulebook.locationIds.includes(npc.locationId) || !rulebook.targetIds.includes(npc.npcId)) {
      throw new TypeError('NPC_REFERENCE_NOT_FOUND');
    }
    assertUnique(npc.topics.flatMap(topic => topic.utterances.map(normalizeUtterance)), `TOPIC_UTTERANCES_${npc.npcId}`);
    assertUnique(npc.topics.map(topic => topic.topicTag), `TOPIC_TAGS_${npc.npcId}`);
    for (const topic of npc.topics) {
      assertId(topic.topicTag, 'INVALID_TOPIC_TAG');
      if (topic.clueId && !rulebook.clueIds.includes(topic.clueId)) throw new TypeError('NPC_CLUE_REFERENCE_NOT_FOUND');
      if (topic.utterances.length === 0) throw new TypeError('TOPIC_UTTERANCE_REQUIRED');
      for (const phrase of topic.utterances) if (!normalizeUtterance(phrase)) throw new TypeError('EMPTY_TOPIC_UTTERANCE');
    }
  }
  for (const target of rulebook.observations) {
    assertId(target.targetId, 'INVALID_OBSERVATION_TARGET'); assertId(target.locationId, 'INVALID_OBSERVATION_LOCATION');
    if (!rulebook.locationIds.includes(target.locationId) || !rulebook.targetIds.includes(target.targetId) ||
        (target.scanClueId && !rulebook.clueIds.includes(target.scanClueId)) ||
        (target.studyClueId && !rulebook.clueIds.includes(target.studyClueId))) {
      throw new TypeError('OBSERVATION_REFERENCE_NOT_FOUND');
    }
    if (target.blocked && (!['always', 'dark'].includes(target.blocked.when) || !target.blocked.reason.trim())) {
      throw new TypeError('INVALID_OBSERVATION_BLOCK_RULE');
    }
  }
  for (const target of rulebook.combatTargets) {
    assertId(target.targetId, 'INVALID_COMBAT_TARGET'); assertId(target.locationId, 'INVALID_COMBAT_LOCATION');
    assertId(target.retreatLocationId, 'INVALID_RETREAT_LOCATION'); assertId(target.daytimeInjuryFlag, 'INVALID_INJURY_FLAG');
    assertId(target.darkInjuryFlag, 'INVALID_INJURY_FLAG'); assertId(target.retreatInjuryFlag, 'INVALID_INJURY_FLAG');
    if (!rulebook.locationIds.includes(target.locationId) || !rulebook.locationIds.includes(target.retreatLocationId) ||
        !rulebook.targetIds.includes(target.targetId) ||
        (target.workSiteLocationId && !rulebook.locationIds.includes(target.workSiteLocationId)) ||
        (target.protectionItemId && !rulebook.itemIds.includes(target.protectionItemId)) ||
        ![target.daytimeInjuryFlag, target.darkInjuryFlag, target.retreatInjuryFlag].every(flag => rulebook.injuryFlagIds.includes(flag))) {
      throw new TypeError('COMBAT_REFERENCE_NOT_FOUND');
    }
  }
  for (const edge of [...rulebook.unexploredEdges, ...rulebook.bypassRoutes]) {
    assertId(edge.from, 'INVALID_ROUTE_FROM'); assertId(edge.to, 'INVALID_ROUTE_TO');
    if (!rulebook.locationIds.includes(edge.from) || !rulebook.locationIds.includes(edge.to)) {
      throw new TypeError('ROUTE_LOCATION_REFERENCE_NOT_FOUND');
    }
  }
  assertUnique(rulebook.unexploredEdges.map(edge => `${edge.from}\0${edge.to}`), 'UNEXPLORED_EDGES');
  for (const edge of rulebook.unexploredEdges) {
    if (rulebook.initialLocationGraph.some(candidate => candidate.from === edge.from && candidate.to === edge.to)) {
      throw new TypeError('UNEXPLORED_ROUTE_ALREADY_IN_GRAPH');
    }
  }
  for (const route of rulebook.bypassRoutes) {
    assertId(route.via, 'INVALID_ROUTE_VIA');
    if (route.requiredItemId && !rulebook.itemIds.includes(route.requiredItemId)) {
      throw new TypeError('BYPASS_REFERENCE_NOT_FOUND');
    }
    const blockedEdge = rulebook.initialLocationGraph.find(edge => edge.from === route.from && edge.to === route.to);
    if (!blockedEdge || blockedEdge.state !== 'blocked') throw new TypeError('BYPASS_ROUTE_MUST_START_BLOCKED');
  }
  const requiredMessages = [
    'RULE_ROAD_BLOCKED', 'RULE_LOCATION_UNEXPLORED', 'RULE_STAMINA_LOW', 'RULE_TALK_IDLE',
    'RULE_COMBAT_RETREAT', 'RULE_NO_NEW_DISCOVERY', 'RULE_OBSERVE_BLOCKED', 'INPUT_UNKNOWN_ACTION',
    'INPUT_AMBIGUOUS', 'INPUT_NO_SUCH_TARGET', 'AUTH_NPC_ABSENT', 'AUTH_ACTOR_MISMATCH',
    'AUTH_UNAUTHORIZED_TARGET', 'ENV_RULES_NOT_READY', 'ENV_REVISION_STALE', 'ENV_PAYLOAD_INVALID',
    'ENV_ITEM_NOT_OWNED', 'ENV_TARGET_MISMATCH', 'ENV_ROUTE_NOT_CONNECTED', 'ENV_ROUTE_LOCKED',
    'ENV_SOURCE_ALREADY_CLAIMED', 'ENV_SOURCE_QUANTITY_INVALID', 'ENV_TECHNIQUE_LOCKED',
    'ENV_CULTIVATION_COMPLETE', 'INPUT_CULTIVATION_LIMIT',
    'ENV_STAMINA_EMPTY', 'INPUT_INVENTORY_FULL', 'ENV_SPIRIT_STAMINA_EMPTY',
    'ENV_QUEST_NOT_READY', 'ENV_QUEST_ALREADY_CLAIMED', 'ENV_TARGET_ALREADY_RESOLVED',
  ];
  for (const code of requiredMessages) {
    if (typeof messages[code] !== 'string' || !messages[code]!.trim()) {
      throw new TypeError(`RULE_MESSAGE_REQUIRED_${code}`);
    }
  }
  if (!rulebook.quest) throw new TypeError('QUEST_REQUIRED_FOR_THIRD_LOCATION');
  {
    assertId(rulebook.quest.questId, 'INVALID_QUEST_ID'); assertId(rulebook.quest.rewardItemId, 'INVALID_REWARD_ITEM_ID');
    assertId(rulebook.quest.unlockEdge.from, 'INVALID_QUEST_EDGE'); assertId(rulebook.quest.unlockEdge.to, 'INVALID_QUEST_EDGE');
    if (!rulebook.itemIds.includes(rulebook.quest.rewardItemId) ||
        !rulebook.locationIds.includes(rulebook.quest.unlockEdge.from) || !rulebook.locationIds.includes(rulebook.quest.unlockEdge.to) ||
        rulebook.initialKnownLocationIds.includes(rulebook.quest.unlockEdge.to) ||
        !rulebook.initialKnownLocationIds.includes(rulebook.quest.unlockEdge.from) ||
        rulebook.quest.unlockEdge.state !== 'open') {
      throw new TypeError('QUEST_REFERENCE_NOT_FOUND');
    }
    const initialQuestEdge = rulebook.initialLocationGraph.find(edge =>
      edge.from === rulebook.quest!.unlockEdge.from && edge.to === rulebook.quest!.unlockEdge.to);
    if (!initialQuestEdge || initialQuestEdge.state !== 'locked') throw new TypeError('QUEST_EDGE_MUST_START_LOCKED');
    if (rulebook.quest.unlockEdge.via !== undefined) assertId(rulebook.quest.unlockEdge.via, 'INVALID_QUEST_ROUTE_ID');
  }
  if (!rulebook.injuryFlagIds.includes(rulebook.injuryFlags.shoulderScrape)) throw new TypeError('BYPASS_INJURY_REFERENCE_NOT_FOUND');
  assertId(rulebook.injuryFlags.shoulderScrape, 'INVALID_BYPASS_INJURY_FLAG');
  const margin = mechanics.STAMINA_MAX / (mechanics.OBSERVE_SCAN_COST * 2 + mechanics.MOVE_COST +
    mechanics.OBSERVE_STUDY_COST + mechanics.COMBAT_COST);
  if (!Number.isFinite(margin) || margin < 1.5 || margin > 3) throw new TypeError('CLEARANCE_STAMINA_MARGIN_OUT_OF_RANGE');
  for (const [key, value] of Object.entries(mechanics)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`INVALID_MECHANIC_${key}`);
  }
  if (mechanics.GAME_MINUTES_PER_KEC !== 15 || mechanics.DAY_KEC_COUNT !== 96 ||
      mechanics.SAVE_START_GAME_MINUTE !== 300 || mechanics.DUSK_START_KEC !== 48 || mechanics.SLOT_MAX <= 0 ||
      mechanics.STAMINA_MAX <= 0 || mechanics.SPIRIT_MAX <= 0 || mechanics.CULTIVATE_COST_PER_KE <= 0 ||
      mechanics.STAMINA_MAX > 100 || mechanics.SPIRIT_MAX > 100 || mechanics.SLOT_MAX > 8 ||
      mechanics.CULTIVATION_MAX > 10_000 || mechanics.CULTIVATE_COST_PER_KE !== mechanics.FATIGUE_THRESHOLD ||
      mechanics.CLEAR_THRESHOLD <= 0 || mechanics.CLEAR_THRESHOLD > mechanics.STAMINA_MAX ||
      mechanics.RETREAT_SPIRIT > mechanics.SPIRIT_MAX) {
    throw new TypeError('INVALID_PROLOGUE_RULE_MECHANICS');
  }
}

function validateFactsAgainstRulebook(
  state: WorldState,
  facts: PrologueV1Facts,
  book: PrologueV1Rulebook,
  mechanics: PrologueV1Mechanics,
): void {
  const locations = new Set(book.locationIds);
  const items = new Set(book.itemIds);
  const clues = new Set(book.clueIds);
  const effects = new Set(book.effectFlagIds);
  const injuries = new Set(book.injuryFlagIds);
  const dayLengthGameMinutes = mechanics.DAY_KEC_COUNT * mechanics.GAME_MINUTES_PER_KEC;
  const currentGameDay = Math.floor((facts.gameMinute - mechanics.SAVE_START_GAME_MINUTE) / dayLengthGameMinutes);
  const unlockedLocations = [...book.initialKnownLocationIds, ...(facts.questState.rewardClaimed && book.quest
    ? [book.quest.unlockEdge.to] : [])];
  if (facts.gameMinute < mechanics.SAVE_START_GAME_MINUTE ||
      (facts.gameMinute - mechanics.SAVE_START_GAME_MINUTE) % mechanics.GAME_MINUTES_PER_KEC !== 0 ||
      facts.staminaDayIndex > currentGameDay || facts.knownLocations.length !== unlockedLocations.length ||
      unlockedLocations.some(id => !facts.knownLocations.includes(id)) ||
      !locations.has(state.locationId) || !facts.knownLocations.includes(state.locationId) ||
      facts.knownLocations.some(id => !locations.has(id)) ||
      !validLocationGraph(facts, book) ||
      facts.inventory.some(entry => !items.has(entry.itemId)) ||
      facts.collectedSources.some(id => !book.acquisitionSources.some(source => source.sourceId === id)) ||
      facts.effectFlags.some(id => !effects.has(id)) || facts.clues.some(id => !clues.has(id)) ||
      facts.injuryFlags.some(id => !injuries.has(id)) ||
      facts.observationLog.some(entry => !book.targetIds.includes(entry.targetId) ||
        !book.observations.some(target => target.targetId === entry.targetId) ||
        (entry.clueId !== undefined && !clues.has(entry.clueId))) ||
      facts.npcInteractionLog.some(entry => {
        const npc = book.npcs.find(candidate => candidate.npcId === entry.npcId);
        return !npc || (entry.topicTag !== 'unmatched' && !npc.topics.some(topic => topic.topicTag === entry.topicTag));
      }) ||
      facts.travelLog.some(entry => !locations.has(entry.toward)) ||
      (facts.questState.status === 'completed' &&
        (!book.quest || facts.obstacleState !== 'cleared' || facts.ferryState !== 'clear')) ||
      (facts.questState.rewardClaimed && facts.questState.status !== 'completed') ||
      (facts.ferryState === 'clear' && facts.questState.status !== 'completed')) {
    throw new Error('PROLOGUE_FACT_REFERENCE_NOT_FOUND');
  }
}

function validLocationGraph(facts: PrologueV1Facts, book: PrologueV1Rulebook): boolean {
  const pair = (from: string, to: string) => `${from}\0${to}`;
  const expected = new Map(book.initialLocationGraph.map(edge => [pair(edge.from, edge.to), edge]));
  const questEdge = book.quest?.unlockEdge;
  const questPair = questEdge ? pair(questEdge.from, questEdge.to) : undefined;
  const actual = new Map(facts.locationGraph.map(edge => [pair(edge.from, edge.to), edge]));
  const obstacleEdge = actual.get(pair(book.obstacleRoute.from, book.obstacleRoute.to));
  if (facts.obstacleState === 'cleared' && obstacleEdge?.state !== 'open') return false;
  if (facts.obstacleState !== 'cleared' && obstacleEdge?.state === 'open' &&
      !book.bypassRoutes.some(route => route.from === book.obstacleRoute.from &&
        route.to === book.obstacleRoute.to && route.clearsObstacle !== true && route.via === obstacleEdge.via)) return false;

  for (const edge of book.initialLocationGraph) {
    const key = pair(edge.from, edge.to);
    const current = actual.get(key);
    if (!current) return false;
    const canOpenBypass = edge.state === 'blocked' && book.bypassRoutes.some(route =>
      route.from === edge.from && route.to === edge.to);
    const canOpenQuest = key === questPair && facts.questState.rewardClaimed;
    if (current.state !== edge.state && !(current.state === 'open' && (canOpenBypass || canOpenQuest))) return false;
    const allowedVia = [edge.via,
      ...book.bypassRoutes.filter(route => route.from === edge.from && route.to === edge.to).map(route => route.via),
      ...(key === questPair && questEdge?.via ? [questEdge.via] : []),
    ].filter((value): value is string => value !== undefined);
    if ((current.via === undefined && edge.via !== undefined) ||
        (current.via !== undefined && !allowedVia.includes(current.via))) return false;
  }

  if (questEdge && !expected.has(questPair!)) {
    const currentQuestEdge = actual.get(questPair!);
    if (facts.questState.rewardClaimed) {
      if (!currentQuestEdge || currentQuestEdge.state !== 'open' || currentQuestEdge.via !== questEdge.via) return false;
    } else if (currentQuestEdge) {
      return false;
    }
  }

  return facts.locationGraph.length === expected.size +
    (questEdge && !expected.has(questPair!) && facts.questState.rewardClaimed ? 1 : 0);
}

function openObstacleRoute(graph: PrologueV1Facts['locationGraph'], book: PrologueV1Rulebook): PrologueV1Facts['locationGraph'] {
  let found = false;
  const opened = graph.map(edge => {
    if (edge.from !== book.obstacleRoute.from || edge.to !== book.obstacleRoute.to) return edge;
    found = true;
    return { ...edge, state: 'open' as const };
  });
  if (!found) throw new Error('OBSTACLE_ROUTE_MISSING_FROM_STATE');
  return opened;
}

function assertId(value: string, code: string): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) throw new TypeError(code);
}

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`DUPLICATE_${code}`);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
