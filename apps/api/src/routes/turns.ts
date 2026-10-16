import { TurnCommitOutcomeUnknown } from '../services/npc-memory-turn-transaction.js';
import type { Hono } from 'hono';
import { ActionIntentSchema } from '@jiuxiao/contracts';
import { readJson, type CloudSaveRouteAuth } from './saves.js';
import type { ServerTurnService } from '../services/server-turn.js';
import { consumeAccountQuota } from '../services/account-rate-limit.js';
import { SaveSchemaNotReadyError } from '../services/save-storage-contract.js';
import { serverTurnHttpResponse } from './turn-http.js';

export type ServerTurnRouteDependencies = { service: ServerTurnService; auth: CloudSaveRouteAuth };
/** Client submits only an intent. Decisions, events, state and visibility stay server-owned. */
export function mountServerTurnRoutes(app: Hono, { service, auth }: ServerTurnRouteDependencies) {
  app.post('/api/turns', async c => {
    let owner: string | null;
    try { owner = await auth.resolveOwnerId(c.req.raw); } catch { owner = null; }
    const expected = c.req.header('x-jiuxiao-account');
    if (!owner || !owner.trim() || owner.length > 200 || (expected !== undefined && expected !== owner)) {
      return c.json({ code: 'UNAUTHENTICATED' }, 401);
    }
    // SEC-08: bound narrative waits per account (a requestNarrative=true probe can hold a worker up to 20 s).
    if (!await consumeAccountQuota(owner, 'turn', 30, 60_000)) return c.json({ code: 'RATE_LIMITED' }, 429);
    const body = await readJson(c.req.raw, 16_384);
    if (!body.ok) return c.json({ code: body.status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_TURN' }, body.status);
    if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) return c.json({ code: 'INVALID_TURN' }, 400);
    const value = body.value as Record<string, unknown>;
    if (Object.keys(value).some(key => key !== 'intent' && key !== 'requestNarrative') ||
        (value.requestNarrative !== undefined && typeof value.requestNarrative !== 'boolean')) return c.json({ code: 'INVALID_TURN' }, 400);
    const intent = ActionIntentSchema.safeParse(value.intent);
    if (!intent.success) return c.json({ code: 'INVALID_TURN' }, 400);
    try {
      const result = await service.execute(owner, intent.data, value.requestNarrative === true, c.req.raw.signal);
      const response = serverTurnHttpResponse(result);
      return c.json(response.body, response.status);
    } catch (error) {
      if (error instanceof TurnCommitOutcomeUnknown) return c.json({code:'TURN_COMMIT_OUTCOME_UNKNOWN',
        saveId:error.saveId,requestKey:error.requestKey,recovery:'query_original_receipt'},503);
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'TURN_UNAVAILABLE' }, 503);
    }
  });
}
