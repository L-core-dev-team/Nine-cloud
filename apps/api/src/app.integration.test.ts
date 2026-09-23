import { describe, expect, it } from 'vitest';
import { app } from './app.js';

describe('HTTP foundation', () => {
  it('returns a versioned health response without database credentials', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'jiuxiao-api', saveSchemaVersion: 1 });
  });
  it('does not expose unfinished save or auth routes', async () => {
    const response = await app.request('/api/saves');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});
