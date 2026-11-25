import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import plugin from '../../../apps/api/dist/services/p1-prologue-plugin.js';
import { AuthoritativeGameService } from '../../../apps/api/dist/services/authoritative-game.js';
import { publicPrologueReceipt } from '../../../apps/api/dist/services/prologue-public-receipt.js';
import { prepareTurn } from '../../../packages/domain/dist/event-log.js';
import { applyStateDelta } from '../../../packages/domain/dist/state-delta.js';

export const cue = '领头的灰羽鸦贴着石沿向内一折，后面几只还没跟上。外沿空了，头一只的翅尖却还够得着那里。';
export const choices = [
  ['hold','守住作业位','等领鸦越过，花两刻清障，免受擦伤。'],
  ['gap','抢外沿空当','从外沿进，一刻能清障，会留下擦伤，也更耗灵力耐力。'],
  ['wait','等这阵过去','留在原地等一刻，这次空当会消失。'],
  ['leave','退回渡岸','让出作业位，退回岸边。'],
];
const afterActions = [
  ['rest','吐纳一刻','cultivate',{techniqueId:'tech_breath_basic',minutes:1}],
  ['look','观察渡船','observe',{targetId:'obj_ferry',method:'scan'}],
  ['shore','返回芦花渡','move',{destinationId:'loc_luhuadu'}],
  ['claim','领取通渡奖励','quest',{questId:'quest_first_clearance',choiceId:'claim_reward'}],
];
export const actions = phase => (phase==='pending'?choices:afterActions).map(([id,label])=>({id,kind:'free_text',label,text:label}));
export function identity(save,key=randomUUID()) {
  return {saveId:save.saveId,actorId:save.state.playerId,expectedRevision:save.revision,branchId:'root',idempotencyKey:key};
}
export async function start(owner) {
  const factory = new AuthoritativeGameService({getForOwner:async()=>null,createForOwner:async()=>true},plugin);
  let {save} = await factory.create(owner,randomUUID(),{});
  const route = [['move',{destinationId:'subloc_ferry_berm'}],['cultivate',{techniqueId:'tech_breath_basic',minutes:2}],
    ...Array.from({length:5},()=>['observe',{targetId:'obj_ferry',method:'scan'}])];
  const setup=[];
  for(const [kind,payload] of route){
    const step=await prepareTurn({save,intent:{...identity(save),kind,payload},...plugin.rules});
    assert.equal(step.status,'prepared'); setup.push(step.receipt);save=step.save;
  }
  assert.equal(save.state.facts.stamina,40);assert.equal(save.state.facts.obstacleState,'blocked');
  return {save,setup};
}
function change(key,oldValue,newValue){
  return {key,before:{present:true,value:oldValue},after:{present:true,value:newValue}};
}
export function resolveChoice(raw,phase){
  const text=raw.trim().replace(/[。！]$/u,'');
  return (phase==='pending'?choices:afterActions).find(([,label])=>label===text);
}
export async function resolveTurn(save,intent,phase,priorReceipt){
  const selected=resolveChoice(intent.payload.text,phase);
  // prepareTurn checks the original, unmodified player request fingerprint before deciding.
  return prepareTurn({save,intent,priorReceipt,decide:(original,current)=>{
    if(phase!=='pending'){
      if(!selected)return plugin.rules.decide(original,current);
      return plugin.rules.decide({...original,kind:selected[2],payload:selected[3]},current);
    }
    if(!selected)throw Error('CHOOSE_EXPLICITLY');
    const [action]=selected,f=current.state.facts;
    if((action==='hold'||action==='gap')&&(f.stamina<25||f.spiritStamina<(action==='gap'?30:25)))throw Error('RESOURCE_LOW');
    const retreat=action==='leave'||action==='wait';
    const result=plugin.rules.decide({...original,kind:retreat?'move':'combat',payload:retreat?{destinationId:'loc_luhuadu'}:{targetId:'npc_shuiyuya'}},current);
    assert.equal(result.status,'accepted');
    const event=result.events[0];
    if(action==='wait'){
      event.type='greywing.waited';
      event.payload={stateDelta:{timeChange:15,locationChange:null,factChanges:[change('gameMinute',f.gameMinute,f.gameMinute+15)]}};
    }else if(action==='gap'){
      assert.equal(event.payload.outcome,'clear');
      event.type='greywing.crossed';
      const delta=event.payload.stateDelta;
      const values={gameMinute:f.gameMinute+15,stamina:f.stamina-20,spiritStamina:f.spiritStamina-30};
      for(const [key,value] of Object.entries(values)){
        const row=delta.factChanges.find(x=>x.key===key);assert(row);row.after.value=value;
      }
      delta.timeChange=15;
      delta.factChanges.push(change('injuryFlags',f.injuryFlags,[...new Set([...f.injuryFlags,'crow_scratch'])]));
      event.payload={...event.payload,outcome:'clear_wounded',kecCount:1,stateDelta:delta};
    }
    return result;
  },reduce:(state,event)=>event.type.startsWith('greywing.')?applyStateDelta(state,event.payload.stateDelta):plugin.rules.reduce(state,event)});
}
const beats={
  hold:'你守在作业位。等领鸦从里侧越过，你才动手清开渡口；没有新伤。',
  gap:'你从外沿抢进。领鸦折回，爪尖在你身上带出一道擦伤；渡口清开了。',
  wait:'你留在原处。后面几只鸦相继落定，外沿那道空当合上了。',
  leave:'你让开作业位，沿原路退回芦花渡岸边。渡口的障碍仍在。'
};
export function passage(before,step,phase,action,priorText,encounterMinutes){
  const f=step.save.state.facts;
  const selected=resolveChoice(action,phase);
  const response=phase==='pending'?beats[selected[0]]:plugin.narrativeFallback(step.receipt);
  const minutes=f.gameMinute-before.state.facts.gameMinute;
  const record={玩家行动:action,本轮已提交:response,阶段分钟:minutes,交手累计分钟:phase==='pending'?minutes:encounterMinutes,
    现场: f.currentSublocationId==='subloc_ferry_berm'?'芦花渡作业位':'芦花渡岸边',体力:f.stamina,灵力耐力:f.spiritStamina,
    鸦爪擦伤:f.injuryFlags.includes('crow_scratch'),领取奖励:f.questState.rewardClaimed};
  if(phase==='pending')record.眼前征兆=cue;
  else if(step.receipt.decision.events[0].type==='cultivate.attempted')record.吐纳结果=step.receipt.decision.events[0].payload.result==='fatigue'?'疲劳推进':'正常推进';
  // Keep the numeric audit record above. Only scene-relevant material goes to the narrator.
  const material=[record.现场+'。', '你选择'+action+'。'];
  if(phase==='pending'){
    material.push(cue,response);
    if(selected[0]==='hold')material.push('可从落脚处写：你守住里侧。领鸦越过时你往空出的石沿迈一步，后面想落在路中的几只只得掠开；原先封着的那段石沿能走人了。');
    if(selected[0]==='gap')material.push('可从落脚处写：你先占外沿，被回折的鸦爪擦中也没有让开。后队要落下时那里已站着人，只能从旁掠走，路中间便露出来了。');
  }else if(record.吐纳结果){
    const ticks=step.receipt.decision.events[0].payload.attemptedKecCount;
    material.push(record.吐纳结果==='疲劳推进'?'这次吐纳到后来乏力，只能勉强推进。':'你稳住呼吸，修炼有了进展。','这一段吐纳实际经过 '+ticks+' 刻。');
    if(f.injuryFlags.includes('crow_scratch'))material.push('先前的爪痕还在。');
  }else if(step.receipt.decision.events.some(event=>event.type==='quest.reward_claimed')){
    const view=publicPrologueReceipt(step.receipt,step.save.state);
    const reward=view.本回合.find(row=>row.已领);
    material.push('你已取得'+reward.已领+' ×'+reward.数量+'。',...reward.新通路.map(([from,to])=>from+'通往'+to+'的路可以走了。'));
  }else material.push(response);
  const messages=[{role:'developer',content:'用第二人称，写玩家在渡口能看见、听见、做到的事。交手写到脚下哪一段路真正能走，再收住；后续从交手结束以后写起。动作细节可据所给空间展开，前文只是文脉。用正文讲经历，勿谈后台或盘点数值。不要添置物品、改变伤势或替玩家选下一步。'}];
  if(priorText)messages.push({role:'assistant',content:priorText});
  messages.push({role:'user',content:material.join('\n')});
  return {response,record,wire:{model:'gpt-6-luna',messages,reasoning_effort:'none',max_completion_tokens:512,service_tier:'default',stream:false,store:false}};
}
