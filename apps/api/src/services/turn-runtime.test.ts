import {describe,it,expect,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {SaveEnvelope,TurnReceipt,DomainEvent} from '@jiuxiao/contracts';
import {createNpcMemoryJournal,replayEvents,prepareNpcMemoryTurn} from '@jiuxiao/domain';
import {prepareTurnRuntime,loadTurnPlugin,type TurnPlugin} from './turn-runtime.js';
import {AuthoritativeGameService} from './authoritative-game.js';
import { computeCanonRuntimeArtifactHash } from './authoritative-game.js';
import {ServerTurnService,type ServerTurnRepository} from './server-turn.js';
const plugin:TurnPlugin={
 provider:{version:{ruleVersion:'synthetic',ActionRulesVersion:'synthetic-action',CombatRulesVersion:'synthetic-combat',canonVersion:'synthetic',memoryPolicyVersion:'synthetic'},resolve:(_intent,save)=>({status:'accepted',outcome:'success',delta:{timeChange:15,locationChange:null,factChanges:[{key:'items',before:{present:true,value:save.state.facts.items},after:{present:true,value:Number(save.state.facts.items)-1}},{key:'gameMinute',before:{present:true,value:save.state.facts.gameMinute},after:{present:true,value:Number(save.state.facts.gameMinute)+15}}]}})},
 initialState:()=>({playerId:'player',locationId:'origin',elapsedMinutes:0,facts:{items:200,gameMinute:0}}),
 grantsForEvent:event=>[{npcId:'witness',eventId:event.id,channel:'witnessed',authorizationPolicyVersion:'visibility-v1',authorizedFields:['summary'],authorizedFacts:{summary:'Synthetic visible outcome.'},visibleSummary:'Synthetic visible outcome.'}],policyForNpc:()=> 'exact-recall-v1',
};
describe('host plugin and complete synthetic turn path',()=>{
 it('keeps missing configuration closed and only attempts configured local rule plugins',async()=>{
  expect(await loadTurnPlugin(undefined)).toBeUndefined();const load=vi.fn();
  await expect(loadTurnPlugin('https://evil.invalid/rules.js',load)).rejects.toThrow('LOCAL_PATH');expect(load).not.toHaveBeenCalled();
  await expect(loadTurnPlugin('relative.js',load)).rejects.toThrow('LOCAL_PATH');
  await expect(loadTurnPlugin(resolve('fixture.mjs'),load)).rejects.toThrow('INVALID_TURN_PLUGIN');
  expect(load).toHaveBeenCalledTimes(1);
 });
 it('never loads the review-only P1 candidate while NODE_ENV is production',async()=>{
  const path=resolve(dirname(fileURLToPath(import.meta.url)),'p1-prologue-plugin.js');const load=vi.fn();
  vi.stubEnv('NODE_ENV','production');
  try{expect(await loadTurnPlugin(path,load)).toBeUndefined();expect(load).not.toHaveBeenCalled();}
  finally{vi.unstubAllEnvs();}
 });
 it('creates a server-owned game once and refuses reused creation keys with changed choices',async()=>{
  const saves=new Map<string,SaveEnvelope>();const repo={getForOwner:async(owner:string,id:string)=>saves.get(owner+id)||null,createForOwner:async(owner:string,save:SaveEnvelope)=>{if(saves.has(owner+save.saveId))return false;saves.set(owner+save.saveId,save);return true;}};
  expect(await new AuthoritativeGameService(repo).create('a','request-1',{})).toEqual({status:'rules_not_ready'});
  const service=new AuthoritativeGameService(repo,prepareTurnRuntime(plugin));
  const results=await Promise.all(Array.from({length:10},()=>service.create('a','request-1',{name:'test'})));
  const created=[...saves.values()][0];
  const canonBytes=readFileSync(new URL('../../../../packages/content/src/canon-runtime.json',import.meta.url));
  const independentlyComputedHash=`sha256:${createHash('sha256').update(canonBytes).digest('hex')}`;
  expect(await computeCanonRuntimeArtifactHash()).toBe(independentlyComputedHash);
  expect(created?.schemaVersion===3?created.canonArtifactHash:undefined).toBe(independentlyComputedHash);
  expect(saves.size).toBe(1);expect(results.filter(r=>r.status==='created'&&!r.duplicate)).toHaveLength(1);
  expect(await service.create('a','request-1',{name:'changed'})).toEqual({status:'conflict'});
  await service.create('b','request-1',{name:'test'});expect(saves.size).toBe(2);
 });
 it('runs 150 turns with tenfold retries, service restarts and narrative retries without item resurrection or replay drift',async()=>{
  let save:SaveEnvelope={schemaVersion:1,saveId:'synthetic-long',revision:0,ruleVersion:'synthetic',canonVersion:'synthetic',memoryPolicyVersion:'synthetic',state:plugin.initialState({ownerId:'a',saveId:'synthetic-long',choices:{}})};
  const initial=structuredClone(save);let journal=createNpcMemoryJournal(save.saveId,0);const receipts=new Map<string,TurnReceipt>();const events:DomainEvent[]=[];
  const repository:ServerTurnRepository={loadSave:async owner=>owner==='a'?structuredClone(save):null,getReceiptForOwner:async(owner,_id,key)=>owner==='a'?receipts.get(key)||null:null,getForOwner:async owner=>owner==='a'?structuredClone(journal):null,recordNonAcceptedDecision:async input=>{
   const prior=receipts.get(input.receipt.idempotencyKey);if(prior)return prior.requestFingerprint===input.receipt.requestFingerprint?{kind:'duplicate',receipt:prior}:{kind:'idempotency_conflict'};
   if(input.expectedRevision!==save.revision)return {kind:'conflict',currentRevision:save.revision};
   receipts.set(input.receipt.idempotencyKey,input.receipt);return {kind:'recorded',receipt:input.receipt};
  },commitAcceptedTurn:async input=>{
   const prior=receipts.get(input.receipt.idempotencyKey);if(prior)return {kind:'duplicate',receipt:prior};
   save=structuredClone(input.save);journal=structuredClone(input.nextJournal);events.push(...input.events);receipts.set(input.receipt.idempotencyKey,input.receipt);
   return {kind:'committed',receipt:input.receipt,save,journal};
  }};
  const runtime=prepareTurnRuntime(plugin);let narrations=0;
  for(let turn=0;turn<150;turn++){
   const service=new ServerTurnService(repository,runtime.rules,async()=>{narrations++;if(narrations%2)throw new Error('synthetic provider failure');return 'Recovered presentation.';});
   const intent={kind:'free_text',saveId:save.saveId,actorId:'player',expectedRevision:turn,idempotencyKey:randomUUID(),payload:{text:'Synthetic consume one item; not a production rule.'}};
   expect(await service.execute('a',intent,true)).toMatchObject({status:'accepted',duplicate:false,narrative:{status:'failed'}});
   for(let repeat=0;repeat<10;repeat++)expect(await service.execute('a',intent,repeat===0)).toMatchObject({status:'accepted',duplicate:true});
   expect(save.revision).toBe(turn+1);expect(save.state.facts.items).toBe(199-turn);expect(save.state.elapsedMinutes).toBe((turn+1)*15);expect(save.state.facts.gameMinute).toBe((turn+1)*15);
  }
  expect(receipts.size).toBe(150);expect(new Set(events.map(e=>e.id)).size).toBe(150);
  expect(replayEvents(initial,events,runtime.rules.reduce.bind(runtime.rules))).toEqual(save);
  let rebuilt=createNpcMemoryJournal(save.saveId,0);
  for(const event of events)rebuilt=prepareNpcMemoryTurn({journal:rebuilt,saveId:save.saveId,beforeRevision:event.beforeRevision,afterRevision:event.afterRevision,events:[event],observedAtMinute:event.afterRevision*15,grantsForEvent:plugin.grantsForEvent,policyForNpc:plugin.policyForNpc}).journal;
  expect(rebuilt).toEqual(journal);expect(journal.memories[0]?.observations).toHaveLength(150);
  expect(await new ServerTurnService(repository,runtime.rules).execute('b',{kind:'free_text',saveId:save.saveId,actorId:'player',expectedRevision:150,idempotencyKey:randomUUID(),payload:{text:'blocked'}})).toEqual({status:'not_found'});
 });
});
