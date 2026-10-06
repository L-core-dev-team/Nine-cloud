import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MemoryModeSchema, SaveEnvelopeSchema, type SaveEnvelope } from '@jiuxiao/contracts';
import { canonicalJson } from '@jiuxiao/domain';
import type { prepareTurnRuntime } from './turn-runtime.js';
import { createP1SaveMemoryPolicy } from './p1-memory-policy.js';
export type GameRepository={getForOwner(owner:string,id:string):Promise<SaveEnvelope|null>;createForOwner(owner:string,save:SaveEnvelope):Promise<boolean>};

/** Hashes the exact source artifact bytes used to identify this save's Canon input. */
export async function computeCanonRuntimeArtifactHash(): Promise<`sha256:${string}`> {
 const bytes = await readFile(new URL('../../../../packages/content/src/canon-runtime.json', import.meta.url));
 return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export class AuthoritativeGameService {
 constructor(private readonly repository:GameRepository,private readonly runtime?:ReturnType<typeof prepareTurnRuntime>){}
 async read(ownerId:string,saveId:string){
  const stored=await this.repository.getForOwner(ownerId,saveId);
  if(!stored||stored.state.facts.archiveKind==='local-untrusted-v1')return {status:'not_found'} as const;
  return {status:'ready',save:SaveEnvelopeSchema.parse(stored)} as const;
 }
 async actionSuggestions(ownerId:string,saveId:string){
  if(!this.runtime?.actionSuggestions)return {status:'rules_not_ready'} as const;
  const stored=await this.repository.getForOwner(ownerId,saveId);
  if(!stored)return {status:'not_found'} as const;
  const save=SaveEnvelopeSchema.parse(stored);
  if(save.state.facts.archiveKind==='local-untrusted-v1')return {status:'not_found'} as const;
  return {status:'ready',revision:save.revision,actions:this.runtime.actionSuggestions(save)} as const;
 }
 async create(ownerId:string,key:string,choices:Record<string,unknown>){
  if(!this.runtime)return {status:'rules_not_ready'} as const;
  const modeInput=choices.memoryMode??'continue';
  const memoryMode=MemoryModeSchema.safeParse(modeInput);
  if(!memoryMode.success)return {status:'invalid_memory_mode'} as const;
  const hash=createHash('sha256').update(canonicalJson(choices)).digest('hex');
  const saveId='game-'+createHash('sha256').update(`${ownerId}\0${key}`).digest('hex');
  const existing=await this.repository.getForOwner(ownerId,saveId);
  if(existing)return existing.state.facts.creationRequestHash===hash?{status:'created',save:existing,duplicate:true} as const:{status:'conflict'} as const;
  const canonArtifactHash=await computeCanonRuntimeArtifactHash();
  const state=this.runtime.initialState({ownerId,saveId,choices});
  if(state.facts.archiveKind==='local-untrusted-v1')throw new Error('INVALID_AUTHORITATIVE_INITIAL_STATE');
  const memoryPolicy=createP1SaveMemoryPolicy(memoryMode.data,0,this.runtime.rules.memoryPolicyVersion);
  const save=SaveEnvelopeSchema.parse({schemaVersion:3,saveId,revision:0,ruleVersion:this.runtime.rules.ruleVersion,canonVersion:this.runtime.rules.canonVersion,canonArtifactHash,memoryPolicyVersion:this.runtime.rules.memoryPolicyVersion,memoryMode:memoryMode.data,memoryPolicy,branchId:'root',parentBranchId:null,forkRevision:0,createdPolicyVersion:memoryPolicy.policyVersion,sourceMigrationId:null,state:{...state,facts:{...state.facts,creationRequestHash:hash}}});
  if(await this.repository.createForOwner(ownerId,save))return {status:'created',save,duplicate:false} as const;
  const winner=await this.repository.getForOwner(ownerId,saveId);
  return winner?.state.facts.creationRequestHash===hash?{status:'created',save:winner,duplicate:true} as const:{status:'conflict'} as const;
 }
}
