import { describe, expect, it } from 'vitest';
import { isDaylight, projectDailyStamina, readKecClock } from './prologue-v1-time.js';

const signedPolicy = {
  maxStamina: 100,
  resetAnchorGameMinute: 300,
  dayKecCount: 96,
  gameMinutesPerKec: 15,
};

describe('P1 game-time stamina recovery', () => {
  it('preserves stamina within the same Kec-counted game day', () => {
    expect(projectDailyStamina(1710, { stamina: 35, staminaDayIndex: 0 }, signedPolicy))
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

  it('rejects a pre-start or off-Kec game clock', () => {
    expect(() => projectDailyStamina(299, { stamina: 35, staminaDayIndex: 0 }, signedPolicy))
      .toThrow('GAME_MINUTE_BEFORE_START');
    expect(() => projectDailyStamina(301, { stamina: 35, staminaDayIndex: 0 }, signedPolicy))
      .toThrow('GAME_MINUTE_OFF_KEC_GRID');
  });

  it('rejects invalid stamina state or Kec schedule', () => {
    expect(() => projectDailyStamina(300, { stamina: 101, staminaDayIndex: 0 }, signedPolicy))
      .toThrow('INVALID_STAMINA_STATE');
    expect(() => projectDailyStamina(300, { stamina: 35, staminaDayIndex: 1 }, signedPolicy))
      .toThrow('STAMINA_DAY_INDEX_AHEAD');
    expect(() => projectDailyStamina(300, { stamina: 35, staminaDayIndex: 0 }, { ...signedPolicy, dayKecCount: 0 }))
      .toThrow('INVALID_KEC_POLICY');
  });
});

describe('P1 daylight window in Kec', () => {
  const daylight = {
    dayStartGameMinute: 300,
    dayKecCount: 96,
    gameMinutesPerKec: 15,
    duskStartKec: 48,
  };

  it('wraps the daylight boundary across game days', () => {
    expect(isDaylight(300, daylight)).toBe(true);
    expect(isDaylight(1005, daylight)).toBe(true);
    expect(isDaylight(1020, daylight)).toBe(false);
    expect(isDaylight(1740, daylight)).toBe(true);
    expect(isDaylight(2460, daylight)).toBe(false);
  });

  it('rejects an invalid dusk Kec boundary', () => {
    expect(() => isDaylight(300, { ...daylight, duskStartKec: 96 })).toThrow('INVALID_DAYLIGHT_POLICY');
  });
});

describe('P1 Kec clock display', () => {
  const clock = {
    dayStartGameMinute: 300,
    dayKecCount: 96,
    gameMinutesPerKec: 15,
  };

  it('reports only Kec and game-day index', () => {
    expect(readKecClock(300, clock)).toEqual({ gameDayIndex: 0, kecIndex: 0, label: '第1刻' });
    expect(readKecClock(315, clock)).toEqual({ gameDayIndex: 0, kecIndex: 1, label: '第2刻' });
    expect(readKecClock(1020, clock)).toEqual({ gameDayIndex: 0, kecIndex: 48, label: '第49刻' });
    expect(readKecClock(1740, clock)).toEqual({ gameDayIndex: 1, kecIndex: 0, label: '第1刻' });
  });

  it('rejects negative and off-grid game time', () => {
    expect(() => readKecClock(-1, clock)).toThrow('GAME_MINUTE_BEFORE_START');
    expect(() => readKecClock(301, clock)).toThrow('GAME_MINUTE_OFF_KEC_GRID');
  });
});
