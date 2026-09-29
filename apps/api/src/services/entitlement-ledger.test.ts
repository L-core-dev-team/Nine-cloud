import { describe, expect, it } from 'vitest';
import { EntitlementLedgerService, LedgerFault, type EntitlementLedgerRepository, type LedgerMutationRecord, type LedgerReceipt } from './entitlement-ledger.js';

class CaptureRepository implements EntitlementLedgerRepository {
  readonly records: LedgerMutationRecord[] = [];
  async mutate(record: LedgerMutationRecord): Promise<LedgerReceipt> {
    this.records.push(record);
    return { ...record, replayed: false };
  }
}

describe('EntitlementLedgerService', () => {
  it('normalizes trusted owner scope and writes signed unit movements with a request fingerprint', async () => {
    const repository = new CaptureRepository();
    const service = new EntitlementLedgerService(repository);
    await service.grant({ ownerId: ' owner-a ', entitlementKey: 'model.units', units: 500, idempotencyKey: 'grant-test-001' });
    await service.consume({ ownerId: 'owner-a', entitlementKey: 'model.units', units: 30, idempotencyKey: 'consume-test-001' });
    await service.refund({ ownerId: 'owner-a', entitlementKey: 'model.units', sourceEntryId: 'source-1', idempotencyKey: 'refund-test-001' });
    expect(repository.records.map(row => row.deltaUnits)).toEqual([500, -30, 0]);
    expect(repository.records[2]).toMatchObject({ type: 'refund', reversesEntryId: 'source-1' });
    expect(repository.records.every(row => /^[a-f0-9]{64}$/.test(row.requestHash))).toBe(true);
  });

  it('keeps the request fingerprint stable when equivalent input fields arrive in a different order', async () => {
    const firstRepository = new CaptureRepository();
    const secondRepository = new CaptureRepository();
    const firstService = new EntitlementLedgerService(firstRepository);
    const secondService = new EntitlementLedgerService(secondRepository);

    await firstService.grant({ ownerId: 'owner-a', entitlementKey: 'model.units', units: 50, idempotencyKey: 'grant-order-001' });
    await secondService.grant({ idempotencyKey: 'grant-order-001', units: 50, entitlementKey: 'model.units', ownerId: 'owner-a' });
    await secondService.grant({ idempotencyKey: 'grant-order-001', units: 51, entitlementKey: 'model.units', ownerId: 'owner-a' });

    expect(secondRepository.records[0]?.requestHash).toBe(firstRepository.records[0]?.requestHash);
    expect(secondRepository.records[1]?.requestHash).not.toBe(firstRepository.records[0]?.requestHash);
  });

  it('rejects unsafe ownership strings, client amounts, and malformed idempotency keys before persistence', async () => {
    const repository = new CaptureRepository();
    const service = new EntitlementLedgerService(repository);
    await expect(service.grant({ ownerId: ' ', entitlementKey: 'model.units', units: 1, idempotencyKey: 'grant-test-002' }))
      .rejects.toBeInstanceOf(LedgerFault);
    await expect(service.consume({ ownerId: 'owner-a', entitlementKey: 'model.units', units: 1.5, idempotencyKey: 'consume-test-002' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(service.grant({ ownerId: 'owner-a', entitlementKey: '../admin', units: 1, idempotencyKey: 'short' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repository.records).toHaveLength(0);
  });
});
