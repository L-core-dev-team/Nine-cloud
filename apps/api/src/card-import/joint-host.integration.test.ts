import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../app.js';
import { sessionToken } from '../routes/auth.js';
import { EmailAuthService } from '../services/email-auth.js';
import { PostgresEmailAuthRepository } from '../services/postgres-email-auth.js';
import { PostgresCloudSaveRepository } from '../services/postgres-cloud-save-repository.js';
import { createPostgresServerTurnRepository } from '../services/postgres-server-turn.js';
import { AuthoritativeGameService } from '../services/authoritative-game.js';
import { ServerTurnService, type ServerTurnRules } from '../services/server-turn.js';
import { assertLocalCardDatabase } from './local-runtime.js';

// A and B through one host and the same real local session/PG. Synthetic rules/model/mail only.
const url = process.env.JOINT_TEST_DATABASE_URL;
if (url) assertLocalCardDatabase(url, /^\/jiuxiao_test_joint_[0-9_]+$/);
describe.skipIf(!url)('joint card and native receipt host', () => {
  const pool = new Pool({ connectionString: url, max: 6 });
  const secret = 'synthetic-joint-local-secret-not-a-production-credential';
  const codes = new Map<string, string>();
  const auth = new EmailAuthService(new PostgresEmailAuthRepository(pool, secret), async (email, code) => { codes.set(email, code); }, secret);
  const repository = createPostgresServerTurnRepository(pool);
  const games = new AuthoritativeGameService(new PostgresCloudSaveRepository(pool));
  const rules: ServerTurnRules = {
    ruleVersion: 'fixture', canonVersion: 'fixture', memoryPolicyVersion: 'fixture',
    decide: (intent, save) => ({ status: 'accepted', nextRevision: save.revision + 1, events: [{ id: randomUUID(), saveId: intent.saveId, type: 'fixture.move', beforeRevision: save.revision, afterRevision: save.revision + 1, source: 'RULES', ruleVersion: 'fixture', occurredAt: new Date().toISOString(), payload: {} }] }),
    reduce: state => ({ ...state, elapsedMinutes: state.elapsedMinutes + 1, facts: { gameMinute: Number(state.facts.gameMinute) + 1 } }),
    grantsForEvent: () => [], policyForNpc: () => 'continue-v1',
  };
  const turns = new ServerTurnService(repository, rules);
  const nativeAuth = { resolveOwnerId: async (request: Request) => (await auth.resolve(sessionToken(request)))?.ownerId ?? null };
  const app = createApp(undefined, undefined, { service: auth, origin: 'https://joint.example.invalid' },
    { service: turns, games, auth: nativeAuth, readReceipt: (owner, save, key) => repository.getReceiptForOwner(owner, save, key) },
    { pool, model: async () => 'synthetic narrative' });
  const send = (path: string, token = '', method = 'GET', body?: unknown) => app.request(path, {
    method, headers: { origin: 'https://joint.example.invalid', ...(token ? { cookie: `jx_session=${token}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  beforeAll(async () => {
    const base = new URL('../../../../packages/db/drizzle/', import.meta.url);
    for (const f of (await readdir(base)).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) await pool.query(await readFile(new URL(f, base), 'utf8'));
    await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  });
  afterAll(async () => { await pool.end(); });
  it('keeps both routes mounted with session isolation and no native changes from card play', async () => {
    expect((await createApp().request('/api/card-import/cards')).status).toBe(404);
    expect(() => createApp(undefined, undefined, undefined, undefined, { pool })).toThrow('CARD_AUTH_REQUIRED');
    expect((await send('/api/card-import/cards')).status).toBe(401);
    const users = [];
    for (const label of ['a', 'b']) {
      const email = `${label}-${randomUUID()}@example.invalid`;
      await auth.requestCode(email); const value = await auth.verify(email, codes.get(email));
      if (!value) throw Error('LOGIN_FIXTURE_FAILED'); users.push(value);
    }
    const [a, b] = users; if (!a || !b) throw Error('LOGIN_FIXTURE_FAILED');
    const saveId = `joint-${randomUUID()}`, key = randomUUID();
    await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
      VALUES($1,$2,0,1,'fixture','fixture','fixture',$3::jsonb)`, [saveId, a.session.ownerId, JSON.stringify({ playerId: 'fixture-player', locationId: 'fixture-origin', elapsedMinutes: 0, facts: { gameMinute: 0 } })]);
    const result = await turns.execute(a.session.ownerId, { kind: 'move', saveId, actorId: 'fixture-player', expectedRevision: 0, idempotencyKey: key, payload: { destinationId: 'fixture-target' } });
    expect(result.status).toBe('accepted');
    const before = (await pool.query('SELECT to_jsonb(s) AS value FROM game_saves s WHERE id=$1', [saveId])).rows;
    const getReceipt = `/api/games/${saveId}/receipts/${key}`;
    expect(await (await send(getReceipt, a.token)).json()).toMatchObject({ status: 'confirmed', receipt: { saveId, idempotencyKey: key, decision: { status: 'accepted' } } });
    expect((await send(getReceipt, b.token)).status).toBe(404);
    expect((await send(getReceipt)).status).toBe(401);
    const source = { name: 'synthetic', description: 'fixture', personality: 'kind', scenario: 'fixture', first_mes: 'hello', mes_example: 'example' };
    const imported = await (await send('/api/card-import/imports', a.token, 'POST', { filename: 'card.json', kind: 'card', bytesBase64: Buffer.from(JSON.stringify(source)).toString('base64'), rightsConfirmed: true })).json();
    const card = await (await send('/api/card-import/cards', a.token, 'POST', { importId: imported.id, parentId: null, source: 'fixture', notes: '', links: [] })).json();
    const session = randomUUID();
    expect((await send('/api/card-import/sessions', a.token, 'POST', { id: session, cardId: card.id })).status).toBe(200);
    const played = await (await send(`/api/card-import/sessions/${session}/actions`, a.token, 'POST', { action: 'hello', expectedRevision: 0, idempotencyKey: randomUUID() })).json();
    expect(played.status).toBe('completed');
    expect((await send(`/api/card-import/sessions/${session}`, b.token)).status).toBe(404);
    expect((await pool.query('SELECT to_jsonb(s) AS value FROM game_saves s WHERE id=$1', [saveId])).rows).toEqual(before);
    expect(await (await send(getReceipt, a.token)).json()).toMatchObject({ status: 'confirmed', receipt: { idempotencyKey: key } });
    expect((await send(`/api/games/${session}/receipts/${key}`, a.token)).status).toBe(404);
  });
});
