import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {listen} from './host.mjs';
import {browserForTrial,enter,play} from './browser.mjs';
const dir=mkdtempSync(join(tmpdir(),'greywing-'));
const file=join(dir,'test.sqlite');
let calls=0,unknown=false;
const generate=async wire=>{
  calls++;
  if(unknown)throw Error('MOCK_UNKNOWN');
  const material=wire.messages.at(-1).content;
  assert(!/回执|本轮已提交|领取奖励|修炼结算/.test(material));
  return '离线模拟：'+material.split('\n').slice(0,2).join(' ');
};
const browser=await browserForTrial();
let server=await listen({file,generate,source:'mock'});
try{
  const demo=await listen({file:join(dir,'demo.sqlite')});
  const context=await browser.newContext();
  try{
    const tab=await context.newPage();
    await tab.goto(demo.startURL);
    await tab.getByText('渡口作业位的石沿只容一人立足。').waitFor();
    await tab.getByLabel('正文来源').selectOption('ai');await tab.getByText(/当前试玩进程未配置模型凭据/).waitFor();
    await tab.getByLabel('正文来源').selectOption('local');
    const original=await play(tab,'等这阵过去');assert.equal(original.narrative.source,'deterministic');
    const url=tab.url();
    await tab.goto(demo.startURL);assert.equal(tab.url(),url);
    await tab.route(url.replace('/game/','/api/games/'),async route=>{
      const response=await route.fetch(), body=await response.json();
      delete body.scene.greywing;
      await route.fulfill({response,json:body});
    });
    await tab.reload();await tab.getByText('你可以描述自己的行动，九霄会根据当前世界规则决定结果。').waitFor();
    await tab.goto(demo.startURL+'&fresh=1');assert.notEqual(tab.url(),url);
    await tab.getByText('渡口作业位的石沿只容一人立足。').waitFor();
    if(process.env.GREYWING_SCREENSHOT)await tab.screenshot({path:process.env.GREYWING_SCREENSHOT});
    console.log('一键入口、重开、续档、普通页面不显示候选提示 PASS');
  }finally{await context.close();await demo.close()}
  for(const [label,elapsed,stamina,spirit,fatigue] of [['守住作业位',30,15,75,true],['抢外沿空当',15,20,70,false]]){
    const trial=await server.create(),page=await enter(browser,server,trial);
    assert.equal(await page.getByLabel('正文来源').inputValue(),'local');
    await page.getByLabel('正文来源').selectOption('ai');
    const before=calls;
    for(const ambiguous of ['我不抢空当','想试试，不行再退']){
      await page.getByTestId('p2-action-input').fill(ambiguous);
      await page.getByTestId('p2-submit-action').click();
      await page.getByText('还没有出手。',{exact:false}).waitFor();
      assert.equal(await page.getByTestId('p2-action-input').inputValue(),ambiguous);
    }
    assert.equal(calls,before);
    const key=await play(page,label);
    const f=()=>JSON.parse(server.db.prepare('select snapshot from saves where id=?').get(trial.id).snapshot).state.facts;
    assert.equal(f().stamina,stamina);assert.equal(f().spiritStamina,spirit);
    assert.equal(f().injuryFlags.includes('crow_scratch'),!fatigue);
    await page.reload();
    await page.getByText(key.narrative.text,{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'人物 · 行囊'}).click();
    await page.getByText('本阶段 '+elapsed+' 分钟 · 交手累计 '+elapsed+' 分钟').waitFor();
    await page.keyboard.press('Escape');
    const follow=await play(page,'吐纳一刻');
    assert.equal(follow.receipt.decision.events[0].payload.result,fatigue?'fatigue':'progress');
    assert.equal(calls,before+2);
    await page.getByLabel('正文来源').selectOption('local');const local=await play(page,'观察渡船');assert.equal(local.narrative.source,'deterministic');
    await page.reload();await page.getByText(/· 本地正文/).waitFor();assert.equal(calls,before+2);await page.context().close();
    console.log(label,'browser PASS',elapsed,stamina,spirit,follow.receipt.decision.events[0].payload.result);
  }
  const trial=await server.create(),url='/api/games/'+trial.id+'/turns',key=randomUUID();
  const raw=(text,key,rev=7)=>server.app.request(url+'?prose=ai',{method:'POST',headers:{cookie:'greywing='+trial.token,'content-type':'application/json'},body:JSON.stringify({text,idempotencyKey:key,expectedRevision:rev,requestNarrative:true})});
  const count=calls;
  const results=await Promise.all([raw('等这阵过去',key),raw('等这阵过去',key)]);
  for(const r of results)assert.equal(r.status,200);
  assert.equal(calls,count+1);assert.equal((await raw('退回渡岸',key)).status,409);
  const other=await server.create();assert.equal((await server.app.request('/api/games/'+trial.id,{headers:{cookie:'greywing='+other.token}})).status,404);
  unknown=true;const lost=randomUUID();const unknownTurn=await raw('吐纳一刻',lost,8);assert.equal(unknownTurn.status,200);
  assert.equal((await unknownTurn.json()).narrative.status,'unconfirmed');
  await server.close();server=await listen({file,generate,source:'mock'});
  const reread=await raw('吐纳一刻',lost,8);assert.equal((await reread.json()).narrative.status,'unconfirmed');
  assert.equal((await raw('观察渡船',randomUUID(),9)).status,503);
  assert.equal(calls,count+2);
  console.log('同键并发、错参、跨账号、未知后重启和拒绝下一回合 PASS; live=0');
}finally{await browser.close();await server.close()}
