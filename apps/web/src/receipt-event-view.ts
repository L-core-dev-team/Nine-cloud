import { StateDeltaSchema, type StateDelta, type TurnReceipt } from '@jiuxiao/contracts';

export type ReceiptEventView = {
  eventId: string;
  stateRevision: number;
  eventType: string;
  delta: ReturnType<typeof StateDeltaSchema.parse> | null;
};

const FACT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  gameMinute: '游戏分钟',
  currentSublocationId: '所在作业位',
  npcPresence: '在场人物',
  stamina: '体力',
  staminaDayIndex: '体力恢复日',
  spiritStamina: '灵力',
  cultivationProgress: '修为进度',
  fatigueCount: '疲劳次数',
  inventory: '背包',
  collectedSources: '已取物来源',
  effectFlags: '生效标记',
  clues: '线索',
  observationLog: '观察记录',
  npcInteractionLog: '人物交谈记录',
  travelLog: '行路记录',
  injuryFlags: '伤势痕迹',
  questState: '任务状态',
  knownLocations: '已知地点',
  knownTechniques: '已知功法',
  locationGraph: '地点通路',
  idleCount: '闲谈次数',
  obstacleState: '落石状态',
  ferryState: '渡口状态',
  status: '状态',
  rewardClaimed: '已领取奖励',
  quantity: '数量',
  itemId: '物品',
  npcId: '人物',
  topicTag: '话题',
  outcome: '结果',
  toward: '前往',
  reason: '原因',
  targetId: '目标',
  method: '方式',
  result: '发现结果',
  clueId: '线索',
  blockedReason: '受阻原因',
  clueLevel: '线索层级',
});

const VALUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  loc_luhuadu: '芦花渡',
  loc_wangqitai: '望气台',
  loc_zheguiping: '折桂坪',
  subloc_ferry_berm: '渡口作业位',
  subloc_reef_ledge: '礁石崖沿',
  clue_ferry_stuck: '渡口淤堵线索',
  clue_ferry_scrubbed: '缆绳磨损线索',
  clue_wrong_way: '舟具方向线索',
  clue_rockslide: '落石线索',
  clue_crow_nest: '鸦群线索',
  aground: '搁浅',
  clear: '通畅',
  blocked: '受阻',
  cleared: '已清除',
  completed: '已完成',
  unavailable: '未开放',
  on_topic: '切题',
  idle: '闲谈',
  refuse: '拒绝',
  rockslide: '落石',
  unexplored: '未探索',
  scan: '扫视',
  study: '细察',
  found: '发现',
  none: '无新发现',
});

function formatFactValue(value: unknown): string {
  if (value === null) return '无';
  if (typeof value === 'string') return VALUE_LABELS[value] ?? value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length === 0 ? '无' : value.map(formatFactValue).join('、');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${FACT_LABELS[key] ?? key}：${formatFactValue(item)}`)
      .join('，');
  }
  return String(value);
}

function formatFactSide(side: { present: boolean; value?: unknown }): string {
  return side.present ? formatFactValue(side.value) : '未记录';
}

/** Render only receipt-backed state deltas, with stable game terms for review. */
export function formatReceiptDelta(delta: StateDelta | null): string | null {
  if (!delta) return null;
  const parts = [`耗时 ${delta.timeChange} 分钟`];
  if (delta.locationChange) {
    parts.push(`地点：${formatFactValue(delta.locationChange.before)} → ${formatFactValue(delta.locationChange.after)}`);
  }
  for (const change of delta.factChanges) {
    parts.push(`${FACT_LABELS[change.key] ?? change.key}：${formatFactSide(change.before)} → ${formatFactSide(change.after)}`);
  }
  return parts.join('；');
}

/**
 * Bind every visible accepted event to its immutable event ID and resulting
 * state revision. Malformed or absent deltas are not rendered as state change.
 */
export function projectReceiptEvents(receipt: TurnReceipt | null | undefined): ReceiptEventView[] {
  if (!receipt || receipt.decision.status !== 'accepted') return [];
  return receipt.decision.events.map(event => {
    const parsedDelta = StateDeltaSchema.safeParse(event.payload.stateDelta);
    return {
      eventId: event.id,
      stateRevision: event.afterRevision,
      eventType: event.type,
      delta: parsedDelta.success ? parsedDelta.data : null,
    };
  });
}
