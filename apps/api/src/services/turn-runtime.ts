import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WorldStateSchema, type TurnReceipt, type WorldState } from '@jiuxiao/contracts';
import { RuleResolver, type ActionRuleProvider } from './rule-resolver.js';
import { AUTHOR_RULES_GATE } from './author-rules-gate.js';
import type { ServerTurnRules } from './server-turn.js';
import { NarrativeScheduler, type NarrativeContext, type RoleSlot, type NarrativeRole } from './narrative-scheduler.js';
import { P1_REVIEW_RULE_APPROVAL, type P1ReviewRuleApproval } from './p1-review-rule-approval.js';
import { loadP1NluRuntime, type P1NluRuntime } from './p1-nlu-runtime.js';

/** A review-only candidate must match the pinned author-approved digest. */
export type TurnPlugin = {
 reviewApproval?: P1ReviewRuleApproval;
 rules?: ServerTurnRules;
 provider?: ActionRuleProvider;
 grantsForEvent: ServerTurnRules['grantsForEvent'];
 policyForNpc: ServerTurnRules['policyForNpc'];
 initialState: (input: {ownerId:string;saveId:string;choices:Readonly<Record<string,unknown>>}) => WorldState;
 narrativeFallback?: (receipt: TurnReceipt, context: NarrativeContext) => string;
 resolveFreeText?: P1NluRuntime['resolveFreeText'];
 actionSuggestions?: P1NluRuntime['actionSuggestions'];
};
export function prepareTurnRuntime(plugin: TurnPlugin, slots:Partial<Record<NarrativeRole,RoleSlot>>={},budget=32768) {
 if (!plugin || typeof plugin.grantsForEvent!=='function' || typeof plugin.policyForNpc!=='function' || typeof plugin.initialState!=='function' || (plugin.narrativeFallback!==undefined&&typeof plugin.narrativeFallback!=='function') || (!!plugin.rules === !!plugin.provider)) throw new Error('INVALID_TURN_PLUGIN');
 const baseRules=plugin.rules ?? new RuleResolver(plugin.provider!,plugin.grantsForEvent,plugin.policyForNpc);
 if(typeof baseRules.decide!=='function'||typeof baseRules.reduce!=='function'||typeof baseRules.ruleVersion!=='string'||typeof baseRules.canonVersion!=='string'||typeof baseRules.memoryPolicyVersion!=='string')throw new Error('INVALID_TURN_PLUGIN_RULES');
 const rules:ServerTurnRules=plugin.resolveFreeText?{
  ruleVersion:baseRules.ruleVersion,
  canonVersion:baseRules.canonVersion,
  memoryPolicyVersion:baseRules.memoryPolicyVersion,
  grantsForEvent:baseRules.grantsForEvent,
  policyForNpc:baseRules.policyForNpc.bind(baseRules),
  decide(intent,save){return intent.kind==='free_text'
   ?plugin.resolveFreeText!(intent,save,baseRules.decide.bind(baseRules))
   :baseRules.decide(intent,save);},
  reduce:baseRules.reduce.bind(baseRules),
 }:baseRules;
 const scheduler=new NarrativeScheduler(slots,budget,trace=>console.info(JSON.stringify({event:'narrative_job',...trace})));
 return {rules,narrator:scheduler.narrator(),narrativeFallback:plugin.narrativeFallback,
  ...(plugin.actionSuggestions?{actionSuggestions:plugin.actionSuggestions}:{}),
  initialState:(input:Parameters<TurnPlugin['initialState']>[0])=>WorldStateSchema.parse(plugin.initialState(structuredClone(input)))};
}
export async function loadTurnPlugin(path:string|undefined,load:(url:string)=>Promise<unknown>=url=>import(url)):Promise<TurnPlugin|undefined>{
 if (!path) return undefined;
 // A request, URL, model output or environment-provided JavaScript string is never evaluated.
 if (!isAbsolute(path) || /[\r\n\0]/.test(path) || !/\.(mjs|js)$/.test(path)) throw new Error('TURN_PLUGIN_LOCAL_PATH_REQUIRED');
 const reviewPluginPath=resolve(fileURLToPath(new URL('./p1-prologue-plugin.js',import.meta.url)));
  if(resolve(path)===reviewPluginPath){
  // This exact candidate can only be loaded outside production. Production
  // continues to use the independent Canon/deployment gate below.
  if(process.env.NODE_ENV==='production')return undefined;
  await assertApprovedReviewPluginSource();
  const module=await load(pathToFileURL(path).href);
  if(!module||typeof module!=='object'||!('default' in module))throw new Error('INVALID_TURN_PLUGIN');
  const plugin=(module as {default:TurnPlugin}).default;
  if(!matchesApprovedReviewPlugin(plugin))throw new Error('P1_REVIEW_RULE_APPROVAL_MISMATCH');
  const reviewedPlugin:TurnPlugin={...plugin,...await loadP1NluRuntime()};
  prepareTurnRuntime(reviewedPlugin);
  return reviewedPlugin;
 }
 // A configured file is not evidence that production rules were approved.
 // Keep the normal runtime closed until its independent author gate is signed.
 const gate=AUTHOR_RULES_GATE;
 if(gate.status==='BLOCKED_BY_OWNER'||!gate.ActionRulesVersion||!gate.CombatRulesVersion)return undefined;
 const module=await load(pathToFileURL(path).href);
 if (!module || typeof module!=='object' || !('default' in module)) throw new Error('INVALID_TURN_PLUGIN');
 const plugin=(module as {default:TurnPlugin}).default;
 if(!plugin.provider||plugin.provider.version.ActionRulesVersion!==gate.ActionRulesVersion||plugin.provider.version.CombatRulesVersion!==gate.CombatRulesVersion)throw new Error('AUTHOR_RULES_VERSION_MISMATCH');
 prepareTurnRuntime(plugin);
 return plugin;
}

