/**
 * 认证 API 中转。
 *
 * 背景：会话是 HttpOnly Cookie（SameSite=Strict），而服务端 mountAuth 只接受
 * `Origin: https://jiuxiaogame.cn` 这一个来源，否则返回 ORIGIN_REJECTED。所以
 * 浏览器必须同源调用 `/api/*` —— 让前端直连 api.jiuxiaogame.cn 属于跨站，Cookie
 * 不会带上去，写操作也会被拒。
 *
 * 为什么不能用 `_redirects`：Cloudflare 官方文档明确写着 "Proxying will only
 * support relative URLs on your site. You cannot proxy external domains."
 * （pages/configuration/redirects/#proxying）。所以外部源中转只能用 Functions。
 *
 * 这里是服务端转发，浏览器视角仍是同源：Cookie 由浏览器自动附带，
 * Origin 也被原样转发给后端，两端的既有校验都不需要放宽。
 */

// 后端地址不写死在代码里：Cloudflare Pages 会在运行时提供环境变量，
// 缺失时直接抛错而不是悄悄回落到某个域名。
const UPSTREAM = 'https://api.jiuxiaogame.cn';

// 路线 A 入口封锁 v2（2026-10-11 裁决，docs/acceptance/2026-10-11/路线A入口封锁规则.md）：
// 账号写入/凭据签发端点在中继层显式 404，不转发到后端——与 Caddy 层封锁构成双防御。
// v2 修订：只读端点 /api/auth/session、/api/auth/providers 不封锁（API 自身 fail-closed/诊断）。
// 升级路线 B 时删除本名单并按文档 §5 走解除流程。
const BLOCKED_PREFIXES = ['/api/auth/phone/', '/api/account/'];
const BLOCKED_EXACT = [
  '/api/auth/guest',
  '/api/auth/guest/upgrade',
  '/api/auth/code',
  '/api/auth/refresh',
  '/api/auth/logout',
];

// 允许透传的请求头。Host 必须重写（否则后端看到的是 Pages 的 Host），
// Origin 要原样保留 —— 后端正是拿它与 AUTH_PUBLIC_ORIGIN 做全等比较。
const FORWARD_REQUEST_HEADERS = [
  'cookie',
  'origin',
  'content-type',
  'accept',
  'x-jiuxiao-account',
  'authorization',
];

// 响应头只回传必要项。Set-Cookie 逐条处理，不能被 join 合并。
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'vary',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
];

export async function onRequest(context) {
  const { request } = context;

  const path = new URL(request.url).pathname;
  if (BLOCKED_EXACT.includes(path) || BLOCKED_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return new Response(JSON.stringify({ code: 'ROUTE_A_BLOCKED', message: '该入口在当前部署阶段未开放。' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set('x-forwarded-host', new URL(UPSTREAM).host);

  // GET/HEAD 无 body，其余方法原样透传（不得静默丢弃请求体）。
  const method = request.method;
  const init = {
    method,
    headers,
    redirect: 'manual',
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}${new URL(request.url).pathname}${new URL(request.url).search}`, init);
  } catch {
    // 后端不可达时返回 503 而不是让Pages 落到 index.html —— 那会把
    // 「服务不可用」伪装成「页面正常」，正是这次排查耗时的原因之一。
    return new Response(JSON.stringify({ code: 'UPSTREAM_UNREACHABLE', message: '服务暂不可用。' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  // Set-Cookie 可能有多个（Max-Age/Path 等属性各异），必须逐条保留。
  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : (upstream.headers.get('set-cookie') ? [upstream.headers.get('set-cookie')] : []);
  for (const cookie of cookies) out.append('Set-Cookie', cookie);

  // 204/304 这类无正文响应不能带 body，否则 fetch 会抛。
  const status = upstream.status;
  const body = status === 204 || status === 304 ? null : await upstream.arrayBuffer();
  return new Response(body, { status, statusText: upstream.statusText, headers: out });
}