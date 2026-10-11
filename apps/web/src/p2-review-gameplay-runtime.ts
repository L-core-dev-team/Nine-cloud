import { PROLOGUE_V1 } from '@jiuxiao/content';
import { formatCanonArtifactHash } from '@jiuxiao/content/canon-artifact';
import { PROLOGUE_V1_CONTENT_PACK, PROLOGUE_V1_RULEBOOK_CANDIDATE } from '@jiuxiao/content/p1-review-candidate';
import {
  PrologueV1FactsSchema,
  SaveEnvelopeV3Schema,
  type ActionIntent,
  type Decision,
  type DomainEvent,
  type MemoryMode,
  type SaveEnvelope,
  type SaveEnvelopeV3,
  type SaveMemoryPolicy,
  type TurnReceipt,
  type WorldState,
} from '@jiuxiao/contracts';
import {
  stableGrantIdV2,
  canonicalJson,
  createPrologueV1EventReducer,
  createPrologueV1RuleModule,
  evaluate,
  recallAuthorizedObservations,
  type AuthorizedRecallObservation,
  type AuthorizedRecallResult,
  type AuthorizedObservationOutboxRecord,
  type RuleInvocationContext,
  type PrologueV1Mechanics,
  type PrologueV1Rulebook,
} from '@jiuxiao/domain';
import { type ActionParseResult, type VisibleTarget } from '@jiuxiao/domain/nlu';
import { PROLOGUE_V1_ACTION_TEMPLATES } from '@jiuxiao/domain/nlu/prologue-v1-fixtures';
import canonRuntimeUrl from '../../../packages/content/src/canon-runtime.json?url';
import { buildP2CandidateNarrativeContext, type P2CandidateNarrativeContext } from './p2-candidate-narrative';
import { parseP2CandidateActionText, type P2CandidateActionTemplate, type P2CandidateVisibleCatalog } from './p2-candidate-action-parser';

const LEGACY_MEMORY_POLICY_VERSION = 'p1-memory-policy-v1';
const MEMORY_POLICY_VERSION = 'p2-candidate-memory-policy-v2';
const LEGACY_MEMORY_VISIBILITY_POLICY_VERSION = 'p1-direct-npc-participant-v1';
const MEMORY_VISIBILITY_POLICY_VERSION = 'p2-candidate-direct-npc-history-v2';
const MEMORY_NORMALIZER_VERSION = 'nfkc-lowercase-v1';

const cueArtifact = Object.freeze({
  version: 'literal-substring-cue-v1',
  normalizerVersion: MEMORY_NORMALIZER_VERSION,
  rule: 'A query must match text already present in an authorized observation.',
});

const visibilityArtifact = Object.freeze({
  version: MEMORY_VISIBILITY_POLICY_VERSION,
  eligibleEventTypes: ['talk.occurred'],
  grant: 'Only the present NPC named as a direct participant receives a witnessed observation.',
  authorizedProjection: ['summary', 'topicTag', 'outcome'],
  summarySource: 'candidate rulebook topic label plus committed event outcome',
  semanticClass: 'historical-event: committed past-tense direct interaction, per signed G04b classification rule',
  forbidden: ['copy-raw-event-payload', 'infer-global-event-visibility', 'model-authored-grant', 'classify-uncommitted-input'],
});
const legacyVisibilityArtifact = Object.freeze({
  version: LEGACY_MEMORY_VISIBILITY_POLICY_VERSION,
  eligibleEventTypes: ['talk.occurred'],
  grant: 'Only the NPC named as a direct participant receives a witnessed observation.',
  authorizedProjection: ['topicTag', 'outcome'],
  forbidden: ['copy-raw-event-payload', 'infer-global-event-visibility', 'model-authored-grant'],
});

const rulebook = PROLOGUE_V1_RULEBOOK_CANDIDATE as PrologueV1Rulebook;
const mechanics = PROLOGUE_V1 as PrologueV1Mechanics;
const contentPack = PROLOGUE_V1_CONTENT_PACK;
const dependencies = {
  rulebook,
  mechanics,
  messages: (await import('@jiuxiao/content')).PROLOGUE_V1_ERROR_MESSAGES,
};
const ruleModule = createPrologueV1RuleModule(dependencies);
const reduceCandidate = createPrologueV1EventReducer(dependencies);
const allowedNpcIds = new Set(rulebook.npcPresenceIds);

