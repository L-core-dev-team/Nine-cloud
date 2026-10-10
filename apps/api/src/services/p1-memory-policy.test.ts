import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createP1SaveMemoryPolicy, assertP1SaveMemoryPolicy, P1_SAVE_RECALL_ARTIFACT_IDENTITY } from './p1-memory-policy.js';
import { NPC_MEMORY_RECALL_POLICY } from './npc-memory-recall.js';

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
    const v2 = save('continue');
    expect(assertP1SaveMemoryPolicy({ ...v2, schemaVersion: 3, canonArtifactHash: `sha256:${'d'.repeat(64)}`, branchId: 'root', parentBranchId: null,
      forkRevision: 0, createdPolicyVersion: v2.memoryPolicy.policyVersion, sourceMigrationId: null })).toBe('continue');
  });

  it('pins the authorized-cue-recall artifacts so newly created saves pass the recall identity check', () => {
    for (const mode of ['continue', 'forgetting'] as const) {
      const memoryPolicy = createP1SaveMemoryPolicy(mode);
      expect(memoryPolicy.retrievalVersion).toBe(NPC_MEMORY_RECALL_POLICY.retrievalVersion);
      expect(memoryPolicy.normalizerVersion).toBe(NPC_MEMORY_RECALL_POLICY.normalizerVersion);
      expect(memoryPolicy.policyArtifactHash).toBe(NPC_MEMORY_RECALL_POLICY.policyArtifactHash);
      expect(memoryPolicy.cueDictionaryHash).toBe(NPC_MEMORY_RECALL_POLICY.cueDictionaryHash);
      expect(memoryPolicy.clockBasis).toBe('game-minute+npc-grant-sequence-v1');
    }
  });

  it('binds the pinned identity to the reviewed recall document bytes', () => {
    const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    for (const [file, pinned] of [
      ['packages/domain/src/memory/p4-recall-policy-v2.json', P1_SAVE_RECALL_ARTIFACT_IDENTITY.policyArtifactHash],
      ['packages/domain/src/memory/p4-recall-cues-v1.json', P1_SAVE_RECALL_ARTIFACT_IDENTITY.cueDictionaryHash],
    ] as const) {
      const fileBytes = `sha256:${createHash('sha256').update(readFileSync(resolve(repositoryRoot, file))).digest('hex')}`;
      expect(`${file}: ${fileBytes}`).toBe(`${file}: ${pinned}`);
    }
  });

  it('keeps the save-side policy pinned at exactly the same eleven keys across the v2 upgrade', () => {
    for (const mode of ['continue', 'forgetting'] as const) {
      const memoryPolicy = createP1SaveMemoryPolicy(mode);
      expect(Object.keys(memoryPolicy).sort()).toEqual([
        'clockBasis', 'createdAtRevision', 'cueDictionaryHash', 'mode', 'normalizerVersion',
        'policyArtifactHash', 'policyVersion', 'retrievalVersion', 'schemaVersion',
        'visibilityPolicyHash', 'visibilityPolicyVersion',
      ]);
      // The v2 decay constants live only in the external artifact; no new save-side key is added.
      expect(memoryPolicy).not.toHaveProperty('forgettingDecay');
      expect(memoryPolicy.mode).toBe(mode);
      expect(memoryPolicy.schemaVersion).toBe(1);
    }
  });

  it('keeps option-a v1 recall saves loadable on their historical identity', () => {
    const v1Policy = {
      mode: 'forgetting' as const,
      policyVersion: 'p1-memory-policy-v1',
      schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
      policyArtifactHash: 'sha256:a7e096c182da6e5e77f2f5d8ae6fafe84786e8c481ea2b033125aecb8529a70c',
      cueDictionaryHash: 'sha256:d3dcd20c850741d5095b960488310007a163b03b53cb40aaa60b57dae9031e31',
      normalizerVersion: 'NFKC-lowercase-space-v1',
      retrievalVersion: 'authorized-cue-recall-v1',
      visibilityPolicyVersion: 'p1-direct-npc-participant-v1',
      visibilityPolicyHash: 'sha256:52b0274b0c90344d47c2337ffc0a092ad0b3e7c8112e16c14843eb78d1d4a4c3',
      createdAtRevision: 0,
    };
    // The historical v1 identity shares the unchanged visibility artifact but pins the v1 policy bytes.
    expect(v1Policy.visibilityPolicyHash).toBe(createP1SaveMemoryPolicy('forgetting').visibilityPolicyHash);
    expect(v1Policy.policyArtifactHash).not.toBe(createP1SaveMemoryPolicy('forgetting').policyArtifactHash);
    const mode = assertP1SaveMemoryPolicy({ ...save('forgetting'), memoryPolicy: v1Policy });
    expect(mode).toBe('forgetting');
    expect(createP1SaveMemoryPolicy('forgetting').retrievalVersion).toBe('authorized-cue-recall-v2');
    // A v1 envelope is not silently upgraded to v2.
    expect(save('forgetting').memoryPolicy.retrievalVersion).toBe('authorized-cue-recall-v2');
    // Any drift inside the historical identity still fails closed.
    expect(() => assertP1SaveMemoryPolicy({
      ...save('forgetting'),
      memoryPolicy: { ...v1Policy, policyArtifactHash: `sha256:${'0'.repeat(64)}` },
    })).toThrow('P1_MEMORY_POLICY_MISMATCH');
  });

  it('keeps pre-recall saves loadable on their legacy identity while new saves carry the recall artifacts', () => {
    // Legacy artifacts as issued before option a (canonical-JSON digests of the
    // then-pinned composition); they must still validate instead of failing closed.
    const legacyPolicy = (mode: 'continue' | 'forgetting') => ({
      mode,
      policyVersion: 'p1-memory-policy-v1',
      schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1' as const,
      policyArtifactHash: mode === 'continue'
        ? 'sha256:d05628148b5a8ae5075fe22ae8487afbb4cd2420811e30f357db8ae8958df600'
        : 'sha256:4281bffb2fc2b0c372f46892183198961a72d9abc7f4886fcae3123a2c6c5bca',
      cueDictionaryHash: 'sha256:c5e797971f9f4a983bf79abb5ac96c6b4151ffbb13578b1357ce1c18da56942f',
      normalizerVersion: 'nfkc-lowercase-v1',
      retrievalVersion: mode === 'continue' ? 'continue-v1' : 'forgetting-v1',
      visibilityPolicyVersion: 'p1-direct-npc-participant-v1',
      visibilityPolicyHash: 'sha256:52b0274b0c90344d47c2337ffc0a092ad0b3e7c8112e16c14843eb78d1d4a4c3',
      createdAtRevision: 0,
    });
    for (const mode of ['continue', 'forgetting'] as const) {
      expect(assertP1SaveMemoryPolicy({ ...save(mode), memoryPolicy: legacyPolicy(mode) })).toBe(mode);
      // A legacy envelope is not silently upgraded: the stored identity stays legacy.
      expect(save(mode).memoryPolicy.retrievalVersion).toBe('authorized-cue-recall-v2');
    }
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
    expect(() => assertP1SaveMemoryPolicy({
      ...original,
      memoryPolicy: { ...original.memoryPolicy, cueDictionaryHash: 'sha256:c5e797971f9f4a983bf79abb5ac96c6b4151ffbb13578b1357ce1c18da56942f' },
    })).toThrow('P1_MEMORY_POLICY_MISMATCH');
  });
});
