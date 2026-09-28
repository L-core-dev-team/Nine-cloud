import { Hono } from 'hono';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';

export type ReadinessDatabase = {
  query: (sql: string) => Promise<unknown>;
};

export function createApp(database?: ReadinessDatabase) {
  const app = new Hono();

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

  app.notFound(c => c.json({ code: 'NOT_FOUND', message: '接口不存在。' }, 404));
  return app;
}

export const app = createApp();
