import {
  ActionIntentSchema,
  DecisionSchema,
  DecisionV2Schema,
  DomainEventSchema,
  SaveEnvelopeSchema,
  TurnReceiptSchema,
  TurnReceiptV2Schema,
  WorldStateSchema,
  type ActionIntent,
  type ActionIntentInput,
  type Decision,
  type DomainEvent,
  type SaveEnvelope,
  type TurnReceipt,
  type WorldState,
} from '@jiuxiao/contracts';

export type EventReducer = (state: WorldState, event: DomainEvent) => WorldState;

export class TurnBoundaryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TurnBoundaryError';
  }
}

/**
 * Replays an ordered event tail over a snapshot. Each accepted turn is one
 * revision transition; multiple events from that turn share the same revision
 * pair and are reduced in their persisted order.
 */
export function replayEvents(
  baseSave: SaveEnvelope,
  eventTail: readonly DomainEvent[],
  reduce: EventReducer,
): SaveEnvelope {
  let save = SaveEnvelopeSchema.parse(baseSave);
  const seenIds = new Set<string>();
  let offset = 0;

  while (offset < eventTail.length) {
    const first = DomainEventSchema.parse(eventTail[offset]);
    validateTransition(first, save, seenIds);
    if (first.afterRevision !== first.beforeRevision + 1) {
      throw new TurnBoundaryError('INVALID_REVISION_STEP', 'Each event batch must advance exactly one save revision.');
    }

    const batch = [first];
    seenIds.add(first.id);
    offset += 1;

    while (offset < eventTail.length) {
      const next = DomainEventSchema.parse(eventTail[offset]);
      if (next.beforeRevision !== first.beforeRevision || next.afterRevision !== first.afterRevision) break;
      validateBatchMember(next, first, save, seenIds);
      seenIds.add(next.id);
      batch.push(next);
      offset += 1;
    }

    let state = WorldStateSchema.parse(save.state);
    for (const event of batch) {
      state = WorldStateSchema.parse(reduce(state, event));
      assertJsonValue(state);
    }
    save = SaveEnvelopeSchema.parse({ ...save, revision: first.afterRevision, state });
  }

  return save;
}

export type TurnPreparation =
  | { status: 'prepared'; receipt: TurnReceipt; save: SaveEnvelope }
  | { status: 'duplicate'; receipt: TurnReceipt }
  | { status: 'recorded'; receipt: TurnReceipt }
  | { status: 'revision-conflict'; expectedRevision: number; actualRevision: number }
  | { status: 'idempotency-conflict' };

/**
 * Validates a decision and prepares its new snapshot without writing anything.
 * The caller must atomically persist the receipt, event batch, and snapshot.
 * `decide` and `reduce` are supplied by a signed ruleset; no production rules
 * are bundled here.
 */
export async function prepareTurn(options: {
  intent: ActionIntentInput;
  save: SaveEnvelope;
  priorReceipt?: TurnReceipt;
  decide: (intent: ActionIntent, save: SaveEnvelope) => Decision;
  reduce: EventReducer;
}): Promise<TurnPreparation> {
  const intent = ActionIntentSchema.parse(options.intent);
  const save = SaveEnvelopeSchema.parse(options.save);
  if (intent.saveId !== save.saveId) {
    throw new TurnBoundaryError('SAVE_ID_MISMATCH', 'Action and save identifiers do not match.');
  }
  const requestFingerprint = await fingerprintIntent(intent);
  const prior = options.priorReceipt ? TurnReceiptSchema.parse(options.priorReceipt) : undefined;

  if (prior?.idempotencyKey === intent.idempotencyKey) {
    if (prior.saveId !== intent.saveId || prior.requestFingerprint !== requestFingerprint) {
      return { status: 'idempotency-conflict' };
    }
    return { status: 'duplicate', receipt: prior };
  }
  if (intent.expectedRevision !== save.revision) {
    return { status: 'revision-conflict', expectedRevision: intent.expectedRevision, actualRevision: save.revision };
  }

  const decision = DecisionSchema.parse(options.decide(intent, SaveEnvelopeSchema.parse(save)));
  if (decision.status === 'accepted') {
    if (decision.nextRevision !== save.revision + 1) {
      throw new TurnBoundaryError('INVALID_DECISION_REVISION', 'An accepted turn must advance one revision.');
    }
    const committedEvents = decision.events.map(event => DomainEventSchema.parse(event));
    validateAcceptedEvents(committedEvents, save, decision.nextRevision, intent.branchId);
    const nextSave = replayEvents(save, committedEvents, options.reduce);
    const currentDecision = DecisionV2Schema.safeParse(decision);
    const receipt = currentDecision.success
      ? TurnReceiptV2Schema.parse({
        idempotencyKey: intent.idempotencyKey,
        saveId: save.saveId,
        requestFingerprint,
        branchId: intent.branchId,
        rulesVersion: save.ruleVersion,
        clockMinute: readClockMinute(nextSave),
        rng: { seed: null, draws: 0 },
        decision: currentDecision.data,
        resultingRevision: nextSave.revision,
      })
      : TurnReceiptSchema.parse({
        idempotencyKey: intent.idempotencyKey,
        saveId: save.saveId,
        requestFingerprint,
        decision,
        resultingRevision: nextSave.revision,
      });
    return { status: 'prepared', receipt, save: nextSave };
  }

  const currentDecision = DecisionV2Schema.safeParse(decision);
  const receipt = currentDecision.success
    ? TurnReceiptV2Schema.parse({
      idempotencyKey: intent.idempotencyKey,
      saveId: save.saveId,
      requestFingerprint,
      branchId: intent.branchId,
      rulesVersion: save.ruleVersion,
      clockMinute: readClockMinute(save),
      rng: { seed: null, draws: 0 },
      decision: currentDecision.data,
      resultingRevision: save.revision,
    })
    : TurnReceiptSchema.parse({
      idempotencyKey: intent.idempotencyKey,
      saveId: save.saveId,
      requestFingerprint,
      decision,
      resultingRevision: save.revision,
    });
  return { status: 'recorded', receipt };
}

