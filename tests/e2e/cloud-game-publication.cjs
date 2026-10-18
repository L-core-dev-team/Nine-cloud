// Real PostgreSQL/session/HTTP/built UI recovery; synthetic accepted receipt, NOT approved gameplay integration.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const {join,resolve}=require('node:path');
const {mkdirSync,writeFileSync}=require('node:fs');
const {chromium}=require('playwright');
const root=resolve(__dirname,'../..'),req=createRequire(join(root,'apps/api/package.json'));
const {Pool}=req('pg'),{serve}=req('@hono/node-server'),{serveStatic}=req('@hono/node-server/serve-static');
const input=new URL(process.env.TEST_DATABASE_URL||'');
assert.ok(['127.0.0.1','localhost'].includes(input.hostname)&&/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(input.pathname));
const pool=new Pool({connectionString:input.href});
const load=rel=>import(pathToFileURL(join(root,'apps/api/dist',rel)).href);
let server,browser;
(async()=>{
 const [{createApp},{EmailAuthService},{PostgresEmailAuthRepository},{sessionToken},{AuthoritativeGameService},
 {PostgresCloudSaveRepository},{ServerTurnService},{createPostgresServerTurnRepository},publication,{NarrativeOutboxWorker},{default:plugin}]=await Promise.all([
  load('app.js'),load('services/email-auth.js'),load('services/postgres-email-auth.js'),load('routes/auth.js'),load('services/authoritative-game.js'),
  load('services/postgres-cloud-save-repository.js'),load('services/server-turn.js'),load('services/postgres-server-turn.js'),load('services/narrative-publication-repository.js'),load('services/narrative-outbox-worker.js'),load('services/p1-prologue-plugin.js')]);
 const secret='isolated-narrative-browser-secret'.repeat(3);
 const auth=new EmailAuthService(new PostgresEmailAuthRepository(pool,secret),async()=>{throw Error('NO_EMAIL_EXPECTED');},secret);
 const guest=await auth.createGuest('127.0.1.'+(1+Math.floor(Math.random()*200)));assert.ok(guest);
 const owner=guest.session.ownerId,key=randomUUID(),saveId='narrative-browser-'+randomUUID();
 const {TurnReceiptSchema}=await import(pathToFileURL(join(root,'packages/contracts/dist/index.js')).href);
 const receipt=TurnReceiptSchema.parse({saveId,idempotencyKey:key,requestFingerprint:'sha256:v1:'+'c'.repeat(64),resultingRevision:1,
  decision:{status:'accepted',nextRevision:1,events:[{id:randomUUID(),saveId,type:'move.arrived',source:'RULES',ruleVersion:'fixture',beforeRevision:0,afterRevision:1,occurredAt:new Date().toISOString(),payload:{to:'loc_wangqitai'}}]}});
 const save={schemaVersion:1,saveId,revision:1,canonVersion:'fixture',ruleVersion:'fixture',memoryPolicyVersion:'fixture',state:{playerId:'p',locationId:'loc_wangqitai',elapsedMinutes:1,facts:{}}};
 const c=await pool.connect();try{await c.query('BEGIN');
  await c.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot) VALUES($1,$2,1,1,'fixture','fixture','fixture',$3::jsonb)`,[saveId,owner,JSON.stringify(save.state)]);
  await c.query('INSERT INTO turn_requests(save_id,idempotency_key,expected_revision,result) VALUES($1,$2,0,$3::jsonb)',[saveId,key,JSON.stringify(receipt)]);
  const e=receipt.decision.events[0];await c.query(`INSERT INTO turn_events(id,save_id,idempotency_key,sequence,event_type,source,rule_version,before_revision,after_revision,payload,occurred_at,branch_id) VALUES($1,$2,$3,0,$4,'RULES','fixture',0,1,$5::jsonb,$6,'root')`,[e.id,saveId,key,e.type,JSON.stringify(e.payload),e.occurredAt]);
  await publication.seedNarrativeInTransaction(c,{ownerId:owner,receipt,save,rendererVersion:'existing-p1-deterministic-fixture-v1'});await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 const repository=new publication.NarrativePublicationRepository(pool,publication.TEST_BODY_LIMITS);let calls=0;
 const worker=new NarrativeOutboxWorker(repository,new Map([['existing-p1-deterministic-fixture-v1',(r,c)=>{calls++;return plugin.narrativeFallback(r,c);}]]));
 const published=await worker.run(owner,saveId,key);assert.ok(published?.text);assert.deepEqual(await worker.run(owner,saveId,key),published);assert.equal(calls,1);
 const turnRepo=createPostgresServerTurnRepository(pool,true);
 const resolver={resolveOwnerId:async r=>(await auth.resolve(sessionToken(r)))?.ownerId??null};
 // Bind a port before configuring same-origin session routes.
 const net=require('node:net');const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const origin='http://127.0.0.1:'+port;
 const app=createApp({query:s=>pool.query(s)},undefined,{service:auth,origin},
  {service:new ServerTurnService(turnRepo),games:new AuthoritativeGameService(new PostgresCloudSaveRepository(pool)),auth:resolver},
  {auth:resolver,repository});
 app.get('/api/*',ctx=>ctx.json({code:'NOT_FOUND'},404));
 app.use('*',serveStatic({root:join(root,'apps/web/dist')}));app.get('*',serveStatic({path:join(root,'apps/web/dist/index.html')}));
 server=serve({fetch:app.fetch,hostname:'127.0.0.1',port});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'jx_session',value:guest.token,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage();let actionPosts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/turns'))actionPosts++;});
 await page.goto(origin+'/game/'+saveId);await page.getByTestId('p2-revision').filter({hasText:'1'}).waitFor();
 await page.waitForFunction(text=>document.querySelector('[data-testid="p2-cloud-game"]')?.textContent.includes(text),published.text);
 const data=await page.evaluate(async({saveId,key})=>(await fetch(`/api/games/${saveId}/receipts/${key}/presentation`)).json(),{saveId,key});assert.equal(data.source.sourceId,published.sourceId);
 await page.goto('about:blank');const cdp=await context.newCDPSession(page);await cdp.send('Storage.clearDataForOrigin',{origin,storageTypes:'indexeddb,local_storage'});
 await page.goto(origin+'/game/'+saveId);await page.waitForFunction(text=>document.querySelector('[data-testid="p2-cloud-game"]')?.textContent.includes(text),published.text);
 // A new browser context has no old IndexedDB. Re-authentication uses the existing real session refresh.
 const refreshed=await auth.refresh(guest.token);assert.ok(refreshed);
 const second=await browser.newContext({viewport:{width:390,height:844}});await second.addCookies([{name:'jx_session',value:refreshed.token,url:origin,httpOnly:true,sameSite:'Strict'}]);
 const fresh=await second.newPage();await fresh.goto(origin+'/game/'+saveId);await fresh.waitForFunction(text=>document.querySelector('[data-testid="p2-cloud-game"]')?.textContent.includes(text),published.text);
 const restored=await fresh.evaluate(async({saveId,sourceId})=>(await fetch(`/api/games/${saveId}/sources/${sourceId}`)).json(),{saveId,sourceId:published.sourceId});assert.deepEqual(restored,published);
 const other=await auth.createGuest('127.0.2.'+(1+Math.floor(Math.random()*200)));assert.ok(other);await second.clearCookies();await second.addCookies([{name:'jx_session',value:other.token,url:origin,httpOnly:true,sameSite:'Strict'}]);await fresh.reload();await fresh.getByText('找不到这份存档',{exact:true}).waitFor();assert.ok(!(await fresh.locator('body').innerText()).includes(published.text));
 assert.equal(actionPosts,0);assert.equal(calls,1);
 const out=join(root,'test-results/cloud-game-publication');mkdirSync(out,{recursive:true});
 writeFileSync(join(out,'results.json'),JSON.stringify({realPostgres:true,realSession:true,realHttp:true,builtUI:true,syntheticReceipt:true,approvedGameplayIntegration:false,
 sourceId:published.sourceId,bodySha:published.bodySha,generatorCalls:calls,actionPosts,checks:['initial-read','cleared-cache','new-browser-reauth','same-source','account-isolation'],status:'PASS'},null,2));
 console.log('PASS: PostgreSQL/session/HTTP/built mobile UI recover one immutable source; synthetic receipt, signed gameplay integration BLOCKED.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));await pool.end();});
