import { PrologueV1FactsSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import { PROLOGUE_V1_CONTENT_PACK, PROLOGUE_V1_RULEBOOK_CANDIDATE as book } from '@jiuxiao/content/p1-review-candidate';
import { P1_REVIEW_RULE_APPROVAL as approval } from './p1-review-rule-approval.js';
const entries = new Map(PROLOGUE_V1_CONTENT_PACK.entries.map(entry=>[entry.id,entry]));
export function approvedLabel(id:string):string|null {
 const value=(entries.get(id)?.content as Readonly<Record<string,unknown>>|undefined)?.name;
 return typeof value==='string'?value:id==='obj_ferry_gear'?'舟具':null;
}
export function approvedPlayerActions(save:SaveEnvelope) {
 if(save.ruleVersion!==approval.ruleVersion||save.canonVersion!==approval.canonVersion)return [];
 const {creationRequestHash:_hash,...raw}=save.state.facts;
 const parsed=PrologueV1FactsSchema.safeParse(raw);if(!parsed.success)return [];
 const facts=parsed.data;
 const actions:{id:string;kind:string;label:string;text:string;intent?:{kind:'acquire_item'|'quest'|'move';payload:Record<string,unknown>}}[]=[];
 for(const npc of book.npcs.filter(npc=>npc.locationId===save.state.locationId&&facts.npcPresence.includes(npc.npcId))) {
  for(const topic of npc.topics) {
   const utterance=topic.utterances[0];const name=approvedLabel(npc.npcId);
   if(name&&utterance)actions.push({id:`talk:${npc.npcId}:${topic.topicTag}`,kind:'talk',label:`问${name}：${utterance}`,text:`对${name}说：${utterance}`});
  }
 }
 for(const target of book.combatTargets.filter(target=>target.locationId===save.state.locationId&&facts.npcPresence.includes(target.targetId)&&facts.currentSublocationId!==null&&target.accessibleFromSublocationIds.includes(facts.currentSublocationId as 'subloc_ferry_berm'|'subloc_reef_ledge'))) {
  const name=approvedLabel(target.targetId);if(name)actions.push({id:`combat:${target.targetId}`,kind:'combat',label:`赶走${name}`,text:`赶走${name}`});
 }
 for(const source of book.acquisitionSources.filter(source=>source.locationId===save.state.locationId&&!facts.collectedSources.includes(source.sourceId))) {
  const name=approvedLabel(source.itemId);if(name)actions.push({id:`acquire:${source.sourceId}`,kind:'acquire_item',label:`拾取${name}`,text:`拾取${name}`,intent:{kind:'acquire_item',payload:{itemId:source.itemId,quantity:source.quantity}}});
 }
 if(facts.currentSublocationId) {
  const name=approvedLabel(save.state.locationId);if(name)actions.push({id:'return-to-location',kind:'move',label:`返回${name}`,text:`返回${name}`,intent:{kind:'move',payload:{destinationId:save.state.locationId}}});
 }
 if(facts.questState.status==='completed'&&!facts.questState.rewardClaimed)actions.unshift({id:'quest:claim',kind:'quest',label:'领取任务奖励',text:'领取任务奖励',intent:{kind:'quest',payload:{questId:book.quest.questId,choiceId:'claim_reward'}}});
 return actions;
}
