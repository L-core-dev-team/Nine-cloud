import {
  ActionIntentSchema,
  DomainEventSchema,
  SaveEnvelopeV3Schema,
  TurnReceiptSchema,
  type ActionIntent,
  type ActionIntentInput,
  type Decision,
  type DomainEvent,
  type SaveEnvelope,
  type SaveEnvelopeV3,
  type TurnReceipt,
} from '@jiuxiao/contracts';
import {
  assertAuthorizedObservationOutboxRecord,
  prepareTurn,
  replayEvents,
  type AuthorizedObservationOutboxRecord,
  type EventReducer,
  type RuleInvocationContext,
} from '@jiuxiao/domain';
import {
  AUTHORITATIVE_SAVE_STORE,
  AUTHORIZED_OBSERVATION_OUTBOX_STORE,
  TURN_EVENT_STORE,
  TURN_INTEGRITY_STORE,
  TURN_RECEIPT_STORE,
  TURN_CHECKPOINT_STORE,
  openJiuxiaoDatabase,
} from './idb';

export const LOCAL_EVENT_CHAIN_VERSION = 'local-event-chain-v1';
const ZERO_HASH = '0'.repeat(64);
const MAX_EVENTS_PER_TURN = 1000;
const RULE_EVENT_ID_CAPACITY = 32;

export type StoredSave = { saveId: string; envelope: SaveEnvelopeV3 };
export type StoredReceipt = { recordKey: string; saveId: string; receipt: TurnReceipt };
export type StoredEvent = {
  recordKey: string;
  saveId: string;
  branchId: 'root';
  sequence: number;
  idempotencyKey: string;
  previousHash: string;
  eventHash: string;
  event: DomainEvent;
};
export type StoredIntegrity = {
  saveId: string;
  algorithm: typeof LOCAL_EVENT_CHAIN_VERSION;
  eventCount: number;
  headHash: string;
};
export type StoredCheckpoint = { recordKey: string; saveId: string; revision: number; envelope: SaveEnvelopeV3 };

export type LocalAuthorityArchiveV1 = {
  format: 'jiuxiao-authoritative-save';
  schemaVersion: 1;
  saveId: string;
  save: SaveEnvelopeV3;
  integrity: StoredIntegrity;
  checkpoints: StoredCheckpoint[];
  events: StoredEvent[];
  receipts: StoredReceipt[];
  observations: AuthorizedObservationOutboxRecord[];
  sha256: string;
};

export type LocalAuthorityRestoreResult =
  | { status: 'restored'; save: SaveEnvelopeV3 }
  | { status: 'already_exists' }
  | { status: 'integrity_conflict' }
  | { status: 'unavailable' };
export type LocalTurnCommitResult =
  | { status: 'created'; save: SaveEnvelopeV3 }
  | { status: 'already_exists' }
  | { status: 'committed'; receipt: TurnReceipt; save: SaveEnvelopeV3 }
  | { status: 'recorded'; receipt: TurnReceipt }
  | { status: 'duplicate'; receipt: TurnReceipt }
  | { status: 'revision_conflict'; expectedRevision: number; actualRevision: number }
  | { status: 'idempotency_conflict' }
  | { status: 'not_found' }
  | { status: 'integrity_conflict' }
  | { status: 'unavailable' };

export type AuthorizeLocalEvents = (
  events: readonly DomainEvent[],
  before: SaveEnvelopeV3,
  after: SaveEnvelopeV3,
) => readonly AuthorizedObservationOutboxRecord[];

type HistoryVerification =
  | { valid: true; eventCount: number }
  | { valid: false; eventCount: number; reason: 'event_chain_invalid' | 'checkpoint_invalid'
    | 'receipt_invalid' | 'event_receipt_mismatch' | 'projection_mismatch' };

/**
 * Creates a new root save in the browser's authoritative store. Legacy LocalSave
 * drafts remain in their separate compatibility store and are never promoted.
 */
export async function createLocalAuthoritativeSave(input: unknown): Promise<LocalTurnCommitResult> {
  const save = SaveEnvelopeV3Schema.parse(input);
  if (save.branchId !== 'root' || save.parentBranchId !== null || save.forkRevision !== 0) {
    throw new TypeError('SAVE_BRANCH_NOT_READY');
  }
  if (save.revision !== 0 || save.memoryPolicy.createdAtRevision !== 0) {
    throw new TypeError('SAVE_INITIAL_REVISION_MUST_BE_ZERO');
  }
  const database = await openJiuxiaoDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([AUTHORITATIVE_SAVE_STORE, TURN_INTEGRITY_STORE, TURN_CHECKPOINT_STORE], 'readwrite');
      const saveStore = transaction.objectStore(AUTHORITATIVE_SAVE_STORE);
      const saveRequest = saveStore.add({ saveId: save.saveId, envelope: save } satisfies StoredSave);
      const integrityStore = transaction.objectStore(TURN_INTEGRITY_STORE);
      integrityStore.add({
        saveId: save.saveId,
        algorithm: LOCAL_EVENT_CHAIN_VERSION,
        eventCount: 0,
        headHash: ZERO_HASH,
      } satisfies StoredIntegrity);
      transaction.objectStore(TURN_CHECKPOINT_STORE).add(checkpointRecord(save));
      let exists = false;
      saveRequest.onerror = event => {
        if ((saveRequest.error as DOMException | null)?.name === 'ConstraintError') {
          event.preventDefault();
          exists = true;
          try { transaction.abort(); } catch { /* transaction may already be inactive */ }
        }
      };
      transaction.oncomplete = () => resolve({ status: 'created', save });
      transaction.onabort = () => exists ? resolve({ status: 'already_exists' }) : resolve({ status: 'unavailable' });
      transaction.onerror = () => reject(transaction.error ?? new Error('AUTHORITATIVE_SAVE_CREATE_FAILED'));
    });
  } finally {
    database.close();
  }
}

