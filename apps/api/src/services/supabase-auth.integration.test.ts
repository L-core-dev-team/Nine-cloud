import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SupabaseAuthService, type SupabaseAuthConfig } from './supabase-auth.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 4 }) : undefined;
const owners: string[] = [];
const emails: string[] = [];
const phone = '+14155550100';
const phone2 = '+14155550101';
const conflictPhone = '+14155550102';
const secret = 'isolated-integration-hmac-secret-32-bytes-min';

function authConfig(): SupabaseAuthConfig {
  return {
    url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test-key',
    adminKey: `sb_secret_${'s'.repeat(32)}`, enabledEmail: true, enabledPhone: true,
    phoneHookConfigured: true, phoneCaptchaConfigured: true, allowedPhonePrefixes: ['+1'],
    phoneBudgetCents: 5000, phoneMonthlySegments: 1000, phoneIpHourlyLimit: 20, phoneIpDailyLimit: 50,
    phoneOwnerHourlyLimit: 5, phoneOwnerDailyLimit: 20, identitySecret: secret,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

async function createAccount() {
  if (!pool) throw new Error('TEST_DATABASE_URL_REQUIRED');
  const owner = randomUUID();
  const email = `${owner}@example.invalid`;
  owners.push(owner); emails.push(email);
  await pool.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)', [owner, email]);
  return { owner, email };
}

afterEach(() => vi.unstubAllGlobals());

suite('Supabase external identities, isolated PostgreSQL only', () => {
  beforeAll(async () => {
    if (!pool) throw new Error('TEST_DATABASE_URL_REQUIRED');
    await pool.query('SELECT 1 FROM auth_external_identities LIMIT 0');
  });

  afterAll(async () => {
    if (!pool || owners.length === 0) { await pool?.end(); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('jiuxiao.account_erasure_operation',$1,true)", ['test-cleanup']);
      await client.query('DELETE FROM auth_accounts WHERE id=ANY($1::text[])', [owners]);
      await client.query('DELETE FROM auth_challenges WHERE email=ANY($1::text[])', [emails]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally {
      client.release(); await pool.end();
    }
  });

  it('preserves the internal owner through phone linking and subsequent phone login', async () => {
    if (!pool) throw new Error('TEST_DATABASE_URL_REQUIRED');
    const account = await createAccount();
    const user = { id: '11111111-2222-4333-8444-555555555555', phone, phone_confirmed_at: '2026-10-06T00:00:00Z' };
    const fetch = vi.fn(async () => jsonResponse({ user })); vi.stubGlobal('fetch', fetch);
    const auth = new SupabaseAuthService(pool, {} as never, authConfig());

    expect(await auth.linkPhone(account.owner, phone, '123456')).toBe(true);
    expect(await auth.phoneStatus(account.owner)).toEqual({ phoneLinked: true });
    const login = await auth.verifyPhone(phone, '123456');
    expect(login?.session).toMatchObject({ ownerId: account.owner, email: account.email });
    expect(login?.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect((await pool.query('SELECT owner_id FROM auth_sessions WHERE token_hash IS NOT NULL AND owner_id=$1', [account.owner])).rowCount).toBe(1);
  });

  it('rejects a verified phone already linked to a different internal owner', async () => {
    if (!pool) throw new Error('TEST_DATABASE_URL_REQUIRED');
    const first = await createAccount(); const second = await createAccount();
    const auth = new SupabaseAuthService(pool, {} as never, authConfig());
    const firstUser = { id: '22222222-2222-4333-8444-555555555555', phone: conflictPhone, phone_confirmed_at: '2026-10-06T00:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: firstUser })));
    expect(await auth.linkPhone(first.owner, conflictPhone, '123456')).toBe(true);

    const conflictingUser = { id: '33333333-2222-4333-8444-555555555555', phone: conflictPhone, phone_confirmed_at: '2026-10-06T00:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user: conflictingUser })));
    expect(await auth.linkPhone(second.owner, conflictPhone, '123456')).toBe(false);
    expect((await pool.query(`SELECT owner_id FROM auth_external_identities
      WHERE identity_kind='phone' AND owner_id=$1 AND revoked_at IS NULL`, [second.owner])).rowCount).toBe(0);
  });

  it('does not create an internal account for a verified but unlinked phone login', async () => {
    if (!pool) throw new Error('TEST_DATABASE_URL_REQUIRED');
    const before = Number((await pool.query('SELECT count(*)::int AS count FROM auth_accounts')).rows[0].count);
    const user = { id: '44444444-2222-4333-8444-555555555555', phone: phone2, phone_confirmed_at: '2026-10-06T00:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ user })));
    const auth = new SupabaseAuthService(pool, {} as never, authConfig());
    expect(await auth.verifyPhone(phone2, '123456')).toBeNull();
    expect(Number((await pool.query('SELECT count(*)::int AS count FROM auth_accounts')).rows[0].count)).toBe(before);
  });
});
