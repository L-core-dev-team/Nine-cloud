import { describe, expect, it } from 'vitest';
import {
  clearanceStaminaMargin,
  minimumClearanceCost,
  PROLOGUE_V1,
  PROLOGUE_V1_ACTION_ORDER,
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

  it('keeps time and resource units explicit', () => {
    expect(PROLOGUE_V1.KEC_MINUTES).toBe(15);
    expect(PROLOGUE_V1.DAY_MINUTES).toBe(1440);
    expect(PROLOGUE_V1.SAVE_START_MINUTE).toBe(PROLOGUE_V1.STAMINA_RESET_ANCHOR);
  });
});
