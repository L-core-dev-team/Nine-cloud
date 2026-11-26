import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mountGames } from '../../../apps/api/dist/routes/games.js';
import { AuthoritativeGameService } from '../../../apps/api/dist/services/authoritative-game.js';
import { start, actions, choices, cue, resolveTurn, passage } from './encounter.mjs';
const apiRequire=createRequire(new URL('../../../apps/api/package.json',import.meta.url));
const {Hono}=apiRequire('hono');
export function openGame(file,generate,source='deterministic'){
  const requestedAI=new AsyncLocalStorage();
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS saves(id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, setup TEXT NOT NULL, phase TEXT NOT NULL, minutes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS entries(id TEXT NOT NULL,k TEXT NOT NULL, revision INTEGER NOT NULL, receipt TEXT NOT NULL, text TEXT, source TEXT, status TEXT NOT NULL, publicRecord TEXT NOT NULL, PRIMARY KEY(id,k),UNIQUE(id,revision));`);
  const find=(owner,id)=>db.prepare('SELECT * FROM saves WHERE owner=? AND id=?').get(owner,id);
  const one=(id,key)=>db.prepare('SELECT * FROM entries WHERE id=? AND k=?').get(id,key);
  const games=new AuthoritativeGameService({getForOwner:async(owner,id)=>{
    const row=find(owner,id);return row?JSON.parse(row.snapshot):null;
  }});
  const service={
    async read(owner,id){
      const result=await games.read(owner,id);
      if(result.status!=='ready')return result;
      const row=find(owner,id);
      const last=db.prepare('SELECT * FROM entries WHERE id=? ORDER BY revision DESC LIMIT 1').get(id);
      const record=last?JSON.parse(last.publicRecord):null;
      const f=result.save.state.facts;
      const rest=f.stamina>=20?'余力够正常吐纳一刻。':f.stamina>0?'此刻吐纳只能疲劳推进。':'体力已尽。';
      const risk=row.phase==='pending'?choices.map(x=>x[2]).join(' '):'交手已经结束。'+rest+' 也可以先看看渡船。';
      return {...result,opening:['渡口作业位的石沿只容一人立足。',cue],
        scene:{...result.scene,location:result.save.state.facts.currentSublocationId?'芦花渡 · 作业位':'芦花渡 · 岸边',
          greywing:{waiting:row.phase==='pending',risk,aiAvailable:typeof generate==='function',lastStatus:last?.status??null,stage:record?.阶段分钟??0,total:row.minutes}}};
    },
    async actionSuggestions(owner,id){
      const row=find(owner,id);if(!row)return {status:'not_found'};
      let items=actions(row.phase);
      const f=JSON.parse(row.snapshot).state.facts;
      if(row.phase==='pending')items=items.filter(x=>!['hold','gap'].includes(x.id)||(f.stamina>=25&&f.spiritStamina>=(x.id==='gap'?30:25)));
      else items=items.filter(x=>x.id!=='claim'||(f.questState.status==='completed'&&!f.questState.rewardClaimed));
      return {status:'ready',actions:items,revision:row.revision};
    }
  };
  const readReceipt=async(owner,id,key)=>find(owner,id)&&one(id,key)?JSON.parse(one(id,key).receipt):null;
  const turns={async execute(owner,intent,narrative,signal){
    const id=intent.saveId,key=intent.idempotencyKey,row=find(owner,id);
    if(!row)return {status:'not_found'};
    const save=JSON.parse(row.snapshot), prior=one(id,key);
    const step=await resolveTurn(save,intent,row.phase,prior&&JSON.parse(prior.receipt));
    if(step.status==='revision-conflict')return {status:'revision_conflict',currentRevision:row.revision};
    if(step.status==='idempotency-conflict')return {status:'idempotency_conflict'};
    if(step.status==='duplicate')return {status:'duplicate',receipt:step.receipt,narrative:{text:prior.text,source:prior.source,status:prior.status}};
    if(step.status!=='prepared')return {status:step.receipt.decision.status,receipt:step.receipt};
    const previous=db.prepare('SELECT * FROM entries WHERE id=? ORDER BY revision DESC LIMIT 1').get(id);
    const ai=requestedAI.getStore()===true;
    // Another handler may have committed this key while resolveTurn checked the fingerprint.
    if(one(id,key))return turns.execute(owner,intent,narrative,signal);
    if(ai && previous && previous.status!=='received')throw Error('PREVIOUS_PROSE_UNCONFIRMED');
    if(ai&&(!generate||!narrative))throw Error('LIVE_PROSE_UNAVAILABLE');
    const actualSource=ai?source:'deterministic';
    const input=passage(save,step,row.phase,intent.payload.text,previous?.text,row.minutes);
    const encoded=JSON.stringify(step.receipt);
    db.exec('BEGIN IMMEDIATE');
    try{
      // Compare-and-swap the snapshot and reserve narration in the same transaction.
      if(!db.prepare("UPDATE saves SET revision=?,snapshot=?,phase='done',minutes=? WHERE id=? AND revision=?").run(
        step.save.revision,JSON.stringify(step.save),input.record.交手累计分钟,id,row.revision).changes){
        db.exec('ROLLBACK');return turns.execute(owner,intent,narrative,signal);
      }
      db.prepare('INSERT INTO entries VALUES(?,?,?,?,?,?,?,?)').run(id,key,step.save.revision,encoded,null,actualSource,'reserved',JSON.stringify(input.record));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error}
    let text;
    try{
      text=ai?await generate(input.wire,step.receipt,signal):input.response;
    }catch(error){
      const status=error?.code==='PROVIDER_DECLINED'?'failed':'unconfirmed';
      db.prepare('UPDATE entries SET status=? WHERE id=? AND k=?').run(status,id,key);
      return {status:'accepted',receipt:step.receipt,narrative:{text:null,source:actualSource,status}};
    }
    db.prepare("UPDATE entries SET text=?,source=?,status='received' WHERE id=? AND k=?").run(text,actualSource,id,key);
    return {status:'accepted',receipt:step.receipt,narrative:{text,source:actualSource,status:'received'}};
  }};
  const app=new Hono();
  app.use('/api/games/:id/turns',async(c,next)=>{
    const mode=c.req.query('prose');
    if(mode!==undefined && mode!=='ai')return c.json({code:'INVALID_PROSE_MODE'},400);
    await requestedAI.run(mode==='ai',next);
    // Old keys are readable even on a free-only host. New paid turns retain the availability error.
    if(mode==='ai'&&!generate&&c.res.status===503)c.res=c.json({code:'LIVE_PROSE_UNAVAILABLE'},503);
  });
  const auth={resolveOwnerId:async req=>{
    const token=/^(?:.*; )?greywing=([a-f0-9-]{36})(?:;.*)?$/.exec(req.headers.get('cookie')??'')?.[1];
    return token?db.prepare('SELECT owner FROM sessions WHERE token=?').get(token)?.owner??null:null;
  }};
  app.get('/api/auth/session',async c=>c.json({account:{id:await auth.resolveOwnerId(c.req.raw)}}));
  const archive={async read(owner,id,rev,before){
    if(!find(owner,id))throw Error('NO_SAVE');
    const rows=db.prepare('SELECT receipt,text,source FROM entries WHERE id=? AND revision<=? AND revision<? ORDER BY revision DESC LIMIT 51').all(id,rev,before??rev+1);
    const more=rows.length>50;
    const items=rows.slice(0,50).reverse().map(r=>({...r,receipt:JSON.parse(r.receipt)}));
    return {items,nextBefore:more?items[0].receipt.resultingRevision:null};
  }};
  // Candidate serves a fixed fixture. Creation and normal production routes stay with the ordinary host.
  app.post('/api/games',c=>c.json({code:'FIXTURE_ONLY'},403));
  mountGames(app,service,auth,turns,undefined,archive,readReceipt);
  return {app,db, async create(owner=randomUUID()){
    const {save,setup}=await start(owner);
    db.prepare("INSERT INTO saves VALUES(?,?,?,?,?,'pending',0)").run(save.saveId,owner,save.revision,JSON.stringify(save),JSON.stringify(setup));
    db.prepare('INSERT OR IGNORE INTO sessions VALUES(?,?)').run(randomUUID(),owner);
    return {id:save.saveId,owner,token:db.prepare('SELECT token FROM sessions WHERE owner=?').get(owner).token};
  }};
}
