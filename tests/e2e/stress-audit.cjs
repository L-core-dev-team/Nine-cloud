// Test-only synthetic stress audit. Never contacts a live API or writes product code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const net = require('node:net');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const mode = process.argv[2] || 'navigation';
const out = process.env.STRESS_OUTPUT || path.join(root, 'test-results/stress-audit', mode);
fs.mkdirSync(out, {recursive:true});
const started = Date.now();
const report = {mode, started:new Date(started).toISOString(), sha:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), results:[], memory:[], errors:[], crashes:[], consoleErrors:[], blocked:[], limits:{screenshots:8,diagnostics:100}};
let server, browser, shots=0;
function persist(){fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2));}
async function test(name, fn, page) {
  const start=Date.now();
  try {const evidence=await fn(); report.results.push({name,status:'PASS',ms:Date.now()-start,evidence});}
  catch(error){report.results.push({name,status:'FAIL',ms:Date.now()-start,error:String(error.stack)});if(page && shots++<8)await page.screenshot({path:path.join(out,`failure-${shots}.png`)}).catch(()=>{});}
  persist();
}
async function context(viewport={width:1366,height:900},reducedMotion='no-preference') {
  const ctx=await browser.newContext({viewport,reducedMotion,acceptDownloads:true});
  await ctx.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1' && !u.pathname.startsWith('/api/'))return route.continue();
    if(['data:','blob:'].includes(u.protocol))return route.continue();
    return route.fulfill({status:503,contentType:'application/json',body:'{"code":"SYNTHETIC_UNAVAILABLE"}'});
  });
  const page=await ctx.newPage();page.setDefaultTimeout(8000);
  page.on('pageerror',e=>{if(report.errors.length<100)report.errors.push({message:e.message,url:page.url()});});
  page.on('crash',()=>report.crashes.push(page.url()));
  page.on('console',m=>{if(m.type()==='error'&&report.consoleErrors.length<100)report.consoleErrors.push({text:m.text(),url:page.url()});});
  return {ctx,page};
}
async function menu(page,label,pathname){
  await page.getByRole('button',{name:'菜单',exact:true}).click();
  await page.locator('aside').getByRole('button',{name:label,exact:true}).click();
  await page.waitForURL(u=>u.pathname===pathname);
  await page.locator('main').waitFor();
}
async function seed(page,base,name) {
  await page.goto(base+'/new');
  await page.locator('.form input').first().fill(name);
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByRole('button',{name:/^保存角色并进入/}).click();
  await page.locator('#player-intent').waitFor();
  return page.url();
}
async function sample(cdp,page,phase,gc=false){
  const before=(await cdp.send('Performance.getMetrics')).metrics;
  if(gc)await cdp.send('HeapProfiler.collectGarbage');
  const metrics=(await cdp.send('Performance.getMetrics')).metrics;
  const pick=list=>Object.fromEntries(list.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners'].includes(x.name)).map(x=>[x.name,x.value]));
  const row={seconds:(Date.now()-started)/1000,phase,url:page.url(),gc,raw:pick(before),measured:pick(metrics),dom:await cdp.send('Memory.getDOMCounters')};
  report.memory.push(row);persist();return row;
}
async function navigation(base,smoke=false){
  const {ctx,page}=await context();await seed(page,base,'合成导航压力存档');
  const cdp=await ctx.newCDPSession(page);await cdp.send('Performance.enable');
  const routes=[['回到山门','/lobby'],['新开一局','/new'],['阅读世界设定','/world'],['AI 设置','/settings/ai'],['画面与声音','/settings/graphics'],['账号与云档','/settings/cloud'],['回到山门','/lobby'],[null,'/saves']];
  for(let cycle=0;cycle<(smoke?2:30);cycle++){
    for(const [label,route] of routes)await test(`route-${cycle}-${route}`,async()=>{
      const before=page.url();
      if(label)await menu(page,label,route);else{await page.getByRole('button',{name:/^管理存档/}).click();await page.waitForURL(u=>u.pathname===route);}
      assert.notEqual(page.url(),before);
      if(route==='/settings/ai') {
        const professional=page.getByRole('button',{name:'进入专业模式',exact:true});
        if(await professional.isVisible())await professional.click();
        await page.locator('.provider-open').click();await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Tab');assert.equal(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)),true);
        await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
      }
      if(route==='/world'){await page.locator('.worldbook-entry').first().waitFor();assert.equal(await page.locator('.worldbook-entry').count(),34);}
      return {pathname:route,changed:before!==page.url()};
    },page);
    await test(`history-${cycle}`,async()=>{await page.goBack();await page.waitForURL(u=>u.pathname==='/lobby');await page.goForward();await page.waitForURL(u=>u.pathname==='/saves');},page);
    if(cycle%3===0)await test(`refresh-${cycle}`,async()=>{await page.reload();await page.getByRole('heading',{name:'存档管理',exact:true}).waitFor();},page);
    await sample(cdp,page,`cycle-${cycle}`,cycle===2||cycle===9||cycle===19||cycle===29);
    process.stdout.write(`cycle ${cycle+1} complete\n`);
  }
  await menu(page,'阅读世界设定','/world');
  await page.locator('.worldbook-entry').first().waitFor();
  await page.screenshot({path:path.join(out,'world-start.png')});
  await page.evaluate(()=>{window.__stressFrames=0;function tick(){window.__stressFrames++;window.__stressRAF=requestAnimationFrame(tick);}tick();});
  const dwell=smoke?2:600, dwellStart=Date.now();
  for(let elapsed=0;elapsed<dwell;elapsed+=smoke?2:30){
    await page.waitForTimeout((smoke?2:30)*1000);
    await test(`world-dwell-${elapsed}`,async()=>{
      const reading=await page.evaluate(()=>({frames:window.__stressFrames,visibility:document.visibilityState,canvas:document.querySelectorAll('canvas').length,entries:document.querySelectorAll('.worldbook-entry').length}));
      assert.equal(reading.entries,34);assert.equal(reading.visibility,'visible');assert.ok(reading.frames>0);
      await page.getByRole('searchbox',{name:'搜索已审核世界设定'}).fill('天工阁');
      await page.getByRole('heading',{name:'天工阁',exact:true}).waitFor();
      await page.getByRole('searchbox',{name:'搜索已审核世界设定'}).fill('');
      return reading;
    },page);
    await sample(cdp,page,`dwell-${elapsed}`,false);
    process.stdout.write(`dwell ${Math.round((Date.now()-dwellStart)/1000)} seconds\n`);
  }
  report.dwellSeconds=(Date.now()-dwellStart)/1000;
  await sample(cdp,page,'world-end-GC',true);
  await page.screenshot({path:path.join(out,'world-end.png')});await ctx.close();
}
async function mobile(base){
  for(const width of [320,390,430])for(const reduced of ['no-preference','reduce']){
    const {ctx,page}=await context({width,height:844},reduced);
    const game=await seed(page,base,`合成压力-${width}-${reduced}`);
    for(let cycle=0;cycle<5;cycle++){
      await test(`mobile-${width}-${reduced}-${cycle}`,async()=>{
        await page.goto(game);const input=page.locator('#player-intent');await input.fill(`合成草稿${cycle}`);await input.focus();
        assert.equal(await input.evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await input.evaluate(e=>e===document.activeElement),false);
        for(const label of ['角色状态','综合情报','星记忆']){const button=page.getByRole('button',{name:label,exact:true});await button.click();const dialog=page.getByRole('dialog',{name:`${label}详情`,exact:true});await dialog.waitFor();await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(e=>e.contains(document.activeElement)),true);await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await button.evaluate(e=>e===document.activeElement),true);}
        await page.setViewportSize({width:844,height:width});await input.waitFor();await page.setViewportSize({width,height:844});
        await page.getByRole('button',{name:'菜单',exact:true}).click();await page.locator('aside').getByRole('button',{name:/切换到.*配色/}).click();
        await menu(page,'阅读世界设定','/world');for(let j=0;j<8;j++){await page.mouse.wheel(0,j%2?-650:650);await page.waitForTimeout(40);}
        assert.equal(await page.locator('.worldbook-entry').count(),34);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        return {theme:await page.locator('html').getAttribute('data-theme'),viewport:page.viewportSize(),scrollOperations:8,dialogs:3};
      },page);
    }
    await ctx.close();
  }
}
async function recovery(base){
  const {ctx,page}=await context();const game=await seed(page,base,'合成恢复存档');
  const key='jiuxiao_1_local_saves_v2';
  await page.locator('#player-intent').fill('合成未提交草稿');await page.locator('#player-intent').blur();await page.waitForTimeout(400);
  const snapshot=await page.evaluate(key=>localStorage.getItem(key),key);assert.ok(snapshot);
  for(let n=0;n<12;n++)await test(`save-refresh-${n}`,async()=>{await page.reload();await page.locator('#player-intent').waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),snapshot);assert.equal(await page.locator('#player-intent').inputValue(),'合成未提交草稿');},page);
  for(let n=0;n<3;n++)await test(`invalid-import-${n}`,async()=>{
    await page.getByRole('button',{name:'菜单',exact:true}).click();await page.locator('aside input[type=file]').setInputFiles({name:`synthetic-invalid-${n}.json`,mimeType:'application/json',buffer:Buffer.from('{ invalid synthetic json')});
    await page.waitForTimeout(300);assert.equal(await page.locator('.import-preview').count(),0);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),snapshot);
    const text=await page.locator('body').innerText();assert.match(text,/失败|无法|错误|不是|解析/);return {protected:true};
  },page);
  await test('tab-interruption',async()=>{await page.close();const next=await ctx.newPage();await next.goto(game);await next.locator('#player-intent').waitFor();assert.equal(await next.locator('#player-intent').inputValue(),'合成未提交草稿');assert.equal(await next.evaluate(key=>localStorage.getItem(key),key),snapshot);await next.close();});
  await ctx.close();
  const cloud=await context();const p=cloud.page;
  const save={schemaVersion:1,saveId:'cloud-stress-synthetic',canonVersion:'synthetic-canon',ruleVersion:'synthetic-rules',memoryPolicyVersion:'synthetic-memory',revision:0,state:{playerId:'synthetic-player',locationId:'synthetic-location',elapsedMinutes:0,facts:{gameMinute:0}}};
  let submissions=0,delay=200,fail=true;
  await cloud.ctx.route('**/api/**',async route=>{
    const url=new URL(route.request().url());if(url.pathname.endsWith('/turns')){submissions++;await new Promise(r=>setTimeout(r,delay));const request=route.request().postDataJSON();await route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{code:'SYNTHETIC_UNAVAILABLE'}:{receipt:{idempotencyKey:request.idempotencyKey,saveId:save.saveId,requestFingerprint:`sha256:v1:${'0'.repeat(64)}`,decision:{status:'rejected',code:'INPUT_SYNTHETIC',message:'合成拒绝回执',revision:0},resultingRevision:0}})}).catch(()=>{});}
    else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('/action-suggestions')?{actions:[]}:{save})});
  });
  await p.goto(base+'/game/'+save.saveId);await p.getByTestId('p2-action-input').waitFor();
  for(let n=0;n<3;n++)await test(`cloud-503-retry-${n}`,async()=>{
    fail=true;delay=350;const before=submissions;await p.getByTestId('p2-action-input').fill('合成行动');await p.getByTestId('p2-submit-action').click();
    assert.equal(await p.getByTestId('p2-submit-action').isDisabled(),true);
    await p.getByTestId('p2-status').filter({hasText:'服务端请求未完成'}).waitFor();assert.equal(await p.getByTestId('p2-action-input').inputValue(),'合成行动');await p.waitForTimeout(500);assert.equal(submissions,before+1);
    fail=false;await p.getByTestId('p2-submit-action').click();await p.getByTestId('p2-narrative').waitFor();assert.equal(submissions,before+2);assert.equal(await p.getByTestId('p2-revision').innerText(),'0');return {requests:2,automaticRetries:0};
  },p);
  await test('cloud-pending-double-submit',async()=>{fail=true;delay=2000;const before=submissions;await p.getByTestId('p2-action-input').fill('合成待处理');await p.getByTestId('p2-submit-action').click();await p.locator('form').evaluate(e=>{e.requestSubmit();e.requestSubmit();});await p.getByTestId('p2-status').filter({hasText:'服务端请求未完成'}).waitFor();assert.equal(submissions,before+1);return {requests:submissions-before};},p);
  report.blocked.push({name:'P3-authoritative-recovery',status:'BLOCKED',reason:'Mock UI observations do not verify server idempotency, authoritative history, cloud draft durability, memory permissions or retry contracts. Await P3 contracts.'});
  await cloud.ctx.close();
}
(async()=>{
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  server=spawn(process.execPath,[path.join(root,'apps/web/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.join(root,'apps/web'),windowsHide:true,stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;let ready=false;for(let n=0;n<100;n++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});report.browser=browser.version();
  if(mode==='navigation'||mode==='smoke')await navigation(base,mode==='smoke');else if(mode==='mobile')await mobile(base);else if(mode==='recovery')await recovery(base);else throw Error('Unknown mode');
  await test('no-runtime-crash-or-pageerror',()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.crashes,[]);});
})().catch(e=>{report.results.push({name:'harness-or-setup',status:'FAIL',error:String(e.stack)});}).finally(async()=>{report.seconds=(Date.now()-started)/1000;persist();await browser?.close();server?.kill();process.exitCode=report.results.some(x=>x.status==='FAIL')?1:0;process.stdout.write(JSON.stringify({mode,seconds:report.seconds,pass:report.results.filter(x=>x.status==='PASS').length,fail:report.results.filter(x=>x.status==='FAIL').length,blocked:report.blocked.length})+'\n');});
