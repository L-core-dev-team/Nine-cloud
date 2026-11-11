import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { localCardOptions, assertLocalCardDatabase, verifyLocalCardSchema } from './local-runtime.js';
describe('local card admission', () => {
  const pool = {} as Pool;
  const env = { NODE_ENV: 'development', CARD_LOCAL_MODE: 'synthetic', DATABASE_URL: 'postgresql://synthetic@127.0.0.1:55491/jiuxiao_test_local' };
  it('defaults off; refuses production, remote targets and non-synthetic models', () => {
    expect(localCardOptions(pool, {})).toBeUndefined();
    for (const patch of [{ NODE_ENV: 'production' }, { CARD_LOCAL_MODE: 'real' }, { API_HOST: '0.0.0.0' }, { DATABASE_URL: 'postgresql://synthetic@127.0.0.1/production' }]) {
      expect(() => localCardOptions(pool, { ...env, ...patch })).toThrow();
    }
    expect(localCardOptions(pool, env)?.pool).toBe(pool);
  });
  it.each([undefined, 'https://127.0.0.1/jiuxiao_test_local', 'postgresql://user@localhost/jiuxiao_test_local', 'postgresql://user@127.0.0.1/production', 'postgresql://user@127.0.0.1/jiuxiao_test_local?host=example.invalid', 'postgresql://user@127.0.0.1/jiuxiao_test_local?dbname=production', 'postgresql://user@127.0.0.1/jiuxiao_test_local#suffix'])('rejects unsafe test connection %s', url => {
    expect(() => assertLocalCardDatabase(url)).toThrow('CARD_TEST_DATABASE_REQUIRED');
  });
  it('preserves per-suite database restrictions and performs read-only schema checks', async () => {
    expect(() => assertLocalCardDatabase(env.DATABASE_URL, /^\/jiuxiao_test_card_host_\d+$/)).toThrow();
    const queries: string[] = [];
    await verifyLocalCardSchema({ query: async (sql: string) => { queries.push(sql); } } as unknown as Pool);
    expect(queries).toHaveLength(2);
    expect(queries.every(sql => /^SELECT .* LIMIT 0$/.test(sql))).toBe(true);
    await expect(verifyLocalCardSchema({ query: async () => { throw Error('MISSING_SCHEMA'); } } as unknown as Pool)).rejects.toThrow('MISSING_SCHEMA');
  });
});
