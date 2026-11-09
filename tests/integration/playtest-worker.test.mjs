import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{handlePlaytestEntry,PUBLIC_ORIGIN,UPSTREAM_ORIGIN} from '../../deployment/playtest-worker.mjs';

test('Cloudflare env/context arguments are not mistaken for the fetch implementation',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>{assert.equal(url,UPSTREAM_ORIGIN+'/');return new Response('real adapter')};
  try{const response=await worker.fetch(new Request(PUBLIC_ORIGIN),{binding:'test'},{waitUntil(){}});assert.equal(response.status,200);assert.equal(await response.text(),'real adapter');}
  finally{globalThis.fetch=original;}
});

test('only the dedicated entry origin is accepted, including absolute-path attacks',async()=>{
  let calls=0;const stub=async()=>{calls++;return new Response('unexpected')};
  for(const url of ['https://example.invalid/','http://ninecloud-invited-playtest.3507103376.workers.dev/'])assert.equal((await handlePlaytestEntry(new Request(url),stub)).status,404);
  assert.equal((await handlePlaytestEntry(new Request(PUBLIC_ORIGIN+'//example.invalid/api'),stub)).status,503);
  assert.equal(calls,0);
});

test('forwards bytes, credentials and cookies solely to the fixed invited upstream',async()=>{
  const request=new Request(PUBLIC_ORIGIN+'/api/games/id/turns?q=1',{method:'POST',headers:{authorization:'Basic test-only',cookie:'session=test-only',origin:PUBLIC_ORIGIN,'cf-connecting-ip':'192.0.2.1','x-forwarded-for':'198.51.100.1'},body:'{"text":"观察渡船"}'});
  const response=await handlePlaytestEntry(request,async(url,init)=>{
    assert.equal(url,UPSTREAM_ORIGIN+'/api/games/id/turns?q=1');assert.equal(init.method,'POST');assert.equal(init.redirect,'manual');
    assert.equal(init.headers.get('authorization'),'Basic test-only');assert.equal(init.headers.get('cookie'),'session=test-only');
    assert.equal(init.headers.get('origin'),UPSTREAM_ORIGIN);assert.equal(init.headers.get('x-forwarded-for'),'192.0.2.1');
    assert.equal(init.headers.has('host'),false);assert.equal(await new Response(init.body).text(),'{"text":"观察渡船"}');
    return new Response('{"real":"upstream"}',{headers:{'content-type':'application/json'}});
  });
  assert.equal(await response.text(),'{"real":"upstream"}');assert.equal(response.headers.get('cache-control'),'no-store');
});

test('foreign Origins remain foreign and untrusted forwarded IPs are removed',async()=>{
  await handlePlaytestEntry(new Request(PUBLIC_ORIGIN+'/api/auth/guest',{method:'POST',headers:{origin:'https://foreign.invalid','x-forwarded-for':'198.51.100.1'}}),async(_,init)=>{
    assert.equal(init.headers.get('origin'),'https://foreign.invalid');assert.equal(init.headers.has('x-forwarded-for'),false);return new Response(null,{status:403});
  });
});

test('invitation challenge and isolated environment header are preserved',async()=>{
  const r=await handlePlaytestEntry(new Request(PUBLIC_ORIGIN),async()=>new Response('invitation required',{status:401,headers:{'www-authenticate':'Basic realm="invited"','x-ninecloud-environment':'isolated-playtest'}}));
  assert.equal(r.status,401);assert.equal(r.headers.get('www-authenticate'),'Basic realm="invited"');assert.equal(r.headers.get('x-ninecloud-environment'),'isolated-playtest');assert.equal(r.headers.get('x-ninecloud-entry'),'invited-worker');
});

test('multiple session cookies and complete story text survive without caching',async()=>{
  const headers=new Headers({'cache-control':'public,max-age=600'});headers.append('set-cookie','a=1; Secure; HttpOnly');headers.append('set-cookie','b=2; Secure; HttpOnly');
  const text='完整原文\n第二段';const r=await handlePlaytestEntry(new Request(PUBLIC_ORIGIN+'/api/games/id/story'),async()=>new Response(text,{headers}));
  assert.deepEqual(r.headers.getSetCookie(),headers.getSetCookie());assert.equal(await r.text(),text);assert.equal(r.headers.get('cache-control'),'no-store');
});

test('redirects never receive a second credential-bearing request',async()=>{
  let calls=0;const r=await handlePlaytestEntry(new Request(PUBLIC_ORIGIN,{headers:{authorization:'Basic test-only'}}),async(_,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://foreign.invalid/'}})});
  assert.equal(r.status,503);assert.equal(r.headers.has('location'),false);assert.equal(calls,1);
});

test('upstream failure closes without exposing errors or credentials',async()=>{
  const r=await handlePlaytestEntry(new Request(PUBLIC_ORIGIN),async()=>{throw new Error('private upstream diagnostic')});
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'PLAYTEST_ENTRY_UNAVAILABLE'});assert.equal(r.headers.get('cache-control'),'no-store');
});
