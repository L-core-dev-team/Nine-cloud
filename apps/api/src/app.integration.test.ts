import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '@jiuxiao/contracts';
import { app, createApp } from './app.js';

describe('HTTP foundation', () => {
  it('returns a versioned health response without database credentials', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'jiuxiao-api', saveSchemaVersion: SAVE_SCHEMA_VERSION });
  });
  it('does not expose unfinished save or auth routes', async () => {
    const response = await app.request('/api/saves');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
  it('does not report readiness when no database adapter is configured', async () => {
    const response = await app.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'not_ready', dependency: 'database' });
  });
  it('reports readiness only after the database responds', async () => {
    let queried = false;
    const readyApp = createApp({
      query: async sql => {
        expect(sql).toBe('SELECT 1');
        queried = true;
      },
    });
    const response = await readyApp.request('/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready', dependencies: { database: 'ok' } });
    expect(queried).toBe(true);
  });
  it('keeps dependency errors private and marks readiness unavailable', async () => {
    const unavailableApp = createApp({ query: async () => { throw new Error('private connection detail'); } });
    const response = await unavailableApp.request('/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'not_ready', service: 'jiuxiao-api', dependency: 'database',
    });
  });
});
