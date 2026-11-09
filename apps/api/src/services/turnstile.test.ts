import { describe, expect, it } from 'vitest';
import { createTurnstileVerifier } from './turnstile.js';
import { AuthFailure } from './auth-failure.js';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('turnstile siteverify', () => {
  it('fails closed with CAPTCHA_REQUIRED for missing or malformed tokens before any network call', async () => {
    const verify = createTurnstileVerifier('secret', async () => { throw new Error('must not be called'); });
    for (const token of [undefined, null, '', 42, 'x'.repeat(2049)]) {
      await expect(verify(token)).rejects.toMatchObject({ code: 'CAPTCHA_REQUIRED' });
    }
  });

  it('submits secret, response and optional remoteip, and accepts a success verdict', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const verify = createTurnstileVerifier('secret-key', async (url, init) => {
      expect(init?.redirect).toBe('error');
      calls.push({ url, body: String(init?.body) });
      return jsonResponse({ success: true });
    });
    await verify('valid-token', '203.0.113.7');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(calls[0]!.body).toContain('secret=secret-key');
    expect(calls[0]!.body).toContain('response=valid-token');
    expect(calls[0]!.body).toContain('remoteip=203.0.113.7');
  });

  it('maps a rejected verdict to CAPTCHA_INVALID and transport failures to CAPTCHA_UNAVAILABLE', async () => {
    const rejecting = createTurnstileVerifier('secret', async () => jsonResponse({ success: false }));
    await expect(rejecting('bad-token')).rejects.toMatchObject({ code: 'CAPTCHA_INVALID' });
    const offline = createTurnstileVerifier('secret', async () => { throw new Error('dns'); });
    await expect(offline('token')).rejects.toMatchObject({ code: 'CAPTCHA_UNAVAILABLE' });
    const http500 = createTurnstileVerifier('secret', async () => jsonResponse({}, 500));
    await expect(http500('token')).rejects.toMatchObject({ code: 'CAPTCHA_UNAVAILABLE' });
    const invalidJson = createTurnstileVerifier('secret', async () => new Response('not json', { status: 200 }));
    await expect(invalidJson('token')).rejects.toMatchObject({ code: 'CAPTCHA_UNAVAILABLE' });
  });

  it('rejects construction without a secret', () => {
    expect(() => createTurnstileVerifier('')).toThrow();
  });

  it.each([null, [], 'ok', { success: 'true' }])('maps malformed provider JSON to a typed CAPTCHA failure: %j', async payload => {
    const verify = createTurnstileVerifier('secret', async () => jsonResponse(payload));
    await expect(verify('token')).rejects.toMatchObject({ code: 'CAPTCHA_INVALID', stage: 'captcha_verify' });
  });
});

describe('auth failure shape', () => {
  it('keeps captcha failures typed as AuthFailure with a stage', async () => {
    const verify = createTurnstileVerifier('secret', async () => jsonResponse({ success: false }));
    const error = await verify('bad').catch(cause => cause);
    expect(error).toBeInstanceOf(AuthFailure);
    expect((error as AuthFailure).stage).toBe('captcha_verify');
  });
});
