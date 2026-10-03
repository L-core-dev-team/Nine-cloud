import { readFile } from 'node:fs/promises';
import { providerAdapter,type SlotConfig } from '@jiuxiao/domain/provider-narrative';
import { narrativeRoles,type NarrativeRole,type RoleSlot } from './narrative-scheduler.js';
export {providerAdapter} from '@jiuxiao/domain/provider-narrative';
export async function loadNarrativeSlots(path:string|undefined,env:NodeJS.ProcessEnv):Promise<Partial<Record<NarrativeRole,RoleSlot>>>{
 if(!path)return {};
 const bytes=await readFile(path);if(bytes.length>16384)throw new Error('NARRATIVE_CONFIG_TOO_LARGE');
 const config=JSON.parse(bytes.toString('utf8')) as Record<string,SlotConfig>;
 if(!config||Array.isArray(config)||Object.keys(config).some(k=>!narrativeRoles.includes(k as NarrativeRole)))throw new Error('INVALID_NARRATIVE_ROLE');
 const slots:Partial<Record<NarrativeRole,RoleSlot>>={};
 for(const role of narrativeRoles){const raw=config[role];if(!raw)continue;if(typeof raw.enabled!=='boolean')throw new Error('INVALID_NARRATIVE_SLOT');if(!raw.enabled)continue;
  if((raw.required!==undefined&&typeof raw.required!=='boolean')||(raw.dependencies!==undefined&&(!Array.isArray(raw.dependencies)||raw.dependencies.some(d=>!narrativeRoles.includes(d)))))throw new Error('INVALID_NARRATIVE_SLOT');
  slots[role]={enabled:true,...(raw.required===undefined?{}:{required:raw.required}),...(raw.dependencies===undefined?{}:{dependencies:raw.dependencies}),timeoutMs:raw.timeoutMs,maxOutputTokens:raw.maxOutputTokens,retries:raw.retries,primary:providerAdapter(raw.primary,env),...(raw.fallback?{fallback:providerAdapter(raw.fallback,env)}:{})};
 }
 return slots;
}
