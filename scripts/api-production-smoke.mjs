// Public GET checks only: no email sent, no credentials printed.
import { isIP } from 'node:net';

const routeA = process.env.SMOKE_ROUTE_A === '1';
function publicHttpsRoot(raw, errorCode) {
  let base;
  try { base = new URL(raw || ''); } catch { throw new Error(errorCode); }
  const hostname = base.hostname.toLowerCase().replace(/\.$/, '');
  const ipLiteral = isIP(hostname.replace(/^\[|\]$/g, '')) !== 0;
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
      || base.pathname !== '/' || ipLiteral || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error(errorCode);
  }
  return base;
}
try {
  const base = publicHttpsRoot(process.env.PUBLIC_API_BASE_URL, 'PUBLIC_HTTPS_API_REQUIRED');
  const site = process.env.PUBLIC_SITE_BASE_URL
    ? publicHttpsRoot(process.env.PUBLIC_SITE_BASE_URL, 'PUBLIC_HTTPS_SITE_REQUIRED') : null;
  const checks = [['/health', 200], ['/ready', 200], ['/api/auth/session', routeA ? 404 : 401]];
  if (routeA) checks.push(['/api/auth/guest', 404], ['/api/account/capabilities', 404]);
  for (const [path, status] of checks) {
    const response = await fetch(new URL(path, base), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (response.status !== status) throw new Error('API_SMOKE_FAILED');
    if (['/health', '/ready', '/api/auth/session'].includes(path)) {
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('API_SMOKE_FAILED');
      }
      let data;
      try { data = await response.json(); } catch { throw new Error('API_SMOKE_FAILED'); }
      if ((path === '/health' && data.status !== 'ok')
          || (path === '/ready' && (data.status !== 'ready' || data.dependencies?.database !== 'ok'))
          || (path === '/api/auth/session' && typeof data.code !== 'string')) {
        throw new Error('API_SMOKE_FAILED');
      }
    } else {
      await response.body?.cancel();
    }
  }
  const failures = [];
  const siteRelayFailedPaths = [];
  let siteRelay = site ? 'FAIL' : 'NOT_TESTED';
  if (site) {
    const siteChecks = [
      ['/health', 200], ['/ready', 200], ['/api/auth/session', routeA ? 404 : 401],
    ];
    for (const [path, expectedStatus] of siteChecks) {
      try {
        const response = await fetch(new URL(path, site), {
          redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        if (response.status !== expectedStatus
            || !response.headers.get('content-type')?.includes('application/json')) {
          await response.body?.cancel();
          throw new Error('SITE_RELAY_FAILED');
        }
        let data;
        try { data = await response.json(); } catch { throw new Error('SITE_RELAY_FAILED'); }
        if ((path === '/health' && data.status !== 'ok')
            || (path === '/ready' && (data.status !== 'ready' || data.dependencies?.database !== 'ok'))
            || (path === '/api/auth/session' && typeof data.code !== 'string')) {
          siteRelayFailedPaths.push(path);
          continue;
        }
      } catch {
        siteRelayFailedPaths.push(path);
      }
    }
    siteRelay = siteRelayFailedPaths.length === 0 ? 'PASS' : 'FAIL';
    if (siteRelayFailedPaths.length) failures.push('SITE_RELAY_FAILED');
  }

  let cors = 'PASS';
  try {
    const untrustedOrigin = 'https://untrusted-smoke.invalid';
    const untrusted = await fetch(new URL('/health', base), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { origin: untrustedOrigin },
    });
    const reflectedOrigin = untrusted.headers.get('access-control-allow-origin');
    const untrustedStatus = untrusted.status;
    await untrusted.body?.cancel();
    if (untrustedStatus !== 200 || reflectedOrigin === '*'
        || reflectedOrigin === untrustedOrigin
        || (site && reflectedOrigin && reflectedOrigin !== site.origin)) {
      throw new Error('CORS_ORIGIN_FAILED');
    }
    if (site && base.origin !== site.origin) {
      const allowed = await fetch(new URL('/health', base), {
        redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { origin: site.origin },
      });
      const allowedOrigin = allowed.headers.get('access-control-allow-origin');
      const allowedStatus = allowed.status;
      await allowed.body?.cancel();
      if (allowedStatus !== 200 || allowedOrigin !== site.origin) throw new Error('CORS_ORIGIN_FAILED');
    }
  } catch {
    cors = 'FAIL';
    failures.push('CORS_ORIGIN_FAILED');
  }
  if (failures.length) {
    console.error(JSON.stringify({
      status: 'PUBLIC_API_SMOKE_FAILED', code: failures[0], codes: failures,
      siteRelay, siteRelayFailedPaths, cors,
      emailDelivery: 'NOT_TESTED', authenticatedCloud: 'NOT_TESTED',
    }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      status: 'PUBLIC_API_SMOKE_PASS', routeA: routeA || undefined,
      siteRelay, siteRelayFailedPaths, cors,
      emailDelivery: 'NOT_TESTED', authenticatedCloud: 'NOT_TESTED',
    }));
  }
} catch (error) {
  console.error(JSON.stringify({
    status: 'PUBLIC_API_SMOKE_FAILED',
    code: ['PUBLIC_HTTPS_API_REQUIRED', 'PUBLIC_HTTPS_SITE_REQUIRED', 'API_SMOKE_FAILED'].includes(error?.message)
      ? error.message : 'PUBLIC_API_UNREACHABLE',
  }));
  process.exitCode = 1;
}
