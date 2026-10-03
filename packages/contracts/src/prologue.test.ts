import { describe, expect, it } from 'vitest';
import { parsePrologueV1Facts, PrologueV1FactsSchema } from './prologue.js';

const validFacts = {
  gameMinute: 300,
  stamina: 100,
  staminaDayIndex: 0,
  spiritStamina: 100,
  cultivationProgress: 0,
  fatigueCount: 0,
  inventory: [{ itemId: 'fixture_item', quantity: 1 }],
  effectFlags: [],
  clues: [],
  observationLog: [],
  npcInteractionLog: [],
  travelLog: [],
  injuryFlags: [],
  questState: { status: 'unavailable', rewardClaimed: false },
  knownLocations: ['fixture_location'],
  locationGraph: [{ from: 'fixture_location', to: 'fixture_other', state: 'open' }],
  idleCount: 0,
  obstacleState: 'blocked',
  ferryState: 'aground',
} as const;

describe('P1 prologue facts contract', () => {
  it('parses the complete closed projection without changing its values', () => {
    expect(parsePrologueV1Facts(validFacts)).toEqual(validFacts);
  });

  it('rejects facts outside the signed projection directory', () => {
    expect(PrologueV1FactsSchema.safeParse({ ...validFacts, modelSummary: 'untrusted write' }).success).toBe(false);
  });

  it('rejects out-of-range resources and invalid graph states', () => {
    expect(PrologueV1FactsSchema.safeParse({ ...validFacts, stamina: 101 }).success).toBe(false);
    expect(PrologueV1FactsSchema.safeParse({
      ...validFacts,
      locationGraph: [{ from: 'a', to: 'b', state: 'unknown' }],
    }).success).toBe(false);
  });

  it('keeps quest completion derived without an unapproved active status', () => {
    expect(PrologueV1FactsSchema.safeParse({
      ...validFacts,
      questState: { status: 'active', rewardClaimed: false },
    }).success).toBe(false);
  });
});
