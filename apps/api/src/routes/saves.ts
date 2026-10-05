import type { Context, Hono } from 'hono';
import { CloudCapacityError, type CloudSaveService } from '../services/cloud-save-service.js';
import type { CloudArchiveLifecycle } from '../services/cloud-archive-lifecycle.js';
import { SaveSchemaNotReadyError } from '../services/save-storage-contract.js';

const MAX_REQUEST_BYTES = 1_000_000;

export type CloudSaveRouteAuth = {
  /** Resolve only a server-verified session. Never read owner IDs from the request. */
  resolveOwnerId(request: Request): Promise<string | null>;
};

type RouteDependencies = { service: CloudSaveService; auth: CloudSaveRouteAuth; archive?: CloudArchiveLifecycle };

async function ownerFor(request: Request, auth: CloudSaveRouteAuth): Promise<string | null> {
  try {
    const ownerId = await auth.resolveOwnerId(request);
    // A tab queued under account A must not upload into account B after cookie/account switching.
    const expectedOwner = request.headers.get('x-jiuxiao-account');
    if (expectedOwner !== null && expectedOwner !== ownerId) return null;
    return typeof ownerId === 'string' && ownerId.trim() && ownerId.length <= 200 ? ownerId : null;
  } catch {
    return null;
  }
}

type JsonBodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

export async function readJson(request: Request, maximumBytes = MAX_REQUEST_BYTES): Promise<JsonBodyResult> {
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader)) return { ok: false, status: 400 };
    const contentLength = Number(lengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) return { ok: false, status: 400 };
    if (contentLength > maximumBytes) return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return { ok: false, status: 400 }; }
  try { return { ok: true, value: JSON.parse(text) as unknown }; }
  catch { return { ok: false, status: 400 }; }
}

