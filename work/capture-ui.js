const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
 const port=process.argv[2]||8771;
 const output=path.resolve(process.argv[3]||'.impeccable/review');
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const failures=[];

 async function openPage(label,width,height,options={}){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<600,hasTouch:width<600,reducedMotion:options.reducedMotion?'reduce':'no-preference'});
  const page=await context.newPage();
  page.on('console',message=>{if(['error','warning'].includes(message.type()))failures.push(`${label}: ${message.type()} ${message.text()}`)});
  page.on('pageerror',error=>failures.push(`${label}: pageerror ${error.message}`));
  if(options.reducedTransparency){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  }
  await page.goto(`http://127.0.0.1:${port}/九霄WEB-1.0.html`,{waitUntil:'networkidle'});
  await page.waitForSelector('#messages .msg.ai');
  return {context,page};
 }

 async function showLanding(page){
  await page.getByRole('button',{name:'新开一局'}).click();
  await page.locator('#landing').evaluate(node=>node.scrollTo(0,0));
  await page.waitForTimeout(900);
 }

 for(const viewport of [{name:'mobile',width:390,height:844},{name:'desktop',width:1440,height:900}]){
  const {context,page}=await openPage(viewport.name,viewport.width,viewport.height);
  await showLanding(page);
  await page.screenshot({path:path.join(output,`${viewport.name}.png`)});
  await page.getByRole('button',{name:'进入世界'}).click();
  await page.waitForTimeout(650);
  await page.screenshot({path:path.join(output,`${viewport.name}-game.png`)});
  await page.getByRole('button',{name:/角色状态/}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,`${viewport.name}-data.png`)});
  await page.getByRole('button',{name:'×'}).click();
  await page.getByRole('button',{name:'AI设置'}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,`${viewport.name}-settings.png`)});
  await page.getByRole('button',{name:'关闭'}).click();
  await page.getByRole('button',{name:'功能菜单'}).click();
  await page.getByRole('button',{name:'存档列表'}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,`${viewport.name}-saves.png`)});
  await context.close();

  for(const preference of ['reduced-motion','reduced-transparency']){
   const reduced=await openPage(`${viewport.name}-${preference}`,viewport.width,viewport.height,{
    reducedMotion:preference==='reduced-motion',
    reducedTransparency:preference==='reduced-transparency'
   });
   await showLanding(reduced.page);
   await reduced.page.screenshot({path:path.join(output,`${viewport.name}-${preference}.png`)});
   await reduced.context.close();
  }
 }
 await browser.close();
 if(failures.length)throw new Error(failures.join('\n'));
 console.log(`Captured ${fs.readdirSync(output).filter(name=>name.endsWith('.png')).length} review images in ${output}`);
})().catch(error=>{console.error(error);process.exit(1)});
