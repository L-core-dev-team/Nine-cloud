import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Hono } from 'hono';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createEmailAuthRuntime } from './auth-runtime.js';
import { mountAuth } from '../routes/auth.js';
import { hashToken } from './email-auth.js';

const url = process.env.TEST_DATABASE_URL;
if (url && !/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(new URL(url).pathname)) throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
const pool = new Pool({ connectionString: url, max: 2 });
afterAll(() => pool.end());
function upgradeRuntime() {
  return createEmailAuthRuntime(pool, {
    SUPABASE_AUTH_ENABLED: 'true', SUPABASE_AUTH_EMAIL_ENABLED: 'true',
    AUTH_PUBLIC_ORIGIN: 'http://127.0.0.1:5173', AUTH_SECRET: randomUUID() + randomUUID(),
    AUTH_MAILER: 'smtp', AUTH_MAIL_FROM: 'p3@example.invalid', SMTP_URL: 'smtp://127.0.0.1:1',
    SUPABASE_URL: 'https://p3-test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    SUPABASE_SECRET_KEY: 'sb_secret_' + 'x'.repeat(32), AUTH_IDENTITY_HMAC_SECRET: 'h'.repeat(32),
  })!;
}
async function cleanupOwners(owners: string[]) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN'); await c.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)");
    await c.query('DELETE FROM game_saves WHERE owner_id=ANY($1::text[])', [owners]);
    await c.query('DELETE FROM auth_accounts WHERE id=ANY($1::text[])', [owners]); await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); vi.unstubAllGlobals(); }
}
(url ? describe : describe.skip)('P3 guests with Supabase credential verification', () => {
  it('upgrades the same owner and save atomically; repeats do not create another account', async () => {
    const runtime = upgradeRuntime(); const service = runtime.supabaseAuth!;
    const guest = (await service.createGuest('127.0.0.77'))!; const owner = guest.session.ownerId;
    const email = randomUUID() + '@example.invalid'; const subject = randomUUID(); const saveId = randomUUID();
    const provider = vi.fn(async () => Response.json({ user: { id: subject, email, email_confirmed_at: new Date().toISOString() } }));
    vi.stubGlobal('fetch', provider);
    try {
      await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
        VALUES($1,$2,3,1,'fixture','fixture','fixture',$3::jsonb)`, [saveId, owner, JSON.stringify({ playerId: 'original-player', locationId: 'original-place', elapsedMinutes: 15, facts: {} })]);
      const before = (await pool.query('SELECT * FROM game_saves WHERE id=$1', [saveId])).rows;
      const app = new Hono(); mountAuth(app, service, runtime.origin);
      const upgrade = () => app.request('/api/auth/guest/upgrade', { method: 'POST', headers: {
        origin: runtime.origin, 'content-type': 'application/json', cookie: `jx_session=${guest.token}`,
      }, body: JSON.stringify({ email, code: '123456', confirmation: 'UPGRADE_GUEST_TO_EMAIL' }) });
      expect((await upgrade()).status).toBe(200);
      expect(await service.resolve(guest.token)).toMatchObject({ kind: 'email', ownerId: owner, email });
      expect((await upgrade()).status).toBe(409);
      expect(provider).toHaveBeenCalledTimes(1);
      expect((await pool.query('SELECT * FROM game_saves WHERE id=$1', [saveId])).rows).toEqual(before);
      expect((await pool.query('SELECT owner_id FROM auth_external_identities WHERE provider_subject=$1', [subject])).rows).toEqual([{ owner_id: owner }]);
      expect((await service.verify(email, '123456'))?.session.ownerId).toBe(owner);
    } finally { await cleanupOwners([owner]); }
  });
  it('leaves the guest untouched for wrong OTP, provider failure, cancellation and expired sessions', async () => {
    const service = upgradeRuntime().supabaseAuth!; const guest = (await service.createGuest('127.0.0.78'))!;
    const owner = guest.session.ownerId; const email = randomUUID() + '@example.invalid';
    const verified = () => Response.json({ user: { id: randomUUID(), email, email_confirmed_at: new Date().toISOString() } });
    const provider = vi.fn(async () => new Response('{}', { status: 401 })); vi.stubGlobal('fetch', provider);
    const upgrade = (signal?: AbortSignal) => service.upgradeGuest(owner, guest.token, email, '123456', 'UPGRADE_GUEST_TO_EMAIL', signal);
    try {
      expect(await upgrade()).toEqual({ status: 'invalid_code' });
      provider.mockImplementation(async () => { throw new DOMException('deadline', 'TimeoutError'); });
      await expect(upgrade()).rejects.toMatchObject({ code: 'AUTH_PROVIDER_UNAVAILABLE' });
      const cancel = new AbortController();
      provider.mockImplementation(async () => { cancel.abort(); return verified(); });
      expect(await upgrade(cancel.signal)).toEqual({ status: 'unavailable' });
      provider.mockImplementation(async () => { await pool.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE owner_id=$1", [owner]); return verified(); });
      expect(await upgrade()).toEqual({ status: 'unavailable' });
      expect((await pool.query('SELECT is_guest,email FROM auth_accounts WHERE id=$1', [owner])).rows).toEqual([{ is_guest: true, email: null }]);
      expect((await pool.query('SELECT 1 FROM auth_external_identities WHERE owner_id=$1', [owner])).rows).toEqual([]);
    } finally { await cleanupOwners([owner]); }
  });
  it('does not steal an existing email and serializes simultaneous upgrades for one email', async () => {
    const service = upgradeRuntime().supabaseAuth!; const a = (await service.createGuest('127.0.0.79'))!; const b = (await service.createGuest('127.0.0.80'))!;
    const owners = [a.session.ownerId, b.session.ownerId]; const email = randomUUID() + '@example.invalid'; const subject = randomUUID();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ user: { id: subject, email, email_confirmed_at: new Date().toISOString() } })));
    const upgrade = (g: typeof a) => service.upgradeGuest(g.session.ownerId, g.token, email, '123456', 'UPGRADE_GUEST_TO_EMAIL');
    try {
      const results = await Promise.all([upgrade(a), upgrade(b)]);
      expect(results.filter(r => r.status === 'upgraded')).toHaveLength(1);
      expect(results.filter(r => r.status === 'unavailable')).toHaveLength(1);
      const loser = results[0]!.status === 'upgraded' ? b : a;
      expect(await upgrade(loser)).toEqual({ status: 'unavailable' });
      expect(await service.resolve(loser.token)).toMatchObject({ kind: 'guest', ownerId: loser.session.ownerId });
      expect((await pool.query('SELECT id FROM auth_accounts WHERE email=$1', [email])).rows).toHaveLength(1);
    } finally { await cleanupOwners(owners); }
  });
  it('creates and rotates an owned guest cookie without contacting Supabase; OTP still goes to Supabase', async () => {
    const runtime = createEmailAuthRuntime(pool, {
      SUPABASE_AUTH_ENABLED: 'true', SUPABASE_AUTH_EMAIL_ENABLED: 'true',
      AUTH_PUBLIC_ORIGIN: 'http://127.0.0.1:5173', AUTH_SECRET: randomUUID() + randomUUID(),
      AUTH_MAILER: 'smtp', AUTH_MAIL_FROM: 'p3@example.invalid', SMTP_URL: 'smtp://127.0.0.1:1',
      SUPABASE_URL: 'https://p3-test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      SUPABASE_SECRET_KEY: 'sb_secret_' + 'x'.repeat(32), AUTH_IDENTITY_HMAC_SECRET: 'h'.repeat(32),
    })!;
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({})); vi.stubGlobal('fetch', fetch);
    const app = new Hono(); mountAuth(app, runtime.routesService!, runtime.origin);
    const request = (path: string, method = 'GET', body?: unknown, cookie?: string) => app.request(path, {
      method, headers: { origin: runtime.origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let owner: string | undefined;
    try {
      const created = await request('/api/auth/guest', 'POST', {});
      expect(created.status).toBe(201); const data = await created.json(); owner = data.account.id;
      expect(data.account).toEqual({ id: owner, kind: 'guest' });
      const cookie = created.headers.get('set-cookie')!.split(';')[0]!;
      expect(fetch).not.toHaveBeenCalled();
      const again = await request('/api/auth/guest', 'POST', {}, cookie);
      expect((await again.json()).account.id).toBe(owner);
      const rotated = await request('/api/auth/refresh', 'POST', {}, cookie);
      expect(rotated.status).toBe(200);
      const nextCookie = rotated.headers.get('set-cookie')!.split(';')[0]!;
      expect(nextCookie).not.toBe(cookie);
      expect((await request('/api/auth/session', 'GET', undefined, cookie)).status).toBe(401);
      const session = await request('/api/auth/session', 'GET', undefined, nextCookie);
      expect((await session.json()).account.id).toBe(owner);
      expect((await pool.query('SELECT owner_id FROM auth_sessions WHERE token_hash=$1', [hashToken(nextCookie.split('=')[1]!)])).rows[0].owner_id).toBe(owner);
      expect((await request('/api/auth/code', 'POST', { email: randomUUID() + '@example.invalid' })).status).toBe(202);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]?.[0])).toContain('p3-test.supabase.co/auth/v1/otp');
    } finally {
      vi.unstubAllGlobals();
      if (owner) { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('jiuxiao.account_erasure_operation','test-cleanup',true)"); await c.query('DELETE FROM auth_accounts WHERE id=$1', [owner]); await c.query('COMMIT'); } finally { c.release(); } }
    }
  });
});