/** Reads a stored current snapshot. V1/V2 exports remain readable but are not silently promoted. */
export async function readLocalAuthoritativeSave(saveId: string): Promise<SaveEnvelopeV3 | null> {
  if (!saveId.trim()) throw new TypeError('INVALID_SAVE_ID');
  const database = await openJiuxiaoDatabase();
  try {
    const row = await readOne<StoredSave>(database, AUTHORITATIVE_SAVE_STORE, saveId);
    if (!row) return null;
    const save = SaveEnvelopeV3Schema.parse(row.envelope);
    if (row.saveId !== saveId || save.saveId !== saveId) throw new Error('LOCAL_SAVE_ID_MISMATCH');
    return save;
  } finally {
    database.close();
  }
}

/**
 * Runs a supplied deterministic rules module outside IndexedDB, then commits
 * the resulting snapshot, receipt, event batch, frozen grants and chain head
 * in one short readwrite transaction. This module does not install or activate
 * any P1 ruleset.
 */
export async function commitLocalAuthoritativeTurn(input: {
  intent: ActionIntentInput;
  decide: (intent: ActionIntent, save: SaveEnvelope, context: RuleInvocationContext) => Decision;
  reduce: EventReducer;
  authorizeEvents?: AuthorizeLocalEvents;
}): Promise<LocalTurnCommitResult> {
  const intent = ActionIntentSchema.parse(input.intent);
  const database = await openJiuxiaoDatabase();
  try {
    const base = await readTurnBase(database, intent.saveId, intent.idempotencyKey);
    if (!base.save) return { status: 'not_found' };
    if (!base.integrity || !validIntegrity(base.integrity)) return { status: 'integrity_conflict' };
    if (base.save.schemaVersion !== 3 || base.save.branchId !== 'root') return { status: 'integrity_conflict' };
    const history = await readAndVerifyHistory(database, base.save, base.integrity, input.reduce);
    if (!history.valid) return { status: 'integrity_conflict' };

    const invocationContext = await createLocalRuleInvocationContext(intent.saveId, intent.idempotencyKey);
    const prepared = await prepareTurn({
      intent,
      save: base.save,
      ...(base.priorReceipt ? { priorReceipt: base.priorReceipt } : {}),
      decide: (action, save) => input.decide(action, save, invocationContext),
      reduce: input.reduce,
    });
    if (prepared.status === 'duplicate') return { status: 'duplicate', receipt: prepared.receipt };
    if (prepared.status === 'idempotency-conflict') return { status: 'idempotency_conflict' };
    if (prepared.status === 'revision-conflict') {
      return {
        status: 'revision_conflict',
        expectedRevision: prepared.expectedRevision,
        actualRevision: prepared.actualRevision,
      };
    }

    const accepted = prepared.status === 'prepared';
    const nextSave = accepted ? SaveEnvelopeV3Schema.parse(prepared.save) : base.save;
    const receipt = TurnReceiptSchema.parse(prepared.receipt);
    const events = accepted ? receipt.decision.status === 'accepted'
      ? receipt.decision.events.map(event => DomainEventSchema.parse(event)) : [] : [];
    if (events.length > MAX_EVENTS_PER_TURN) throw new TypeError('TURN_EVENT_BATCH_TOO_LARGE');
    if (accepted && (nextSave.schemaVersion !== 3 || nextSave.branchId !== 'root')) {
      throw new TypeError('SAVE_BRANCH_NOT_READY');
    }

    const observations = accepted
      ? [...(input.authorizeEvents?.(events.map(event => structuredClone(event)), structuredClone(base.save), structuredClone(nextSave)) ?? [])]
        .map(observation => structuredClone(observation))
      : [];
    validateCommit(base.save, nextSave, receipt, events, observations, intent.idempotencyKey);
    const eventRows = await prepareEventRows(base.integrity, intent.idempotencyKey, events);
    return await writeTurn(database, {
      before: base.save,
      next: nextSave,
      receipt,
      expectedIntegrity: base.integrity,
      eventRows,
      observations,
      accepted,
    });
  } finally {
    database.close();
  }
}

/**
 * Transaction-owned audit metadata for a local rule invocation. IDs are stable
 * across retries of the same save/idempotency key; wall time is never supplied
 * to the rule as a gameplay clock.
 */
async function createLocalRuleInvocationContext(saveId: string, idempotencyKey: string): Promise<RuleInvocationContext> {
  if (!globalThis.crypto?.subtle) throw new Error('LOCAL_RULE_CRYPTO_UNAVAILABLE');
  const eventIds = await Promise.all(Array.from({ length: RULE_EVENT_ID_CAPACITY }, async (_, index) => {
    const input = new TextEncoder().encode(`${saveId}\0${idempotencyKey}\0${index}`);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
    const bytes = digest.slice(0, 16);
    bytes[6] = (bytes[6]! & 0x0f) | 0x80;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }));
  return { occurredAt: new Date().toISOString(), eventIds };
}

export async function readLocalTurnReceipt(saveId: string, idempotencyKey: string): Promise<TurnReceipt | null> {
  const database = await openJiuxiaoDatabase();
  try {
    const row = await readOne<StoredReceipt>(database, TURN_RECEIPT_STORE, receiptKey(saveId, idempotencyKey));
    return row ? TurnReceiptSchema.parse(row.receipt) : null;
  } finally {
    database.close();
  }
}

