import type { Pool, PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthFailure } from './auth-failure.js';
import { SupabaseAuthService, type SupabaseAuthConfig } from './supabase-auth.js';

const subject = '11111111-2222-4333-8444-555555555555';
const owner = 'owner-test';
const email = 'player@example.invalid';
const phone = '+14155550100';

function config(overrides: Partial<SupabaseAuthConfig> = {}): SupabaseAuthConfig {
  return {
    url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test-key',
    adminKey: `sb_secret_${'s'.repeat(32)}`, enabledEmail: true, enabledPhone: false,
    phoneHookConfigured: false, phoneCaptchaConfigured: false, allowedPhonePrefixes: [],
    phoneBudgetCents: 0, phoneMonthlySegments: 0, phoneIpHourlyLimit: 0, phoneIpDailyLimit: 0,
    phoneOwnerHourlyLimit: 0, phoneOwnerDailyLimit: 0, identitySecret: 'i'.repeat(32),
    ...overrides,
  };
}

function poolFixture(query: (sql: string, values?: unknown[]) => { rows?: unknown[]; rowCount?: number } = () => ({ rows: [], rowCount: 0 })) {
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      const result = query(sql, values);
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      const result = query(sql, values);
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 };
    }),
  } as unknown as Pool;
  return { pool, client };
}

