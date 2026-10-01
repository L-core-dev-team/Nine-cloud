import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

export type AuthSession = { ownerId: string; email: string; expiresAt: Date };
export interface EmailAuthRepository {
  issue(email: string, digest: string, now: Date, expiresAt: Date): Promise<boolean>;
  invalidate(email: string, digest: string): Promise<void>;
  consume(email: string, digest: string, tokenHash: string, now: Date, expiresAt: Date): Promise<AuthSession | null>;
  resolve(tokenHash: string, now: Date): Promise<AuthSession | null>;
  rotate(tokenHash: string, nextHash: string, now: Date, expiresAt: Date): Promise<AuthSession | null>;
  revoke(tokenHash: string): Promise<void>;
}
export type AuthMailSender = (email: string, code: string) => Promise<void>;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export class EmailAuthService {
  constructor(private readonly repository: EmailAuthRepository, private readonly send: AuthMailSender,
    private readonly secret: string, private readonly now = () => new Date()) {
    if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET requires at least 32 bytes');
  }
  async requestCode(emailValue: unknown): Promise<'sent' | 'limited'> {
    const email = normalizeEmail(emailValue);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const digest = this.codeDigest(email, code);
    const now = this.now();
    if (!await this.repository.issue(email, digest, now, new Date(now.getTime() + 600_000))) return 'limited';
    try { await this.send(email, code); }
    catch { await this.repository.invalidate(email, digest); throw new Error('MAIL_UNAVAILABLE'); }
    return 'sent';
  }
  async verify(emailValue: unknown, code: unknown): Promise<{ session: AuthSession; token: string } | null> {
    const email = normalizeEmail(emailValue);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const now = this.now(); const token = randomBytes(32).toString('base64url');
    const session = await this.repository.consume(email, this.codeDigest(email, code), hashToken(token), now,
      new Date(now.getTime() + SESSION_SECONDS * 1000));
    return session ? { session, token } : null;
  }
  async resolve(token: string | null): Promise<AuthSession | null> {
    return validToken(token) ? this.repository.resolve(hashToken(token), this.now()) : null;
  }
  async refresh(token: string | null): Promise<{ session: AuthSession; token: string } | null> {
    if (!validToken(token)) return null;
    const next = randomBytes(32).toString('base64url'); const now = this.now();
    const session = await this.repository.rotate(hashToken(token), hashToken(next), now, new Date(now.getTime() + SESSION_SECONDS * 1000));
    return session ? { session, token: next } : null;
  }
  async logout(token: string | null): Promise<void> { if (validToken(token)) await this.repository.revoke(hashToken(token)); }
  private codeDigest(email: string, code: string): string {
    return createHmac('sha256', this.secret).update(`${email}\0${code}`).digest('hex');
  }
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('INVALID_EMAIL');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)) throw new TypeError('INVALID_EMAIL');
  return email;
}
function validToken(value: string | null): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value); }
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