/** Recomputes the complete local event chain and checks it against the atomic head record. */
export async function verifyLocalEventChain(saveId: string): Promise<{
  valid: boolean;
  eventCount: number;
  headHash: string;
}> {
  const database = await openJiuxiaoDatabase();
  try {
    const [integrity, events] = await Promise.all([
      readOne<StoredIntegrity>(database, TURN_INTEGRITY_STORE, saveId),
      readAllForSave<StoredEvent>(database, TURN_EVENT_STORE, saveId),
    ]);
    if (!integrity || !validIntegrity(integrity)) return { valid: false, eventCount: 0, headHash: '' };
    const chain = await verifyEventRows(saveId, integrity, events);
    return {
      valid: chain.valid,
      eventCount: events.length,
      headHash: integrity.headHash,
    };
  } finally {
    database.close();
  }
}

/**
 * Replays every committed revision from immutable IndexedDB checkpoints. This
 * catches a state snapshot that no longer matches its event batch and receipt.
 */
export async function verifyLocalReplay(saveId: string, reduce: EventReducer): Promise<{
  valid: boolean;
  revision: number | null;
  eventCount: number;
  reason?: 'save_missing' | 'integrity_missing' | 'event_chain_invalid' | 'checkpoint_invalid'
    | 'receipt_invalid' | 'event_receipt_mismatch' | 'projection_mismatch';
}> {
  const database = await openJiuxiaoDatabase();
  try {
    const saveRow = await readOne<StoredSave>(database, AUTHORITATIVE_SAVE_STORE, saveId);
    if (!saveRow) return { valid: false, revision: null, eventCount: 0, reason: 'save_missing' };
    const save = SaveEnvelopeV3Schema.parse(saveRow.envelope);
    const integrity = await readOne<StoredIntegrity>(database, TURN_INTEGRITY_STORE, saveId);
    if (!integrity || !validIntegrity(integrity)) {
      return { valid: false, revision: save.revision, eventCount: 0, reason: 'integrity_missing' };
    }
    const history = await readAndVerifyHistory(database, save, integrity, reduce);
    return history.valid
      ? { valid: true, revision: save.revision, eventCount: history.eventCount }
      : { valid: false, revision: save.revision, eventCount: history.eventCount, reason: history.reason };
  } finally {
    database.close();
  }
}

/**
 * Exports the complete local authority ledger with a canonical checksum and
 * replay verification. The checksum detects accidental changes; it is not a
 * signature or proof of authorship. The caller supplies the reducer for replay.
 */
export async function exportLocalAuthorityArchive(saveId: string, reduce: EventReducer): Promise<LocalAuthorityArchiveV1 | null> {
  if (!saveId.trim()) throw new TypeError('INVALID_SAVE_ID');
  const database = await openJiuxiaoDatabase();
  try {
    const rows = await readAuthorityArchiveRows(database, saveId);
    if (!rows.save || !rows.integrity) return null;
    const save = SaveEnvelopeV3Schema.parse(rows.save.envelope);
    const history = await verifyHistoryRows(save, rows.integrity, rows, reduce);
    if (!history.valid) throw new Error(`LOCAL_AUTHORITY_ARCHIVE_SOURCE_INVALID:${history.reason}`);
    validateArchiveObservations(save, rows.events, rows.observations);
    const payload = {
      format: 'jiuxiao-authoritative-save' as const,
      schemaVersion: 1 as const,
      saveId,
      save,
      integrity: rows.integrity,
      checkpoints: rows.checkpoints,
      events: rows.events,
      receipts: rows.receipts,
      observations: rows.observations,
    };
    return { ...payload, sha256: await hashCanonical(payload) };
  } finally {
    database.close();
  }
}

/**
 * Restores a complete authority archive without overwriting any existing save.
 * Schema, archive hash, event chain, receipts, replay checkpoints and grants are
 * verified before a single IndexedDB write transaction begins.
 */
export async function restoreLocalAuthorityArchive(
  input: unknown,
  reduce: EventReducer,
): Promise<LocalAuthorityRestoreResult> {
  const archive = parseAuthorityArchive(input);
  const { sha256, ...payload } = archive;
  if (await hashCanonical(payload) !== sha256) throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_HASH_MISMATCH');
  const history = await verifyHistoryRows(archive.save, archive.integrity, archive, reduce);
  if (!history.valid) throw new TypeError(`LOCAL_AUTHORITY_ARCHIVE_INVALID:${history.reason}`);
  validateArchiveObservations(archive.save, archive.events, archive.observations);

  const database = await openJiuxiaoDatabase();
  try {
    return await restoreArchiveRows(database, archive);
  } finally {
    database.close();
  }
}

async function readTurnBase(database: IDBDatabase, saveId: string, idempotencyKey: string) {
  const transaction = database.transaction([AUTHORITATIVE_SAVE_STORE, TURN_RECEIPT_STORE, TURN_INTEGRITY_STORE], 'readonly');
  const saveRequest = transaction.objectStore(AUTHORITATIVE_SAVE_STORE).get(saveId);
  const receiptRequest = transaction.objectStore(TURN_RECEIPT_STORE).get(receiptKey(saveId, idempotencyKey));
  const integrityRequest = transaction.objectStore(TURN_INTEGRITY_STORE).get(saveId);
  const [saveRow, receiptRow, integrity] = await Promise.all([
    requestValue<StoredSave | undefined>(saveRequest),
    requestValue<StoredReceipt | undefined>(receiptRequest),
    requestValue<StoredIntegrity | undefined>(integrityRequest),
  ]);
  if (saveRow && saveRow.saveId !== saveId) throw new Error('LOCAL_SAVE_KEY_MISMATCH');
  if (receiptRow && (receiptRow.saveId !== saveId || receiptRow.receipt.saveId !== saveId
    || receiptRow.receipt.idempotencyKey !== idempotencyKey)) throw new Error('LOCAL_RECEIPT_KEY_MISMATCH');
  if (integrity && integrity.saveId !== saveId) throw new Error('LOCAL_INTEGRITY_KEY_MISMATCH');
  return {
    save: saveRow ? SaveEnvelopeV3Schema.parse(saveRow.envelope) : null,
    priorReceipt: receiptRow ? TurnReceiptSchema.parse(receiptRow.receipt) : undefined,
    integrity: integrity ?? null,
  };
}

