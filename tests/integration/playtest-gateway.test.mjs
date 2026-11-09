import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createPlaytestServer} from '../../deployment/playtest-front.mjs';

test('invited playtest gateway isolates credentials, auth operations, files and upstream failures',async t=>{
 const root=await mkdtemp(join(tmpdir(),'jiuxiao-gateway-'));assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep+'jiuxiao-gateway-'));
 const calls=[];const api=createServer((req,res)=>{calls.push({path:req.url,authorization:req.headers.authorization,origin:req.headers.origin});res.setHeader('content-type','application/json');res.setHeader('set-cookie','jx_session=synthetic-fixture; HttpOnly; Secure; Path=/');res.end(JSON.stringify({status:'ok',path:req.url}));});
 await new Promise(r=>api.listen(0,'127.0.0.1',r));
 const header='Basic '+Buffer.from('visitor:'+randomBytes(24).toString('hex')).toString('base64');
 const server=createPlaytestServer({webRoot:root,apiOrigin:`http://127.0.0.1:${api.address().port}`,publicOrigin:'https://trial.jiuxiaogame.cn',accessHash:createHash('sha256').update(header).digest('hex')});
 await writeFile(join(root,'index.html'),'<html><head></head><body>synthetic playtest fixture</body></html>');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const headers={authorization:header};
 try{
  await t.test('requires invitation even for readiness and reveals no upstream data',async()=>{const r=await fetch(base+'/ready');assert.equal(r.status,401);assert.equal(calls.length,0);assert.ok(r.headers.get('www-authenticate'));});
  await t.test('serves marked no-store HTML while unknown API remains JSON',async()=>{const r=await fetch(base+'/new',{headers});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/ninecloud-isolated-playtest/);assert.equal(r.headers.get('x-ninecloud-environment'),'isolated-playtest');const apiResponse=await fetch(base+'/api/unknown',{headers});assert.match(apiResponse.headers.get('content-type'),/application\/json/);});
  await t.test('serves real legal directory indexes instead of the game SPA',async()=>{
    for(const name of ['privacy','privacy-rights','terms']){
      await mkdir(join(root,name));await writeFile(join(root,name,'index.html'),`<html><head></head><body>legal fixture ${name}</body></html>`);
      for(const suffix of ['', '/']){const r=await fetch(base+'/'+name+suffix,{headers});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),new RegExp(`legal fixture ${name}`));}
    }
  });
  await t.test('does not forward invitation credentials and preserves origin/cookie semantics',async()=>{const r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{...headers,origin:'https://trial.jiuxiaogame.cn','content-type':'application/json'},body:'{}'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.equal(calls.at(-1).authorization,undefined);assert.equal(calls.at(-1).origin,'https://trial.jiuxiaogame.cn');});
  await t.test('guest-only diagnostic and denied email/account operations never reach upstream',async()=>{const before=calls.length;const p=await(await fetch(base+'/api/auth/providers',{headers})).json();assert.equal(p.email,false);assert.equal(p.phone,false);for(const path of ['/api/auth/code','/api/account/delete'])assert.equal((await fetch(base+path,{method:'POST',headers})).status,404);assert.equal(calls.length,before);});
  await t.test('does not use SPA fallback for missing files or forward absolute foreign URLs',async()=>{assert.equal((await fetch(base+'/missing.js',{headers})).status,404);const r=await fetch(base+'//example.invalid/api/private',{headers});assert.equal(r.status,400);});
  await t.test('an unavailable API fails closed as JSON',async()=>{await new Promise(r=>api.close(r));const r=await fetch(base+'/api/games',{headers});assert.equal(r.status,502);assert.equal((await r.json()).code,'PLAYTEST_API_UNAVAILABLE');});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(api.listening){api.closeAllConnections();await new Promise(r=>api.close(r));}await rm(root,{recursive:true,force:true});}
});
