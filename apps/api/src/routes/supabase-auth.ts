import type { Context, Hono } from 'hono';
import { AuthFailure } from '../services/auth-failure.js';
import type { SupabaseAuthService } from '../services/supabase-auth.js';
import { authBody, authCookie, clientIp, sessionToken, type AuthSessionService } from './auth.js';

export function mountSupabasePhoneAuth(app: Hono, service: SupabaseAuthService, sessions: AuthSessionService,
  origin: string, sameSite: 'Strict' | 'None' = 'Strict', trustedProxyAddresses: readonly string[] = []): void {
  app.get('/api/auth/phone/status', async c => {
    const session = await sessions.resolve(sessionToken(c.req.raw));
    if (!session) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    return c.json(await service.phoneStatus(session.ownerId));
  });

  const readOtpBody = async (request: Request, allowed: string[]) => {
    const body = await authBody(request);
    return body && !Object.keys(body).some(key => !allowed.includes(key)) ? body : null;
  };
  const respondFailure = (c: Context, error: unknown) => {
    if (error instanceof AuthFailure) {
      return c.json({ code: error.code, stage: error.stage, requestId: error.requestId }, 503);
    }
    return c.json({ code: error instanceof TypeError ? error.message : 'AUTH_UNAVAILABLE' }, error instanceof TypeError ? 400 : 503);
  };
  const requestPhoneCode = async (c: Context, requireSession: boolean) => {
    const body = await readOtpBody(c.req.raw, ['phone', 'captchaToken']);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    const current = requireSession ? await sessions.resolve(sessionToken(c.req.raw)) : null;
    if (requireSession && !current) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      // Login never creates an unbound Supabase Auth phone account. The linking
      // route may create one only after the current Hono account is authenticated.
      const result = await service.requestPhoneCode(body.phone, clientIp(c, trustedProxyAddresses), body.captchaToken, requireSession, current?.ownerId);
      if (result === 'limited') { c.header('Retry-After', '60'); return c.json({ code: 'RATE_LIMITED', retryAfterSeconds: 60 }, 429); }
      return c.json({ status: 'sent', resendAfterSeconds: 60 }, 202);
    } catch (error) { return respondFailure(c, error); }
  };

  app.post('/api/auth/phone/code', c => requestPhoneCode(c, false));
  app.post('/api/auth/phone/link/code', c => requestPhoneCode(c, true));

  const verifyPhone = (restore: boolean) => async (c: Context) => {
    const body = await readOtpBody(c.req.raw, ['phone', 'code']);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    try {
      const result = await service.verifyPhone(body.phone, body.code, restore);
      if (!result) return c.json({ code: 'INVALID_OR_EXPIRED_CODE' }, 401);
      c.header('Set-Cookie', authCookie(result.token, 7 * 24 * 60 * 60, origin, sameSite));
      return c.json({ account: { id: result.session.ownerId, email: result.session.email }, expiresAt: result.session.expiresAt.toISOString() });
    } catch (error) { return respondFailure(c, error); }
  };
  app.post('/api/auth/phone/verify', verifyPhone(false));
  app.post('/api/auth/phone/restore', verifyPhone(true));

  app.post('/api/auth/phone/link', async c => {
    const body = await readOtpBody(c.req.raw, ['phone', 'code']);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    const current = await sessions.resolve(sessionToken(c.req.raw));
    if (!current) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      const linked = await service.linkPhone(current.ownerId, body.phone, body.code);
      return linked ? c.json({ status: 'phone_linked' }) : c.json({ code: 'IDENTITY_CONFLICT_OR_INVALID_CODE' }, 409);
    } catch (error) { return respondFailure(c, error); }
  });

  app.post('/api/auth/phone/unlink', async c => {
    const body = await readOtpBody(c.req.raw, ['email', 'emailCode']);
    if (!body) return c.json({ code: 'INVALID_REQUEST' }, 400);
    const current = await sessions.resolve(sessionToken(c.req.raw));
    if (!current) return c.json({ code: 'UNAUTHENTICATED' }, 401);
    try {
      const unlinked = await service.unlinkPhone(current.ownerId, body.email, body.emailCode);
      return unlinked ? c.json({ status: 'phone_unlinked' }) : c.json({ code: 'IDENTITY_CONFLICT_OR_INVALID_CODE' }, 409);
    } catch (error) { return respondFailure(c, error); }
  });
}
