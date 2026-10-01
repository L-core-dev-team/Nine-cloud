import type { Hono } from 'hono';
import { EmailAuthService, SESSION_SECONDS } from '../services/email-auth.js';

export const AUTH_COOKIE = 'jx_session';
export function sessionToken(request: Request): string | null {
  const values = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${AUTH_COOKIE}=`));
  return values.length === 1 ? values[0]!.slice(AUTH_COOKIE.length + 1) : null;
}
export function mountAuth(app: Hono, service: EmailAuthService, origin: string): void {
  const url = new URL(origin);
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (origin !== url.origin || (url.protocol !== 'https:' && !local)) throw new Error('AUTH_PUBLIC_ORIGIN must be an exact HTTPS origin');
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const cookie = (token: string, age: number) => `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== origin) {
      return c.json({ code: 'ORIGIN_REJECTED' }, 403);
    }
    await next();
  });
  app.onError(() => Response.json({ code: 'INTERNAL_ERROR', message: '服务暂不可用。' }, { status: 503 }));
  app.post('/api/auth/code', async c => {
    const body = await authBody(c.req.raw);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    try {
      const result = await service.requestCode(body.email);
      return result === 'sent' ? c.json({ status: 'sent' }, 202) : c.json({ code: 'RATE_LIMITED' }, 429);
    } catch (error) { return c.json({ code: error instanceof TypeError ? 'INVALID_EMAIL' : 'MAIL_UNAVAILABLE' }, error instanceof TypeError ? 400 : 503); }
  });
  app.post('/api/auth/verify', async c => {
    const body = await authBody(c.req.raw);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    try {
      const result = await service.verify(body.email, body.code);
      if (!result) return c.json({ code: 'INVALID_OR_EXPIRED_CODE' }, 401);
      c.header('Set-Cookie', cookie(result.token, SESSION_SECONDS));
      return c.json({ account: { id: result.session.ownerId, email: result.session.email }, expiresAt: result.session.expiresAt.toISOString() });
    } catch (error) { if (error instanceof TypeError) return c.json({ code: 'INVALID_EMAIL' }, 400); throw error; }
  });
  app.get('/api/auth/session', async c => {
    const session = await service.resolve(sessionToken(c.req.raw));
    return session ? c.json({ account: { id: session.ownerId, email: session.email }, expiresAt: session.expiresAt.toISOString() }) : c.json({ code: 'UNAUTHENTICATED' }, 401);
  });
  app.post('/api/auth/refresh', async c => {
    const expected = c.req.header('x-jiuxiao-account');
    if (expected && (await service.resolve(sessionToken(c.req.raw)))?.ownerId !== expected) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    const result = await service.refresh(sessionToken(c.req.raw));
    if (!result) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    c.header('Set-Cookie', cookie(result.token, SESSION_SECONDS));
    return c.json({ account: { id: result.session.ownerId, email: result.session.email }, expiresAt: result.session.expiresAt.toISOString() });
  });
  app.post('/api/auth/logout', async c => {
    const expected = c.req.header('x-jiuxiao-account');
    if (expected && (await service.resolve(sessionToken(c.req.raw)))?.ownerId !== expected) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    await service.logout(sessionToken(c.req.raw)); c.header('Set-Cookie', cookie('', 0));
    return c.json({ status: 'signed_out' });
  });
}
async function authBody(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.startsWith('application/json') || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length;
      if (length > 4096) { await reader.cancel(); return null; } chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; } finally { reader.releaseLock(); }
}
