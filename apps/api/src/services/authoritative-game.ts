import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MemoryModeSchema, SaveEnvelopeSchema, type SaveEnvelope, type TurnReceipt } from '@jiuxiao/contracts';
import { canonicalJson } from '@jiuxiao/domain';
import type { prepareTurnRuntime } from './turn-runtime.js';
import {approvedPlayerActions,approvedLabel} from './approved-player-actions.js';
import { createP1SaveMemoryPolicy } from './p1-memory-policy.js';
import { PROLOGUE_V1_CONTENT_PACK } from '@jiuxiao/content/p1-review-candidate';
import { P1_REVIEW_RULE_APPROVAL } from './p1-review-rule-approval.js';
import { isCharacterProfile, type CharacterProfile } from './character-profile.js';
export type GameRepository={latestReceiptForOwner?(owner:string,id:string):Promise<TurnReceipt|null>;getForOwner(owner:string,id:string):Promise<SaveEnvelope|null>;getProfileForOwner?(owner:string,id:string):Promise<CharacterProfile|null>;createForOwner(owner:string,save:SaveEnvelope,profile?:CharacterProfile):Promise<boolean>};

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
  const save=SaveEnvelopeSchema.parse(stored);
  const latestReceipt=await this.repository.latestReceiptForOwner?.(ownerId,saveId)??null;
  if(latestReceipt && latestReceipt.resultingRevision>save.revision)throw new Error('GAME_CHANGED_DURING_READ');
  const opening = save.ruleVersion===P1_REVIEW_RULE_APPROVAL.ruleVersion && save.canonVersion===P1_REVIEW_RULE_APPROVAL.canonVersion
   ? (PROLOGUE_V1_CONTENT_PACK.entries.find(entry=>entry.id==='text_prologue_opening')?.content as Readonly<Record<string,unknown>>|undefined)?.paragraphs : undefined;
  const characterProfile = await this.repository.getProfileForOwner?.(ownerId,saveId);
  return {status:'ready',save,...(characterProfile ? {characterProfile} : {}),latestReceipt,scene:{location:approvedLabel(save.state.locationId)??'当前场景',inventory:Array.isArray(save.state.facts.inventory)?save.state.facts.inventory.flatMap(item=>{if(!item||typeof item!=='object'||!('itemId' in item)||typeof item.itemId!=='string'||!('quantity' in item)||typeof item.quantity!=='number')return [];const name=approvedLabel(item.itemId);return name?[{name,quantity:item.quantity}]:[];}):[]},opening:Array.isArray(opening)?opening.filter((line):line is string=>typeof line==='string'):[]} as const;
 }
 async actionSuggestions(ownerId:string,saveId:string){
  if(!this.runtime?.actionSuggestions)return {status:'rules_not_ready'} as const;
  const stored=await this.repository.getForOwner(ownerId,saveId);
  if(!stored)return {status:'not_found'} as const;
  const save=SaveEnvelopeSchema.parse(stored);
  if(save.state.facts.archiveKind==='local-untrusted-v1')return {status:'not_found'} as const;
  const additions=approvedPlayerActions(save);
  const supplied=this.runtime.actionSuggestions(save);
  return {status:'ready',revision:save.revision,actions:[...additions,...supplied.filter(action=>action.kind!=='talk'||!additions.some(item=>item.kind==='talk'))]} as const;
 }
 async create(ownerId:string,key:string,choices:Record<string,unknown>){
  if(!this.runtime)return {status:'rules_not_ready'} as const;
  const { characterProfile, ...ruleChoices } = choices;
  if (characterProfile !== undefined && !isCharacterProfile(characterProfile)) return {status:'invalid_character_profile'} as const;
  if (characterProfile && !this.repository.getProfileForOwner) throw new Error('PROFILE_STORAGE_UNAVAILABLE');
  const modeInput=choices.memoryMode??'continue';
  const memoryMode=MemoryModeSchema.safeParse(modeInput);
  if(!memoryMode.success)return {status:'invalid_memory_mode'} as const;
  const hash=createHash('sha256').update(canonicalJson(choices)).digest('hex');
  const saveId='game-'+createHash('sha256').update(`${ownerId}\0${key}`).digest('hex');
  const existing=await this.repository.getForOwner(ownerId,saveId);
  const replay = async (save: SaveEnvelope | null) => {
    if (!save || save.state.facts.creationRequestHash !== hash) return {status:'conflict'} as const;
    const persisted = await this.repository.getProfileForOwner?.(ownerId,saveId);
    return {status:'created',save,...(persisted ? {characterProfile:persisted} : {}),duplicate:true} as const;
  };
  if(existing)return replay(existing);
  const canonArtifactHash=await computeCanonRuntimeArtifactHash();
  const state=this.runtime.initialState({ownerId,saveId,choices:ruleChoices});
  if(state.facts.archiveKind==='local-untrusted-v1')throw new Error('INVALID_AUTHORITATIVE_INITIAL_STATE');
  const memoryPolicy=createP1SaveMemoryPolicy(memoryMode.data,0,this.runtime.rules.memoryPolicyVersion);
  const save=SaveEnvelopeSchema.parse({schemaVersion:3,saveId,revision:0,ruleVersion:this.runtime.rules.ruleVersion,canonVersion:this.runtime.rules.canonVersion,canonArtifactHash,memoryPolicyVersion:this.runtime.rules.memoryPolicyVersion,memoryMode:memoryMode.data,memoryPolicy,branchId:'root',parentBranchId:null,forkRevision:0,createdPolicyVersion:memoryPolicy.policyVersion,sourceMigrationId:null,state:{...state,facts:{...state.facts,creationRequestHash:hash}}});
  if(await this.repository.createForOwner(ownerId,save,characterProfile))return {status:'created',save,...(characterProfile ? {characterProfile} : {}),duplicate:false} as const;
  const winner=await this.repository.getForOwner(ownerId,saveId);
  return replay(winner);
 }
}
