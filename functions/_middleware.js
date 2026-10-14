import { proxyApiRequest } from './_lib/api-proxy.mjs';

// Own the API namespace before file-based routing can fall back to SPA assets.
// Static pages still bypass Functions through the explicit _routes.json allowlist.
export function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return proxyApiRequest(context);
  }
  return context.next();
}
