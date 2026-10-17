'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createHash}=require('crypto');
const {evidence,root,createDatabase,migrate,fixture,recordOwner,seedManaged,load}=require('./support.cjs');
(async()=>{const db=await createDatabase('jiuxiao_test_gate-original-02');const results=[];
try{
 await migrate(db);const sql=fs.readFileSync(path.join(root,'docs/integration/pending/0023_narrative_ownership_v2.sql'));
 assert.ok(fs.readFileSync(path.join(evidence,'original-0023.sql')).equals(sql));await db.query(sql.toString());
 const lib=await load('narrative-publication-repository');
 async function probe(id,title,fn){let rejected=false,error;try{await fn();}catch(e){rejected=true;error={code:e.code,message:e.message};}results.push({id,title,expected:'DB_REJECT',actual:rejected?'REJECT':'ACCEPT',status:rejected?'PASS':'FAIL',error});console.log(JSON.stringify(results.at(-1)));}
 const f=await fixture(db,{seed:false});const c=await db.connect();try{await c.query('BEGIN');await recordOwner(c,f,'suppressed');await c.query('COMMIT');}finally{c.release();}
 await probe('B01','G inserted after committed suppressed ownership',async()=>{const c=await db.connect();try{await c.query('BEGIN');await lib.seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:f.receipt,save:f.save,rendererVersion:'handover-fixture-v1'});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 const f2=await fixture(db,{seed:false});const c2=await db.connect();try{await c2.query('BEGIN');await recordOwner(c2,f2,'suppressed');await c2.query('COMMIT');}finally{c2.release();}
 await probe('B02','arbitrary nonempty erasure GUC deletes ownership',async()=>{const c=await db.connect();try{await c.query('BEGIN');await c.query("SET LOCAL jiuxiao.account_erasure_operation='invented-proof'");await c.query('DELETE FROM narrative_receipt_ownership WHERE save_id=$1',[f2.saveId]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 const m=await seedManaged(db),other=await seedManaged(db);
 await probe('B03','managed generation context identity mutation',()=>db.query('UPDATE narrative_generation_requests SET context_id=(SELECT context_id FROM narrative_generation_requests WHERE id=$1) WHERE id=$2',[other.generation,m.generation]));
 await probe('B04','receipt revision mutated after managed registration',()=>db.query("UPDATE turn_requests SET result=jsonb_set(result,'{resultingRevision}','999'::jsonb) WHERE save_id=$1 AND idempotency_key=$2",[m.saveId,m.key]));
 await probe('B05','save owner changed after ownership registration',()=>db.query('UPDATE game_saves SET owner_id=$1 WHERE id=$2',[other.owner,m.saveId]));
 const result={baseline:'d83f5317d71a9d0334d676fff14ba21fd635a87c',originalSqlSha256:createHash('sha256').update(sql).digest('hex'),database:'jiuxiao_test_gate-original-02',results,formalAcceptance:{pass:0,blocked:16}};
 fs.writeFileSync(path.join(evidence,'baseline-probes.json'),JSON.stringify(result,null,2),{flag:'wx'});if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}finally{await db.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
