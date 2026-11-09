/** Synthetic experimental prose, never Canon. Run once before retrieval implementation. */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Dataset,Source,GoldQuestion} from '../p6-longmem/types.ts';

// Scene-disjoint development / holdout. Each tuple is authored prose and five questions.
const scenes = [
 ['陆砚','纸鹤亭','旧青袍的袖口缝着三颗白扣','雨后木栏散出湿松香','檐铃发出断续的清响','他用指背敲了两下茶盏','他说：“别踩碎那片落叶。”','陆砚初次穿什么衣裳？','纸鹤亭木栏的气味是什么？','纸鹤亭的檐铃怎样响？','陆砚如何敲茶盏？','陆砚当时说的原话是什么？'],
 ['沈禾','残月廊','眉梢有一道浅浅的旧痕','酒坛口透出酸梅气息','墙后传来水滴落在铜盆里的声音','她把细线绕到左手小指上','她说：“等风停了再走。”','沈禾眉梢有什么外貌细节？','残月廊酒坛散发什么味道？','残月廊墙后传来什么声音？','沈禾将细线绕在哪里？','沈禾提到风时怎样说？'],
 ['顾汀','织雨坊','披着下摆发白的栗色斗篷','炭炉旁有烤栗子的香味','织机的木齿咔嗒一声停住','他先拂去凳面的尘土再坐下','他说：“这根线不能换。”','顾汀最早的斗篷是什么颜色？','织雨坊炭炉附近闻起来怎样？','织雨坊织机发出了什么声响？','顾汀坐下前做了什么动作？','顾汀谈到线的对话原句是什么？'],
 ['温澜','白石井','头发用一支弯竹簪束住','井沿青苔带着冷湿的土腥味','井底回声比脚步迟了半拍','她将空桶侧过来轻轻晃动','她说：“井下有人应声。”','温澜当时用什么束发？','白石井井沿的气味出现在哪里？','白石井的回声有什么特点？','温澜怎样晃动空桶？','温澜说井下怎样？'],
 ['宋岚','斜阳铺','右眼下方有一粒淡褐色小痣','柜台有晒干橘皮的苦香','门轴吱呀两次才合拢','他以掌心遮住灯火避开风','他说：“账本留在这里。”','宋岚右眼下面是什么样？','斜阳铺柜台附近有什么香气？','斜阳铺的门关上时怎样响？','宋岚如何保护灯火？','宋岚有关账本的原话是什么？'],
 ['许棠','渡雪桥','衣襟边绣着一片银灰芦叶','桥头药包透出辛辣姜味','冰层下有沉闷的流水声','她蹲下把碎冰拨到桥边','她说：“脚印到这里就断了。”','许棠衣襟上绣了什么？','渡雪桥药包闻起来如何？','渡雪桥冰层下面是什么声响？','许棠将碎冰拨到了哪里？','许棠谈脚印的原句是什么？'],
 ['方墨','铜叶堂','戴着边缘缺口的黑木面具','桌上墨块带着淡淡胶味','窗外竹片相撞像短促的拍手','他用袖角擦去杯沿的水珠','他说：“墨还没有干。”','方墨的面具有怎样的外观？','铜叶堂的墨块有什么味道？','铜叶堂竹片相撞的声音像什么？','方墨用什么擦杯沿？','方墨关于墨的对话是什么？'],
 ['叶蘅','细沙湾','脚边放着一双缀红绳的草鞋','退潮泥滩散出咸腥气','沙粒滑下陶罐时沙沙作响','她把罐口朝向背风的一侧','她说：“不要碰罐底。”','叶蘅草鞋的外观怎样？','细沙湾泥滩是什么气味？','细沙湾陶罐里沙粒如何响？','叶蘅把罐口朝向哪里？','叶蘅关于罐底的原话是什么？'],
 ['韩璟','雾灯阁','脸上带着尚未擦净的煤灰','灯芯燃烧时有微苦油烟味','远处号角低低拖了三声','他抬起两根手指示意停步','他说：“第三盏灯不要点。”','韩璟脸上的神态与外貌细节是什么？','雾灯阁灯芯的气味如何？','雾灯阁远处号角响了几声？','韩璟怎样示意停步？','韩璟谈灯的原句是什么？'],
 ['苏微','落花仓','左腕围着一条褪色蓝布','仓中麻袋散出干草的甜气','屋梁上传来鸟爪刮木的细声','她把钥匙藏到空碗下面','她说：“先把窗关好。”','苏微左腕有什么衣着细节？','落花仓麻袋散出什么气息？','落花仓屋梁传来什么声音？','苏微将钥匙藏在哪里？','苏微最早的对白是什么？'],
 ['祁栖','青瓷坳','耳后别着一朵半干的紫花','破窑门边有潮纸与烟灰混合的味道','石阶上的雨水滴答滴答落下','他用脚尖将碎瓷片推入墙缝','他说：“裂口要朝外。”','祁栖耳后有什么装饰？','青瓷坳破窑门边闻到什么？','青瓷坳石阶雨水如何作响？','祁栖怎样处理碎瓷片？','祁栖说裂口应该怎样？'],
 ['程荻','回风院','披肩上沾着一枚金黄树种','空炉里留有焦麦的气息','屏风后有人轻轻吸了一口气','她把手背贴在石墙上试温度','她说：“墙比昨天冷。”','程荻披肩上的颜色与物品是什么？','回风院空炉是什么气味？','回风院屏风后的声音是什么？','程荻怎样试墙的温度？','程荻有关墙的原话是什么？'],
 ['孟遥','断潮台','唇边有一个几乎看不见的笑意','石缝长着散出辛凉味的薄荷','潮声一阵高一阵低地拍打台基','他将小石子从拇指滚到食指','他说：“这次不要数潮。”','孟遥当时脸上有什么神态？','断潮台石缝的植物闻起来如何？','断潮台的潮声怎样变化？','孟遥手指怎样移动石子？','孟遥谈到数潮的原句是什么？'],
 ['白荞','银杏埠','裙边染着未干的深绿水痕','系船绳有海盐和湿麻的气味','船舱里木碗相撞发出空响','她伸手扶正倾斜的细灯杆','她说：“灯影照不到那里。”','白荞裙边是什么颜色？','银杏埠系船绳有什么味道？','银杏埠船舱木碗如何响？','白荞扶正了什么物品？','白荞说灯影怎样？'],
 ['谭宁','旧棋室','肩头披着带细格纹的灰毡','棋盒内衬透出淡淡樟脑味','一颗棋子落在地上弹了两下','他只用指尖掀开盒盖一角','他说：“白子少了一颗。”','谭宁肩头的衣物是什么样？','旧棋室棋盒的气味是什么？','旧棋室落地棋子的声音出现在哪里？','谭宁怎样打开棋盒？','谭宁有关白子的原话是什么？'],
 ['柳璇','烟水庵','双眼因熬夜泛着细细血丝','蒲团边有温热豆浆的香气','柴门外有人拖着鞋走过','她将折纸压在灯台脚下','她说：“信不要拆开。”','柳璇眼睛有什么外貌细节？','烟水庵蒲团附近有什么气味？','烟水庵柴门外传来什么声响？','柳璇把折纸放在哪里？','柳璇关于信说了什么原话？'],
 ['唐芷','碎玉坡','腰间挂着一枚磨圆的白石','雨落在蕨叶上带起青草味','坡下铃铛响了一声便停','他捏住蕨叶尖端抖去水珠','他说：“石头不是玉。”','唐芷腰间的物品外观如何？','碎玉坡雨里的味道是什么？','碎玉坡下铃铛怎样响？','唐芷如何抖去水珠？','唐芷关于石头的对白是什么？'],
 ['林絮','夜篷巷','额前垂着被雨黏住的一缕发','篷布上有旧蜡与湿布的味道','水沿瓦沟流下发出细长嘶声','她把破伞柄夹在臂弯里','她说：“伞骨已经断了。”','林絮额前头发是什么样？','夜篷巷篷布闻起来如何？','夜篷巷瓦沟水声是什么样？','林絮怎样拿着破伞？','林絮关于伞骨的原句是什么？'],
 ['赵葭','赤泥驿','衣领里面露出一小段黄绸','热泥墙边散出铁锈气','驿马鼻中喷出短短一声气响','他把布包放到门槛内侧','他说：“包里没有药。”','赵葭衣领露出什么颜色？','赤泥驿热泥墙边的气味是什么？','赤泥驿驿马发出什么声音？','赵葭将布包放在哪里？','赵葭关于包的原话是什么？'],
 ['季萦','空竹园','手套指腹磨出了浅色绒毛','竹筒内有甜涩的竹汁味','空竹滚过石板时嗡嗡低鸣','她用两指夹住即将落地的竹片','她说：“留住这一片。”','季萦手套的外观细节是什么？','空竹园竹筒内部有什么气息？','空竹园空竹滚动时怎样响？','季萦如何接住竹片？','季萦请求留下什么原话？'],
] as const;
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const root=new URL('./fixtures/',import.meta.url);mkdirSync(root,{recursive:true});
export type ProseQuestion=GoldQuestion & {category:string;expectedSpans:{sourceId:string;text:string;start:number;end:number;kind:'narrative-detail'|'character-claim'}[]};
const data:Dataset={schemaVersion:1,synthetic:true,entities:[{id:'observer',name:'旁观者',aliases:[],kind:'person'},{id:'outsider',name:'未在场者',aliases:[],kind:'person'}],turns:[]};
for(let turn=1;turn<=1000;turn++)data.turns.push({sourceId:`p${String(turn).padStart(4,'0')}`,turnId:turn,gameMinute:turn*10,gameTime:`实验第${turn}刻`,participants:[],location:'远路',items:[],narrative:`第${turn}段行旅，路边的石阶有水痕，脚步渐远。`,eventIds:[],tags:[],facts:[],historicalSources:[],authorizedNpcIds:[]});
const dev:ProseQuestion[]=[],hold:ProseQuestion[]=[];
for(const [i,scene] of scenes.entries()){
 const [name,place,...content]=scene;const person=`person-${i}`,location=`place-${i}`;data.entities.push({id:person,name,aliases:[],kind:'person'},{id:location,name:place,aliases:[],kind:'place'});
 const turn=11+i*9;const raw=`${name}来到${place}。${content.slice(0,5).map(s=>s+'。').join('')}`;
 const source:Source={...data.turns[turn-1]!,participants:[person],location,items:[],narrative:raw,authorizedNpcIds:['observer',person]};
 // Some useful prose coexists with unrelated structured facts.
 if(i%3===0)source.facts=[{id:`arrival-${i}`,subject:person,predicate:'抵达',value:place,kind:'world-event',validFrom:turn}];
 data.turns[turn-1]=source;
 const lateTurn=701+i*9;const late:Source={...source,sourceId:`p${lateTurn}`,turnId:lateTurn,gameMinute:lateTurn*10,narrative:`${name}再次来到${place}。衣服换成了素白短衫。周围没有此前的气味与声响。`,facts:[]};data.turns[lateTurn-1]=late;
 const questions=i<10?dev:hold;
 const add=(suffix:string,text:string,expected:Source|null,span:string|undefined,category:string,audience:GoldQuestion['audience']={kind:'player'},asOfTurn=1000)=>{
  const start=span&&expected?expected.narrative.indexOf(span):-1;
  questions.push({questionId:`${i<10?'D':'H'}-${i}-${suffix}`,text,category,asOfTurn,audience,expectedSourceIds:expected?[expected.sourceId]:[],supportingSourceIds:expected?[expected.sourceId]:[],correctFacts:[],multipleEvidence:false,noEvidence:!expected,authorizationBoundary:audience.kind==='npc',temporal:category==='time',longDistance:true,expectedSpans:expected&&span?[{sourceId:expected.sourceId,text:span,start,end:start+span.length,kind:'narrative-detail'}]:[]});
 };
 const categories=['appearance','smell','sound','action','dialogue'];
 for(let j=0;j<5;j++)add(String(j),content[j+5]!,source,content[j],categories[j]!);
 add('denied',content[6]!,null,undefined,'unauthorized',{kind:'npc',npcId:'outsider'});
 add('early',`${name}最早一段原文的衣着或外貌是什么？`,source,content[0],'time');
 add('latest',`${name}最新一段原文的衣着是什么？`,late,'衣服换成了素白短衫','time');
 add('future',content[5]!,null,undefined,'future',{kind:'player'},turn-1);
 add('unknown',`${name}的翡翠耳坠原文在哪里？`,null,undefined,'unknown');
}
// Duplicate names have unique aliases. Ambiguous query must not pick either person.
data.entities.push({id:'twin-a',name:'周寻',aliases:['山口画师'],kind:'person'},{id:'twin-b',name:'周寻',aliases:['河口药师'],kind:'person'});
for(const [id,turn,text] of [['twin-a',330,'山口画师周寻穿着灰袍。'],['twin-b',340,'河口药师周寻穿着红袍。']] as const)data.turns[turn-1]={...data.turns[turn-1]!,participants:[id],narrative:text,authorizedNpcIds:['observer']};
// Immutable expected offsets, source existence and exact original bytes are validated before freezing.
for(const qs of [dev,hold])for(const q of qs)for(const s of q.expectedSpans){const original=data.turns.find(x=>x.sourceId===s.sourceId)!;if(s.start<0||original.narrative.slice(s.start,s.end)!==s.text)throw Error(q.questionId);}
const files=[['history-1000.json',data],['development.json',dev],['holdout.json',hold]] as const;
const manifest={stage:'PRE_IMPLEMENTATION_FREEZE',synthetic:true,developmentCount:dev.length,holdoutCount:hold.length,split:'first ten scenes development; last ten scenes held out; no scene shared',policy:'Same AI authored, not human independent blind test. Holdout evaluated only after retrieval source freeze; no retuning after unseal.',files:files.map(([name,value])=>{const bytes=JSON.stringify(value,null,2)+'\n';writeFileSync(new URL(name,root),bytes);return {name,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};})};
writeFileSync(new URL('freeze-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({...manifest,oldAnswerHash:hash(readFileSync(new URL('../p6-longmem-hardening/fixtures/frozen-questions.json',import.meta.url)))}));
