#!/usr/bin/env node
// Built-web gameplay journey through the authenticated API and real PostgreSQL
// turn transaction. The test-only review plugin supplies the approved rules.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const { existsSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const {textAudit,getTextRuns,maskText}=require('./design-acceptance.cjs');

const root = resolve(__dirname, '../..');
const webRoot = join(root, 'apps/web');
const apiFile = join(root, 'apps/api/dist/index.js');
const pluginFile = join(root, 'apps/api/dist/services/p1-prologue-plugin.js');
const viteFile = join(webRoot, 'node_modules/vite/bin/vite.js');
const apiRequire = createRequire(join(root, 'apps/api/package.json'));
const { Pool } = apiRequire('pg');
const databaseUrl = process.env.TEST_DATABASE_URL;
const evidenceDir = join(root, 'test-results/e2e');

function assertTestDatabase() {
  const result = spawnSync(process.execPath, [join(root, 'scripts/assert-test-database.mjs')], {
    cwd: root, env: process.env, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || 'TEST_DATABASE_URL must name an isolated jiuxiao_test database');
}

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitFor(url, child, stderr, description) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${description} exited early: ${stderr()}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description} at ${url}: ${stderr()}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  if (await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5_000))])) return;
  const killed = once(child, 'exit');
  child.kill('SIGKILL');
  await killed;
}