async function readAndVerifyHistory(
  database: IDBDatabase,
  currentSave: SaveEnvelopeV3,
  integrity: StoredIntegrity,
  reduce: EventReducer,
): Promise<HistoryVerification> {
  const { checkpoints, events, receipts } = await readHistoryRows(database, currentSave.saveId);
  return verifyHistoryRows(currentSave, integrity, { checkpoints, events, receipts }, reduce);
}

async function verifyHistoryRows(
  currentSave: SaveEnvelopeV3,
  integrity: StoredIntegrity,
  rows: { checkpoints: StoredCheckpoint[]; events: StoredEvent[]; receipts: StoredReceipt[] },
  reduce: EventReducer,
): Promise<HistoryVerification> {
  const saveId = currentSave.saveId;
  const { checkpoints, events, receipts } = rows;
  const chain = await verifyEventRows(saveId, integrity, events);
  if (!chain.valid) return { valid: false, eventCount: events.length, reason: 'event_chain_invalid' };
  if (currentSave.branchId !== 'root' || !validIntegrity(integrity) || integrity.saveId !== saveId) {
    return { valid: false, eventCount: events.length, reason: 'checkpoint_invalid' };
  }

  const orderedCheckpoints = checkpoints.sort((left, right) => left.revision - right.revision);
  if (orderedCheckpoints.length !== currentSave.revision + 1) {
    return { valid: false, eventCount: events.length, reason: 'checkpoint_invalid' };
  }
  const checkpointByRevision = new Map<number, SaveEnvelopeV3>();
  for (let revision = 0; revision < orderedCheckpoints.length; revision += 1) {
    const row = orderedCheckpoints[revision]!;
    let envelope: SaveEnvelopeV3;
    try { envelope = SaveEnvelopeV3Schema.parse(row.envelope); }
    catch { return { valid: false, eventCount: events.length, reason: 'checkpoint_invalid' }; }
    if (row.saveId !== saveId || row.revision !== revision || row.recordKey !== checkpointKey(saveId, revision)
      || envelope.saveId !== saveId || envelope.revision !== revision || envelope.branchId !== currentSave.branchId) {
      return { valid: false, eventCount: events.length, reason: 'checkpoint_invalid' };
    }
    checkpointByRevision.set(revision, envelope);
  }
  if (canonical(checkpointByRevision.get(currentSave.revision)) !== canonical(currentSave)) {
    return { valid: false, eventCount: events.length, reason: 'checkpoint_invalid' };
  }

  const parsedReceipts: TurnReceipt[] = [];
  const receiptByKey = new Map<string, TurnReceipt>();
  for (const row of receipts) {
    let receipt: TurnReceipt;
    try { receipt = TurnReceiptSchema.parse(row.receipt); }
    catch { return { valid: false, eventCount: events.length, reason: 'receipt_invalid' }; }
    if (row.saveId !== saveId || row.recordKey !== receiptKey(saveId, receipt.idempotencyKey)
      || receipt.saveId !== saveId || receiptByKey.has(receipt.idempotencyKey)) {
      return { valid: false, eventCount: events.length, reason: 'receipt_invalid' };
    }
    receiptByKey.set(receipt.idempotencyKey, receipt);
    parsedReceipts.push(receipt);
  }

  const orderedEvents = events.sort((left, right) => left.sequence - right.sequence);
  const eventsByRevision = new Map<number, StoredEvent[]>();
  for (const row of orderedEvents) {
    const event = DomainEventSchema.parse(row.event);
    if (row.saveId !== saveId || row.branchId !== event.branchId || event.saveId !== saveId
      || row.idempotencyKey.length === 0 || !receiptByKey.has(row.idempotencyKey)) {
      return { valid: false, eventCount: events.length, reason: 'event_receipt_mismatch' };
    }
    const batch = eventsByRevision.get(event.afterRevision) ?? [];
    batch.push(row);
    eventsByRevision.set(event.afterRevision, batch);
  }

  const acceptedByRevision = new Map<number, TurnReceipt>();
  for (const receipt of parsedReceipts) {
    if (receipt.decision.status === 'accepted') {
      if (receipt.resultingRevision < 1 || receipt.resultingRevision > currentSave.revision
        || acceptedByRevision.has(receipt.resultingRevision)) {
        return { valid: false, eventCount: events.length, reason: 'receipt_invalid' };
      }
      acceptedByRevision.set(receipt.resultingRevision, receipt);
    } else if (receipt.resultingRevision !== receipt.decision.revision
      || receipt.resultingRevision > currentSave.revision
      || orderedEvents.some(row => row.idempotencyKey === receipt.idempotencyKey)) {
      return { valid: false, eventCount: events.length, reason: 'receipt_invalid' };
    }
  }

  const seenEventIds = new Set<string>();
  for (let revision = 1; revision <= currentSave.revision; revision += 1) {
    const priorSave = checkpointByRevision.get(revision - 1);
    const nextCheckpoint = checkpointByRevision.get(revision);
    const receipt = acceptedByRevision.get(revision);
    const batchRows = eventsByRevision.get(revision) ?? [];
    if (!priorSave || !nextCheckpoint || !receipt || batchRows.length === 0) {
      return { valid: false, eventCount: events.length, reason: 'checkpoint_invalid' };
    }
    const batchEvents = batchRows.map(row => DomainEventSchema.parse(row.event));
    if (receipt.decision.status !== 'accepted' || receipt.decision.events.length !== batchEvents.length
      || canonical(receipt.decision.events) !== canonical(batchEvents)
      || batchRows.some(row => row.idempotencyKey !== receipt.idempotencyKey)) {
      return { valid: false, eventCount: events.length, reason: 'event_receipt_mismatch' };
    }
    for (const event of batchEvents) {
      if (seenEventIds.has(event.id)) return { valid: false, eventCount: events.length, reason: 'event_receipt_mismatch' };
      seenEventIds.add(event.id);
    }
    let replayed: SaveEnvelopeV3;
    try { replayed = SaveEnvelopeV3Schema.parse(replayEvents(priorSave, batchEvents, reduce)); }
    catch { return { valid: false, eventCount: events.length, reason: 'projection_mismatch' }; }
    if (canonical(replayed) !== canonical(nextCheckpoint)) {
      return { valid: false, eventCount: events.length, reason: 'projection_mismatch' };
    }
    eventsByRevision.delete(revision);
    acceptedByRevision.delete(revision);
  }
  if (eventsByRevision.size !== 0 || acceptedByRevision.size !== 0 || seenEventIds.size !== events.length) {
    return { valid: false, eventCount: events.length, reason: 'event_receipt_mismatch' };
  }
  return { valid: true, eventCount: events.length };
}

