import { describe, expect, it } from 'vitest';
import { isDaylight, projectDailyStamina } from './prologue-v1-time.js';

const signedPolicy = { maxStamina: 100, resetAnchorMinute: 300, dayMinutes: 1440 };

describe('P1 game-time stamina recovery', () => {
  it('preserves stamina during the same game day', () => {
    expect(projectDailyStamina(1439, { stamina: 35, staminaDayIndex: 0 }, signedPolicy))
      .toEqual({ stamina: 35, staminaDayIndex: 0 });
  });

  it('resets exactly once when the game-day index advances', () => {
    expect(projectDailyStamina(1740, { stamina: 35, staminaDayIndex: 0 }, signedPolicy))
      .toEqual({ stamina: 100, staminaDayIndex: 1 });
    expect(projectDailyStamina(1740, { stamina: 100, staminaDayIndex: 1 }, signedPolicy))
      .toEqual({ stamina: 100, staminaDayIndex: 1 });
  });

  it('catches up directly to the current game day after several missed in-game days', () => {
    expect(projectDailyStamina(4620, { stamina: 5, staminaDayIndex: 0 }, signedPolicy))
      .toEqual({ stamina: 100, staminaDayIndex: 3 });
  });

  it('rejects invalid time, state, or schedule inputs', () => {
    expect(() => projectDailyStamina(299, { stamina: 35, staminaDayIndex: 0 }, signedPolicy))
      .toThrow('GAME_MINUTE_BEFORE_RESET_ANCHOR');
    expect(() => projectDailyStamina(300, { stamina: 101, staminaDayIndex: 0 }, signedPolicy))
      .toThrow('INVALID_STAMINA_STATE');
    expect(() => projectDailyStamina(300, { stamina: 35, staminaDayIndex: 1 }, signedPolicy))
      .toThrow('STAMINA_DAY_INDEX_AHEAD');
    expect(() => projectDailyStamina(300, { stamina: 35, staminaDayIndex: 0 }, { ...signedPolicy, dayMinutes: 0 }))
      .toThrow('INVALID_STAMINA_POLICY');
  });
});

describe('P1 repeating day/night window', () => {
  const daylight = { dayMinutes: 1440, daylightStartMinute: 300, duskStartMinute: 1020 };

  it('wraps daylight classification across later game days', () => {
    expect(isDaylight(300, daylight)).toBe(true);
    expect(isDaylight(1019, daylight)).toBe(true);
    expect(isDaylight(1020, daylight)).toBe(false);
    expect(isDaylight(1740, daylight)).toBe(true);
    expect(isDaylight(2460, daylight)).toBe(false);
  });

  it('rejects an invalid time-band policy', () => {
    expect(() => isDaylight(300, { ...daylight, duskStartMinute: 1440 })).toThrow('INVALID_DAYLIGHT_POLICY');
  });
});
