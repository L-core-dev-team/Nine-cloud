import { createHash } from 'node:crypto';
import { PrologueV1FactsSchema, type DomainEvent, type TurnReceipt, type WorldState } from '@jiuxiao/contracts';
import {
  createPrologueV1EventReducer,
  createPrologueV1RuleModule,
  evaluate,
  type PrologueV1Mechanics,
  type PrologueV1Rulebook,
  type VersionedRuleModule,
} from '@jiuxiao/domain';
import type { ServerTurnRules } from './server-turn.js';
import type { TurnPlugin } from './turn-runtime.js';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';
import { assertP1SaveMemoryPolicy, P1_MEMORY_POLICY_VERSION } from './p1-memory-policy.js';

const contentRoot = new URL('../../../../packages/content/dist/', import.meta.url);
const [bookExports, mechanicsExports, contentExports] = await Promise.all([
  import(new URL('prologue/prologue-v1.rulebook-candidate.js', contentRoot).href) as Promise<{
    PROLOGUE_V1_RULEBOOK_CANDIDATE: unknown;
  }>,
  import(new URL('rules/prologue-v1.constants.js', contentRoot).href) as Promise<{
    PROLOGUE_V1: unknown;
    PROLOGUE_V1_ERROR_MESSAGES: Readonly<Record<string, string>>;
  }>,
  import(new URL('prologue/prologue-v1.js', contentRoot).href) as Promise<{
    PROLOGUE_V1_CONTENT_PACK: { entries: readonly { id: string; kind: string; content: Readonly<Record<string, unknown>> }[] };
  }>,
]);

const rulebook = bookExports.PROLOGUE_V1_RULEBOOK_CANDIDATE as PrologueV1Rulebook;
const mechanics = mechanicsExports.PROLOGUE_V1 as PrologueV1Mechanics;
const contentPack = contentExports.PROLOGUE_V1_CONTENT_PACK;
const dependencies = {
  rulebook,
  mechanics,
  messages: mechanicsExports.PROLOGUE_V1_ERROR_MESSAGES,
};
const module = createPrologueV1RuleModule(dependencies);
const reduceCandidate = createPrologueV1EventReducer(dependencies);
const allowedNpcIds = new Set(rulebook.npcPresenceIds);

const rules: ServerTurnRules = {
  ruleVersion: module.ruleVersion,
  canonVersion: module.canonVersion,
  memoryPolicyVersion: P1_MEMORY_POLICY_VERSION,
  decide(intent, save) {
    if (save.schemaVersion !== 2) throw new Error('P1_MEMORY_POLICY_MISMATCH');
    assertP1SaveMemoryPolicy(save);
    const safeSave = withoutCreationRequestHash(save);
    const context = {
      occurredAt: new Date().toISOString(),
      eventIds: Array.from({ length: 32 }, (_, index) => stableEventId(save.saveId, intent.idempotencyKey, index)),
    };
    return evaluate(intent, safeSave, { ...context, module });
  },
  reduce(state, event) {
    const creationRequestHash = state.facts.creationRequestHash;
    const projected = reduceCandidate(withoutCreationRequestHashFromState(state), event);
    return typeof creationRequestHash === 'string'
      ? { ...projected, facts: { ...projected.facts, creationRequestHash } }
      : projected;
  },
  grantsForEvent: grantDirectNpcInteraction,
  policyForNpc(_npcId, save) {
    if (!save || save.schemaVersion !== 2) throw new Error('P1_MEMORY_POLICY_MISMATCH');
    const memoryMode = assertP1SaveMemoryPolicy(save);
    return memoryMode === 'forgetting'
      ? 'forgetting-v1'
      : 'continue-v1';
  },
};

const plugin: TurnPlugin = {
  reviewApproval: P1_REVIEW_RULE_APPROVAL,
  rules,
  grantsForEvent: rules.grantsForEvent,
  policyForNpc: rules.policyForNpc,
  narrativeFallback: receipt => renderDeterministicNarrative(receipt, contentPack),
  initialState: ({ ownerId, saveId }): WorldState => {
    if (!ownerId.trim() || !saveId.trim()) throw new Error('INVALID_GAME_OWNER');
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
    const playerId = `player-${createHash('sha256').update(`${ownerId}\0${saveId}`).digest('hex').slice(0, 24)}`;
    return { playerId, locationId: rulebook.initialKnownLocationIds[0]!, elapsedMinutes: 0, facts };
  },
};

export default plugin;

