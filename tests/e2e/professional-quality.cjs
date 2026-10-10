const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../..');
const { getTextRuns, maskText, textAudit } = require('./design-acceptance.cjs');
const output = process.env.JX_E2E_OUTPUT_DIR || join(root,'test-results/professional-quality');
let server, browser;
(async()=>{
  mkdirSync(output,{recursive:true});
  const port=await new Promise(resolve=>{const socket=net.createServer().listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
  server=spawn(process.execPath,[join(root,'apps/web/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:join(root,'apps/web'),stdio:'pipe',windowsHide:true});
  const origin=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const results=[], contrastFailures=[], focusFailures=[];
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390},{width:1366,height:768}])for(const theme of ['night','day']){
    const context=await browser.newContext({viewport,reducedMotion:'reduce'});
    const page=await context.newPage();
    await page.addInitScript(theme=>localStorage.setItem('jx10_appearance',theme),theme);
    await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"code":"AUTH_PROVIDER_UNAVAILABLE"}'}));
    await page.goto(origin+'/settings/ai');
    await page.getByRole('button',{name:'进入专业模式',exact:true}).click();
    assert.equal(await page.locator('.role-panel').count(),5);
    await page.locator('.role-panel, .advanced-fields').evaluateAll(elements=>elements.forEach(e=>{e.open=true;}));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Expanded professional fields cannot overflow the page');
    const small=await page.locator('.ai-page :is(.setting-field small, .quiet-note)').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
    assert.ok(small.every(size=>size>=12),'Helper text must remain at least 12 CSS px');
    const inputSizes=await page.locator('.ai-page :is(input:not([type="checkbox"]), select, textarea)').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize)));
    assert.ok(inputSizes.every(size=>size>=16),'Text entry must keep the existing iOS 16px floor');
    assert.ok((await page.locator('.ai-page button:disabled').evaluateAll(elements=>elements.map(e=>getComputedStyle(e).opacity))).every(opacity=>Number(opacity)===1),'Disabled labels retain readable foreground opacity');
    const bar=await page.locator('.ai-actionbar').boundingBox();
    assert.ok(bar&&bar.y>=0&&bar.y+bar.height<=viewport.height+1);
    assert.deepEqual(await page.locator('.ai-actionbar > button').allTextContents(),['保存配置','调用记录','关闭'],'Operation-bar actions and order remain intact');
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const filing=await page.locator('.footer-filing').boundingBox();
    const bottomBar=await page.locator('.ai-actionbar').boundingBox();
    assert.ok(filing&&bottomBar&&filing.y>=0&&filing.y+filing.height<=bottomBar.y,'Legal links remain visible above the fixed operation bar at the page end');
    for(const [name,open] of [['catalog',()=>page.locator('.provider-open').click()],['provider-detail',async()=>{await page.locator('.provider-open').click();await page.locator('.provider-name-list button').first().click();}],['comparison',()=>page.locator('.ai-page > .comparison-link').click()],['preset',()=>page.locator('.preset-card .secondary').first().click()],['logs',()=>page.getByRole('button',{name:'调用记录',exact:true}).click()]]){
      await open();
      const dialog=page.locator('.glass-dialog');
      await dialog.waitFor({state:'visible'});
      const bounds=await dialog.boundingBox();
      assert.ok(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=viewport.width+1&&bounds.y>=-1&&bounds.y+bounds.height<=viewport.height+1,`${name} dialog stays inside the viewport`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.ok(await page.getByRole('button',{name:'关闭窗口',exact:true}).isVisible());
      if (!await dialog.evaluate(e=>e.contains(document.activeElement))) focusFailures.push({viewport,theme,name,activeElement:await page.evaluate(()=>document.activeElement.tagName)});
      // Measure the rendered modal, not the page underneath its native top layer.
      // Offscreen table/disclosure content stays accessible through its existing
      // scroll region; visible glyph rectangles are clipped by real ancestors.
      for(const position of ['top','bottom']) {
        await dialog.locator('.dialog-scroll-region').evaluate((e,position)=>{e.scrollTop=position==='top'?0:e.scrollHeight;},position);
        await dialog.locator('.model-table-wrap').evaluateAll((elements,position)=>elements.forEach(e=>{e.scrollLeft=position==='top'?0:e.scrollWidth;}),position);
        const scrollY = await page.evaluate(()=>window.scrollY);
        const runs = (await getTextRuns(page,'.glass-dialog')).map(run=>({...run,rects:run.rects.map(rect=>({...rect,y:rect.y-scrollY}))}));
        const source = await page.screenshot({animations:'disabled'});
        const mask = await maskText(page);
        const background = await page.screenshot({animations:'disabled'});
        await mask.evaluate(e=>e.remove());
        const audit=textAudit(source,[background],runs,`${name}/${position}/${theme}/${viewport.width} `);
        if(audit.failures.length)contrastFailures.push({viewport,theme,name,position,failures:audit.failures});
      }
      await page.screenshot({path:join(output,`professional-${name}-${theme}-${viewport.width}.png`)});
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
    }
    results.push({viewport,theme,status:'PASS',expandedFields:true,dialogs:5,dialogPositions:2,realDevice:false});
    await context.close();
  }
  writeFileSync(join(output,'professional-quality.json'),JSON.stringify({results,contrastFailures,focusFailures},null,2));
  assert.deepEqual(contrastFailures,[],'All 50 professional dialogs at top/bottom and left/right table positions must meet the unchanged AA thresholds');
  assert.deepEqual(focusFailures,[],'Native dialogs must retain keyboard focus after each view transition');
  console.log(`Professional quality: ${results.length} viewport/theme groups PASS; five roles, expanded advanced fields, 50 dialogs at 100 positions, fixed actions, readable disabled labels and legal-link clearance.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
