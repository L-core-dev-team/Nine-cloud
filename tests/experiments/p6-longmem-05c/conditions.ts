import {words} from '../p6-longmem-prose/intent.ts';
import {lexicalForm,hasGroundLanding} from './lexical.ts';
export type Conditions={locations:string[];weather:'rain'|'clear'|null;landing:boolean;objects:string[];unsupported:boolean};
const parts=/耳后|耳边|耳垂|腰间|腰上|衣襟|领口|袖口|手腕|腕上|额头|眉间|颈间|脚踝/gu;
const filler=/最早|最初|最新|第一次|初次|当时|当年|一段|原文|描述|描写|细节|特点|外观|外貌|衣着|衣物|衣裳|神态|颜色|气味|气息|味道|香气|香味|声音|声响|闻起来|传来|发出|如何|怎样|怎么|什么|哪里|出现|提到|谈到|有关|关于|原话|原句|对白|对话|做了|是什么|装饰|饰物|动作|束发|的时候|时候|现在|当前|截至|有|的|了|说|穿|与|或|和|在|上|下|前|后|时|关|谈|用|响/gu;
export function conditions(text:string):Conditions {
 const locations=[...text.matchAll(parts)].map(m=>m[0]);
 const weather=/雨里|雨中|雨天|下雨时|雨落/.test(text)?'rain':/晴天|晴日|晴朗|晴时/.test(text)?'clear':null;
 const landing=hasGroundLanding(text);
 let rest=lexicalForm(text).replace(parts,' ').replace(/雨里|雨中|雨天|下雨时|晴天|晴日|晴朗|晴时/gu,' ').replace(/落地/gu,' ').replace(filler,' ');
 // Preserve concrete lexical tokens rather than merging words across deleted syntax.
 const objects=words(rest).filter(w=>w.length>=2&&!/^(请求|要求|希望|留存|等风|停了|物品|附近)$/.test(w));
 return {locations,weather,landing,objects,unsupported:/除外|除了|不要|排除|并非|不是|没有|未曾|是否|难道|据说|听说/.test(text)};
}
function negative(text:string){return /没有|并无|并未|无任何|不存在|未曾|不曾|并非|不是|未佩|没戴/.test(text);}
export function supports(c:Conditions,text:string):boolean {
 if(c.unsupported)return false; // Unknown logical query operators fail closed in this finite parser.
 const canonical=lexicalForm(text);
 if(c.locations.length&&!c.locations.every(p=>text.includes(p)))return false;
 if(c.weather==='rain'&&(!/雨|淋湿/.test(text)||/无雨|没下雨|没有雨|雨停|雨已停|雨过天晴/.test(text)))return false;
 if(c.weather==='clear'&&(!/晴|日光|阳光/.test(text)||/不晴|阴雨|雨中|雨天/.test(text)))return false;
 if((c.locations.length||c.weather)&&negative(text))return false;
 if(c.landing){
  // Bind object and positive physical landing to the same local clause.
  const clauses=canonical.split(/[。！？；，,;:\n]/u);
  return clauses.some(p=>hasGroundLanding(p)&&c.objects.every(o=>{
   // A second object in the same punctuation-free clause is not the landing subject.
   const prefixes=p.split('落地').slice(0,-1);
   return prefixes.some(prefix=>{const local=prefix.split(/而|但是|却|不过|至于/u).at(-1)!.replace(/(?:忽然|突然|轻轻|缓缓|意外|终于|一起|一同|同时|失手|猛然)+$/u,'');return local.split(/和|与|及/u).some(subject=>subject.endsWith(o));});
  }));
 }
 return c.objects.every(o=>canonical.includes(lexicalForm(o)));
}
