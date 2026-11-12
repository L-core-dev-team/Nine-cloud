// Actual Windows/local launcher + Cookie + PG + synthetic provider; no test code endpoint.
const {spawn,spawnSync}=require('node:child_process'),{once}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{
  const args=['scripts/dev/cards.mjs',...(process.env.CARD_DEMO_POSTGRES_BIN?['--postgres-bin',process.env.CARD_DEMO_POSTGRES_BIN]:[])];
  const child=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',errors='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{errors+=b;});
  let browser;
  try{
    for(let i=0;i<1200&&!output.includes('LOCAL_CARDS_READY');i++){
      if(child.exitCode!==null)throw Error('Launcher failed: '+errors);
      await new Promise(r=>setTimeout(r,100));
    }
    assert(output.includes('LOCAL_CARDS_READY'),'Launcher readiness missing: '+errors);
    const competing=spawnSync(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,encoding:'utf8',timeout:15000});
    assert.notEqual(competing.status,0);assert(String(competing.stderr).includes('launcher lock exists'));
    const state=JSON.parse(await fs.readFile(path.join(root,'.cards-local/state.json'),'utf8'));
    const base=`http://127.0.0.1:${state.webPort}`;
    let webReady=false;for(let i=0;i<150;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(500)})).ok){webReady=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
    assert(webReady,'Frontend readiness missing: '+errors);
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage();
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(base+'/lobby');
    const email=`demo-${randomUUID()}@example.invalid`;
    assert.equal(await page.evaluate(async email=>(await fetch('/api/auth/code',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})})).status,email),202);
    const prefix=`LOCAL_DEMO_CODE ${email} `;
    for(let i=0;i<100&&!output.includes(prefix);i++)await new Promise(r=>setTimeout(r,50));
    const code=output.split(prefix)[1]?.match(/^\d{6}/)?.[0];assert(code);
    assert.equal(await page.evaluate(async data=>(await fetch('/api/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})).status,{email,code}),200);
    await page.getByRole('button',{name:/角色卡模式/}).click();
    await page.getByText('角色卡资料已读取。').waitFor();
    await page.locator('input[type=file]').setInputFiles(path.join(root,'docs/examples/cards-demo.json'));
    await page.getByLabel('我确认有权上传并使用此文件。').check();
    await page.getByRole('button',{name:'上传并核对'}).click();
    await page.getByRole('button',{name:'确认并保存版本'}).click();
    await page.getByText('角色卡版本已确认保存。').waitFor();
    await page.getByRole('button',{name:'开始会话'}).first().click();
    await page.getByRole('button',{name:'确认创建',exact:true}).click();
    await page.getByRole('region',{name:'角色卡会话历史'}).getByText('欢迎来到本地合成演示。',{exact:true}).waitFor();
    const input=page.getByLabel('角色卡行动');await input.fill('本地验证');
    await page.getByRole('button',{name:'提交行动'}).click();
    await page.getByText('本地合成回复（非真实模型）',{exact:true}).waitFor();
    await page.reload();await page.getByText('本地合成回复（非真实模型）',{exact:true}).waitFor();
    await page.getByText(/会话已读取/).waitFor();await input.fill('焦点切换后应保留的草稿');
    const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/session'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;
    await page.waitForTimeout(250);assert.equal(await input.inputValue(),'焦点切换后应保留的草稿');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(pageErrors,[]);
    const cookie=await context.cookies();assert(cookie.some(x=>x.name==='jx_session'&&x.httpOnly));
    await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST'}));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByText('请先登录角色卡所属账号。').waitFor();
    assert.equal(await page.getByLabel('角色卡行动').count(),0);
    assert.equal(await page.getByText('本地合成回复（非真实模型）',{exact:true}).count(),0);
    console.log(JSON.stringify({status:'PASS',scope:'LOCAL_DEMO_REAL_PG_COOKIE_SYNTHETIC',width:360,import:true,chat:true,refresh:true,focusDraft:true,logoutIsolation:true,competingLauncherRejected:true,productionCalls:false}));
  }catch(e){console.error('Demo test failed:',e.message);throw e;}finally{
    await browser?.close();
    // A documented stdin shutdown path works on Windows without killing only the parent.
    if(child.exitCode===null){const ended=once(child,'exit');child.stdin.write('stop\n');if(!await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),5000))])){child.kill();await ended;}}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
