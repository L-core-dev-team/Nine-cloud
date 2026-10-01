import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createEmailAuthRuntime } from './auth-runtime.js';
describe('auth deployment configuration', () => {
  const pool = new Pool();
  const base = { AUTH_ENABLED: 'true', AUTH_PUBLIC_ORIGIN: 'https://game.example.invalid', AUTH_SECRET: 'x'.repeat(32), AUTH_MAIL_FROM: 'login@example.invalid', SMTP_URL: 'smtps://user:secret@example.invalid' };
  it('disabled configuration does not construct an auth runtime', () => { expect(createEmailAuthRuntime(pool, {})).toBeUndefined(); });
  it('invalid transport input never exposes the credentials in its exception', () => {
    let error: unknown;
    try { createEmailAuthRuntime(pool, { ...base, SMTP_URL: 'secret-private-invalid-url' }); } catch (value) { error = value; }
    expect(error).toBeInstanceOf(Error); expect(JSON.stringify(error)).not.toContain('secret-private'); expect((error as Error).message).toBe('Invalid SMTP_URL');
  });
  it('rejects non-HTTPS origins, weak secrets and unexpected transport schemes', () => {
    expect(() => createEmailAuthRuntime(pool, { ...base, AUTH_PUBLIC_ORIGIN: 'http://game.example.invalid' })).toThrow('Invalid AUTH_PUBLIC_ORIGIN');
    expect(() => createEmailAuthRuntime(pool, { ...base, AUTH_SECRET: 'short' })).toThrow('AUTH_SECRET');
    expect(() => createEmailAuthRuntime(pool, { ...base, SMTP_URL: 'https://example.invalid' })).toThrow('SMTP_URL must use SMTP');
  });
});
