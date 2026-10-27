import { Hono } from 'hono';
import { readJson, type CloudSaveRouteAuth } from '../routes/saves.js';
import { base64, CardError, record } from './parser.js';
import { CardImportService } from './service.js';
const uuid = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) throw new CardError('INVALID_ID');
  return v;
};
const str = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || v.includes('\0') || v.length > max) throw new CardError('INVALID_TEXT');
  return v;
};
const integer = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new CardError('INVALID_REVISION');
  return v;
};
async function body(r: Request) {
  const result = await readJson(r, 12_000_000);
  if (!result.ok) throw new CardError('INVALID_BODY', result.status);
  if (!record(result.value)) throw new CardError('INVALID_BODY');
  return result.value;
}
/** Unmounted independent router. Host supplies trusted authentication and model. */
export function createCardImportRouter(service: CardImportService, auth: CloudSaveRouteAuth, origin: string, allowAction?: (owner: string) => Promise<boolean>) {
  if (new URL(origin).origin !== origin) throw new Error('Expected exact trusted origin');
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('Origin') !== origin) return c.json({ error: 'ORIGIN_REJECTED' }, 403);
    const owner = await auth.resolveOwnerId(c.req.raw);
    if (typeof owner !== 'string' || !owner.trim() || owner.length > 200) return c.json({ error: 'AUTH_REQUIRED' }, 401);
    const hint = c.req.header('x-jiuxiao-account');
    if (hint && hint !== owner) return c.json({ error: 'ACCOUNT_MISMATCH' }, 403);
    c.set('owner', owner); await next();
  });
  app.onError((e, c) => c.json({ error: e instanceof CardError ? e.code : 'INTERNAL_ERROR' }, (e instanceof CardError ? e.status : 500) as 400));
  app.post('/imports', async c => {
    const b = await body(c.req.raw);
    if (b.rightsConfirmed !== true) throw new CardError('RIGHTS_CONFIRMATION_REQUIRED');
    if (!['card', 'worldbook', 'attachment'].includes(String(b.kind))) throw new CardError('INVALID_KIND');
    return c.json(await service.preview(c.get('owner'), str(b.filename, 255), b.kind as 'card' | 'worldbook' | 'attachment', base64(str(b.bytesBase64, 11_200_000))));
  });
  app.get('/imports', async c => c.json(await service.imports(c.get('owner'))));
  app.get('/sessions', async c => c.json(await service.sessions(c.get('owner'))));
  app.get('/imports/:id', async c => {
    const r = await service.readImport(c.get('owner'), uuid(c.req.param('id')));
    return c.json({ id: r.id, sha256: r.sha256, filename: r.filename, kind: r.kind, parsed: r.parsed, error: r.error });
  });
  app.get('/imports/:id/original', async c => {
    const r = await service.readImport(c.get('owner'), uuid(c.req.param('id')));
    return new Response(new Uint8Array(r.original), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="original.bin"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
  app.post('/cards', async c => {
    const b = await body(c.req.raw);
    if (!Array.isArray(b.links) || b.links.length > 32) throw new CardError('INVALID_LINKS');
    const links = b.links.map(l => { if (!record(l)) throw new CardError('INVALID_LINKS'); return { importId: uuid(l.importId), uri: str(l.uri, 2048) }; });
    return c.json(await service.confirm(c.get('owner'), { importId: uuid(b.importId), parentId: b.parentId == null ? null : uuid(b.parentId), source: str(b.source, 2048), notes: str(b.notes, 8000), links }));
  });
  app.get('/cards', async c => c.json(await service.cards(c.get('owner'))));
  app.get('/cards/:id', async c => c.json(await service.card(c.get('owner'), uuid(c.req.param('id')))));
  app.post('/sessions', async c => { const b = await body(c.req.raw); return c.json(await service.createSession(c.get('owner'), uuid(b.id), uuid(b.cardId))); });
  app.get('/sessions/:id', async c => c.json(await service.session(c.get('owner'), uuid(c.req.param('id')))));
  app.get('/sessions/:id/history', async c => c.json(await service.history(c.get('owner'), uuid(c.req.param('id')), integer(Number(c.req.query('after') ?? 0)))));
  app.post('/sessions/:id/actions', async c => {
    const b = await body(c.req.raw), action = str(b.action, 8000);
    if (!action.trim()) throw new CardError('EMPTY_ACTION');
    if (allowAction && !await allowAction(c.get('owner'))) throw new CardError('RATE_LIMITED', 429);
    return c.json(await service.act(c.get('owner'), uuid(c.req.param('id')), uuid(b.idempotencyKey), integer(b.expectedRevision), action));
  });
  app.get('/sessions/:id/requests/:key', async c => c.json(await service.request(c.get('owner'), uuid(c.req.param('id')), uuid(c.req.param('key')))));
  app.post('/sessions/:id/requests/:key/recover', async c => c.json(await service.recover(c.get('owner'), uuid(c.req.param('id')), uuid(c.req.param('key')))));
  for (const type of ['imports', 'cards', 'sessions'] as const) app.delete(`/${type}/:id`, async c => { await service.remove(c.get('owner'), type, uuid(c.req.param('id'))); return c.body(null, 204); });
  return app;
}
