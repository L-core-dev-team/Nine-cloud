const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const evidence = [];
  const dir = path.resolve(__dirname, '../../test-results/first-play'); fs.mkdirSync(dir, {recursive:true});
  try {
    for (const width of [376,390,1366]) for (const theme of ['night','day']) {
      const context = await browser.newContext({viewport:{width,height:844}});
      const page = await context.newPage();
      await page.addInitScript(theme => localStorage.setItem('jx10_appearance', theme), theme);
      await page.goto(process.env.FIRST_PLAY_ORIGIN || 'http://127.0.0.1:4178');
      await page.getByText('服务器剧情回合尚未开放。', {exact:false}).first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      await page.screenshot({path:path.join(dir,`home-${width}-${theme}.png`),fullPage:true});
      await page.getByRole('button',{name:'进入世界',exact:true}).click();
      await page.getByRole('button',{name:/新开一局/}).click();
      await page.getByRole('textbox',{name:'姓名',exact:true}).fill('首次体验行者');
      await page.getByRole('button',{name:'下一步',exact:true}).click();
      await page.getByRole('button',{name:'下一步',exact:true}).click();
      await page.getByRole('button',{name:/保存角色并进入/}).click();
      await page.getByText('本地角色草稿已保存',{exact:true}).waitFor();
      const input = page.locator('#player-intent');
      await input.fill('我走近山门，询问守门人。\n这是未提交草稿。');
      await page.reload();
      await input.waitFor();
      assert.match(await input.inputValue(),/未提交草稿/);
      await page.getByRole('button',{name:'收入待处理',exact:true}).click();
      await page.getByText(/行动已加入本地待处理队列/).waitFor();
      assert.equal(await input.inputValue(),'');
      assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth > innerWidth),false);
      const savedUrl=page.url();
      await page.screenshot({path:path.join(dir,`draft-${width}-${theme}.png`),fullPage:true});
      await page.reload();
      await page.getByText('待处理行动 1 · 尚未结算',{exact:true}).waitFor();
      evidence.push({width,theme,url:savedUrl,localDraftSaved:true,restored:true,serverTurn:false,overflow:false});
      await context.close();
    }
    fs.writeFileSync(path.join(dir,'ux-results.json'),JSON.stringify({browser:browser.version(),os:os.release(),evidence},null,2));
    console.log(JSON.stringify(evidence));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
