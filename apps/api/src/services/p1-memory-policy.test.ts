import { describe, expect, it } from 'vitest';
import { createP1SaveMemoryPolicy, assertP1SaveMemoryPolicy } from './p1-memory-policy.js';

function save(mode: 'continue' | 'forgetting') {
  const memoryPolicy = createP1SaveMemoryPolicy(mode);
  return {
    schemaVersion: 2 as const,
    saveId: `save-${mode}`,
    revision: 0,
    ruleVersion: 'prologue-v1-candidate-20261005',
    canonVersion: 'prologue-canon-candidate-20261005',
    memoryPolicyVersion: memoryPolicy.policyVersion,
    memoryMode: mode,
    memoryPolicy,
    state: {
      playerId: 'player-test',
      locationId: 'loc_luhuadu',
      elapsedMinutes: 0,
      facts: {},
    },
  };
}

describe('P1 save memory policy pinning', () => {
  it('reconstructs the selected immutable mode from its complete policy artifact', () => {
    expect(assertP1SaveMemoryPolicy(save('continue'))).toBe('continue');
    expect(assertP1SaveMemoryPolicy(save('forgetting'))).toBe('forgetting');
  });

  it('rejects a mode, algorithm, or artifact hash that diverges from the pinned policy', () => {
    const original = save('forgetting');
    expect(() => assertP1SaveMemoryPolicy({ ...original, memoryMode: 'continue' })).toThrow('P1_MEMORY_POLICY_MISMATCH');
    expect(() => assertP1SaveMemoryPolicy({
      ...original,
      memoryPolicy: { ...original.memoryPolicy, retrievalVersion: 'continue-v1' },
    })).toThrow('P1_MEMORY_POLICY_MISMATCH');
    expect(() => assertP1SaveMemoryPolicy({
      ...original,
      memoryPolicy: { ...original.memoryPolicy, policyArtifactHash: `sha256:${'0'.repeat(64)}` },
    })).toThrow('P1_MEMORY_POLICY_MISMATCH');
  });
});
