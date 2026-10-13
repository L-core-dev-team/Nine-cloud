// Cloudflare Turnstile server-side verification for the self-hosted email
// challenge channel. The Supabase phone flow hands the token to Supabase Auth
// instead; this verifier only guards POST /api/auth/code for anonymous
// callers (login). Configuration is optional: without TURNSTILE_SECRET_KEY the
// runtime behaves exactly as before; with it, an anonymous request without a
// valid token is refused (fail-closed), including when the verification
// service itself is unreachable.
import { AuthFailure } from './auth-failure.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerifier = (token: unknown, remoteIp?: string) => Promise<void>;

export function createTurnstileVerifier(secret: string, fetchImpl: typeof fetch = fetch): TurnstileVerifier {
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY requires a non-empty secret');
  return async (token, remoteIp) => {
    if (typeof token !== 'string' || !token || token.length > 2048) throw new AuthFailure('CAPTCHA_REQUIRED', 'captcha_verify');
    let response: Response;
    try {
      response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AuthFailure('CAPTCHA_UNAVAILABLE', 'captcha_verify');
    }
    if (!response.ok) throw new AuthFailure('CAPTCHA_UNAVAILABLE', 'captcha_verify');
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new AuthFailure('CAPTCHA_UNAVAILABLE', 'captcha_verify'); }
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || !('success' in result) || result.success !== true) throw new AuthFailure('CAPTCHA_INVALID', 'captcha_verify');
  };
}
