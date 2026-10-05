#!/usr/bin/env node
// Mock authoritative receipts only; not signed rules, real API or physical-device acceptance.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const root=resolve(__dirname,'../..'), webRoot=join(root,'apps/web'), origin='http://127.0.0.1:15175', previewOrigin='http://127.0.0.1:15176';
const viteFile=join(webRoot,'node_modules/vite/bin/vite.js');
const internalEnv={...process.env,VITE_ENABLE_INTERNAL_TURN_WORKSPACE:'true'};
const previewEnv={...process.env};delete previewEnv.VITE_ENABLE_INTERNAL_TURN_WORKSPACE;
const child=spawn(process.execPath,[viteFile,'--host','127.0.0.1','--port','15175','--strictPort'],{cwd:webRoot,env:internalEnv,stdio:'pipe',windowsHide:true});
const previewChild=spawn(process.execPath,[viteFile,'preview','--host','127.0.0.1','--port','15176','--strictPort'],{cwd:webRoot,env:previewEnv,stdio:'pipe',windowsHide:true});
child.stderr.on('data',data=>process.stderr.write(data));previewChild.stderr.on('data',data=>process.stderr.write(data));
function canonical(v){if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;if(v!==null&&typeof v==='object')return `{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;return JSON.stringify(v);}
(async()=>{
 let ready=false,previewReady=false;for(let i=0;i<100;i++){try{if(!ready)ready=(await fetch(origin)).ok;if(!previewReady)previewReady=(await fetch(previewOrigin)).ok;if(ready&&previewReady)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready&&previewReady,'Turn dev and production preview servers must be ready');
 const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';const executablePath=process.env.PLAYWRIGHT_BROWSER_EXECUTABLE||(process.platform==='win32'&&existsSync(edge)?edge:undefined);
 const browser=await chromium.launch(executablePath?{executablePath}:{});const evidence=[];
 try{
 const playerPage=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
 await playerPage.goto(`${previewOrigin}/turns`);await playerPage.getByRole('heading',{name:'选择去处'}).waitFor();
 assert.equal(new URL(playerPage.url()).pathname,'/lobby');assert.equal(await playerPage.getByLabel('权威存档').count(),0);assert.equal(await playerPage.getByRole('heading',{name:'回合处理'}).count(),0);
 await playerPage.getByRole('button',{name:/新开一局/}).click();await playerPage.getByLabel('姓名',{exact:true}).fill('入口检查');
 await playerPage.getByRole('button',{name:'下一步'}).click();await playerPage.getByRole('button',{name:'下一步'}).click();
 await playerPage.getByRole('button',{name:/保存角色并进入/}).click();await playerPage.getByLabel('此刻欲行何事').waitFor();
 assert.equal(await playerPage.getByRole('button',{name:'回合处理',exact:true}).count(),0);
 await playerPage.goto(`${previewOrigin}/turns`);await playerPage.getByRole('heading',{name:'选择去处'}).waitFor();
 assert.equal(await playerPage.getByLabel('权威存档').count(),0);await playerPage.close();
 await require('./creation-race.cjs').checkCreationRace(browser,origin);for(const [width,height]of[[390,844],[393,852],[402,874],[430,932]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});let page=await context.newPage();let committed=null,calls=0,narrationCalls=0;
 const save={schemaVersion:1,saveId:'fixture',canonVersion:'fixture-only',ruleVersion:'fixture-only',memoryPolicyVersion:'fixture-only',revision:0,state:{playerId:'player',locationId:'fixture-gate',elapsedMinutes:0,facts:{}}};
 await context.route('**/api/**',async route=>{const url=new URL(route.request().url());let body;
 if(url.pathname==='/api/auth/session')body={account:{id:'fixture-owner',email:'synthetic@example.invalid'}};
 else if(url.pathname==='/api/saves')body={saves:[save]};
 else if(url.pathname==='/api/saves/fixture')body={save:{...save,revision:committed?1:0}};
 else if(url.pathname==='/api/games/fixture/action-suggestions')body={status:'ready',revision:committed?1:0,actions:[]};
 else if(url.pathname==='/api/turns'){
 const {intent,requestNarrative}=route.request().postDataJSON();
 if(!committed)committed={saveId:intent.saveId,idempotencyKey:intent.idempotencyKey,requestFingerprint:`sha256:v1:${createHash('sha256').update(canonical(intent)).digest('hex')}`,resultingRevision:1,decision:{status:'accepted',nextRevision:1,events:[{id:randomUUID(),saveId:'fixture',type:'fixture',beforeRevision:0,afterRevision:1,occurredAt:'2026-10-01T00:00:00.000Z',source:'RULES',ruleVersion:'fixture-only',payload:{}}]}};
 assert.equal(intent.idempotencyKey,committed.idempotencyKey);
 if(requestNarrative){narrationCalls++;if(narrationCalls===1){await new Promise(r=>setTimeout(r,500));try{await route.fulfill({json:{status:'accepted',receipt:committed,narrative:{status:'failed'}}});}catch{}return;}body={status:'accepted',receipt:committed,narrative:{status:'received',text:'规则已提交，只有叙事展示。'}};}
 else{calls++;if(calls===1){await route.abort('failed');return;}body={status:'accepted',duplicate:true,receipt:committed,narrative:{status:'not_requested'}};}
 }else throw new Error('Unexpected route');await route.fulfill({json:body});});
 await page.goto(`${origin}/turns`);await page.getByLabel('权威存档').selectOption('fixture');await page.getByLabel('行动意图',{exact:true}).fill('测试行动');await page.getByRole('button',{name:'提交行动',exact:true}).click();
 await page.getByText('服务未就绪或结果尚未确认。原请求已保留；恢复时核对原请求，不会创建新的结算请求。',{exact:true}).waitFor();
 await page.close();page=await context.newPage();await page.goto(`${origin}/turns`);await page.getByLabel('权威存档').selectOption('fixture');const recover=page.getByRole('button',{name:'恢复核对原请求',exact:true});await recover.waitFor();await recover.click();await page.getByText('权威结果已确认，可单独生成叙事。',{exact:true}).waitFor();assert.equal(calls,2);
 await page.getByRole('button',{name:'生成或重试叙事'}).click();await page.getByRole('button',{name:'取消叙事生成'}).click();await page.getByText('回执已确认。叙事或状态刷新未完成，可重试；不会重复结算。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'生成或重试叙事'}).click();await page.getByText('规则已提交，只有叙事展示。',{exact:true}).waitFor();assert.equal(calls,2);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'Mobile turn UI must not overflow');evidence.push({width,height,lostAckRecovered:true,pageClosedBeforeRecovery:true,cancelKeepsReceipt:true,syntheticFixture:true});await context.close();
 }}finally{await browser.close();}mkdirSync(join(root,'test-results/turns'),{recursive:true});writeFileSync(join(root,'test-results/turns/recovery.json'),JSON.stringify({physicalDeviceAcceptance:false,evidence},null,2)+'\n');console.log('Turn workspace gate: production preview redirects players to the lobby and hides the game-tools entry.');console.log('Turn recovery: internal dev opt-in passed at four mobile viewports (synthetic fixture).');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{child.kill();previewChild.kill();});
