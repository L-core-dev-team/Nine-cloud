import {ActionIntentSchema,type ActionIntent} from '@jiuxiao/contracts';
export function buildActionDraft(base:{saveId:string;actorId:string;expectedRevision:number;idempotencyKey:string},kind:ActionIntent['kind'],fields:{text:string;target:string;secondary:string;amount:number}):ActionIntent{
 const {text,target,secondary,amount}=fields;
 const payload=kind==='move'?{destinationId:target.trim()}:kind==='cultivate'?{techniqueId:target.trim(),minutes:amount}:kind==='acquire_item'?{itemId:target.trim(),quantity:amount}:kind==='use_item'?{itemId:target.trim(),...(secondary.trim()?{targetId:secondary.trim()}:{})}:kind==='talk'?{npcId:target.trim(),utterance:text.trim()}:kind==='combat'?{targetId:target.trim(),...(secondary.trim()?{techniqueId:secondary.trim()}:{})}:kind==='quest'?{questId:target.trim(),choiceId:secondary.trim()}:{text:text.trim()};
 return ActionIntentSchema.parse({...base,kind,payload});
}
