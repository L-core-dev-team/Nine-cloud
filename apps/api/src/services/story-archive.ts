import type { Pool } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { TurnReceiptSchema, type TurnReceipt } from '@jiuxiao/contracts';

/** Stores only the exact text returned by a host narrator after a committed receipt. */
export class StoryArchive {
 constructor(private readonly pool:Pool) {}
 async retain(receipt:TurnReceipt, source:'model'|'deterministic', render:()=>Promise<string>|string):Promise<string> {
  if(receipt.decision.status!=='accepted') throw new Error('STORY_REQUIRES_ACCEPTED_RECEIPT');
  const committed=await this.pool.query('SELECT result FROM turn_requests WHERE save_id=$1 AND idempotency_key=$2',[receipt.saveId,receipt.idempotencyKey]);
  if(!committed.rows[0] || !isDeepStrictEqual(TurnReceiptSchema.parse(committed.rows[0].result),receipt))throw new Error('STORY_RECEIPT_MISMATCH');
  const prior=await this.pool.query('SELECT narrative_text FROM story_narratives WHERE save_id=$1 AND idempotency_key=$2',[receipt.saveId,receipt.idempotencyKey]);
  if(prior.rows[0])return prior.rows[0].narrative_text;
  const text=await render();
  if(typeof text!=='string'||!text.trim()||text.length>100000)throw new Error('INVALID_STORY_TEXT');
  await this.pool.query('INSERT INTO story_narratives(save_id,idempotency_key,revision,narrative_text,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[receipt.saveId,receipt.idempotencyKey,receipt.resultingRevision,text,source]);
  const winner=await this.pool.query('SELECT narrative_text FROM story_narratives WHERE save_id=$1 AND idempotency_key=$2',[receipt.saveId,receipt.idempotencyKey]);
  if(!winner.rows[0])throw new Error('STORY_NOT_SAVED');
  return winner.rows[0].narrative_text;
 }
 async read(ownerId:string,saveId:string,throughRevision:number,before?:number) {
  const boundary=Math.min(throughRevision,before??throughRevision);
  const rows=await this.pool.query(`SELECT r.result,n.narrative_text,n.source FROM turn_requests r
   JOIN game_saves s ON s.id=r.save_id LEFT JOIN story_narratives n ON n.save_id=r.save_id AND n.idempotency_key=r.idempotency_key
   WHERE s.id=$1 AND s.owner_id=$2 AND r.result->'decision'->>'status'='accepted'
    AND (r.result->>'resultingRevision')::int <= $3
    AND NOT EXISTS(SELECT 1 FROM cloud_archive_trash t WHERE t.save_id=s.id)
   ORDER BY r.expected_revision DESC,r.idempotency_key DESC LIMIT 101`,[saveId,ownerId,boundary]);
  const hasMore=rows.rows.length>100;
  const items=rows.rows.slice(0,100).map(row=>({receipt:TurnReceiptSchema.parse(row.result),text:row.narrative_text??null,source:row.source??null})).reverse();
  return {items,nextBefore:hasMore?items[0]!.receipt.resultingRevision-1:null};
 }
}