async function verifyEventRows(saveId: string, integrity: StoredIntegrity, events: readonly StoredEvent[]) {
  if (!validIntegrity(integrity) || integrity.saveId !== saveId) return { valid: false } as const;
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  let previousHash = ZERO_HASH;
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index]!;
    let event: DomainEvent;
    try { event = DomainEventSchema.parse(row.event); }
    catch { return { valid: false } as const; }
    if (row.saveId !== saveId || row.branchId !== event.branchId || row.sequence !== index
      || row.previousHash !== previousHash || row.recordKey !== eventKey(saveId, event.id)) {
      return { valid: false } as const;
    }
    const expected = await hashEvent(previousHash, row.sequence, row.idempotencyKey, event);
    if (expected !== row.eventHash) return { valid: false } as const;
    previousHash = expected;
  }
  return { valid: ordered.length === integrity.eventCount && previousHash === integrity.headHash } as const;
}

function validateCommit(
  before: SaveEnvelopeV3,
  next: SaveEnvelopeV3,
  receipt: TurnReceipt,
  events: readonly DomainEvent[],
  observations: readonly AuthorizedObservationOutboxRecord[],
  idempotencyKey: string,
): void {
  if (before.canonArtifactHash !== next.canonArtifactHash) {
    throw new TypeError('TURN_COMMIT_CANON_ARTIFACT_MISMATCH');
  }
  if (receipt.saveId !== before.saveId || receipt.idempotencyKey !== idempotencyKey) {
    throw new TypeError('TURN_RECEIPT_IDENTITY_MISMATCH');
  }
  if (receipt.decision.status === 'accepted') {
    if (receipt.resultingRevision !== before.revision + 1 || next.revision !== receipt.resultingRevision
      || receipt.decision.events.length !== events.length || events.length < 1
      || canonical(receipt.decision.events) !== canonical(events)) {
      throw new TypeError('TURN_COMMIT_RECEIPT_MISMATCH');
    }
    for (const event of events) {
      if (event.saveId !== before.saveId || event.branchId !== before.branchId
        || event.beforeRevision !== before.revision || event.afterRevision !== next.revision
        || event.source !== 'RULES' || event.ruleVersion !== before.ruleVersion) {
        throw new TypeError('TURN_COMMIT_EVENT_MISMATCH');
      }
    }
  } else if (receipt.resultingRevision !== before.revision || next.revision !== before.revision || events.length > 0) {
    throw new TypeError('TURN_NON_ACCEPTED_COMMIT_MISMATCH');
  }
  const eventIds = new Set(events.map(event => event.id));
  const grantIds = new Set<string>();
  for (const observation of observations) {
    assertAuthorizedObservationOutboxRecord(observation);
    if (observation.saveId !== before.saveId || observation.branchId !== before.branchId
      || !eventIds.has(observation.eventId) || observation.eventRevision !== next.revision
      || grantIds.has(observation.grantId)) {
      throw new TypeError('AUTHORIZED_OUTBOX_TURN_MISMATCH');
    }
    grantIds.add(observation.grantId);
  }
}

async function prepareEventRows(
  head: StoredIntegrity,
  idempotencyKey: string,
  events: readonly DomainEvent[],
): Promise<StoredEvent[]> {
  let previousHash = head.headHash;
  const rows: StoredEvent[] = [];
  for (const [offset, event] of events.entries()) {
    const sequence = head.eventCount + offset;
    const eventHash = await hashEvent(previousHash, sequence, idempotencyKey, event);
    rows.push({
      recordKey: eventKey(event.saveId, event.id),
      saveId: event.saveId,
      branchId: event.branchId,
      sequence,
      idempotencyKey,
      previousHash,
      eventHash,
      event,
    });
    previousHash = eventHash;
  }
  return rows;
}

