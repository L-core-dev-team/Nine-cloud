import { TurnReceiptSchema } from '@jiuxiao/contracts';
import type { GameCacheScope, ReadingTurn } from './cloud-game-cache';
import { CloudHttpError, cloudRequest } from './cloud-sync';

/** Server-published history is presentation only, never a state-recovery substitute. */
export async function readPublishedGameHistory(scope:GameCacheScope,signal:AbortSignal):Promise<ReadingTurn[]|null> {
  let result:Record<string,unknown>;
  try {result=await cloudRequest(`/api/games/${encodeURIComponent(scope.saveId)}/presentations`,'GET',undefined,scope.ownerId,signal);}
  catch(error){if(error instanceof CloudHttpError&&error.status===404)return null;throw error;}
  if(!Array.isArray(result.items)||result.items.length>10)throw Error('INVALID_PUBLICATION_HISTORY');
  const rows:ReadingTurn[]=[];
  for(const raw of result.items){
    if(!raw||typeof raw!=='object')throw Error('INVALID_PUBLICATION_HISTORY');
    const receipt=TurnReceiptSchema.parse(raw.receipt);
    if(receipt.saveId!==scope.saveId||receipt.decision.status!=='accepted')throw Error('INVALID_PUBLICATION_SCOPE');
    const p=raw.presentation;
    if(!p||p.settlement!=='accepted')throw Error('INVALID_PUBLICATION_HISTORY');
    let text:string;
    if(p.publication==='published'){
      const s=p.source;
      if(!s||typeof s.text!=='string'||s.text.length>100000||s.requestKey!==receipt.idempotencyKey
        ||s.revision!==receipt.resultingRevision||s.version!==1||typeof s.sourceId!=='string'
        ||typeof s.publicationId!=='string'||s.generatorSource!=='deterministic'||!/^[a-f0-9]{64}$/.test(s.bodySha))throw Error('INVALID_PUBLICATION_SOURCE');
      const bytes=new TextEncoder().encode(s.text);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      if(sha!==s.bodySha)throw Error('NARRATIVE_BODY_CORRUPT');
      text=s.text;
    }else if(p.publication==='legacy-body-unavailable')text='规则已结算；此历史回合没有服务端正文，无法恢复原文。';
    else if(p.publication==='pending')text='规则已结算；正文仍在处理中。';
    else if(p.publication==='failed')text='规则已结算；正文生成失败，权威结果已保留。';
    else throw Error('INVALID_PUBLICATION_STATE');
    rows.push({id:receipt.idempotencyKey,revision:receipt.resultingRevision,receipt,text});
  }
  return rows;
}
