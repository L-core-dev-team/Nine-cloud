import { TurnCommitOutcomeUnknown } from '../services/npc-memory-turn-transaction.js';
import type { Hono } from 'hono';
import { ActionIntentSchema, TurnReceiptSchema, type TurnReceipt } from '@jiuxiao/contracts';
import { readGameMinute } from '@jiuxiao/domain';
import { readJson, type CloudSaveRouteAuth } from './saves.js';
import { serverTurnHttpResponse } from './turn-http.js';
import type { AuthoritativeGameService } from '../services/authoritative-game.js';
import { consumeAccountQuota } from '../services/account-rate-limit.js';
import { CloudCapacityError } from '../services/cloud-save-service.js';
import { NPC_MEMORY_RECALL_POLICY, resolveNpcMemoryRecall, type AuthorizedRecallPageReader } from '../services/npc-memory-recall.js';
import type { ServerTurnService } from '../services/server-turn.js';
import { SaveSchemaNotReadyError } from '../services/save-storage-contract.js';

export function mountGames(
  app: Hono,
  service: AuthoritativeGameService,
  auth: CloudSaveRouteAuth,
  turns?: ServerTurnService,
  memoryRecall?: { reader: AuthorizedRecallPageReader },
  readReceipt?: (owner: string, saveId: string, key: string) => Promise<TurnReceipt | null>,
  publicationsAvailable = false,
) {
  // Recovery is read-only. Absence is NOT proof that an in-flight turn was never sent.
  if (readReceipt) app.get('/api/games/:saveId/receipts/:key', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(c.req.param('key'))) return c.json({ code: 'INVALID_TURN' }, 400);
    try {
      const game = await service.read(owner, c.req.param('saveId'));
      if (game.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      const raw = await readReceipt(owner, game.save.saveId, c.req.param('key'));
      const receipt = raw ? TurnReceiptSchema.parse(raw) : null;
      if (receipt && (receipt.saveId !== game.save.saveId || receipt.idempotencyKey !== c.req.param('key'))) throw Error('INVALID_RECEIPT');
      return c.json({ status: receipt ? 'confirmed' : 'unknown', receipt, revision: game.save.revision });
    } catch { return c.json({ code: 'GAME_UNAVAILABLE' }, 503); }
  });
  app.get('/api/games/:saveId', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      const result = await service.read(owner, c.req.param('saveId'));
      if (result.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      return c.json({ save: result.save, ...(publicationsAvailable ? {publicationsAvailable:true} : {}) });
    } catch (error) {
      if (error instanceof TurnCommitOutcomeUnknown) return c.json({code:'TURN_COMMIT_OUTCOME_UNKNOWN',
        saveId:error.saveId,requestKey:error.requestKey,recovery:'query_original_receipt'},503);
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

  // P4: read-only authorized memory recall. It never writes state, grants, or receipts.
  if (memoryRecall) app.get('/api/games/:saveId/npcs/:npcId/memory-recall', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    if (!await consumeAccountQuota(owner, 'recall', 60, 3_600_000)) return c.json({ code: 'RATE_LIMITED' }, 429);
    const npcId = c.req.param('npcId');
    if (!npcId.trim() || npcId.length > 200) return c.json({ code: 'NOT_FOUND' }, 404);
    const utterance = c.req.query('utterance');
    if (typeof utterance !== 'string' || !utterance.trim() || utterance.length > 8_000) return c.json({ recall: null });
    try {
      const game = await service.read(owner, c.req.param('saveId'));
      if (game.status === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
      // P4 plan B (2026-10-10): v2 forgetting saves answer through the decay gate.
      // Old v1-artifact forgetting saves cannot upgrade (pinned at creation), so
      // they are still refused honestly instead of silently degrading.
      if ('memoryMode' in game.save && game.save.memoryMode === 'forgetting'
        && game.save.memoryPolicy.retrievalVersion !== NPC_MEMORY_RECALL_POLICY.retrievalVersion) {
        return c.json({ code: 'RECALL_MODE_UNAVAILABLE' }, 503);
      }
      const save = game.save;
      // The current committed revision is the recall boundary. The read is a partial
      // TurnReceipt projection; resolveNpcMemoryRecall only consumes these fields.
      const receipt = {
        saveId: save.saveId, branchId: 'root' as const, resultingRevision: save.revision,
        ...(save.schemaVersion === 1 ? {} : { clockMinute: readGameMinute(save.state) }),
      } as TurnReceipt;
      const recall = await resolveNpcMemoryRecall({ reader: memoryRecall.reader, ownerId: owner, save, receipt, npcId, utterance });
      return c.json({ recall });
    } catch (error) {
      if (error instanceof TurnCommitOutcomeUnknown) return c.json({code:'TURN_COMMIT_OUTCOME_UNKNOWN',
        saveId:error.saveId,requestKey:error.requestKey,recovery:'query_original_receipt'},503);
      if (error instanceof SaveSchemaNotReadyError) return c.json({ code: 'SAVE_SCHEMA_NOT_READY' }, 503);
      return c.json({ code: 'GAME_UNAVAILABLE' }, 503);
    }
  });

  if (turns) app.post('/api/games/:saveId/turns', async c => {
    const owner = await resolveOwner(c.req.raw, c.req.header('x-jiuxiao-account'), auth);
    if (!owner) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    if (!await consumeAccountQuota(owner, 'turn', 30, 60_000)) return c.json({ code: 'RATE_LIMITED' }, 429);
    const body = await readJson(c.req.raw, 65_536);
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
      if (error instanceof TurnCommitOutcomeUnknown) return c.json({code:'TURN_COMMIT_OUTCOME_UNKNOWN',
        saveId:error.saveId,requestKey:error.requestKey,recovery:'query_original_receipt'},503);
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
      if (error instanceof TurnCommitOutcomeUnknown) return c.json({code:'TURN_COMMIT_OUTCOME_UNKNOWN',
        saveId:error.saveId,requestKey:error.requestKey,recovery:'query_original_receipt'},503);
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
