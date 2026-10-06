import type { Hono } from 'hono';
import { isIP } from 'node:net';
import { EmailAuthService, SESSION_SECONDS } from '../services/email-auth.js';
import { AuthFailure } from '../services/auth-failure.js';

export const AUTH_COOKIE = 'jx_session';
export function authCookie(token: string, age: number, origin: string, sameSite: 'Strict' | 'None' = 'Strict'): string {
  const secure = new URL(origin).protocol === 'https:' ? '; Secure' : '';
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${age}${secure}`;
}
export function sessionToken(request: Request): string | null {
  const values = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${AUTH_COOKIE}=`));
  return values.length === 1 ? values[0]!.slice(AUTH_COOKIE.length + 1) : null;
}
export function mountAuth(app: Hono, service: EmailAuthService, origin: string, sameSite: 'Strict' | 'None' = 'Strict', trustedProxyAddresses: readonly string[] = []): void {
  const url = new URL(origin);
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (origin !== url.origin || (url.protocol !== 'https:' && !local)) throw new Error('AUTH_PUBLIC_ORIGIN must be an exact HTTPS origin');
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  if (sameSite === 'None' && !secure) throw new Error('Cross-site sessions require HTTPS');
  const cookie = (token: string, age: number) => authCookie(token, age, origin, sameSite);
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Origin');
    const allowedOrigin = c.req.header('origin') === origin;
    if (allowedOrigin) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    if (c.req.method === 'OPTIONS') {
      const method = c.req.header('access-control-request-method');
      const headers = (c.req.header('access-control-request-headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (!allowedOrigin || !method || !['GET', 'POST', 'PUT', 'DELETE'].includes(method) || headers.some(value => !['content-type', 'x-jiuxiao-account'].includes(value))) return c.json({code:'ORIGIN_REJECTED'},403);
      c.header('Access-Control-Allow-Methods','GET, POST, PUT, DELETE');
      c.header('Access-Control-Allow-Headers','Content-Type, X-Jiuxiao-Account');
      return c.body(null,204);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('origin') !== origin) {
      return c.json({ code: 'ORIGIN_REJECTED' }, 403);
    }
    await next();
  });
  app.onError(() => Response.json({ code: 'INTERNAL_ERROR', message: '服务暂不可用。' }, { status: 503 }));
  app.post('/api/auth/guest', async c => {
    const body = await authBody(c.req.raw);
    if (!body || Object.keys(body).length) return c.json({ code: 'INVALID_REQUEST' }, 400);
    const current = await service.resolve(sessionToken(c.req.raw));
    if (current?.kind === 'guest') return c.json({ account: accountFor(current), expiresAt: current.expiresAt.toISOString() });
    if (current) return c.json({ code: 'ACCOUNT_SESSION_ACTIVE' }, 409);
    try {
      const result = await service.createGuest(clientIp(c, trustedProxyAddresses));
      if (!result) { c.header('Retry-After', '3600'); return c.json({ code: 'RATE_LIMITED' }, 429); }
      c.header('Set-Cookie', cookie(result.token, SESSION_SECONDS));
      return c.json({ account: accountFor(result.session), expiresAt: result.session.expiresAt.toISOString() }, 201);
    } catch (error) {
      if (error instanceof AuthFailure) return c.json({ code: error.code, stage: error.stage, requestId: error.requestId }, 503);
      return c.json({ code: 'GUEST_UNAVAILABLE' }, 503);
    }
  });
  app.post('/api/auth/code', async c => {
    const body = await authBody(c.req.raw);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    try {
      const result = await service.requestCode(body.email, clientIp(c, trustedProxyAddresses));
      if(result==='limited')c.header('Retry-After','60');
      return result === 'sent' ? c.json({ status: 'sent', resendAfterSeconds:60, expiresInSeconds:600 }, 202) : c.json({ code: 'RATE_LIMITED',retryAfterSeconds:60 }, 429);
    } catch (error) { if(error instanceof AuthFailure)return c.json({code:error.code,stage:error.stage,requestId:error.requestId},503);return c.json({ code: error instanceof TypeError ? 'INVALID_EMAIL' : 'MAIL_UNAVAILABLE' }, error instanceof TypeError ? 400 : 503); }
  });
  for(const path of ['/api/auth/verify','/api/auth/restore'])app.post(path, async c => {
    const body = await authBody(c.req.raw);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    try {
      const result = await service.verify(body.email, body.code,path.endsWith('/restore'));
      if (!result) return c.json({ code: 'INVALID_OR_EXPIRED_CODE' }, 401);
      c.header('Set-Cookie', cookie(result.token, SESSION_SECONDS));
      return c.json({ account: accountFor(result.session), expiresAt: result.session.expiresAt.toISOString() });
    } catch (error) { if (error instanceof AuthFailure) return c.json({code:error.code,stage:error.stage,requestId:error.requestId},503); if (error instanceof TypeError) return c.json({ code: 'INVALID_EMAIL' }, 400); throw error; }
  });
  app.post('/api/auth/guest/upgrade', async c => {
    const body = await authBody(c.req.raw);
    if (!body || Object.keys(body).some(key => !['email', 'code', 'confirmation'].includes(key))
      || !('email' in body) || !('code' in body) || !('confirmation' in body)) return c.json({ code: 'INVALID_REQUEST' }, 400);
    const token = sessionToken(c.req.raw);
    const current = await service.resolve(token);
    if (current?.kind !== 'guest') return c.json({ code: 'UPGRADE_UNAVAILABLE' }, 409);
    try {
      const result = await service.upgradeGuest(current.ownerId, token, body.email, body.code, body.confirmation);
      if (result.status === 'invalid_code') return c.json({ code: 'INVALID_OR_EXPIRED_CODE' }, 401);
      if (result.status !== 'upgraded') return c.json({ code: 'UPGRADE_UNAVAILABLE' }, 409);
      return c.json({ account: accountFor(result.session), expiresAt: result.session.expiresAt.toISOString() });
    } catch (error) {
      if (error instanceof AuthFailure) return c.json({ code: error.code, stage: error.stage, requestId: error.requestId }, 503);
      if (error instanceof TypeError) return c.json({ code: 'INVALID_EMAIL' }, 400);
      return c.json({ code: 'UPGRADE_UNAVAILABLE' }, 503);
    }
  });
  app.get('/api/auth/session', async c => {
    const session = await service.resolve(sessionToken(c.req.raw));
    return session ? c.json({ account: accountFor(session), expiresAt: session.expiresAt.toISOString() }) : c.json({ code: 'UNAUTHENTICATED' }, 401);
  });
  app.post('/api/auth/refresh', async c => {
    const expected = c.req.header('x-jiuxiao-account');
    if (expected && (await service.resolve(sessionToken(c.req.raw)))?.ownerId !== expected) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    const result = await service.refresh(sessionToken(c.req.raw));
    if (!result) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    c.header('Set-Cookie', cookie(result.token, SESSION_SECONDS));
    return c.json({ account: accountFor(result.session), expiresAt: result.session.expiresAt.toISOString() });
  });
  app.post('/api/auth/logout', async c => {
    const expected = c.req.header('x-jiuxiao-account');
    if (expected && (await service.resolve(sessionToken(c.req.raw)))?.ownerId !== expected) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    await service.logout(sessionToken(c.req.raw)); c.header('Set-Cookie', cookie('', 0));
    return c.json({ status: 'signed_out' });
  });
}
function accountFor(session: import('../services/email-auth.js').AuthSession): { id: string; email?: string; kind?: 'guest' } {
  return session.kind === 'guest' ? { id: session.ownerId, kind: 'guest' } : { id: session.ownerId, email: session.email };
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
/** Only a configured reverse proxy may supply X-Forwarded-For. Direct clients
 * cannot choose their rate-limit identity by adding a request header. */
export function clientIp(c: { req: { header(name: string): string | undefined }; env?: unknown }, trustedProxyAddresses: readonly string[]): string {
  type Incoming = { socket?: { remoteAddress?: string } };
  const bindings = c.env as { server?: { incoming?: Incoming }; incoming?: Incoming } | undefined;
  const incoming = bindings?.server?.incoming ?? bindings?.incoming;
  const remote = incoming?.socket?.remoteAddress?.replace(/^::ffff:/, '') || 'unidentified';
  if (trustedProxyAddresses.includes(remote)) {
    const forwarded = c.req.header('x-forwarded-for');
    const candidate = forwarded?.split(',').map(value => value.trim()).filter(Boolean).at(-1);
    if (candidate && candidate.length <= 45 && isIP(candidate) !== 0) return candidate;
  }
  return remote.slice(0, 45);
}
