import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { EntitlementLedgerService, LedgerFault } from './entitlement-ledger.js';
import { PostgresEntitlementLedgerRepository } from './postgres-entitlement-ledger.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const schema = `s7_test_${randomUUID().replaceAll('-', '')}`;

suite('PostgresEntitlementLedgerRepository (TEST_DATABASE_URL)', () => {
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3_000 });
  let ledgerPool: Pool;
  let service: EntitlementLedgerService;

  beforeAll(async () => {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(`SET search_path TO "${schema}"`);
      const migration = await readFile(new URL('../../../../packages/db/drizzle/0001_s7_entitlement_ledger.sql', import.meta.url), 'utf8');
      const isolatedMigration = migration.replaceAll('--> statement-breakpoint', '')
        .replaceAll('"public".', `"${schema}".`);
      await setupClient.query(isolatedMigration);
    } finally { setupClient.release(); }
    ledgerPool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 4, connectionTimeoutMillis: 3_000 });
    service = new EntitlementLedgerService(new PostgresEntitlementLedgerRepository(ledgerPool));
  });

  afterAll(async () => {
    await ledgerPool?.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  });

  it('serializes concurrent spending, replays idempotent grants, and reverses an exact spend once', async () => {
    const ownerId = `s7-owner-${randomUUID()}`;
    const key = `s7.${randomUUID()}`;
    const grant = await service.grant({ ownerId, entitlementKey: 'model.units', units: 100, idempotencyKey: `grant-${randomUUID()}` });
    const grantRetry = await service.grant({ idempotencyKey: grant.idempotencyKey, units: 100, entitlementKey: 'model.units', ownerId });
    expect(grantRetry).toMatchObject({ entryId: grant.entryId, balanceAfter: 100, replayed: true });

    const competing = await Promise.allSettled([
      service.consume({ ownerId, entitlementKey: 'model.units', units: 70, idempotencyKey: `use-a-${randomUUID()}` }),
      service.consume({ ownerId, entitlementKey: 'model.units', units: 70, idempotencyKey: `use-b-${randomUUID()}` }),
    ]);
    const winning = competing.find(result => result.status === 'fulfilled');
    expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter(result => result.status === 'rejected')).toHaveLength(1);
    if (!winning || winning.status !== 'fulfilled') throw new Error('one spend should win');
    expect(competing.find(result => result.status === 'rejected')).toMatchObject({ status: 'rejected', reason: { code: 'INSUFFICIENT_UNITS' } });

    const replay = await service.consume({ ownerId, entitlementKey: 'model.units', units: 70, idempotencyKey: winning.value.idempotencyKey });
    expect(replay).toMatchObject({ entryId: winning.value.entryId, balanceAfter: 30, replayed: true });
    await expect(service.consume({ ownerId, entitlementKey: 'model.units', units: 71, idempotencyKey: winning.value.idempotencyKey }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    const refunded = await service.refund({ ownerId, entitlementKey: 'model.units', sourceEntryId: winning.value.entryId, idempotencyKey: `refund-${randomUUID()}` });
    expect(refunded).toMatchObject({ type: 'refund', deltaUnits: 70, balanceAfter: 100 });
    await expect(service.refund({ ownerId, entitlementKey: 'model.units', sourceEntryId: winning.value.entryId, idempotencyKey: `refund-${randomUUID()}` }))
      .rejects.toBeInstanceOf(LedgerFault);

    const balances = await ledgerPool.query('SELECT available_units FROM entitlement_balances WHERE owner_id = $1 AND entitlement_key = $2', [ownerId, 'model.units']);
    expect(Number(balances.rows[0]?.available_units)).toBe(100);
    const entries = await ledgerPool.query('SELECT count(*)::integer AS count FROM entitlement_ledger_entries WHERE owner_id = $1', [ownerId]);
    expect(entries.rows[0]?.count).toBe(3);
  });

  it('stores append-only receipts that reject mutation', async () => {
    const ownerId = `s7-owner-${randomUUID()}`;
    const entry = await service.grant({ ownerId, entitlementKey: 'cloud.days', units: 1, idempotencyKey: `grant-${randomUUID()}` });
    await expect(ledgerPool.query('UPDATE entitlement_ledger_entries SET delta_units = 5 WHERE id = $1', [entry.entryId]))
      .rejects.toThrow('append-only');
    await expect(ledgerPool.query('DELETE FROM entitlement_ledger_entries WHERE id = $1', [entry.entryId]))
      .rejects.toThrow('append-only');
  });
});
