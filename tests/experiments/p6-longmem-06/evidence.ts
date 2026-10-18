import {createHash} from 'node:crypto';import type {Dataset,Source,Fact} from '../p6-longmem/types.ts';
export type Unit={start:number;end:number;text:string;closed:boolean};
export type Binding={sourceId:string;start:number;end:number;sourceSha256:string;speakerId?:string;reporterId?:string};
export type BoundDataset=Dataset&{evidenceBindings?:Record<string,Binding>};
const pairs:Record<string,string>={'“':'”','‘':'’','「':'」','『':'』','"':'"'};
const closers=new Set(Object.values(pairs));
export const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
/** A punctuation mark inside a quote is not a source boundary. UTF-16 indices stay untouched. */
export function units(text:string):Unit[]{
 const result:Unit[]=[],stack:string[]=[];let start=0,bad=false;
 const emit=(end:number)=>{const value=text.slice(start,end);if(/[^\s。！？]/u.test(value))result.push({start,end,text:value,closed:!bad&&!stack.length});start=end;bad=false;};
 for(let i=0;i<text.length;i++){const c=text[i]!;
  if(c==='"'){if(stack.at(-1)==='"')stack.pop();else stack.push('"');}
  else if(pairs[c])stack.push(pairs[c]!);
  else if(closers.has(c)){if(stack.at(-1)===c)stack.pop();else bad=true;}
  if(!stack.length&&(c==='\n'||/[。！？]/u.test(c)))emit(i+1);
  else if(!stack.length&&closers.has(c)&&/[。！？][”’」』"]*$/u.test(text.slice(start,i+1)))emit(i+1);
 }
 if(start<text.length)emit(text.length);return result;
}
function persons(data:Dataset){return data.entities.filter(e=>e.kind==='person');}
export function speakers(text:string,data:Dataset):string[]{
 const intro=text.split(/[“‘「『"]/u)[0]!;const matches=persons(data).flatMap(e=>[e.name,...e.aliases].filter(a=>{const i=intro.lastIndexOf(a);return i>=0&&/^(?:[^。！？]{0,12})(?:说|道|问|答|转述|补充)[：:]?$/u.test(intro.slice(i+a.length).trim())&&!/听说$/u.test(intro.slice(i+a.length));}).map(alias=>({id:e.id,alias})));
 const explicit=matches.filter(m=>!matches.some(o=>o.alias.length>m.alias.length&&o.alias.includes(m.alias)));
 return [...new Set(explicit.map(m=>m.id))];
}
const claimCue=/听说|据说|传闻|谣言|猜测|怀疑|转述|声称|自称|说法|说[：:]|说道|否认|未证实|没有亲眼|尚未核实/u;
const promiseCue=/承诺|答应|约定|应允|允诺|保证|兑现|履行|归还|取消|解除|失效|期限/u;
const restriction=/^(?:他|她|此事|此言|这个消息|这项承诺|该承诺)?(?:没有亲眼|未曾确认|尚未|但|不过|然而|仅|除非|如果|条件|期限|必须|不得|不是|并非|此言)/u;
export function selectProof(data:BoundDataset,s:Source,facts:Fact[],predicates:RegExp[],strict:boolean):{pieces:Unit[];supported:boolean;reason:string;speakerIds:string[];bindings:Binding[]}{
 const parsed=units(s.narrative),pieces:Unit[]=[],bindings:Binding[]=[];
 const aliases=(id:string)=>{const e=data.entities.find(e=>e.id===id);return e?[e.name,...e.aliases]:[];};
 for(const f of facts){const binding=data.evidenceBindings?.[f.id];if(binding){
   if(binding.sourceId!==s.sourceId||binding.sourceSha256!==sha(s.narrative)||binding.start<0||binding.end> s.narrative.length||binding.start>=binding.end)return {pieces:[],supported:false,reason:'invalid-authored-binding',speakerIds:[],bindings:[]};
   const overlapping=parsed.filter(p=>p.start<binding.end&&p.end>binding.start);if(!overlapping.length||overlapping.some(p=>!p.closed)||overlapping[0]!.start!==binding.start||overlapping.at(-1)!.end!==binding.end)return {pieces:[],supported:false,reason:'incomplete-quoted-binding',speakerIds:[],bindings:[]};
   const value=s.narrative.slice(binding.start,binding.end),actors=[...new Set(overlapping.flatMap(p=>speakers(p.text,data)))];if(binding.speakerId&&actors.some(id=>id!==binding.speakerId)||f.kind==='character-claim'&&!binding.speakerId&&actors.some(id=>id!==f.subject))return {pieces:[],supported:false,reason:'speaker-binding-conflict',speakerIds:[],bindings:[]};
   if(binding.speakerId&&!aliases(binding.speakerId).some(a=>value.includes(a)))return {pieces:[],supported:false,reason:'speaker-name-not-in-binding',speakerIds:[],bindings:[]};
   pieces.push({start:binding.start,end:binding.end,text:value,closed:true});bindings.push(binding);continue;
  }
  const claim=f.kind==='character-claim',promise=/约定|承诺/u.test(f.predicate);
  const eventCue=/来源/u.test(f.predicate)?/赠|交给|来自|来源|出自|取自/u:null;
  let relevant=parsed.filter(p=>p.closed&&(claim?claimCue.test(p.text):promise?promiseCue.test(p.text):predicates.some(r=>r.test(p.text))||p.text.includes(f.value)||!!eventCue&&eventCue.test(p.text)));
  if(strict&&claim)relevant=relevant.filter(p=>{const intro=p.text.split(/[“‘「『"]/u)[0]!;return /说[：:]|说道|转述|声称|自称|听说|据说|猜测|怀疑|认为|推测/u.test(p.text)&&!/(?:没有|未曾|从未|不曾)(?:说|听说|转述)/u.test(intro);});
  if(strict&&(claim||promise)){
   const subject=data.entities.find(e=>e.id===f.subject);
   relevant=relevant.filter(p=>{const actor=speakers(p.text,data);if(promise&&subject?.kind==='item'&&f.kind==='world-event'&&f.confirmedBy&&s.eventIds.includes(f.confirmedBy)&&s.items.includes(f.subject))return true;return aliases(f.subject).some(a=>p.text.includes(a))&&(!actor.length||actor.includes(f.subject));});
   // No lexical paraphrase is promoted to truth. A unique attributed speech-act unit can support a SAY fact only.
   if(claim&&relevant.length!==1)return {pieces:[],supported:false,reason:'ambiguous-or-missing-attributed-claim',speakerIds:[],bindings:[]};
   if(promise&&subject?.kind==='item'&&relevant.length!==1)return {pieces:[],supported:false,reason:'ambiguous-item-promise-needs-binding',speakerIds:[],bindings:[]};
  }
  if(!relevant.length&& !strict)relevant=parsed.filter(p=>p.closed);
  if(!relevant.length)return {pieces:[],supported:false,reason:'no-complete-supporting-unit',speakerIds:[],bindings:[]};
  for(const p of relevant){const at=parsed.indexOf(p);let end=p.end;for(let j=at+1;j<parsed.length&&j<=at+3;j++){const next=parsed[j]!;if(!next.closed||!restriction.test(next.text)||speakers(next.text,data).some(id=>id!==f.subject))break;end=next.end;}pieces.push({start:p.start,end,text:s.narrative.slice(p.start,end),closed:true});}
 }
 if(!facts.length){const relevant=parsed.filter(p=>p.closed&&predicates.some(r=>r.test(p.text)));pieces.push(...relevant);}
 const unique=[...new Map(pieces.map(p=>[p.start+':'+p.end,p])).values()].sort((a,b)=>a.start-b.start);
 return {pieces:unique,supported:unique.length>0,reason:unique.length?'complete-original-units':'no-complete-supporting-unit',speakerIds:[...new Set([...unique.flatMap(p=>units(p.text).flatMap(u=>speakers(u.text,data))),...bindings.flatMap(b=>b.speakerId?[b.speakerId]:[])])],bindings};
}
