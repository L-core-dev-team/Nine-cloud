export interface DailyStaminaPolicy {
  readonly maxStamina: number;
  readonly resetAnchorMinute: number;
  readonly dayMinutes: number;
}

export interface DailyStaminaProjection {
  readonly stamina: number;
  readonly staminaDayIndex: number;
}

export interface DaylightPolicy {
  readonly dayMinutes: number;
  readonly daylightStartMinute: number;
  readonly duskStartMinute: number;
}

export interface TraditionalClockPolicy {
  readonly dayMinutes: number;
  readonly shichenMinutes: number;
  readonly keMinutes: number;
  readonly anchorMinute: number;
  readonly anchorShichenIndex: number;
}

export interface TraditionalClockReading {
  readonly shichen: string;
  readonly shichenIndex: number;
  readonly phase: '初' | '正';
  readonly keIndex: number;
  readonly label: string;
}

const SHICHEN_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

/** Apply the P1 game-day stamina reset when an action reads stamina. */
export function projectDailyStamina(
  gameMinute: number,
  state: DailyStaminaProjection,
  policy: DailyStaminaPolicy,
): DailyStaminaProjection {
  assertSafeInteger(gameMinute, 'gameMinute');
  assertSafeInteger(state.stamina, 'stamina');
  assertSafeInteger(state.staminaDayIndex, 'staminaDayIndex');
  assertSafeInteger(policy.maxStamina, 'maxStamina');
  assertSafeInteger(policy.resetAnchorMinute, 'resetAnchorMinute');
  assertSafeInteger(policy.dayMinutes, 'dayMinutes');
  if (policy.maxStamina <= 0 || policy.dayMinutes <= 0) throw new RangeError('INVALID_STAMINA_POLICY');
  if (gameMinute < policy.resetAnchorMinute) throw new RangeError('GAME_MINUTE_BEFORE_RESET_ANCHOR');
  if (state.stamina < 0 || state.stamina > policy.maxStamina || state.staminaDayIndex < 0) {
    throw new RangeError('INVALID_STAMINA_STATE');
  }

  const gameDayIndex = Math.floor((gameMinute - policy.resetAnchorMinute) / policy.dayMinutes);
  if (state.staminaDayIndex > gameDayIndex) throw new RangeError('STAMINA_DAY_INDEX_AHEAD');
  return gameDayIndex > state.staminaDayIndex
    ? { stamina: policy.maxStamina, staminaDayIndex: gameDayIndex }
    : { ...state };
}

/** Classify time-of-day on a repeating game-day, independent of wall-clock time. */
export function isDaylight(gameMinute: number, policy: DaylightPolicy): boolean {
  assertSafeInteger(gameMinute, 'gameMinute');
  assertSafeInteger(policy.dayMinutes, 'dayMinutes');
  assertSafeInteger(policy.daylightStartMinute, 'daylightStartMinute');
  assertSafeInteger(policy.duskStartMinute, 'duskStartMinute');
  if (policy.dayMinutes <= 0 || policy.daylightStartMinute < 0 ||
      policy.duskStartMinute <= policy.daylightStartMinute || policy.duskStartMinute >= policy.dayMinutes) {
    throw new RangeError('INVALID_DAYLIGHT_POLICY');
  }
  const minuteOfDay = gameMinute % policy.dayMinutes;
  return minuteOfDay >= policy.daylightStartMinute && minuteOfDay < policy.duskStartMinute;
}

/** Convert game time to the signed twelve-shichen clock, anchored at the P1 start. */
export function readTraditionalClock(
  gameMinute: number,
  policy: TraditionalClockPolicy,
): TraditionalClockReading {
  assertSafeInteger(gameMinute, 'gameMinute');
  assertSafeInteger(policy.dayMinutes, 'dayMinutes');
  assertSafeInteger(policy.shichenMinutes, 'shichenMinutes');
  assertSafeInteger(policy.keMinutes, 'keMinutes');
  assertSafeInteger(policy.anchorMinute, 'anchorMinute');
  assertSafeInteger(policy.anchorShichenIndex, 'anchorShichenIndex');
  if (gameMinute < 0) throw new RangeError('INVALID_GAME_MINUTE');
  if (policy.dayMinutes <= 0 || policy.shichenMinutes <= 0 || policy.keMinutes <= 0 ||
      policy.dayMinutes !== SHICHEN_NAMES.length * policy.shichenMinutes ||
      policy.shichenMinutes !== 8 * policy.keMinutes || policy.anchorMinute < 0 ||
      policy.anchorMinute >= policy.dayMinutes || policy.anchorShichenIndex < 0 ||
      policy.anchorShichenIndex >= SHICHEN_NAMES.length) {
    throw new RangeError('INVALID_TRADITIONAL_CLOCK_POLICY');
  }

  const minuteOfDay = gameMinute % policy.dayMinutes;
  const relativeMinute = (minuteOfDay - policy.anchorMinute + policy.dayMinutes) % policy.dayMinutes;
  const shichenIndex = (policy.anchorShichenIndex + Math.floor(relativeMinute / policy.shichenMinutes)) % SHICHEN_NAMES.length;
  const minuteWithinShichen = relativeMinute % policy.shichenMinutes;
  const keIndex = Math.floor(minuteWithinShichen / policy.keMinutes);
  const shichen = SHICHEN_NAMES[shichenIndex];
  if (shichen === undefined) throw new RangeError('INVALID_TRADITIONAL_CLOCK_POLICY');
  const phase = keIndex < 4 ? '初' : '正';
  return Object.freeze({
    shichen,
    shichenIndex,
    phase,
    keIndex,
    label: `${shichen}时${phase}刻${keIndex}`,
  });
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`INVALID_${name.toUpperCase()}`);
}
