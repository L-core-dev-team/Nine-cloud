import { Hono } from 'hono';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';

export const app = new Hono();

app.get('/health', c => c.json({ status: 'ok', service: 'jiuxiao-api',
  saveSchemaVersion: SAVE_SCHEMA_VERSION }));

app.notFound(c => c.json({ code: 'NOT_FOUND', message: '接口不存在。' }, 404));
