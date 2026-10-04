import { describe, expect, it } from 'vitest';
import {
  clearanceStaminaMargin,
  minimumClearanceCost,
  PROLOGUE_V1,
  PROLOGUE_V1_ACTION_ORDER,
  PROLOGUE_V1_ERROR_CODES,
  PROLOGUE_V1_ERROR_MESSAGES,
  PROLOGUE_V1_FREE_ACTION_TICK_KEC_COUNT,
  PROLOGUE_V1_RULE_VERSION,
} from './prologue-v1.constants.js';

describe('signed P1 prologue rule constants', () => {
  it('pins the minimum route cost and stamina margin from the signed table', () => {
    expect(minimumClearanceCost()).toBe(42);
    expect(clearanceStaminaMargin()).toBeCloseTo(2.38, 2);
    expect(clearanceStaminaMargin()).toBeGreaterThanOrEqual(1.5);
    expect(clearanceStaminaMargin()).toBeLessThanOrEqual(3);
  });

  it('exposes exactly the eight signed action kinds in canonical order', () => {
    expect(PROLOGUE_V1_ACTION_ORDER).toEqual([
      'move', 'cultivate', 'acquire_item', 'use_item', 'talk', 'observe', 'combat', 'quest',
    ]);
    expect(PROLOGUE_V1_RULE_VERSION).toBe('prologue-v1');
  });

  it('uses Kec as the action unit and gameMinute as the single persisted clock', () => {
    expect(PROLOGUE_V1.GAME_MINUTES_PER_KEC).toBe(15);
    expect(PROLOGUE_V1.DAY_KEC_COUNT).toBe(96);
    expect(PROLOGUE_V1.SAVE_START_GAME_MINUTE).toBe(300);
    expect(PROLOGUE_V1.DUSK_START_KEC).toBe(48);
    expect(PROLOGUE_V1_FREE_ACTION_TICK_KEC_COUNT).toBe(1);
  });

  it('provides one player-readable message for every signed rule error code', () => {
    expect(Object.keys(PROLOGUE_V1_ERROR_MESSAGES).sort()).toEqual(
      Object.keys(PROLOGUE_V1_ERROR_CODES).sort(),
    );
    for (const message of Object.values(PROLOGUE_V1_ERROR_MESSAGES)) {
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });
});
