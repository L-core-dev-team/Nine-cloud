export interface DailyStaminaPolicy {
  readonly maxStamina: number;
  readonly resetAnchorGameMinute: number;
  readonly dayKecCount: number;
  readonly gameMinutesPerKec: number;
}

export interface DailyStaminaProjection {
  readonly stamina: number;
  readonly staminaDayIndex: number;
}

export interface DaylightPolicy {
  readonly dayStartGameMinute: number;
  readonly dayKecCount: number;
  readonly gameMinutesPerKec: number;
  /** Number of complete Kec from the day anchor until dusk. */
  readonly duskStartKec: number;
}

export interface KecClockPolicy {
  readonly dayStartGameMinute: number;
  readonly dayKecCount: number;
  readonly gameMinutesPerKec: number;
}

export interface KecClockReading {
  readonly gameDayIndex: number;
  /** Zero-based Kec index within the current game day. */
  readonly kecIndex: number;
  readonly label: string;
}

function dayLengthGameMinutes(dayKecCount: number, gameMinutesPerKec: number): number {
  assertSafeInteger(dayKecCount, 'dayKecCount');
  assertSafeInteger(gameMinutesPerKec, 'gameMinutesPerKec');
  if (dayKecCount <= 0 || gameMinutesPerKec <= 0) throw new RangeError('INVALID_KEC_POLICY');
  return dayKecCount * gameMinutesPerKec;
}

function assertOnKecGrid(gameMinute: number, anchorGameMinute: number, gameMinutesPerKec: number): void {
  assertSafeInteger(gameMinute, 'gameMinute');
  assertSafeInteger(anchorGameMinute, 'anchorGameMinute');
  assertSafeInteger(gameMinutesPerKec, 'gameMinutesPerKec');
  if (gameMinute < anchorGameMinute) throw new RangeError('GAME_MINUTE_BEFORE_START');
  if ((gameMinute - anchorGameMinute) % gameMinutesPerKec !== 0) {
    throw new RangeError('GAME_MINUTE_OFF_KEC_GRID');
  }
}

/** Apply the P1 game-day stamina reset when an action reads stamina. */
export function projectDailyStamina(
  gameMinute: number,
  state: DailyStaminaProjection,
  policy: DailyStaminaPolicy,
): DailyStaminaProjection {
  assertSafeInteger(state.stamina, 'stamina');
  assertSafeInteger(state.staminaDayIndex, 'staminaDayIndex');
  assertSafeInteger(policy.maxStamina, 'maxStamina');
  const dayLength = dayLengthGameMinutes(policy.dayKecCount, policy.gameMinutesPerKec);
  assertOnKecGrid(gameMinute, policy.resetAnchorGameMinute, policy.gameMinutesPerKec);
  if (policy.maxStamina <= 0) throw new RangeError('INVALID_STAMINA_POLICY');
  if (state.stamina < 0 || state.stamina > policy.maxStamina || state.staminaDayIndex < 0) {
    throw new RangeError('INVALID_STAMINA_STATE');
  }

  const gameDayIndex = Math.floor((gameMinute - policy.resetAnchorGameMinute) / dayLength);
  if (state.staminaDayIndex > gameDayIndex) throw new RangeError('STAMINA_DAY_INDEX_AHEAD');
  return gameDayIndex > state.staminaDayIndex
    ? { stamina: policy.maxStamina, staminaDayIndex: gameDayIndex }
    : { ...state };
}

/** Classify daylight from a pure game-time Kec position, independent of wall-clock time. */
export function isDaylight(gameMinute: number, policy: DaylightPolicy): boolean {
  const dayLength = dayLengthGameMinutes(policy.dayKecCount, policy.gameMinutesPerKec);
  assertOnKecGrid(gameMinute, policy.dayStartGameMinute, policy.gameMinutesPerKec);
  assertSafeInteger(policy.duskStartKec, 'duskStartKec');
  if (policy.duskStartKec <= 0 || policy.duskStartKec >= policy.dayKecCount) {
    throw new RangeError('INVALID_DAYLIGHT_POLICY');
  }
  const kecIndex = Math.floor(((gameMinute - policy.dayStartGameMinute) % dayLength) / policy.gameMinutesPerKec);
  return kecIndex < policy.duskStartKec;
}

/** Read the current game-day and Kec index without introducing another time unit. */
export function readKecClock(gameMinute: number, policy: KecClockPolicy): KecClockReading {
  const dayLength = dayLengthGameMinutes(policy.dayKecCount, policy.gameMinutesPerKec);
  assertOnKecGrid(gameMinute, policy.dayStartGameMinute, policy.gameMinutesPerKec);
  const elapsedGameMinutes = gameMinute - policy.dayStartGameMinute;
  const gameDayIndex = Math.floor(elapsedGameMinutes / dayLength);
  const kecIndex = Math.floor((elapsedGameMinutes % dayLength) / policy.gameMinutesPerKec);
  return Object.freeze({ gameDayIndex, kecIndex, label: `第${kecIndex + 1}刻` });
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`INVALID_${name.toUpperCase()}`);
}
