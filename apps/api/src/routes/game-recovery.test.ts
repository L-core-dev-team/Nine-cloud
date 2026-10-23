import { Hono } from 'hono';
import { it, expect, vi } from 'vitest';
import { mountGames } from './games.js';
import type { AuthoritativeGameService } from '../services/authoritative-game.js';
import type { ServerTurnService } from '../services/server-turn.js';

const key = '11111111-1111-4111-8111-111111111111';
const save = { saveId: 'mine', revision: 0, state: { playerId: 'actor' } };
const games = { read: async (owner: string, id: string) => owner === 'a' && id === 'mine' ? { status: 'ready', save } : { status: 'not_found' } } as AuthoritativeGameService;
it('queries receipts without executing turns and checks owner before lookup', async () => {
  const read = vi.fn(async () => null); const execute = vi.fn(); const app = new Hono();
  mountGames(app, games, { resolveOwnerId: async () => 'a' }, { execute } as unknown as ServerTurnService, undefined, read);
  expect(await (await app.request(`/api/games/mine/receipts/${key}`)).json()).toEqual({ status: 'unknown', receipt: null, revision: 0 });
  expect((await app.request(`/api/games/other/receipts/${key}`)).status).toBe(404);
  expect((await app.request(`/api/games/mine/receipts/${key}`, { headers: { 'x-jiuxiao-account': 'other' } })).status).toBe(401);
  expect(read).toHaveBeenCalledTimes(1); expect(execute).not.toHaveBeenCalled();
});
it('returns a confirmed rejection and refuses a mismatched repository receipt', async () => {
  const receipt = { saveId: 'mine', idempotencyKey: key, requestFingerprint: 'sha256:v1:' + 'a'.repeat(64), resultingRevision: 0,
    decision: { status: 'rejected' as const, code: 'INPUT_UNKNOWN', message: '无法识别', revision: 0 } };
  const read = vi.fn(async () => receipt); const app = new Hono();
  mountGames(app, games, { resolveOwnerId: async () => 'a' }, undefined, undefined, read);
  expect((await (await app.request(`/api/games/mine/receipts/${key}`)).json()).status).toBe('confirmed');
  receipt.saveId = 'other';
  expect((await app.request(`/api/games/mine/receipts/${key}`)).status).toBe(503);
});

it('rejects invalid UUIDs before lookup, fails closed on unavailable storage, and never submits unknown requests', async () => {
  const read = vi.fn(async () => null); const execute = vi.fn(); const app = new Hono();
  mountGames(app, games, { resolveOwnerId: async () => 'a' }, { execute } as unknown as ServerTurnService, undefined, read);
  for (const invalid of ['not-a-key', '11111111111141118111111111111111', 'g1111111-1111-4111-8111-111111111111']) {
    expect((await app.request(`/api/games/mine/receipts/${invalid}`)).status).toBe(400);
  }
  expect(read).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) expect(await (await app.request(`/api/games/mine/receipts/${key}`)).json()).toEqual({ status: 'unknown', receipt: null, revision: 0 });
  expect(read.mock.calls).toEqual(Array.from({ length: 3 }, () => ['a', 'mine', key]));
  expect(execute).not.toHaveBeenCalled();
  read.mockRejectedValueOnce(new Error('private database detail'));
  const failed = await app.request(`/api/games/mine/receipts/${key}`);
  expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ code: 'GAME_UNAVAILABLE' });
});

it('rejects a wrong request key and malformed receipt instead of treating them as unknown', async () => {
  const app = new Hono();
  const raw = { saveId: 'mine', idempotencyKey: '22222222-2222-4222-8222-222222222222', requestFingerprint: 'sha256:v1:' + 'a'.repeat(64), resultingRevision: 0,
    decision: { status: 'rejected' as const, code: 'INPUT_UNKNOWN', message: '无法识别', revision: 0 } };
  const read = vi.fn(async () => raw);
  mountGames(app, games, { resolveOwnerId: async () => 'a' }, undefined, undefined, read);
  expect((await app.request(`/api/games/mine/receipts/${key}`)).status).toBe(503);
  raw.idempotencyKey = key; raw.requestFingerprint = 'invalid';
  expect((await app.request(`/api/games/mine/receipts/${key}`)).status).toBe(503);
});

it('does not mistake the separately observed save revision for an atomic receipt snapshot', async () => {
  const receipt = { saveId: 'mine', idempotencyKey: key, requestFingerprint: 'sha256:v1:' + 'a'.repeat(64), resultingRevision: 1,
    decision: { status: 'rejected' as const, code: 'INPUT_UNKNOWN', message: 'later observation', revision: 1 } };
  const app = new Hono();
  mountGames(app, games, { resolveOwnerId: async () => 'a' }, undefined, undefined, async () => receipt);
  expect(await (await app.request(`/api/games/mine/receipts/${key}`)).json()).toEqual({ status: 'confirmed', receipt, revision: 0 });
});
