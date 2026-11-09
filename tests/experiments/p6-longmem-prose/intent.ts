const segmenter = new Intl.Segmenter('zh-CN', {granularity:'word'});
export const words=(text:string)=>[...segmenter.segment(text.normalize('NFKC').toLowerCase())].filter(s=>s.isWordLike).map(s=>s.segment);
export const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export const grams=(s:string)=>{const a=[...normalize(s)];return new Set(a.slice(1).map((c,i)=>a[i]!+c));};
export type TemporalIntent='ordinary'|'historical'|'current';
export function temporalIntent(text:string):TemporalIntent {
 // Consume productive 现+在 verb constructions before segmentation; ICU alone
 // can split 重现在 as 重/现在. This grammar applies across verbs and sentences.
 const lexical=text.replace(/[“「"].*?[”」"]/gu,'').replace(/(?:出|体|表|呈|重|再|浮|显|涌|展|突|闪|乍)现(?=在)/g,m=>m.replace('现','現')).replace(/现(?=在场)/g,'現');
 const tokens=words(lexical);
 // Lexical tokens avoid cross-word matches in 出现/在、体现/在、发现/在 and 现/在场.
 if(/当时|当年|那时|此前|以前|曾经|最早|最初|初遇|初次|第一次|过去/.test(text))return 'historical';
 if(tokens.some(t=>['现在','当前','目前','如今','此刻','现今','截至'].includes(t))||/最新|最近一次/.test(text))return 'current';
 return 'ordinary';
}
// Query vocabulary only; independent of question IDs, scene answers and fixtures.
export const facets = [
 {name:'appearance',query:/外貌|外观|衣|穿|颜色|装饰|长相|头发|束发|面具|手套|眉|眼|裙|披肩|神态|脸|草鞋/,sentence:/袍|袖|衣|扣|痣|痕|披|裙|眼|眉|脸|发|簪|戴|面具|手套|绸|绳|草鞋|腰|腕|耳|笑意/},
 {name:'smell',query:/气味|味道|香气|气息|香味|闻|苦香/,sentence:/气味|气息|味|香|腥|烟/},
 {name:'sound',query:/声音|声响|响|回声|潮声|水声|鸣|声/,sentence:/声|响|鸣|咔嗒|沙沙|吱呀|回声/},
 {name:'action',query:/动作|如何|怎样|怎么|敲|绕|晃|坐|擦|保护|拨|藏|示意|朝向|拿|处理|试.*温度|移动|扶正|打开|放在|抖|接住/,sentence:/敲|绕|拂|晃|遮|蹲|拨|擦|朝向|抬|藏|推|贴|滚|扶|掀|压|捏|夹|放|伸手|手指/},
 {name:'dialogue',query:/原话|原句|对白|对话|说|怎样说|提到|谈到|谈/,sentence:/[“”「」]|说[：:]/},
 {name:'environment',query:/环境|天气|景色|场景|周围|天色|雨|风|雪/,sentence:/雨|风|雪|雾|天|墙|石阶|窗|檐|桥/},
] as const;
export function proseIntent(text:string){
 const explicit=/原文|描写|描述|外貌|衣着|神态|声音|声响|气味|气息|闻|对白|原话|对话|颜色|环境|天气/.test(text);
 const typed=/初遇|见面.*地点|赠|交给|来源|归属|持有|归谁|保管|转手|转交|购买|买下|关系|态度|戒备|信任|疏远|约定|承诺|兑现|期限|伏笔|刻痕|短线|身份|伪装|更名|传闻|谣言|自称|秘密|密信|暗格|封面|通行|封闭|开放|重逢|同行|工程|进度|批次|看法|主观|观点|\be\d{3,4}-[a-z]+\b/i.test(text);
 return explicit||!typed;
}