export type P2ReviewGameplayRuntime = {
  readonly ruleVersion: string;
  readonly canonVersion: string;
  readonly opening: readonly string[];
  readonly createSave: (saveId: string, memoryMode: MemoryMode) => Promise<SaveEnvelopeV3>;
  readonly visibleTargets: (save: SaveEnvelope) => P2CandidateVisibleCatalog;
  readonly actionSuggestions: (save: SaveEnvelopeV3) => P2ActionSuggestions;
  readonly structuredActions: (save: SaveEnvelopeV3) => readonly P2StructuredAction[];
  readonly authorizeEvents: (events: readonly DomainEvent[], before: SaveEnvelopeV3, after: SaveEnvelopeV3) => readonly AuthorizedObservationOutboxRecord[];
  readonly sceneStatus: (save: SaveEnvelopeV3, previousStopId?: string) => P2SceneStatus;
  readonly memoryNpcChoices: (save: SaveEnvelopeV3, npcIds: readonly string[]) => readonly { id: string; label: string }[];
  readonly recallHistoricalMemory: (observations: readonly AuthorizedRecallObservation[], query: string,
    gameMinute: number, throughRevision: number, forgetting: boolean) => AuthorizedRecallResult;
  readonly narrativeContext: (save: SaveEnvelopeV3, receipt: TurnReceipt | null,
    memoryEvidence: AuthorizedRecallResult | null, authorizedEventIds: readonly string[]) => P2CandidateNarrativeContext;
  readonly parse: (input: {
    text: string;
    save: SaveEnvelopeV3;
    idempotencyKey: string;
    clarificationOf?: string;
  }) => ActionParseResult;
  readonly decide: (intent: ActionIntent, save: SaveEnvelope, context: RuleInvocationContext) => Decision;
  readonly reduce: (state: WorldState, event: DomainEvent) => WorldState;
  readonly policyForNpc: (npcId: string, save: SaveEnvelope) => 'continue-v1' | 'forgetting-v1';
  readonly narrate: (receipt: TurnReceipt) => string;
};

export type P2ActionSuggestions = {
  move: readonly { label: string; text: string }[];
  observe: readonly { label: string; text: string }[];
  talk: readonly { label: string; text: string }[];
  useItem: readonly { label: string; text: string }[];
  combat: readonly { label: string; text: string }[];
};

export type P2StructuredAction =
  | { kind: 'move'; label: string; text: string; payload: { destinationId: string } }
  | { kind: 'acquire_item'; label: string; text: string; payload: { itemId: string; quantity: number } }
  | { kind: 'quest'; label: string; text: string; payload: { questId: string; choiceId: 'claim_reward' } };

export type P2SceneStatus = {
  currentLocation: string;
  previousStop: string;
  hook: string;
  hookEvidence: string;
  offlineAdvance: '未启用；本机时间不会推进世界';
  playerFacts: { stamina: number; spiritStamina: number; clues: readonly string[]; inventory: readonly string[]; quest: string };
};

let runtimePromise: Promise<P2ReviewGameplayRuntime> | null = null;

/** Loads the local, development-only review runtime. Candidate rules stay non-production. */
export function loadP2ReviewGameplayRuntime(): Promise<P2ReviewGameplayRuntime> {
  return runtimePromise ??= createRuntime();
}

