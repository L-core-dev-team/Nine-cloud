import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorldStateSchema, type WorldState } from '@jiuxiao/contracts';
import { RuleResolver, type ActionRuleProvider } from './rule-resolver.js';
import type { ServerTurnRules } from './server-turn.js';
import { NarrativeScheduler, type RoleSlot, type NarrativeRole } from './narrative-scheduler.js';

/** Only a host-installed, author-reviewed local module may supply authoritative rules. */
export type TurnPlugin = {
 provider: ActionRuleProvider;
 grantsForEvent: ServerTurnRules['grantsForEvent'];
 policyForNpc: ServerTurnRules['policyForNpc'];
 initialState: (input: {ownerId:string;saveId:string;choices:Readonly<Record<string,unknown>>}) => WorldState;
};
export function prepareTurnRuntime(plugin: TurnPlugin, slots:Partial<Record<NarrativeRole,RoleSlot>>={},budget=32768) {
 if (!plugin || typeof plugin.provider?.resolve!=='function' || typeof plugin.grantsForEvent!=='function' || typeof plugin.policyForNpc!=='function' || typeof plugin.initialState!=='function') throw new Error('INVALID_TURN_PLUGIN');
 const rules=new RuleResolver(plugin.provider,plugin.grantsForEvent,plugin.policyForNpc);
 const scheduler=new NarrativeScheduler(slots,budget,trace=>console.info(JSON.stringify({event:'narrative_job',...trace})));
 return {rules,narrator:scheduler.narrator(),initialState:(input:Parameters<TurnPlugin['initialState']>[0])=>WorldStateSchema.parse(plugin.initialState(structuredClone(input)))};
}
export async function loadTurnPlugin(path:string|undefined,load:(url:string)=>Promise<unknown>=url=>import(url)):Promise<TurnPlugin|undefined>{
 if (!path) return undefined;
 // A request, URL, model output or environment-provided JavaScript string is never evaluated.
 if (!isAbsolute(path) || /[\r\n\0]/.test(path) || !/\.(mjs|js)$/.test(path)) throw new Error('TURN_PLUGIN_LOCAL_PATH_REQUIRED');
 const module=await load(pathToFileURL(path).href);
 if (!module || typeof module!=='object' || !('default' in module)) throw new Error('INVALID_TURN_PLUGIN');
 const plugin=(module as {default:TurnPlugin}).default;
 prepareTurnRuntime(plugin);
 return plugin;
}
