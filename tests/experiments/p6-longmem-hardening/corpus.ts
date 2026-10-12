import type { Dataset, Fact, Source } from '../p6-longmem/types.ts';

export type ComplexDataset = Dataset & {
  scenario: string;
  aliasSince: Record<string, Record<string, number>>;
  scale: { meaningfulNodes: number; majorNodes: number; characters: number; items: number; longThreads: number; relationshipChains: number };
};
const places = ['栖潮埠','苔石院','折柳台','雾松亭','照雪驿','回沙湾','孤竹坊','映汀阁','缄灯楼','浅霜堡'];
const names = ['江望','江望','江汀','江汀','越璃','越离','温衍','温衍','苏铃','苏凌'];
const marks = ['双弧','缺角','连星','断环','细浪','重叶','斜月','折枝','点砂','钩云'];
export const storyTurn = (arc: number, beat: number) => (beat - 1) * 10 + arc + 1;
export const storySource = (arc: number, beat: number) => `s${String(storyTurn(arc, beat)).padStart(3,'0')}`;
const critical = new Set([2,3,5,8,12,15,16,20,25,35,40,55,60,70,80,85,90,95]);

export function complexHistory(): ComplexDataset {
  const entities: Dataset['entities'] = [{ id: 'p-player', name: '旅人', aliases: ['旅人'], kind: 'person' }];
  const aliasSince: ComplexDataset['aliasSince'] = {};
  for (let a=0; a<10; a++) {
    const place = places[a]!;
    entities.push({id:`p-a${a}-lead`,name:names[a]!,aliases:[`${place}信使`,`${place}归雁客`,`${place}引潮人`],kind:'person'},
      {id:`p-a${a}-keeper`,name:`${place}库守`,aliases:[`${place}保管人`],kind:'person'},
      {id:`p-a${a}-scribe`,name:`${place}书记`,aliases:[`${place}记账人`],kind:'person'},
      {id:`i-a${a}-seal`,name:`${place}潮印`,aliases:[`${place}印信`],kind:'item'},
      {id:`i-a${a}-box`,name:`${place}秘匣`,aliases:[],kind:'item'},
      {id:`l-a${a}`,name:place,aliases:[],kind:'place'});
    aliasSince[`p-a${a}-lead`] = {[`${place}信使`]:1,[`${place}归雁客`]:storyTurn(a,20),[`${place}引潮人`]:storyTurn(a,35)};
  }
  const turns: Source[] = [];
  const previous = new Map<string, Fact>();
  const putState = (source: Source, subject: string, predicate: string, value: string, kind: Fact['kind'] = 'world-event') => {
    const id = `f${source.turnId}-${predicate}`;
    const key = `${subject}/${predicate}`;
    const old = kind === 'world-event' ? previous.get(key) : undefined;
    if (old) old.validUntil = source.turnId;
    const fact: Fact = {id,subject,predicate,value,kind,validFrom:source.turnId,
      ...(old ? {supersedes:old.id}:{}),...(kind==='world-event'?{confirmedBy:source.eventIds[0]!}:{})};
    source.facts.push(fact); if (kind==='world-event') previous.set(key,fact);
  };
  for (let t=1;t<=1000;t++) {
    const a=(t-1)%10, b=Math.floor((t-1)/10)+1, place=places[a]!, lead=`p-a${a}-lead`, keeper=`p-a${a}-keeper`, scribe=`p-a${a}-scribe`, seal=`i-a${a}-seal`, box=`i-a${a}-box`;
    const title=`${place}信使`;
    const s: Source={sourceId:`s${String(t).padStart(3,'0')}`,turnId:t,gameMinute:(t-1)*72,gameTime:`第${Math.ceil(t/20)}日`,participants:['p-player',lead,keeper,scribe],location:place,items:[seal,box],narrative:'',eventIds:[`e${String(t).padStart(3,'0')}-dispatch`],tags:[],facts:[],historicalSources:[],authorizedNpcIds:[lead,keeper,scribe]};
    const link=(...beats:number[])=>{s.historicalSources.push(...beats.map(beat=>storySource(a,beat)));};
    switch(b) {
      case 2:s.narrative=`旅人在${place}初次认识${title}（${names[a]}）。信使赠给旅人${place}潮印，嘱咐保留封签。`;s.tags=['初遇','赠送','来源'];putState(s,seal,'来源',`${title}赠给旅人`);putState(s,lead,'初遇',place);break;
      case 3:s.narrative=`旅人查看${place}潮印，发现底部${marks[a]}刻痕，拓片暂不能解释。`;s.tags=['伏笔','刻痕'];putState(s,seal,'刻痕',marks[a]!,'narrative-detail');break;
      case 5:s.narrative=`旅人与${title}约定在第${Math.ceil(storyTurn(a,85)/20)}日于${place}送回秘匣；对方承诺届时核验旧档。`;s.tags=['约定'];putState(s,box,'约定',`在${place}送回秘匣并核验旧档`);break;
      case 8:s.narrative=`${place}秘匣交付旅人保管，交接双方签认，不改变其他据点的同类匣子。`;s.tags=['归属','交接'];putState(s,box,'归属','旅人');break;
      case 12:s.narrative=`${title}因旅人遗失口令而戒备，关系登记为戒备。`;s.tags=['关系'];putState(s,lead,'关系','戒备');break;
      case 15:s.narrative=`${title}与旅人打开${place}潮印的封签，纸上留有${marks[a]}形水纹，散发温杉气味。此感官细节没有规则事件或事实标签。`;s.eventIds=[];s.tags=['原文','气味','封签'];s.authorizedNpcIds=[lead];break;
      case 16:s.narrative=`${place}库守私下声称秘匣暗格在西侧第${a+2}枚铆钉后，未实地证实。信使与书记既不在场，也没有转述授权。`;s.participants=['p-player',keeper];s.eventIds=[];s.tags=['秘密'];s.authorizedNpcIds=[keeper];putState(s,box,'秘密',`西侧第${a+2}枚铆钉后`,'character-claim');break;
      case 20:s.narrative=`${place}书记传闻${title}是逃亡盐商，自称归雁客，却没有证据。旅人不将这一说法视为已确认身份。`;s.tags=['传闻','身份'];s.eventIds=[];putState(s,lead,'身份传闻','逃亡盐商','character-claim');break;
      case 25:s.narrative=`旅人将${place}秘匣转交${place}库守托管，签认只证明持有权；书记并不知道交接。`;s.tags=['归属','转交'];s.authorizedNpcIds=[lead,keeper];link(8);putState(s,box,'归属',`${place}库守`);break;
      case 35:s.narrative=`${title}正式更名为${place}引潮人，稳定身份凭证保持不变；更名不确认先前盐商传闻。`;s.tags=['更名','身份'];putState(s,lead,'更名',`${place}引潮人`);link(20);break;
      case 40:s.narrative=`旅人追回${place}旧账，${title}由戒备改为信任。`;s.tags=['关系'];putState(s,lead,'关系','信任');link(12);break;
      case 55:s.narrative=`${place}库守将秘匣转交${place}书记，旅人与书记核验签认，信使未获知。`;s.tags=['归属','转交'];s.authorizedNpcIds=[keeper,scribe];link(25);putState(s,box,'归属',`${place}书记`);break;
      case 60:s.narrative=`独立旧档确认${title}是护潮员，而非逃亡盐商；更名记录与旧证件属于同一稳定人物。书记撤回旧传闻，旧说法仍作为当年的未证实记录保存。`;s.tags=['身份','证实','澄清'];putState(s,lead,'真实身份','护潮员');link(20,35);break;
      case 70:s.narrative=`${title}认为旅人泄露旧账而疏远；库守对同一旧账事件称赞旅人。关系变化与主观说法分开登记。`;s.tags=['关系','说法'];putState(s,lead,'关系','疏远');putState(s,keeper,'主观看法','称赞旅人','character-claim');link(40);break;
      case 80:s.narrative=`${place}书记把秘匣交还旅人，原托管链终止；信使只知道此次归还，不知道第55轮的交接。`;s.tags=['归属','归还'];putState(s,box,'归属','旅人');link(55);break;
      case 85:s.narrative=`旅人在${place}送回秘匣，正式兑现第5轮的约定，旧档核验完成。`;s.tags=['约定','兑现'];putState(s,box,'约定','已兑现');link(5);break;
      case 90:{const next=(a+1)%10;s.narrative=`${place}潮印的${marks[a]}刻痕与${places[next]}潮印的${marks[next]}刻痕在旧河图交织，证明它们分别指向同一报潮线路的两端，不是同一件印信。`;s.tags=['伏笔','揭晓','刻痕'];s.items.push(`i-a${next}-seal`);s.historicalSources=[storySource(a,3),storySource(next,3)];putState(s,seal,'刻痕含义','报潮线路的两端');break;}
      case 95:s.narrative=`误会查清，${title}与旅人重建信任；以前的戒备、信任和疏远分别保留对应时段。`;s.tags=['关系'];putState(s,lead,'关系','信任');link(12,40,70);break;
      default:{const stage=b<25?'采样':b<55?'校核':b<80?'调运':'归档';const index=b%5;s.narrative=`${place}第${b}轮${stage}：${['核验潮尺','修复驿灯','复测桩位','调拨船材','清点凭证'][index]}，旅人与${[title,`${place}库守`,`${place}书记`][b%3]}登记批次${a+1}-${b}，完成${b}处验点，剩余${100-b}处。原记录不可回填为更早完成；同地第${b-1}轮是另一事件。`;s.tags=[stage,'工程'];putState(s,`l-a${a}`,'工程进度',`${b}处完成/${100-b}处待核`);break;}
    }
    turns.push(s);
  }
  return {schemaVersion:1,synthetic:true,scenario:'十地交错护潮档案：完全虚构、非 Canon',entities,turns,aliasSince,
    scale:{meaningfulNodes:1000,majorNodes:critical.size*10,characters:30,items:20,longThreads:20,relationshipChains:10}};
}
