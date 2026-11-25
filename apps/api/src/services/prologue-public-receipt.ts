import { PrologueV1FactsSchema, StateDeltaSchema, type TurnReceipt, type WorldState } from '@jiuxiao/contracts';
import { PROLOGUE_V1_CONTENT_PACK } from '@jiuxiao/content/p1-review-candidate';

const entries = new Map<string, Readonly<Record<string, unknown>>>(PROLOGUE_V1_CONTENT_PACK.entries.map(e => [e.id, e.content]));
function name(id: unknown): string {
  const label = typeof id === 'string' ? entries.get(id)?.name : undefined;
  if (typeof label !== 'string') throw Error('PUBLIC_NAME_UNAVAILABLE');
  return label;
}
function visibleClue(id: unknown) {
  const lines = typeof id === 'string' && entries.get(id)?.text;
  if (!Array.isArray(lines) || !lines.every(s => typeof s === 'string')) throw Error('VISIBLE_CLUE_UNAVAILABLE');
  return lines;
}
function openEdges(value: unknown) {
  if (!Array.isArray(value)) throw Error('ROUTE_DELTA_UNAVAILABLE');
  return value.filter(edge => edge?.state === 'open');
}

/** The caller supplies the committed snapshot at exactly the receipt revision. */
export function publicPrologueReceipt(receipt: TurnReceipt, state: WorldState, previous?: TurnReceipt) {
  if (receipt.decision.status !== 'accepted' || !('rulesVersion' in receipt) ||
    receipt.rulesVersion !== 'prologue-v1-candidate-20261005') throw Error('PUBLIC_RECEIPT_UNSUPPORTED');
  const { creationRequestHash: _hash, ...gameplay } = state.facts;
  const facts = PrologueV1FactsSchema.parse(gameplay);
  const location = name(state.locationId);
  const events = receipt.decision.events;
  const results: object[] = [];
  for (const e of events) {
    if (e.source !== 'RULES' || e.afterRevision !== receipt.resultingRevision || e.saveId !== receipt.saveId) throw Error('PUBLIC_EVENT_SOURCE');
    const p = e.payload;
    const delta = StateDeltaSchema.parse(p.stateDelta);
    switch (e.type) {
      case 'combat.resolved': {
        if (p.outcome === 'retreat') {
          if (receipt.decision.code !== 'RULE_COMBAT_RETREAT') throw Error('RETREAT_SOURCE');
          const origin = delta.factChanges.find(f => f.key === 'currentSublocationId');
          const exited = origin?.before.present && typeof origin.before.value === 'string' && origin.after.present && origin.after.value === null ? name(origin.before.value) : undefined;
          results.push({行动者:'玩家', 对手:name(p.targetId), 已结算:'玩家撤退，本次未清障',
            ...(exited ? {已退出:exited} : {}), 退后所在:location, 剩余体力:facts.stamina, 耗时分钟:delta.timeChange});
        } else {
          if (p.outcome !== 'clear' && p.outcome !== 'clear_wounded') throw Error('UNKNOWN_COMBAT_OUTCOME');
          results.push({遭遇:name(p.targetId), 结果:p.outcome === 'clear' ? '清障' : '带伤清障', 剩余体力:facts.stamina});
        }
        break;
      }
      case 'observe.result':
        if (!['found','blocked','none'].includes(String(p.result)) || !['scan','study'].includes(String(p.method))) throw Error('OBSERVATION_SOURCE');
        results.push({观察:name(p.targetId), 方式:p.method === 'study' ? '细察' : '扫视',
          所见:p.result === 'found' ? visibleClue(p.clueId) : [],
          ...(p.result === 'blocked' ? {受阻:p.blockedReason === 'too_dark' ? '天色太暗' : '本次未取得线索'} : {})});
        break;
      case 'item.consumed':
        if (!Array.isArray(p.effect) || p.effect.some(v => v !== 'effect_ward_water')) throw Error('UNKNOWN_ITEM_EFFECT');
        results.push({已使用:name(p.itemId), 数量:p.quantity, 已耗尽:events.some(v => v.type === 'item.depleted' && v.payload.itemId === p.itemId), 效果:p.effect.map(() => '避水')});
        break;
      case 'item.depleted':
        if (!events.some(v => v.type === 'item.consumed' && v.payload.itemId === p.itemId)) throw Error('MISSING_CONSUMPTION');
        break;
      case 'item.acquired': results.push({已取得:name(p.itemId), 数量:p.quantity}); break;
      case 'quest.completed': results.push({任务:name(p.questId), 进度:'已完成', 已领奖:facts.questState.rewardClaimed}); break;
      case 'quest.reward_claimed': {
        const change = delta.factChanges.find(f => f.key === 'locationGraph');
        if (!change?.before.present || !change.after.present) throw Error('REWARD_ROUTE_SOURCE');
        const old = openEdges(change.before.value);
        const opened = openEdges(change.after.value).filter(e => !old.some(v => v.from === e.from && v.to === e.to));
        results.push({已领:name(p.rewardItemId), 数量:p.quantity, 新通路:opened.map(e => [name(e.from), name(e.to)])});
        break;
      }
      case 'move.arrived': case 'move.bypassed': results.push({已抵达:name(p.toSublocationId ?? p.to), 剩余体力:facts.stamina}); break;
      case 'move.blocked': results.push({前进受阻:p.reason === 'rockslide' ? '落石堵渡' : '前路未明', 剩余体力:facts.stamina}); break;
      case 'cultivate.attempted': results.push({修炼:p.result === 'fatigue' ? '力竭' : '取得进展', 实耗刻数:p.attemptedKecCount, 剩余体力:facts.stamina}); break;
      case 'talk.occurred': results.push({交谈对象:name(p.npcId), 结果:p.outcome}); break;
      case 'talk.topic_learned': results.push({已听到:visibleClue(p.clueId)}); break;
      default: throw Error('UNMAPPED_PUBLIC_EVENT');
    }
  }
  let continuation: object | string | undefined;
  if (previous) {
    if (previous.decision.status !== 'accepted' || previous.saveId !== receipt.saveId || !('branchId' in previous) ||
      previous.branchId !== receipt.branchId || previous.resultingRevision + 1 !== receipt.resultingRevision) throw Error('PRIOR_RECEIPT_MISMATCH');
    const last = previous.decision.events;
    const retreat = last.find(e => e.type === 'combat.resolved' && e.payload.outcome === 'retreat');
    if (retreat && previous.decision.code === 'RULE_COMBAT_RETREAT' && events.every(e => e.type === 'observe.result')) {
      const origin = StateDeltaSchema.parse(retreat.payload.stateDelta).factChanges.find(f => f.key === 'currentSublocationId');
      if (origin?.before.present && typeof origin.before.value === 'string' && origin.after.present && origin.after.value === null && facts.currentSublocationId === null)
        continuation = {上回已完成:'玩家已退出'+name(origin.before.value), 此刻所在地:location, 当前体力:facts.stamina};
    }
    if (last.some(e => e.type === 'item.depleted' && e.payload.itemId === 'item_bishuifu') && !facts.inventory.some(i => i.itemId === 'item_bishuifu'))
      continuation = '已用尽的避水符仍不在行囊';
  }
  return {当前地点:location, ...(facts.currentSublocationId ? {所在处:name(facts.currentSublocationId)} : {}),
    本回合:results, ...(continuation ? {延续状态:continuation} : {})};
}
