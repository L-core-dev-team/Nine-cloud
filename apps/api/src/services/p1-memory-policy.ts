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

/**
 * Option a (co-approved by the authors, 2026-10-09) folds the P4
 * authorized-cue-recall artifacts into `createP1SaveMemoryPolicy`, so
 * `memoryPolicyArtifacts` in the semantic inputs moved and `semanticSha256`
 * was re-signed for that real semantic change.
 *
 * Plan B (adjudicated by LYL, 2026-10-10): newly created saves pin the v2
 * decay-gated recall artifacts so forgetting saves answer through the same
 * reviewed forgetting curve as the narrative layer. The hashes are the SHA-256
 * of the file bytes of the reviewed documents
 * packages/domain/src/memory/p4-recall-policy-v2.json and p4-recall-cues-v1.json.
 * The pinned save-side policy shape stays exactly the same eleven keys; the v2
 * decay constants live only in the external v2 artifact.
 */
export const P1_SAVE_RECALL_ARTIFACT_IDENTITY = Object.freeze({
  retrievalVersion: 'authorized-cue-recall-v2',
  normalizerVersion: 'NFKC-lowercase-space-v1',
  policyArtifactHash: 'sha256:5da8bd8e61e4859e5492b5393e3f458b12ded9cc36025858415fbe51c27261de',
  cueDictionaryHash: 'sha256:d3dcd20c850741d5095b960488310007a163b03b53cb40aaa60b57dae9031e31',
} as const);

export function createP1SaveMemoryPolicy(mode: MemoryMode, createdAtRevision = 0, policyVersion = P1_MEMORY_POLICY_VERSION): SaveMemoryPolicy {
  return {
    mode,
    policyVersion,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: P1_SAVE_RECALL_ARTIFACT_IDENTITY.policyArtifactHash,
    cueDictionaryHash: P1_SAVE_RECALL_ARTIFACT_IDENTITY.cueDictionaryHash,
    normalizerVersion: P1_SAVE_RECALL_ARTIFACT_IDENTITY.normalizerVersion,
    retrievalVersion: P1_SAVE_RECALL_ARTIFACT_IDENTITY.retrievalVersion,
    visibilityPolicyVersion: P1_MEMORY_VISIBILITY_POLICY_VERSION,
    visibilityPolicyHash: digest(visibilityArtifact),
    createdAtRevision,
  };
}

/** Exact identity of saves created before the authorized-cue-recall artifacts; never issued again. */
function legacyP1SaveMemoryPolicy(mode: MemoryMode, policyVersion: string): SaveMemoryPolicy {
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
    createdAtRevision: 0,
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
  if (canonicalJson(save.memoryPolicy) === canonicalJson(expected)) return save.memoryMode;
  // Saves created before the authorized-cue-recall artifacts keep their legacy
  // pinned identity: they still load and play, and the recall endpoint abstains
  // for them instead of this assertion rewriting the historical envelope.
  const legacy = legacyP1SaveMemoryPolicy(save.memoryMode, save.memoryPolicyVersion);
  if (canonicalJson(save.memoryPolicy) === canonicalJson(legacy)) return save.memoryMode;
  // Saves created between the 2026-10-09 option-a pin and the 2026-10-10 plan-B
  // pin carry the v1 authorized-cue-recall identity; they still load and play,
  // and the recall route keeps refusing their forgetting saves with 503.
  const v1Recall = v1RecallSaveMemoryPolicy(save.memoryMode, save.memoryPolicyVersion);
  if (v1Recall && canonicalJson(save.memoryPolicy) === canonicalJson(v1Recall)) return save.memoryMode;
  throw new Error('P1_MEMORY_POLICY_MISMATCH');
}

/** Exact identity of saves created under the 2026-10-09 option-a v1 recall pin; never issued again. */
function v1RecallSaveMemoryPolicy(mode: MemoryMode, policyVersion: string): SaveMemoryPolicy | null {
  if (policyVersion !== P1_MEMORY_POLICY_VERSION) return null;
  return {
    mode,
    policyVersion,
    schemaVersion: 1,
    clockBasis: 'game-minute+npc-grant-sequence-v1',
    policyArtifactHash: 'sha256:a7e096c182da6e5e77f2f5d8ae6fafe84786e8c481ea2b033125aecb8529a70c',
    cueDictionaryHash: 'sha256:d3dcd20c850741d5095b960488310007a163b03b53cb40aaa60b57dae9031e31',
    normalizerVersion: 'NFKC-lowercase-space-v1',
    retrievalVersion: 'authorized-cue-recall-v1',
    visibilityPolicyVersion: P1_MEMORY_VISIBILITY_POLICY_VERSION,
    visibilityPolicyHash: digest(visibilityArtifact),
    createdAtRevision: 0,
  };
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
