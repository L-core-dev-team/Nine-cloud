export interface DailyStaminaPolicy {
  readonly maxStamina: number;
  readonly resetAnchorMinute: number;
  readonly dayMinutes: number;
}

export interface DailyStaminaProjection {
  readonly stamina: number;
  readonly staminaDayIndex: number;
}

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
  return gameDayIndex > state.staminaDayIndex
    ? { stamina: policy.maxStamina, staminaDayIndex: gameDayIndex }
    : { ...state };
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`INVALID_${name.toUpperCase()}`);
}
