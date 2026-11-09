import type { SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';

export type BriefAction = { id: string; kind: string; label: string; text: string };

const KNOWN_LOCATION_LABELS: Readonly<Record<string, string>> = {
  loc_luhuadu: '芦花渡',
  loc_wangqitai: '望气台',
  loc_zheguiping: '折桂坪',
};

export function buildGameplayBrief(save: SaveEnvelope, receipt: TurnReceipt | null, suggestions: readonly BriefAction[]) {
  const locationId = save.state.locationId;
  const currentLocation = KNOWN_LOCATION_LABELS[locationId] ?? '当前已记录地点';
  const latestEvents = receipt?.decision.status === 'accepted' ? receipt.decision.events : [];
  const recentEventSummary = latestEvents.map(summarizeEvent).filter(Boolean).join('；');
  const facts = save.state.facts && typeof save.state.facts === 'object'
    ? save.state.facts as Record<string, unknown>
    : {};
  const questState = facts.questState && typeof facts.questState === 'object'
    ? facts.questState as Record<string, unknown>
    : null;
  const questStatus = questState?.status === 'completed'
    ? questState.rewardClaimed === true ? '首段任务已完成，奖励已领取。' : '首段任务已完成，奖励尚未领取。'
    : questState?.status === 'unavailable'
      ? '首段任务尚未完成。'
      : '首段任务状态尚未记录。';
  const recentRecord = !receipt
    ? '尚无已提交行动记录。'
    : receipt.decision.status === 'accepted'
      ? `修订 ${receipt.resultingRevision} 已提交：${recentEventSummary || `${latestEvents.length} 条规则事件`}。`
      : receipt.decision.status === 'clarify'
        ? '最近一次输入需要补充信息；没有写入规则事件。'
        : '最近一次行动未获接受；没有写入规则事件。';
  const nextAction = suggestions[0] ?? null;

  return {
    currentLocation,
    lastStop: currentLocation,
    recentRecord,
    nextAction,
    questStatus,
    offlineProgress: '本段没有离线模拟事件；游戏时间只随已提交行动变化。',
  } as const;
}

function summarizeEvent(event: { type: string; payload: Record<string, unknown> }): string {
  switch (event.type) {
    case 'move.arrived': return `到达${locationLabel(event.payload.to)}`;
    case 'move.blocked': return `前往目标的道路受阻`;
    case 'move.bypassed': return `绕过阻碍，到达${locationLabel(event.payload.to)}`;
    case 'observe.result':
      if (event.payload.blockedReason === 'too_dark') return '观察受光线影响';
      if (event.payload.result === 'none') return '观察后没有新发现';
      if (event.payload.result === 'found') return `观察发现${clueLabel(event.payload.clueId)}`;
      return '完成一次观察';
    case 'talk.occurred': return '完成一次交谈';
    case 'combat.resolved': return '战斗结果已结算';
    case 'quest.completed': return '首段任务已完成';
    case 'quest.reward_claimed': return '已领取任务奖励';
    case 'item.acquired': return '取得物品';
    case 'item.consumed': return '使用物品';
    default: return '行动结果已记录';
  }
}

function locationLabel(value: unknown): string {
  if (value === 'loc_luhuadu') return '芦花渡';
  if (value === 'loc_wangqitai') return '望气台';
  if (value === 'loc_zheguiping') return '折桂坪';
  if (value === 'subloc_ferry_berm') return '渡口作业位';
  if (value === 'subloc_reef_ledge') return '礁石崖沿';
  return '当前记录地点';
}

function clueLabel(value: unknown): string {
  if (value === 'clue_rockslide') return '落石线索';
  if (value === 'clue_crow_nest') return '鸦群线索';
  if (value === 'clue_ferry_stuck') return '渡口淤堵线索';
  if (value === 'clue_ferry_scrubbed') return '缆绳磨损线索';
  if (value === 'clue_wrong_way') return '舟具方向线索';
  return '一条新线索';
}

export function textForClarificationCandidate(
  candidate: { kind: string; label: string; slots: Record<string, unknown> },
  suggestions: readonly BriefAction[],
): string {
  const slots = candidate.slots;
  const wantedId = candidate.kind === 'move' && typeof slots.destinationId === 'string'
    ? `move:${slots.destinationId}`
    : candidate.kind === 'observe' && typeof slots.targetId === 'string' && (slots.method === 'scan' || slots.method === 'study')
      ? `observe:${slots.targetId}:${slots.method}`
      : candidate.kind === 'talk' && typeof slots.npcId === 'string'
        ? `talk:${slots.npcId}`
        : candidate.kind === 'use_item' && typeof slots.itemId === 'string'
          ? suggestions.find(action => action.kind === 'use_item' && action.id.startsWith(`use_item:${slots.itemId}:`))?.id
          : candidate.kind === 'combat' && typeof slots.targetId === 'string'
            ? `combat:${slots.targetId}`
            : undefined;
  return (wantedId ? suggestions.find(action => action.id === wantedId)?.text : undefined) ?? candidate.label;
}
