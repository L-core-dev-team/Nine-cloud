import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

export type LedgerMutation =
  | { type: 'grant'; ownerId: string; entitlementKey: string; units: number; idempotencyKey: string }
  | { type: 'consume'; ownerId: string; entitlementKey: string; units: number; idempotencyKey: string }
  | { type: 'refund'; ownerId: string; entitlementKey: string; sourceEntryId: string; idempotencyKey: string };

export type LedgerReceipt = {
  entryId: string;
  ownerId: string;
  entitlementKey: string;
  type: 'grant' | 'consume' | 'refund';
  deltaUnits: number;
  balanceAfter: number;
  idempotencyKey: string;
  reversesEntryId: string | null;
  replayed: boolean;
};

export class LedgerFault extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'INSUFFICIENT_UNITS' | 'IDEMPOTENCY_KEY_REUSED' | 'ENTRY_NOT_REFUNDABLE' | 'BALANCE_LIMIT') {
    super(code);
    this.name = 'LedgerFault';
  }
}

export type LedgerMutationRecord = Omit<LedgerReceipt, 'replayed'> & { requestHash: string };

export interface EntitlementLedgerRepository {
  mutate(record: LedgerMutationRecord): Promise<LedgerReceipt>;
}

const MAX_UNITS = Number.MAX_SAFE_INTEGER;
const KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function validate(mutation: LedgerMutation): LedgerMutation {
  const ownerId = mutation.ownerId.trim();
  if (!ownerId || ownerId.length > 200 || !KEY_PATTERN.test(mutation.entitlementKey)
    || !IDEMPOTENCY_PATTERN.test(mutation.idempotencyKey)) throw new LedgerFault('INVALID_INPUT');
  if ((mutation.type === 'grant' || mutation.type === 'consume')
    && (!Number.isSafeInteger(mutation.units) || mutation.units <= 0 || mutation.units > MAX_UNITS)) {
    throw new LedgerFault('INVALID_INPUT');
  }
  if (mutation.type === 'refund' && (!mutation.sourceEntryId || mutation.sourceEntryId.length > 200)) {
    throw new LedgerFault('INVALID_INPUT');
  }
  return { ...mutation, ownerId } as LedgerMutation;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => [key, canonicalize(nested)]));
  }
  return value;
}

function hashRequest(mutation: LedgerMutation): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(mutation))).digest('hex');
}

/**
 * Append-only usage-unit ledger. This records entitlements, never money.
 * Callers must pass an owner resolved from a verified server session.
 */
export class EntitlementLedgerService {
  constructor(private readonly repository: EntitlementLedgerRepository) {}

  async grant(input: Omit<Extract<LedgerMutation, { type: 'grant' }>, 'type'>): Promise<LedgerReceipt> {
    return this.apply({ ...input, type: 'grant' });
  }

  async consume(input: Omit<Extract<LedgerMutation, { type: 'consume' }>, 'type'>): Promise<LedgerReceipt> {
    return this.apply({ ...input, type: 'consume' });
  }

  async refund(input: Omit<Extract<LedgerMutation, { type: 'refund' }>, 'type'>): Promise<LedgerReceipt> {
    return this.apply({ ...input, type: 'refund' });
  }

  private async apply(candidate: LedgerMutation): Promise<LedgerReceipt> {
    const mutation = validate(candidate);
    return this.repository.mutate({
      entryId: randomUUID(), ownerId: mutation.ownerId, entitlementKey: mutation.entitlementKey,
      type: mutation.type,
      deltaUnits: mutation.type === 'grant' ? mutation.units : mutation.type === 'consume' ? -mutation.units : 0,
      balanceAfter: 0, idempotencyKey: mutation.idempotencyKey,
      reversesEntryId: mutation.type === 'refund' ? mutation.sourceEntryId : null,
      requestHash: hashRequest(mutation),
    });
  }
}
