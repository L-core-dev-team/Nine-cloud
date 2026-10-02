import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthSession, EmailAuthRepository } from './email-auth.js';

/** Codes are HMACs and sessions are random-token hashes; neither plaintext is persisted. */
export class PostgresEmailAuthRepository implements EmailAuthRepository {
  constructor(private readonly pool: Pool) {}
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
  async consume(email: string, digest: string, tokenHash: string, now: Date, expiresAt: Date): Promise<AuthSession | null> {
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
      const account = await client.query(`INSERT INTO auth_accounts (id, email) VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email WHERE auth_accounts.closed_at IS NULL RETURNING id`, [randomUUID(), email]);
      if (!account.rows[0]) { await client.query('UPDATE auth_challenges SET digest = NULL WHERE email = $1', [email]); await client.query('COMMIT'); return null; }
      const ownerId = account.rows[0].id as string;
      await insertSession(client, tokenHash, ownerId, expiresAt);
      await client.query('UPDATE auth_challenges SET digest = NULL WHERE email = $1', [email]);
      await client.query('COMMIT'); return { ownerId, email, expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async resolve(tokenHash: string, now: Date): Promise<AuthSession | null> {
    const result = await this.pool.query(`SELECT a.id, a.email, s.expires_at FROM auth_sessions s
      JOIN auth_accounts a ON a.id = s.owner_id WHERE s.token_hash = $1 AND s.expires_at > $2 AND a.closed_at IS NULL`, [tokenHash, now]);
    const row = result.rows[0]; return row ? { ownerId: row.id, email: row.email, expiresAt: new Date(row.expires_at) } : null;
  }
  async rotate(tokenHash: string, nextHash: string, now: Date, expiresAt: Date): Promise<AuthSession | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`DELETE FROM auth_sessions s USING auth_accounts a
        WHERE s.token_hash = $1 AND s.expires_at > $2 AND a.id = s.owner_id AND a.closed_at IS NULL RETURNING a.id, a.email`, [tokenHash, now]);
      const row = result.rows[0];
      if (!row) { await client.query('ROLLBACK'); return null; }
      await insertSession(client, nextHash, row.id, expiresAt);
      await client.query('COMMIT'); return { ownerId: row.id, email: row.email, expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async revoke(tokenHash: string): Promise<void> { await this.pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash]); }
}
async function insertSession(client: PoolClient, hash: string, ownerId: string, expiresAt: Date): Promise<void> {
  await client.query('INSERT INTO auth_sessions (token_hash, owner_id, expires_at) VALUES ($1, $2, $3)', [hash, ownerId, expiresAt]);
  await client.query('DELETE FROM auth_sessions WHERE expires_at <= now()');
}
