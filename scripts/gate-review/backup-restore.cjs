'use strict';
// Restore only to a new test database on the identity-checked dedicated cluster.
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),{createHash}=require('crypto');
const S=require('./support.cjs'),run=process.env.GATE_REVIEW_RUN;assert.match(run??'',/^[a-z0-9-]+$/);
const name='jiuxiao_test_gate-revised-'+run,target='jiuxiao_test_gate-restored-'+run;
const toolRoot=path.resolve(S.root,'../../工具/INTEGRATION-HANDOVER-01'),bin=path.join(toolRoot,'pg18/pgsql/bin');
const dump=path.join(S.evidence,run+'-backup.dump'),steps=[];
function command(exe,args){const r=cp.spawnSync(path.join(bin,exe),args,{encoding:'utf8',windowsHide:true,timeout:60000,env:{...process.env,PGCLIENTENCODING:'UTF8',TEMP:path.join(toolRoot,'tmp'),TMP:path.join(toolRoot,'tmp')}});
 const step={exe,args,exitCode:r.status,error:r.error?.message,stdout:r.stdout,stderr:r.stderr};steps.push(step);fs.writeFileSync(path.join(S.evidence,run+'-'+exe+'.json'),JSON.stringify(step,null,2),{flag:'wx'});assert.equal(r.status,0);}
async function snapshot(p){const tables=['game_saves','turn_requests','turn_events','narrative_context_snapshots','narrative_generation_requests','narrative_attempts','narrative_sources','narrative_publications','narrative_receipt_ownership','narrative_writer_fence'],result={};
 for(const table of tables)result[table]=(await p.query(`SELECT count(*)::int AS n,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS sha FROM ${table} t`)).rows[0];return result;}
(async()=>{let source,restored;try{source=await S.pool(name);const before=await snapshot(source);assert.ok(!fs.existsSync(dump));
 command('pg_dump.exe',['-h','127.0.0.1','-p','55463','-U','gate_review_admin','-Fc','-f',dump,name]);
 restored=await S.createDatabase(target);command('pg_restore.exe',['-h','127.0.0.1','-p','55463','-U','gate_review_admin','--exit-on-error','-d',target,dump]);
 const after=await snapshot(restored);assert.deepEqual(after,before);
 // Restored triggers and authorization must still reject a bogus erasure selector.
 const owner=(await restored.query("SELECT owner_id FROM narrative_receipt_ownership WHERE ownership='suppressed' LIMIT 1")).rows[0];assert.ok(owner);
 const c=await restored.connect();try{await c.query('BEGIN');await c.query("SET LOCAL jiuxiao.account_erasure_operation='invented-proof'");await assert.rejects(()=>c.query('DELETE FROM narrative_receipt_ownership WHERE owner_id=$1',[owner.owner_id]),/AUTHORIZED_ERASURE_REQUIRED/);}finally{await c.query('ROLLBACK');c.release();}
 fs.writeFileSync(path.join(S.evidence,run+'-backup-restore.json'),JSON.stringify({status:'PASS',source:name,target,steps,before,after,dumpSha256:createHash('sha256').update(fs.readFileSync(dump)).digest('hex'),restoredConstraintsEnforced:true,downgradeExecuted:false,formal:{pass:0,blocked:16}},null,2),{flag:'wx'});console.log('BACKUP_RESTORE_PASS');
 }finally{await Promise.all([source?.end(),restored?.end()]);}})().catch(e=>{console.error(e);process.exitCode=1;});
