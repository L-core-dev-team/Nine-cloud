/**
 * Numeric values copied from the signed P1 execution specification §4.1.
 * Keep this module declarative: reducers and UI must not maintain shadow copies.
 */
export const PROLOGUE_V1_RULE_VERSION = 'prologue-v1' as const;

export const PROLOGUE_V1 = {
  KEC_MINUTES: 15,
  SHICHEN_MINUTES: 120,
  DAY_MINUTES: 1440,
  SAVE_START_MINUTE: 300,
  STAMINA_MAX: 100,
  STAMINA_RESET_ANCHOR: 300,
  SPIRIT_MAX: 100,
  CULTIVATION_MAX: 10_000,
  CULTIVATION_PER_KE: 800,
  CULTIVATION_FATIGUE: 200,
  FATIGUE_THRESHOLD: 20,
  SLOT_MAX: 8,
  MOVE_COST: 5,
  MOVE_BLOCKED_COST: 10,
  MOVE_BYPASS_COST: 15,
  OBSERVE_SCAN_COST: 3,
  OBSERVE_STUDY_COST: 6,
  CULTIVATE_COST_PER_KE: 20,
  TALK_COST: 0,
  USE_ITEM_COST: 0,
  COMBAT_COST: 25,
  CLEAR_THRESHOLD: 25,
  RETREAT_SPIRIT: 5,
} as const;

/** Accepted zero-stamina-cost actions still advance the world by one Ke. */
export const PROLOGUE_V1_FREE_ACTION_TICK_MINUTES = PROLOGUE_V1.KEC_MINUTES;

export const PROLOGUE_V1_ACTION_ORDER = [
  'move',
  'cultivate',
  'acquire_item',
  'use_item',
  'talk',
  'observe',
  'combat',
  'quest',
] as const;

export const PROLOGUE_V1_ERROR_CODES = {
  RULE_ROAD_BLOCKED: 'RULE_ROAD_BLOCKED',
  RULE_STAMINA_LOW: 'RULE_STAMINA_LOW',
  INPUT_UNKNOWN_ACTION: 'INPUT_UNKNOWN_ACTION',
  INPUT_AMBIGUOUS: 'INPUT_AMBIGUOUS',
  INPUT_MISSING_SLOT: 'INPUT_MISSING_SLOT',
  INPUT_NO_SUCH_TARGET: 'INPUT_NO_SUCH_TARGET',
  AUTH_NPC_ABSENT: 'AUTH_NPC_ABSENT',
  AUTH_ACTOR_MISMATCH: 'AUTH_ACTOR_MISMATCH',
  AUTH_UNAUTHORIZED_TARGET: 'AUTH_UNAUTHORIZED_TARGET',
  ENV_RULES_NOT_READY: 'ENV_RULES_NOT_READY',
  ENV_REVISION_STALE: 'ENV_REVISION_STALE',
  ENV_IDEMPOTENCY_CONFLICT: 'ENV_IDEMPOTENCY_CONFLICT',
  ENV_PAYLOAD_INVALID: 'ENV_PAYLOAD_INVALID',
  ENV_TARGET_MISMATCH: 'ENV_TARGET_MISMATCH',
  ENV_TECHNIQUE_LOCKED: 'ENV_TECHNIQUE_LOCKED',
  ENV_STAMINA_EMPTY: 'ENV_STAMINA_EMPTY',
  ENV_INVENTORY_FULL: 'ENV_INVENTORY_FULL',
  ENV_SPIRIT_STAMINA_EMPTY: 'ENV_SPIRIT_STAMINA_EMPTY',
  ENV_QUEST_NOT_READY: 'ENV_QUEST_NOT_READY',
  ENV_QUEST_ALREADY_CLAIMED: 'ENV_QUEST_ALREADY_CLAIMED',
} as const;

export const PROLOGUE_V1_ERROR_MESSAGES = {
  RULE_ROAD_BLOCKED: '落石堵住了路，这次行动没有通过。',
  RULE_STAMINA_LOW: '体力不够，强撑后进展有限，疲惫加重。',
  INPUT_UNKNOWN_ACTION: '我没听清你要做什么，换种说法试试。',
  INPUT_AMBIGUOUS: '你指的是哪一个目标？',
  INPUT_MISSING_SLOT: '还需要补充一个目标或行动细节。',
  INPUT_NO_SUCH_TARGET: '这里没有你说的目标。',
  AUTH_NPC_ABSENT: '目标不在这里，无法与它交互。',
  AUTH_ACTOR_MISMATCH: '当前角色不能代替存档所属玩家发起行动。',
  AUTH_UNAUTHORIZED_TARGET: '你现在看不到或无法接触这个目标。',
  ENV_RULES_NOT_READY: '这份存档的规则版本当前不可用，行动没有结算。',
  ENV_REVISION_STALE: '存档状态已变化，请重新选择行动。',
  ENV_IDEMPOTENCY_CONFLICT: '这条请求与已记录行动内容不同，未再次结算。',
  ENV_PAYLOAD_INVALID: '行动数据无效，世界状态没有变化。',
  ENV_TARGET_MISMATCH: '这件物品不适用于这个目标。',
  ENV_TECHNIQUE_LOCKED: '当前没有可用的修炼功法。',
  ENV_STAMINA_EMPTY: '体力已耗尽，无法继续修炼。',
  ENV_INVENTORY_FULL: '物品栏已满，无法取得该物品。',
  ENV_SPIRIT_STAMINA_EMPTY: '心力已耗尽，无法继续战斗。',
  ENV_QUEST_NOT_READY: '通渡条件还未完成，奖励暂不可领。',
  ENV_QUEST_ALREADY_CLAIMED: '这份奖励已经领取过。',
} as const satisfies Record<keyof typeof PROLOGUE_V1_ERROR_CODES, string>;

export function minimumClearanceCost(): number {
  return PROLOGUE_V1.OBSERVE_SCAN_COST * 2
    + PROLOGUE_V1.MOVE_COST
    + PROLOGUE_V1.OBSERVE_STUDY_COST
    + PROLOGUE_V1.COMBAT_COST;
}

export function clearanceStaminaMargin(): number {
  return PROLOGUE_V1.STAMINA_MAX / minimumClearanceCost();
}
