import type { Hono } from 'hono';
import { ActionIntentSchema } from '@jiuxiao/contracts';
import { readJson, type CloudSaveRouteAuth } from './saves.js';
import { serverTurnHttpResponse } from './turn-http.js';
import type { AuthoritativeGameService } from '../services/authoritative-game.js';
import { consumeAccountQuota } from '../services/account-rate-limit.js';
import { CloudCapacityError } from '../services/cloud-save-service.js';
import type { ServerTurnService } from '../services/server-turn.js';
import type { GameplayTurnPresentationService } from '../services/gameplay-turn-presentation.js';
import { SaveSchemaNotReadyError } from '../services/save-storage-contract.js';

export function mountGames(
  app: Hono,
  service: AuthoritativeGameService,
  auth: CloudSaveRouteAuth,
  turns?: ServerTurnService,
  presentation?: GameplayTurnPresentationService,
) {
  app.get('/api/games/:saveId', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      const result = await service.read(owner, c.req.param('saveId'));
      if (result.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      return c.json({ save: result.save });
    } catch (error) {
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'GAME_UNAVAILABLE' }, 503);
    }
  });

  app.get('/api/games/:saveId/action-suggestions', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      const result = await service.actionSuggestions(owner, c.req.param('saveId'));
      if (result.status === 'rules_not_ready') return c.json({ code: 'RULES_NOT_READY' }, 503);
      if (result.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      return c.json(result);
    } catch {
      return c.json({ code: 'GAME_UNAVAILABLE' }, 503);
    }
  });

  if (presentation) app.get('/api/games/:saveId/latest-turn', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      const result = await presentation.latestReceipt(owner, c.req.param('saveId'));
      if (result.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      if (result.status === 'client_archive') return c.json({ code: 'CLIENT_ARCHIVE_NOT_AUTHORITATIVE' }, 400);
      return c.json(result);
    } catch (error) {
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'GAME_UNAVAILABLE' }, 503);
    }
  });

  if (presentation) app.post('/api/games/:saveId/turns/:turnId/narrative', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    if (!await consumeAccountQuota(owner, 'turn', 30, 60_000)) return c.json({ code: 'RATE_LIMITED' }, 429);
    const turnId = c.req.param('turnId');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(turnId)) {
      return c.json({ code: 'INVALID_TURN' }, 400);
    }
    try {
      const result = await presentation.retryNarrative(owner, c.req.param('saveId'), turnId);
      if (result.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      if (result.status === 'client_archive') return c.json({ code: 'CLIENT_ARCHIVE_NOT_AUTHORITATIVE' }, 400);
      if (result.status === 'rules_not_ready') return c.json({ code: 'RULES_NOT_READY' }, 503);
      if (result.status === 'version_mismatch') return c.json({ code: 'VERSION_MISMATCH' }, 409);
      if (result.status === 'revision_conflict') return c.json({ code: 'REVISION_CONFLICT', currentRevision: result.currentRevision }, 409);
      if (result.status === 'narrative_unavailable') return c.json({ code: 'NARRATIVE_UNAVAILABLE' }, 503);
      return c.json(result);
    } catch (error) {
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'NARRATIVE_UNAVAILABLE' }, 503);
    }
  });

  if (turns) app.post('/api/games/:saveId/turns', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    if (!await consumeAccountQuota(owner, 'turn', 30, 60_000)) return c.json({ code: 'RATE_LIMITED' }, 429);
    const body = await readJson(c.req.raw, 16_384);
    if (!body.ok) return c.json({ code: body.status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_TURN' }, body.status);
    const value = body.value as Record<string, unknown> | null;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['text', 'expectedRevision', 'idempotencyKey', 'clarificationOf', 'requestNarrative'].includes(key))
      || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 8_000
      || !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0
      || typeof value.idempotencyKey !== 'string'
      || (value.clarificationOf !== undefined && typeof value.clarificationOf !== 'string')
      || (value.requestNarrative !== undefined && typeof value.requestNarrative !== 'boolean')) {
      return c.json({ code: 'INVALID_TURN' }, 400);
    }
    try {
      const game = await service.read(owner, c.req.param('saveId'));
      if (game.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      const intent = ActionIntentSchema.safeParse({
        kind: 'free_text',
        saveId: game.save.saveId,
        actorId: game.save.state.playerId,
        // P2 gameplay currently supports only the root branch in ActionIntentSchema.
        branchId: 'root',
        expectedRevision: value.expectedRevision,
        idempotencyKey: value.idempotencyKey,
        ...(value.clarificationOf ? { clarificationOf: value.clarificationOf } : {}),
        payload: { text: value.text },
      });
      if (!intent.success) return c.json({ code: 'INVALID_TURN' }, 400);
      const result = await turns.execute(owner, intent.data, value.requestNarrative !== false, c.req.raw.signal);
      const response = serverTurnHttpResponse(result);
      return c.json(response.body, response.status);
    } catch (error) {
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'TURN_UNAVAILABLE' }, 503);
    }
  });

  app.post('/api/games', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    const body = await readJson(c.req.raw, 16_384);
    if (!body.ok) return c.json({ code: 'INVALID_GAME' }, body.status);
    const value = body.value as Record<string, unknown> | null;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['idempotencyKey', 'choices'].includes(key))
      || typeof value.idempotencyKey !== 'string' || !/^\w[\w-]{7,199}$/.test(value.idempotencyKey)
      || !value.choices || typeof value.choices !== 'object' || Array.isArray(value.choices)) {
      return c.json({ code: 'INVALID_GAME' }, 400);
    }
    try {
      const result = await service.create(owner, value.idempotencyKey, value.choices as Record<string, unknown>);
      if (result.status === 'rules_not_ready') return c.json({ code: 'RULES_NOT_READY' }, 503);
      if (result.status === 'invalid_memory_mode') return c.json({ code: 'INVALID_MEMORY_MODE' }, 400);
      if (result.status === 'conflict') return c.json({ code: 'IDEMPOTENCY_CONFLICT' }, 409);
      return c.json(result, result.duplicate ? 200 : 201);
    } catch (error) {
      if (error instanceof CloudCapacityError) return c.json({ code: 'CAPACITY_EXCEEDED' }, 413);
      if (error instanceof Error && error.message === 'DATA_POLICY_NOT_READY') return c.json({ code: 'DATA_POLICY_NOT_READY' }, 503);
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'GAME_UNAVAILABLE' }, 503);
    }
  });
}

async function resolveOwner(request: Request, expected: string | undefined, auth: CloudSaveRouteAuth): Promise<string | null> {
  let owner: string | null;
  try { owner = await auth.resolveOwnerId(request); } catch { owner = null; }
  return owner && owner.trim() && owner.length <= 200 && (expected === undefined || expected === owner) ? owner : null;
}
