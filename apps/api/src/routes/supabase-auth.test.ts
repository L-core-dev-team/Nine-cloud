import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { mountSupabasePhoneAuth } from './supabase-auth.js';

function fixture(authenticated = false) {
  const app = new Hono();
  const session = { ownerId: 'owner-a', email: 'a@example.invalid', expiresAt: new Date('2026-10-07T00:00:00Z') };
  const sessions = { resolve: vi.fn(async (token: string | null) => authenticated && token === 'session-token' ? session : null) };
  const service = {
    phoneStatus: vi.fn(async () => ({ phoneLinked: true })),
    requestPhoneCode: vi.fn(async () => 'sent' as const),
    verifyPhone: vi.fn(async () => ({ session, token: 'new-session-token' })),
    linkPhone: vi.fn(async () => true),
    unlinkPhone: vi.fn(async () => true),
  };
  mountSupabasePhoneAuth(app, service as never, sessions as never, 'https://play.example.invalid', 'Strict', []);
  return { app, service, sessions };
}

const post = (body: unknown, cookie?: string) => ({
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});

describe('Supabase phone auth HTTP contract', () => {
  it('rejects unexpected fields so clients cannot select an owner or creation mode', async () => {
    const f = fixture();
    const response = await f.app.request('/api/auth/phone/code', post({ phone: '+14155550100', captchaToken: 'captcha-token-value-0123456789', ownerId: 'owner-b' }));
    expect(response.status).toBe(400);
    expect(f.service.requestPhoneCode).not.toHaveBeenCalled();
  });

  it('does not allow a login request to create a Supabase phone user', async () => {
    const f = fixture();
    const response = await f.app.request('/api/auth/phone/code', post({ phone: '+14155550100', captchaToken: 'captcha-token-value-0123456789' }));
    expect(response.status).toBe(202);
    expect(f.service.requestPhoneCode).toHaveBeenCalledWith('+14155550100', expect.any(String), 'captcha-token-value-0123456789', false, undefined);
  });

  it('requires the existing Hono session before requesting a phone-link code', async () => {
    const f = fixture(false);
    const response = await f.app.request('/api/auth/phone/link/code', post({ phone: '+14155550100', captchaToken: 'captcha-token-value-0123456789' }));
    expect(response.status).toBe(401);
    expect(f.service.requestPhoneCode).not.toHaveBeenCalled();
  });

  it('creates the phone identity only from an authenticated link-code flow', async () => {
    const f = fixture(true);
    const response = await f.app.request('/api/auth/phone/link/code', post({ phone: '+14155550100', captchaToken: 'captcha-token-value-0123456789' }, 'jx_session=session-token'));
    expect(response.status).toBe(202);
    expect(f.service.requestPhoneCode).toHaveBeenCalledWith('+14155550100', expect.any(String), 'captcha-token-value-0123456789', true, 'owner-a');
  });

  it('marks the phone restore endpoint as a restore flow and sets a protected Hono cookie', async () => {
    const f = fixture();
    const response = await f.app.request('/api/auth/phone/restore', post({ phone: '+14155550100', code: '123456' }));
    expect(response.status).toBe(200);
    expect(f.service.verifyPhone).toHaveBeenCalledWith('+14155550100', '123456', true);
    expect(response.headers.get('set-cookie')).toContain('jx_session=new-session-token; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure');
    expect(await response.json()).toMatchObject({ account: { id: 'owner-a', email: 'a@example.invalid' } });
  });
});