async function createRuntime(): Promise<P2ReviewGameplayRuntime> {
  const policies = new Map<MemoryMode, SaveMemoryPolicy>([
    ['continue', await createP1SaveMemoryPolicy('continue', MEMORY_POLICY_VERSION)],
    ['forgetting', await createP1SaveMemoryPolicy('forgetting', MEMORY_POLICY_VERSION)],
  ]);
  const legacyPolicies = new Map<MemoryMode, SaveMemoryPolicy>([
    ['continue', await createP1SaveMemoryPolicy('continue', LEGACY_MEMORY_POLICY_VERSION)],
    ['forgetting', await createP1SaveMemoryPolicy('forgetting', LEGACY_MEMORY_POLICY_VERSION)],
  ]);
  const canonArtifactHash = await computeCanonRuntimeArtifactHash();

  return {
    ruleVersion: ruleModule.ruleVersion,
    canonVersion: ruleModule.canonVersion,
    opening: contentText('text_prologue_opening', 'paragraphs'),
    createSave: async (saveId, memoryMode) => {
      if (!saveId.trim()) throw new TypeError('INVALID_SAVE_ID');
      const memoryPolicy = policies.get(memoryMode);
      if (!memoryPolicy) throw new TypeError('P1_MEMORY_POLICY_MISMATCH');
      const ownerId = 'local-review-candidate';
      const playerId = `player-${(await sha256(`${ownerId}\0${saveId}`)).slice(0, 24)}`;
      const state = createInitialState(playerId);
      return SaveEnvelopeV3Schema.parse({
        schemaVersion: 3,
        saveId,
        canonVersion: ruleModule.canonVersion,
        canonArtifactHash,
        ruleVersion: ruleModule.ruleVersion,
        memoryPolicyVersion: MEMORY_POLICY_VERSION,
        memoryMode,
        memoryPolicy,
        branchId: 'root',
        parentBranchId: null,
        forkRevision: 0,
        createdPolicyVersion: memoryPolicy.policyVersion,
        sourceMigrationId: null,
        revision: 0,
        state,
      });
    },
    visibleTargets: visibleFor,
    actionSuggestions: actionSuggestionsFor,
    structuredActions: structuredActionsFor,
    authorizeEvents: (events, before, after) => authorizeCandidateEvents(events, before, after, policies, legacyPolicies),
    sceneStatus: sceneStatusFor,
    memoryNpcChoices: (save, npcIds) => {
      const candidates = [...new Set([...npcIds, ...visibleFor(save).npcPresence.map(target => target.id)])]
        .filter(id => allowedNpcIds.has(id));
      return candidates.map(id => ({ id, label: labelFor(id) ?? id }));
    },
    recallHistoricalMemory: (observations, query, gameMinute, throughRevision, forgetting) => recallAuthorizedObservations(
      observations, { query, slot: 'historical-event', gameMinute, throughRevision, forgetting }),
    narrativeContext: (save, receipt, memoryEvidence, authorizedEventIds) => buildP2CandidateNarrativeContext({
      save, receipt, memoryEvidence, authorizedEventIds,
    }),
    parse: ({ text, save, idempotencyKey, clarificationOf }) => {
      const identity = {
        saveId: save.saveId,
        actorId: save.state.playerId,
        branchId: 'root' as const,
        expectedRevision: save.revision,
        idempotencyKey,
        ...(clarificationOf ? { clarificationOf } : {}),
      };
      return parseP2CandidateActionText({
        text,
        identity,
        visible: visibleFor(save),
        visibilityRevision: save.revision,
        p1Templates: PROLOGUE_V1_ACTION_TEMPLATES,
        candidateTemplates: candidateActionTemplatesFor(save),
      });
    },
    decide: (intent, save, context) => {
      assertSaveMemoryPolicy(save, policies, legacyPolicies);
      return evaluate(intent, save, { ...context, module: ruleModule });
    },
    reduce: (state, event) => {
      const creationRequestHash = state.facts.creationRequestHash;
      const projected = reduceCandidate(withoutCreationRequestHash(state), event);
      return typeof creationRequestHash === 'string'
        ? { ...projected, facts: { ...projected.facts, creationRequestHash } }
        : projected;
    },
    policyForNpc: (_npcId, save) => {
      const mode = assertSaveMemoryPolicy(save, policies, legacyPolicies);
      return mode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
    },
    narrate: receipt => renderNarrative(receipt),
  };
}

