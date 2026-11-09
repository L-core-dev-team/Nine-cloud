import type { GoldQuestion } from '../p6-longmem/types.ts';
// Explicit authoring spec, independent of corpus.ts, ranking, search and result files.
// Deterministic shared turn numbering is a fixture convention, not an answer lookup.
const places=['栖潮埠','苔石院','折柳台','雾松亭','照雪驿','回沙湾','孤竹坊','映汀阁','缄灯楼','浅霜堡'];
const turn=(a:number,b:number)=>(b-1)*10+a+1;
const sid=(a:number,b:number)=>`s${String(turn(a,b)).padStart(3,'0')}`;
type Expected = [number,string,string, 'current'|'historical'|'unverified'];
function question(id:string,text:string,a:number,beats:number[],facts:Expected[],options:Partial<GoldQuestion>={}):GoldQuestion {
  return {questionId:id,text,asOfTurn:1000,expectedSourceIds:beats.map(b=>sid(a,b)),supportingSourceIds:beats.map(b=>sid(a,b)),
    correctFacts:facts.map(([b,p,value,status])=>({id:`f${turn(a,b)}-${p}`,value,status})),multipleEvidence:beats.length>1,
    noEvidence:beats.length===0,authorizationBoundary:false,temporal:facts.some(f=>f[3]==='historical'),longDistance:beats.some(b=>b<=20),audience:{kind:'player'},...options};
}
export function authoredQuestions():{development:GoldQuestion[];frozen:GoldQuestion[]} {
  const development:GoldQuestion[]=[],frozen:GoldQuestion[]=[];
  for(let a=0;a<10;a++) {
    const p=places[a]!, title=`${p}信使`, box=`${p}秘匣`;
    development.push(
      question(`D${a}-gift`,`${title}初次见面赠给旅人的${p}潮印来自何处？`,a,[2],[[2,'来源',`${title}赠给旅人`,'current']]),
      question(`D${a}-owners`,`${box}的全部持有人变化经过是什么？`,a,[8,25,55,80],[[8,'归属','旅人','historical'],[25,'归属',`${p}库守`,'historical'],[55,'归属',`${p}书记`,'historical'],[80,'归属','旅人','current']],{temporal:true}),
      question(`D${a}-relations`,`${title}与旅人的完整关系变化有哪些原始来源？`,a,[12,40,70,95],[[12,'关系','戒备','historical'],[40,'关系','信任','historical'],[70,'关系','疏远','historical'],[95,'关系','信任','current']],{temporal:true}),
      question(`D${a}-promise`,`${box}约定从提出到兑现有哪些证据？`,a,[5,85],[[5,'约定',`在${p}送回秘匣并核验旧档`,'historical'],[85,'约定','已兑现','current']],{temporal:true}),
      question(`D${a}-secret`,`${title}能知道${box}暗格秘密的位置吗？`,a,[],[],{audience:{kind:'npc',npcId:`p-a${a}-lead`},authorizationBoundary:true})
    );
    // Sealed output is only validated for internal coherence here, never fed into optimizer.
    const next=(a+1)%10;
    const clue=question(`F${a}-clue`,`事件 e${String(turn(a,90)).padStart(3,'0')}-dispatch 揭晓的两枚潮印交织伏笔，需要哪些早期原文？`,a,[3,90],[[90,'刻痕含义','报潮线路的两端','current']]);
    clue.expectedSourceIds.splice(1,0,sid(next,3));clue.supportingSourceIds=[...clue.expectedSourceIds];clue.multipleEvidence=true;
    frozen.push(clue,
      question(`F${a}-identity`,`${title}更名与身份传闻被澄清的前后原始来源有哪些？`,a,[20,35,60],[[20,'身份传闻','逃亡盐商','unverified'],[35,'更名',`${p}引潮人`,'current'],[60,'真实身份','护潮员','current']],{temporal:true}),
      question(`F${a}-prose`,`${p}潮印封签原文的温杉气味出现在哪里？`,a,[15],[]),
      question(`F${a}-past`,`${box}截至此时当前由谁保管？`,a,[25],[[25,'归属',`${p}库守`,'current']],{asOfTurn:turn(a,45),temporal:true}),
      question(`F${a}-unsupported`,`${p}潮印被烧毁的事件是否发生过？`,a,[],[])
    );
  }
  return {development,frozen};
}
