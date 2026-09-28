import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { LedgerFault, type EntitlementLedgerRepository, type LedgerMutationRecord, type LedgerReceipt } from './entitlement-ledger.js';

const MAX_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

interface LedgerRow extends QueryResultRow {
  id: string;
  owner_id: string;
  entitlement_key: string;
  entry_type: 'grant' | 'consume' | 'refund';
  delta_units: string | number;
  balance_after: string | number;
  idempotency_key: string;
  reverses_entry_id: string | null;
  request_hash: string;
}

function exactUnits(value: string | number): number {
  const parsed = typeof value === 'number' ? BigInt(value) : BigInt(value);
  if (parsed > MAX_UNITS || parsed < -MAX_UNITS) throw new LedgerFault('BALANCE_LIMIT');
  return Number(parsed);
}

function receipt(row: LedgerRow, replayed: boolean): LedgerReceipt {
  return { entryId: row.id, ownerId: row.owner_id, entitlementKey: row.entitlement_key,
    type: row.entry_type, deltaUnits: exactUnits(row.delta_units), balanceAfter: exactUnits(row.balance_after),
    idempotencyKey: row.idempotency_key, reversesEntryId: row.reverses_entry_id, replayed };
}

async function findIdempotent(client: PoolClient, record: LedgerMutationRecord): Promise<LedgerRow | null> {
  const result = await client.query<LedgerRow>(
    `SELECT id, owner_id, entitlement_key, entry_type, delta_units, balance_after,
            idempotency_key, reverses_entry_id, request_hash
       FROM entitlement_ledger_entries WHERE owner_id = $1 AND idempotency_key = $2`,
    [record.ownerId, record.idempotencyKey],
  );
  return result.rows[0] ?? null;
}

export class PostgresEntitlementLedgerRepository implements EntitlementLedgerRepository {
  constructor(private readonly pool: Pool) {}

  async mutate(record: LedgerMutationRecord): Promise<LedgerReceipt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize retries that reuse one idempotency key across product keys.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [record.ownerId, record.idempotencyKey]);
      const previous = await findIdempotent(client, record);
      if (previous) {
        if (previous.request_hash !== record.requestHash) throw new LedgerFault('IDEMPOTENCY_KEY_REUSED');
        await client.query('COMMIT');
        return receipt(previous, true);
      }

      await client.query(
        `INSERT INTO entitlement_balances (owner_id, entitlement_key, available_units)
         VALUES ($1, $2, 0) ON CONFLICT (owner_id, entitlement_key) DO NOTHING`,
        [record.ownerId, record.entitlementKey],
      );
      const locked = await client.query<{ available_units: string | number } & QueryResultRow>(
        `SELECT available_units FROM entitlement_balances
          WHERE owner_id = $1 AND entitlement_key = $2 FOR UPDATE`,
        [record.ownerId, record.entitlementKey],
      );
      const before = exactUnits(locked.rows[0]!.available_units);

      let delta = record.deltaUnits;
      if (record.type === 'refund') {
        const source = await client.query<LedgerRow>(
          `SELECT id, owner_id, entitlement_key, entry_type, delta_units, balance_after,
                  idempotency_key, reverses_entry_id, request_hash
             FROM entitlement_ledger_entries
            WHERE id = $1 AND owner_id = $2 AND entitlement_key = $3 FOR UPDATE`,
          [record.reversesEntryId, record.ownerId, record.entitlementKey],
        );
        const original = source.rows[0];
        if (!original || original.entry_type !== 'consume' || Number(original.delta_units) >= 0) {
          throw new LedgerFault('ENTRY_NOT_REFUNDABLE');
        }
        const priorRefund = await client.query(
          'SELECT 1 FROM entitlement_ledger_entries WHERE reverses_entry_id = $1 LIMIT 1', [record.reversesEntryId],
        );
        if (priorRefund.rowCount) throw new LedgerFault('ENTRY_NOT_REFUNDABLE');
        delta = -exactUnits(original.delta_units);
      }

      const next = before + delta;
      if (!Number.isSafeInteger(next) || next < 0) {
        if (next < 0) throw new LedgerFault('INSUFFICIENT_UNITS');
        throw new LedgerFault('BALANCE_LIMIT');
      }
      const result = await client.query<LedgerRow>(
        `INSERT INTO entitlement_ledger_entries
          (id, owner_id, entitlement_key, entry_type, delta_units, balance_after,
           idempotency_key, request_hash, reverses_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, owner_id, entitlement_key, entry_type, delta_units, balance_after,
                   idempotency_key, reverses_entry_id, request_hash`,
        [record.entryId, record.ownerId, record.entitlementKey, record.type, delta, next,
          record.idempotencyKey, record.requestHash, record.reversesEntryId],
      );
      await client.query(
        `UPDATE entitlement_balances SET available_units = $3, updated_at = now()
          WHERE owner_id = $1 AND entitlement_key = $2`,
        [record.ownerId, record.entitlementKey, next],
      );
      await client.query('COMMIT');
      return receipt(result.rows[0]!, false);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
