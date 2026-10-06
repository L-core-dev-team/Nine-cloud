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
  canonicalJson,
  createPrologueV1EventReducer,
  createPrologueV1RuleModule,
  evaluate,
  type RuleInvocationContext,
  type PrologueV1Mechanics,
  type PrologueV1Rulebook,
} from '@jiuxiao/domain';
import { parseActionText, type ActionParseResult, type VisibleTarget, type VisibleTargetCatalog } from '@jiuxiao/domain/nlu';
import { PROLOGUE_V1_ACTION_TEMPLATES } from '@jiuxiao/domain/nlu/prologue-v1-fixtures';
import canonRuntimeUrl from '../../../packages/content/src/canon-runtime.json?url';

const MEMORY_POLICY_VERSION = 'p1-memory-policy-v1';
const MEMORY_VISIBILITY_POLICY_VERSION = 'p1-direct-npc-participant-v1';
const MEMORY_NORMALIZER_VERSION = 'nfkc-lowercase-v1';

const cueArtifact = Object.freeze({
  version: 'literal-substring-cue-v1',
  normalizerVersion: MEMORY_NORMALIZER_VERSION,
  rule: 'A query must match text already present in an authorized observation.',
});

const visibilityArtifact = Object.freeze({
  version: MEMORY_VISIBILITY_POLICY_VERSION,
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
  readonly visibleTargets: (save: SaveEnvelope) => VisibleTargetCatalog;
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

let runtimePromise: Promise<P2ReviewGameplayRuntime> | null = null;

/** Loads the local, development-only review runtime. Candidate rules stay non-production. */
export function loadP2ReviewGameplayRuntime(): Promise<P2ReviewGameplayRuntime> {
  return runtimePromise ??= createRuntime();
}

async function createRuntime(): Promise<P2ReviewGameplayRuntime> {
  const policies = new Map<MemoryMode, SaveMemoryPolicy>([
    ['continue', await createP1SaveMemoryPolicy('continue')],
    ['forgetting', await createP1SaveMemoryPolicy('forgetting')],
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
    parse: ({ text, save, idempotencyKey, clarificationOf }) => {
      const identity = {
        saveId: save.saveId,
        actorId: save.state.playerId,
        branchId: 'root' as const,
        expectedRevision: save.revision,
        idempotencyKey,
        ...(clarificationOf ? { clarificationOf } : {}),
      };
      return parseActionText({
        text,
        identity,
        visible: visibleFor(save),
        visibilityRevision: save.revision,
        templates: PROLOGUE_V1_ACTION_TEMPLATES,
      });
    },
    decide: (intent, save, context) => {
      assertSaveMemoryPolicy(save, policies);
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
      const mode = assertSaveMemoryPolicy(save, policies);
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

async function createP1SaveMemoryPolicy(mode: MemoryMode): Promise<SaveMemoryPolicy> {
  const retrieval = mode === 'continue'
    ? { version: 'continue-v1', algorithm: 'no-retrieval-decay' }
    : {
      version: 'forgetting-v1',
      algorithm: 'game-time-and-npc-observed-event-half-life',
      halfLifeGameMinutes: 10_080,
      halfLifeObservedEvents: 16,
      cueAccessibilityFloor: 0.35,
    };
  const artifact = Object.freeze({
    policyVersion: MEMORY_POLICY_VERSION,
    mode,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    retrieval,
    cueArtifact,
    visibilityArtifact,
  });
  return {
    mode,
    policyVersion: MEMORY_POLICY_VERSION,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: await hashJson(artifact),
    cueDictionaryHash: await hashJson(cueArtifact),
    normalizerVersion: MEMORY_NORMALIZER_VERSION,
    retrievalVersion: retrieval.version,
    visibilityPolicyVersion: MEMORY_VISIBILITY_POLICY_VERSION,
    visibilityPolicyHash: await hashJson(visibilityArtifact),
    createdAtRevision: 0,
  };
}

function assertSaveMemoryPolicy(save: SaveEnvelope, policies: ReadonlyMap<MemoryMode, SaveMemoryPolicy>): MemoryMode {
  if (save.schemaVersion !== 3) throw new Error('P1_MEMORY_POLICY_MISMATCH');
  const expected = policies.get(save.memoryMode);
  if (!expected || save.memoryPolicyVersion !== save.memoryPolicy.policyVersion
    || save.createdPolicyVersion !== save.memoryPolicy.policyVersion
    || canonicalJson(save.memoryPolicy) !== canonicalJson(expected)) {
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

function visibleFor(save: SaveEnvelope): VisibleTargetCatalog {
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
  return { knownLocations, npcPresence, observationTargets, clues, inventory };
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