async function writeTurn(database: IDBDatabase, input: {
  before: SaveEnvelopeV3;
  next: SaveEnvelopeV3;
  receipt: TurnReceipt;
  expectedIntegrity: StoredIntegrity;
  eventRows: readonly StoredEvent[];
  observations: readonly AuthorizedObservationOutboxRecord[];
  accepted: boolean;
}): Promise<LocalTurnCommitResult> {
  return new Promise(resolve => {
    const transaction = database.transaction([
      AUTHORITATIVE_SAVE_STORE,
      TURN_EVENT_STORE,
      TURN_RECEIPT_STORE,
      AUTHORIZED_OBSERVATION_OUTBOX_STORE,
      TURN_INTEGRITY_STORE,
      TURN_CHECKPOINT_STORE,
    ], 'readwrite');
    const saveRequest = transaction.objectStore(AUTHORITATIVE_SAVE_STORE).get(input.before.saveId);
    const receiptRequest = transaction.objectStore(TURN_RECEIPT_STORE).get(receiptKey(input.before.saveId, input.receipt.idempotencyKey));
    const integrityRequest = transaction.objectStore(TURN_INTEGRITY_STORE).get(input.before.saveId);
    let waiting = 3;
    let abortResult: LocalTurnCommitResult | null = null;
    let completionResult: LocalTurnCommitResult | null = null;
    let evaluated = false;
    const evaluate = () => {
      if (--waiting !== 0 || evaluated) return;
      evaluated = true;
      const currentRow = saveRequest.result as StoredSave | undefined;
      const priorRow = receiptRequest.result as StoredReceipt | undefined;
      const currentIntegrity = integrityRequest.result as StoredIntegrity | undefined;
      if (priorRow) {
        let prior: TurnReceipt;
        try { prior = TurnReceiptSchema.parse(priorRow.receipt); }
        catch { abortResult = { status: 'unavailable' }; transaction.abort(); return; }
        abortResult = prior.saveId === input.receipt.saveId && prior.requestFingerprint === input.receipt.requestFingerprint
          ? { status: 'duplicate', receipt: prior }
          : { status: 'idempotency_conflict' };
        transaction.abort();
        return;
      }
      if (!currentRow) { abortResult = { status: 'not_found' }; transaction.abort(); return; }
      let currentSave: SaveEnvelopeV3;
      try { currentSave = SaveEnvelopeV3Schema.parse(currentRow.envelope); }
      catch { abortResult = { status: 'unavailable' }; transaction.abort(); return; }
      if (currentSave.revision !== input.before.revision) {
        abortResult = {
          status: 'revision_conflict',
          expectedRevision: input.before.revision,
          actualRevision: currentSave.revision,
        };
        transaction.abort();
        return;
      }
      if (canonical(currentSave) !== canonical(input.before) || !currentIntegrity || !validIntegrity(currentIntegrity)
        || canonical(currentIntegrity) !== canonical(input.expectedIntegrity)) {
        abortResult = { status: 'integrity_conflict' };
        transaction.abort();
        return;
      }
      try {
        transaction.objectStore(TURN_RECEIPT_STORE).add({
          recordKey: receiptKey(input.before.saveId, input.receipt.idempotencyKey),
          saveId: input.before.saveId,
          receipt: input.receipt,
        } satisfies StoredReceipt);
        if (input.accepted) {
          transaction.objectStore(AUTHORITATIVE_SAVE_STORE).put({ saveId: input.next.saveId, envelope: input.next } satisfies StoredSave);
          transaction.objectStore(TURN_CHECKPOINT_STORE).add(checkpointRecord(input.next));
          const eventStore = transaction.objectStore(TURN_EVENT_STORE);
          for (const row of input.eventRows) eventStore.add(row);
          const outboxStore = transaction.objectStore(AUTHORIZED_OBSERVATION_OUTBOX_STORE);
          for (const observation of input.observations) outboxStore.add(observation);
          const last = input.eventRows[input.eventRows.length - 1];
          const integrity: StoredIntegrity = {
            saveId: input.before.saveId,
            algorithm: LOCAL_EVENT_CHAIN_VERSION,
            eventCount: input.expectedIntegrity.eventCount + input.eventRows.length,
            headHash: last?.eventHash ?? input.expectedIntegrity.headHash,
          };
          transaction.objectStore(TURN_INTEGRITY_STORE).put(integrity);
          completionResult = { status: 'committed', receipt: input.receipt, save: input.next };
        } else {
          completionResult = { status: 'recorded', receipt: input.receipt };
        }
      } catch {
        abortResult = { status: 'unavailable' };
        transaction.abort();
      }
    };
    saveRequest.onsuccess = evaluate;
    receiptRequest.onsuccess = evaluate;
    integrityRequest.onsuccess = evaluate;
    saveRequest.onerror = receiptRequest.onerror = integrityRequest.onerror = () => {
      abortResult = { status: 'unavailable' };
      try { transaction.abort(); } catch { /* already inactive */ }
    };
    transaction.oncomplete = () => resolve(completionResult ?? { status: 'unavailable' });
    transaction.onabort = () => resolve(abortResult ?? { status: 'unavailable' });
    transaction.onerror = () => { /* onabort returns the transaction's final outcome */ };
  });
}

async function readOne<T>(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const transaction = database.transaction(storeName, 'readonly');
  return requestValue<T | undefined>(transaction.objectStore(storeName).get(key));
}

async function readAllForSave<T>(database: IDBDatabase, storeName: string, saveId: string): Promise<T[]> {
  const transaction = database.transaction(storeName, 'readonly');
  return requestValue<T[]>(transaction.objectStore(storeName).index('saveId').getAll(saveId));
}

async function readHistoryRows(database: IDBDatabase, saveId: string): Promise<{
  checkpoints: StoredCheckpoint[];
  events: StoredEvent[];
  receipts: StoredReceipt[];
}> {
  // One readonly transaction gives all three ledgers the same IndexedDB snapshot.
  const transaction = database.transaction([
    TURN_CHECKPOINT_STORE,
    TURN_EVENT_STORE,
    TURN_RECEIPT_STORE,
  ], 'readonly');
  const checkpoints = transaction.objectStore(TURN_CHECKPOINT_STORE).index('saveId').getAll(saveId);
  const events = transaction.objectStore(TURN_EVENT_STORE).index('saveId').getAll(saveId);
  const receipts = transaction.objectStore(TURN_RECEIPT_STORE).index('saveId').getAll(saveId);
  const [checkpointRows, eventRows, receiptRows] = await Promise.all([
    requestValue<StoredCheckpoint[]>(checkpoints),
    requestValue<StoredEvent[]>(events),
    requestValue<StoredReceipt[]>(receipts),
  ]);
  return { checkpoints: checkpointRows, events: eventRows, receipts: receiptRows };
}

