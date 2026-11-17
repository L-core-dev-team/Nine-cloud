import { createAccountQuotaLimiter } from '../services/account-rate-limit.js';
import type { Pool, PoolClient } from 'pg';
import { sessionToken, type AuthSessionService } from '../routes/auth.js';
import { CardError } from './parser.js';
import { createCardImportRouter } from './router.js';
import { CardImportService, type CardModel } from './service.js';

export type CardImportHostOptions = { pool: Pool; model?: CardModel; timeoutMs?: number };
/** One host, existing session service. No new HTTP server, credentials or auth database. */
export function cardImportHost(options: CardImportHostOptions, auth: AuthSessionService, origin: string) {
  const service = new CardImportService(options.pool, options.model, options.timeoutMs ?? 20_000, async (client, owner) => {
    // Same lock order as AccountLifecycle: account before session/card rows.
    // SHARE blocks closure/delete until this short transaction has committed.
    const account = await client.query('SELECT id FROM auth_accounts WHERE id=$1 AND closed_at IS NULL FOR SHARE', [owner]);
    if (!account.rowCount) throw new CardError('ACCOUNT_UNAVAILABLE', 401);
  });
  return createCardImportRouter(service, {
    resolveOwnerId: async request => (await auth.resolve(sessionToken(request)))?.ownerId ?? null,
  }, origin, owner => createAccountQuotaLimiter(options.pool)(owner, 'card-play', 30, 60_000));
}

/** Optional existing AccountLifecycle.beforeDelete callback; caller owns the PG transaction.
 * Not installed into production auth-runtime here. Rollback includes all removed card data.
 */
export async function eraseCardImports(client: PoolClient, owner: string): Promise<void> {
  // Must run under the lifecycle's account lock, before deleting auth_accounts.
  for (const table of ['group_settings', 'group_messages', 'group_turns', 'group_participant_worldbooks', 'group_participants', 'requests', 'session_worldbooks', 'session_personas', 'sessions', 'persona_versions', 'personas', 'global_worldbooks', 'duplicate_requests', 'links', 'cards', 'imports']) {
    await client.query(`DELETE FROM card_import.${table} WHERE owner_id=$1`, [owner]);
  }
}