(async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL to an isolated jiuxiao_test database');
  assertTestDatabase();
  assert.ok(existsSync(apiFile) && existsSync(pluginFile) && existsSync(viteFile), 'Run pnpm build before pnpm test:e2e');
  assert.ok(existsSync(join(webRoot, 'dist/index.html')), 'Build the production web bundle before the P2 browser journey');
  mkdirSync(evidenceDir, { recursive: true });

  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 3_000 });
  let ownerId = null;
  const authSecret = randomBytes(32).toString('hex');
  const apiPort = await availablePort();
  const webPort = await availablePort();
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  let otpRequestCount = 0;
  let apiChild;
  let webChild;
  let apiStderr = '';
  let webStderr = '';
  let browser;

  try {
    await pool.query('SELECT 1');

    apiChild = spawn(process.execPath, [apiFile], {
      cwd: root,
      env: {
        ...process.env,
        STORY_ARCHIVE_ENABLED:'true', NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: String(apiPort),
        AUTH_ENABLED: 'true', AUTH_PUBLIC_ORIGIN: webOrigin,
        AUTH_SECRET: authSecret,
        AUTH_MAIL_FROM: 'p2-test@example.invalid',
        // The runtime defaults to the Tencent SES API, so the SMTP transport has
        // to be named explicitly. This path only needs the API to boot — mail is
        // never sent — so the unreachable port stays: startup must not depend on
        // a reachable mail server.
        AUTH_MAILER: 'smtp', SMTP_URL: 'smtp://127.0.0.1:1',
        DATABASE_URL: databaseUrl,
        TURN_RULES_MODULE: pluginFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    apiChild.stderr.on('data', chunk => { apiStderr += chunk.toString(); });
    apiChild.stdout.on('data', () => {});
    await waitFor(`${apiOrigin}/ready`, apiChild, () => apiStderr, 'PostgreSQL-backed API');

    webChild = spawn(process.execPath, [viteFile, 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
      cwd: webRoot, env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    webChild.stderr.on('data', chunk => { webStderr += chunk.toString(); });
    await waitFor(webOrigin, webChild, () => webStderr, 'built web application');

    const executablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE
      || (process.platform === 'win32' && existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
        ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const context = await browser.newContext({ viewport: { width: 376, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    // Forward same-origin production-bundle API requests to the real local API.
    // No gameplay response is stubbed or synthesized by the browser harness.
    const apiRoundTrips=new Map();
    const realTurnReplies=new Map();
    function capturedTurn(response) {
      const sent=response.request().postDataJSON();
      const key=sent.idempotencyKey??sent.intent?.idempotencyKey;
      const captured=realTurnReplies.get(key);
      assert.ok(captured,'capture the actual upstream reply before forwarding it to Chromium');
      assert.equal(captured.body.receipt.idempotencyKey,key);
      return captured.body;
    }
    let heldStoryResponse = null;
    await page.route('**/api/**', async route => {
      const source = new URL(route.request().url());
      if (source.pathname === '/api/auth/code' && route.request().method() === 'POST') otpRequestCount += 1;
      const began=performance.now();
      const response = await route.fetch({ url: `${apiOrigin}${source.pathname}${source.search}` });
      if(source.pathname.endsWith('/turns')&&route.request().method()==='POST') {
        const sent=route.request().postDataJSON();const key=sent.idempotencyKey??sent.intent?.idempotencyKey;
        const bytes=await response.body();
        realTurnReplies.set(key,{body:JSON.parse(bytes.toString('utf8')),sha256:createHash('sha256').update(bytes).digest('hex')});
        apiRoundTrips.set(key,performance.now()-began);
      }
      if (source.pathname === '/api/auth/guest' && route.request().method() === 'POST' && response.ok()) {
        ownerId = (await response.json()).account.id;
      }
      if (source.pathname.endsWith('/story') && heldStoryResponse) await heldStoryResponse;
      await route.fulfill({ response });
    });

    const timings=[];const actualRequests=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/turns'))actualRequests.push({url:request.url(),body:request.postDataJSON()});});
    await page.addInitScript(()=>{
      window.__storyPerf={};
      document.addEventListener('click',event=>{if(event.target.closest?.('[data-testid="p2-submit-action"]')) {
        const p=window.__storyPerf={expectedRevision:document.querySelectorAll('[data-story-revision]').length+1,start:performance.now(),scrollBefore:document.querySelector('.story-reading')?.scrollTop??0,
          previousReadingId:document.querySelector('[data-testid="p2-narrative"]')?.closest('[data-reading-id]')?.getAttribute('data-reading-id')??null};
        const visible=()=>{
          if(window.__storyPerf!==p)return;
          const narrative=document.querySelector('[data-testid="p2-narrative"]'),reading=document.querySelector('.story-reading');
          const paragraph=narrative?.matches('p')?narrative:narrative?.querySelector('p');
          if(paragraph&&reading&&narrative.closest('[data-reading-id]')?.getAttribute('data-reading-id')!==p.previousReadingId){
            const a=paragraph.getBoundingClientRect(),b=reading.getBoundingClientRect(),line=Number.parseFloat(getComputedStyle(paragraph).lineHeight)||16;
            if(a.top>=b.top&&Math.min(a.bottom,a.top+line)<=b.bottom){p.firstVisibleTextMs=performance.now()-p.start;return;}
          }
          if(performance.now()-p.start<30000)requestAnimationFrame(visible);
        };requestAnimationFrame(visible);
      }},true);
      new MutationObserver(()=>{
        const p=window.__storyPerf;if(!p.start)return;
        const input=document.querySelector('[data-testid="p2-action-input"]');
        const button=document.querySelector('[data-testid="p2-submit-action"]');
        if(button?.textContent.includes('正在')&&!p.busyMs)p.busyMs=performance.now()-p.start;
        const rows=document.querySelectorAll('[data-story-revision]');
        if(rows.length>=(p.expectedRevision??Infinity)&&!p.firstTextDomMs){p.firstTextDomMs=performance.now()-p.start;p.completeTextDomMs=p.firstTextDomMs;}
        if(p.firstTextDomMs&&input&&!input.disabled&&!p.inputReadyMs){p.inputReadyMs=performance.now()-p.start;p.scrollAfter=document.querySelector('.story-reading')?.scrollTop??0;}
      }).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
      try { new PerformanceObserver(list=>{const p=window.__storyPerf;if(p.start)p.layoutShift=(p.layoutShift??0)+list.getEntries().reduce((sum,e)=>sum+e.value,0);}).observe({type:'layout-shift',buffered:false}); }catch{}
    });
    await page.goto(webOrigin);
    await page.getByRole('button',{name:'进入世界',exact:true}).click();
    await page.getByRole('button',{name:/新开一局/}).click();
    await page.getByRole('textbox',{name:'姓名',exact:true}).fill('黄金流程验收行者');
    await page.getByRole('button',{name:'下一步',exact:true}).click();
    await page.getByRole('button',{name:'下一步',exact:true}).click();
    await page.getByTestId('create-server-game').click();
    await page.getByTestId('p2-cloud-game').waitFor();
    await page.locator('[aria-label="故事开场"]').waitFor();
    const saveId=new URL(page.url()).pathname.split('/').at(-1);
    await page.waitForFunction(()=>!document.querySelector('[data-testid="p2-action-input"]').disabled);
    const snapshots=[];
    async function suggest(id) {
      const payload=await page.evaluate(async id=>await (await fetch(`/api/games/${id}/action-suggestions`)).json(),saveId);
      const item=payload.actions.find(item=>item.id===id);assert.ok(item,`Missing approved action ${id}: ${JSON.stringify(payload.actions)}`);
      let button=page.getByRole('button',{name:item.label,exact:true});
      if(!await button.isVisible()){await page.getByRole('button',{name:'更多行动',exact:true}).click();button=page.getByRole('button',{name:item.label,exact:true});}
      await button.click();assert.equal(await page.getByTestId('p2-action-input').inputValue(),item.text);
      return item;
    }
    async function act(text,revision) {
      if(text)await page.getByTestId('p2-action-input').fill(text);
      const response=page.waitForResponse(r=>r.request().method()==='POST'&&(r.url().endsWith('/turns')));
      const started=Date.now();await page.getByTestId('p2-submit-action').click();
      const raw=await response;const body=capturedTurn(raw);assert.equal(body.receipt.decision.status,'accepted',JSON.stringify(body));assert.equal(body.receipt.resultingRevision,revision);
      await page.waitForFunction(revision=>document.querySelectorAll('[data-story-revision]').length===revision,revision);
      await page.waitForFunction(()=>!document.querySelector('[data-testid="p2-action-input"]').disabled);
      assert.equal(await page.locator('.story-history-entry').last().getAttribute('data-reading-id'),body.receipt.idempotencyKey,'the visible story must belong to the real receipt forwarded by the harness');
      assert.equal(await page.getByTestId('p2-narrative').textContent(),body.narrative.text.split(/\n+/).join(''),'the browser must render the complete upstream narrative');
      const feedbackPosition=await page.getByTestId('p2-narrative').locator('p').first().evaluate(paragraph=>{
        const reading=paragraph.closest('.story-reading');const p=paragraph.getBoundingClientRect(),r=reading.getBoundingClientRect();
        return {top:p.top,bottom:p.bottom,readingTop:r.top,readingBottom:r.bottom,fullyVisible:p.top>=r.top&&p.bottom<=r.bottom};
      });
      assert.equal(feedbackPosition.fullyVisible,true,`settled turn ${revision} must show its first feedback paragraph: ${JSON.stringify(feedbackPosition)}`);
      await page.waitForFunction(()=>window.__storyPerf.firstVisibleTextMs>0);
      const api=await page.evaluate(async id=>await (await fetch(`/api/games/${id}/story`)).json(),saveId);
      assert.equal(api.items.length,revision);assert.equal(api.items.at(-1).text,body.narrative.text,'archive must retain the complete exact returned text, including approved hints');
      const perf=await page.evaluate(()=>window.__storyPerf);timings.push({revision,...perf,apiRoundTripMs:apiRoundTrips.get(body.receipt.idempotencyKey)??null,httpAndUIWallMs:Date.now()-started});
      snapshots.push({revision,text:body.narrative.text,events:body.receipt.decision.events.map(e=>e.type),responseSha256:realTurnReplies.get(body.receipt.idempotencyKey).sha256,feedbackPosition});return body;
    }
    await act('对岑九说：这石头怎么办',1);
    await suggest('acquire:src_ferry_shore');
    await page.getByTestId('p2-action-input').fill('打开时光裂缝');
    const invalid=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/turns'));await page.getByTestId('p2-submit-action').click();
    const invalidResponse=await invalid;const invalidBody=capturedTurn(invalidResponse);assert.notEqual(invalidBody.receipt.decision.status,'accepted');assert.equal(invalidBody.receipt.resultingRevision,1);assert.ok(invalidResponse.url().includes(`/api/games/${saveId}/turns`),'editing a structured suggestion must return to signed free-text parsing');
    await page.waitForFunction(()=>!document.querySelector('[data-testid="p2-action-input"]').disabled);
    await suggest('acquire:src_ferry_shore');await act(null,2);
    await act('去渡口作业位',3);
    await act('使用避水符在渡口作业位',4);
    await suggest('combat:npc_shuiyuya');await act(null,5);
    await suggest('return-to-location');await act(null,6);
    await act('去望气台',7);
    await suggest('observe:obstacle_rockslide:scan');await act(null,8);
    await act('去芦花渡',9);
    await suggest('quest:claim');const claimed=await act(null,10);
    const rows=await pool.query('SELECT revision,snapshot FROM game_saves WHERE id=$1',[saveId]);assert.equal(rows.rows[0].snapshot.facts.questState.rewardClaimed,true);
    const originalHistory=await page.locator('.story-history-entry').allTextContents();
    await page.getByTestId('p2-action-input').fill('打开时光裂缝');
    await page.getByTestId('p2-submit-action').click();await page.getByRole('heading',{name:'再说具体一点'}).waitFor();
    assert.equal(await page.locator('.story-history-entry').count(),10);
    let releaseStoryResponse;
    heldStoryResponse = new Promise(resolve => { releaseStoryResponse = resolve; });
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-story-revision]').length===10);
    assert.equal(await page.getByTestId('p2-action-input').isDisabled(), true, 'cached history must not unlock actions before the authoritative refresh completes');
    releaseStoryResponse();heldStoryResponse = null;
    await page.waitForFunction(()=>!document.querySelector('[data-testid="p2-action-input"]').disabled);
    assert.deepEqual(await page.locator('.story-history-entry').allTextContents(),originalHistory,'all story paragraphs must return unchanged after reload');
    assert.equal(await page.locator('.story-history-entry').last().locator('p').first().evaluate(p=>{
      const a=p.getBoundingClientRect(),b=p.closest('.story-reading').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom;
    }),true,'refresh must retain the newest presented story anchor when the reader did not scroll elsewhere');
    const history=await page.evaluate(async id=>await (await fetch(`/api/games/${id}/story`)).json(),saveId);assert.equal(history.items.length,10);
    const archive=await pool.query('SELECT count(*)::int AS count FROM story_narratives WHERE save_id=$1',[saveId]);assert.equal(archive.rows[0].count,10);
    await assert.rejects(pool.query('UPDATE story_narratives SET narrative_text=$2 WHERE save_id=$1',[saveId,'must not overwrite']),/STORY_NARRATIVE_IMMUTABLE/);
    const contrast=[];
    for(const theme of ['night','day']) {
    if(theme==='day')await page.getByRole('button',{name:'切换到晴昼配色'}).click();
    for(const width of [376,390,1366]) {
      await page.setViewportSize({width,height:844});
      assert.ok((await page.locator('.story-reading').boundingBox()).height>=120);
      assert.equal(await page.locator('.story-history-entry').evaluateAll(rows=>rows.every(row=>row.scrollHeight<=row.clientHeight+1)),true,'story paragraphs must not be flex-shrunk and overlap');
      const input=await page.getByTestId('p2-action-input').boundingBox();const send=await page.getByTestId('p2-submit-action').boundingBox();assert.ok(input.y>=0&&send.y+send.height<=844);
      await page.getByTestId('p2-action-input').fill('观察渡船');
      await page.evaluate(()=>document.fonts.ready);
      const runs=await getTextRuns(page);const source=await page.screenshot({path:join(evidenceDir,`golden-story-${theme}-${width}.png`)});
      const mask=await maskText(page);const backgrounds=[];
      for(let frame=0;frame<3;frame++){if(frame)await page.waitForTimeout(320);backgrounds.push(await page.screenshot());}
      await mask.evaluate(style=>style.remove());
      const audited=textAudit(source,backgrounds,runs,`${theme}/${width}`);contrast.push({theme,width,...audited});assert.deepEqual(audited.failures,[],JSON.stringify(audited.failures));
    }
    }
    const second=await page.evaluate(async()=>{const r=await fetch('/api/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),choices:{memoryMode:'continue'}})});return r.json()});
    const secondHistory=await page.evaluate(async id=>await (await fetch(`/api/games/${id}/story`)).json(),second.save.saveId);assert.deepEqual(secondHistory.items,[],'another save has no inherited story');
    const {StoryArchive}=await import('../../apps/api/dist/services/story-archive.js');const archiveService=new StoryArchive(pool);
    let rendered=0;assert.equal(await archiveService.retain(history.items[0].receipt,'deterministic',()=>{rendered++;return 'must not render'}),history.items[0].text);assert.equal(rendered,0);
    await assert.rejects(archiveService.retain({...history.items[0].receipt,resultingRevision:999},'deterministic',()=>'forged'),/STORY_RECEIPT_MISMATCH/);
    assert.deepEqual((await archiveService.read('different-owner',saveId,10)).items,[]);
    assert.equal((await archiveService.read(ownerId,saveId,10,3)).items.length,3);
    const original=actualRequests[0];const retried=await page.evaluate(async request=>{const r=await fetch(request.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request.body)});return r.json()},original);assert.equal(retried.receipt.resultingRevision,1);assert.equal(retried.narrative.text,history.items[0].text);
    const foreign=await browser.newContext();const foreignPage=await foreign.newPage();await foreignPage.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:`${apiOrigin}${url.pathname}${url.search}`});await route.fulfill({response})});await foreignPage.goto(webOrigin);
    const unauthorized=await foreignPage.evaluate(async id=>{const r=await fetch(`/api/games/${id}/story`);return {status:r.status,body:await r.json()}},saveId);assert.equal(unauthorized.status,401);
    const foreignOwner=await foreignPage.evaluate(async()=>{const r=await fetch('/api/auth/guest',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});return {status:r.status,body:await r.json()}});assert.ok(foreignOwner.status<300,JSON.stringify(foreignOwner));
    const denied=await foreignPage.evaluate(async id=>(await fetch(`/api/games/${id}/story`)).status,saveId);assert.equal(denied,404,'authenticated foreign account must not read another story');await foreign.close();
    assert.deepEqual(pageErrors,[]);
    require('node:fs').writeFileSync(join(evidenceDir,'golden-story-evidence.json'),JSON.stringify({saveId,source:'real PostgreSQL and unmodified signed review rules; no story or turn stubs',snapshots,timings,contrast,archiveRows:10,fullRestore:true,foreignAccessStatus:unauthorized.status,authenticatedForeignAccessStatus:denied,immutableAndIdempotent:true,forgedReceiptRejected:true,earlierCursor:true,otherSaveEmpty:true,memoryInfluence:'BLOCKED_PENDING_AUTHOR_REVIEW',knownNarrativeDefect:'post-clearance static observation still mentions grey-feather crows; author-approved state variants required',finalQuest:rows.rows[0].snapshot.facts.questState},null,2));
    console.log(JSON.stringify({result:'PASS_APPROVED_SEGMENT_ONLY',saveId,turns:10,archiveRows:10,fullRestore:true,timings,memoryInfluence:'NOT_PROVEN',newPlayerComprehension:'HUMAN_REQUIRED'},null,2));
    await context.close();
  } finally {await browser?.close();await stop(webChild);await stop(apiChild);await pool.end();}
})().catch(error=>{console.error(error);process.exitCode=1});
