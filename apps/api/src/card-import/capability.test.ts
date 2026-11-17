import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import type { AuthSessionService } from '../routes/auth.js';

describe('host-derived card availability', () => {
  const auth = { service: { resolve: async () => null } as unknown as AuthSessionService, origin: 'https://fixture.example.invalid' };
  it('does not advertise or mount cards without the explicit host dependency', async () => {
    expect((await createApp().request('/api/auth/providers')).status).toBe(404);
    const app = createApp(undefined, undefined, auth);
    const response = await app.request('/api/auth/providers?cardImport=true', { headers: { 'x-card-import': 'true' } });
    expect(await response.json()).toMatchObject({ cardImport: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await app.request('/api/card-import/cards')).status).toBe(404);
  });
  it('advertises a mounted host without granting authentication or initializing the database', async () => {
    const query = vi.fn(() => { throw Error('UNEXPECTED_DATABASE_ACCESS'); });
    const app = createApp(undefined, undefined, auth, undefined, { pool: { query } as unknown as Pool });
    expect(await (await app.request('/api/auth/providers')).json()).toMatchObject({ cardImport: true });
    expect((await app.request('/api/card-import/cards')).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
