import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { prepareTurn,replayEvents } from '@jiuxiao/domain';
import { DecisionV2Schema,type ActionIntent,type SaveEnvelope,type StateDelta } from '@jiuxiao/contracts';
import { RuleResolver,type ActionRuleProvider } from './rule-resolver.js';
const version={ruleVersion:'fixture-only',ActionRulesVersion:'fixture-action',CombatRulesVersion:'fixture-combat',canonVersion:'fixture-canon',memoryPolicyVersion:'fixture-memory'};
const base:SaveEnvelope={schemaVersion:1,saveId:'fixture',revision:0,ruleVersion:version.ruleVersion,canonVersion:version.canonVersion,memoryPolicyVersion:version.memoryPolicyVersion,state:{playerId:'p',locationId:'a',elapsedMinutes:0,facts:{hp:10,items:{herb:1},gameMinute:0}}};
const delta:StateDelta={timeChange:1,locationChange:{before:'a',after:'b'},factChanges:[{key:'hp',before:{present:true,value:10},after:{present:true,value:9}},{key:'gameMinute',before:{present:true,value:0},after:{present:true,value:1}}]};
const intents:ActionIntent[]=[{kind:'move',payload:{destinationId:'b'}},{kind:'cultivate',payload:{techniqueId:'fixture',minutes:1}},{kind:'use_item',payload:{itemId:'herb'}},{kind:'talk',payload:{npcId:'npc',utterance:'fixture'}},{kind:'combat',payload:{targetId:'npc'}},{kind:'quest',payload:{questId:'fixture',choiceId:'fixture'}}].map(value=>({...value,saveId:'fixture',actorId:'p',expectedRevision:0,idempotencyKey:randomUUID()})) as ActionIntent[];
function resolver(){const provider:ActionRuleProvider={version,resolve:()=>({status:'accepted',outcome:'success',delta:structuredClone(delta)})};return new RuleResolver(provider,()=>[],()=>'exact-recall-v1');}
describe('six-class rule input template (synthetic values, no author rules)',()=>{
 for(const intent of intents)it(`${intent.kind}: rule input -> delta -> prepared commit -> replay`,async()=>{
  const rules=resolver();const prepared=await prepareTurn({intent,save:base,decide:rules.decide.bind(rules),reduce:rules.reduce.bind(rules)});expect(prepared.status).toBe('prepared');
  if(prepared.status!=='prepared'||prepared.receipt.decision.status!=='accepted')throw new Error('fixture');
  expect(replayEvents(base,prepared.receipt.decision.events,rules.reduce.bind(rules))).toEqual(prepared.save);expect(prepared.save.state).toMatchObject({locationId:'b',elapsedMinutes:1,facts:{hp:9,items:{herb:1},gameMinute:1}});expect(base.state.facts.hp).toBe(10);
  const event=prepared.receipt.decision.events[0]!;expect(event.payload).toMatchObject({turnId:intent.idempotencyKey,action:intent.kind,stateBefore:base.state,stateAfter:prepared.save.state,narrativeStatus:'not_requested'});
  expect(()=>rules.reduce(base.state,{...event,payload:{...event.payload,stateAfterHash:'tampered'}})).toThrow('EVENT_AFTER_MISMATCH');
 });
 it('refuses unauthorized full-state writes, conflicting facts and protected keys',()=>{
  const provider:ActionRuleProvider={version,resolve:()=>({status:'accepted',outcome:'success',delta:{...delta,factChanges:[{key:'hp',before:{present:true,value:99},after:{present:true,value:1}}]}})};
  expect(()=>new RuleResolver(provider,()=>[],()=>'exact-recall-v1').decide(intents[0]!,base)).toThrow('DELTA_FACT_CONFLICT');
  provider.resolve=()=>({status:'accepted',outcome:'success',delta:{...delta,factChanges:[{key:'archiveKind',before:{present:false},after:{present:true,value:'authority'}}]}});
  expect(()=>new RuleResolver(provider,()=>[],()=>'exact-recall-v1').decide(intents[0]!,base)).toThrow();
 });
 it('preserves committed legal failures and their rule code through event replay',async()=>{
  const failureDelta:StateDelta={timeChange:1,locationChange:null,factChanges:[{key:'gameMinute',before:{present:true,value:0},after:{present:true,value:1}}]};
  const provider:ActionRuleProvider={version,resolve:()=>({status:'accepted',outcome:'legal_failure',code:'RULE_ROAD_BLOCKED',delta:failureDelta})};
  const rules=new RuleResolver(provider,()=>[],()=>'exact-recall-v1');
  const prepared=await prepareTurn({intent:intents[0]!,save:base,decide:rules.decide.bind(rules),reduce:rules.reduce.bind(rules)});
  expect(prepared.status).toBe('prepared');
  if(prepared.status!=='prepared'||prepared.receipt.decision.status!=='accepted')throw new Error('fixture');
  expect(DecisionV2Schema.parse(prepared.receipt.decision)).toMatchObject({status:'accepted',outcome:'legal_failure',code:'RULE_ROAD_BLOCKED'});
  expect(replayEvents(base,prepared.receipt.decision.events,rules.reduce.bind(rules))).toEqual(prepared.save);
  expect(prepared.save.state).toMatchObject({locationId:'a',elapsedMinutes:1,facts:{gameMinute:1}});
 });
 it('requires complete v2 clarification fields and canonical candidates',()=>{
  const provider:ActionRuleProvider={version,resolve:()=>({status:'clarify',question:'要对谁说话？',missingSlots:['npcId'],candidates:[{kind:'talk',label:'与附近人物交谈',slots:{npcId:'fixture-npc'}}],interactionId:'clarify-fixture-1'})};
  const rules=new RuleResolver(provider,()=>[],()=>'exact-recall-v1');
  expect(DecisionV2Schema.parse(rules.decide(intents[0]!,base))).toMatchObject({status:'clarify',missingSlots:['npcId'],interactionId:'clarify-fixture-1'});
  provider.resolve=()=>({status:'clarify',question:'要对谁说话？'} as never);
  expect(()=>rules.decide(intents[0]!,base)).toThrow();
  provider.resolve=()=>({status:'clarify',question:'你要先移动还是交谈？',missingSlots:['action'],candidates:[
   {kind:'talk',label:'与附近人物交谈',slots:{npcId:'fixture-npc'}},
   {kind:'move',label:'前往渡口',slots:{destinationId:'fixture-gate'}},
  ],interactionId:'clarify-fixture-2'});
  expect(()=>rules.decide(intents[0]!,base)).toThrow();
 });
});
