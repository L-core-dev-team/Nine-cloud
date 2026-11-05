import { Hono } from 'hono';
import { readJson, type CloudSaveRouteAuth } from '../routes/saves.js';
import { base64, CardError, record } from './parser.js';
import { CardImportService } from './service.js';
import { exportCard } from './export.js';
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
  app.get('/personas',async c=>c.json(await service.personas(c.get('owner'))));
  app.post('/personas',async c=>{const b=await body(c.req.raw);if(!record(b.extensions))throw new CardError('INVALID_PERSONA');return c.json(await service.savePersona(c.get('owner'),uuid(b.id),str(b.name,256),str(b.description,8000),b.extensions,true));});
  app.post('/personas/:id/versions',async c=>{const b=await body(c.req.raw);if(!record(b.extensions))throw new CardError('INVALID_PERSONA');return c.json(await service.savePersona(c.get('owner'),uuid(c.req.param('id')),str(b.name,256),str(b.description,8000),b.extensions,false));});
  app.put('/personas/:id/default',async c=>c.json(await service.defaultPersona(c.get('owner'),uuid(c.req.param('id')))));
  app.delete('/personas/:id',async c=>{await service.deletePersona(c.get('owner'),uuid(c.req.param('id')));return c.body(null,204);});
  app.get('/imports/:id', async c => {
    const r = await service.readImport(c.get('owner'), uuid(c.req.param('id')));
    return c.json({ id: r.id, sha256: r.sha256, filename: r.filename, kind: r.kind, parsed: r.parsed, error: r.error });
  });
  app.get('/imports/:id/original', async c => {
    const r = await service.readImport(c.get('owner'), uuid(c.req.param('id')));
    return new Response(new Uint8Array(r.original), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="original.bin"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  });
  app.get('/imports/:id/worldbook-export', async c => { const r=await service.readImport(c.get('owner'),uuid(c.req.param('id')));if(r.kind!=='worldbook'||!r.parsed?.document)throw new CardError('WORLDBOOK_NOT_READY',409);return new Response(JSON.stringify(r.parsed.document),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="worldbook.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); });
  app.post('/imports/:id/worldbook-versions', async c=>{const b=await body(c.req.raw);if(!record(b.changes))throw new CardError('INVALID_WORLDBOOK_EDIT');return c.json(await service.editWorldbook(c.get('owner'),uuid(c.req.param('id')),b.changes));});
  app.get('/worldbooks/global',async c=>c.json(await service.globalWorldbooks(c.get('owner'))));
  app.post('/worldbooks/global/replace',async c=>{const b=await body(c.req.raw);return c.json(await service.replaceGlobalWorldbook(c.get('owner'),uuid(b.oldId),uuid(b.newId)));});
  app.put('/worldbooks/:id/global',async c=>{const b=await body(c.req.raw);if(typeof b.enabled!=='boolean')throw new CardError('INVALID_WORLDBOOK_SETTING');return c.json(await service.setGlobalWorldbook(c.get('owner'),uuid(c.req.param('id')),b.enabled));});
  app.post('/cards/duplicates',async c=>{const b=await body(c.req.raw);if(b.strategy!=='skip'&&b.strategy!=='update'&&b.strategy!=='copy')throw new CardError('INVALID_DUPLICATE_STRATEGY');return c.json(await service.duplicateCard(c.get('owner'),uuid(b.idempotencyKey),b.strategy,uuid(b.importId),b.targetId==null?null:uuid(b.targetId)));});
  app.post('/cards', async c => {
    const b = await body(c.req.raw);
    if (!Array.isArray(b.links) || b.links.length > 32) throw new CardError('INVALID_LINKS');
    const links = b.links.map(l => { if (!record(l)) throw new CardError('INVALID_LINKS'); return { importId: uuid(l.importId), uri: str(l.uri, 2048) }; });
    return c.json(await service.confirm(c.get('owner'), { importId: uuid(b.importId), parentId: b.parentId == null ? null : uuid(b.parentId), source: str(b.source, 2048), notes: str(b.notes, 8000), links }));
  });
  app.get('/cards', async c => c.json(await service.cards(c.get('owner'))));
  app.get('/library', async c => c.json(await service.library(c.get('owner'),{query:str(c.req.query('q')??'',100),folder:str(c.req.query('folder')??'',100),tag:str(c.req.query('tag')??'',100),favorite:c.req.query('favorite')==='true'})));
  app.get('/library/page', async c => {const cursor=c.req.query('after');let after:{created:string;id:string}|undefined;if(cursor){try{if(cursor.length>256)throw Error();const o=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(!record(o)||typeof o.created!=='string'||Number.isNaN(Date.parse(o.created))||typeof o.id!=='string')throw Error();after={created:o.created,id:uuid(o.id)};}catch{throw new CardError('INVALID_CURSOR');}}const rows=await service.library(c.get('owner'),{query:str(c.req.query('q')??'',100),folder:str(c.req.query('folder')??'',100),tag:str(c.req.query('tag')??'',100),favorite:c.req.query('favorite')==='true'},after);const last=rows.at(-1);return c.json({items:rows,nextCursor:rows.length===100?Buffer.from(JSON.stringify({created:last.cursor_created,id:last.id})).toString('base64url'):null});});
  app.put('/cards/:id/library', async c => {const b=await body(c.req.raw);if(typeof b.favorite!=='boolean'||!Array.isArray(b.tags)||b.tags.some(x=>typeof x!=='string'))throw new CardError('INVALID_LIBRARY');return c.json(await service.updateLibrary(c.get('owner'),uuid(c.req.param('id')),{folder:str(b.folder,100),tags:b.tags as string[],favorite:b.favorite}));});
  app.get('/cards/:id', async c => c.json(await service.card(c.get('owner'), uuid(c.req.param('id')))));
  app.get('/cards/:id/export', async c => { const format=c.req.query('format'); if(format!=='v2'&&format!=='v3'&&format!=='png')throw new CardError('INVALID_EXPORT_FORMAT'); const owner=c.get('owner'),id=uuid(c.req.param('id')),row=await service.card(owner,id); const doc=row.parsed?.document; if(!record(doc))throw new CardError('CARD_NOT_READY',409); const cover=format==='png'?await service.originalPngCover(owner,id):undefined; const bytes=exportCard(doc,format,cover); return new Response(new Uint8Array(bytes),{headers:{'Content-Type':format==='png'?'image/png':'application/json','Content-Disposition':`attachment; filename="card.${format==='png'?'png':'json'}"`,...(format==='png'?{'X-Card-Cover':cover?'original':'default'}:{}),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); });
  app.post('/cards/:id/versions', async c => { const b=await body(c.req.raw); if (!record(b.changes)) throw new CardError('INVALID_CARD_EDIT'); let links: {importId:string;uri:string}[]|undefined; if(b.links!==undefined){if(!Array.isArray(b.links)||b.links.length>32)throw new CardError('INVALID_LINKS');links=b.links.map(l=>{if(!record(l))throw new CardError('INVALID_LINKS');return {importId:uuid(l.importId),uri:str(l.uri,2048)};});} return c.json(await service.editCard(c.get('owner'),uuid(c.req.param('id')),b.changes,links)); });
  app.post('/sessions', async c => { const b = await body(c.req.raw); const index=b.greetingIndex === undefined ? -1 : b.greetingIndex; if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < -1) throw new CardError('INVALID_GREETING'); return c.json(await service.createSession(c.get('owner'), uuid(b.id), uuid(b.cardId), index,b.personaVersionId===undefined?undefined:uuid(b.personaVersionId))); });
  app.post('/group-sessions', async c => { const b=await body(c.req.raw); if(!Array.isArray(b.cardIds))throw new CardError('INVALID_PARTICIPANTS'); const ids=b.cardIds.map(uuid); return c.json(await service.createSession(c.get('owner'),uuid(b.id),ids[0]!, -1,b.personaVersionId===undefined?undefined:uuid(b.personaVersionId),ids)); });
  app.get('/sessions/:id/group', async c => c.json(await service.groupInfo(c.get('owner'),uuid(c.req.param('id')))));
  app.get('/sessions/:id/group-history', async c => c.json(await service.groupHistory(c.get('owner'),uuid(c.req.param('id')),integer(Number(c.req.query('after')??0)))));
  app.post('/sessions/:id/group-actions', async c => { const b=await body(c.req.raw),action=str(b.action,8000); if(!action.trim())throw new CardError('EMPTY_ACTION'); if(b.mode!=='manual'&&b.mode!=='auto'&&b.mode!=='multi')throw new CardError('INVALID_GROUP_MODE'); if(b.participantIds!==undefined&&!Array.isArray(b.participantIds))throw new CardError('INVALID_PARTICIPANTS'); const participantIds=Array.isArray(b.participantIds)?b.participantIds.map(uuid):[]; if(b.mode==='auto'&&participantIds.length)throw new CardError('INVALID_PARTICIPANTS'); if(allowAction&&!await allowAction(c.get('owner')))throw new CardError('RATE_LIMITED',429); return c.json(await service.act(c.get('owner'),uuid(c.req.param('id')),uuid(b.idempotencyKey),integer(b.expectedRevision),action,c.req.raw.signal,{mode:b.mode,participantIds})); });
  app.get('/sessions/:id', async c => c.json(await service.sessionWithGreeting(c.get('owner'), uuid(c.req.param('id')))));
  app.get('/sessions/:id/history', async c => c.json(await service.history(c.get('owner'), uuid(c.req.param('id')), integer(Number(c.req.query('after') ?? 0)))));
  app.post('/sessions/:id/actions', async c => {
    const b = await body(c.req.raw), action = str(b.action, 8000);
    if (!action.trim()) throw new CardError('EMPTY_ACTION');
    if (allowAction && !await allowAction(c.get('owner'))) throw new CardError('RATE_LIMITED', 429);
    return c.json(await service.act(c.get('owner'), uuid(c.req.param('id')), uuid(b.idempotencyKey), integer(b.expectedRevision), action, c.req.raw.signal));
  });
  app.get('/sessions/:id/requests', async c => c.json(await service.recentRequests(c.get('owner'), uuid(c.req.param('id')))));
  app.get('/sessions/:id/requests/:key', async c => c.json(await service.request(c.get('owner'), uuid(c.req.param('id')), uuid(c.req.param('key')))));
  app.post('/sessions/:id/requests/:key/recover', async c => c.json(await service.recover(c.get('owner'), uuid(c.req.param('id')), uuid(c.req.param('key')))));
  for (const type of ['imports', 'cards', 'sessions'] as const) app.delete(`/${type}/:id`, async c => { await service.remove(c.get('owner'), type, uuid(c.req.param('id'))); return c.body(null, 204); });
  return app;
}
