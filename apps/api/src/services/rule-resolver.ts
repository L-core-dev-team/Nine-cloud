import { createHash } from 'node:crypto';
import { ActionIntentSchema, StateDeltaSchema, WorldStateSchema, type ActionIntent, type SaveEnvelope, type StateDelta, type Decision, type DomainEvent } from '@jiuxiao/contracts';
import { applyStateDelta, canonicalJson } from '@jiuxiao/domain';
import type { ServerTurnRules } from './server-turn.js';
export type RuleVersion = { ruleVersion:string; ActionRulesVersion:string; CombatRulesVersion:string; canonVersion:string; memoryPolicyVersion:string };
export type RuleOutcome = {status:'accepted';delta:StateDelta}|{status:'rejected';code:string;message:string}|{status:'clarify';question:string};
/** Trusted author implementation; it is never read from client payloads or model responses. */
export interface ActionRuleProvider { readonly version:RuleVersion; resolve(intent:ActionIntent, snapshot:Readonly<SaveEnvelope>):RuleOutcome }
export class RuleResolver implements ServerTurnRules {
 private readonly version:Readonly<RuleVersion>;
 readonly ruleVersion:string; readonly canonVersion:string; readonly memoryPolicyVersion:string;
 constructor(private readonly provider:ActionRuleProvider, readonly grantsForEvent:ServerTurnRules['grantsForEvent'], readonly policyForNpc:ServerTurnRules['policyForNpc']){
  for(const key of ['ruleVersion','ActionRulesVersion','CombatRulesVersion','canonVersion','memoryPolicyVersion'] as const){const value=provider.version[key];if(typeof value!=='string'||!value.trim()||value.length>200)throw new Error('RULE_VERSION_REQUIRED');}
  this.version=Object.freeze({...provider.version});
  this.ruleVersion=provider.version.ruleVersion;this.canonVersion=provider.version.canonVersion;this.memoryPolicyVersion=provider.version.memoryPolicyVersion;
 }
 decide(rawIntent:ActionIntent, save:SaveEnvelope):Decision {
  const intent=ActionIntentSchema.parse(rawIntent);if(save.ruleVersion!==this.ruleVersion||save.canonVersion!==this.canonVersion||save.memoryPolicyVersion!==this.memoryPolicyVersion)throw new Error('RULE_VERSION_MISMATCH');
  const result=this.provider.resolve(structuredClone(intent),structuredClone(save));
  if(result.status==='rejected')return {...result,revision:save.revision};
  if(result.status==='clarify')return {...result,revision:save.revision};
  const delta=StateDeltaSchema.parse(result.delta), before=WorldStateSchema.parse(save.state), after=applyStateDelta(before,delta);
  const bytes=hash(`${save.saveId}\0${intent.idempotencyKey}`).slice(0,32).split('');bytes[12]='8';bytes[16]='8';const hex=bytes.join('');const eventId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  const event:DomainEvent={id:eventId,saveId:save.saveId,branchId:intent.branchId,type:'RULE_STATE_DELTA_V1',beforeRevision:save.revision,afterRevision:save.revision+1,occurredAt:new Date().toISOString(),source:'RULES',ruleVersion:this.ruleVersion,
   payload:{turnId:intent.idempotencyKey,action:intent.kind,stateBefore:before,stateDelta:delta,stateAfter:after,stateBeforeHash:hash(before),stateAfterHash:hash(after),ActionRulesVersion:this.version.ActionRulesVersion,CombatRulesVersion:this.version.CombatRulesVersion,narrativeStatus:'not_requested'}};
  return {status:'accepted',outcome:'success',events:[event],nextRevision:save.revision+1};
 }
 reduce(state:Parameters<ServerTurnRules['reduce']>[0],event:DomainEvent){
  if(event.type!=='RULE_STATE_DELTA_V1'||event.ruleVersion!==this.ruleVersion||event.source!=='RULES')throw new Error('INVALID_RULE_EVENT');
  if(hash(state)!==event.payload.stateBeforeHash||hash(event.payload.stateBefore)!==event.payload.stateBeforeHash)throw new Error('EVENT_BEFORE_MISMATCH');
  const after=applyStateDelta(state,StateDeltaSchema.parse(event.payload.stateDelta));
  if(hash(after)!==event.payload.stateAfterHash||hash(event.payload.stateAfter)!==event.payload.stateAfterHash)throw new Error('EVENT_AFTER_MISMATCH');return after;
 }
}
function hash(value:unknown){return createHash('sha256').update(canonicalJson(value)).digest('hex');}
