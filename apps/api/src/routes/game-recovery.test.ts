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
it('accepts 8000 Chinese units at transport boundary but rejects 8001 without executing', async () => {
  const execute = vi.fn(async () => ({ status: 'rules_not_ready' as const })); const app = new Hono();
  mountGames(app, games, { resolveOwnerId: async () => 'a' }, { execute } as unknown as ServerTurnService);
  const send = (text: string) => app.request('/api/games/mine/turns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, expectedRevision: 0, idempotencyKey: key }) });
  expect((await send('甲'.repeat(8000))).status).toBe(503);
  expect(execute).toHaveBeenCalledTimes(1);
  expect((await send('甲'.repeat(8001))).status).toBe(400);
  expect(execute).toHaveBeenCalledTimes(1);
});
