/** Authoring/oracle only. Imports no tested retrieval, token budget or policy implementation. */
import {createHash} from 'node:crypto';import type {Dataset,Fact,Source,Query} from '../p6-longmem/types.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export function scenarioWorld(count:number,suite:'development'|'blind',seed:string){
 if(![1000,3000,10000].includes(count))throw Error('Staged sizes');let rng=parseInt(sha(seed).slice(0,8),16)>>>0;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
 const data:Dataset&{aliasSince:Record<string,Record<string,number>>;evidenceBindings:Record<string,any>;knowledgeWindows:Record<string,Record<string,any>>}={schemaVersion:1,synthetic:true,entities:[],turns:[],aliasSince:{},evidenceBindings:{},knowledgeWindows:{}};
 const ledger:any[]=[],questions:any[]=[],anchors=new Map<number,Source>();const roots=suite==='blind'?['薛枫','彭芸','姚柯','孔芷']:['林桐','陆荷','岑棠','苏芩'];const bg=['抄录者逐页核对账册，提醒旧记录必须保留前后语境，不应只摘相似的字眼。','旅人讨论修补屋檐的顺序，交还借用的灯，守门人检查了榫眼和尺寸。','学徒各自整理长途行路札记，标注岔路与补给，决定翌日实地查验。','坐席重排之后，来客描述沿途水位，书记把未核实的捷径单独记下。'];
 const background=(t:number)=>Array.from({length:7},(_,j)=>`合成${t}回${j}记：${bg[next()%bg.length]}验点${next()%997}、簿页${t*19+j}。`).join('');
 const turn=(i:number,p:number)=>Math.floor((p*8+i+1)*(count-1)/90)+1;
 function fact(id:string,subject:string,predicate:string,value:string,kind:Fact['kind']='world-event',supersedes?:string):Fact{return {id,subject,predicate,value,kind,validFrom:1,...(supersedes?{supersedes}:{})};}
 function add(i:number,p:number,body:string,fs:Fact[],acl:string[],segments:{factId:string;text:string;speakerId?:string;reporterId?:string}[]=[]){const t=turn(i,p),sourceId=`${suite}:scene:${i}:${p}`,prefix=background(t),suffix=background(t+100);const s:Source={sourceId,turnId:t,gameMinute:t*72,gameTime:`合成刻${t}`,participants:[`a${i}`,`b${i}`,`v${i}`,`x${i}`],location:`loc${i}`,items:[`item${i}`],narrative:prefix+body+suffix,eventIds:[`evt:${sourceId}`],tags:['independent-scripted'],facts:fs.map(f=>({...f,validFrom:t,...(f.kind==='world-event'?{confirmedBy:`evt:${sourceId}`}:{})})),historicalSources:[],authorizedNpcIds:acl};anchors.set(t,s);for(const part of segments){const offset=body.indexOf(part.text);if(offset<0)throw Error('Author segment not in source');const e={factId:part.factId,sourceId,turn:t,start:prefix.length+offset,end:prefix.length+offset+part.text.length,text:part.text,sourceSha256:sha(s.narrative),speakerId:part.speakerId,reporterId:part.reporterId};ledger.push(e);data.evidenceBindings[part.factId]={sourceId,start:e.start,end:e.end,sourceSha256:e.sourceSha256,speakerId:part.speakerId,reporterId:part.reporterId};}return s;}
 function q(i:number,category:string,text:string,sources:Source[],factIds:string[],at=count,audience:Query['audience']={kind:'player'},range?:[number,number]){const spans=ledger.filter(e=>factIds.includes(e.factId));const correctFacts=sources.flatMap(s=>s.facts.filter(f=>factIds.includes(f.id)).map(f=>({id:f.id,value:f.value,status:f.kind==='character-claim'?'unverified':'current'})));const row:any={questionId:`${suite}:q:${i}:${category}:${questions.length}`,category,text,asOfTurn:at,audience,expectedSourceIds:sources.map(s=>s.sourceId),expectedSpans:spans,correctFacts,noEvidence:sources.length===0,...(range?{turnRange:range}:{})};
  // A source-only lower bound proves impossibility; no retriever decides budget gold.
  const lowerBound=Math.ceil(Buffer.byteLength(spans.map(e=>e.text).join(''))/2);for(const budget of [512,1024,2048,4096])if(lowerBound>budget){row.budgetExpectations??={};row.budgetExpectations[budget]={expectedSourceIds:[],expectedSpans:[],correctFacts:[],noEvidence:true};}questions.push(row);return row;}
 for(let i=0;i<8;i++){
  const base=roots[Math.floor(i/2)]!,a=`${i%2?'南院':'北院'}${i+1}${base}`,b=`${i%2?'北院':'南院'}${i+1}${base}`,v=`${suite==='blind'?'望潮':'观苇'}守卫${i+1}`,x=`${suite==='blind'?'听霜':'观芦'}客${i+1}`,item=`${suite==='blind'?'玄纹':'青纹'}法器${i+1}`;
  data.entities.push({id:`a${i}`,name:base,aliases:[a,`掌箓${a}`],kind:'person'},{id:`b${i}`,name:base,aliases:[b],kind:'person'},{id:`v${i}`,name:v,aliases:[],kind:'person'},{id:`x${i}`,name:x,aliases:[],kind:'person'},{id:`item${i}`,name:item,aliases:[],kind:'item'},{id:`loc${i}`,name:`合成渡口${i+1}`,aliases:[],kind:'place'});
  const relation=suite==='blind'?`${a}说：“你称我‘同行者’，我仍戒备。”他停了停，又道：“先查旧账，再谈信任。”`:`${a}说：“我仍戒备。先查旧账。”`;
  const other=`${b}说：“我愿与你合作。”`;const s0=add(i,0,relation+other,[fact(`r${i}`,`a${i}`,'关系','戒备'),fact(`other${i}`,`b${i}`,'关系','合作')],[`a${i}`,`b${i}`],[{factId:`r${i}`,text:relation,speakerId:`a${i}`},{factId:`other${i}`,text:other,speakerId:`b${i}`}]);
  const issue=suite==='blind'?`${a}说：「我答应在三日内归还${item}。『三日』从收到法器时起算；若道路封闭则延期，不得转交第三人。」`:`${a}答应：“三日内归还${item}，道路封闭则延期，不得转交。”`;
  const s1=add(i,1,issue,[fact(`p${i}`,`a${i}`,'约定','待履行')],[`a${i}`],[{factId:`p${i}`,text:issue,speakerId:`a${i}`}]);
  const partial=`${a}的承诺部分履行，只归还了两成${item}，余下八成仍需按原期限归还。`;const s2=add(i,2,partial,[fact(`partial${i}`,`a${i}`,'约定','部分履行','world-event',`p${i}`)],[`a${i}`],[{factId:`partial${i}`,text:partial}]);s1.facts[0]!.validUntil=s2.turnId;
  const state=i%2?'已失效':'已取消',ending=`${a}的承诺${i%2?'因期限届满而失效':'经双方同意取消'}，不再列为待履行义务；${item}的归属另行登记。`;const s3=add(i,3,ending,[fact(`end${i}`,`a${i}`,'约定',state,'world-event',`partial${i}`)],[`a${i}`],[{factId:`end${i}`,text:ending}]);s2.facts[0]!.validUntil=s3.turnId;
  const rumor=suite==='blind'?`${a}转述${b}听来的话：“有人说${v}已经死了。”他随即补充：“只是转述，我未亲眼见过，也可能是误报。”`:`${a}说：“听说${v}已经死了，未经证实。”`;
  const s4=add(i,4,rumor,[fact(`claim${i}`,`a${i}`,'身份传闻',`${v}死亡`,'character-claim')],[`a${i}`,`b${i}`],[{factId:`claim${i}`,text:rumor,speakerId:`a${i}`,reporterId:`b${i}`}]);
  const contrad=`${b}冷笑：“对，我‘已经归还’${item}，你信吗？我其实只是在转述别人的夸口。”`;const s5=add(i,5,contrad,[fact(`irony${i}`,`b${i}`,'身份传闻',`${item}已归还`,'character-claim')],[`b${i}`],[{factId:`irony${i}`,text:contrad,speakerId:`b${i}`}]);
  const truth=`${v}的真实身份经合成规则事件核验，仍为守卫，先前的死亡传闻被证伪；没有死亡。`;const s6=add(i,6,truth,[fact(`truth${i}`,`v${i}`,'身份','守卫；未死亡')],[`v${i}`],[{factId:`truth${i}`,text:truth}]);
  data.aliasSince[`a${i}`]={[`掌箓${a}`]:s6.turnId};const forgetAt=turn(i,7)+1;data.knowledgeWindows[s4.sourceId]={[`a${i}`]:{since:s4.turnId,forgetAt},[`b${i}`]:{since:s6.turnId}};
  const malformed=i%2?`${x}说：“听说法器被卖掉了。`:`${x}只核对传闻索引，没有说过法器被卖掉。`;const s7=add(i,7,malformed,[fact(`missing${i}`,`x${i}`,'身份传闻','法器被卖掉','character-claim')],[`x${i}`]);
  const long=`${x}承诺：“三日内归还${item}。`+Array.from({length:45},(_,j)=>`第${j+1}条条件：若通路关闭则延期，不得转交他人；`).join('')+'最后仍须核验全部限制。”';const s8=add(i,8,long,[fact(`long${i}`,`x${i}`,'约定','待履行')],[`x${i}`],[{factId:`long${i}`,text:long,speakerId:`x${i}`}]);
  const invented=fact(`invented${i}`,`x${i}`,'身份','已死亡');const s9=add(i,9,`${x}已经死亡只是生成叙事猜测，没有确认规则事件。`,[invented],[`x${i}`]);delete s9.facts[0]!.confirmedBy;
  q(i,'nested-relation',`${a}当时的关系原话是什么？`,[s0],[`r${i}`],s0.turnId);
  q(i,'other-speaker',`${b}当时的关系原话是什么？`,[s0],[`other${i}`],s0.turnId);
  q(i,'same-name',`${base}的关系原话是什么？`,[],[],s0.turnId);
  q(i,'issued-promise',`${a}当时承诺是什么？`,[s1],[`p${i}`],s1.turnId);
  q(i,'partial-promise',`${a}当前承诺是什么？`,[s2],[`partial${i}`],s2.turnId);
  q(i,'canceled-expired',`${a}当前承诺是什么？`,[s3],[`end${i}`]);
  q(i,'unheard-promise',`${a}当时承诺是什么？`,[],[],s1.turnId,{kind:'npc',npcId:`b${i}`});
  q(i,'future-promise',`${a}当时承诺是什么？`,[],[],s1.turnId-1);
  q(i,'reported-claim',`${a}的身份传闻是什么？`,[s4],[`claim${i}`],s4.turnId,{kind:'player'},[s4.turnId,s4.turnId]);
  q(i,'ironic-claim',`${b}关于${item}的传闻是什么？`,[s5],[`irony${i}`],count,{kind:'player'},[s5.turnId,s5.turnId]);
  q(i,'truth-confirmed',`${v}当前真实身份是什么？`,[s6],[`truth${i}`]);
  q(i,'rumor-without-truth',`${a}的身份传闻是什么？`,[s4],[`claim${i}`],s6.turnId,{kind:'npc',npcId:`a${i}`},[s4.turnId,s4.turnId]);
  q(i,'hidden-truth',`${v}当前真实身份是什么？`,[],[],count,{kind:'npc',npcId:`a${i}`});
  q(i,'later-learned-before',`${a}的身份传闻是什么？`,[],[],s6.turnId-1,{kind:'npc',npcId:`b${i}`},[s4.turnId,s4.turnId]);
  q(i,'later-learned-after',`${a}的身份传闻是什么？`,[s4],[`claim${i}`],s6.turnId,{kind:'npc',npcId:`b${i}`},[s4.turnId,s4.turnId]);
  q(i,'forgotten-claim',`${a}的身份传闻是什么？`,[],[],count,{kind:'npc',npcId:`a${i}`},[s4.turnId,s4.turnId]);
  q(i,'missing-quote-or-speech',`${x}的身份传闻是什么？`,[],[],count,{kind:'player'},[s7.turnId,s7.turnId]);
  q(i,'atomic-long-promise',`${x}当前承诺是什么？`,[s8],[`long${i}`]);
  q(i,'generated-not-rule',`${x}当前身份是什么？`,[],[],count,{kind:'player'},[s9.turnId,s9.turnId]);
  q(i,'future-alias',`掌箓${a}的关系原话是什么？`,[],[],s6.turnId-1);
  q(i,'wrong-topic',`${a}关于火山的传闻是什么？`,[],[],count,{kind:'player'},[s4.turnId,s4.turnId]);
 }
 data.entities.push({id:'scribe',name:'合成记簿者',aliases:[],kind:'person'});
 data.turns=Array.from({length:count},(_,j)=>anchors.get(j+1)??{sourceId:`${suite}:ambient:${j+1}`,turnId:j+1,gameMinute:(j+1)*72,gameTime:'合成旁支',participants:['scribe'],location:'旁支记录',items:[],narrative:background(j+1),eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:['scribe']});
 const lengths=data.turns.map(s=>s.narrative.length).sort((a,b)=>a-b),sentences=data.turns.flatMap(s=>s.narrative.match(/[^。！？]+[。！？]?/gu)??[]);return {data,ledger,questions,meta:{suite,count,seed,synthetic:true,characters:lengths.reduce((a,b)=>a+b,0),p50Chars:lengths[Math.floor(count*.5)],p95Chars:lengths[Math.floor(count*.95)],exactDocumentRepeat:1-new Set(data.turns.map(s=>s.narrative)).size/count,exactSentenceRepeat:1-new Set(sentences).size/sentences.length,backgroundGrammarTemplates:bg.length,oracle:'Scripted author ledger and budget lower bound; no tested retriever generates truth, source maps or authorization.',limitation:'Same author wrote generator and algorithms; reserved structural variants plus unseen random seed, not an independently human-authored distribution. Whole-source policy simulation, not production P3/P4/P5.'}};
}