async function fingerprintIntent(intent: ActionIntent): Promise<string> {
  // `branchId: 'root'` is the v2 default. Omitting it from the root hash keeps
  // retries compatible with receipts written before branch identity existed.
  const fingerprintInput = intent.branchId === 'root'
    ? Object.fromEntries(Object.entries(intent).filter(([key]) => key !== 'branchId'))
    : intent;
  const canonical = canonicalJson(fingerprintInput);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return `sha256:v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TurnBoundaryError('INVALID_TURN_INPUT', 'Action contains a non-JSON value.');
  return encoded;
}

function validateAcceptedEvents(events: readonly DomainEvent[], save: SaveEnvelope, nextRevision: number, branchId: string): void {
  if (events.length === 0) throw new TurnBoundaryError('EMPTY_EVENT_BATCH', 'Accepted decisions require at least one event.');
  const seenIds = new Set<string>();
  for (const input of events) {
    const event = DomainEventSchema.parse(input);
    if (seenIds.has(event.id)) {
      throw new TurnBoundaryError('DUPLICATE_EVENT_ID', 'Event identifiers must be unique within a turn.');
    }
    seenIds.add(event.id);
    if (event.branchId !== branchId) {
      throw new TurnBoundaryError('EVENT_BRANCH_MISMATCH', 'Event branch does not match the submitted action.');
    }
    if (event.saveId !== save.saveId || event.beforeRevision !== save.revision || event.afterRevision !== nextRevision) {
      throw new TurnBoundaryError('EVENT_REVISION_MISMATCH', 'Event batch does not match the input save revision.');
    }
    if (event.source !== 'RULES' || event.ruleVersion !== save.ruleVersion) {
      throw new TurnBoundaryError('EVENT_RULE_VERSION_MISMATCH', 'Accepted gameplay events must use the save rule version.');
    }
    assertJsonValue(event.payload);
  }
}

function readClockMinute(save: SaveEnvelope): number {
  const gameMinute = save.state.facts.gameMinute;
  if (typeof gameMinute === 'number' && Number.isSafeInteger(gameMinute) && gameMinute >= 0) return gameMinute;
  // Pre-P1 snapshots only carried elapsedMinutes. New prologue rules write gameMinute.
  return save.state.elapsedMinutes;
}

function validateTransition(event: DomainEvent, save: SaveEnvelope, seenIds: Set<string>): void {
  if (seenIds.has(event.id)) throw new TurnBoundaryError('DUPLICATE_EVENT_ID', 'Event identifiers must be unique in a replay tail.');
  if (event.saveId !== save.saveId || event.beforeRevision !== save.revision) {
    throw new TurnBoundaryError('REPLAY_CHAIN_INVALID', 'Event tail does not continue from the supplied snapshot.');
  }
  if (event.afterRevision !== event.beforeRevision + 1) {
    throw new TurnBoundaryError('INVALID_REVISION_STEP', 'Each event batch must advance exactly one save revision.');
  }
  if (event.ruleVersion !== save.ruleVersion) {
    throw new TurnBoundaryError('EVENT_RULE_VERSION_MISMATCH', 'Event rule version does not match the save.');
  }
  assertJsonValue(event.payload);
}

function validateBatchMember(event: DomainEvent, first: DomainEvent, save: SaveEnvelope, seenIds: Set<string>): void {
  if (seenIds.has(event.id)) throw new TurnBoundaryError('DUPLICATE_EVENT_ID', 'Event identifiers must be unique in a replay tail.');
  if (event.saveId !== save.saveId || event.source !== first.source || event.ruleVersion !== first.ruleVersion) {
    throw new TurnBoundaryError('REPLAY_BATCH_INVALID', 'Events in a revision batch must share a save, source, and rule version.');
  }
  assertJsonValue(event.payload);
}

function assertJsonValue(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') throw new TurnBoundaryError('NON_JSON_EVENT', 'Event or state contains a value that cannot be persisted as JSON.');
  if (ancestors.has(value)) throw new TurnBoundaryError('NON_JSON_EVENT', 'Event or state contains a cycle.');
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (const item of value) assertJsonValue(item, ancestors);
    ancestors.delete(value);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TurnBoundaryError('NON_JSON_EVENT', 'Event or state contains a non-plain object.');
  }
  ancestors.add(value);
  for (const item of Object.values(value)) assertJsonValue(item, ancestors);
  ancestors.delete(value);
}
