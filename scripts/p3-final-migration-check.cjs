// Local isolated migration regression; product SQL and historical migrations remain unchanged.
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'packages/db/package.json'));
const {Pool}=req('pg'),{drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');
const folder=path.join(root,'packages/db/drizzle');
const journal=JSON.parse(fs.readFileSync(path.join(folder,'meta/_journal.json')));
assert.equal(journal.entries.at(-1).idx,21,'Frozen to 0021; no 0022/0023.');
const sql=fs.readFileSync(path.join(folder,'0021_recall_upgrade_compatibility.sql'),'utf8');
const sha=v=>createHash('sha256').update(v).digest('hex');
const url=new URL(process.env.TEST_DATABASE_URL||'');
if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(url.pathname))throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
const connection=name=>{const u=new URL(url);u.pathname='/'+name;return u.href;};
const artifactRoot=fs.mkdtempSync(path.join(os.tmpdir(),'jx-dedup-migration-'));
function subset(last,injected){
 const target=fs.mkdtempSync(path.join(artifactRoot,'sql-'));fs.mkdirSync(path.join(target,'meta'));
 const entries=journal.entries.filter(e=>e.idx<=last);
 for(const e of entries)fs.copyFileSync(path.join(folder,e.tag+'.sql'),path.join(target,e.tag+'.sql'));
 fs.writeFileSync(path.join(target,'meta/_journal.json'),JSON.stringify({...journal,entries}));
 if(injected)fs.writeFileSync(path.join(target,'0021_recall_upgrade_compatibility.sql'),injected);
 return target;
}
const through19=subset(19),through20=subset(20);
assert.equal(sql.split('$original_0020$;').length,2);
const injectedDDL=subset(21,sql.replace('$original_0020$;',`$original_0020$;
 IF to_regclass('public.npc_memory_observation_supersessions') IS NULL
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='npc_authorized_observation_outbox' AND column_name='memory_class')
 THEN RAISE EXCEPTION 'INJECTION_DID_NOT_REACH_DDL'; END IF;
 RAISE EXCEPTION 'DEDUP_INJECT_AFTER_DDL';`));
