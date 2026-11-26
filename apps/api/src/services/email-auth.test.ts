import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { AuthFailure } from './auth-failure.js';
import { EmailAuthService, GUEST_CODE_OWNER_HOURLY, GUEST_CODE_POOL_HOURLY, hashToken, normalizeEmail, SESSION_SECONDS, type AuthSession, type EmailAuthRepository } from './email-auth.js';

class TestAuthRepository implements EmailAuthRepository {
  codes = new Map<string, { digest: string | null; attempts: number; expiresAt: Date; issuedAt: Date }>();
  sessions = new Map<string, AuthSession>();
  ipCounts = new Map<string, number>();
  ipWindows = new Map<string, number>();
  emailOwners = new Map<string, string>();
  guestSequence = 0;
  async issue(email: string, digest: string, now: Date, expiresAt: Date) {
    if ((this.codes.get(email)?.issuedAt.getTime() ?? -Infinity) > now.getTime() - 60_000) return false;
    this.codes.set(email, { digest, attempts: 0, expiresAt, issuedAt: now }); return true;
  }
  async issueIpLimit(ip: string, now: Date) {
    const started = this.ipWindows.get(ip);
    let count = this.ipCounts.get(ip) ?? 0;
    if (started === undefined || now.getTime() - started > 3_600_000) { this.ipWindows.set(ip, now.getTime()); count = 0; }
    if (count >= 60) return false;
    this.ipCounts.set(ip, count + 1); return true;
  }
  async refundIssue(email: string, ip: string | null, now: Date) {
    const code = this.codes.get(email); if (code) code.issuedAt = new Date(0);
    if (ip) this.ipCounts.set(ip, Math.max((this.ipCounts.get(ip) ?? 1) - 1, 0));
  }
  guestCodes = new Map<string, { started: number; count: number }>();
  private guestBucket(key: string, now: Date) {
    const current = this.guestCodes.get(key);
    if (!current || now.getTime() - current.started >= 3_600_000) return { started: now.getTime(), count: 0 };
    return current;
  }
  async issueGuestLimit(ownerId: string, now: Date) {
    const owner = this.guestBucket(`owner:${ownerId}`, now); const pool = this.guestBucket('pool', now);
    if (owner.count >= GUEST_CODE_OWNER_HOURLY || pool.count >= GUEST_CODE_POOL_HOURLY) return false;
    this.guestCodes.set(`owner:${ownerId}`, { ...owner, count: owner.count + 1 });
    this.guestCodes.set('pool', { ...pool, count: pool.count + 1 }); return true;
  }
  async refundGuestLimit(ownerId: string) {
    for (const key of [`owner:${ownerId}`, 'pool']) { const value = this.guestCodes.get(key); if (value) value.count = Math.max(value.count - 1, 0); }
  }
  async invalidate(email: string, digest: string) { const code = this.codes.get(email); if (code?.digest === digest) code.digest = null; }
  async consume(email: string, digest: string, hash: string, now: Date, expiresAt: Date) {
    const code = this.codes.get(email); if (!code?.digest || code.attempts >= 5 || code.expiresAt <= now) return null;
    code.attempts++; if (code.digest !== digest) return null;
    code.digest = null; const ownerId = this.emailOwners.get(email) ?? `owner-${email}`; this.emailOwners.set(email, ownerId);
    const session = { kind: 'email' as const, ownerId, email, expiresAt };
    this.sessions.set(hash, session); return session;
  }
  async createGuest(hash: string, _now: Date, expiresAt: Date, ip: string) {
    const count = this.ipCounts.get(`guest:${ip}`) ?? 0;
    if (count >= 3) return null;
    this.ipCounts.set(`guest:${ip}`, count + 1);
    const session = { kind: 'guest' as const, ownerId: `guest-${++this.guestSequence}`, expiresAt };
    this.sessions.set(hash, session); return session;
  }
  async upgradeGuest(ownerId: string, hash: string, email: string, digest: string, now: Date) {
    const code = this.codes.get(email);
    if (!code?.digest || code.attempts >= 5 || code.expiresAt <= now) return { status: 'invalid_code' as const };
    code.attempts++;
    if (code.digest !== digest) return { status: 'invalid_code' as const };
    const session = this.sessions.get(hash);
    if (!session || session.kind !== 'guest' || session.ownerId !== ownerId || this.emailOwners.has(email)) {
      code.digest = null; return { status: 'unavailable' as const };
    }
    code.digest = null; this.emailOwners.set(email, ownerId);
    const upgraded = { kind: 'email' as const, ownerId, email, expiresAt: session.expiresAt };
    this.sessions.set(hash, upgraded);
    return { status: 'upgraded' as const, session: upgraded };
  }
  async resolve(hash: string, now: Date) { const value = this.sessions.get(hash); return value && value.expiresAt > now ? value : null; }
  async rotate(hash: string, next: string, now: Date, expiresAt: Date) {
    const value = await this.resolve(hash, now); if (!value) return null; this.sessions.delete(hash);
    const session = { ...value, expiresAt }; this.sessions.set(next, session); return session;
  }
  async revoke(hash: string) { this.sessions.delete(hash); }
}
function fixture() {
  const repository = new TestAuthRepository(); const sent = new Map<string, string>(); let now = new Date('2026-10-01T00:00:00Z');
  const service = new EmailAuthService(repository, async (email, code) => { sent.set(email, code); }, 'x'.repeat(32), () => now);
  return { repository, sent, service, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}
describe('email auth lifecycle', () => {
  it('stores no plaintext code or token, consumes once, rotates and logs out', async () => {
    const f = fixture(); await f.service.requestCode('A@example.invalid');
    const code = f.sent.get('a@example.invalid')!;
    expect(f.repository.codes.get('a@example.invalid')?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(f.repository.codes.get('a@example.invalid')?.digest).not.toBe(code);
    const result = (await f.service.verify('a@example.invalid', code))!;
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.repository.sessions.has(hashToken(result.token))).toBe(true);
    expect(await f.service.verify('a@example.invalid', code)).toBeNull();
    const next = (await f.service.refresh(result.token))!;
    expect(await f.service.resolve(result.token)).toBeNull();
    expect(await f.service.resolve(next.token)).toMatchObject({ email: 'a@example.invalid' });
    await f.service.logout(next.token); expect(await f.service.resolve(next.token)).toBeNull();
  });
  it('rejects expired challenges/sessions and stops after five incorrect attempts', async () => {
    const f = fixture(); await f.service.requestCode('a@example.invalid');
    const code = f.sent.get('a@example.invalid')!; const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect(await f.service.verify('a@example.invalid', wrong)).toBeNull();
    expect(await f.service.verify('a@example.invalid', code)).toBeNull();
    f.advance(60_000); await f.service.requestCode('a@example.invalid'); f.advance(600_000);
    expect(await f.service.verify('a@example.invalid', f.sent.get('a@example.invalid'))).toBeNull();
    await f.service.requestCode('b@example.invalid'); const result = (await f.service.verify('b@example.invalid', f.sent.get('b@example.invalid')))!;
    f.advance(7 * 86_400_000); expect(await f.service.resolve(result.token)).toBeNull(); expect(await f.service.refresh(result.token)).toBeNull();
  });
  it('limits resending and invalidates a code if email delivery fails', async () => {
    const f = fixture(); expect(await f.service.requestCode('a@example.invalid')).toBe('sent');
    expect(await f.service.requestCode('a@example.invalid')).toBe('limited');
    const service = new EmailAuthService(f.repository, async () => { throw new Error('secret smtp failure'); }, 'x'.repeat(32));
    await expect(service.requestCode('b@example.invalid')).rejects.toThrow('MAIL_UNAVAILABLE');
    expect(f.repository.codes.get('b@example.invalid')?.digest).toBeNull();
  });
  it('applies a per-IP hourly mail budget and refunds it when delivery fails', async () => {
    const repository = new TestAuthRepository(); let nowMs = Date.parse('2026-10-01T00:00:00Z');
    const service = new EmailAuthService(repository, async () => {}, 'x'.repeat(32), () => new Date(nowMs));
    for (let i = 0; i < 60; i++) expect(await service.requestCode(`u${i}@example.invalid`, '203.0.113.7')).toBe('sent');
    expect(await service.requestCode('overflow@example.invalid', '203.0.113.7')).toBe('limited');
    expect(await service.requestCode('other-ip@example.invalid', '198.51.100.9')).toBe('sent');
    const failing = new EmailAuthService(repository, async () => { throw new Error('down'); }, 'x'.repeat(32), () => new Date(nowMs));
    await expect(failing.requestCode('refund@example.invalid', '203.0.113.8')).rejects.toThrow('MAIL_UNAVAILABLE');
    expect(repository.ipCounts.get('203.0.113.8')).toBe(0);
    expect(await service.requestCode('after-refund@example.invalid', '203.0.113.8')).toBe('sent');
    expect(await service.requestCode('still-limited@example.invalid', '203.0.113.7')).toBe('limited');
    nowMs += 3_600_001;
    expect(await service.requestCode('next-hour@example.invalid', '203.0.113.7')).toBe('sent');
  });
  it('requires strong secrets and rejects address/header injection', () => {
    expect(() => new EmailAuthService(new TestAuthRepository(), async () => {}, 'short')).toThrow();
    for (const value of [null, '', 'a@example.invalid\r\nBcc:x@y.invalid', 'a@b', 'a'.repeat(255)]) expect(() => normalizeEmail(value)).toThrow();
  });
});
describe('guest account lifecycle', () => {
  it('creates opaque seven-day guest sessions without email or OTP records and rate limits new identities', async () => {
    const f = fixture();
    const first = (await f.service.createGuest('203.0.113.4'))!;
    expect(first.session.kind).toBe('guest'); expect('email' in first.session).toBe(false);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.session.expiresAt.getTime() - Date.parse('2026-10-01T00:00:00Z')).toBe(7 * 86_400_000);
    expect(f.repository.codes.size).toBe(0);
    expect(await f.service.resolve(first.token)).toMatchObject({ kind: 'guest', ownerId: first.session.ownerId });
    expect(await f.service.createGuest('203.0.113.4')).not.toBeNull();
    expect(await f.service.createGuest('203.0.113.4')).not.toBeNull();
    expect(await f.service.createGuest('203.0.113.4')).toBeNull();
  });
  it('requires an authenticated guest session plus a valid mailbox code and preserves the same owner on upgrade', async () => {
    const f = fixture(); const guest = (await f.service.createGuest('198.51.100.8'))!;
    await f.service.requestCode('upgrade@example.invalid'); const code = f.sent.get('upgrade@example.invalid')!;
    expect(await f.service.upgradeGuest(guest.session.ownerId, guest.token, 'upgrade@example.invalid', code, 'wrong'))
      .toEqual({ status: 'unavailable' });
    expect(await f.service.upgradeGuest(guest.session.ownerId, guest.token, 'upgrade@example.invalid', code, 'UPGRADE_GUEST_TO_EMAIL'))
      .toMatchObject({ status: 'upgraded', session: { kind: 'email', ownerId: guest.session.ownerId, email: 'upgrade@example.invalid' } });
    expect(await f.service.resolve(guest.token)).toMatchObject({ kind: 'email', ownerId: guest.session.ownerId });
  });
  it('does not transfer a guest to an email already bound to another account', async () => {
    const f = fixture(); await f.service.requestCode('taken@example.invalid');
    const existing = (await f.service.verify('taken@example.invalid', f.sent.get('taken@example.invalid')))!;
    f.advance(60_000); const guest = (await f.service.createGuest('192.0.2.9'))!;
    await f.service.requestCode('taken@example.invalid'); const code = f.sent.get('taken@example.invalid')!;
    expect(await f.service.upgradeGuest(guest.session.ownerId, guest.token, 'taken@example.invalid', code, 'UPGRADE_GUEST_TO_EMAIL'))
      .toEqual({ status: 'unavailable' });
    expect(guest.session.ownerId).not.toBe(existing.session.ownerId);
    expect(await f.service.resolve(guest.token)).toMatchObject({ kind: 'guest', ownerId: guest.session.ownerId });
    expect(await f.service.resolve(existing.token)).toMatchObject({ kind: 'email', ownerId: existing.session.ownerId });
  });
});
describe('same-origin auth routes', () => {
  it('enforces origin, opaque HttpOnly secure cookie, refresh and account separation', async () => {
    const f = fixture(); const origin = 'https://game.example.invalid'; const app = createApp(undefined, undefined, { service: f.service, origin });
    const post = (path: string, body: unknown, cookie?: string) => app.request(path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    expect((await app.request('/api/auth/code', { method: 'POST', headers: { origin: 'https://evil.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@example.invalid' }) })).status).toBe(403);
    expect(f.sent.size).toBe(0);
    const cookies: string[] = [];
    for (const email of ['a@example.invalid', 'b@example.invalid']) {
      expect((await post('/api/auth/code', { email })).status).toBe(202);
      const response = await post('/api/auth/verify', { email, code: f.sent.get(email) });
      expect(response.status).toBe(200); const cookie = response.headers.get('set-cookie')!;
      expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict'); expect(cookie).toContain('Secure');
      const json = await response.json(); expect(json.token).toBeUndefined(); expect(json.account.id).toBe(`owner-${email}`);
      cookies.push(cookie.split(';')[0]!);
    }
    const a = await app.request('/api/auth/session', { headers: { cookie: cookies[0]! } });
    expect((await a.json()).account.email).toBe('a@example.invalid'); expect(a.headers.get('cache-control')).toBe('no-store');
    expect((await app.request('/api/auth/session', { headers: { cookie: `${cookies[0]}; ${cookies[1]}` } })).status).toBe(401);
    expect((await app.request('/api/auth/logout', { method: 'POST', headers: { origin, cookie: cookies[1]!, 'x-jiuxiao-account': 'owner-a@example.invalid' } })).status).toBe(401);
    expect((await app.request('/api/auth/session', { headers: { cookie: cookies[1]! } })).status).toBe(200);
    const refreshed = await post('/api/auth/refresh', {}, cookies[0]); expect(refreshed.status).toBe(200);
    expect((await app.request('/api/auth/session', { headers: { cookie: cookies[0]! } })).status).toBe(401);
    const nextCookie = refreshed.headers.get('set-cookie')!.split(';')[0]!;
    expect((await post('/api/auth/logout', {}, nextCookie)).status).toBe(200);
    expect((await app.request('/api/auth/session', { headers: { cookie: nextCookie } })).status).toBe(401);
    expect((await app.request('/api/auth/session', { headers: { cookie: cookies[1]! } })).status).toBe(200);
    const guestResponse = await post('/api/auth/guest', {});
    expect(guestResponse.status).toBe(201);
    const guestPayload = await guestResponse.json();
    expect(guestPayload.account).toMatchObject({ kind: 'guest' });
    expect('email' in guestPayload.account).toBe(false);
    const guestCookie = guestResponse.headers.get('set-cookie')!.split(';')[0]!;
    expect(guestResponse.headers.get('set-cookie')).toContain('HttpOnly');
    expect(guestResponse.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(guestResponse.headers.get('set-cookie')).toContain('Secure');
    expect(guestResponse.headers.get('set-cookie')).toContain(`Max-Age=${SESSION_SECONDS}`);
    const repeated = await post('/api/auth/guest', {}, guestCookie);
    expect(repeated.status).toBe(200); expect((await repeated.json()).account.id).toBe(guestPayload.account.id);
    expect(repeated.headers.get('set-cookie')).toBeNull();
    expect((await post('/api/auth/guest', {}, cookies[1])).status).toBe(409);
    expect((await app.request('/api/auth/session', { headers: { cookie: cookies[1]! } })).status).toBe(200);
    const refreshGuest = await post('/api/auth/refresh', {}, guestCookie);
    expect(refreshGuest.status).toBe(200); expect((await refreshGuest.json()).account).toMatchObject({ kind: 'guest' });
    const rotatedGuestCookie = refreshGuest.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request('/api/auth/session', { headers: { cookie: guestCookie } })).status).toBe(401);
    expect((await post('/api/auth/logout', {}, rotatedGuestCookie)).status).toBe(200);
    expect((await app.request('/api/auth/session', { headers: { cookie: rotatedGuestCookie } })).status).toBe(401);
    const upgradeGuestResponse = await post('/api/auth/guest', {});
    const upgradeGuestCookie = upgradeGuestResponse.headers.get('set-cookie')!.split(';')[0]!;
    const upgradeEmail = 'route-upgrade@example.invalid';
    expect((await post('/api/auth/code', { email: upgradeEmail })).status).toBe(202);
    const upgradeResponse = await post('/api/auth/guest/upgrade', { email: upgradeEmail, code: f.sent.get(upgradeEmail), confirmation: 'UPGRADE_GUEST_TO_EMAIL' }, upgradeGuestCookie);
    expect(upgradeResponse.status).toBe(200);
    expect((await upgradeResponse.json()).account).toMatchObject({ id: (await upgradeGuestResponse.json()).account.id, email: upgradeEmail });
    expect((await app.request('/api/auth/session', { headers: { cookie: upgradeGuestCookie } })).status).toBe(200);
  });
  it('bounds request size and never returns mail transport errors', async () => {
    const repo = new TestAuthRepository(); const service = new EmailAuthService(repo, async () => { throw new Error('smtp-key-secret'); }, 'x'.repeat(32));
    const app = createApp(undefined, undefined, { service, origin: 'http://127.0.0.1:5173' });
    const headers = { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' };
    expect((await app.request('/api/auth/code', { method: 'POST', headers, body: 'x'.repeat(4097) })).status).toBe(400);
    const response = await app.request('/api/auth/code', { method: 'POST', headers, body: JSON.stringify({ email: 'a@example.invalid' }) });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('smtp-key-secret');
  });
});

