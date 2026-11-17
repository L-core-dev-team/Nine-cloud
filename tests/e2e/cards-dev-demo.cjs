// Actual Windows/local launcher + Cookie + PG + synthetic provider; no test code endpoint.
const {spawn,spawnSync}=require('node:child_process'),{once}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const root=process.env.CARD_DEMO_SOURCE_ROOT?path.resolve(process.env.CARD_DEMO_SOURCE_ROOT):path.resolve(__dirname,'../..');
const delivery=process.env.CARD_DEMO_DELIVERY==='1';
(async()=>{
  const args=['scripts/dev/cards.mjs',...(process.env.CARD_DEMO_POSTGRES_BIN?['--postgres-bin',process.env.CARD_DEMO_POSTGRES_BIN]:[])];
  let output='',errors='',child;
  const launch=()=>{output='';errors='';child=spawn(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{errors+=b;});};
  const stop=async()=>{if(child.exitCode===null){const ended=once(child,'exit');child.stdin.write('stop\n');assert(await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),10000))]),'Documented stop must end own launcher');}};
  launch();
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
    let deliveryResult;
    if(delivery){
      assert(root.includes(' '),'Source delivery target must test spaces in its path');
      assert.equal(await fs.access(path.join(root,'.git')).then(()=>true,()=>false),false);
      // Continue through the existing UI; a second synthetic import enables a group.
      await page.getByRole('button',{name:'返回卡库',exact:true}).click();
      const card=JSON.parse(await fs.readFile(path.join(root,'docs/examples/cards-demo.json'),'utf8'));
      (card.data??card).name='第二位合成测试角色';
      await page.locator('input[type=file]').setInputFiles({name:'second-synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(card))});
      await page.getByLabel('我确认有权上传并使用此文件。').check();
      await page.getByRole('button',{name:'上传并核对'}).click();await page.getByRole('button',{name:'确认并保存版本'}).click();
      await page.getByText('角色卡版本已确认保存。').waitFor();
      const group=page.getByRole('region',{name:'创建群聊'});
      await group.locator('input[type=checkbox]').nth(0).check();await group.locator('input[type=checkbox]').nth(1).check();
      await group.getByRole('button',{name:'确认创建群聊',exact:true}).click();
      await page.getByRole('heading',{name:'角色卡群聊',exact:true}).waitFor();
      await page.getByLabel('本次发言方式').selectOption('multi');
      const speakers=page.getByRole('group',{name:'选择发言角色'}).locator('input[type=checkbox]');await speakers.nth(0).check();await speakers.nth(1).check();
      await page.getByLabel('角色卡行动').fill('两位合成角色一起回应');await page.getByRole('button',{name:'提交行动'}).click();
      await page.getByText('行动已完成，历史已更新。').waitFor();
      assert.equal(await page.getByText('本地合成群聊回复（非真实模型）',{exact:true}).count(),2);
      const groupUrl=page.url();await page.reload();await page.getByText(/会话已读取/).waitFor();assert.equal(await page.getByText('本地合成群聊回复（非真实模型）',{exact:true}).count(),2);
      await stop();
      // Occupy ONLY this new snapshot's web port. A failed launcher must not
      // kill the listener, replace state or erase the already-created database.
      const net=require('node:net'),listener=net.createServer();listener.listen(state.webPort,'127.0.0.1');await once(listener,'listening');
      const occupied=spawnSync(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,encoding:'utf8',timeout:120000});
      assert.notEqual(occupied.status,0);assert(/already in use|EADDRINUSE/i.test(occupied.stderr+occupied.stdout));assert.equal(listener.listening,true);await new Promise(r=>listener.close(r));
      const lock=path.join(root,'.cards-local/launcher.lock'),token=randomUUID();
      await fs.writeFile(lock,JSON.stringify({pid:999999999,token}),{flag:'wx'});
      const stale=spawnSync(process.execPath,args,{cwd:root,env:process.env,windowsHide:true,encoding:'utf8',timeout:15000});
      assert.notEqual(stale.status,0);assert(stale.stderr.includes('launcher lock exists'));assert.equal(JSON.parse(await fs.readFile(lock,'utf8')).token,token);
      await fs.unlink(lock); // Only the just-created synthetic stale marker, never a pre-existing lock.
      launch();for(let i=0;i<1200&&!output.includes('LOCAL_CARDS_READY');i++){assert.equal(child.exitCode,null,errors);await new Promise(r=>setTimeout(r,100));}assert(output.includes('LOCAL_CARDS_READY'));
      for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
      await page.goto(groupUrl);await page.getByText(/会话已读取/).waitFor();assert.equal(await page.getByText('本地合成群聊回复（非真实模型）',{exact:true}).count(),2);
      const persisted=JSON.parse(await fs.readFile(path.join(root,'.cards-local/state.json'),'utf8'));assert.deepEqual(persisted,state);
      await page.screenshot({path:path.resolve(process.env.CARD_DEMO_RESULT_DIR||'test-results','source-delivery-group.png'),fullPage:true});
      deliveryResult={noGit:true,pathWithSpaces:true,singleAndMultiUi:true,refresh:true,restartRetainsHistory:true,portConflictRejected:true,staleLockRejected:true,stateIdentityUnchanged:true};
    }
    await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST'}));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByText('请先登录角色卡所属账号。').waitFor();
    assert.equal(await page.getByLabel('角色卡行动').count(),0);
    assert.equal(await page.getByText('本地合成回复（非真实模型）',{exact:true}).count(),0);
    const result={status:'PASS',scope:'LOCAL_DEMO_REAL_PG_COOKIE_SYNTHETIC',width:360,import:true,chat:true,refresh:true,focusDraft:true,logoutIsolation:true,competingLauncherRejected:true,productionCalls:false,...(deliveryResult?{delivery:deliveryResult}:{})};
    if(process.env.CARD_DEMO_RESULT_DIR)await fs.writeFile(path.join(process.env.CARD_DEMO_RESULT_DIR,'source-delivery-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(e){if(process.env.CARD_DEMO_RESULT_DIR){const id=Date.now();await fs.writeFile(path.join(process.env.CARD_DEMO_RESULT_DIR,`failed-${id}.json`),JSON.stringify({status:'FAIL',message:e.message,stack:e.stack},null,2));await fs.writeFile(path.join(process.env.CARD_DEMO_RESULT_DIR,`private-host-${id}.log`),output+'\n'+errors);}console.error('Demo test failed:',e.message);throw e;}finally{
    await browser?.close();
    // A documented stdin shutdown path works on Windows without killing only the parent.
    if(child.exitCode===null){const ended=once(child,'exit');child.stdin.write('stop\n');if(!await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),5000))])){child.kill();await ended;}}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
