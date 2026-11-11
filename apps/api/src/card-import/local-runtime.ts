import type { Pool } from 'pg';
import type { CardImportHostOptions } from './host.js';

/** Explicit local integration host. Never enables paid requests or installs schema. */
export function localCardOptions(pool: Pool, env: NodeJS.ProcessEnv): CardImportHostOptions | undefined {
  if (!env.CARD_LOCAL_MODE) return undefined;
  if (env.CARD_LOCAL_MODE !== 'synthetic' || !['development', 'test'].includes(env.NODE_ENV ?? '') ||
      !['127.0.0.1', 'localhost'].includes(env.API_HOST || '127.0.0.1')) throw new Error('CARD_LOCAL_ONLY');
  const target = new URL(env.DATABASE_URL || '');
  if (target.hostname !== '127.0.0.1' || !/^\/jiuxiao_test_[a-z0-9_]+$/.test(target.pathname)) throw new Error('CARD_TEST_DATABASE_REQUIRED');
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
}
