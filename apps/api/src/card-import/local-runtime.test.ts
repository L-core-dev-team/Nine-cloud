import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { localCardOptions } from './local-runtime.js';
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
});
