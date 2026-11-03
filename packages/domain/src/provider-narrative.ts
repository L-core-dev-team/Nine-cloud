import type { NarrativeRole, RoleAdapter } from './narrative-scheduler.js';
import { createProviderTransport, type ProviderConfig } from './provider-protocol.js';
export { createProviderTransport } from './provider-protocol.js';
export type { ProviderConfig } from './provider-protocol.js';
export type SlotConfig={enabled:boolean;required?:boolean;dependencies?:NarrativeRole[];timeoutMs:number;maxOutputTokens:number;retries:number;primary:ProviderConfig;fallback?:ProviderConfig};
export function providerAdapter(config:ProviderConfig,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):RoleAdapter {
 const transport=createProviderTransport(config,env,fetcher);
 return async(input,signal)=>{
  const prompt=JSON.stringify({instruction:'只叙述已提交回执中的结果。npcMemories 是按 NPC 授权和存档记忆策略过滤后的观察，只能帮助对应 NPC 表达，不得改变回执中的事实、规则结果或玩家状态。npcUtterances 是绑定当前直接发言 NPC 的作者文本，逐字保留，不得转给其他 NPC。playerConditionLines 是规则投影允许呈现的玩家身体状态，只用于描述，不可推断原因或改变事实。没有被检索出的记忆不代表事件没有发生。候选文本仅是表达建议，不得新增权威状态或规则。',role:input.role,receipt:input.receipt,npcMemories:input.context.npcMemories,playerConditionLines:input.context.playerConditionLines??[],npcUtterances:input.context.npcUtterances??[],candidates:input.candidates});
  if(prompt.length>100_000)throw new Error('NARRATIVE_CONTEXT_TOO_LARGE');
  return transport({mode:'legacy',prompt,maxOutputTokens:input.maxOutputTokens},signal);
 };
}
