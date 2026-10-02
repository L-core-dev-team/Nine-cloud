import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { createApp } from './app.js';
import { createEmailAuthRuntime } from './services/auth-runtime.js';
import { CloudSaveService } from './services/cloud-save-service.js';
import { PostgresCloudSaveRepository } from './services/postgres-cloud-save-repository.js';
import { sessionToken } from './routes/auth.js';
import { CloudArchiveLifecycle } from './services/cloud-archive-lifecycle.js';
import { ServerTurnService } from './services/server-turn.js';
import { createPostgresServerTurnRepository } from './services/postgres-server-turn.js';

const port = Number(process.env.API_PORT ?? 8787);
const hostname = process.env.API_HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3_000 });
pool.on('error', () => { console.error('Database connection unavailable.'); });
const emailAuth = createEmailAuthRuntime(pool, process.env);
const app = createApp({ query: sql => pool.query(sql) }, emailAuth ? {
  service: new CloudSaveService(new PostgresCloudSaveRepository(pool, true), true),
  archive: new CloudArchiveLifecycle(pool, true),
  auth: { resolveOwnerId: async request => (await emailAuth.service.resolve(sessionToken(request)))?.ownerId || null },
} : undefined, emailAuth, emailAuth ? {
  // No author rules are bundled: authenticated requests remain fail closed.
  service: new ServerTurnService(createPostgresServerTurnRepository(pool, true)),
  auth: { resolveOwnerId: async request => (await emailAuth.service.resolve(sessionToken(request)))?.ownerId || null },
} : undefined);

const server = serve({ fetch: app.fetch, port, hostname });
console.log(`jiuxiao-api listening on ${hostname}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => {
    void pool.end().then(
      () => process.exit(0),
      () => {
        console.error('Failed to close the database pool cleanly.');
        process.exit(1);
      },
    );
  }));
}
