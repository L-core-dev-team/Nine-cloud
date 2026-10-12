import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthSession, EmailAuthSession, EmailAuthService, GuestUpgradeResult } from './email-auth.js';
import { normalizeEmail, hashToken, SESSION_SECONDS } from './email-auth.js';
import { AuthFailure } from './auth-failure.js';

type IdentityKind = 'email' | 'phone';
type SupabaseUser = {
  id?: unknown; email?: unknown; email_confirmed_at?: unknown;
  phone?: unknown; phone_confirmed_at?: unknown; identities?: unknown;
};
type VerifiedAuthResponse = { user?: SupabaseUser; access_token?: unknown; refresh_token?: unknown };

export type SupabaseAuthConfig = {
  url: string; publishableKey: string; adminKey: string; enabledEmail: boolean; enabledPhone: boolean;
  phoneHookConfigured: boolean; phoneCaptchaConfigured: boolean; allowedPhonePrefixes: readonly string[];
  phoneBudgetCents: number; phoneMonthlySegments: number;
  phoneIpHourlyLimit: number; phoneIpDailyLimit: number;
  phoneOwnerHourlyLimit: number; phoneOwnerDailyLimit: number;
  identitySecret: string;
};

/** Supabase verifies OTPs; the application keeps its own revocable, opaque cookie sessions and owner IDs. */
export class SupabaseAuthService {
  private readonly baseUrl: URL;
  constructor(private readonly pool: Pool, private readonly sessions: EmailAuthService,
    private readonly config: SupabaseAuthConfig, private readonly now = () => new Date()) {
    this.baseUrl = new URL(config.url);
    if (this.baseUrl.protocol !== 'https:' || this.baseUrl.pathname !== '/' || this.baseUrl.search || this.baseUrl.hash) throw new Error('SUPABASE_URL must be an HTTPS project origin');
    if (!config.publishableKey.trim()) throw new Error('SUPABASE_PUBLISHABLE_KEY is required');
    if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(config.adminKey) && !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(config.adminKey)) {
      throw new Error('SUPABASE_SECRET_KEY must be a Supabase secret key or legacy service_role JWT');
    }
    if (Buffer.byteLength(config.identitySecret) < 32) throw new Error('AUTH_IDENTITY_HMAC_SECRET requires at least 32 bytes');
  }

  providers() { return { email: this.config.enabledEmail, phone: this.phoneEnabled() }; }
  private phoneEnabled() {
    return this.config.enabledPhone && this.config.phoneHookConfigured && this.config.phoneCaptchaConfigured
      && this.config.allowedPhonePrefixes.length > 0 && this.config.phoneBudgetCents > 0 && this.config.phoneMonthlySegments > 0
      && this.config.phoneIpHourlyLimit > 0 && this.config.phoneIpDailyLimit > 0
      && this.config.phoneOwnerHourlyLimit > 0 && this.config.phoneOwnerDailyLimit > 0;
  }

  async requestCode(emailValue: unknown, clientIp?: string | null): Promise<'sent' | 'limited'> {
    if (!this.config.enabledEmail) throw new AuthFailure('AUTH_PROVIDER_DISABLED', 'auth_config');
    const email = normalizeEmail(emailValue);
    if (clientIp && !await this.reserveProviderIp(clientIp, 60, 60)) return 'limited';
    return this.requestOtp('email', email);
  }

  async verify(emailValue: unknown, code: unknown, restore = false): Promise<{ session: EmailAuthSession; token: string } | null> {
    if (!this.config.enabledEmail) throw new AuthFailure('AUTH_PROVIDER_DISABLED', 'auth_config');
    const email = normalizeEmail(emailValue);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const verified = await this.verifyOtp('email', email, code);
    if (!verified) return null;
    const account = await this.mapEmail(verified.user, email, restore);
    if (!account) return null;
    return this.openSession(account.ownerId, account.email);
  }

  async requestPhoneCode(phoneValue: unknown, clientIp: string | null, captchaToken: unknown, createUser = false, ownerId?: string): Promise<'sent' | 'limited'> {
    if (!this.phoneEnabled()) throw new AuthFailure('SMS_NOT_ENABLED', 'sms_config');
    const phone = normalizePhone(phoneValue);
    if (!this.config.allowedPhonePrefixes.some(prefix => phone.startsWith(prefix))) throw new TypeError('PHONE_REGION_NOT_SUPPORTED');
    if (typeof captchaToken !== 'string' || captchaToken.length < 20 || captchaToken.length > 4096) throw new TypeError('CAPTCHA_REQUIRED');
    if (!clientIp || !await this.reserveProviderIp(clientIp, this.config.phoneIpHourlyLimit, this.config.phoneIpDailyLimit)) return 'limited';
    if (createUser && (!ownerId || !await this.reserveProviderAccount(ownerId))) return 'limited';
    return this.requestOtp('phone', phone, captchaToken, createUser);
  }

  async verifyPhone(phoneValue: unknown, code: unknown, restore = false): Promise<{ session: EmailAuthSession; token: string } | null> {
    if (!this.phoneEnabled()) throw new AuthFailure('SMS_NOT_ENABLED', 'sms_config');
    const phone = normalizePhone(phoneValue);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const verified = await this.verifyOtp('phone', phone, code);
    if (!verified) return null;
    const account = await this.mapPhoneLogin(verified.user, phone, restore);
    return account ? this.openSession(account.ownerId, account.email) : null;
  }

  async linkPhone(ownerId: string, phoneValue: unknown, code: unknown): Promise<boolean> {
    if (!this.phoneEnabled()) throw new AuthFailure('SMS_NOT_ENABLED', 'sms_config');
    const phone = normalizePhone(phoneValue);
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
    const verified = await this.verifyOtp('phone', phone, code);
    if (!verified) return false;
    return this.persistIdentity(verified.user, 'phone', phone, ownerId);
  }

  async unlinkPhone(ownerId: string, emailValue: unknown, emailCode: unknown): Promise<boolean> {
    const email = normalizeEmail(emailValue);
    if (typeof emailCode !== 'string' || !/^\d{6}$/.test(emailCode)) return false;
    const verified = await this.verifyOtp('email', email, emailCode);
    if (!verified || !isVerified(verified.user, 'email', email)) return false;
    const mapped = await this.mapEmail(verified.user, email, false);
    if (!mapped || mapped.ownerId !== ownerId) return false;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query('SELECT id FROM auth_accounts WHERE id=$1 AND closed_at IS NULL FOR UPDATE', [ownerId]);
      if (!account.rowCount) { await client.query('ROLLBACK'); return false; }
      const verifiedIdentity = await client.query(`SELECT owner_id FROM auth_external_identities
        WHERE provider_subject=$1 AND identity_kind='email' AND identifier_digest=$2 AND revoked_at IS NULL FOR UPDATE`,
      [verified.user.id, this.identityDigest('email', email)]);
      if (!verifiedIdentity.rowCount || verifiedIdentity.rows[0].owner_id !== ownerId) { await client.query('ROLLBACK'); return false; }
      const phoneIdentity = await client.query(`SELECT provider_subject,identifier_digest FROM auth_external_identities
        WHERE owner_id=$1 AND identity_kind='phone' AND revoked_at IS NULL FOR UPDATE`, [ownerId]);
      if (!phoneIdentity.rowCount) { await client.query('ROLLBACK'); return false; }
      const subject = String(phoneIdentity.rows[0].provider_subject);
      if (!/^[0-9a-f-]{36}$/i.test(subject)) throw new Error('SUPABASE_IDENTITY_INVALID');
      const otherOwner = await client.query(`SELECT 1 FROM auth_external_identities
        WHERE provider_subject=$1 AND owner_id<>$2 LIMIT 1`, [subject, ownerId]);
      if (otherOwner.rowCount) throw new Error('SUPABASE_IDENTITY_SHARED');
      const remote = await this.adminUser(subject);
      if (remote) {
        if (!this.isPhoneOnlyUser(remote, String(phoneIdentity.rows[0].identifier_digest))) throw new Error('SUPABASE_IDENTITY_UNLINK_UNAVAILABLE');
        await this.adminDeleteUser(subject);
      }
      const result = await client.query(`UPDATE auth_external_identities SET revoked_at=$2
        WHERE owner_id=$1 AND identity_kind='phone' AND revoked_at IS NULL`, [ownerId, this.now()]);
      if (!result.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  /** Sync the verified application email change to the server-side Supabase identity. */
  async changeEmailIdentity(client: PoolClient, ownerId: string, newEmailValue: string): Promise<void> {
    const newEmail = normalizeEmail(newEmailValue);
    const rows = await client.query(`SELECT provider_subject FROM auth_external_identities
      WHERE owner_id=$1 AND identity_kind='email' AND revoked_at IS NULL FOR UPDATE`, [ownerId]);
    if (rows.rowCount !== 1) throw new Error('SUPABASE_EMAIL_IDENTITY_NOT_FOUND');
    const subject = String(rows.rows[0].provider_subject);
    if (!/^[0-9a-f-]{36}$/i.test(subject)) throw new Error('SUPABASE_IDENTITY_INVALID');
    const response = await this.adminFetch(`/auth/v1/admin/users/${encodeURIComponent(subject)}`, 'PUT', { email: newEmail, email_confirm: true });
    if (!response.ok) throw new Error('SUPABASE_EMAIL_UPDATE_FAILED');
    const updated = await this.adminUser(subject);
    if (!updated || !isVerified(updated, 'email', newEmail)) throw new Error('SUPABASE_EMAIL_UPDATE_UNCONFIRMED');
  }

  /** Remove every Supabase Auth user mapped to this app owner before local erasure. */
  async deleteOwnerAuthUsers(client: PoolClient, ownerId: string): Promise<void> {
    const rows = await client.query(`SELECT DISTINCT provider_subject FROM auth_external_identities WHERE owner_id=$1`, [ownerId]);
    if (!rows.rowCount) throw new Error('SUPABASE_IDENTITIES_NOT_FOUND');
    for (const row of rows.rows) {
      const subject = String(row.provider_subject);
      if (!/^[0-9a-f-]{36}$/i.test(subject)) throw new Error('SUPABASE_IDENTITY_INVALID');
      const shared = await client.query(`SELECT 1 FROM auth_external_identities WHERE provider_subject=$1 AND owner_id<>$2 LIMIT 1`, [subject, ownerId]);
      if (shared.rowCount) throw new Error('SUPABASE_IDENTITY_SHARED');
      await this.adminDeleteUser(subject);
    }
  }

  async phoneStatus(ownerId: string): Promise<{ phoneLinked: boolean }> {
    const result = await this.pool.query(`SELECT 1 FROM auth_external_identities
      WHERE owner_id=$1 AND identity_kind='phone' AND revoked_at IS NULL LIMIT 1`, [ownerId]);
    return { phoneLinked: Boolean(result.rowCount) };
  }

  // Guest sessions use the same application-owned cookie store as Supabase sessions.
  createGuest(clientIp: string) { return this.sessions.createGuest(clientIp); }

  async upgradeGuest(ownerId: string, token: string | null, emailValue: unknown, code: unknown,
    confirmation: unknown, signal?: AbortSignal): Promise<GuestUpgradeResult> {
    if (!this.config.enabledEmail || confirmation !== 'UPGRADE_GUEST_TO_EMAIL'
      || typeof code !== 'string' || !/^\d{6}$/.test(code) || !token || signal?.aborted) return { status: 'unavailable' };
    const current = await this.sessions.resolve(token);
    if (current?.kind !== 'guest' || current.ownerId !== ownerId) return { status: 'unavailable' };
    const email = normalizeEmail(emailValue);
    const verified = await this.verifyOtp('email', email, code, signal);
    if (!verified) return { status: 'invalid_code' };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Revalidate the cookie under lock after the external verification request.
      const guest = await client.query(`SELECT s.expires_at FROM auth_accounts a JOIN auth_sessions s ON s.owner_id=a.id
        WHERE a.id=$1 AND a.is_guest=true AND a.email IS NULL AND a.closed_at IS NULL
        AND s.token_hash=$2 AND s.expires_at>$3 FOR UPDATE OF a,s`, [ownerId, hashToken(token), this.now()]);
      const occupied = await client.query('SELECT id FROM auth_accounts WHERE lower(email)=lower($1)', [email]);
      const subject = String(verified.user.id);
      const identities = await client.query('SELECT owner_id FROM auth_external_identities WHERE provider_subject=$1 FOR UPDATE', [subject]);
      if (!guest.rowCount || occupied.rowCount || identities.rows.some(row => row.owner_id !== ownerId) || signal?.aborted) {
        await client.query('ROLLBACK'); return { status: 'unavailable' };
      }
      const now = this.now();
      const inserted = await client.query(`INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at)
        VALUES($1,'email',$2,$3,$4) ON CONFLICT DO NOTHING RETURNING owner_id`, [subject, this.identityDigest('email', email), ownerId, now]);
      if (!inserted.rowCount) { await client.query('ROLLBACK'); return { status: 'unavailable' }; }
      await client.query('UPDATE auth_accounts SET email=$2,is_guest=false,last_seen_at=$3 WHERE id=$1', [ownerId, email, now]);
      if (signal?.aborted) { await client.query('ROLLBACK'); return { status: 'unavailable' }; }
      await client.query('COMMIT');
      return { status: 'upgraded', session: { kind: 'email', ownerId, email, expiresAt: new Date(guest.rows[0].expires_at) } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueConflict(error)) return { status: 'unavailable' };
      throw new AuthFailure('UPGRADE_STORE_FAILED', 'verification_store');
    } finally { client.release(); }
  }

  resolve(token: string | null) { return this.sessions.resolve(token); }
  refresh(token: string | null) { return this.sessions.refresh(token); }
  logout(token: string | null) { return this.sessions.logout(token); }

  private async requestOtp(kind: IdentityKind, destination: string, captchaToken?: string, createUser = true): Promise<'sent' | 'limited'> {
    const body = kind === 'email' ? { email: destination, create_user: true } : { phone: destination, create_user: createUser,
      gotrue_meta_security: { captcha_token: captchaToken } };
    let response: Response;
    try { response = await this.authFetch('/auth/v1/otp', body); }
    catch { throw new AuthFailure(kind === 'phone' ? 'SMS_UNAVAILABLE' : 'MAIL_UNAVAILABLE', kind === 'phone' ? 'sms_send' : 'mail_send'); }
    if (response.status === 429) return 'limited';
    if (!response.ok) {
      throw new AuthFailure(kind === 'phone' ? 'SMS_UNAVAILABLE' : 'MAIL_UNAVAILABLE', kind === 'phone' ? 'sms_send' : 'mail_send');
    }
    return 'sent';
  }

  private async verifyOtp(kind: IdentityKind, destination: string, code: string, signal?: AbortSignal): Promise<{ user: SupabaseUser } | null> {
    const body = kind === 'email' ? { type: 'email', email: destination, token: code } : { type: 'sms', phone: destination, token: code };
    let response: Response;
    try { response = await this.authFetch('/auth/v1/verify', body, signal); }
    catch { throw new AuthFailure('AUTH_PROVIDER_UNAVAILABLE', 'auth_verify'); }
    if (response.status === 400 || response.status === 401) return null;
    if (!response.ok) throw new AuthFailure('AUTH_PROVIDER_UNAVAILABLE', 'auth_verify');
    let result: VerifiedAuthResponse;
    try { result = await response.json() as VerifiedAuthResponse; } catch { throw new AuthFailure('AUTH_PROVIDER_UNAVAILABLE', 'auth_verify'); }
    const user = result.user;
    if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id) || !isVerified(user, kind, destination)) return null;
    return { user };
  }

  private async authFetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    try {
      return await fetch(new URL(path, this.baseUrl), { method: 'POST', headers: {
        apikey: this.config.publishableKey, 'content-type': 'application/json', accept: 'application/json',
      }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) });
    } catch { throw new AuthFailure('AUTH_PROVIDER_UNAVAILABLE', 'auth_request'); }
  }

  private async adminFetch(path: string, method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<Response> {
    try {
      const headers: Record<string, string> = { apikey: this.config.adminKey, accept: 'application/json' };
      // New sb_secret keys are opaque API keys, not JWTs. Legacy service_role keys are JWTs.
      if (!this.config.adminKey.startsWith('sb_')) headers.authorization = `Bearer ${this.config.adminKey}`;
      return await fetch(new URL(path, this.baseUrl), { method, headers: {
        ...headers,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5_000) });
    } catch { throw new Error('SUPABASE_ADMIN_UNAVAILABLE'); }
  }

  private async adminUser(subject: string): Promise<SupabaseUser | null> {
    const response = await this.adminFetch(`/auth/v1/admin/users/${encodeURIComponent(subject)}`, 'GET');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('SUPABASE_ADMIN_UNAVAILABLE');
    let payload: unknown;
    try { payload = await response.json(); } catch { throw new Error('SUPABASE_ADMIN_UNAVAILABLE'); }
    const value = payload && typeof payload === 'object' && 'user' in payload ? (payload as { user?: unknown }).user : payload;
    if (!value || typeof value !== 'object' || !('id' in value) || (value as SupabaseUser).id !== subject) throw new Error('SUPABASE_ADMIN_UNAVAILABLE');
    return value as SupabaseUser;
  }

  /** A missing user is already in the desired deleted state. */
  private async adminDeleteUser(subject: string): Promise<void> {
    const response = await this.adminFetch(`/auth/v1/admin/users/${encodeURIComponent(subject)}`, 'DELETE');
    if (response.status === 404) return;
    if (!response.ok) throw new Error('SUPABASE_ADMIN_UNAVAILABLE');
  }

  private isPhoneOnlyUser(user: SupabaseUser, expectedDigest: string): boolean {
    if (typeof user.phone !== 'string' || !isVerified(user, 'phone', user.phone)
      || (typeof user.email === 'string' && user.email.length > 0) || !Array.isArray(user.identities) || user.identities.length !== 1) return false;
    const identity = user.identities[0] as { provider?: unknown } | null;
    return identity?.provider === 'phone' && this.identityDigest('phone', normalizePhone(user.phone)) === expectedDigest;
  }

  private async mapEmail(user: SupabaseUser, email: string, restore: boolean): Promise<{ ownerId: string; email: string } | null> {
    const subject = String(user.id); const digest = this.identityDigest('email', email); const now = this.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const mapped = await client.query(`SELECT owner_id,identifier_digest FROM auth_external_identities
        WHERE provider_subject=$1 AND identity_kind='email' AND revoked_at IS NULL FOR UPDATE`, [subject]);
      let ownerId: string;
      if (mapped.rows[0]) {
        if (mapped.rows[0].identifier_digest !== digest) { await client.query('ROLLBACK'); return null; }
        ownerId = mapped.rows[0].owner_id;
        const account = await client.query('SELECT email,closed_at FROM auth_accounts WHERE id=$1 FOR UPDATE', [ownerId]);
        if (!account.rows[0]) { await client.query('ROLLBACK'); return null; }
        if (normalizeEmail(account.rows[0].email) !== email) {
          // An old verified Supabase email must not retain an active mapping after a local email change.
          await client.query(`UPDATE auth_external_identities SET revoked_at=$3
            WHERE provider_subject=$1 AND identity_kind='email' AND identifier_digest=$2 AND revoked_at IS NULL`, [subject, digest, now]);
          await client.query('COMMIT'); return null;
        }
        if (account.rows[0].closed_at && !await this.restoreClosedAccount(client, ownerId, account.rows[0].closed_at, restore, now)) {
          await client.query('ROLLBACK'); return null;
        }
      } else {
        const found = await client.query('SELECT id,email,closed_at FROM auth_accounts WHERE lower(email)=lower($1) FOR UPDATE', [email]);
        if (found.rows.length > 1) { await client.query('ROLLBACK'); return null; }
        if (found.rows[0]) {
          ownerId = found.rows[0].id;
          if (found.rows[0].closed_at && !await this.restoreClosedAccount(client, ownerId, found.rows[0].closed_at, restore, now)) { await client.query('ROLLBACK'); return null; }
        } else {
          if (restore) { await client.query('ROLLBACK'); return null; }
          ownerId = randomUUID();
          await client.query('INSERT INTO auth_accounts(id,email) VALUES($1,$2)', [ownerId, email]);
        }
        const conflictingSubject = await client.query(`SELECT owner_id FROM auth_external_identities
          WHERE provider_subject=$1 AND revoked_at IS NULL FOR UPDATE`, [subject]);
        if (conflictingSubject.rows.some(row => row.owner_id !== ownerId)) { await client.query('ROLLBACK'); return null; }
        await client.query(`INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at)
          VALUES($1,'email',$2,$3,$4) ON CONFLICT(provider_subject,identity_kind) DO UPDATE SET
          identifier_digest=EXCLUDED.identifier_digest,owner_id=EXCLUDED.owner_id,verified_at=EXCLUDED.verified_at,
          revoked_at=NULL,last_used_at=now() WHERE auth_external_identities.revoked_at IS NOT NULL
          OR (auth_external_identities.owner_id=EXCLUDED.owner_id AND auth_external_identities.identifier_digest=EXCLUDED.identifier_digest)`, [subject, digest, ownerId, now]);
      }
      const account = await client.query('SELECT email,closed_at FROM auth_accounts WHERE id=$1 FOR UPDATE', [ownerId]);
      if (!account.rows[0] || account.rows[0].closed_at || normalizeEmail(account.rows[0].email) !== email) { await client.query('ROLLBACK'); return null; }
      await client.query('UPDATE auth_external_identities SET last_used_at=$3 WHERE provider_subject=$1 AND identity_kind=$2 AND revoked_at IS NULL', [subject, 'email', now]);
      await client.query('COMMIT'); return { ownerId, email };
    } catch (error) { await client.query('ROLLBACK'); if (isUniqueConflict(error)) return null; throw new AuthFailure('IDENTITY_STORE_FAILED', 'identity_map'); }
    finally { client.release(); }
  }

  private async restoreClosedAccount(client: PoolClient, ownerId: string, closedAt: Date, restore: boolean, now: Date): Promise<boolean> {
    if (!restore || new Date(closedAt).getTime() <= now.getTime() - 30 * 86400_000) return false;
    await client.query('UPDATE auth_accounts SET closed_at=NULL WHERE id=$1', [ownerId]);
    await client.query(`INSERT INTO account_lifecycle_audit(id,owner_digest,operation,policy_version)
      VALUES($1,$2,'restored','supabase-otp-30d')`, [randomUUID(), createHmac('sha256', this.config.identitySecret).update(ownerId).digest('hex')]);
    return true;
  }

  private async mapPhoneLogin(user: SupabaseUser, phone: string, restore: boolean): Promise<{ ownerId: string; email: string } | null> {
    const subject = String(user.id); const digest = this.identityDigest('phone', phone); const now = this.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(`SELECT a.id,a.email,a.closed_at,e.identifier_digest
        FROM auth_external_identities e JOIN auth_accounts a ON a.id=e.owner_id
        WHERE e.provider_subject=$1 AND e.identity_kind='phone' AND e.revoked_at IS NULL FOR UPDATE OF a,e`, [subject]);
      const row = found.rows[0];
      if (!row || row.identifier_digest !== digest) { await client.query('ROLLBACK'); return null; }
      if (row.closed_at && !await this.restoreClosedAccount(client, row.id, row.closed_at, restore, now)) { await client.query('ROLLBACK'); return null; }
      await client.query(`UPDATE auth_external_identities SET last_used_at=$3
        WHERE provider_subject=$1 AND identity_kind='phone' AND identifier_digest=$2 AND revoked_at IS NULL`, [subject, digest, now]);
      await client.query('COMMIT');
      return { ownerId: row.id, email: row.email };
    } catch (error) { await client.query('ROLLBACK'); throw new AuthFailure('IDENTITY_STORE_FAILED', 'identity_map'); }
    finally { client.release(); }
  }

  private async persistIdentity(user: SupabaseUser, kind: IdentityKind, value: string, ownerId: string): Promise<boolean> {
    if (!isVerified(user, kind, value)) return false;
    const subject = String(user.id); const digest = this.identityDigest(kind, value); const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query('SELECT id,closed_at FROM auth_accounts WHERE id=$1 FOR UPDATE', [ownerId]);
      if (!account.rows[0] || account.rows[0].closed_at) { await client.query('ROLLBACK'); return false; }
      const owners = await client.query(`SELECT owner_id FROM auth_external_identities
        WHERE provider_subject=$1 AND revoked_at IS NULL FOR UPDATE`, [subject]);
      if (owners.rows.some(row => row.owner_id !== ownerId)) { await client.query('ROLLBACK'); return false; }
      await client.query(`INSERT INTO auth_external_identities(provider_subject,identity_kind,identifier_digest,owner_id,verified_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider_subject,identity_kind) DO UPDATE SET
        identifier_digest=EXCLUDED.identifier_digest,owner_id=EXCLUDED.owner_id,verified_at=EXCLUDED.verified_at,
        revoked_at=NULL,last_used_at=now() WHERE auth_external_identities.revoked_at IS NOT NULL
        OR (auth_external_identities.owner_id=EXCLUDED.owner_id AND auth_external_identities.identity_kind=EXCLUDED.identity_kind)`, [subject, kind, digest, ownerId, this.now()]);
      const linked = await client.query(`SELECT owner_id FROM auth_external_identities WHERE provider_subject=$1 AND identity_kind=$2
        AND identifier_digest=$3 AND owner_id=$4 AND revoked_at IS NULL`, [subject, kind, digest, ownerId]);
      if (!linked.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); if (isUniqueConflict(error)) return false; throw new AuthFailure('IDENTITY_STORE_FAILED', 'identity_link'); }
    finally { client.release(); }
  }

  private async reserveProviderIp(ip: string, hourlyLimit: number, dailyLimit: number): Promise<boolean> {
    const digest = createHmac('sha256', this.config.identitySecret).update(`ip\0${ip}`).digest('hex');
    const now = this.now();
    const utcDay = now.toISOString().slice(0, 10);
    const result = await this.pool.query(`INSERT INTO auth_provider_ip_limits(ip_digest,window_started_at,hour_count,day_started_at,day_count)
      VALUES($1,$2,1,$3::date,1) ON CONFLICT(ip_digest) DO UPDATE SET
      hour_count=CASE WHEN auth_provider_ip_limits.window_started_at <= $2::timestamptz - interval '1 hour' THEN 1 ELSE auth_provider_ip_limits.hour_count+1 END,
      window_started_at=CASE WHEN auth_provider_ip_limits.window_started_at <= $2::timestamptz - interval '1 hour' THEN $2 ELSE auth_provider_ip_limits.window_started_at END,
      day_count=CASE WHEN auth_provider_ip_limits.day_started_at < $3::date THEN 1 ELSE auth_provider_ip_limits.day_count+1 END,
      day_started_at=CASE WHEN auth_provider_ip_limits.day_started_at < $3::date THEN $3::date ELSE auth_provider_ip_limits.day_started_at END
      WHERE (auth_provider_ip_limits.window_started_at <= $2::timestamptz - interval '1 hour' OR auth_provider_ip_limits.hour_count < $4)
        AND (auth_provider_ip_limits.day_started_at < $3::date OR auth_provider_ip_limits.day_count < $5)
      RETURNING day_count`, [digest, now, utcDay, hourlyLimit, dailyLimit]);
    return Boolean(result.rowCount);
  }

  private async reserveProviderAccount(ownerId: string): Promise<boolean> {
    const digest = createHmac('sha256', this.config.identitySecret).update(`account\0${ownerId}`).digest('hex');
    const now = this.now();
    const utcDay = now.toISOString().slice(0, 10);
    const result = await this.pool.query(`INSERT INTO auth_provider_account_limits(owner_digest,window_started_at,hour_count,day_started_at,day_count)
      VALUES($1,$2,1,$3::date,1) ON CONFLICT(owner_digest) DO UPDATE SET
      hour_count=CASE WHEN auth_provider_account_limits.window_started_at <= $2::timestamptz - interval '1 hour' THEN 1 ELSE auth_provider_account_limits.hour_count+1 END,
      window_started_at=CASE WHEN auth_provider_account_limits.window_started_at <= $2::timestamptz - interval '1 hour' THEN $2 ELSE auth_provider_account_limits.window_started_at END,
      day_count=CASE WHEN auth_provider_account_limits.day_started_at < $3::date THEN 1 ELSE auth_provider_account_limits.day_count+1 END,
      day_started_at=CASE WHEN auth_provider_account_limits.day_started_at < $3::date THEN $3::date ELSE auth_provider_account_limits.day_started_at END
      WHERE (auth_provider_account_limits.window_started_at <= $2::timestamptz - interval '1 hour' OR auth_provider_account_limits.hour_count < $4)
        AND (auth_provider_account_limits.day_started_at < $3::date OR auth_provider_account_limits.day_count < $5)
      RETURNING day_count`, [digest, now, utcDay, this.config.phoneOwnerHourlyLimit, this.config.phoneOwnerDailyLimit]);
    return Boolean(result.rowCount);
  }

  private identityDigest(kind: IdentityKind, value: string): string {
    return createHmac('sha256', this.config.identitySecret).update(`${kind}\0${value}`).digest('hex');
  }

  private async openSession(ownerId: string, email: string): Promise<{ session: EmailAuthSession; token: string }> {
    const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(this.now().getTime() + SESSION_SECONDS * 1000);
    await this.pool.query('INSERT INTO auth_sessions(token_hash,owner_id,expires_at) VALUES($1,$2,$3)', [hashToken(token), ownerId, expiresAt]);
    return { session: { kind: 'email', ownerId, email, expiresAt }, token };
  }
}

function normalizePhone(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('INVALID_PHONE');
  const phone = value.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new TypeError('INVALID_PHONE');
  return phone;
}
function isVerified(user: SupabaseUser, kind: IdentityKind, expected: string): boolean {
  if (typeof user.id !== 'string') return false;
  if (kind === 'email') return typeof user.email === 'string' && normalizeSafeEmail(user.email) === expected && Boolean(user.email_confirmed_at);
  return typeof user.phone === 'string' && normalizeSafePhone(user.phone) === expected && Boolean(user.phone_confirmed_at);
}
function normalizeSafeEmail(value: string): string { try { return normalizeEmail(value); } catch { return ''; } }
function normalizeSafePhone(value: string): string { try { return normalizePhone(value); } catch { return ''; } }
function isUniqueConflict(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === '23505'); }
