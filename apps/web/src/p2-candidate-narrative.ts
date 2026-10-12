import type { MemoryMode, SaveEnvelopeV3, TurnReceipt } from '@jiuxiao/contracts';
import type { AuthorizedRecallResult } from '@jiuxiao/domain';

export type CharacterProfileField = {
  sourceId: string;
  sourceVersion: string;
  npcId: string;
  field: string;
  value: string;
  visibility: 'player-visible' | 'npc-visible' | 'internal';
  approvalStatus: 'approved' | 'candidate-only' | 'pending';
};

export type PlotDigestProvenance = {
  digestId: string;
  saveId: string;
  branchId: 'root';
  fromRevision: number;
  throughRevision: number;
  coveredEventIds: readonly string[];
  generatorVersion: string;
  promptVersion: string;
  inputHash: `sha256:${string}`;
  outputHash: `sha256:${string}`;
  modelVendor: string | null;
  modelId: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  rebuildStatus: 'ready' | 'stale' | 'interrupted';
};

export type NarrativeSourceRef = {
  sourceId: string;
  kind: 'profile-field' | 'plot-digest' | 'state-fact' | 'receipt-event' | 'npc-memory';
  revision: number;
  visibility: 'player-visible' | 'npc-visible' | 'internal';
};

export type CandidateStyleInstruction = {
  id: 'source-bounded' | 'uncertainty-explicit' | 'npc-knowledge-bounded' | 'no-new-facts';
  priority: number;
  instruction: string;
};

export type P2CandidateNarrativeContext = {
  schemaVersion: 1;
  scope: { saveId: string; branchId: 'root'; memoryMode: MemoryMode; revision: number };
  scene: { locationId: string; gameMinute: number };
  stateFacts: Readonly<Record<string, unknown>>;
  approvedProfileFields: readonly CharacterProfileField[];
  digestProvenance: readonly PlotDigestProvenance[];
  receipt: { revision: number; eventIds: readonly string[]; eventTypes: readonly string[] } | null;
  memoryEvidence: { status: AuthorizedRecallResult['status']; sourceIds: readonly string[] } | null;
  sourceCatalog: readonly NarrativeSourceRef[];
  styleInstructions: readonly CandidateStyleInstruction[];
};

const CANDIDATE_STYLE_INSTRUCTIONS: readonly CandidateStyleInstruction[] = Object.freeze([
  Object.freeze({ id: 'source-bounded', priority: 10, instruction: '叙述中的事实只来自本上下文的可见来源，并保留来源边界。' }),
  Object.freeze({ id: 'uncertainty-explicit', priority: 20, instruction: '证据不完整、部分匹配或不可唤回时，明确表达不确定，不补齐缺失事实。' }),
  Object.freeze({ id: 'npc-knowledge-bounded', priority: 30, instruction: 'NPC 只知道明确授权给该 NPC 的观察，不从全局事件推知未见事实。' }),
  Object.freeze({ id: 'no-new-facts', priority: 40, instruction: '不创作新的角色经历、动机、关系状态、世界事实或玩家内心。' }),
]);

/** An adapter may rank source IDs. It cannot write facts, grants, state, or Canon. */
export type NarrativeSourceCandidateAdapter = {
  readonly adapterId: string;
  readonly selectSourceIds: (input: {
    readonly query: string;
    readonly sourceCatalog: readonly NarrativeSourceRef[];
    readonly limit: number;
  }) => Promise<readonly string[]>;
};