assert.equal(sql.split('END $repair_guard$;').length,2);
const injectedEnd=subset(21,sql.replace('END $repair_guard$;',"RAISE EXCEPTION 'DEDUP_INJECT_AFTER_GUARDS';\nEND $repair_guard$;"));
async function seed(pool){
 await pool.query("INSERT INTO auth_accounts(id,email) VALUES('keep-owner','keep@example.invalid')");
 const policy={mode:'continue',policyVersion:'fixture-v1',schemaVersion:1,clockBasis:'game-minute+npc-grant-sequence-v1',policyArtifactHash:'sha256:'+'a'.repeat(64),cueDictionaryHash:'sha256:'+'b'.repeat(64),normalizerVersion:'fixture',retrievalVersion:'fixture',visibilityPolicyVersion:'fixture',visibilityPolicyHash:'sha256:'+'c'.repeat(64),createdAtRevision:0};
 for(const version of [1,3])await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot,memory_mode,memory_policy,branch_id,fork_revision,created_policy_version,canon_artifact_hash)
 VALUES($1,'keep-owner',2,$2,'fixture-canon','fixture-rule','fixture-v1',$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9)`,[
 'keep-v'+version,version,JSON.stringify({playerId:'player',locationId:'gate',elapsedMinutes:30,facts:{preserve:'原文\uFEFF🙂\r\n旧档',gameMinute:30}}),version===3?'continue':null,version===3?JSON.stringify(policy):null,version===3?'root':null,version===3?0:null,version===3?'fixture-v1':null,version===3?'sha256:'+'d'.repeat(64):null]);
}
const saves=async p=>(await p.query('SELECT to_jsonb(s) AS row FROM game_saves s ORDER BY id')).rows;
async function snapshot(p){
 const schema={};
 schema.columns=(await p.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 schema.constraints=(await p.query("SELECT c.relname,n.conname,pg_get_constraintdef(n.oid) AS definition FROM pg_constraint n JOIN pg_class c ON c.oid=n.conrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' ORDER BY c.relname,n.conname")).rows;
 schema.indexes=(await p.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
 schema.triggers=(await p.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows;
 schema.functions=(await p.query("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.prokind='f' ORDER BY p.proname,definition")).rows;
 const data={};
 for(const {tablename} of (await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows){
 data[tablename]=(await p.query(`SELECT to_jsonb(t) AS row FROM "${tablename.replaceAll('"','""')}" t ORDER BY to_jsonb(t)::text`)).rows;
 }
 return {schema,data,ledger:(await p.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows};
}
async function validate(p){
 const columns=await p.query("SELECT column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='npc_authorized_observation_outbox' AND column_name='memory_class'");
 assert.equal(columns.rowCount,1);assert.match(columns.rows[0].column_default,/unclassified/);assert.equal(columns.rows[0].is_nullable,'NO');
 for(const name of ['npc_authorized_observation_recall_idx','npc_memory_supersession_save_npc_idx'])assert.ok((await p.query('SELECT to_regclass($1) AS id',['public.'+name])).rows[0].id);
 assert.equal((await p.query("SELECT 1 FROM pg_trigger WHERE tgrelid='public.npc_memory_observation_supersessions'::regclass AND tgname='npc_memory_observation_supersessions_protect' AND NOT tgisinternal")).rowCount,1);
 assert.equal((await p.query("SELECT 1 FROM pg_constraint WHERE conrelid='public.npc_memory_observation_supersessions'::regclass AND contype='f'")).rowCount,3);
}
async function main(){
 const admin=new Pool({connectionString:connection('postgres')}),results=[];
 try{for(const mode of ['fresh','upgrade-from-0019','already-0020','column-only','table-only','missing-index','missing-trigger','interrupt-after-ddl','interrupt-after-guards']){
 const name='jiuxiao_test_dedup-'+mode+'-'+randomBytes(4).toString('hex');
 await admin.query('CREATE DATABASE "'+name+'"');
 const pool=new Pool({connectionString:connection(name)});
 try{
 const complete=['already-0020','table-only','missing-index','missing-trigger'].includes(mode);
 if(mode!=='fresh'){await migrate(drizzle(pool),{migrationsFolder:complete?through20:through19});await seed(pool);}
 if(mode==='column-only')await pool.query("ALTER TABLE npc_authorized_observation_outbox ADD COLUMN memory_class text NOT NULL DEFAULT 'unclassified'");
 if(mode==='table-only')await pool.query('ALTER TABLE npc_authorized_observation_outbox DROP COLUMN memory_class CASCADE');
 if(mode==='missing-index')await pool.query('DROP INDEX npc_authorized_observation_recall_idx');
 if(mode==='missing-trigger')await pool.query('DROP TRIGGER npc_memory_observation_supersessions_protect ON npc_memory_observation_supersessions');
 const oldSaves=mode==='fresh'?[]:await saves(pool),before=mode==='fresh'?null:await snapshot(pool);
 const partial=['column-only','table-only','missing-index','missing-trigger'].includes(mode),interrupt=mode.startsWith('interrupt-');
 let rejection;
 if(partial||interrupt){
 const chosen=mode==='interrupt-after-ddl'?injectedDDL:mode==='interrupt-after-guards'?injectedEnd:folder;
 try{await migrate(drizzle(pool),{migrationsFolder:chosen});}catch(error){rejection=String(error.cause?.message||error.message);}
 assert.ok(rejection,'Expected actual migration failure');
 assert.match(rejection,new RegExp(partial?'RECALL_SCHEMA_PARTIAL_REQUIRES_RECONCILIATION':mode==='interrupt-after-ddl'?'DEDUP_INJECT_AFTER_DDL':'DEDUP_INJECT_AFTER_GUARDS'));
 const after=await snapshot(pool);assert.deepEqual(after,before,'DDL, rows and migration ledger must roll back');
 fs.writeFileSync(path.join(artifactRoot,mode+'-rollback.json'),JSON.stringify({before,after},null,2));
 }
 if(!partial){
 await migrate(drizzle(pool),{migrationsFolder:folder});await validate(pool);
 if(mode!=='fresh')assert.deepEqual(await saves(pool),oldSaves);
 const once=await snapshot(pool);await migrate(drizzle(pool),{migrationsFolder:folder});assert.deepEqual(await snapshot(pool),once,'repeat deployment is a no-op');
 fs.writeFileSync(path.join(artifactRoot,mode+'-success.json'),JSON.stringify({before,after:once},null,2));
 }
 results.push({mode,database:name,status:'PASS',rejection:rejection||null,rollbackProven:partial||interrupt,retrySucceeded:interrupt,oldSaveRows:oldSaves.length,oldSaveSha256:sha(JSON.stringify(oldSaves)),identity:(await pool.query('SELECT current_database() AS database,current_user AS role,version() AS version')).rows[0]});
 }finally{await pool.end();}
 }}finally{await admin.end();}
 console.log(JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sqlSha256:sha(fs.readFileSync(path.join(folder,'0021_recall_upgrade_compatibility.sql'))),artifactRoot,results},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
