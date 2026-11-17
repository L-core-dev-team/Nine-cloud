import { readFileSync, statSync } from 'node:fs';
import { localProviderOptions } from './local-provider.js';
import { CardError } from './parser.js';
import type { Pool } from 'pg';
import type { CardImportHostOptions } from './host.js';

/** Reject libpq query overrides before constructing a test pool. Never proves database ownership. */
export function assertLocalCardDatabase(raw: string | undefined, database = /^\/jiuxiao_test_[a-z0-9_]+$/): URL {
  let target: URL;
  try { target = new URL(raw || ''); } catch { throw new Error('CARD_TEST_DATABASE_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1' ||
      target.search || target.hash || !database.test(target.pathname)) throw new Error('CARD_TEST_DATABASE_REQUIRED');
  return target;
}

/** Explicit local integration host. Provider requires separate host approval; never installs schema. */
export function localCardOptions(pool: Pool, env: NodeJS.ProcessEnv): CardImportHostOptions | undefined {
  if (!env.CARD_LOCAL_MODE) return undefined;
  if (!['synthetic','provider'].includes(env.CARD_LOCAL_MODE) || !['development', 'test'].includes(env.NODE_ENV ?? '') ||
      !['127.0.0.1', 'localhost'].includes(env.API_HOST || '127.0.0.1')) throw new Error('CARD_LOCAL_ONLY');
  assertLocalCardDatabase(env.DATABASE_URL);
  if(env.CARD_LOCAL_MODE==='provider') {
    try {
      if(!env.CARD_LOCAL_CONFIG || statSync(env.CARD_LOCAL_CONFIG).size>16000)throw Error();
      return localProviderOptions(pool,JSON.parse(readFileSync(env.CARD_LOCAL_CONFIG,'utf8')),{NARRATIVE_KEY_CARD_LOCAL:env.NARRATIVE_KEY_CARD_LOCAL});
    }catch {
      return {pool,modelAccess:{status:async()=>({mode:'provider',available:false,reason:'MODEL_CONFIG_INVALID'}),admit:async()=>{throw new CardError('MODEL_CONFIG_INVALID',503);},fits:()=>false}};
    }
  }
  return { pool, model: async (input, signal) => {
    signal.throwIfAborted();
    const last = input.messages.at(-1);
    let payload: { output_contract?: string; selected_participant_ids?: string[] } = {};
    try { payload = JSON.parse(last?.content ?? ''); } catch { /* Single speaker context. */ }
    return payload.output_contract?.startsWith('JSON object')
      ? JSON.stringify({ messages: (payload.selected_participant_ids ?? []).map(participantId => ({ participantId, text: '本地合成群聊回复（非真实模型）' })) })
      : '本地合成回复（非真实模型）';
  } };
}

export async function verifyLocalCardSchema(pool: Pool): Promise<void> {
  // Read-only preflight. The separately reviewed test installer owns DDL.
  await pool.query('SELECT greeting_index, recursive_worldbook FROM card_import.sessions LIMIT 0');
  await pool.query('SELECT * FROM card_import.group_settings LIMIT 0');
  await pool.query('SELECT model_snapshot FROM card_import.requests LIMIT 0');
  await pool.query('SELECT used,binding FROM card_import.model_allowances LIMIT 0');
}