function service(pool: Pool, overrides: Partial<SupabaseAuthConfig> = {}) {
  return new SupabaseAuthService(pool, {} as never, config(overrides));
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function phoneConfig(overrides: Partial<SupabaseAuthConfig> = {}) {
  return config({
    enabledPhone: true, phoneHookConfigured: true, phoneCaptchaConfigured: true,
    allowedPhonePrefixes: ['+1'], phoneBudgetCents: 5000, phoneMonthlySegments: 1000,
    phoneIpHourlyLimit: 20, phoneIpDailyLimit: 50, phoneOwnerHourlyLimit: 5, phoneOwnerDailyLimit: 20,
    ...overrides,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SupabaseAuthService provider boundary', () => {
  it('rejects project URLs containing embedded credentials', () => {
    const f = poolFixture();
    expect(() => service(f.pool, { url: 'https://user:private@project.supabase.co/' })).toThrow('SUPABASE_URL');
  });

  it.each([null, [], 'invalid'])('fails closed with a typed provider error on malformed verification JSON: %j', async value => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(value)));
    const f = poolFixture();
    await expect(service(f.pool).verify(email, '123456')).rejects.toMatchObject({ code: 'AUTH_PROVIDER_UNAVAILABLE', stage: 'auth_verify' });
    expect(f.pool.connect).not.toHaveBeenCalled();
  });

  it('sends normalized email OTP requests with only the publishable key', async () => {
    const fetch = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetch);
    const f = poolFixture();
    expect(await service(f.pool).requestCode(' Player@Example.Invalid ', null)).toBe('sent');
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://project.supabase.co/auth/v1/otp');
    expect(JSON.parse(String(init.body))).toEqual({ email, create_user: true });
    expect(init.redirect).toBe('error');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_test-key', 'content-type': 'application/json', accept: 'application/json' });
  });

  it('does not contact Supabase for malformed OTP values or when phone login is disabled', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const f = poolFixture();
    expect(await service(f.pool).verify(email, '12')).toBeNull();
    await expect(service(f.pool).requestPhoneCode(phone, '203.0.113.7', 'x'.repeat(30))).rejects.toMatchObject({ code: 'SMS_NOT_ENABLED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses create_user=false for phone sign-in and forwards only the CAPTCHA token', async () => {
    const fetch = vi.fn(async () => jsonResponse({})); vi.stubGlobal('fetch', fetch);
    const f = poolFixture((_sql) => ({ rows: [{ day_count: 1 }], rowCount: 1 }));
    const auth = new SupabaseAuthService(f.pool, {} as never, phoneConfig());
    expect(await auth.requestPhoneCode(phone, '203.0.113.7', 'captcha-token-value-0123456789')).toBe('sent');
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      phone, create_user: false, gotrue_meta_security: { captcha_token: 'captcha-token-value-0123456789' },
    });
    expect(JSON.stringify(init)).not.toContain('203.0.113.7');
  });

  it('rejects an unapproved phone prefix before reserving quota or sending', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const f = poolFixture();
    const auth = new SupabaseAuthService(f.pool, {} as never, phoneConfig({ allowedPhonePrefixes: ['+86'] }));
    await expect(auth.requestPhoneCode(phone, '203.0.113.7', 'captcha-token-value-0123456789')).rejects.toThrow('PHONE_REGION_NOT_SUPPORTED');
    expect(f.pool.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('maps a verified phone only to the owner that completed the authenticated link flow', async () => {
    const fetch = vi.fn(async () => jsonResponse({ user: {
      id: subject, phone, phone_confirmed_at: '2026-10-06T00:00:00Z',
    } })); vi.stubGlobal('fetch', fetch);
    const f = poolFixture(sql => {
      if (sql.includes('SELECT id,closed_at FROM auth_accounts')) return { rows: [{ id: owner, closed_at: null }] };
      if (sql.includes('SELECT owner_id FROM auth_external_identities') && sql.includes('FOR UPDATE')) return { rows: [] };
      if (sql.includes('SELECT owner_id FROM auth_external_identities')) return { rows: [{ owner_id: owner }] };
      return { rows: [], rowCount: 1 };
    });
    const auth = new SupabaseAuthService(f.pool, {} as never, phoneConfig());
    expect(await auth.linkPhone(owner, phone, '123456')).toBe(true);
    expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auth_external_identities'), expect.arrayContaining([subject, 'phone', expect.any(String), owner, expect.any(Date)]));
    expect(f.client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('refuses to attach a verified phone subject already mapped to another owner', async () => {
    const fetch = vi.fn(async () => jsonResponse({ user: {
      id: subject, phone, phone_confirmed_at: '2026-10-06T00:00:00Z',
    } })); vi.stubGlobal('fetch', fetch);
    const f = poolFixture(sql => {
      if (sql.includes('SELECT id,closed_at FROM auth_accounts')) return { rows: [{ id: owner, closed_at: null }] };
      if (sql.includes('SELECT owner_id FROM auth_external_identities') && sql.includes('FOR UPDATE')) return { rows: [{ owner_id: 'other-owner' }] };
      return { rows: [], rowCount: 1 };
    });
    const auth = new SupabaseAuthService(f.pool, {} as never, phoneConfig());
    expect(await auth.linkPhone(owner, phone, '123456')).toBe(false);
    expect(f.client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO auth_external_identities'))).toBe(false);
    expect(f.client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('synchronizes a verified email change through Admin API using a new secret key as apikey only', async () => {
    const fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === 'PUT') return jsonResponse({ id: subject });
      return jsonResponse({ id: subject, email: 'new@example.invalid', email_confirmed_at: '2026-10-06T00:00:00Z' });
    }); vi.stubGlobal('fetch', fetch);
    const f = poolFixture(sql => sql.includes('SELECT provider_subject') ? { rows: [{ provider_subject: subject }] } : { rows: [] });
    const auth = service(f.pool);
    await auth.changeEmailIdentity(f.client as unknown as PoolClient, owner, 'New@Example.Invalid');
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls as unknown as Array<[URL, RequestInit]>) {
      expect(init.redirect).toBe('error');
      expect((init.headers as Record<string, string>).apikey).toBe(`sb_secret_${'s'.repeat(32)}`);
      expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    }
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [URL, RequestInit])[1].body))).toEqual({ email: 'new@example.invalid', email_confirm: true });
  });

  it('fails closed when permanent deletion has no mapped Supabase Auth users', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const f = poolFixture(() => ({ rows: [] }));
    await expect(service(f.pool).deleteOwnerAuthUsers(f.client as unknown as PoolClient, owner)).rejects.toThrow('SUPABASE_IDENTITIES_NOT_FOUND');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes all distinct mapped Auth users and treats an already missing remote user as complete', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 })); vi.stubGlobal('fetch', fetch);
    const secondSubject = '66666666-2222-4333-8444-555555555555';
    const f = poolFixture(sql => {
      if (sql.includes('SELECT DISTINCT provider_subject')) return { rows: [{ provider_subject: subject }, { provider_subject: secondSubject }] };
      if (sql.includes('SELECT 1 FROM auth_external_identities')) return { rows: [] };
      return { rows: [] };
    });
    await service(f.pool).deleteOwnerAuthUsers(f.client as unknown as PoolClient, owner);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(call => (call[1] as RequestInit).method)).toEqual(['DELETE', 'DELETE']);
  });

  it('does not surface provider response details to callers', async () => {
    const fetch = vi.fn(async () => new Response('provider-secret-detail', { status: 500 })); vi.stubGlobal('fetch', fetch);
    const f = poolFixture();
    await expect(service(f.pool).requestCode(email)).rejects.toBeInstanceOf(AuthFailure);
    await expect(service(f.pool).requestCode(email)).rejects.not.toThrow('provider-secret-detail');
  });
});
