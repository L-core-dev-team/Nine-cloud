'use strict';
// Synthetic fixtures only; these ports are NOT real authentication or prose authorization.
const path=require('node:path');
const {IntegrationBridge}=require('./bridge.cjs');
const {digest}=require('../p6-longmem-reliability/store.cjs');
const PUBLIC='她说：“旧灯暂由你保管，不得转卖。”';
const SECRET='未被听见的私语：暗门口令是紫鹭三声。';
const EVENT='00000000-0000-4000-8000-000000000001',KEY='00000000-0000-4000-8000-000000000002';
const scope={ownerId:'synthetic-owner',saveId:'synthetic-save',branchId:'root'};
const receipt=()=>({idempotencyKey:KEY,saveId:scope.saveId,requestFingerprint:'sha256:v1:'+'a'.repeat(64),branchId:'root',rulesVersion:'synthetic-rules-v1',clockMinute:0,rng:{seed:null,draws:0},decision:{status:'accepted',outcome:'success',nextRevision:1,events:[{id:EVENT,saveId:scope.saveId,branchId:'root',type:'talk.occurred',beforeRevision:0,afterRevision:1,occurredAt:'2026-10-13T00:00:00.000Z',source:'RULES',ruleVersion:'synthetic-rules-v1',payload:{npcId:'npc-a',topicTag:'old_lamp',outcome:'合成交流已结算'}}]},resultingRevision:1});
function publication(patch={}){return {sourceId:'source-v1',receiptKey:KEY,attemptId:'synthetic-attempt-1',generationVersion:'synthetic-generation-1',generatorSource:'deterministic',text:PUBLIC+'\n'+SECRET,state:'received-not-persisted',ruleFactRefs:[],...patch};}
async function environment(root,name,formal){
 const session=Object.freeze({kind:'synthetic-session',case:name}),sessions=new WeakSet([session]);
 const state={identity:{...scope},receipt:receipt(),receiptStatus:'confirmed',boundaryRevision:4,asOf:4,gameMinute:0,mode:'continue',visibilityEpoch:'visibility-1',forgettingEpoch:'forgetting-1',surface:'p4-explicit-recall',granted:true,grantRevision:1,grantEventId:EVENT,grantChannel:'witnessed',npcId:'npc-a',memoryClass:'historical-event',text:PUBLIC,bindings:null,rows:null,complete:true,missingPort:false,boundaryReads:0,race:false,rowsUnfiltered:false,ruleFactRefs:[]};
 function policy(){return {memoryMode:state.mode,memoryPolicyVersion:formal.policy.P1_MEMORY_POLICY_VERSION,memoryPolicy:formal.policy.createP1SaveMemoryPolicy(state.mode)};}
 function boundary(identity,audience){state.boundaryReads++;const p=policy();return {...state.identity,revision:state.boundaryRevision,asOfRevision:state.asOf,gameMinute:state.gameMinute,visibilityEpoch:state.race&&state.boundaryReads%2===0?'visibility-raced':state.visibilityEpoch,memoryPolicyHash:p.memoryPolicy.policyArtifactHash,forgettingEpoch:state.forgettingEpoch,audience,policySurface:state.surface,policy:p};}
 function row(patch={}){const r={grantId:'',grantIdVersion:2,saveId:scope.saveId,branchId:'root',npcId:state.npcId,eventId:state.grantEventId,eventRevision:state.grantRevision,observedAtMinute:0,channel:state.grantChannel,memoryClass:state.memoryClass,authorizationPolicyVersion:formal.policy.P1_MEMORY_VISIBILITY_POLICY_VERSION,authorizedFields:['summary'],authorizedFacts:{summary:state.text},summary:state.text,supersessions:[],...patch};r.grantId=formal.memory.stableGrantIdV2(r.saveId,r.branchId,r.npcId,r.eventId,r.authorizationPolicyVersion);return r;}
 function binding(b,{sourceId='source-v1',text=publication().text,segmentText=state.text,patch={}}={}){const r=row();const start=text.indexOf(segmentText);return {sourceId,sourceSha256:digest(Buffer.from(text)),segmentId:'public-segment',startUtf16:start,endUtf16:start+segmentText.length,grantId:r.grantId,grantField:'summary',grantEventId:r.eventId,observedAtRevision:r.eventRevision,visibilityEpoch:b.visibilityEpoch,memoryPolicyHash:b.memoryPolicyHash,forgettingEpoch:b.forgettingEpoch,...patch};}
 const ports={
   verifySaveSession:async token=>sessions.has(token)?{...state.identity}:undefined,
   readConfirmedReceipt:async(identity,key)=>state.receiptStatus==='confirmed'&&key===KEY?{status:'confirmed',receipt:structuredClone(state.receipt)}:{status:'unknown'},
   readBoundary:async(identity,audience)=>boundary(identity,audience),
   readAuthorizedSegments:async(b,query)=>{
     if(state.missingPort)return undefined;
     const rows=state.rows??(state.granted?[row()]:[]);
     const eligible=state.rowsUnfiltered?rows:rows.filter(r=>r.saveId===b.saveId&&r.branchId===b.branchId&&(b.audience.kind==='player'||r.npcId===b.audience.npcId)&&r.eventRevision<=b.asOfRevision&&r.observedAtMinute<=b.gameMinute);
     const segments=state.bindings??(state.granted&&state.grantRevision<=b.asOfRevision&&(!b.audience.npcId||b.audience.npcId===state.npcId)?[binding(b)]:[]);
     return {complete:state.complete,segments,observations:eligible};
   },
 };
 const bridge=new IntegrationBridge(path.join(root,name+'.sqlite'),formal,ports);
 const saved=await bridge.publish(session,publication());if(saved.status!=='persisted')throw Error('Fixture publication failed: '+JSON.stringify(saved));
 const query=patch=>({text:'旧灯',budget:2048,audience:{kind:'npc',npcId:'npc-a'},slot:'historical-event',...patch});
 return {bridge,state,ports,session,query,row,binding,boundary,publication,scope};
}
module.exports={environment,publication,receipt,PUBLIC,SECRET,EVENT,KEY,scope};