function invalidBody(c: Context, status: 400 | 413) {
  return status === 413
    ? c.json({ code: 'REQUEST_TOO_LARGE', message: '存档请求超过 1 MB 上限。' }, 413)
    : c.json({ code: 'INVALID_SAVE', message: '存档请求格式无效。' }, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicError(error: unknown): Response {
  if (error instanceof SaveSchemaNotReadyError) {
    return Response.json({ code: 'SAVE_SCHEMA_NOT_READY', message: '当前云端存储结构尚未支持该存档版本，存档未写入。' }, { status: 503 });
  }
  if (error instanceof CloudCapacityError) {
    return Response.json({ code: 'CAPACITY_EXCEEDED', message: '云端存档已达到数量或容量上限。请整理存档后重试。' }, { status: 413 });
  }
  if (error instanceof Error && error.message === 'DATA_POLICY_NOT_READY') {
    return Response.json({ code: 'DATA_POLICY_NOT_READY' }, { status: 503 });
  }
  if (error instanceof TypeError) {
    return Response.json({ code: 'INVALID_SAVE', message: '存档内容不符合当前版本要求。' }, { status: 400 });
  }
  return Response.json({ code: 'INTERNAL_ERROR', message: '存档服务暂不可用。' }, { status: 500 });
}

export function mountCloudSaveRoutes(app: Hono, { service, auth, archive }: RouteDependencies): void {
  if (archive) {
    app.get('/api/save-trash', async c => {
      const ownerId = await ownerFor(c.req.raw, auth);
      if (!ownerId) return c.json({ code: 'UNAUTHENTICATED' }, 401);
      const offset = c.req.query('offset') ?? '0';
      if (!/^\d+$/.test(offset) || Number(offset) > 100000) return c.json({ code: 'INVALID_PAGINATION' }, 400);
      try { return c.json(await archive.list(ownerId, Number(offset))); } catch (error) { return publicError(error); }
    });
    for (const operation of ['delete', 'restore'] as const) {
      const path = operation === 'delete' ? '/api/saves/:saveId' : '/api/save-trash/:saveId/restore';
      app.on(operation === 'delete' ? 'DELETE' : 'POST', path, async c => {
        const ownerId = await ownerFor(c.req.raw, auth);
        if (!ownerId) return c.json({ code: 'UNAUTHENTICATED' }, 401);
        const body = await readJson(c.req.raw);
        if (!body.ok) return invalidBody(c, body.status);
        if (!isRecord(body.value) || !Number.isSafeInteger(body.value.expectedRevision)) return c.json({ code: 'INVALID_REVISION' }, 400);
        try {
          const result = await archive.change(ownerId, c.req.param('saveId'), body.value.expectedRevision as number, operation);
          if (result.kind === 'not_found') return c.json({ code: 'NOT_FOUND' }, 404);
          if (result.kind === 'conflict') return c.json({ code: 'REVISION_CONFLICT' }, 409);
          return c.json(result);
        } catch (error) { return publicError(error); }
      });
    }
  }
  app.get('/api/save-index', async c => {
    const ownerId = await ownerFor(c.req.raw, auth);
    if (!ownerId) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    const offset = c.req.query('offset') ?? '0', limit = c.req.query('limit') ?? '20';
    if (!/^\d+$/.test(offset) || !/^\d+$/.test(limit)) return c.json({ code: 'INVALID_PAGINATION' }, 400);
    try { return c.json(await service.archiveIndex(ownerId, Number(offset), Number(limit))); }
    catch (error) { return publicError(error); }
  });
  app.get('/api/saves', async c => {
    const ownerId = await ownerFor(c.req.raw, auth);
    if (!ownerId) return c.json({ code: 'UNAUTHENTICATED', message: '请先登录。' }, 401);
    try { return c.json({ saves: await service.list(ownerId) }); }
    catch (error) { return publicError(error); }
  });

  app.post('/api/saves', async c => {
    const ownerId = await ownerFor(c.req.raw, auth);
    if (!ownerId) return c.json({ code: 'UNAUTHENTICATED', message: '请先登录。' }, 401);
    const body = await readJson(c.req.raw);
    if (!body.ok) return invalidBody(c, body.status);
    if (!isRecord(body.value) || !('save' in body.value)) return c.json({ code: 'INVALID_SAVE', message: '存档请求格式无效。' }, 400);
    try {
      const result = await service.create(ownerId, body.value.save);
      if (result.kind === 'created') return c.json({ save: result.save }, 201);
      return c.json({ code: 'SAVE_CONFLICT' }, 409);
    } catch (error) { return publicError(error); }
  });

  app.get('/api/saves/:saveId', async c => {
    const ownerId = await ownerFor(c.req.raw, auth);
    if (!ownerId) return c.json({ code: 'UNAUTHENTICATED', message: '请先登录。' }, 401);
    try {
      const save = await service.get(ownerId, c.req.param('saveId'));
      return save ? c.json({ save }) : c.json({ code: 'NOT_FOUND' }, 404);
    } catch (error) { return publicError(error); }
  });

  app.put('/api/saves/:saveId', async c => {
    const ownerId = await ownerFor(c.req.raw, auth);
    if (!ownerId) return c.json({ code: 'UNAUTHENTICATED', message: '请先登录。' }, 401);
    const body = await readJson(c.req.raw);
    if (!body.ok) return invalidBody(c, body.status);
    if (!isRecord(body.value) || !('save' in body.value) || !Number.isSafeInteger(body.value.expectedRevision)) {
      return c.json({ code: 'INVALID_SAVE', message: '存档请求格式无效。' }, 400);
    }
    try {
      const result = await service.replace(ownerId, c.req.param('saveId'), body.value.expectedRevision as number, body.value.save);
      if (result.kind === 'updated') return c.json({ save: result.save });
      if (result.kind === 'conflict') return c.json({ code: 'REVISION_CONFLICT', currentRevision: result.currentRevision }, 409);
      if (result.kind === 'schema_version_conflict') return c.json({ code: 'SAVE_SCHEMA_VERSION_IMMUTABLE' }, 409);
      if (result.kind === 'memory_policy_pinned') return c.json({ code: 'SAVE_MEMORY_POLICY_PINNED' }, 409);
      return c.json({ code: 'NOT_FOUND' }, 404);
    } catch (error) { return publicError(error); }
  });
}