async function readAuthorityArchiveRows(database: IDBDatabase, saveId: string): Promise<{
  save: StoredSave | undefined;
  integrity: StoredIntegrity | undefined;
  checkpoints: StoredCheckpoint[];
  events: StoredEvent[];
  receipts: StoredReceipt[];
  observations: AuthorizedObservationOutboxRecord[];
}> {
  const transaction = database.transaction([
    AUTHORITATIVE_SAVE_STORE,
    TURN_INTEGRITY_STORE,
    TURN_CHECKPOINT_STORE,
    TURN_EVENT_STORE,
    TURN_RECEIPT_STORE,
    AUTHORIZED_OBSERVATION_OUTBOX_STORE,
  ], 'readonly');
  const save = transaction.objectStore(AUTHORITATIVE_SAVE_STORE).get(saveId);
  const integrity = transaction.objectStore(TURN_INTEGRITY_STORE).get(saveId);
  const checkpoints = transaction.objectStore(TURN_CHECKPOINT_STORE).index('saveId').getAll(saveId);
  const events = transaction.objectStore(TURN_EVENT_STORE).index('saveId').getAll(saveId);
  const receipts = transaction.objectStore(TURN_RECEIPT_STORE).index('saveId').getAll(saveId);
  const observations = transaction.objectStore(AUTHORIZED_OBSERVATION_OUTBOX_STORE).index('saveId').getAll(saveId);
  const [saveRow, integrityRow, checkpointRows, eventRows, receiptRows, observationRows] = await Promise.all([
    requestValue<StoredSave | undefined>(save),
    requestValue<StoredIntegrity | undefined>(integrity),
    requestValue<StoredCheckpoint[]>(checkpoints),
    requestValue<StoredEvent[]>(events),
    requestValue<StoredReceipt[]>(receipts),
    requestValue<AuthorizedObservationOutboxRecord[]>(observations),
  ]);
  return {
    save: saveRow,
    integrity: integrityRow,
    checkpoints: checkpointRows,
    events: eventRows,
    receipts: receiptRows,
    observations: observationRows,
  };
}

function parseAuthorityArchive(input: unknown): LocalAuthorityArchiveV1 {
  let value: unknown;
  try {
    value = typeof input === 'string' ? JSON.parse(input) as unknown : JSON.parse(JSON.stringify(input)) as unknown;
  } catch {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_NOT_JSON');
  }
  assertExactObjectKeys(value, ['format', 'schemaVersion', 'saveId', 'save', 'integrity', 'checkpoints', 'events', 'receipts', 'observations', 'sha256']);
  const record = value as Record<string, unknown>;
  if (record.format !== 'jiuxiao-authoritative-save' || record.schemaVersion !== 1
    || typeof record.saveId !== 'string' || !record.saveId.trim() || !Array.isArray(record.checkpoints)
    || !Array.isArray(record.events) || !Array.isArray(record.receipts) || !Array.isArray(record.observations)
    || typeof record.sha256 !== 'string' || !/^[\da-f]{64}$/.test(record.sha256)) {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_INVALID');
  }
  const save = SaveEnvelopeV3Schema.parse(record.save);
  if (record.saveId !== save.saveId || save.branchId !== 'root' || save.parentBranchId !== null || save.forkRevision !== 0) {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_IDENTITY_INVALID');
  }
  const integrity = parseStoredIntegrity(record.integrity);
  const checkpoints = record.checkpoints.map(parseStoredCheckpoint);
  const events = record.events.map(parseStoredEvent);
  const receipts = record.receipts.map(parseStoredReceipt);
  const observations = record.observations.map(value => {
    assertAuthorizedObservationOutboxRecord(value);
    return value;
  });
  return {
    format: 'jiuxiao-authoritative-save', schemaVersion: 1, saveId: record.saveId, save,
    integrity, checkpoints, events, receipts, observations, sha256: record.sha256,
  };
}

function parseStoredIntegrity(value: unknown): StoredIntegrity {
  assertExactObjectKeys(value, ['saveId', 'algorithm', 'eventCount', 'headHash']);
  const record = value as Record<string, unknown>;
  if (typeof record.saveId !== 'string' || record.algorithm !== LOCAL_EVENT_CHAIN_VERSION
    || !Number.isSafeInteger(record.eventCount) || Number(record.eventCount) < 0
    || typeof record.headHash !== 'string' || !/^[\da-f]{64}$/.test(record.headHash)) {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_INTEGRITY_INVALID');
  }
  return record as StoredIntegrity;
}

function parseStoredCheckpoint(value: unknown): StoredCheckpoint {
  assertExactObjectKeys(value, ['recordKey', 'saveId', 'revision', 'envelope']);
  const record = value as Record<string, unknown>;
  if (typeof record.recordKey !== 'string' || typeof record.saveId !== 'string'
    || !Number.isSafeInteger(record.revision) || Number(record.revision) < 0) {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_CHECKPOINT_INVALID');
  }
  return { recordKey: record.recordKey, saveId: record.saveId, revision: Number(record.revision),
    envelope: SaveEnvelopeV3Schema.parse(record.envelope) };
}

