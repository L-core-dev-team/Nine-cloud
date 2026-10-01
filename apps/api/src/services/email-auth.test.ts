import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { EmailAuthService, hashToken, normalizeEmail, type AuthSession, type EmailAuthRepository } from './email-auth.js';

class TestAuthRepository implements EmailAuthRepository {
  codes = new Map<string, { digest: string | null; attempts: number; expiresAt: Date; issuedAt: Date }>();
  sessions = new Map<string, AuthSession>();
  async issue(email: string, digest: string, now: Date, expiresAt: Date) {
    if ((this.codes.get(email)?.issuedAt.getTime() ?? -Infinity) > now.getTime() - 60_000) return false;
    this.codes.set(email, { digest, attempts: 0, expiresAt, issuedAt: now }); return true;
  }
  async invalidate(email: string, digest: string) { const code = this.codes.get(email); if (code?.digest === digest) code.digest = null; }
  async consume(email: string, digest: string, hash: string, now: Date, expiresAt: Date) {
    const code = this.codes.get(email); if (!code?.digest || code.attempts >= 5 || code.expiresAt <= now) return null;
    code.attempts++; if (code.digest !== digest) return null;
    code.digest = null; const session = { ownerId: `owner-${email}`, email, expiresAt };
    this.sessions.set(hash, session); return session;
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
  it('requires strong secrets and rejects address/header injection', () => {
    expect(() => new EmailAuthService(new TestAuthRepository(), async () => {}, 'short')).toThrow();
    for (const value of [null, '', 'a@example.invalid\r\nBcc:x@y.invalid', 'a@b', 'a'.repeat(255)]) expect(() => normalizeEmail(value)).toThrow();
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