export function buildP2CandidateNarrativeContext(input: {
  save: SaveEnvelopeV3;
  receipt: TurnReceipt | null;
  memoryEvidence: AuthorizedRecallResult | null;
  authorizedEventIds: readonly string[];
  profileFields?: readonly CharacterProfileField[];
  digests?: readonly PlotDigestProvenance[];
}): P2CandidateNarrativeContext {
  const { save, receipt, memoryEvidence } = input;
  if (save.schemaVersion !== 3 || save.branchId !== 'root' || !Number.isSafeInteger(save.revision) || save.revision < 0) {
    throw new Error('NARRATIVE_CONTEXT_SAVE_INVALID');
  }
  if (receipt && (receipt.saveId !== save.saveId || receipt.resultingRevision > save.revision
    || receipt.decision.status !== 'accepted' && receipt.decision.status !== 'rejected' && receipt.decision.status !== 'clarify')) {
    throw new Error('NARRATIVE_CONTEXT_RECEIPT_SCOPE_INVALID');
  }
  const profileFields = (input.profileFields ?? []).filter(field => field.approvalStatus === 'approved'
    && field.visibility !== 'internal' && field.sourceId.trim() && field.sourceVersion.trim());
  const authorizedEventIds = new Set(input.authorizedEventIds);
  const digests = (input.digests ?? []).filter(digest => digest.approvalStatus === 'approved'
    && digest.rebuildStatus === 'ready' && digest.saveId === save.saveId && digest.branchId === save.branchId
    && Number.isSafeInteger(digest.fromRevision) && Number.isSafeInteger(digest.throughRevision)
    && digest.fromRevision >= 0 && digest.throughRevision <= save.revision
    && digest.fromRevision <= digest.throughRevision && /^sha256:[0-9a-f]{64}$/i.test(digest.inputHash)
    && /^sha256:[0-9a-f]{64}$/i.test(digest.outputHash)
    && digest.coveredEventIds.length > 0 && digest.coveredEventIds.every(eventId => authorizedEventIds.has(eventId)));
  const stateFacts = safeStateFacts(save);
  const sourceCatalog: NarrativeSourceRef[] = [
    ...profileFields.map(field => ({ sourceId: field.sourceId, kind: 'profile-field' as const,
      revision: save.revision, visibility: field.visibility })),
    // Plot summaries are derived player-facing aids. They never become an NPC
    // memory source; NPC knowledge continues to come only from authorized grants.
    ...digests.map(digest => ({ sourceId: digest.digestId, kind: 'plot-digest' as const,
      revision: digest.throughRevision, visibility: 'player-visible' as const })),
    ...Object.keys(stateFacts).map(field => ({ sourceId: `state:${field}`, kind: 'state-fact' as const,
      revision: save.revision, visibility: 'player-visible' as const })),
    ...(receipt?.decision.status === 'accepted' ? receipt.decision.events.map(event => ({ sourceId: event.id,
      kind: 'receipt-event' as const, revision: receipt.resultingRevision, visibility: 'player-visible' as const })) : []),
    ...(memoryEvidence?.status === 'complete' ? [{ sourceId: memoryEvidence.grantId, kind: 'npc-memory' as const,
      revision: save.revision, visibility: 'npc-visible' as const }] : []),
    ...(memoryEvidence?.status === 'partial' ? memoryEvidence.candidates.map(candidate => ({ sourceId: candidate.grantId,
      kind: 'npc-memory' as const, revision: save.revision, visibility: 'npc-visible' as const })) : []),
  ];
  return {
    schemaVersion: 1,
    scope: { saveId: save.saveId, branchId: 'root', memoryMode: save.memoryMode, revision: save.revision },
    scene: { locationId: save.state.locationId, gameMinute: Number(stateFacts.gameMinute) },
    stateFacts,
    approvedProfileFields: profileFields,
    digestProvenance: digests,
    receipt: receipt?.decision.status === 'accepted' ? {
      revision: receipt.resultingRevision,
      eventIds: receipt.decision.events.map(event => event.id),
      eventTypes: receipt.decision.events.map(event => event.type),
    } : null,
    memoryEvidence: memoryEvidence ? { status: memoryEvidence.status,
      sourceIds: memoryEvidence.status === 'complete' ? [memoryEvidence.grantId]
        : memoryEvidence.status === 'partial' ? memoryEvidence.candidates.map(candidate => candidate.grantId) : [] } : null,
    sourceCatalog: sourceCatalog.sort((left, right) => left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0),
    styleInstructions: CANDIDATE_STYLE_INSTRUCTIONS.map(instruction => ({ ...instruction })),
  };
}

/** Core re-reads only already-authorized sources and rejects adapter hallucinations. */
export function validateNarrativeSourceCandidates(
  context: P2CandidateNarrativeContext,
  candidateIds: readonly string[],
  limit = 16,
): readonly NarrativeSourceRef[] {
  if (!Array.isArray(candidateIds) || !Number.isSafeInteger(limit) || limit < 1 || limit > 64
    || candidateIds.length > limit || new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('NARRATIVE_ADAPTER_CANDIDATE_LIST_INVALID');
  }
  const allowed = new Map(context.sourceCatalog.map(source => [source.sourceId, source]));
  return candidateIds.map(id => {
    const source = allowed.get(id);
    if (!source) throw new Error('NARRATIVE_ADAPTER_SOURCE_NOT_AUTHORIZED');
    if (source.revision > context.scope.revision) throw new Error('NARRATIVE_ADAPTER_SOURCE_FROM_FUTURE');
    return structuredClone(source);
  });
}

function safeStateFacts(save: SaveEnvelopeV3): Readonly<Record<string, unknown>> {
  const facts = save.state.facts;
  const selected = {
    gameMinute: facts.gameMinute,
    stamina: facts.stamina,
    spiritStamina: facts.spiritStamina,
    inventory: facts.inventory,
    clues: facts.clues,
    questState: facts.questState,
    locationId: save.state.locationId,
  };
  return structuredClone(selected);
}
