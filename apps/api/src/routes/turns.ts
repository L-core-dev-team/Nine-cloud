import type { Hono } from 'hono';
import { ActionIntentSchema } from '@jiuxiao/contracts';
import { readJson, type CloudSaveRouteAuth } from './saves.js';
import type { ServerTurnService } from '../services/server-turn.js';
import { consumeAccountQuota } from '../services/account-rate-limit.js';
import { SaveSchemaNotReadyError } from '../services/save-storage-contract.js';

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
      switch (result.status) {
        case 'not_found': return c.json({ code: 'NOT_FOUND' }, 404);
        case 'client_archive': return c.json({ code: 'CLIENT_ARCHIVE_NOT_AUTHORITATIVE' }, 400);
        case 'rules_not_ready': return c.json({ code: 'RULES_NOT_READY' }, 503);
        case 'version_mismatch': return c.json({ code: 'VERSION_MISMATCH' }, 409);
        case 'idempotency_conflict': return c.json({ code: 'IDEMPOTENCY_CONFLICT' }, 409);
        case 'clarification_conflict': return c.json({ code: 'CLARIFICATION_CONFLICT' }, 409);
        case 'revision_conflict': return c.json({ code: 'REVISION_CONFLICT', currentRevision: result.currentRevision }, 409);
        default: return c.json(result);
      }
    } catch (error) {
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'TURN_UNAVAILABLE' }, 503);
    }
  });
}
