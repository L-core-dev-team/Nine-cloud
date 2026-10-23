import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import type { ActionIntent } from '@jiuxiao/contracts';
import { createApp } from '../app.js';
import { sessionToken } from './auth.js';
import { AuthoritativeGameService } from '../services/authoritative-game.js';
import { PostgresCloudSaveRepository } from '../services/postgres-cloud-save-repository.js';
import { createPostgresServerTurnRepository } from '../services/postgres-server-turn.js';
import { ServerTurnService, type ServerTurnRules } from '../services/server-turn.js';
import { EmailAuthService } from '../services/email-auth.js';
import { PostgresEmailAuthRepository } from '../services/postgres-email-auth.js';

// Real local PG/session/route integration; synthetic rules and mail transport, not production gameplay approval.
const url = process.env.TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(parsed.pathname)) throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
}
(url ? describe : describe.skip)('read-only receipt HTTP routing with real PostgreSQL sessions', () => {
  const pool = new Pool({ connectionString: url, max: 4 });
  const prefix = randomUUID(); const id = `recovery-${prefix}`; const otherSave = `other-${prefix}`;
  const secret = 'dedup-isolated-fixture-not-a-production-secret';
  const codes = new Map<string, string>();
  let now = new Date();
  const authService = new EmailAuthService(new PostgresEmailAuthRepository(pool, secret), async (email, code) => { codes.set(email, code); }, secret, () => now);
  const owners: string[] = []; const tokens: string[] = [];
  const repository = createPostgresServerTurnRepository(pool);
  const games = new AuthoritativeGameService(new PostgresCloudSaveRepository(pool));
  const rules: ServerTurnRules = {
    ruleVersion: 'fixture', canonVersion: 'fixture', memoryPolicyVersion: 'fixture',
    decide: (intent, save) => ({ status: 'accepted', nextRevision: save.revision + 1, events: [{ id: randomUUID(), saveId: intent.saveId, type: 'fixture.move', beforeRevision: save.revision, afterRevision: save.revision + 1, source: 'RULES', ruleVersion: 'fixture', occurredAt: new Date().toISOString(), payload: {} }] }),
    reduce: state => ({ ...state, elapsedMinutes: state.elapsedMinutes + 1, facts: { gameMinute: Number(state.facts.gameMinute) + 1 } }),
    grantsForEvent: event => [{ npcId: 'fixture-npc', eventId: event.id, channel: 'witnessed', authorizationPolicyVersion: 'fixture', authorizedFields: ['summary'], authorizedFacts: { summary: 'fixture' }, visibleSummary: 'fixture' }],
    policyForNpc: () => 'continue-v1',
  };
  const turnService = new ServerTurnService(repository, rules);
  const execute = vi.spyOn(turnService, 'execute');
  const readReceipt = vi.fn((owner: string, saveId: string, key: string) => repository.getReceiptForOwner(owner, saveId, key));
  const app = createApp(undefined, undefined, { service: authService, origin: 'https://fixture.invalid' }, {
    service: turnService, games, readReceipt,
    auth: { resolveOwnerId: async request => (await authService.resolve(sessionToken(request)))?.ownerId ?? null },
  });
  const keys: string[] = [];
  const get = (key: string, token = tokens[0], saveId = id, claimedOwner?: string) => app.request(`/api/games/${saveId}/receipts/${key}`, {
    headers: { ...(token ? { cookie: `jx_session=${token}` } : {}), ...(claimedOwner ? { 'x-jiuxiao-account': claimedOwner } : {}) },
  });
  const snapshot = async () => {
    const rows: Record<string, unknown> = {};
    for (const table of ['game_saves', 'turn_requests', 'turn_events', 'npc_memory_journals', 'npc_authorized_observation_outbox', 'npc_memory_observation_supersessions', 'cloud_archive_trash']) {
      rows[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE ${table === 'game_saves' ? 'id' : 'save_id'} = ANY($1::text[]) ORDER BY to_jsonb(t)::text`, [[id, otherSave]])).rows;
    }
    return rows;
  };
  beforeAll(async () => {
    for (const name of ['a', 'b']) {
      const email = `${name}-${prefix}@example.invalid`;
      await authService.requestCode(email);
      const login = await authService.verify(email, codes.get(email));
      if (!login) throw Error('LOGIN_FIXTURE_FAILED');
      owners.push(login.session.ownerId); tokens.push(login.token);
    }
    for (const saveId of [id, otherSave]) await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
      VALUES($1,$2,0,1,'fixture','fixture','fixture',$3::jsonb)`, [saveId, owners[0], JSON.stringify({ playerId: 'fixture-player', locationId: 'fixture-origin', elapsedMinutes: 0, facts: { gameMinute: 0 } })]);
    for (const status of ['accepted', 'rejected', 'clarify'] as const) {
      const key = randomUUID(); keys.push(key);
      const intent: ActionIntent = { kind: 'move', saveId: id, actorId: 'fixture-player', expectedRevision: status === 'accepted' ? 0 : 1, idempotencyKey: key, payload: { destinationId: 'fixture-target' } };
      const service = status === 'accepted' ? turnService : new ServerTurnService(repository, { ...rules, decide: (action, save) => status === 'rejected'
        ? { status: 'rejected', code: 'FIXTURE_REJECTED', message: 'fixture', revision: save.revision }
        : { status: 'clarify', question: 'fixture?', missingSlots: ['destinationId'], candidates: [], interactionId: action.idempotencyKey, revision: save.revision } });
      const result = await service.execute(owners[0]!, intent);
      expect(result.status).toBe(status === 'accepted' ? 'accepted' : 'decision');
    }
    execute.mockClear(); readReceipt.mockClear();
  });
  afterAll(async () => { await pool.end(); }); // Preserve this isolated database for independent review.

  it('recovers accepted, rejected and clarification receipts without changing gameplay, memories or narrative metadata', async () => {
    const before = await snapshot();
    for (const [i, status] of ['accepted', 'rejected', 'clarify'].entries()) {
      const response = await get(keys[i]!); expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ status: 'confirmed', revision: 1, receipt: { saveId: id, idempotencyKey: keys[i], decision: { status } } });
      expect(body.receipt).toEqual(await repository.getReceiptForOwner(owners[0]!, id, keys[i]!));
    }
    const unknown = randomUUID();
    for (let i = 0; i < 3; i++) expect(await (await get(unknown)).json()).toEqual({ status: 'unknown', receipt: null, revision: 1 });
    expect(await snapshot()).toEqual(before); expect(execute).not.toHaveBeenCalled();
    expect(readReceipt.mock.calls.slice(-3)).toEqual(Array.from({ length: 3 }, () => [owners[0], id, unknown]));
  });
  it('refuses no session, other account, forged owner, invalid UUID and cross-save receipt lookup', async () => {
    const before = await snapshot();
    expect((await get(keys[0]!, '')).status).toBe(401);
    expect((await get(keys[0]!, tokens[1])).status).toBe(404);
    expect((await get(keys[0]!, tokens[1], 'missing')).status).toBe(404);
    expect((await get(keys[0]!, tokens[1], id, owners[0])).status).toBe(401);
    const calls = readReceipt.mock.calls.length;
    expect((await get('not-a-uuid')).status).toBe(400); expect(readReceipt.mock.calls.length).toBe(calls);
    expect(await (await get(keys[0]!, tokens[0], otherSave)).json()).toMatchObject({ status: 'unknown', receipt: null });
    expect(await snapshot()).toEqual(before); expect(execute).not.toHaveBeenCalled();
  });
  it('fails closed for corrupt or mismatched stored receipt identity', async () => {
    const original = await repository.getReceiptForOwner(owners[0]!, id, keys[1]!);
    for (const value of [{ ...original, saveId: otherSave }, { ...original, idempotencyKey: randomUUID() }, { corrupt: true }]) {
      const key = randomUUID();
      await pool.query('INSERT INTO turn_requests(save_id,idempotency_key,expected_revision,result) VALUES($1,$2,1,$3::jsonb)', [id, key, JSON.stringify(value)]);
      const before = await snapshot(); const response = await get(key);
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: 'GAME_UNAVAILABLE' });
      expect(await snapshot()).toEqual(before);
    }
  });
  it('refuses trashed archives, expired sessions and logged-out sessions', async () => {
    await pool.query('INSERT INTO cloud_archive_trash(save_id,owner_id,deleted_revision,backup,digest) VALUES($1,$2,1,$3::jsonb,$4)', [id, owners[0], '{}', 'fixture']);
    const before = await snapshot(); expect((await get(keys[0]!)).status).toBe(404); expect(await snapshot()).toEqual(before);
    now = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect((await get(keys[0]!, tokens[1], otherSave)).status).toBe(401);
    now = new Date(); await authService.logout(tokens[0]!);
    expect((await get(keys[0]!, tokens[0], otherSave)).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
});
