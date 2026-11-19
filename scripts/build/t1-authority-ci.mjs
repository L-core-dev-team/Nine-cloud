// Apply the pending authority changes only to disposable API sources. The repository,
// real signing inputs and the independent historical golden fixtures remain untouched.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const base=new URL(process.env.TEST_DATABASE_URL || '');
if (!['postgresql:','postgres:'].includes(base.protocol) || !['127.0.0.1','localhost'].includes(base.hostname) ||
    base.pathname!=='/jiuxiao_test' || base.search || base.hash) throw Error('T1_DEDICATED_LOOPBACK_TEST_REQUIRED');
if (process.env.GITHUB_ACTIONS!=='true' && process.env.T1_DEDICATED_LOCAL_CLUSTER!=='true') throw Error('T1_EXPLICIT_SANDBOX_REQUIRED');
const require=createRequire(join(root,'packages/db/package.json'));
const {Pool}=require('pg');
const {drizzle}=require('drizzle-orm/node-postgres');
const {migrate}=require('drizzle-orm/node-postgres/migrator');
const suffix=randomBytes(8).toString('hex'), name='jiuxiao_test_t1'+suffix;
const tmp=mkdtempSync(join(tmpdir(),'jiuxiao-t1-'));
const admin=new Pool({connectionString:base.href,max:1}), links=[], roles=[];
let fixture,created=false,primary;
const cleanup=[];
const env={...process.env};
const roleNames=['runtime','worker','operator','erasure','schema_owner','lock_owner'].map(s=>'jiuxiao_narrative_'+s);
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,env,stdio:'inherit',timeout:180000,windowsHide:true});
try {
  assert.equal((await admin.query('SELECT current_database() db')).rows[0].db,'jiuxiao_test');
  await admin.query('CREATE DATABASE '+name);created=true;
  const url=new URL(base);url.pathname='/'+name;
  fixture=new Pool({connectionString:url.href,max:1});
  await migrate(drizzle(fixture),{migrationsFolder:join(root,'packages/db/drizzle')});
  for (const role of roleNames) {
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount) {
      await admin.query('CREATE ROLE '+role+' NOLOGIN');roles.push(role);
    }
  }
  const retired='t1_retired_'+suffix;
  await admin.query('CREATE ROLE '+retired+' NOLOGIN');roles.push(retired);
  const cli=await fixture.connect();
  try{
    await cli.query('BEGIN');
    await cli.query("SELECT set_config('jiuxiao.retired_writer_roles',$1,true)",[retired]);
    await cli.query(readFileSync(join(root,'packages/db/pending/0027_narrative_publication.sql'),'utf8'));
    const next=readFileSync(join(root,'packages/db/pending/0028_narrative_ownership.sql'),'utf8');
    await cli.query('SAVEPOINT old_writer_probe');
    await cli.query('GRANT UPDATE(revision) ON public.game_saves TO '+retired);
    await assert.rejects(cli.query(next),/NARRATIVE_OLD_ROLE_STILL_PRIVILEGED/);
    await cli.query('ROLLBACK TO SAVEPOINT old_writer_probe');
    // Seed a legitimate pre-V2 pending job using the 0027 constraints. Never
    // install the managed-write triggers ahead of outstanding legacy work.
    await cli.query('SAVEPOINT old_task_probe');
    await cli.query(`INSERT INTO auth_accounts(id,email) VALUES('t1-old','old@example.invalid');
      INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot)
        VALUES('t1-old-save','t1-old',1,1,'fixture','fixture','fixture','{}');
      INSERT INTO turn_requests(save_id,idempotency_key,expected_revision,result)
        VALUES('t1-old-save','00000000-0000-4000-8000-000000000001',0,
          '{"saveId":"t1-old-save","idempotencyKey":"00000000-0000-4000-8000-000000000001","resultingRevision":1,"decision":{"status":"accepted"}}');
      WITH seed AS(SELECT result,jsonb_build_object('format','authority-context-v1','policySurface','p5-narrative',
        'receipt',result,'hints','{}'::jsonb,'rendererVersion','t1-old') ctx FROM turn_requests WHERE save_id='t1-old-save')
      INSERT INTO narrative_context_snapshots(id,save_id,request_key,owner_id,branch_id,receipt_sha,context,context_sha)
        SELECT '00000000-0000-4000-8000-000000000002','t1-old-save','00000000-0000-4000-8000-000000000001','t1-old','root',
        encode(sha256(convert_to(result::text,'UTF8')),'hex'),ctx,encode(sha256(convert_to(ctx::text,'UTF8')),'hex') FROM seed;
      INSERT INTO narrative_generation_requests(id,context_id,save_id,request_key,generation_key,publication_key)
        VALUES(gen_random_uuid(),'00000000-0000-4000-8000-000000000002','t1-old-save','00000000-0000-4000-8000-000000000001','initial-v1','initial-v1')`);
    await assert.rejects(cli.query(next),/NARRATIVE_0022_UNFINISHED_GENERATIONS/);
    await cli.query('ROLLBACK TO SAVEPOINT old_task_probe');
    assert.equal((await cli.query("SELECT to_regclass('public.narrative_writer_fence') AS relation")).rows[0].relation,null);
    await cli.query(next);
    await cli.query('COMMIT');
  }catch(error){await cli.query('ROLLBACK');throw error;}finally{cli.release();}
  env.T1_ADMIN_URL=url.href;env.T1_TEST_RETIRED=retired;
  for (const kind of ['operator','runtime','worker','erasure']){
    const role='t1_'+kind+'_'+suffix, secret=randomBytes(24).toString('hex');
    await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '"+secret+"'");roles.push(role);
    await admin.query('GRANT jiuxiao_narrative_'+kind+' TO '+role);
    const userUrl=new URL(url);userUrl.username=role;userUrl.password=secret;
    env['T1_'+kind.toUpperCase()+'_URL']=userUrl.href;
  }
  const api=join(tmp,'apps/api');mkdirSync(api,{recursive:true});
  for(const f of ['package.json','tsconfig.base.json']) cpSync(join(root,f),join(tmp,f));
  for(const f of ['package.json','src','tsconfig.json']) cpSync(join(root,'apps/api',f),join(api,f),{recursive:true});
  mkdirSync(join(tmp,'scripts'),{recursive:true});
  cpSync(join(root,'scripts/p1-rule-semantic-source-digest.mjs'),join(tmp,'scripts/p1-rule-semantic-source-digest.mjs'));
  for(const f of ['node_modules','apps/api/node_modules','packages']){
    const link=join(tmp,f);symlinkSync(join(root,f),link,process.platform==='win32'?'junction':'dir');links.push(link);
  }
  run('git',['apply','--ignore-space-change','--whitespace=nowarn',join(root,'docs/integration/remaining-closeout-20261119/t1-authority.PENDING.patch')],tmp);
  run(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],api);
  const identity=JSON.parse(execFileSync(process.execPath,[join(tmp,'scripts/p1-rule-semantic-source-digest.mjs')],{cwd:tmp,encoding:'utf8'}));
  const evidence=join(root,'test-results/remaining-closeout');
  mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,'t1-pending-implementation.json'),JSON.stringify(identity,null,2)+'\n');
  const serviceDir=join(api,'dist/services');
  const plugin=join(serviceDir,'p1-prologue-plugin.js');
  const loadFile=name=>import(pathToFileURL(join(serviceDir,name+'.js')).href);
  const {P1_RULE_SEMANTIC_INPUTS}=await loadFile('p1-prologue-plugin');
  const {createP1RuleSemanticDependencies}=await loadFile('p1-rule-semantic-functions');
  const {computeRuleSemanticDigest}=await loadFile('rule-semantic-fingerprint');
  const {P1_REVIEW_RULE_APPROVAL}=await loadFile('p1-review-rule-approval');
  const {loadTurnPlugin}=await loadFile('turn-runtime');
  const aggregate=computeRuleSemanticDigest(createP1RuleSemanticDependencies({
    ...P1_RULE_SEMANTIC_INPUTS,implementationFingerprint:identity.sha256,
  }));
  await assert.rejects(loadTurnPlugin(plugin),error=>error.message===
    `P1_REVIEW_RULE_SEMANTIC_MISMATCH expected=${P1_REVIEW_RULE_APPROVAL.semanticSha256} actual=${aggregate}`);
  console.log(JSON.stringify({scope:'PENDING_AUTHORITY',implementation:identity.sha256,
    aggregate,approved:P1_REVIEW_RULE_APPROVAL.semanticSha256,admission:'rejected_by_original_loader'}));
  run(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','src/services/narrative-publication.integration.test.ts','--maxWorkers=1'],api);
} catch(error){primary=error;}
finally {
  for(const op of [
    async()=>{if(fixture) await fixture.end();},
    async()=>{if(created) await admin.query('DROP DATABASE '+name);},
    ...roles.reverse().map(role=>async()=>{await admin.query('DROP ROLE '+role);}),
    async()=>admin.end(),
    ...links.reverse().map(link=>async()=>{if(existsSync(link))unlinkSync(link);}),
    async()=>{if(links.some(existsSync))throw Error('T1_TEMP_LINK_CLEANUP_FAILED');rmSync(tmp,{recursive:true,force:true});}
  ]) {try{await op();}catch(error){cleanup.push(error);}}
}
if(primary || cleanup.length) throw new AggregateError([...(primary?[primary]:[]),...cleanup],'T1 isolated verification or cleanup failed');
