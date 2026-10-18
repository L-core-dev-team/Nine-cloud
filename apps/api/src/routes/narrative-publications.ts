import type { Hono } from 'hono';
import type { CloudSaveRouteAuth } from './saves.js';
import type { NarrativePublicationRepository } from '../services/narrative-publication-repository.js';

/** Owner identity is supplied only by the existing verified-session resolver. No mutation routes. */
export function mountNarrativePublications(app: Hono, auth: CloudSaveRouteAuth, repository: NarrativePublicationRepository) {
  for (const [path, kind] of [
    ['/api/games/:saveId/presentations', 'history'],
    ['/api/games/:saveId/receipts/:key/presentation', 'presentation'],
    ['/api/games/:saveId/sources/:key', 'source'],
  ] as const) app.get(path, async c => {
    c.header('Cache-Control', 'private, no-store'); c.header('Vary', 'Cookie, Authorization, X-Jiuxiao-Account');
    try {
      const owner = await auth.resolveOwnerId(c.req.raw);
      const expected = c.req.header('x-jiuxiao-account');
      if (!owner || (expected !== undefined && owner !== expected)) return c.json({ code: 'UNAUTHENTICATED' }, 401);
      const save = c.req.param('saveId'), key = c.req.param('key');
      if (!save || save.length > 200 || (kind !== 'history' && (!key || key.length > 128))) return c.json({ code: 'NOT_FOUND' }, 404);
      const cursor=c.req.query('beforeRevision');
      if(kind==='history' && cursor!==undefined && !/^\d{1,10}$/.test(cursor))return c.json({code:'INVALID_CURSOR'},400);
      const value = kind === 'history' ? await repository.history(owner,save,cursor===undefined?undefined:Number(cursor))
        : kind === 'source' ? await repository.source(owner, save, key!) : await repository.presentation(owner, save, key!);
      if (!value) return c.json({ code: 'NOT_FOUND' }, 404);
      return c.json(value);
    } catch (error) {
      return c.json({ code: error instanceof Error && error.message === 'NARRATIVE_BODY_CORRUPT'
        ? 'NARRATIVE_BODY_CORRUPT' : 'NARRATIVE_UNAVAILABLE' }, 503);
    }
  });
}
