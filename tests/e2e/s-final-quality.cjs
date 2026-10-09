const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const net = require('node:net');
const root = resolve(__dirname, '../..');
const { chromium } = require(join(root, 'node_modules/playwright'));
const output = join(root, 'test-results/s-final-quality');
let server, browser;
(async () => {
  mkdirSync(output, {recursive:true});
  const port = await new Promise(resolve => {const socket=net.createServer().listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolve(p));});});
  server=spawn(process.execPath,[join(root,'apps/web/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:join(root,'apps/web'),stdio:'pipe',windowsHide:true});
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const results=[];
  for(const viewport of [{width:320,height:568},{width:360,height:800},{width:844,height:390},{width:720,height:900}]) for(const theme of ['night','day']) {
    const context=await browser.newContext({viewport,reducedMotion:'reduce'});
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(theme=>localStorage.setItem('jx10_appearance',theme),theme);
    await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"code":"AUTH_PROVIDER_UNAVAILABLE"}'}));
    for(const route of ['/','/lobby','/new','/intro','/world','/settings/graphics','/settings/ai','/settings/cloud']) {
      await page.goto(base+route); await page.locator('main').waitFor();
      if(route==='/world') await page.locator('.worldbook-entry').first().waitFor();
      await page.evaluate(()=>document.fonts.ready);
      const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,offenders:Array.from(document.querySelectorAll('main *')).map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,12)}));
      assert.ok(geometry.scroll<=geometry.width+1,`${route} ${theme} ${viewport.width}: horizontal overflow ${JSON.stringify(geometry)}`);
      const name=route.replace(/\//g,'-')||'home';
      await page.screenshot({path:join(output,`${viewport.width}-${theme}${name}.png`)});
      results.push({viewport,theme,route,geometry,status:'PASS'});
    }
    await page.goto(base+'/settings/ai');
    await page.getByRole('button',{name:'进入专业模式',exact:true}).click();
    assert.equal(await page.locator('.role-panel').count(),5,'All professional roles remain available');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,`Professional AI ${viewport.width}: ${overflow}px overflow`);
    const bar=await page.locator('.ai-actionbar').boundingBox();
    assert.ok(bar&&bar.y>=0&&bar.y+bar.height<=viewport.height+1,'Professional action bar remains reachable');
    assert.deepEqual(errors,[],'No browser runtime error');
    await context.close();
    writeFileSync(join(output,'results.json'),JSON.stringify({simulated:true,realDevice:false,results},null,2));
  }
  console.log(`S-FINAL quality: ${results.length} route/theme/viewport checks PASS; professional fields and action bar checked separately.`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
