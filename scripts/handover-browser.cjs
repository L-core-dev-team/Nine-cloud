'use strict';
// Real isolated PostgreSQL, session, HTTP and built mobile UI. Receipts are synthetic; T1 stays blocked.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{createRequire}=require('node:module');
const {join}=require('node:path'),{pathToFileURL}=require('node:url'),fs=require('node:fs');
const {root,isolatedPool,services,fixture}=require('./handover-test-support.cjs');
const req=createRequire(join(root,'apps/api/package.json')),{serve}=req('@hono/node-server'),{serveStatic}=req('@hono/node-server/serve-static');
const {chromium}=require('playwright');let pool,server,browser;
async function cache(page,update){return page.evaluate(async update=>{
 const db=await new Promise((ok,no)=>{const r=indexedDB.open('jiuxiao_cloud_game_ui_v1',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 try{return await new Promise((ok,no)=>{const tx=db.transaction('scopes',update?'readwrite':'readonly'),s=tx.objectStore('scopes'),r=s.getAll();let value;
 r.onsuccess=()=>{value=r.result[0];if(update){value.pending=update;s.put(value);}};tx.oncomplete=()=>ok(value);tx.onabort=tx.onerror=()=>no(tx.error);});}finally{db.close();}
},update??null);}
(async()=>{
 pool=await isolatedPool();const s=await services(),repo=new s.NarrativePublicationRepository(pool,s.TEST_BODY_LIMITS);
 let f=await fixture(pool),published=[];const token=f.token;for(let revision=1;revision<=23;revision++){
  if(revision>1)f=await fixture(pool,{owner:f.owner,saveId:f.saveId,revision});
  published.push(await repo.publish(await repo.claim(f.owner,f.saveId,f.key),'正文第'+revision+'回：\ufeff原文😀\r\n'+('风过山门，故人仍在。'.repeat(18))));
 }
 const load=rel=>import(pathToFileURL(join(root,'apps/api/dist',rel)).href);
 const [{createApp},{sessionToken},{AuthoritativeGameService},{PostgresCloudSaveRepository},{ServerTurnService},{createPostgresServerTurnRepository}]=await Promise.all([
  load('app.js'),load('routes/auth.js'),load('services/authoritative-game.js'),load('services/postgres-cloud-save-repository.js'),load('services/server-turn.js'),load('services/postgres-server-turn.js')]);
 const net=require('node:net'),reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));const origin='http://127.0.0.1:'+port;
 const auth={resolveOwnerId:async request=>(await f.auth.resolve(sessionToken(request)))?.ownerId??null};
 const app=createApp({query:q=>pool.query(q)},undefined,{service:f.auth,origin},
  {service:new ServerTurnService(createPostgresServerTurnRepository(pool,true)),games:new AuthoritativeGameService(new PostgresCloudSaveRepository(pool)),auth},{auth,repository:repo});
 app.get('/api/*',c=>c.json({code:'NOT_FOUND'},404));app.use('*',serveStatic({root:join(root,'apps/web/dist')}));app.get('*',serveStatic({path:join(root,'apps/web/dist/index.html')}));
 server=serve({fetch:app.fetch,hostname:'127.0.0.1',port});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'jx_session',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage();let actionPosts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/turns'))actionPosts++;});
 await page.goto(origin+'/game/'+f.saveId);await page.getByTestId('p2-narrative').waitFor();await page.getByTestId('p2-action-input').fill('保留的未提交草稿');
 await page.waitForFunction(()=>document.querySelector('[data-testid="p2-submit-action"]')?.disabled===false);
 await page.waitForTimeout(100);const before=await cache(page);assert.equal(before.history.length,10);assert.equal(before.draft,'保留的未提交草稿');
 const pending={text:before.draft,expectedRevision:23,idempotencyKey:randomUUID(),requestNarrative:true,draftVersion:before.draftVersion,delivery:'sent'};await cache(page,pending);
 await page.reload();await page.getByRole('button',{name:'查询行动结果',exact:true}).waitFor();await page.getByRole('button',{name:'读取更早正文',exact:true}).waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('[data-testid="p2-action-input"]')?.disabled===false);
 const latest=await page.getByTestId('p2-narrative').innerText();await page.getByRole('button',{name:'读取更早正文',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-reading-id]').length>23);
 assert.equal((await cache(page)).history.length,20);await page.getByRole('button',{name:'读取更早正文',exact:true}).click();
 await page.getByRole('button',{name:'读取更早正文',exact:true}).waitFor({state:'hidden'});const restored=await cache(page);
 assert.deepEqual(restored.pending,pending);assert.equal(restored.draft,before.draft);assert.equal(restored.draftVersion,before.draftVersion);
 assert.equal(restored.history.length,23);assert.deepEqual(restored.history.map(r=>r.revision),Array.from({length:23},(_,i)=>i+1));assert.equal(new Set(restored.history.map(r=>r.id)).size,23);
 assert.equal(await page.getByTestId('p2-narrative').innerText(),latest);assert.deepEqual(restored.history.map(r=>r.text),published.map(p=>p.text));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.reload();await page.getByTestId('p2-narrative').waitFor();assert.equal((await cache(page)).history.length,23);assert.equal(await page.getByTestId('p2-action-input').inputValue(),before.draft);
 // Failed page must be retryable without changing stored data.
 await page.route('**/presentations?beforeRevision=*',route=>route.fulfill({status:503,json:{code:'NARRATIVE_UNAVAILABLE'}}));
 await page.getByRole('button',{name:'读取更早正文',exact:true}).click();await page.getByText('更早正文读取失败或本机空间不足，请重试；当前正文与草稿已保留。',{exact:true}).waitFor();assert.deepEqual((await cache(page)).pending,pending);
 await page.unroute('**/presentations?beforeRevision=*');
 // Hold a real response, invalidate the account while it is in flight, then deliver it late.
 let release,arrived;const gate=new Promise(r=>release=r),held=new Promise(r=>arrived=r);
 await page.route('**/presentations?beforeRevision=*',async route=>{const response=await route.fetch();arrived();await gate;await route.fulfill({response}).catch(()=>{});});
 await page.getByRole('button',{name:'读取更早正文',exact:true}).click();await held;
 await page.evaluate(({ownerId})=>{const c=new BroadcastChannel('jiuxiao-cloud-game-session');c.postMessage({ownerId,apiBase:new URL('/api',location.href).href});c.close();},{ownerId:f.owner});
 await page.getByText('账号已改变，请重新进入这份存档。',{exact:true}).waitFor();release();await page.waitForTimeout(150);
 assert.equal(await page.getByTestId('p2-narrative').count(),0);assert.equal(await page.getByRole('button',{name:'读取更早正文',exact:true}).count(),0);
 const other=await fixture(pool);await context.clearCookies();await context.addCookies([{name:'jx_session',value:other.token,url:origin,httpOnly:true,sameSite:'Strict'}]);
 await page.unroute('**/presentations?beforeRevision=*');await page.reload();await page.getByText('找不到这份存档',{exact:true}).waitFor();assert.equal(await page.getByTestId('p2-narrative').count(),0);
 assert.equal(actionPosts,0);const out=join(root,'docs/integration/handover-01/browser-resume-01');fs.mkdirSync(out);
 await page.screenshot({path:join(out,'account-isolation.png')});
 fs.writeFileSync(join(out,'summary.json'),JSON.stringify({status:'PASS',realPostgres:true,realSession:true,realHttp:true,builtMobileUI:true,syntheticReceipts:true,T1Applied:false,actionPosts,
  checks:['23-revisions-three-pages','exact-unicode-source','no-duplicate-history','current-body-preserved','pending-draft-version-preserved','refresh-recovery','mobile-width','page-failure-retry','late-logout-response-discarded','cross-account-denied']},null,2));console.log('PASS built mobile UI: three history pages, preserved pending/draft/current body, refresh, failure and late logout isolation. Synthetic receipts; T1 BLOCKED.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));await pool?.end();});
