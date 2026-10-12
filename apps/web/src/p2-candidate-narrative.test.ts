import { describe, expect, it } from 'vitest';
import type { SaveEnvelopeV3 } from '@jiuxiao/contracts';
import {
  buildP2CandidateNarrativeContext,
  validateNarrativeSourceCandidates,
  type PlotDigestProvenance,
} from './p2-candidate-narrative.js';

function save(): SaveEnvelopeV3 {
  return {
    schemaVersion: 3,
    saveId: 'candidate-save',
    canonVersion: 'candidate-canon-v1',
    canonArtifactHash: `sha256:${'a'.repeat(64)}`,
    ruleVersion: 'candidate-rules-v1',
    memoryPolicyVersion: 'candidate-memory-v1',
    memoryMode: 'continue',
    memoryPolicy: {
      mode: 'continue', policyVersion: 'candidate-memory-v1', schemaVersion: 1,
      clockBasis: 'game-minute+npc-grant-sequence-v1',
      policyArtifactHash: `sha256:${'b'.repeat(64)}`, cueDictionaryHash: `sha256:${'c'.repeat(64)}`,
      normalizerVersion: 'nfkc-v1', retrievalVersion: 'continue-v1',
      visibilityPolicyVersion: 'visibility-v1', visibilityPolicyHash: `sha256:${'d'.repeat(64)}`,
      createdAtRevision: 0,
    },
    branchId: 'root', parentBranchId: null, forkRevision: 0,
    createdPolicyVersion: 'candidate-memory-v1', sourceMigrationId: null,
    revision: 5,
    state: { playerId: 'player-1', locationId: 'loc_luhuadu', elapsedMinutes: 60,
      facts: { gameMinute: 60, stamina: 5, spiritStamina: 4, inventory: [], clues: [], questState: { status: 'unavailable', rewardClaimed: false } } },
  };
}

function digest(overrides: Partial<PlotDigestProvenance> = {}): PlotDigestProvenance {
  return {
    digestId: 'digest:approved-1', saveId: 'candidate-save', branchId: 'root',
    fromRevision: 1, throughRevision: 5, coveredEventIds: ['event-1'],
    generatorVersion: 'deterministic-summary-v1', promptVersion: 'none',
    inputHash: `sha256:${'1'.repeat(64)}`, outputHash: `sha256:${'2'.repeat(64)}`,
    modelVendor: null, modelId: null, approvalStatus: 'approved', rebuildStatus: 'ready',
    ...overrides,
  };
}

describe('candidate narrative source boundary', () => {
  it('keeps pending profiles, stale digests, and unapproved event ranges out of context', () => {
    const context = buildP2CandidateNarrativeContext({
      save: save(), receipt: null, memoryEvidence: null, authorizedEventIds: ['event-1'],
      profileFields: [
        { sourceId: 'profile:npc-cenjiu:name', sourceVersion: 'canon-v1', npcId: 'npc_cenjiu',
          field: 'name', value: '岑九', visibility: 'npc-visible', approvalStatus: 'approved' },
        { sourceId: 'profile:candidate:secret', sourceVersion: 'draft-v1', npcId: 'npc_cenjiu',
          field: 'secret', value: '候选内容', visibility: 'npc-visible', approvalStatus: 'candidate-only' },
      ],
      digests: [digest(), digest({ digestId: 'digest:unapproved-event', coveredEventIds: ['event-unseen'] }),
        digest({ digestId: 'digest:pending', approvalStatus: 'pending' }),
        digest({ digestId: 'digest:stale', throughRevision: 6 })],
    });
    expect(context.approvedProfileFields.map(field => field.sourceId)).toEqual(['profile:npc-cenjiu:name']);
    expect(context.digestProvenance.map(item => item.digestId)).toEqual(['digest:approved-1']);
    expect(context.sourceCatalog.find(source => source.kind === 'plot-digest')?.visibility).toBe('player-visible');
    expect(context.scope).toMatchObject({ saveId: 'candidate-save', branchId: 'root', memoryMode: 'continue', revision: 5 });
    expect(context.sourceCatalog.filter(source => source.kind === 'state-fact').every(source => source.visibility === 'player-visible')).toBe(true);
    expect(context.styleInstructions.map(item => item.id)).toEqual([
      'source-bounded', 'uncertainty-explicit', 'npc-knowledge-bounded', 'no-new-facts',
    ]);
  });

  it('allows only existing source IDs from a read-only adapter and rejects cross-scope inventions', () => {
    const context = buildP2CandidateNarrativeContext({ save: save(), receipt: null, memoryEvidence: null,
      authorizedEventIds: [], profileFields: [{ sourceId: 'profile:npc:name', sourceVersion: 'canon-v1',
        npcId: 'npc_cenjiu', field: 'name', value: '岑九', visibility: 'npc-visible', approvalStatus: 'approved' }] });
    expect(validateNarrativeSourceCandidates(context, ['profile:npc:name'])).toMatchObject([{ sourceId: 'profile:npc:name' }]);
    expect(() => validateNarrativeSourceCandidates(context, ['forged:event'])).toThrow('NARRATIVE_ADAPTER_SOURCE_NOT_AUTHORIZED');
    expect(() => validateNarrativeSourceCandidates(context, ['profile:npc:name', 'profile:npc:name']))
      .toThrow('NARRATIVE_ADAPTER_CANDIDATE_LIST_INVALID');
  });
});
