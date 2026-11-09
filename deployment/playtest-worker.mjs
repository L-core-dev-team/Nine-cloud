// A second entry to the same invited test gateway. No credentials are stored here.
export const PUBLIC_ORIGIN = 'https://ninecloud-invited-playtest.3507103376.workers.dev';
export const UPSTREAM_ORIGIN = 'https://trial.jiuxiaogame.cn';

function unavailable() {
  return new Response(JSON.stringify({code:'PLAYTEST_ENTRY_UNAVAILABLE'}), {status:503,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export async function handlePlaytestEntry(request, fetchUpstream = fetch) {
  const url=new URL(request.url);
  if(url.origin!==PUBLIC_ORIGIN)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const target=new URL(url.pathname+url.search,UPSTREAM_ORIGIN);
  if(target.origin!==UPSTREAM_ORIGIN)return unavailable();
  const headers=new Headers(request.headers);
  headers.delete('host');
  // Only our own browser Origin may be canonicalized. Foreign origins still fail
  // the API's existing CSRF/origin checks; this does not authorize new actions.
  if(headers.get('origin')===PUBLIC_ORIGIN)headers.set('origin',UPSTREAM_ORIGIN);
  headers.delete('x-forwarded-for');
  const clientIp=request.headers.get('cf-connecting-ip');
  if(clientIp)headers.set('x-forwarded-for',clientIp);
  try {
    const upstream=await fetchUpstream(target.href,{
      method:request.method,headers,redirect:'manual',signal:request.signal,
      ...(!['GET','HEAD'].includes(request.method)?{body:request.body}:{}),
    });
    // Invitation credentials and cookies must never follow an upstream redirect.
    if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();return unavailable();}
    const responseHeaders=new Headers(upstream.headers);
    responseHeaders.set('cache-control','no-store');
    responseHeaders.set('x-ninecloud-entry','invited-worker');
    responseHeaders.set('x-content-type-options','nosniff');
    return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
  } catch { return unavailable(); }
}

export default {fetch(request) { return handlePlaytestEntry(request); }};
