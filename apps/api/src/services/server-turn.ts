import { randomUUID } from 'node:crypto';
import {
  ActionIntentSchema, DomainEventSchema, SaveEnvelopeSchema, TurnReceiptSchema,
  type ActionIntent, type Decision, type SaveEnvelope, type TurnReceipt,
} from '@jiuxiao/contracts';
import {
  prepareTurn, prepareNpcMemoryTurn,
  readGameMinute,
  type EventReducer, type PrepareNpcMemoryTurnOptions, type NpcMemoryJournal,
} from '@jiuxiao/domain';
import type { AcceptedTurnCommitInput, AcceptedTurnCommitResult } from './npc-memory-turn-transaction.js';

/** Supplied only by the host's versioned rules and visibility implementation. */
export interface ServerTurnRules {
  ruleVersion: string;
  canonVersion: string;
  memoryPolicyVersion: string;
  decide(intent: ActionIntent, save: SaveEnvelope): Decision;
  reduce: EventReducer;
  grantsForEvent: PrepareNpcMemoryTurnOptions['grantsForEvent'];
  policyForNpc: PrepareNpcMemoryTurnOptions['policyForNpc'];
}
export interface ServerTurnRepository {
  loadSave(ownerId: string, saveId: string): Promise<SaveEnvelope | null>;
  getReceiptForOwner(ownerId: string, saveId: string, requestId: string): Promise<TurnReceipt | null>;
  getForOwner(ownerId: string, saveId: string): Promise<NpcMemoryJournal | null>;
  commitAcceptedTurn(input: AcceptedTurnCommitInput): Promise<AcceptedTurnCommitResult>;
  recordNarrativeStatus?(ownerId:string,saveId:string,requestId:string,attemptId:string,status:'generating'|'received'|'unavailable'|'timeout'|'cancelled'):Promise<void>;
}
export type NarrativeResult =
  | { status: 'not_requested' }
  | { status: 'received'; text: string }
  | { status: 'failed'; code: 'NARRATIVE_UNAVAILABLE' | 'NARRATIVE_TIMEOUT' | 'NARRATIVE_CANCELLED' };
export type ServerTurnResult =
  | { status: 'not_found' | 'client_archive' | 'rules_not_ready' | 'version_mismatch' | 'idempotency_conflict' }
  | { status: 'revision_conflict'; currentRevision: number }
  | { status: 'decision'; receipt: TurnReceipt }
  | { status: 'accepted'; duplicate: boolean; receipt: TurnReceipt; narrative: NarrativeResult };
type Narrator = (receipt: TurnReceipt, signal: AbortSignal) => Promise<string>;

/** No rules are bundled or inferred. State and visible memory commit before optional narration. */
export class ServerTurnService {
  constructor(
    private readonly repository: ServerTurnRepository,
    private readonly rules?: ServerTurnRules,
    private readonly narrator?: Narrator,
    private readonly narrativeTimeoutMs = 20_000,
  ) {
    if (!Number.isInteger(narrativeTimeoutMs) || narrativeTimeoutMs < 1 || narrativeTimeoutMs > 120_000) {
      throw new TypeError('Invalid narrative timeout');
    }
  }

