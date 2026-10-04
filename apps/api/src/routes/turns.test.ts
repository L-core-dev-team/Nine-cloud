import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { SaveEnvelope } from '@jiuxiao/contracts';
import { createApp } from '../app.js';
import { ServerTurnService, type ServerTurnRepository } from '../services/server-turn.js';
import type { EmailAuthService } from '../services/email-auth.js';

function fixture() {
  const save: SaveEnvelope = { schemaVersion: 1, saveId: 'route-fixture', revision: 0, canonVersion: 'fixture', ruleVersion: 'fixture', memoryPolicyVersion: 'fixture',
    state: { playerId: 'player', locationId: 'origin', elapsedMinutes: 0, facts: {} } };
  const repository: ServerTurnRepository = { loadSave: vi.fn(async () => save), getReceiptForOwner: async () => null,
    getForOwner: async () => null,
    recordNonAcceptedDecision: vi.fn(async () => { throw new Error('Must not record before rules are ready'); }),
    commitAcceptedTurn: vi.fn(async () => { throw new Error('Must not commit'); }) };
  const auth = { resolveOwnerId: vi.fn(async (request: Request) => request.headers.get('cookie') === 'test-session' ? 'owner' : null) };
  const intent = { kind: 'move', saveId: save.saveId, actorId: 'player', expectedRevision: 0, idempotencyKey: randomUUID(), payload: { destinationId: 'gate' } };
  const service = new ServerTurnService(repository);
  const app = createApp(undefined, undefined, { origin: 'https://game.example.invalid', service: {} as EmailAuthService }, { service, auth });
  const request = (body: unknown, headers: Record<string, string> = {}) => app.request('/api/turns', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://game.example.invalid', cookie: 'test-session', ...headers }, body: JSON.stringify(body) });
  return { request, repository, intent, app, auth, service };
}
describe('turn HTTP boundary', () => {
  it('requires a verified session, matches expected account and enforces write Origin', async () => {
    const f = fixture();
    expect((await f.request({ intent: f.intent }, { cookie: 'invalid' })).status).toBe(401);
    expect((await f.request({ intent: f.intent }, { 'x-jiuxiao-account': 'other' })).status).toBe(401);
    expect((await f.request({ intent: f.intent }, { origin: 'https://other.example.invalid' })).status).toBe(403);
    expect(f.repository.loadSave).not.toHaveBeenCalled();
  });
  it('rejects client decisions, owner injection, state and non-boolean narrative flags', async () => {
    const f = fixture();
    for (const body of [{ intent: f.intent, owner: 'other' }, { intent: { ...f.intent, state: {} } }, { intent: f.intent, requestNarrative: 'true' }, { intent: f.intent, events: [] }]) {
      expect((await f.request(body)).status).toBe(400);
    }
    expect(f.repository.loadSave).not.toHaveBeenCalled();
  });
  it('bounds intent payload size before executing the service', async () => {
    const f = fixture();
    expect((await f.request({ intent: { ...f.intent, payload: { destinationId: 'x'.repeat(17_000) } } })).status).toBe(413);
    expect((await f.app.request('/api/turns', { method: 'POST', headers: { origin: 'https://game.example.invalid', cookie: 'test-session' }, body: '{invalid' })).status).toBe(400);
    expect(f.repository.loadSave).not.toHaveBeenCalled();
  });
  it('exposes the explicit rules gate before reading a save', async () => {
    const f = fixture(); const response = await f.request({ intent: f.intent });
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'RULES_NOT_READY' });
    expect(f.repository.loadSave).not.toHaveBeenCalled();
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
  });
  it('passes over-limit cultivation to the rules gate instead of masking its named rejection', async () => {
    const f = fixture();
    const intent = { ...f.intent, kind: 'cultivate', payload: { techniqueId: 'technique-1', minutes: 9 } };
    const response = await f.request({ intent });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'RULES_NOT_READY' });
    expect(f.repository.loadSave).not.toHaveBeenCalled();
    expect(f.repository.recordNonAcceptedDecision).not.toHaveBeenCalled();
    expect(f.repository.commitAcceptedTurn).not.toHaveBeenCalled();
  });
  it('maps stale or forged clarification links to a conflict response', async () => {
    const f = fixture();
    f.service.execute = vi.fn(async () => ({ status: 'clarification_conflict' }));
    const response = await f.request({ intent: f.intent });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'CLARIFICATION_CONFLICT' });
  });
});
