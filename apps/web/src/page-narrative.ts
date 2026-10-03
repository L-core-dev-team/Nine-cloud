import { NarrativeScheduler, narrativeRoles, type NarrativeRole, type RoleSlot,type RoleTrace } from '@jiuxiao/domain/narrative-scheduler';
import { providerAdapter, type ProviderConfig } from '@jiuxiao/domain/provider-narrative';
import type { TurnReceipt } from '@jiuxiao/contracts';

type AllowedRole = {enabled:boolean;adapter:ProviderConfig['protocol'];baseUrl:string;model:string;timeoutSeconds:number};
let armed: {roles:Partial<Record<NarrativeRole,AllowedRole>>;keys:Partial<Record<NarrativeRole,string>>;log?: (row:RoleTrace,elapsedMs:number)=>void}|undefined;
/** Explicit Save arms only approved fields; secrets never enter storage, cloud or an export. */
export function armPageNarrative(roles:Partial<Record<NarrativeRole,AllowedRole>>,keys:Partial<Record<NarrativeRole,string>>,log?:(row:RoleTrace,elapsedMs:number)=>void) {
 const allowed:Partial<Record<NarrativeRole,AllowedRole>>={};
 for(const role of narrativeRoles){const value=roles[role];if(value)allowed[role]={enabled:value.enabled,adapter:value.adapter,baseUrl:value.baseUrl,model:value.model,timeoutSeconds:value.timeoutSeconds};}
 armed={roles:allowed,keys:{...keys},...(log?{log}:{})};
}
export function pageNarrator(fetcher:typeof fetch=fetch):((receipt:TurnReceipt,signal:AbortSignal)=>Promise<string>)|undefined {
 const config=armed;
 if(!config?.roles.story?.enabled||!config.roles.story.model.trim())return undefined;
 return async(receipt,signal)=>{
  const slots:Partial<Record<NarrativeRole,RoleSlot>>={};const started:Partial<Record<NarrativeRole,number>>={};
  for(const role of narrativeRoles){const value=config.roles[role];if(!value?.enabled)continue;
   const keyEnv=`NARRATIVE_KEY_${role.toUpperCase()}`;
   // Deferred sampling/stream/retry/output UI drafts are intentionally not consumed.
   slots[role]={enabled:true,timeoutMs:Math.max(5000,Math.min(120000,value.timeoutSeconds*1000)),maxOutputTokens:4096,retries:0,
    primary:async(input,signal)=>{started[role]??=Date.now();return providerAdapter({protocol:value.adapter,baseUrl:value.baseUrl,model:value.model.trim(),keyEnv},{[keyEnv]:config.keys[role]?.trim()},fetcher)(input,signal);}};
  }
  return (await new NarrativeScheduler(slots,32768,row=>{if(row.attempts)config.log?.(row,Math.max(0,Date.now()-(started[row.role]??Date.now())));}).run(receipt,signal)).text;
 };
}