  async execute(ownerId: string, raw: unknown, requestNarrative = false, cancellation?: AbortSignal): Promise<ServerTurnResult> {
    if (!ownerId.trim() || ownerId.length > 200) throw new TypeError('Authenticated owner is required');
    const intent = ActionIntentSchema.parse(raw);
    const rules = this.rules;
    if (!rules) return { status: 'rules_not_ready' };
    const current = await this.repository.loadSave(ownerId, intent.saveId);
    if (!current) return { status: 'not_found' };
    const save = SaveEnvelopeSchema.parse(current);
    // A client-uploaded legacy backup must never become an authoritative game by inference.
    if (save.state.facts.archiveKind === 'local-untrusted-v1') return { status: 'client_archive' };
    if (save.state.playerId !== intent.actorId) return { status: 'not_found' };
    const prior = await this.repository.getReceiptForOwner(ownerId, intent.saveId, intent.idempotencyKey);
    if (rules.ruleVersion !== save.ruleVersion || rules.canonVersion !== save.canonVersion ||
        rules.memoryPolicyVersion !== save.memoryPolicyVersion) return { status: 'version_mismatch' };
    const prepared = await prepareTurn({ intent, save, ...(prior ? { priorReceipt: prior } : {}),
      decide: rules.decide.bind(rules), reduce: rules.reduce.bind(rules) });
    if (prepared.status === 'revision-conflict') return { status: 'revision_conflict', currentRevision: prepared.actualRevision };
    if (prepared.status === 'idempotency-conflict') return { status: 'idempotency_conflict' };
    if (prepared.status === 'recorded') return { status: 'decision', receipt: prepared.receipt };
    if (prepared.status === 'duplicate') return this.completed(ownerId, prepared.receipt, true, requestNarrative, cancellation);

    const journal = await this.repository.getForOwner(ownerId, save.saveId);
    if (!journal) return { status: 'not_found' };
    // A concurrent winner may commit between snapshot and journal reads. Resolve its
    // receipt before projecting; never project a stale snapshot over a newer journal.
    if (journal.revision !== save.revision) {
      const winner = await this.repository.getReceiptForOwner(ownerId, save.saveId, intent.idempotencyKey);
      if (winner) {
        const retry = await prepareTurn({ intent, save, priorReceipt: winner,
          decide: rules.decide.bind(rules), reduce: rules.reduce.bind(rules) });
        if (retry.status === 'duplicate') return this.completed(ownerId, retry.receipt, true, requestNarrative, cancellation);
        if (retry.status === 'idempotency-conflict') return { status: 'idempotency_conflict' };
      }
      return { status: 'revision_conflict', currentRevision: journal.revision };
    }
    const committedEvents = prepared.receipt.decision.status === 'accepted'
      ? prepared.receipt.decision.events.map(event => DomainEventSchema.parse(event))
      : [];
    const next = prepareNpcMemoryTurn({ journal, saveId: save.saveId,
      beforeRevision: save.revision, afterRevision: prepared.save.revision,
      events: committedEvents,
      observedAtMinute: readGameMinute(prepared.save.state),
      grantsForEvent: rules.grantsForEvent.bind(rules), policyForNpc: rules.policyForNpc.bind(rules) });
    const committed = await this.repository.commitAcceptedTurn({ ownerId, expectedRevision: save.revision,
      receipt: prepared.receipt, save: prepared.save,
      events: committedEvents,
      previousJournal: journal, nextJournal: next.journal, authorizedObservations: next.authorizedObservations });
    if (committed.kind === 'not_found') return { status: 'not_found' };
    if (committed.kind === 'idempotency_conflict') return { status: 'idempotency_conflict' };
    if (committed.kind === 'conflict' || committed.kind === 'memory_conflict') {
      return { status: 'revision_conflict', currentRevision: committed.currentRevision };
    }
    return this.completed(ownerId, committed.receipt, committed.kind === 'duplicate', requestNarrative, cancellation);
  }

  private async completed(ownerId:string, raw: TurnReceipt, duplicate: boolean, requestNarrative: boolean, cancellation?: AbortSignal): Promise<ServerTurnResult> {
    const receipt = TurnReceiptSchema.parse(raw);
    if (receipt.decision.status !== 'accepted') return { status: 'decision', receipt };
    let narrative: NarrativeResult = { status: 'not_requested' };
    if (requestNarrative) {
      const attemptId=randomUUID();
      const record=this.repository.recordNarrativeStatus;
      // Presentation metadata is separate from immutable rule events and receipts.
      // A journal failure must never hide or roll back an already committed turn.
      const log=async(status:Parameters<NonNullable<typeof record>>[4])=>{try{await record?.(ownerId,receipt.saveId,receipt.idempotencyKey,attemptId,status);}catch{/* State remains committed; no raw provider details are logged. */}};
      await log('generating');
      if (cancellation?.aborted) narrative = { status: 'failed', code: 'NARRATIVE_CANCELLED' };
      else if (!this.narrator) narrative = { status: 'failed', code: 'NARRATIVE_UNAVAILABLE' };
      else {
        const abort = new AbortController(); let userCancelled = false; let cancelListener: (() => void) | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => { abort.abort(); reject(new Error('timeout')); }, this.narrativeTimeoutMs);
          });
          const cancelled = new Promise<never>((_, reject) => {
            cancelListener = () => { userCancelled = true; abort.abort(); reject(new Error('cancelled')); };
            cancellation?.addEventListener('abort', cancelListener, { once: true });
            if (cancellation?.aborted) cancelListener();
          });
          // Never hand mutable state, memory or the persisted receipt to a model adapter.
          const text = await Promise.race([Promise.resolve().then(() => { if (abort.signal.aborted) throw new Error('cancelled'); return this.narrator!(structuredClone(receipt), abort.signal); }), deadline, cancelled]);
          if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('Invalid narrative');
          narrative = { status: 'received', text };
        } catch {
          narrative = { status: 'failed', code: userCancelled ? 'NARRATIVE_CANCELLED' : abort.signal.aborted ? 'NARRATIVE_TIMEOUT' : 'NARRATIVE_UNAVAILABLE' };
        } finally { if (timer) clearTimeout(timer); if (cancelListener) cancellation?.removeEventListener('abort', cancelListener); }
      }
      await log(narrative.status==='received'?'received':narrative.status==='failed'?narrative.code==='NARRATIVE_CANCELLED'?'cancelled':narrative.code==='NARRATIVE_TIMEOUT'?'timeout':'unavailable':'unavailable');
    }
    return { status: 'accepted', duplicate, receipt, narrative };
  }
}