function renderDeterministicNarrative(
  receipt: TurnReceipt,
  pack: typeof contentPack,
): string {
  if (receipt.decision.status !== 'accepted') throw new Error('TURN_NOT_COMMITTED');
  const paragraphs: string[] = [];
  for (const event of receipt.decision.events) {
    const payload = event.payload;
    switch (event.type) {
      case 'move.arrived': {
        const id = typeof payload.to === 'string' ? payload.to : '';
        const destination = pack.entries.find(entry => entry.kind === 'location' && entry.id === id)?.content.name;
        if (typeof destination === 'string') paragraphs.push(`你到了${destination}。`);
        if (id === 'loc_wangqitai') paragraphs.push(...textParagraphs(pack, 'text_south_white_hook'));
        break;
      }
      case 'move.blocked':
        paragraphs.push(payload.reason === 'rockslide' ? '石堆挡住了路。' : '前面的路还没有探明。');
        break;
      case 'move.bypassed':
        paragraphs.push(...textParagraphs(pack, 'text_bypass'));
        break;
      case 'observe.result': {
        if (payload.result === 'found' && typeof payload.clueId === 'string') {
          paragraphs.push(...textArray(pack, payload.clueId, 'text'));
        } else if (payload.result === 'none') {
          paragraphs.push(...textParagraphs(pack, 'text_observation_none'));
        } else if (payload.blockedReason === 'too_dark') {
          paragraphs.push(...textParagraphs(pack, 'text_wangqitai_night'));
        } else {
          paragraphs.push('这次观察没有得到新线索。');
        }
        break;
      }
      case 'talk.occurred':
        paragraphs.push(...deterministicTalkReply(pack, payload.topicTag, payload.outcome));
        break;
      case 'combat.resolved': {
        const entryId = payload.outcome === 'retreat' ? 'text_combat_retreat'
          : payload.outcome === 'clear_wounded' ? 'text_combat_clear_wounded' : 'text_combat_clear';
        paragraphs.push(...textParagraphs(pack, entryId));
        break;
      }
      case 'cultivate.attempted':
        if (payload.result === 'fatigue') paragraphs.push(...textParagraphs(pack, 'text_stamina_exhausted'));
        else paragraphs.push(`修炼结算完成，耗时 ${String(payload.kecCount ?? 0)} 刻。`);
        break;
      case 'item.acquired': {
        const id = typeof payload.itemId === 'string' ? payload.itemId : '';
        const name = pack.entries.find(entry => entry.kind === 'item' && entry.id === id)?.content.name;
        if (typeof name === 'string') paragraphs.push(`取得：${name} ×${String(payload.quantity ?? 0)}。`);
        break;
      }
      case 'item.consumed': {
        const id = typeof payload.itemId === 'string' ? payload.itemId : '';
        const name = pack.entries.find(entry => entry.kind === 'item' && entry.id === id)?.content.name;
        if (typeof name === 'string') paragraphs.push(`已使用：${name}。`);
        break;
      }
      case 'quest.completed':
        paragraphs.push(...textParagraphs(pack, 'text_crossing_complete'));
        break;
      case 'quest.reward_claimed': {
        const locationId = pack.entries.find(entry => entry.id === 'quest_first_clearance')?.content.rewardUnlockLocationId;
        const locationName = typeof locationId === 'string'
          ? pack.entries.find(entry => entry.kind === 'location' && entry.id === locationId)?.content.name
          : undefined;
        paragraphs.push(typeof locationName === 'string' ? `任务奖励已领取，${locationName}已解锁。` : '任务奖励已领取。');
        break;
      }
      case 'item.depleted':
        break;
      default:
        break;
    }
  }
  if (paragraphs.length === 0) {
    paragraphs.push('行动已结算，状态回执已更新。');
  }
  // The context is intentionally not used to author new facts. The model path
  // receives authorized recalls separately; this fallback reports this receipt.
  return paragraphs.join('\n');
}

function deterministicTalkReply(pack: typeof contentPack, topicTag: unknown, outcome: unknown): string[] {
  if (typeof topicTag !== 'string' || typeof outcome !== 'string') return ['交谈结果见状态回执。'];
  const dialogue = pack.entries.find(entry => entry.id === 'text_dialogue_topics')?.content.lines;
  if (Array.isArray(dialogue)) {
    const matching = dialogue.find(line => line && typeof line === 'object'
      && typeof (line as { topicLabel?: unknown }).topicLabel === 'string'
      && (line as { topicLabel: string }).topicLabel.includes(`topicTag='${topicTag}'`)
      && typeof (line as { utterance?: unknown }).utterance === 'string');
    if (matching && typeof (matching as { utterance: string }).utterance === 'string') {
      return [(matching as { utterance: string }).utterance];
    }
  }
  if (topicTag === 'player_warning') return ['我没上去过。'];
  if (outcome === 'idle') {
    const replies = pack.entries.find(entry => entry.id === 'text_smalltalk_fallbacks')?.content.replies;
    if (Array.isArray(replies)) {
      const reply = replies.find(row => row && typeof row === 'object' && (row as { questionType?: unknown }).questionType === '纯闲聊');
      if (reply && typeof (reply as { utterance?: unknown }).utterance === 'string') return [(reply as { utterance: string }).utterance];
    }
  }
  return [outcome === 'refuse' ? '这件事没有谈成。' : '交谈结果见状态回执。'];
}

function textParagraphs(pack: typeof contentPack, id: string): string[] {
  return textArray(pack, id, 'paragraphs');
}

function textArray(pack: typeof contentPack, id: string, key: string): string[] {
  const value = pack.entries.find(entry => entry.id === id)?.content[key];
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value] : [];
}

function grantDirectNpcInteraction(event: DomainEvent) {
  if (event.type !== 'talk.occurred') return [];
  const npcId = event.payload.npcId;
  const topicTag = event.payload.topicTag;
  const outcome = event.payload.outcome;
  if (typeof npcId !== 'string' || !allowedNpcIds.has(npcId)) return [];
  if (typeof topicTag !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(topicTag)
    || (outcome !== 'on_topic' && outcome !== 'idle' && outcome !== 'refuse')) return [];
  // Persist only the rule-produced, NPC-visible topic and outcome. Never retain
  // the raw player utterance, the entire event payload, or unrelated world facts.
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

function stableEventId(saveId: string, idempotencyKey: string, index: number): string {
  const bytes = createHash('sha256').update(`${saveId}\0${idempotencyKey}\0${index}`).digest('hex').slice(0, 32).split('');
  bytes[12] = '8';
  bytes[16] = ((Number.parseInt(bytes[16]!, 16) & 0x3) | 0x8).toString(16);
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function withoutCreationRequestHash(save: Parameters<VersionedRuleModule['decide']>[1]) {
  return { ...save, state: withoutCreationRequestHashFromState(save.state) };
}

function withoutCreationRequestHashFromState(state: WorldState): WorldState {
  const facts = { ...state.facts };
  delete facts.creationRequestHash;
  return { ...state, facts };
}
