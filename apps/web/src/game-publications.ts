import { TurnReceiptSchema } from '@jiuxiao/contracts';
import type { GameCacheScope, ReadingTurn } from './cloud-game-cache';
import { CloudHttpError, cloudRequest } from './cloud-sync';

/** Server-published history is presentation only, never a state-recovery substitute. */
export type PublishedHistoryPage = { items: ReadingTurn[]; nextBeforeRevision: number | null };
export async function readPublishedGameHistoryPage(scope:GameCacheScope,signal:AbortSignal,beforeRevision?:number):Promise<PublishedHistoryPage|null> {
  if(beforeRevision!==undefined&&(!Number.isSafeInteger(beforeRevision)||beforeRevision<1))throw Error('INVALID_PUBLICATION_CURSOR');
  const query=beforeRevision===undefined?'':`?beforeRevision=${beforeRevision}`;
  let result:Record<string,unknown>;
  try {result=await cloudRequest(`/api/games/${encodeURIComponent(scope.saveId)}/presentations${query}`,'GET',undefined,scope.ownerId,signal);}
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
      if(!s && p.legacyBody) {
        const legacy=p.legacyBody;
        if(typeof legacy.text!=='string'||legacy.text.length>100000||!/^[a-f0-9]{64}$/.test(legacy.bodySha))throw Error('INVALID_LEGACY_SOURCE');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(legacy.text));
        const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
        if(sha!==legacy.bodySha)throw Error('NARRATIVE_BODY_CORRUPT');
        rows.push({id:receipt.idempotencyKey,revision:receipt.resultingRevision,receipt,text:legacy.text});
        continue;
      }
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
    else if(p.publication==='not_requested')text='规则已结算；本回合首次选择不请求正文。';
    else if(p.publication==='ownership_unknown')text='规则已结算；正文归属尚未确认，暂不提供原文。';
    else throw Error('INVALID_PUBLICATION_STATE');
    rows.push({id:receipt.idempotencyKey,revision:receipt.resultingRevision,receipt,text});
  }
  if(rows.some((row,i)=>row.revision<1||(beforeRevision!==undefined&&row.revision>=beforeRevision)
    ||(i>0&&row.revision<=rows[i-1]!.revision))||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('INVALID_PUBLICATION_HISTORY');
  const cursor=result.nextBeforeRevision??null;
  if(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor!==rows[0]?.revision||rows.length!==10))throw Error('INVALID_PUBLICATION_CURSOR');
  if(signal.aborted)throw Error('PUBLICATION_READ_ABORTED');
  return {items:rows,nextBeforeRevision:cursor as number|null};
}
export async function readPublishedGameHistory(scope:GameCacheScope,signal:AbortSignal):Promise<ReadingTurn[]|null> {
  return (await readPublishedGameHistoryPage(scope,signal))?.items??null;
}
