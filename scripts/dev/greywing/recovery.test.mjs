// Exercise the actual loopback HTTP host and browser. Only the narrator is replaced.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {appendFileSync, existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backup, DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {browserForTrial, enter, play} from './browser.mjs';
import {openGame} from './game.mjs';
import {listen} from './host.mjs';

if (process.argv[2]==='--host') {
  const [, , , file, mode, counter, port]=process.argv;
  const generate=async (_wire, receipt)=>{
    appendFileSync(counter,receipt.idempotencyKey+'\n');
    if(mode==='exit')process.exit(75); // after simulated send, before receiving or recording a reply
    throw Object.assign(new Error('mock refusal'),{code:'PROVIDER_DECLINED'});
  };
  const host=await listen({file,port:Number(port),generate:mode==='free'?undefined:generate,source:'mock'});
  process.send(host.origin);
  process.on('message',async()=>{await host.close();process.disconnect();});
} else {
  const browser=await browserForTrial();
  try {
    for(const mode of ['declined','exit']) await check(mode);
  } finally { await browser.close(); }

  async function check(mode){
    const dir=mkdtempSync(join(tmpdir(),'greywing-recovery-'));
    const file=join(dir,'copy.sqlite'), counter=join(dir,'mock-sends');
    const seed=openGame(join(dir,'seed.sqlite'));
    let trial;
    try { trial=await seed.create(); await backup(seed.db,file); } finally { seed.db.close(); }
    let child, exited, origin, page, suppliedReceipt=false;
    const run=async nextMode=>{
      child=fork(fileURLToPath(import.meta.url),['--host',file,nextMode,counter,origin?new URL(origin).port:'0'],
        {stdio:['ignore','ignore','inherit','ipc'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH}});
      exited=once(child,'exit');
      origin=await Promise.race([once(child,'message').then(([url])=>url),exited.then(()=>{throw Error('host stopped before listening');})]);
    };
    const stop=async()=>{if(child?.connected)child.send('stop');if(child)await exited;};
    const read=callback=>{const db=new DatabaseSync(file,{readOnly:true});try{return callback(db);}finally{db.close();}};
    const state=()=>read(db=>db.prepare('SELECT revision,snapshot,minutes FROM saves WHERE id=?').get(trial.id));
    const entries=()=>read(db=>db.prepare('SELECT k,receipt,status,source,text FROM entries WHERE id=? ORDER BY revision').all(trial.id));
    const sends=()=>existsSync(counter)?readFileSync(counter,'utf8').trim().split('\n'):[];
    const base='/api/games/'+trial.id;
    const http=(path,body)=>fetch(origin+base+path,{
      method:body?'POST':'GET',headers:{Cookie:'greywing='+trial.token,Origin:origin,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    try {
      await run(mode);
      page=await enter(browser,{origin},trial);
      page.setDefaultTimeout(10000);
      await page.getByLabel('正文来源').selectOption('ai');
      await page.getByTestId('p2-action-input').fill('守住作业位');
      // Lose the client's acknowledgement of the committed rules in the crash case.
      await page.route('**/receipts/*',route=> suppliedReceipt ? route.continue()
        : route.fulfill({json:{status:'unknown',receipt:null,revision:8}}));
      const sent=page.waitForRequest(req=>req.method()==='POST' && req.url().includes('/turns'));
      await page.getByTestId('p2-submit-action').click();
      const request=await sent, body=request.postDataJSON();
      assert.equal(body.expectedRevision,7);
      if(mode==='exit') {
        assert.equal((await exited)[0],75);
      } else {
        await page.getByText(/可用免费正文继续/).waitFor();
        await stop();
      }
      await run('free'); // same database and origin; no model credentials or generator
      await page.reload();
      const committed=state(), [entry]=entries(), receipt=JSON.parse(entry.receipt);
      assert.equal(committed.revision,8);
      assert.equal(entry.k,body.idempotencyKey);
      assert.equal(entry.status,mode==='exit'?'reserved':'failed');
      assert.deepEqual(sends(),[entry.k]);
      if(mode==='exit'){
        const lookup=page.getByRole('button',{name:'查询行动结果'});
        await lookup.waitFor();
        await lookup.click();
        await page.getByText(/尚未查询到回执/).waitFor({state:'attached'});
        assert.equal(await page.getByLabel('正文来源').isDisabled(),true);
        assert.equal(await page.getByTestId('p2-submit-action').isDisabled(),true);
        assert.deepEqual(state(),committed);
        suppliedReceipt=true;
        await lookup.click();
      }
      const picker=page.getByLabel('正文来源');
      await picker.selectOption('local');
      const lookup=await (await http('/receipts/'+entry.k)).json();
      assert.deepEqual(lookup.receipt,receipt);
      const replay=async()=>{
        const r=await http('/turns?prose=ai',body); assert.equal(r.status,200);
        const out=await r.json(); assert.equal(out.status,'duplicate'); assert.deepEqual(out.receipt,receipt);
        assert.equal(out.narrative.status,entry.status); assert.equal(out.narrative.text,null);
      };
      await Promise.all([replay(),replay()]);
      assert.equal((await http('/turns?prose=ai',{...body,text:'退回渡岸'})).status,409);
      assert.deepEqual(state(),committed);
      const next=await play(page,'观察渡船');
      assert.equal(next.receipt.resultingRevision,9);
      assert.notEqual(next.receipt.idempotencyKey,entry.k);
      assert.equal(next.narrative.source,'deterministic');
      const finalState=state();
      const unavailable=await http('/turns?prose=ai',{...body,text:'吐纳一刻',expectedRevision:9,idempotencyKey:crypto.randomUUID()});
      assert.equal(unavailable.status,503);
      assert.equal((await unavailable.json()).code,'LIVE_PROSE_UNAVAILABLE');
      await replay(); await page.reload();
      const paragraphs=page.locator('[data-story-revision="9"] p');
      await paragraphs.first().waitFor();
      assert.deepEqual(await paragraphs.allTextContents(),next.narrative.text.split(/\n+/));
      assert.deepEqual(state(),finalState);
      assert.deepEqual(entries()[0],entry); assert.equal(entries().length,2);
      assert.deepEqual(sends(),[entry.k]);
      console.log(JSON.stringify({case:mode,save:trial.id,key:entry.k,fingerprint:receipt.requestFingerprint,
        before:7,committed:8,after:finalState.revision,originalStatus:entry.status,nextSource:next.narrative.source,
        originalMode:'ai',mockSends:1,realSends:0,recoveredKey:next.receipt.idempotencyKey}));
    }finally{await page?.context().close();await stop();}
  }
}
