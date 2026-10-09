import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthSession, EmailAuthRepository, EmailAuthSession, GuestAuthSession, GuestUpgradeResult } from './email-auth.js';

/** Codes are HMACs and sessions are random-token hashes; neither plaintext is persisted. */
export class PostgresEmailAuthRepository implements EmailAuthRepository {
  constructor(private readonly pool: Pool, private readonly secret: string) {
    if (Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET requires at least 32 bytes');
  }
  async issue(email: string, digest: string, now: Date, expiresAt: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const bucket = Math.floor(now.getTime() / 3_600_000);
      const global = await client.query(`INSERT INTO auth_mail_limits (bucket, sent) VALUES ($1, 1)
        ON CONFLICT (bucket) DO UPDATE SET sent = auth_mail_limits.sent + 1 WHERE auth_mail_limits.sent < 600 RETURNING sent`, [bucket]);
      if (!global.rowCount) { await client.query('ROLLBACK'); return false; }
      const result = await client.query(`INSERT INTO auth_challenges
        (email, digest, expires_at, attempts, issued_at, window_started_at, window_count)
        VALUES ($1, $2, $3, 0, $4, $4, 1)
        ON CONFLICT (email) DO UPDATE SET digest = $2, expires_at = $3, attempts = 0, issued_at = $4,
          window_started_at = CASE WHEN auth_challenges.window_started_at <= $4 - interval '1 hour' THEN $4 ELSE auth_challenges.window_started_at END,
          window_count = CASE WHEN auth_challenges.window_started_at <= $4 - interval '1 hour' THEN 1 ELSE auth_challenges.window_count + 1 END
        WHERE auth_challenges.issued_at <= $4 - interval '1 minute'
          AND (auth_challenges.window_started_at <= $4 - interval '1 hour' OR auth_challenges.window_count < 6)
        RETURNING email`, [email, digest, expiresAt, now]);
      if (!result.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query('DELETE FROM auth_mail_limits WHERE bucket < $1', [bucket - 24]);
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  /** SEC-02: per-IP hourly budget so one address cannot exhaust the global mail quota. */
  async issueIpLimit(ip: string, now: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO auth_ip_mail_limits (ip, window_started_at, count) VALUES ($1, $2, 1)
        ON CONFLICT (ip) DO UPDATE SET count = CASE WHEN auth_ip_mail_limits.window_started_at <= $2 - interval '1 hour' THEN 1 ELSE auth_ip_mail_limits.count + 1 END,
          window_started_at = CASE WHEN auth_ip_mail_limits.window_started_at <= $2 - interval '1 hour' THEN $2 ELSE auth_ip_mail_limits.window_started_at END
        WHERE auth_ip_mail_limits.window_started_at <= $2 - interval '1 hour' OR auth_ip_mail_limits.count < 60 RETURNING ip`, [ip, now]);
      if (!result.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query(`DELETE FROM auth_ip_mail_limits WHERE window_started_at < $1::timestamptz - interval '24 hours'`, [now]);
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  /** SEC-02: return the per-IP, per-email and global mail budget after a failed delivery. */
  async refundIssue(email: string, ip: string | null, now: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const bucket = Math.floor(now.getTime() / 3_600_000);
      await client.query('UPDATE auth_mail_limits SET sent = greatest(sent - 1, 0) WHERE bucket = $1', [bucket]);
      await client.query(`UPDATE auth_challenges SET window_count = greatest(window_count - 1, 0),
        issued_at = '1970-01-01 00:00:00+00' WHERE email = $1 AND digest IS NULL`, [email]);
      if (ip) await client.query('UPDATE auth_ip_mail_limits SET count = greatest(count - 1, 0) WHERE ip = $1', [ip]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async invalidate(email: string, digest: string): Promise<void> {
    await this.pool.query('UPDATE auth_challenges SET digest = NULL WHERE email = $1 AND digest = $2', [email, digest]);
  }
  async consume(email: string, digest: string, tokenHash: string, now: Date, expiresAt: Date, restore=false): Promise<EmailAuthSession | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT digest, expires_at, attempts FROM auth_challenges WHERE email = $1 FOR UPDATE', [email]);
      const challenge = rows[0];
      if (!challenge?.digest || challenge.attempts >= 5 || new Date(challenge.expires_at).getTime() <= now.getTime()) {
        // SEC-07: equalize work between the missing/invalid-challenge path and the
        // present-challenge path so response timing cannot enumerate recent requests.
        await client.query('UPDATE auth_challenges SET attempts = attempts WHERE email = $1', [email]);
        const filler = randomBytes(32);
        timingSafeEqual(filler, filler);
        await client.query('ROLLBACK'); return null;
      }
      await client.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE email = $1', [email]);
      if (!/^[a-f0-9]{64}$/.test(challenge.digest) || !timingSafeEqual(Buffer.from(challenge.digest, 'hex'), Buffer.from(digest, 'hex'))) {
        await client.query('COMMIT'); return null;
      }
      if(restore){
        const restored=await client.query("UPDATE auth_accounts SET closed_at=NULL WHERE email=$1 AND closed_at> $2::timestamptz-interval '30 days' RETURNING id",[email,now]);
        if(!restored.rowCount){await client.query('UPDATE auth_challenges SET digest=NULL WHERE email=$1',[email]);await client.query('COMMIT');return null;}
        await client.query("INSERT INTO account_lifecycle_audit(id,owner_digest,operation,policy_version) VALUES($1,$2,'restored','recovery-30d')",[randomUUID(),createHash('sha256').update(restored.rows[0].id).digest('hex')]);
      }
      const account = await client.query(`INSERT INTO auth_accounts (id, email, is_guest, last_seen_at) VALUES ($1, $2, false, $3)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, last_seen_at = EXCLUDED.last_seen_at
        WHERE auth_accounts.closed_at IS NULL AND auth_accounts.is_guest = false RETURNING id`, [randomUUID(), email, now]);
      if (!account.rows[0]) { await client.query('UPDATE auth_challenges SET digest = NULL WHERE email = $1', [email]); await client.query('COMMIT'); return null; }
      const ownerId = account.rows[0].id as string;
      await insertSession(client, tokenHash, ownerId, expiresAt);
      await client.query('UPDATE auth_challenges SET digest = NULL WHERE email = $1', [email]);
      await client.query('COMMIT'); return { kind: 'email', ownerId, email, expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async createGuest(tokenHash: string, now: Date, expiresAt: Date, clientIp: string): Promise<GuestAuthSession | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const rateKey = createHmac('sha256', this.secret).update(`guest-create\0${clientIp}`).digest('hex');
      const limit = await client.query(`INSERT INTO account_rate_limits(key, expires_at, hits)
        VALUES ($1, $2::timestamptz + interval '1 hour', 1)
        ON CONFLICT (key) DO UPDATE SET
          hits = CASE WHEN account_rate_limits.expires_at <= $2 THEN 1 ELSE account_rate_limits.hits + 1 END,
          expires_at = CASE WHEN account_rate_limits.expires_at <= $2 THEN $2::timestamptz + interval '1 hour' ELSE account_rate_limits.expires_at END
        WHERE account_rate_limits.expires_at <= $2 OR account_rate_limits.hits < 3
        RETURNING hits`, [rateKey, now]);
      if (!limit.rowCount) { await client.query('ROLLBACK'); return null; }
      const ownerId = randomUUID();
      await client.query('INSERT INTO auth_accounts (id, email, is_guest, last_seen_at) VALUES ($1, NULL, true, $2)', [ownerId, now]);
      await insertSession(client, tokenHash, ownerId, expiresAt);
      await client.query('COMMIT');
      return { kind: 'guest', ownerId, expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async upgradeGuest(ownerId: string, tokenHash: string, email: string, digest: string, now: Date): Promise<GuestUpgradeResult> {
    const client = await this.pool.connect();
    let conflictingEmail = false;
    try {
      await client.query('BEGIN');
      const challenge = (await client.query('SELECT digest, expires_at, attempts FROM auth_challenges WHERE email=$1 FOR UPDATE', [email])).rows[0];
      if (!challenge?.digest || challenge.attempts >= 5 || new Date(challenge.expires_at).getTime() <= now.getTime()) {
        const filler = randomBytes(32); timingSafeEqual(filler, filler);
        await client.query('ROLLBACK'); return { status: 'invalid_code' };
      }
      await client.query('UPDATE auth_challenges SET attempts=attempts+1 WHERE email=$1', [email]);
      if (!/^[a-f0-9]{64}$/.test(challenge.digest)
        || !timingSafeEqual(Buffer.from(challenge.digest, 'hex'), Buffer.from(digest, 'hex'))) {
        await client.query('COMMIT'); return { status: 'invalid_code' };
      }
      const guest = await client.query(`SELECT a.id, s.expires_at FROM auth_accounts a JOIN auth_sessions s ON s.owner_id=a.id
        WHERE a.id=$1 AND a.is_guest=true AND a.email IS NULL AND a.closed_at IS NULL
          AND s.token_hash=$2 AND s.expires_at>$3 FOR UPDATE OF a,s`, [ownerId, tokenHash, now]);
      if (!guest.rowCount) {
        await client.query('UPDATE auth_challenges SET digest=NULL WHERE email=$1', [email]);
        await client.query('COMMIT'); return { status: 'unavailable' };
      }
      const existing = await client.query('SELECT id FROM auth_accounts WHERE email=$1 LIMIT 1 FOR UPDATE', [email]);
      if (existing.rowCount) {
        await client.query('UPDATE auth_challenges SET digest=NULL WHERE email=$1', [email]);
        await client.query('COMMIT'); return { status: 'unavailable' };
      }
      const updated = await client.query(`UPDATE auth_accounts SET email=$2, is_guest=false, last_seen_at=$3
        WHERE id=$1 AND is_guest=true AND email IS NULL RETURNING id`, [ownerId, email, now]);
      if (!updated.rowCount) {
        await client.query('UPDATE auth_challenges SET digest=NULL WHERE email=$1', [email]);
        await client.query('COMMIT'); return { status: 'unavailable' };
      }
      await client.query('UPDATE auth_challenges SET digest=NULL WHERE email=$1', [email]);
      await client.query('COMMIT');
      return { status: 'upgraded', session: { kind: 'email', ownerId, email, expiresAt: new Date(guest.rows[0].expires_at) } };
    } catch (error) {
      conflictingEmail = (error as { code?: string }).code === '23505';
      await client.query('ROLLBACK');
      if (conflictingEmail) {
        await this.pool.query('UPDATE auth_challenges SET digest=NULL WHERE email=$1 AND digest=$2', [email, digest]);
        return { status: 'unavailable' };
      }
      throw error;
    } finally { client.release(); }
  }
  async resolve(tokenHash: string, now: Date): Promise<AuthSession | null> {
    const guest = await this.pool.query(`UPDATE auth_accounts a SET last_seen_at=$2 FROM auth_sessions s
      WHERE s.owner_id=a.id AND s.token_hash=$1 AND s.expires_at>$2 AND a.closed_at IS NULL
        AND a.is_guest=true AND a.email IS NULL RETURNING a.id,s.expires_at`, [tokenHash, now]);
    const guestRow = guest.rows[0];
    if (guestRow) return { kind: 'guest', ownerId: guestRow.id, expiresAt: new Date(guestRow.expires_at) };
    const result = await this.pool.query(`SELECT a.id, a.email, s.expires_at FROM auth_sessions s
      JOIN auth_accounts a ON a.id = s.owner_id WHERE s.token_hash = $1 AND s.expires_at > $2
        AND a.closed_at IS NULL AND a.is_guest=false AND a.email IS NOT NULL`, [tokenHash, now]);
    const row = result.rows[0]; return row ? { kind: 'email', ownerId: row.id, email: row.email, expiresAt: new Date(row.expires_at) } : null;
  }
  async rotate(tokenHash: string, nextHash: string, now: Date, expiresAt: Date): Promise<AuthSession | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`DELETE FROM auth_sessions s USING auth_accounts a
        WHERE s.token_hash = $1 AND s.expires_at > $2 AND a.id = s.owner_id AND a.closed_at IS NULL RETURNING a.id, a.email, a.is_guest`, [tokenHash, now]);
      const row = result.rows[0];
      if (!row) { await client.query('ROLLBACK'); return null; }
      await insertSession(client, nextHash, row.id, expiresAt);
      if (row.is_guest) await client.query('UPDATE auth_accounts SET last_seen_at=$2 WHERE id=$1 AND is_guest=true', [row.id, now]);
      await client.query('COMMIT');
      return row.is_guest && row.email === null
        ? { kind: 'guest', ownerId: row.id, expiresAt }
        : typeof row.email === 'string' ? { kind: 'email', ownerId: row.id, email: row.email, expiresAt } : null;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async revoke(tokenHash: string): Promise<void> { await this.pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]); }
}
async function insertSession(client: PoolClient, hash: string, ownerId: string, expiresAt: Date): Promise<void> {
  await client.query('INSERT INTO auth_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, $3)', [hash, ownerId, expiresAt]);
  await client.query('DELETE FROM auth_sessions WHERE expires_at <= now()');
}