async function computeCanonRuntimeArtifactHash(): Promise<`sha256:${string}`> {
  const response = await fetch(canonRuntimeUrl, { cache: 'force-cache' });
  if (!response.ok) throw new Error('CANON_ARTIFACT_UNAVAILABLE');
  return formatCanonArtifactHash(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', await response.arrayBuffer())));
}

async function createP1SaveMemoryPolicy(mode: MemoryMode, policyVersion: string): Promise<SaveMemoryPolicy> {
  const retrieval = mode === 'continue'
    ? { version: 'continue-v1', algorithm: 'no-retrieval-decay' }
    : {
      version: 'forgetting-v1',
      algorithm: 'game-time-and-npc-observed-event-half-life',
      halfLifeGameMinutes: 10_080,
      halfLifeObservedEvents: 16,
      cueAccessibilityFloor: 0.35,
    };
  const visibility = policyVersion === LEGACY_MEMORY_POLICY_VERSION ? legacyVisibilityArtifact : visibilityArtifact;
  const visibilityVersion = policyVersion === LEGACY_MEMORY_POLICY_VERSION
    ? LEGACY_MEMORY_VISIBILITY_POLICY_VERSION : MEMORY_VISIBILITY_POLICY_VERSION;
  const artifact = Object.freeze({
    policyVersion,
    mode,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    retrieval,
    cueArtifact,
    visibilityArtifact: visibility,
  });
  return {
    mode,
    policyVersion,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: await hashJson(artifact),
    cueDictionaryHash: await hashJson(cueArtifact),
    normalizerVersion: MEMORY_NORMALIZER_VERSION,
    retrievalVersion: retrieval.version,
    visibilityPolicyVersion: visibilityVersion,
    visibilityPolicyHash: await hashJson(visibility),
    createdAtRevision: 0,
  };
}

function assertSaveMemoryPolicy(
  save: SaveEnvelope,
  policies: ReadonlyMap<MemoryMode, SaveMemoryPolicy>,
  legacyPolicies?: ReadonlyMap<MemoryMode, SaveMemoryPolicy>,
): MemoryMode {
  if (save.schemaVersion !== 3) throw new Error('P1_MEMORY_POLICY_MISMATCH');
  const candidates = [policies.get(save.memoryMode), legacyPolicies?.get(save.memoryMode)];
  const expected = candidates.find(candidate => candidate?.policyVersion === save.memoryPolicyVersion
    && canonicalJson(save.memoryPolicy) === canonicalJson(candidate));
  if (!expected || save.memoryPolicyVersion !== save.memoryPolicy.policyVersion
    || save.createdPolicyVersion !== save.memoryPolicy.policyVersion) {
    throw new Error('P1_MEMORY_POLICY_MISMATCH');
  }
  return save.memoryMode;
}

function createInitialState(playerId: string): WorldState {
  const facts = PrologueV1FactsSchema.parse({
    gameMinute: mechanics.SAVE_START_GAME_MINUTE,
    currentSublocationId: null,
    npcPresence: [...rulebook.initialNpcPresenceIds],
    stamina: mechanics.STAMINA_MAX,
    staminaDayIndex: 0,
    spiritStamina: mechanics.SPIRIT_MAX,
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
    knownLocations: [...rulebook.initialKnownLocationIds],
    knownTechniques: [...rulebook.cultivationTechniqueIds],
    locationGraph: structuredClone(rulebook.initialLocationGraph),
    idleCount: 0,
    obstacleState: 'blocked',
    ferryState: 'aground',
  });
  return { playerId, locationId: rulebook.initialKnownLocationIds[0]!, elapsedMinutes: 0, facts };
}

function visibleFor(save: SaveEnvelope): P2CandidateVisibleCatalog {
  const gameplayFacts = { ...save.state.facts };
  delete gameplayFacts.creationRequestHash;
  const facts = PrologueV1FactsSchema.parse(gameplayFacts);
  const validLocations = new Set(rulebook.locationIds);
  const validNpcs = new Set(rulebook.npcPresenceIds);
  const visible = (id: string): VisibleTarget | undefined => {
    const label = labelFor(id);
    return label ? { id, label } : undefined;
  };
  const knownLocations = facts.knownLocations.filter(id => validLocations.has(id)).map(visible)
    .filter((target): target is VisibleTarget => target !== undefined);
  const npcPresence = rulebook.npcs.filter(npc => validNpcs.has(npc.npcId)
    && facts.npcPresence.includes(npc.npcId)
    && npc.locationId === save.state.locationId
    && npc.topics.length > 0).map(npc => visible(npc.npcId))
    .filter((target): target is VisibleTarget => target !== undefined);
  const observationTargets = rulebook.observations.filter(target => target.locationId === save.state.locationId
    && (!target.sublocationIds || (facts.currentSublocationId !== null && target.sublocationIds.includes(facts.currentSublocationId))))
    .map(target => visible(target.targetId)).filter((target): target is VisibleTarget => target !== undefined);
  const clues = facts.clues.map(visible).filter((target): target is VisibleTarget => target !== undefined);
  const inventory = facts.inventory.filter(item => item.quantity > 0).map(item => visible(item.itemId))
    .filter((target): target is VisibleTarget => target !== undefined);
  const sublocations = facts.currentSublocationId ? [] : rulebook.sublocations
    .filter(item => item.locationId === save.state.locationId).map(item => visible(item.id))
    .filter((target): target is VisibleTarget => target !== undefined);
  const returnLocations = facts.currentSublocationId
    ? [{ id: save.state.locationId, label: labelFor(facts.currentSublocationId) ?? facts.currentSublocationId }] : [];
  const availableAcquisitions = rulebook.acquisitionSources.filter(item => item.locationId === save.state.locationId
    && !facts.collectedSources.includes(item.sourceId));
  const acquisitionTargets = [...new Map(availableAcquisitions.map(item => [item.itemId, item]))].map(([itemId]) => visible(itemId))
    .filter((target): target is VisibleTarget => target !== undefined);
  const combatTargets = rulebook.combatTargets.filter(target => {
    const reachableFromSublocation = target.accessibleFromSublocationIds?.includes(facts.currentSublocationId ?? '') ?? false;
    return facts.npcPresence.includes(target.targetId)
      && (target.locationId === save.state.locationId || reachableFromSublocation);
  }).map(target => visible(target.targetId)).filter((target): target is VisibleTarget => target !== undefined);
  const questTargets = facts.questState.status === 'completed' && !facts.questState.rewardClaimed && rulebook.quest
    ? [{ id: rulebook.quest.questId, label: '首个通行任务' }] : [];
  return { knownLocations, npcPresence, observationTargets, clues, inventory,
    sublocations, returnLocations, acquisitionTargets, combatTargets, questTargets };
}

function actionSuggestionsFor(save: SaveEnvelopeV3): P2ActionSuggestions {
  const visible = visibleFor(save);
  const locations = visible.knownLocations.filter(target => target.id !== save.state.locationId);
  const move = locations.map(target => ({ label: `前往${target.label}`, text: `去${target.label}` }));
  for (const target of visible.sublocations ?? []) move.push({ label: `前往${target.label}`, text: `前往${target.label}` });
  for (const target of visible.returnLocations ?? []) move.push({ label: `离开${target.label}`, text: `离开${target.label}` });
  const observe = visible.observationTargets.flatMap(target => [
    { label: `观察${target.label}`, text: `观察${target.label}` },
    { label: `细察${target.label}`, text: `细察${target.label}` },
  ]);
  const talk = visible.npcPresence.flatMap(target => {
    const npc = rulebook.npcs.find(item => item.npcId === target.id);
    return (npc?.topics ?? []).flatMap(topic => topic.utterances.slice(0, 2).map(utterance => ({
      label: `与${target.label}谈：${utterance}`,
      text: `对${target.label}说：${utterance}`,
    })));
  });
  const useItem = rulebook.itemUses.flatMap(use => {
    if (!visible.inventory.some(item => item.id === use.itemId)) return [];
    if (use.targetIds.length === 0) {
      const label = labelFor(use.itemId) ?? use.itemId;
      return [{ label: `使用${label}`, text: `使用${label}` }];
    }
    return use.targetIds.flatMap(targetId => {
      const sublocation = rulebook.sublocations.find(item => item.id === targetId);
      if (sublocation && (sublocation.locationId !== save.state.locationId
        || sublocation.id !== factsFor(save).currentSublocationId)) return [];
      const itemLabel = labelFor(use.itemId) ?? use.itemId;
      const targetLabel = labelFor(targetId) ?? targetId;
      return [{ label: `使用${itemLabel}：${targetLabel}`, text: `使用${itemLabel}对${targetLabel}` }];
    });
  });
  const combat = (visible.combatTargets ?? []).map(target => ({
    label: `与${target.label}交战`, text: `与${target.label}交战`,
  }));
  return { move, observe, talk, useItem, combat };
}

function candidateActionTemplatesFor(save: SaveEnvelopeV3): readonly P2CandidateActionTemplate[] {
  const visible = visibleFor(save);
  const templates: P2CandidateActionTemplate[] = [];
  let index = 0;
  const add = (template: P2CandidateActionTemplate) => { templates.push(template); index += 1; };
  (visible.sublocations ?? []).forEach(() => add({
    id: `p2-candidate-${index}`, kind: 'move', prefix: '前往', entitySource: 'sublocations',
  }));
  (visible.returnLocations ?? []).forEach(() => add({
    id: `p2-candidate-${index}`, kind: 'move', prefix: '离开', entitySource: 'returnLocations',
  }));
  const acquisitionSources = rulebook.acquisitionSources.filter(item => item.locationId === save.state.locationId
    && !factsFor(save).collectedSources.includes(item.sourceId));
  for (const target of visible.acquisitionTargets ?? []) {
    const sources = acquisitionSources.filter(item => item.itemId === target.id);
    const quantities = new Set(sources.map(item => item.quantity));
    if (sources.length !== 1 || quantities.size !== 1) continue;
    add({ id: `p2-candidate-${index}`, kind: 'acquire_item', prefix: '拾取', entitySource: 'acquisitionTargets',
      fixedPayload: { quantity: sources[0]!.quantity } });
  }
  for (const use of rulebook.itemUses) {
    if (!visible.inventory.some(item => item.id === use.itemId)) continue;
    if (use.targetIds.length === 0) {
      add({ id: `p2-candidate-${index}`, kind: 'use_item', prefix: '使用', entitySource: 'inventory' });
      continue;
    }
    for (const targetId of use.targetIds) {
      const sublocation = rulebook.sublocations.find(item => item.id === targetId);
      if (sublocation && (sublocation.locationId !== save.state.locationId
        || sublocation.id !== factsFor(save).currentSublocationId)) continue;
      const targetLabel = labelFor(targetId) ?? targetId;
      add({ id: `p2-candidate-${index}`, kind: 'use_item', prefix: '使用', suffix: `对${targetLabel}`,
        entitySource: 'inventory', fixedPayload: { targetId } });
    }
  }
  if ((visible.combatTargets ?? []).length > 0) add({
    id: `p2-candidate-${index}`, kind: 'combat', prefix: '与', suffix: '交战', entitySource: 'combatTargets',
  });
  if ((visible.questTargets ?? []).length > 0) add({
    id: `p2-candidate-${index}`, kind: 'quest', prefix: '领取任务奖励：', entitySource: 'questTargets',
    fixedPayload: { choiceId: 'claim_reward' },
  });
  return templates;
}

function structuredActionsFor(save: SaveEnvelopeV3): readonly P2StructuredAction[] {
  const facts = factsFor(save);
  const actions: P2StructuredAction[] = [];
  if (facts.currentSublocationId) {
    const currentLocation = labelFor(save.state.locationId) ?? save.state.locationId;
    actions.push({ kind: 'move', label: `返回${currentLocation}`, text: `离开${labelFor(facts.currentSublocationId) ?? facts.currentSublocationId}`,
      payload: { destinationId: save.state.locationId } });
  } else {
    for (const sublocation of rulebook.sublocations.filter(item => item.locationId === save.state.locationId)) {
      const label = labelFor(sublocation.id) ?? sublocation.id;
      actions.push({ kind: 'move', label: `前往${label}`, text: `前往${label}`, payload: { destinationId: sublocation.id } });
    }
  }
  for (const source of rulebook.acquisitionSources.filter(item => item.locationId === save.state.locationId
    && !facts.collectedSources.includes(item.sourceId))) {
    const itemLabel = labelFor(source.itemId) ?? source.itemId;
    actions.push({ kind: 'acquire_item', label: `拾取${itemLabel}`, text: `拾取${itemLabel}`,
      payload: { itemId: source.itemId, quantity: source.quantity } });
  }
  if (facts.questState.status === 'completed' && !facts.questState.rewardClaimed && rulebook.quest) {
    actions.push({ kind: 'quest', label: '领取任务奖励', text: '领取任务奖励：首个通行任务',
      payload: { questId: rulebook.quest.questId, choiceId: 'claim_reward' } });
  }
  return actions;
}

function authorizeCandidateEvents(
  events: readonly DomainEvent[],
  before: SaveEnvelopeV3,
  after: SaveEnvelopeV3,
  policies: ReadonlyMap<MemoryMode, SaveMemoryPolicy>,
  legacyPolicies?: ReadonlyMap<MemoryMode, SaveMemoryPolicy>,
): readonly AuthorizedObservationOutboxRecord[] {
  assertSaveMemoryPolicy(before, policies, legacyPolicies);
  assertSaveMemoryPolicy(after, policies, legacyPolicies);
  if (before.saveId !== after.saveId || before.branchId !== after.branchId || before.memoryMode !== after.memoryMode
    || after.revision !== before.revision + 1) throw new Error('P2_MEMORY_TURN_SCOPE_MISMATCH');
  // Old candidate saves retain their pinned policy. No silent semantic-policy upgrade.
  if (before.memoryPolicyVersion !== MEMORY_POLICY_VERSION) return [];
  const beforeFacts = factsFor(before);
  const afterFacts = factsFor(after);
  const output: AuthorizedObservationOutboxRecord[] = [];
  for (const event of events) {
    if (event.type !== 'talk.occurred' || event.source !== 'RULES' || event.saveId !== before.saveId
      || event.afterRevision !== after.revision || (event.branchId ?? 'root') !== before.branchId) continue;
    const npcId = event.payload.npcId;
    const topicTag = event.payload.topicTag;
    const outcome = event.payload.outcome;
    const npc = rulebook.npcs.find(item => item.npcId === npcId);
    if (typeof npcId !== 'string' || !allowedNpcIds.has(npcId) || !npc
      || !beforeFacts.npcPresence.includes(npcId) || npc.locationId !== before.state.locationId
      || !['on_topic', 'idle', 'refuse'].includes(String(outcome))
      || typeof topicTag !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(topicTag)
      || (!npc.topics.some(topic => topic.topicTag === topicTag) && !(topicTag === 'unmatched' && outcome === 'idle'))) continue;
    const summary = candidateTalkSummary(npcId, topicTag, outcome);
    const authorizedFacts = { summary, topicTag, outcome };
    output.push({
      grantId: stableGrantIdV2(before.saveId, before.branchId, npcId, event.id, visibilityArtifact.version),
      grantIdVersion: 2,
      saveId: before.saveId,
      branchId: before.branchId,
      npcId,
      eventId: event.id,
      eventRevision: event.afterRevision,
      observedAtMinute: afterFacts.gameMinute,
      channel: 'witnessed',
      memoryClass: 'historical-event',
      authorizationPolicyVersion: visibilityArtifact.version,
      authorizedFields: ['summary', 'topicTag', 'outcome'],
      authorizedFacts,
      summary,
    });
  }
  return output;
}

function candidateTalkSummary(npcId: string, topicTag: string, outcome: unknown): string {
  const npcLabel = labelFor(npcId) ?? npcId;
  const lines = contentRecord('text_dialogue_topics')?.lines;
  const line = Array.isArray(lines) ? lines.find(value => value && typeof value === 'object'
    && ((value as { topicTag?: unknown }).topicTag === topicTag
      || (typeof (value as { topicLabel?: unknown }).topicLabel === 'string'
        && (value as { topicLabel: string }).topicLabel.includes(`topicTag='${topicTag}'`)))) : undefined;
  const topicLabel = line && typeof line === 'object' && typeof (line as { topicLabel?: unknown }).topicLabel === 'string'
    ? (line as { topicLabel: string }).topicLabel.replace(/\s*[（(].*?topicTag=.*?[）)]\s*/u, '').trim()
    : topicTag === 'unmatched' ? '一般交谈' : topicTag;
  const result = outcome === 'refuse' ? '没有答应' : outcome === 'on_topic' ? '谈成了' : '没有谈出新的内容';
  return `你曾与${npcLabel}谈论「${topicLabel}」；结果：${result}。`;
}

function sceneStatusFor(save: SaveEnvelopeV3, previousStopId?: string): P2SceneStatus {
  const facts = factsFor(save);
  const currentLocation = labelFor(save.state.locationId) ?? save.state.locationId;
  let hook: string;
  let hookEvidence: string;
  if (facts.questState.status === 'completed' && !facts.questState.rewardClaimed) {
    hook = '通行任务已完成，可以领取奖励。';
    hookEvidence = 'questState.status=completed; rewardClaimed=false';
  } else if (facts.questState.rewardClaimed) {
    hook = '奖励已领取，前往新解锁的地点继续。';
    hookEvidence = `questState.rewardClaimed=true; knownLocations=${facts.knownLocations.join(',')}`;
  } else if (facts.obstacleState === 'blocked' && facts.clues.includes('clue_rockslide')) {
    hook = '你已找到落石线索，可以尝试规则允许的绕行路线。';
    hookEvidence = 'obstacleState=blocked; clues includes clue_rockslide';
  } else if (facts.obstacleState === 'blocked') {
    hook = '渡口路线仍受阻；可以到望气台观察落石。';
    hookEvidence = 'obstacleState=blocked; rulebook observation target obstacle_rockslide';
  } else {
    hook = '渡口路线已通，可以回到山门继续行旅。';
    hookEvidence = 'obstacleState=cleared; ferryState=clear';
  }
  return {
    currentLocation,
    previousStop: previousStopId ? labelFor(previousStopId) ?? previousStopId : '暂无已提交的移动记录',
    hook,
    hookEvidence,
    offlineAdvance: '未启用；本机时间不会推进世界',
    playerFacts: {
      stamina: facts.stamina,
      spiritStamina: facts.spiritStamina,
      clues: facts.clues.map(id => labelFor(id) ?? id),
      inventory: facts.inventory.map(item => `${labelFor(item.itemId) ?? item.itemId} ×${item.quantity}`),
      quest: facts.questState.rewardClaimed ? '已领取奖励'
        : facts.questState.status === 'completed' ? '已完成，待领取' : '进行中',
    },
  };
}

function factsFor(save: SaveEnvelopeV3) {
  const facts = { ...save.state.facts };
  delete facts.creationRequestHash;
  return PrologueV1FactsSchema.parse(facts);
}

function labelFor(id: string): string | undefined {
  const content = contentRecord(id);
  const name = content?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (id === 'obj_ferry_gear') return '舟具';
  const observationLabel = content?.observationLabel;
  if (typeof observationLabel === 'string' && observationLabel.trim()) return observationLabel.trim().split('·').at(-1)?.trim();
  return undefined;
}

function withoutCreationRequestHash(state: WorldState): WorldState {
  const facts = { ...state.facts };
  delete facts.creationRequestHash;
  return { ...state, facts };
}

function renderNarrative(receipt: TurnReceipt): string {
  if (receipt.decision.status !== 'accepted') return receipt.decision.status === 'clarify'
    ? receipt.decision.question : '这次行动没有成立。';
  const paragraphs: string[] = [];
  for (const event of receipt.decision.events) {
    const payload = event.payload;
    switch (event.type) {
      case 'observe.result': {
        if (payload.result === 'found' && typeof payload.clueId === 'string') {
          paragraphs.push(...contentText(payload.clueId, 'text'));
        } else if (payload.result === 'none') {
          paragraphs.push(...contentText('text_observation_none', 'paragraphs'));
        } else if (payload.blockedReason === 'too_dark') {
          paragraphs.push(...contentText('text_wangqitai_night', 'paragraphs'));
        }
        break;
      }
      case 'move.arrived': {
        const destinationId = typeof payload.to === 'string' ? payload.to : '';
        const destination = labelFor(destinationId);
        if (destination) paragraphs.push(`你到了${destination}。`);
        if (destinationId === 'loc_wangqitai') paragraphs.push(...contentText('text_south_white_hook', 'paragraphs'));
        break;
      }
      case 'move.blocked':
        paragraphs.push(payload.reason === 'rockslide' ? '石堆挡住了路。' : '前面的路还没有探明。');
        break;
      case 'move.bypassed':
        paragraphs.push(...contentText('text_bypass', 'paragraphs'));
        break;
      case 'talk.occurred':
        paragraphs.push(...narrateTalk(payload.topicTag, payload.outcome));
        break;
      case 'combat.resolved':
        paragraphs.push(...contentText(payload.outcome === 'retreat' ? 'text_combat_retreat'
          : payload.outcome === 'clear_wounded' ? 'text_combat_clear_wounded' : 'text_combat_clear', 'paragraphs'));
        break;
      case 'cultivate.attempted':
        paragraphs.push(payload.result === 'fatigue' ? '气息散了，今天再勉强只会更乱。'
          : `修炼结算完成，耗时 ${String(payload.kecCount ?? 0)} 刻。`);
        break;
      case 'item.acquired': {
        const label = typeof payload.itemId === 'string' ? labelFor(payload.itemId) : undefined;
        if (label) paragraphs.push(`取得：${label} ×${String(payload.quantity ?? 0)}。`);
        break;
      }
      case 'item.consumed': {
        const label = typeof payload.itemId === 'string' ? labelFor(payload.itemId) : undefined;
        if (label) paragraphs.push(`已使用：${label}。`);
        break;
      }
      case 'quest.completed':
        paragraphs.push(...contentText('text_crossing_complete', 'paragraphs'));
        break;
      case 'quest.reward_claimed':
        paragraphs.push('任务奖励已领取。');
        break;
      default:
        break;
    }
  }
  return paragraphs.length ? paragraphs.join('\n') : '行动已结算，状态回执已更新。';
}

function narrateTalk(topicTag: unknown, outcome: unknown): string[] {
  if (typeof topicTag !== 'string' || typeof outcome !== 'string') return ['交谈结果见状态回执。'];
  const lines = contentRecord('text_dialogue_topics')?.lines;
  if (Array.isArray(lines)) {
    const match = lines.find(line => line && typeof line === 'object'
      && typeof (line as { topicLabel?: unknown }).topicLabel === 'string'
      && (line as { topicLabel: string }).topicLabel.includes(`topicTag='${topicTag}'`)
      && typeof (line as { utterance?: unknown }).utterance === 'string');
    if (match) return [(match as { utterance: string }).utterance];
  }
  return [outcome === 'refuse' ? '这件事没有谈成。' : '交谈结果见状态回执。'];
}

function contentText(id: string, field: string): string[] {
  const value = contentRecord(id)?.[field];
  if (typeof value === 'string') return [value];
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value] : [];
}

function contentRecord(id: string): Readonly<Record<string, unknown>> | undefined {
  const content = contentPack.entries.find(entry => entry.id === id)?.content;
  return content !== null && typeof content === 'object' && !Array.isArray(content)
    ? content as Readonly<Record<string, unknown>>
    : undefined;
}

async function hashJson(value: unknown): Promise<`sha256:${string}`> {
  return `sha256:${await sha256(canonicalJson(value))}`;
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('LOCAL_RULE_CRYPTO_UNAVAILABLE');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
