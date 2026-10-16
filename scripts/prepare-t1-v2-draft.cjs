throw new Error('ARCHIVED_INTERMEDIATE_GENERATOR_DO_NOT_REPLAY');
'use strict';
// Applies only to this independent draft worktree. Does not touch approvals or pins.
const fs=require('fs'),assert=require('assert/strict');
function edit(file,fn){const s=require('child_process').execFileSync('git',['show','d8ea49a8a74beb79233b100db71bbc4295db47c3:'+file],{encoding:'utf8'});fs.writeFileSync(file,fn(s));}
function replace(s,a,b){assert.ok(s.includes(a),'MISSING_DRAFT_ANCHOR '+a.slice(0,90));return s.replace(a,()=>b);}
const base='apps/api/src/services/';
edit(base+'npc-memory-turn-transaction.ts',s=>{
 s=replace(s,'  authorizedSupersessions?: readonly AuthorizedObservationSupersessionRecord[];','  authorizedSupersessions?: readonly AuthorizedObservationSupersessionRecord[];\n  requestNarrative?: boolean;\n  cancellation?: AbortSignal;');
 s=replace(s,"=>Promise<void>) {}","=>Promise<void>, private readonly registerNarrative?: (client:PoolClient,commit:AcceptedTurnCommitInput)=>Promise<void>) {}");
 s=replace(s,'    const commit = normalizeCommit(input);','    if (input.cancellation?.aborted) throw Error(\'TURN_CANCELLED_BEFORE_COMMIT\');\n    const commit = normalizeCommit(input);');
 s=replace(s,'    let inTransaction = false;\n\n    try {\n      await client.query(\'BEGIN\');\n      inTransaction = true;\n      if (this.requiresLiveAccount', '    let inTransaction = false;\n    let commitAttempted = false;\n    let released = false;\n\n    try {\n      await client.query(\'BEGIN\');\n      inTransaction = true;\n      if (this.requiresLiveAccount');
 s=replace(s,"(this.guard?'FOR UPDATE':'FOR KEY SHARE')", "(this.guard||this.registerNarrative?'FOR UPDATE':'FOR KEY SHARE')");
 const start=s.indexOf('  async commitAcceptedTurn('),before=s.slice(0,start);let body=s.slice(start);
 body=replace(body,"      await client.query('COMMIT');", "      await this.registerNarrative?.(client,commit);\n      if (commit.cancellation?.aborted) throw Error('TURN_CANCELLED_BEFORE_COMMIT');\n      commitAttempted = true;\n      await client.query('COMMIT');");
 body=replace(body,'      throw error;\n    } finally {\n      client.release();',`      if (commitAttempted) {
        // A COMMIT transport error is ambiguous. Drop this connection before a new read.
        client.release(true); released = true;
        let recovered: TurnReceipt | null = null;
        try { recovered = await this.getReceiptForOwner(commit.ownerId,commit.save.saveId,commit.receipt.idempotencyKey); }
        catch { /* Remains unknown; never resubmit an action here. */ }
        if (recovered && recovered.requestFingerprint === commit.receipt.requestFingerprint)
          return {kind:'duplicate',receipt:recovered};
        throw new TurnCommitOutcomeUnknown(commit.save.saveId,commit.receipt.idempotencyKey);
      }
      throw error;
    } finally {
      if (!released) client.release();`);
 s=before+body;
 return s+`\nexport class TurnCommitOutcomeUnknown extends Error {
  constructor(readonly saveId:string,readonly requestKey:string) { super('TURN_COMMIT_OUTCOME_UNKNOWN'); }
}\n`;
});
edit(base+'server-turn.ts',s=>{
 s="import type { NarrativeV2Port } from './narrative-ownership-v2.js';\n"+s;
 s=replace(s,"  | { status: 'not_requested' }","  | { status: 'not_requested' }\n  | { status: 'pending' | 'running'; wait?: 'cancelled' | 'timeout' }\n  | { status: 'ownership_unknown' | 'legacy_body_unavailable' | 'integrity_failure' }");
 s=replace(s,'    private readonly deterministicNarrative?: DeterministicNarrative,','    private readonly deterministicNarrative?: DeterministicNarrative,\n    private readonly narrativeV2?: NarrativeV2Port,');
 s=replace(s,'      previousJournal: journal, nextJournal: next.journal, authorizedObservations: next.authorizedObservations });','      previousJournal: journal, nextJournal: next.journal, authorizedObservations: next.authorizedObservations,\n      requestNarrative, cancellation });');
 s=replace(s,"    let narrative: NarrativeResult = { status: 'not_requested' };",`    if (this.narrativeV2) {
      // Deployment adapter selects the protocol; persistent metadata decides each receipt's owner.
      // Reads never start workers or re-claim failed work, including duplicate requests.
      let narrative: NarrativeResult;
      try { narrative = await this.narrativeV2.read(ownerId,receipt,cancellation); }
      catch { narrative = {status:'integrity_failure'}; }
      return {status:'accepted',duplicate,receipt,narrative};
    }
    let narrative: NarrativeResult = { status: 'not_requested' };`);
 return s;
});
edit(base+'postgres-server-turn.ts',s=>{
 s="import type { NarrativeV2Port } from './narrative-ownership-v2.js';\n"+s;
 s=replace(s,'policy?:()=>DataPolicy|undefined): ServerTurnRepository','policy?:()=>DataPolicy|undefined,narrativeV2?:NarrativeV2Port): ServerTurnRepository');
 return replace(s,'  }:undefined);','  }:undefined,narrativeV2?.register);');
});
edit(base+'narrative-publication-repository.ts',s=>{
 s=replace(s,'private readonly limits?: BodyLimits) {}','private readonly limits?: BodyLimits, private readonly v2?: { maxAttempts:number; leaseMs:number }) {}');
 s=replace(s,'    if (!Number.isInteger(leaseMs)', '    if (this.v2) leaseMs=this.v2.leaseMs;\n    if (!Number.isInteger(leaseMs)');
 s=replace(s,'leaseMs > 120_000','leaseMs > 180_000');
 s=replace(s,"      if (!g || g.state === 'published') return null;",`      if (!g || g.state === 'published' || g.state === 'failed') return null;
      if (this.v2) {
        await this.requireV2Ownership(c,owner,save,key,g.id);
        if (!Number.isInteger(this.v2.maxAttempts) || this.v2.maxAttempts<1 || this.v2.maxAttempts>3)
          throw Error('NARRATIVE_RECOVERY_BUDGET_INVALID');
      }`);
 s=replace(s,'      if (live.rowCount) return null;',`      if (live.rowCount) return null;
      if (this.v2 && g.lease_epoch >= this.v2.maxAttempts) {
        await c.query("UPDATE narrative_attempts SET state='expired' WHERE generation_id=$1 AND state='running'",[g.id]);
        await c.query("UPDATE narrative_generation_requests SET state='failed' WHERE id=$1",[g.id]);
        await c.query("UPDATE narrative_outbox SET state='done' WHERE generation_id=$1 AND kind='generate'",[g.id]);
        return null;
      }`);
 s=replace(s,"      if (!g) throw Error('NARRATIVE_NOT_FOUND');", "      if (!g) throw Error('NARRATIVE_NOT_FOUND');\n      if (this.v2) await this.requireV2Ownership(c,lease.ownerId,lease.saveId,lease.requestKey,g.id);");
 s=replace(s,'  private decode(',`  private async requireV2Ownership(c:PoolClient,owner:string,save:string,key:string,generation:string) {
    const gate=await c.query(\`SELECT singleton FROM narrative_writer_fence WHERE singleton=true AND phase='managed'
      AND protocol_version=2 AND old_writer_drained AND old_role_revoked
      AND fleet_manifest_sha ~ '^[a-f0-9]{64}$' AND valid_until>clock_timestamp() FOR SHARE\`);
    const row=await c.query(\`SELECT o.generation_id FROM narrative_receipt_ownership o
      JOIN turn_requests r ON r.save_id=o.save_id AND r.idempotency_key=o.request_key
      JOIN narrative_generation_requests g ON g.id=o.generation_id
      JOIN narrative_context_snapshots c ON c.id=g.context_id
      WHERE o.owner_id=$1 AND o.save_id=$2 AND o.request_key=$3 AND o.generation_id=$4
      AND o.ownership='managed' AND o.protocol_version=2 AND o.request_narrative
      AND o.receipt_sha=encode(sha256(convert_to(r.result::text,'UTF8')),'hex')
      AND c.owner_id=o.owner_id AND c.receipt_sha=o.receipt_sha AND c.branch_id=o.branch_id
      AND c.context->>'rendererVersion'=o.renderer_version AND c.context->>'format'=o.context_version\`,[owner,save,key,generation]);
    if (!gate.rowCount || !row.rowCount) throw Error('NARRATIVE_WRITER_OWNERSHIP_UNPROVEN');
  }
  private decode(`);
 return s;
});
edit(base+'narrative-outbox-worker.ts',s=>{
 s=replace(s,'private readonly renderers: ReadonlyMap<string, DeterministicRenderer>) {}','private readonly renderers: ReadonlyMap<string, DeterministicRenderer>, private readonly executionMs = 120_000) {}');
 s=replace(s,'    try {\n      const render', '    let timer:ReturnType<typeof setTimeout>|undefined;\n    try {\n      const render');
 s=replace(s,'      const rendered = await render(structuredClone(lease.context.receipt), structuredClone(context));',`      const rendered = await Promise.race([
        Promise.resolve().then(()=>render(structuredClone(lease.context.receipt), structuredClone(context))),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('NARRATIVE_EXECUTION_TIMEOUT')),this.executionMs);}),
      ]);`);
 return replace(s,'} catch (error) { await this.repository.fail(lease); throw error; }','} catch (error) { await this.repository.fail(lease); throw error; }\n    finally { if(timer)clearTimeout(timer); }');
});
for(const file of ['apps/api/src/routes/turns.ts','apps/api/src/routes/games.ts'])edit(file,s=>{
 s="import { TurnCommitOutcomeUnknown } from '../services/npc-memory-turn-transaction.js';\n"+s;
 return s.replaceAll('} catch (error) {', `} catch (error) {
      if (error instanceof TurnCommitOutcomeUnknown) return c.json({code:'TURN_COMMIT_OUTCOME_UNKNOWN',
        saveId:error.saveId,requestKey:error.requestKey,recovery:'query_original_receipt'},503);`);
});
