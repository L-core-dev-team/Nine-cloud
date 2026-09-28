import type { Context, Hono } from 'hono';
import type { CloudSaveService } from '../services/cloud-save-service.js';

const MAX_REQUEST_BYTES = 1_000_000;

export type CloudSaveRouteAuth = {
  /** Resolve only a server-verified session. Never read owner IDs from the request. */
  resolveOwnerId(request: Request): Promise<string | null>;
};

type RouteDependencies = { service: CloudSaveService; auth: CloudSaveRouteAuth };

async function ownerFor(request: Request, auth: CloudSaveRouteAuth): Promise<string | null> {
  try {
    const ownerId = await auth.resolveOwnerId(request);
    return typeof ownerId === 'string' && ownerId.trim() && ownerId.length <= 200 ? ownerId : null;
  } catch {
    return null;
  }
}

type JsonBodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

async function readJson(request: Request): Promise<JsonBodyResult> {
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader)) return { ok: false, status: 400 };
    const contentLength = Number(lengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) return { ok: false, status: 400 };
    if (contentLength > MAX_REQUEST_BYTES) return { ok: false, status: 413 };
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
      if (byteLength > MAX_REQUEST_BYTES) {
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
  if (error instanceof TypeError) {
    return Response.json({ code: 'INVALID_SAVE', message: '存档内容不符合当前版本要求。' }, { status: 400 });
  }
  return Response.json({ code: 'INTERNAL_ERROR', message: '存档服务暂不可用。' }, { status: 500 });
}

export function mountCloudSaveRoutes(app: Hono, { service, auth }: RouteDependencies): void {
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
      return c.json({ code: 'NOT_FOUND' }, 404);
    } catch (error) { return publicError(error); }
  });
}
