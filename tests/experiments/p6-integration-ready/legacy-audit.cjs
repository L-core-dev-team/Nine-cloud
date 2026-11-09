'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {load}=require('./formal.cjs');
const {environment,PUBLIC,SECRET}=require('./fixtures.cjs');
const {ReliableStore}=require('../p6-longmem-reliability/store.cjs');
const root=__dirname,name=process.argv[2];if(!name||!/^[a-z0-9-]+$/.test(name))throw Error('Unique name required');
const out=path.join(root,'evidence',name),runtime=path.join(root,'.runs',name);fs.mkdirSync(out);fs.mkdirSync(runtime,{recursive:true});
async function main(){
 const formal=await load(),legacy=await import(pathToFileURL(path.resolve(root,'../p6-longmem-reliability/adapter.ts')).href);
 const scope={ownerId:'synthetic-owner',saveId:'synthetic-save',branchId:'root'};
 const data={schemaVersion:1,synthetic:true,entities:[{id:'npc-a',name:'江岚',aliases:['公开侍者'],kind:'person'},{id:'npc-b',name:'江岚',aliases:['隐藏身份别名'],kind:'person'},{id:'lamp',name:'旧灯',aliases:[],kind:'item'}],turns:Array.from({length:5},(_,i)=>({sourceId:'source-'+(i+1),turnId:i+1,gameMinute:i*72,gameTime:'合成时点',participants:['npc-a'],location:'合成院落',items:['lamp'],narrative:i===0?PUBLIC+'\n'+SECRET:i===1?'公开侍者自称是守门人，这个说法未证实。':`合成第${i+1}回合。`,eventIds:[],tags:[],facts:i===1?[{id:'claim',subject:'npc-a',predicate:'身份传闻',value:'守门人',kind:'character-claim',validFrom:2}]:[],historicalSources:[],authorizedNpcIds:['npc-a']}))};
 const file=path.join(runtime,'legacy.sqlite'),s=new ReliableStore(file);legacy.writeRegistry(s,scope,data);for(const source of data.turns)s.save(legacy.originalInput(scope,source),legacy.attachment(source));s.close();
 const recall=new legacy.DiskRecall(file,scope,5),q=(patch={})=>({text:'旧灯',asOfTurn:5,audience:{kind:'npc',npcId:'npc-a'},...patch});
 const cases=[];function record(id,title,ok,details){cases.push({id,title,status:ok?'PASS':'FAIL',layer:'existing P6-04 only',details});}
 const original=recall.original('source-1',q());
 record('L01','部分知情不能扩大为完整来源',!original?.narrative.includes(SECRET),{unauthorizedPrivateTextReturned:original?.narrative.includes(SECRET)??false});
 record('L02','在场但未听见私语不得读私语',!original?.narrative.includes(SECRET),{limitation:'whole-source ACL has no heard/segment distinction'});
 record('L03','后来 reported grant 可建立新的知识入口',!!recall.original('source-1',q({audience:{kind:'npc',npcId:'npc-b'}})),{limitation:'source ACL frozen at publication; no new grant binding input'});
 record('L04','当前撤权必须失效已授权原文视图',!recall.original('source-1',q()),{limitation:'no live authorization epoch in P6-04 query contract'});
 record('L05','正式遗忘后不应从旧原文路径绕回全文',!recall.original('source-1',q()),{limitation:'no memory mode/game clock/forgetting policy input'});
 record('L06','同名不同稳定 NPC 身份隔离',recall.original('source-1',q({audience:{kind:'npc',npcId:'npc-b'}}))===undefined,{stableIds:true});
 for(const [id,patch]of [['L07',{saveId:'other'}],['L08',{branchId:'fork'}]]){let refused=false;try{new legacy.DiskRecall(file,{...scope,...patch},5);}catch{refused=true;}record(id,'存档或分支物理分区不交叉读取',refused,patch);}
 // Caller scope is intentionally trusted in the old prototype, not authentication.
 const callerSelected=new legacy.DiskRecall(file,scope,5),callerOriginal=callerSelected.original('source-1',{...q(),audience:{kind:'player'}});callerSelected.close();
 record('L09','未认证调用方不能仅凭已知 ownerId 读取玩家原文',!callerOriginal,{limitation:'constructor accepts trusted owner/save/branch; no real session port'});
 record('L10','未来回合来源不进入旧时点原文',recall.original('source-5',q({asOfTurn:2}))===undefined,{asOfTurn:2});
 const claim=recall.search({text:'公开侍者的身份传闻是什么？',asOfTurn:5,audience:{kind:'player'}},2048);
 record('L11','主观说法保持未证实状态',claim.evidence.length>0&&claim.evidence.flatMap(e=>e.factStates).every(f=>f.status==='unverified'),{states:claim.evidence.flatMap(e=>e.factStates)});
 const known=recall.search(q({text:'江岚眼睛的细节是什么？'})),unknown=recall.search(q({text:'未命名者眼睛的细节是什么？'}));
 record('L12','隐藏同名实体不影响未授权查询的诊断',known.diagnosis===unknown.diagnosis,{knownDiagnosis:known.diagnosis,unknownDiagnosis:unknown.diagnosis,limitation:'global entity registry is consulted before audience-specific naming projection'});
 const second=new ReliableStore(file);const source={...data.turns[0],sourceId:'second-version'};second.save(legacy.originalInput(scope,source),legacy.attachment(source));second.close();let versionsSupported=true;try{const r=new legacy.DiskRecall(file,scope,5);r.close();}catch{versionsSupported=false;}
 record('L13','同一权威 revision 支持多个不可变叙事版本',versionsSupported,{limitation:'P6-04 DiskRecall rejects duplicate turnId across distinct sourceIds'});
 recall.close();
 const fixture=await environment(runtime,'policy-diff',formal);fixture.state.mode='forgetting';fixture.state.gameMinute=20160;
 const row=fixture.row(),p4=formal.memory.recallAuthorizedObservations([row],{query:'旧灯',slot:'historical-event',gameMinute:20160,throughRevision:4,forgetting:true});
 const observation={npcId:row.npcId,eventId:row.eventId,eventRevision:row.eventRevision,observedAtMinute:row.observedAtMinute,channel:row.channel,summary:row.summary};
 const p5=formal.memory.retrieveNpcMemories({...formal.memory.createNpcMemory('npc-a','forgetting-v1'),observations:[observation]},{nowMinute:20160,query:'旧灯',limit:12,minAccessibility:0.35});
 assert.equal(p4.status,'forgotten');assert.equal(p5.length,1);assert.equal(p5[0].accessibility,0.35);
 const policyDifference={status:'BLOCKED',issue:'Need cross-system policy-surface adjudication; do not rewrite either production policy',sameInput:{elapsedGameMinutes:20160,laterObservations:0,query:'旧灯'},p4:{status:p4.status,computedAccessibility:formal.memory.observationAccessibility(20160,0)},p5:{retained:p5.length,accessibility:p5[0].accessibility},countDifference:'P4 counts strictly larger eventRevision; P5 counts later observations in stable journal order, including same revision'};
 fixture.bridge.close();
 fs.writeFileSync(path.join(out,'legacy-cases.json'),JSON.stringify(cases,null,2)+'\n');fs.writeFileSync(path.join(out,'policy-surface-difference.json'),JSON.stringify(policyDifference,null,2)+'\n');
 const summary={synthetic:true,existingP6:{PASS:cases.filter(c=>c.status==='PASS').length,FAIL:cases.filter(c=>c.status==='FAIL').length,total:cases.length},formalPolicyConflict:policyDifference,interpretation:'FAIL identifies unimplemented integration requirements under synthetic adversarial inputs, not deployed production exploit claims.'};fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
