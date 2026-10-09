import type { SaveEnvelope, TurnReceipt } from '@jiuxiao/contracts';
import {
  recallAuthorizedObservations,
  recognizeAuthorizedMemoryCue,
  type AuthorizedRecallResult,
  type AuthorizedRecallObservation,
} from '@jiuxiao/domain';

export const NPC_MEMORY_RECALL_POLICY = {
  retrievalVersion: 'authorized-cue-recall-v1',
  normalizerVersion: 'NFKC-lowercase-space-v1',
  policyArtifactHash: 'sha256:a7e096c182da6e5e77f2f5d8ae6fafe84786e8c481ea2b033125aecb8529a70c',
  cueDictionaryHash: 'sha256:d3dcd20c850741d5095b960488310007a163b03b53cb40aaa60b57dae9031e31',
} as const;

const PAGE_SIZE = 100;
const MAX_RECALL_ROWS = 10_000;
const MAX_RECALL_PAGES = MAX_RECALL_ROWS / PAGE_SIZE + 1;

export type AuthorizedRecallPageReader = (ownerId: string, saveId: string, npcId: string, cursor?: {
  eventRevision: number; grantId: string;
}, limit?: number, throughRevision?: number) => Promise<{
  items: AuthorizedRecallObservation[];
  nextCursor: { eventRevision: number; grantId: string } | null;
}>;

export type NpcMemoryRecallResolution =
  | { kind: 'evidence'; recall: Extract<AuthorizedRecallResult, { status: 'complete' | 'partial' }> }
  | { kind: 'deterministic'; text: string; reason: 'no-evidence' | 'time-qualified-state' | 'unclassified' | 'incomplete' | 'policy-unavailable' };

/**
 * Read only the NPC's frozen, authorized facts up to the turn before the
 * current accepted interaction. It never reauthorizes an event payload.
 */
export async function resolveNpcMemoryRecall(input: {
  reader: AuthorizedRecallPageReader;
  ownerId: string;
  save: SaveEnvelope;
  receipt: TurnReceipt;
  npcId: string;
  utterance: string;
}): Promise<NpcMemoryRecallResolution | null> {
  const cue = recognizeAuthorizedMemoryCue(input.utterance);
  if (!cue) return null;
  const { save, receipt } = input;
  if (save.schemaVersion !== 2 || save.memoryMode !== 'continue'
    || save.memoryPolicy.retrievalVersion !== NPC_MEMORY_RECALL_POLICY.retrievalVersion
    || save.memoryPolicy.normalizerVersion !== NPC_MEMORY_RECALL_POLICY.normalizerVersion
    || save.memoryPolicy.policyArtifactHash !== NPC_MEMORY_RECALL_POLICY.policyArtifactHash
    || save.memoryPolicy.cueDictionaryHash !== NPC_MEMORY_RECALL_POLICY.cueDictionaryHash
    || !('clockMinute' in receipt) || receipt.branchId !== 'root' || receipt.saveId !== save.saveId
    || !Number.isSafeInteger(receipt.resultingRevision) || receipt.resultingRevision < 1) {
    return { kind: 'deterministic', text: '这段旧事，我没有足够可靠的记忆来回答。', reason: 'policy-unavailable' };
  }
  const throughRevision = receipt.resultingRevision - 1;
  const rows: AuthorizedRecallObservation[] = [];
  let cursor: { eventRevision: number; grantId: string } | undefined;
  const seenCursors = new Set<string>();
  let pages = 0;
  while (true) {
    if (++pages > MAX_RECALL_PAGES) {
      return { kind: 'deterministic', text: '我暂时无法核对这段旧事。', reason: 'incomplete' };
    }
    const page = await input.reader(input.ownerId, save.saveId, input.npcId, cursor, PAGE_SIZE, throughRevision);
    if (!Array.isArray(page.items) || page.items.length > PAGE_SIZE
      || page.items.some(row => row.saveId !== save.saveId || row.npcId !== input.npcId || row.branchId !== receipt.branchId)) {
      return { kind: 'deterministic', text: '我暂时无法核对这段旧事。', reason: 'incomplete' };
    }
    rows.push(...page.items);
    if (rows.length > MAX_RECALL_ROWS) {
      return { kind: 'deterministic', text: '我暂时无法核对这段旧事。', reason: 'incomplete' };
    }
    if (!page.nextCursor) break;
    const nextKey = `${page.nextCursor.eventRevision}\0${page.nextCursor.grantId}`;
    if (seenCursors.has(nextKey) || (cursor && compareCursor(page.nextCursor, cursor) <= 0)) {
      return { kind: 'deterministic', text: '我暂时无法核对这段旧事。', reason: 'incomplete' };
    }
    seenCursors.add(nextKey);
    cursor = page.nextCursor;
  }

  const recalled = recallAuthorizedObservations(rows, { query: cue.query, slot: cue.slot,
    gameMinute: receipt.clockMinute, throughRevision });
  if (recalled.status === 'complete' || recalled.status === 'partial') {
    if (recalled.slot === 'current-state') {
      return { kind: 'deterministic',
        text: recalled.status === 'complete'
          ? `我最后记下的是：${collectAuthorizedText(recalled.authorizedFacts)}。那只是当时的情形，不能据此断言眼下未变。`
          : '我记得一些当时的情况，但不能据旧记忆断言现在如何。',
        reason: 'time-qualified-state' };
    }
    return { kind: 'evidence', recall: recalled };
  }
  return { kind: 'deterministic', text: recalled.message,
    reason: recalled.reason === 'stale-only' ? 'time-qualified-state' : recalled.reason === 'unclassified-only' ? 'unclassified' : 'no-evidence' };
}

function collectAuthorizedText(value: unknown): string {
  const output: string[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (output.length >= 8 || depth > 8) return;
    if (typeof node === 'string') {
      const text = node.trim().slice(0, 600);
      if (text && !output.includes(text)) output.push(text);
      return;
    }
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (!['__proto__', 'prototype', 'constructor'].includes(key)) visit(child, depth + 1);
    }
  };
  visit(value, 0);
  const joined = output.join('；').slice(0, 4_000);
  return joined || '当时的记录';
}

function compareCursor(left: { eventRevision: number; grantId: string }, right: { eventRevision: number; grantId: string }): number {
  return left.eventRevision - right.eventRevision || (left.grantId < right.grantId ? -1 : left.grantId > right.grantId ? 1 : 0);
}