function matchesApprovedReviewPlugin(plugin:TurnPlugin):boolean{
 const approval=plugin?.reviewApproval;
 return !!plugin?.rules&&approval?.scope===P1_REVIEW_RULE_APPROVAL.scope
  &&approval.bundleSha256===P1_REVIEW_RULE_APPROVAL.bundleSha256
  &&approval.pluginSourceSha256===P1_REVIEW_RULE_APPROVAL.pluginSourceSha256
  &&approval.ruleVersion===P1_REVIEW_RULE_APPROVAL.ruleVersion
  &&approval.canonVersion===P1_REVIEW_RULE_APPROVAL.canonVersion
  &&approval.actionRulesVersion===P1_REVIEW_RULE_APPROVAL.actionRulesVersion
  &&approval.combatRulesVersion===P1_REVIEW_RULE_APPROVAL.combatRulesVersion
  &&approval.memoryPolicyVersion===P1_REVIEW_RULE_APPROVAL.memoryPolicyVersion
  &&plugin.rules.ruleVersion===P1_REVIEW_RULE_APPROVAL.ruleVersion
  &&plugin.rules.canonVersion===P1_REVIEW_RULE_APPROVAL.canonVersion
  &&plugin.rules.memoryPolicyVersion===P1_REVIEW_RULE_APPROVAL.memoryPolicyVersion;
}

async function assertApprovedReviewPluginSource():Promise<void>{
 const source=await readFile(new URL('../../src/services/p1-prologue-plugin.ts',import.meta.url),'utf8');
 const normalized=source.replace(/\r\n/g,'\n');
 const actual=`sha256:${createHash('sha256').update(normalized,'utf8').digest('hex')}`;
 if(actual!==P1_REVIEW_RULE_APPROVAL.pluginSourceSha256)throw new Error('P1_REVIEW_PLUGIN_SOURCE_MISMATCH');
}
