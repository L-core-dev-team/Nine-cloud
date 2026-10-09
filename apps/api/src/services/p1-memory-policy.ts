import { createHash } from 'node:crypto';
import type { MemoryMode, SaveEnvelopeV2, SaveEnvelopeV3, SaveMemoryPolicy } from '@jiuxiao/contracts';
import { canonicalJson } from '@jiuxiao/domain';

export const P1_MEMORY_POLICY_VERSION = 'p1-memory-policy-v1';
export const P1_MEMORY_VISIBILITY_POLICY_VERSION = 'p1-direct-npc-participant-v1';
export const P1_MEMORY_NORMALIZER_VERSION = 'nfkc-lowercase-v1';

const cueArtifact = Object.freeze({
  version: 'literal-substring-cue-v1',
  normalizerVersion: P1_MEMORY_NORMALIZER_VERSION,
  rule: 'A query must match text already present in an authorized observation.',
});

const visibilityArtifact = Object.freeze({
  version: P1_MEMORY_VISIBILITY_POLICY_VERSION,
  eligibleEventTypes: ['talk.occurred'],
  grant: 'Only the NPC named as a direct participant receives a witnessed observation.',
  authorizedProjection: ['topicTag', 'outcome'],
  forbidden: ['copy-raw-event-payload', 'infer-global-event-visibility', 'model-authored-grant'],
});

export function createP1SaveMemoryPolicy(mode: MemoryMode, createdAtRevision = 0, policyVersion = P1_MEMORY_POLICY_VERSION): SaveMemoryPolicy {
  const retrieval = mode === 'continue'
    ? { version: 'continue-v1', algorithm: 'no-retrieval-decay' }
    : {
      version: 'forgetting-v1',
      algorithm: 'game-time-and-npc-observed-event-half-life',
      halfLifeGameMinutes: 10_080,
      halfLifeObservedEvents: 16,
      cueAccessibilityFloor: 0.35,
    };
  const artifact = Object.freeze({
    policyVersion,
    mode,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    retrieval,
    cueArtifact,
    visibilityArtifact,
  });
  return {
    mode,
    policyVersion,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: digest(artifact),
    cueDictionaryHash: digest(cueArtifact),
    normalizerVersion: P1_MEMORY_NORMALIZER_VERSION,
    retrievalVersion: retrieval.version,
    visibilityPolicyVersion: P1_MEMORY_VISIBILITY_POLICY_VERSION,
    visibilityPolicyHash: digest(visibilityArtifact),
    createdAtRevision,
  };
}

/** Fail closed if a stored save's mode or policy artifact no longer matches its pinned identity. */
export function assertP1SaveMemoryPolicy(save: SaveEnvelopeV2 | SaveEnvelopeV3): MemoryMode {
  if (!save || (save.schemaVersion !== 2 && save.schemaVersion !== 3) || save.memoryPolicyVersion !== save.memoryPolicy.policyVersion) {
    throw new Error('P1_MEMORY_POLICY_MISMATCH');
  }
  return assertP1MemoryPolicyFields(save);
}

/** Validate the memory policy independent of the save-envelope compatibility version. */
export function assertP1MemoryPolicyFields(save: Pick<SaveEnvelopeV2 | SaveEnvelopeV3,
  'memoryMode' | 'memoryPolicyVersion' | 'memoryPolicy'>): MemoryMode {
  if (save.memoryPolicyVersion !== save.memoryPolicy.policyVersion) throw new Error('P1_MEMORY_POLICY_MISMATCH');
  const expected = createP1SaveMemoryPolicy(save.memoryMode, 0, save.memoryPolicyVersion);
  if (canonicalJson(save.memoryPolicy) !== canonicalJson(expected)) throw new Error('P1_MEMORY_POLICY_MISMATCH');
  return save.memoryMode;
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
