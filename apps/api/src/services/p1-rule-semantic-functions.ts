import { createHash } from 'node:crypto';
import { PrologueV1FactsSchema, type DomainEvent, type MemoryMode, type WorldState } from '@jiuxiao/contracts';
import type { PrologueV1Mechanics, PrologueV1Rulebook } from '@jiuxiao/domain';
import type { ActionTemplate } from '@jiuxiao/domain/nlu';
import type { RuleSemanticDependencies } from './rule-semantic-fingerprint.js';

type ContentEntry = { readonly id: string; readonly content: Readonly<Record<string, unknown>> };

export type P1RuleSemanticInputSources = Readonly<{
  rulebook: PrologueV1Rulebook;
  mechanics: PrologueV1Mechanics;
  maxCultivationKesPerAction: number;
  locationLimit: number;
  actionTemplates: readonly ActionTemplate[];
  contentEntries: readonly ContentEntry[];
  memoryPolicyArtifacts: Readonly<Record<string, unknown>>;
}>;

export function createP1InitialState(
  input: { readonly ownerId: string; readonly saveId: string },
  rulebook: PrologueV1Rulebook,
  mechanics: PrologueV1Mechanics,
): WorldState {
  if (!input.ownerId.trim() || !input.saveId.trim()) throw new Error('INVALID_GAME_OWNER');
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
  const playerId = `player-${createHash('sha256').update(`${input.ownerId}\0${input.saveId}`).digest('hex').slice(0, 24)}`;
  return { playerId, locationId: rulebook.initialKnownLocationIds[0]!, elapsedMinutes: 0, facts };
}

export function grantP1DirectNpcInteraction(event: DomainEvent, allowedNpcIds: ReadonlySet<string>) {
  if (event.type !== 'talk.occurred') return [];
  const npcId = event.payload.npcId;
  const topicTag = event.payload.topicTag;
  const outcome = event.payload.outcome;
  if (typeof npcId !== 'string' || !allowedNpcIds.has(npcId)) return [];
  if (typeof topicTag !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(topicTag)
    || (outcome !== 'on_topic' && outcome !== 'idle' && outcome !== 'refuse')) return [];
  const summary = `topicTag=${topicTag};outcome=${outcome}`;
  return [{
    npcId,
    eventId: event.id,
    channel: 'witnessed' as const,
    authorizationPolicyVersion: 'p1-direct-npc-participant-v1',
    authorizedFields: ['summary', 'topicTag', 'outcome'],
    authorizedFacts: { summary, topicTag, outcome },
    visibleSummary: summary,
  }];
}

export function p1MemoryPolicyVersionForMode(mode: MemoryMode): 'continue-v1' | 'forgetting-v1' {
  return mode === 'forgetting' ? 'forgetting-v1' : 'continue-v1';
}

export function createP1RuleSemanticDependencies(input: {
  readonly rulebook: PrologueV1Rulebook;
  readonly mechanics: PrologueV1Mechanics;
  readonly maxCultivationKesPerAction: number;
  readonly locationLimit: number;
  readonly actionTemplates: readonly ActionTemplate[];
  readonly contentEntries: readonly ContentEntry[];
  readonly memoryPolicyArtifacts: Readonly<Record<string, unknown>>;
  readonly implementationFingerprint: string;
}): RuleSemanticDependencies {
  const visibleTargetIds = new Set([
    ...input.rulebook.locationIds,
    ...input.rulebook.sublocations.map(item => item.id),
    ...input.rulebook.npcPresenceIds,
    ...input.rulebook.observations.map(item => item.targetId),
    ...input.rulebook.clueIds,
    ...input.rulebook.itemIds,
    ...input.rulebook.combatTargets.map(item => item.targetId),
  ]);
  const entries = new Map(input.contentEntries.map(entry => [entry.id, entry]));
  const visibleTargetLabels = [...visibleTargetIds].map(id => ({
    id,
    label: resolveLabel(entries.get(id), id),
  }));
  return {
    format: 'jiuxiao-p1-rule-semantic-input-v1',
    rulebook: input.rulebook,
    mechanics: input.mechanics,
    externalRuleConstants: {
      maxCultivationKesPerAction: input.maxCultivationKesPerAction,
      locationLimit: input.locationLimit,
    },
    actionTemplates: input.actionTemplates,
    visibleTargetLabels,
    memoryPolicyArtifacts: input.memoryPolicyArtifacts,
    implementationFingerprint: input.implementationFingerprint,
  };
}

function resolveLabel(entry: ContentEntry | undefined, id: string): string | null {
  const name = entry?.content.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (id === 'obj_ferry_gear') return '舟具';
  const observationLabel = entry?.content.observationLabel;
  if (typeof observationLabel === 'string' && observationLabel.trim()) {
    return observationLabel.trim().split('·').at(-1)?.trim() ?? '';
  }
  return null;
}
