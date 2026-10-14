const DEFAULT_API_ORIGIN = 'https://api.jiuxiaogame.cn';
const PRODUCTION_SITE_HOSTS = new Set(['jiuxiaogame.cn', 'play.jiuxiaogame.cn', 'www.jiuxiaogame.cn']);
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'cookie',
  'if-match',
  'if-none-match',
  'origin',
  'range',
  'x-jiuxiao-account',
];

const RESPONSE_HEADERS = [
  'accept-ranges',
  'content-disposition',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
  'location',
  'retry-after',
  'vary',
];

const BLOCKED_EXACT = new Set([
  '/api/auth/guest',
  '/api/auth/code',
  '/api/auth/refresh',
  '/api/auth/logout',
]);
const BLOCKED_ROOTS = ['/api/auth/guest/upgrade', '/api/auth/phone', '/api/account'];

const SECURITY_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Strict-Transport-Security', 'max-age=31536000'],
];

export function proxyApiRequest(context) {
  return proxyRequest(context, { route: 'api' });
}

export function proxyHealthRequest(context, endpoint) {
  if (!['/health', '/ready'].includes(endpoint)) {
    return jsonError(404, 'NOT_FOUND', '接口不存在。');
  }
  return proxyRequest(context, { route: 'health', endpoint });
}

async function proxyRequest(context, route) {
  const { request } = context;
  const requestUrl = new URL(request.url);
  const normalizedPath = normalizePath(requestUrl.pathname);
  if (!normalizedPath) return jsonError(400, 'INVALID_API_PATH', '请求路径无效。');

  if (route.route === 'api') {
    if (normalizedPath !== '/api' && !normalizedPath.startsWith('/api/')) {
      return jsonError(404, 'NOT_FOUND', '接口不存在。');
    }
    const emailEnabled = context.env?.JIUXIAO_EMAIL_AUTH_ENABLED === 'true';
    const phonePath = normalizedPath === '/api/auth/phone' || normalizedPath.startsWith('/api/auth/phone/');
    if (isRouteABlocked(normalizedPath) && (!emailEnabled || phonePath)) {
      return jsonError(404, 'ROUTE_A_BLOCKED', '该入口在当前部署阶段未开放。');
    }
  } else if (normalizedPath !== route.endpoint) {
    return jsonError(404, 'NOT_FOUND', '接口不存在。');
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return jsonError(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持。', { Allow: [...ALLOWED_METHODS].join(', ') });
  }
  if (route.route === 'health' && !['GET', 'HEAD'].includes(request.method)) {
    return jsonError(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持。', { Allow: 'GET, HEAD' });
  }

  let upstreamOrigin;
  try {
    upstreamOrigin = resolveApiOrigin(context.env, requestUrl.hostname);
  } catch {
    return jsonError(503, 'UPSTREAM_CONFIG_INVALID', '服务暂不可用。');
  }

  const target = new URL(upstreamOrigin);
  target.pathname = requestUrl.pathname;
  target.search = requestUrl.search;
  if (target.origin !== upstreamOrigin) {
    return jsonError(400, 'INVALID_API_PATH', '请求路径无效。');
  }
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // The three owner-controlled website origins share one API. Only requests
  // whose original Origin exactly matches the requesting website can be
  // canonicalized; an untrusted Origin is forwarded unchanged and rejected.
  const canonicalOrigin = context.env?.API_AUTH_CANONICAL_ORIGIN;
  if (canonicalOrigin && request.headers.get('origin') === requestUrl.origin
    && PRODUCTION_SITE_HOSTS.has(requestUrl.hostname.toLowerCase())) {
    let canonical;
    try { canonical = new URL(canonicalOrigin); } catch { return jsonError(503, 'UPSTREAM_CONFIG_INVALID', '服务暂不可用。'); }
    if (canonical.origin !== canonicalOrigin || canonical.protocol !== 'https:'
      || !PRODUCTION_SITE_HOSTS.has(canonical.hostname.toLowerCase())) {
      return jsonError(503, 'UPSTREAM_CONFIG_INVALID', '服务暂不可用。');
    }
    headers.set('origin', canonicalOrigin);
  }

  const init = { method: request.method, headers, redirect: 'manual', signal: request.signal };
  if (!['GET', 'HEAD'].includes(request.method)) {
    const result = await readBoundedBody(request);
    if (result.kind === 'too_large') return jsonError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大。');
    if (result.kind === 'invalid') return jsonError(400, 'INVALID_REQUEST_BODY', '请求内容无效。');
    if (result.kind === 'read_error') return jsonError(400, 'REQUEST_BODY_UNREADABLE', '请求内容无法读取。');
    init.body = result.body;
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch {
    return jsonError(503, 'UPSTREAM_UNREACHABLE', '服务暂不可用。');
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }
  responseHeaders.set('Cache-Control', 'no-store');

  // Preserve cookies individually; combining Set-Cookie can alter their attributes.
  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
  for (const cookie of cookies) responseHeaders.append('Set-Cookie', cookie);
  applySecurityHeaders(responseHeaders);

  const body = [204, 205, 304].includes(upstream.status) ? null : upstream.body;
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function resolveApiOrigin(env, requestHostname) {
  const isSimulation = env?.APP_ENV === 'simulation';
  const isProductionHost = PRODUCTION_SITE_HOSTS.has(requestHostname.toLowerCase());
  if (!isSimulation && !isProductionHost) throw new Error('NONPRODUCTION_HOST');
  const explicitOrigin = typeof env?.API_UPSTREAM_ORIGIN === 'string' && env.API_UPSTREAM_ORIGIN.trim()
    ? env.API_UPSTREAM_ORIGIN.trim()
    : null;
  const configured = isSimulation
    ? explicitOrigin
    : explicitOrigin ?? DEFAULT_API_ORIGIN;
  if (!configured) throw new Error('UPSTREAM_ORIGIN_REQUIRED');
  const url = new URL(configured);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('INVALID_UPSTREAM_ORIGIN');
  }

  if (isSimulation) {
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'http:' || !loopback || !url.port) throw new Error('INVALID_SIMULATION_UPSTREAM');
    return url.origin;
  }

  if (url.origin !== DEFAULT_API_ORIGIN) {
    throw new Error('UNAPPROVED_UPSTREAM_ORIGIN');
  }
  return url.origin;
}

function normalizePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // Inspect nested encodings too, so alternate spellings cannot slip past the
  // Route A denylist before a downstream URL/router decodes them.
  for (let depth = 0; depth < 8 && /%(?:25|2f|5c|2e)/i.test(decoded); depth += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  if (/%(?:25|2f|5c|2e)/i.test(decoded)) return null;
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const segments = [];
  for (const segment of decoded.replace(/\/{2,}/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  const canonical = `/${segments.join('/')}`;
  return canonical.replace(/\/+$/, '').toLowerCase() || '/';
}

function isRouteABlocked(path) {
  if (BLOCKED_EXACT.has(path)) return true;
  return BLOCKED_ROOTS.some(root => path === root || path.startsWith(`${root}/`));
}

async function readBoundedBody(request) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { kind: 'invalid' };
    if (Number(declaredLength) > MAX_REQUEST_BODY_BYTES) return { kind: 'too_large' };
  }

  if (!request.body) return { kind: 'ok', body: new Uint8Array() };
  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: 'read_error' };
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'ok', body };
}

function jsonError(status, code, message, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  applySecurityHeaders(headers);
  return new Response(JSON.stringify({ code, message }), { status, headers });
}

function applySecurityHeaders(headers) {
  for (const [name, value] of SECURITY_HEADERS) headers.set(name, value);
}