describe('anonymous email challenge turnstile gate', () => {
  const origin = 'https://game.example.invalid';
  const post = (app: ReturnType<typeof createApp>, body: unknown, cookie?: string) => app.request('/api/auth/code', {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

  it('keeps the previous behaviour when no verifier is configured and advertises emailCaptcha accordingly', async () => {
    const f = fixture();
    const app = createApp(undefined, undefined, { service: f.service, origin });
    expect((await post(app, { email: 'a@example.invalid' })).status).toBe(202);
    const providers = await (await app.request('/api/auth/providers')).json();
    expect(providers.emailCaptcha).toBe(false);
  });

  it('refuses anonymous requests without a valid token when the verifier is enabled', async () => {
    const f = fixture();
    const checked: unknown[] = [];
    const emailCaptcha = async (token: unknown) => {
      checked.push(token);
      if (token !== 'good-token') throw new AuthFailure(token === null ? 'CAPTCHA_REQUIRED' : 'CAPTCHA_INVALID', 'captcha_verify');
    };
    const app = createApp(undefined, undefined, { service: f.service, origin, emailCaptcha });
    const providers = await (await app.request('/api/auth/providers')).json();
    expect(providers.emailCaptcha).toBe(true);

    const missing = await post(app, { email: 'a@example.invalid' });
    expect(missing.status).toBe(403); expect((await missing.json()).code).toBe('CAPTCHA_REQUIRED');
    const invalid = await post(app, { email: 'a@example.invalid', captchaToken: 'bad-token' });
    expect(invalid.status).toBe(403); expect((await invalid.json()).code).toBe('CAPTCHA_INVALID');
    expect(f.sent.size).toBe(0); // No challenge was issued for refused requests.

    expect((await post(app, { email: 'a@example.invalid', captchaToken: 'good-token' })).status).toBe(202);
    expect(checked).toEqual([null, 'bad-token', 'good-token']);
  });

  it('does not let a guest session skip Turnstile', async () => {
    const f = fixture();
    const checked: unknown[] = [];
    const emailCaptcha = async (token: unknown) => {
      checked.push(token);
      if (token !== 'good-token') throw new AuthFailure(token === null ? 'CAPTCHA_REQUIRED' : 'CAPTCHA_INVALID', 'captcha_verify');
    };
    const app = createApp(undefined, undefined, { service: f.service, origin, emailCaptcha });
    const guestResponse = await app.request('/api/auth/guest', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    expect(guestResponse.status).toBe(201);
    const guestCookie = guestResponse.headers.get('set-cookie')!.split(';')[0]!;

    const missing = await post(app, { email: 'victim@example.invalid' }, guestCookie);
    expect(missing.status).toBe(403); expect((await missing.json()).code).toBe('CAPTCHA_REQUIRED');
    const invalid = await post(app, { email: 'victim@example.invalid', captchaToken: 'bad-token' }, guestCookie);
    expect(invalid.status).toBe(403); expect((await invalid.json()).code).toBe('CAPTCHA_INVALID');
    expect(f.sent.size).toBe(0);
    expect(f.repository.guestCodes.size).toBe(0); // Refused requests never reach the mail budget.

    // The guest-upgrade flow still works once the widget token is supplied.
    expect((await post(app, { email: 'upgrade@example.invalid', captchaToken: 'good-token' }, guestCookie)).status).toBe(202);
    expect(checked).toEqual([null, 'bad-token', 'good-token']);
    const upgraded = await app.request('/api/auth/guest/upgrade', { method: 'POST', headers: { origin, cookie: guestCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'upgrade@example.invalid', code: f.sent.get('upgrade@example.invalid'), confirmation: 'UPGRADE_GUEST_TO_EMAIL' }) });
    expect(upgraded.status).toBe(200);
  });

  it('skips Turnstile only for a full account confirming its own mailbox', async () => {
    const f = fixture();
    const checked: unknown[] = [];
    const emailCaptcha = async (token: unknown) => {
      checked.push(token);
      if (token !== 'good-token') throw new AuthFailure('CAPTCHA_REQUIRED', 'captcha_verify');
    };
    const app = createApp(undefined, undefined, { service: f.service, origin, emailCaptcha });
    expect((await post(app, { email: 'owner@example.invalid', captchaToken: 'good-token' })).status).toBe(202);
    const login = await app.request('/api/auth/verify', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.invalid', code: f.sent.get('owner@example.invalid') }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    f.advance(60_000); checked.length = 0;

    // Unlink confirmation: own mailbox (case/whitespace-insensitive) needs no widget.
    expect((await post(app, { email: ' Owner@Example.invalid ' }, cookie)).status).toBe(202);
    expect(checked).toEqual([]);
    // Any other recipient from the same account session is gated like an anonymous request.
    const other = await post(app, { email: 'someone-else@example.invalid' }, cookie);
    expect(other.status).toBe(403); expect((await other.json()).code).toBe('CAPTCHA_REQUIRED');
    expect(f.sent.has('someone-else@example.invalid')).toBe(false);
    expect((await post(app, { email: 'someone-else@example.invalid', captchaToken: 'good-token' }, cookie)).status).toBe(202);
    expect(f.repository.guestCodes.size).toBe(0); // Account sessions are not charged to the guest sub-quota.
  });

  it('caps guest-originated codes per guest and keeps guest traffic inside its sub-pool', async () => {
    const f = fixture();
    const app = createApp(undefined, undefined, { service: f.service, origin, emailCaptcha: async () => {} });
    const guestCookie = (await app.request('/api/auth/guest', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' }))
      .headers.get('set-cookie')!.split(';')[0]!;
    for (let i = 0; i < GUEST_CODE_OWNER_HOURLY; i++) {
      expect((await post(app, { email: `target-${i}@example.invalid`, captchaToken: 'good-token' }, guestCookie)).status).toBe(202);
    }
    const over = await post(app, { email: 'target-over@example.invalid', captchaToken: 'good-token' }, guestCookie);
    expect(over.status).toBe(429); expect((await over.json()).code).toBe('RATE_LIMITED');
    expect(f.sent.size).toBe(GUEST_CODE_OWNER_HOURLY);
    // Refreshing the guest cookie does not reset the owner's budget.
    const refreshed = await app.request('/api/auth/refresh', { method: 'POST', headers: { origin, cookie: guestCookie } });
    const nextCookie = refreshed.headers.get('set-cookie')!.split(';')[0]!;
    expect((await post(app, { email: 'target-rotated@example.invalid', captchaToken: 'good-token' }, nextCookie)).status).toBe(429);
    // Anonymous login is unaffected.
    expect((await post(app, { email: 'anonymous@example.invalid', captchaToken: 'good-token' })).status).toBe(202);
    f.advance(3_600_000);
    expect((await post(app, { email: 'target-next-hour@example.invalid', captchaToken: 'good-token' }, nextCookie)).status).toBe(202);

    // The shared guest sub-pool stops guests well before the global budget.
    const pooled = fixture();
    let sent = 0;
    for (let owner = 0; sent < GUEST_CODE_POOL_HOURLY; owner++) {
      for (let i = 0; i < GUEST_CODE_OWNER_HOURLY && sent < GUEST_CODE_POOL_HOURLY; i++, sent++) {
        expect(await pooled.service.requestCode(`pool-${owner}-${i}@example.invalid`, null, { guestOwnerId: `guest-pool-${owner}` })).toBe('sent');
      }
    }
    expect(await pooled.service.requestCode('pool-fresh@example.invalid', null, { guestOwnerId: 'guest-pool-fresh' })).toBe('limited');
    expect(pooled.sent.has('pool-fresh@example.invalid')).toBe(false);
    expect(await pooled.service.requestCode('login@example.invalid', null)).toBe('sent');
  });

  it('returns the guest reservation when the challenge is not issued or the mail fails', async () => {
    const f = fixture();
    expect(await f.service.requestCode('same@example.invalid', null, { guestOwnerId: 'guest-refund' })).toBe('sent');
    // Per-email one-minute cooldown refuses the challenge; the guest is not charged for it.
    expect(await f.service.requestCode('same@example.invalid', null, { guestOwnerId: 'guest-refund' })).toBe('limited');
    expect(f.repository.guestCodes.get('owner:guest-refund')!.count).toBe(1);
    const failing = new EmailAuthService(f.repository, async () => { throw new Error('smtp down'); }, 'x'.repeat(32), () => new Date('2026-10-01T00:00:00Z'));
    await expect(failing.requestCode('fail@example.invalid', null, { guestOwnerId: 'guest-refund' })).rejects.toThrow('MAIL_UNAVAILABLE');
    expect(f.repository.guestCodes.get('owner:guest-refund')!.count).toBe(1);
    expect(f.repository.guestCodes.get('pool')!.count).toBe(1);
  });

  it('fails closed with CAPTCHA_UNAVAILABLE when the verification service is unreachable', async () => {
    const f = fixture();
    const app = createApp(undefined, undefined, { service: f.service, origin, emailCaptcha: async () => { throw new AuthFailure('CAPTCHA_UNAVAILABLE', 'captcha_verify'); } });
    const response = await post(app, { email: 'a@example.invalid', captchaToken: 'whatever' });
    expect(response.status).toBe(403); expect((await response.json()).code).toBe('CAPTCHA_UNAVAILABLE');
    expect(f.sent.size).toBe(0);
  });

  it('rejects unknown body keys on the challenge endpoint', async () => {
    const f = fixture();
    const app = createApp(undefined, undefined, { service: f.service, origin });
    expect((await post(app, { email: 'a@example.invalid', extra: 1 })).status).toBe(400);
  });
});