function parseStoredEvent(value: unknown): StoredEvent {
  assertExactObjectKeys(value, ['recordKey', 'saveId', 'branchId', 'sequence', 'idempotencyKey', 'previousHash', 'eventHash', 'event']);
  const record = value as Record<string, unknown>;
  if (typeof record.recordKey !== 'string' || typeof record.saveId !== 'string' || record.branchId !== 'root'
    || !Number.isSafeInteger(record.sequence) || Number(record.sequence) < 0
    || typeof record.idempotencyKey !== 'string' || !record.idempotencyKey
    || typeof record.previousHash !== 'string' || !/^[\da-f]{64}$/.test(record.previousHash)
    || typeof record.eventHash !== 'string' || !/^[\da-f]{64}$/.test(record.eventHash)) {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_EVENT_INVALID');
  }
  return { recordKey: record.recordKey, saveId: record.saveId, branchId: 'root', sequence: Number(record.sequence),
    idempotencyKey: record.idempotencyKey, previousHash: record.previousHash, eventHash: record.eventHash,
    event: DomainEventSchema.parse(record.event) };
}

function parseStoredReceipt(value: unknown): StoredReceipt {
  assertExactObjectKeys(value, ['recordKey', 'saveId', 'receipt']);
  const record = value as Record<string, unknown>;
  if (typeof record.recordKey !== 'string' || typeof record.saveId !== 'string') {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_RECEIPT_INVALID');
  }
  return { recordKey: record.recordKey, saveId: record.saveId, receipt: TurnReceiptSchema.parse(record.receipt) };
}

function assertExactObjectKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_INVALID_OBJECT');
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_UNKNOWN_OR_MISSING_FIELDS');
  }
}

function validateArchiveObservations(
  save: SaveEnvelopeV3,
  events: readonly StoredEvent[],
  observations: readonly AuthorizedObservationOutboxRecord[],
): void {
  const eventById = new Map(events.map(row => [row.event.id, row.event]));
  const seenGrants = new Set<string>();
  for (const observation of observations) {
    assertAuthorizedObservationOutboxRecord(observation);
    const event = eventById.get(observation.eventId);
    if (seenGrants.has(observation.grantId) || observation.saveId !== save.saveId
      || observation.branchId !== save.branchId || !event || event.saveId !== save.saveId
      || event.branchId !== save.branchId || event.source !== 'RULES'
      || observation.eventRevision !== event.afterRevision) {
      throw new TypeError('LOCAL_AUTHORITY_ARCHIVE_OBSERVATION_INVALID');
    }
    seenGrants.add(observation.grantId);
  }
}

async function restoreArchiveRows(database: IDBDatabase, archive: LocalAuthorityArchiveV1): Promise<LocalAuthorityRestoreResult> {
  return new Promise(resolve => {
    const transaction = database.transaction([
      AUTHORITATIVE_SAVE_STORE,
      TURN_EVENT_STORE,
      TURN_RECEIPT_STORE,
      AUTHORIZED_OBSERVATION_OUTBOX_STORE,
      TURN_INTEGRITY_STORE,
      TURN_CHECKPOINT_STORE,
    ], 'readwrite');
    let abortResult: LocalAuthorityRestoreResult = { status: 'integrity_conflict' };
    const existing = transaction.objectStore(AUTHORITATIVE_SAVE_STORE).get(archive.saveId);
    existing.onsuccess = () => {
      if (existing.result) {
        abortResult = { status: 'already_exists' };
        transaction.abort();
        return;
      }
      try {
        transaction.objectStore(AUTHORITATIVE_SAVE_STORE).add({ saveId: archive.saveId, envelope: archive.save } satisfies StoredSave);
        transaction.objectStore(TURN_INTEGRITY_STORE).add(archive.integrity);
        for (const row of archive.checkpoints) transaction.objectStore(TURN_CHECKPOINT_STORE).add(row);
        for (const row of archive.events) transaction.objectStore(TURN_EVENT_STORE).add(row);
        for (const row of archive.receipts) transaction.objectStore(TURN_RECEIPT_STORE).add(row);
        for (const row of archive.observations) transaction.objectStore(AUTHORIZED_OBSERVATION_OUTBOX_STORE).add(row);
      } catch {
        abortResult = { status: 'unavailable' };
        try { transaction.abort(); } catch { /* already inactive */ }
      }
    };
    existing.onerror = () => {
      abortResult = { status: 'unavailable' };
      try { transaction.abort(); } catch { /* already inactive */ }
    };
    transaction.oncomplete = () => resolve({ status: 'restored', save: archive.save });
    transaction.onabort = () => resolve(abortResult);
    transaction.onerror = () => { /* onabort reports the atomic outcome */ };
  });
}

async function hashCanonical(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_REQUEST_FAILED'));
  });
}

function validIntegrity(value: StoredIntegrity): boolean {
  return value.algorithm === LOCAL_EVENT_CHAIN_VERSION && Number.isSafeInteger(value.eventCount)
    && value.eventCount >= 0 && /^[\da-f]{64}$/.test(value.headHash)
    && (value.eventCount > 0 || value.headHash === ZERO_HASH);
}

async function hashEvent(previousHash: string, sequence: number, idempotencyKey: string, event: DomainEvent): Promise<string> {
  const payload = canonical({ version: LOCAL_EVENT_CHAIN_VERSION, previousHash, sequence, idempotencyKey, event });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function receiptKey(saveId: string, idempotencyKey: string): string {
  return JSON.stringify([saveId, idempotencyKey]);
}

function eventKey(saveId: string, eventId: string): string {
  return JSON.stringify([saveId, eventId]);
}

function checkpointKey(saveId: string, revision: number): string {
  return JSON.stringify([saveId, revision]);
}

function checkpointRecord(save: SaveEnvelopeV3): StoredCheckpoint {
  return { recordKey: checkpointKey(save.saveId, save.revision), saveId: save.saveId, revision: save.revision, envelope: save };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new TypeError('NON_JSON_TURN_DATA');
  return result;
}
