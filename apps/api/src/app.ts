import { Hono } from 'hono';
import { mountServerTurnRoutes, type ServerTurnRouteDependencies } from './routes/turns.js';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';
import type { CloudSaveService } from './services/cloud-save-service.js';
import { mountCloudSaveRoutes, type CloudSaveRouteAuth } from './routes/saves.js';
import { mountAuth } from './routes/auth.js';
import type { AuthSessionService } from './routes/auth.js';
import { mountSupabasePhoneAuth } from './routes/supabase-auth.js';
import type { SupabaseAuthService } from './services/supabase-auth.js';
import type { CloudArchiveLifecycle } from './services/cloud-archive-lifecycle.js';
import { mountAccount } from './routes/account.js';
import type { AccountLifecycle } from './services/account-lifecycle.js';
import type { AccountExport } from './services/account-export.js';
import {mountGames} from './routes/games.js';
import type {AuthoritativeGameService} from './services/authoritative-game.js';
import type { AuthorizedRecallPageReader } from './services/npc-memory-recall.js';
import type { AccountQuotaLimiter } from './services/account-rate-limit.js';

export type ReadinessDatabase = {
  query: (sql: string) => Promise<unknown>;
};

export function createApp(database?: ReadinessDatabase, cloudSaves?: {
  service: CloudSaveService;
  auth: CloudSaveRouteAuth;
  archive?: CloudArchiveLifecycle;
}, emailAuth?: { service: AuthSessionService; routesService?: AuthSessionService; supabaseAuth?: SupabaseAuthService | undefined; origin: string; cookieSameSite?: 'Strict' | 'None'; trustedProxyAddresses?: readonly string[]; privacyPolicyUrl?: string | null; privacyPolicyVersion?: string | null; lifecycle?: AccountLifecycle; exporter?: AccountExport; accountQuota?: AccountQuotaLimiter }, turns?: ServerTurnRouteDependencies & {games?:AuthoritativeGameService;memoryRecall?:{reader:AuthorizedRecallPageReader}|undefined}) {
  const app = new Hono();
  if (emailAuth) mountAuth(app, emailAuth.routesService ?? emailAuth.service, emailAuth.origin, emailAuth.cookieSameSite, emailAuth.trustedProxyAddresses,
    () => ({ ...(emailAuth.supabaseAuth?.providers() ?? { email: true, phone: false }),
      privacyPolicyUrl: emailAuth.privacyPolicyUrl ?? null, privacyPolicyVersion: emailAuth.privacyPolicyVersion ?? null }));
  if (emailAuth?.supabaseAuth) mountSupabasePhoneAuth(app, emailAuth.supabaseAuth, emailAuth.service, emailAuth.origin, emailAuth.cookieSameSite, emailAuth.trustedProxyAddresses);
  if (emailAuth?.lifecycle && emailAuth.exporter) mountAccount(app, emailAuth.service, emailAuth.lifecycle, emailAuth.exporter, emailAuth.origin, emailAuth.cookieSameSite, emailAuth.accountQuota);

  app.get('/health', c => c.json({ status: 'ok', service: 'jiuxiao-api',
    saveSchemaVersion: SAVE_SCHEMA_VERSION }));

  app.get('/ready', async c => {
    if (!database) {
      return c.json({ status: 'not_ready', service: 'jiuxiao-api', dependency: 'database' }, 503);
    }
    try {
      await database.query('SELECT 1');
      return c.json({ status: 'ready', service: 'jiuxiao-api', dependencies: { database: 'ok' } });
    } catch {
      return c.json({ status: 'not_ready', service: 'jiuxiao-api', dependency: 'database' }, 503);
    }
  });

  // Business save routes exist only when the host supplies a verified session
  // resolver. The production entry point supplies it only when auth is enabled.
  if (cloudSaves) mountCloudSaveRoutes(app, cloudSaves);
  if (turns) mountServerTurnRoutes(app, turns);
  if (turns?.games) mountGames(app,turns.games,turns.auth,turns.service,turns.memoryRecall);

  app.notFound(c => c.json({ code: 'NOT_FOUND', message: '接口不存在。' }, 404));
  return app;
}

export const app = createApp();
