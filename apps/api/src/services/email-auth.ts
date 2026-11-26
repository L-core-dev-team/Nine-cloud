import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { AuthFailure } from './auth-failure.js';

export type EmailAuthSession = { kind: 'email'; ownerId: string; email: string; expiresAt: Date };
export type GuestAuthSession = { kind: 'guest'; ownerId: string; expiresAt: Date };
export type AuthSession = EmailAuthSession | GuestAuthSession;
export type GuestUpgradeResult = { status: 'upgraded'; session: EmailAuthSession } | { status: 'invalid_code' | 'unavailable' };
export interface EmailAuthRepository {
  issue(email: string, digest: string, now: Date, expiresAt: Date): Promise<boolean>;
  issueIpLimit(ip: string, now: Date): Promise<boolean>;
  refundIssue(email: string, ip: string | null, now: Date): Promise<void>;
  /** Reserve one guest-originated code: per guest owner and against the shared guest sub-pool, atomically. */
  issueGuestLimit(ownerId: string, now: Date): Promise<boolean>;
  /** Return a guest reservation whose challenge was not issued or whose mail was not delivered. */
  refundGuestLimit(ownerId: string, now: Date): Promise<void>;
  invalidate(email: string, digest: string): Promise<void>;
  consume(email: string, digest: string, tokenHash: string, now: Date, expiresAt: Date, restore?: boolean): Promise<EmailAuthSession | null>;
  createGuest(tokenHash: string, now: Date, expiresAt: Date, clientIp: string): Promise<GuestAuthSession | null>;
  upgradeGuest(ownerId: string, tokenHash: string, email: string, digest: string, now: Date): Promise<GuestUpgradeResult>;
  resolve(tokenHash: string, now: Date): Promise<AuthSession | null>;
  rotate(tokenHash: string, nextHash: string, now: Date, expiresAt: Date): Promise<AuthSession | null>;
  revoke(tokenHash: string): Promise<void>;
}
export type AuthMailSender = (email: string, code: string) => Promise<void>;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
/** Codes one guest owner may request per hour (guest upgrade to an email address). */
export const GUEST_CODE_OWNER_HOURLY = 3;
/** All guests together may consume at most this share of the 600/hour global mail budget. */
export const GUEST_CODE_POOL_HOURLY = 120;
/** A code requested from inside a guest session is charged to that guest's sub-quota. */
export type RequestCodeOptions = { guestOwnerId?: string };
export class EmailAuthService {
  constructor(private readonly repository: EmailAuthRepository, private readonly send: AuthMailSender,
    private readonly secret: string, private readonly now = () => new Date()) {
    if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET requires at least 32 bytes');
  }
  async requestCode(emailValue: unknown, clientIp?: string | null, options: RequestCodeOptions = {}): Promise<'sent' | 'limited'> {
    const email = normalizeEmail(emailValue);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const digest = this.codeDigest(email, code);
    const now = this.now();
    const guestOwnerId = options.guestOwnerId;
    if (clientIp) {
      try { if (!await this.repository.issueIpLimit(clientIp, now)) return 'limited'; }
      catch { throw new AuthFailure('VERIFICATION_STORE_FAILED', 'verification_store'); }
    }
    if (guestOwnerId !== undefined && !await this.reserveGuestCode(guestOwnerId)) return 'limited';
    let issued: boolean;
    try { issued = await this.repository.issue(email, digest, now, new Date(now.getTime() + 600_000)); }
    catch {
      if (guestOwnerId !== undefined) await this.releaseGuestCode(guestOwnerId);
      throw new AuthFailure('VERIFICATION_STORE_FAILED','verification_store');
    }
    if (!issued) {
      if (guestOwnerId !== undefined) await this.releaseGuestCode(guestOwnerId);
      return 'limited';
    }
    try { await this.send(email, code); }
    catch (error) {
      try {
        await this.repository.invalidate(email, digest); await this.repository.refundIssue(email, clientIp ?? null, this.now());
        if (guestOwnerId !== undefined) await this.repository.refundGuestLimit(guestOwnerId, this.now());
      }
      catch { throw new AuthFailure('VERIFICATION_STORE_FAILED','verification_store'); }
      throw error instanceof AuthFailure?error:new AuthFailure('MAIL_UNAVAILABLE','mail_send');
    }
    return 'sent';
  }
  /** Charges one guest-originated code to the guest owner and the shared guest sub-pool. Fails closed. */
  async reserveGuestCode(ownerId: string): Promise<boolean> {
    if (!ownerId) return false;
    try { return await this.repository.issueGuestLimit(ownerId, this.now()); }
    catch { throw new AuthFailure('VERIFICATION_STORE_FAILED', 'verification_store'); }
  }
  /** Returns a guest reservation after the code was not issued or not delivered. */
  async releaseGuestCode(ownerId: string): Promise<void> {
    try { await this.repository.refundGuestLimit(ownerId, this.now()); }
    catch { throw new AuthFailure('VERIFICATION_STORE_FAILED', 'verification_store'); }
  }
  async verify(emailValue: unknown, code: unknown, restore=false): Promise<{ session: EmailAuthSession; token: string } | null> {
    const email = normalizeEmail(emailValue);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const now = this.now(); const token = randomBytes(32).toString('base64url');
    let session: EmailAuthSession | null;
    try { session = await this.repository.consume(email, this.codeDigest(email, code), hashToken(token), now,
      new Date(now.getTime() + SESSION_SECONDS * 1000),restore); }
    catch { throw new AuthFailure('VERIFICATION_STORE_FAILED','verification_store'); }
    return session ? { session, token } : null;
  }
  async createGuest(clientIp: string): Promise<{ session: GuestAuthSession; token: string } | null> {
    const now = this.now(); const token = randomBytes(32).toString('base64url');
    try {
      const session = await this.repository.createGuest(hashToken(token), now,
        new Date(now.getTime() + SESSION_SECONDS * 1000), clientIp);
      return session ? { session, token } : null;
    } catch { throw new AuthFailure('GUEST_STORE_FAILED', 'verification_store'); }
  }
  async upgradeGuest(ownerId: string, tokenValue: string | null, emailValue: unknown, code: unknown, confirmation: unknown): Promise<GuestUpgradeResult> {
    if (!ownerId || !validToken(tokenValue) || confirmation !== 'UPGRADE_GUEST_TO_EMAIL' || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return { status: 'unavailable' };
    }
    const email = normalizeEmail(emailValue); const now = this.now();
    try {
      return await this.repository.upgradeGuest(ownerId, hashToken(tokenValue), email, this.codeDigest(email, code), now);
    } catch (error) {
      if (error instanceof AuthFailure) throw error;
      throw new AuthFailure('UPGRADE_STORE_FAILED', 'verification_store');
    }
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
