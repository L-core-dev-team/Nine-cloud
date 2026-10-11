const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path'); const os=require('node:os');
const root=path.resolve(__dirname,'..');
const req=createRequire(path.join(root,'packages/db/package.json'));
const {Pool}=req('pg'); const {drizzle}=req('drizzle-orm/node-postgres');
const {migrate}=req('drizzle-orm/node-postgres/migrator');
const folder=path.join(root,'packages/db/drizzle');
const journal=JSON.parse(fs.readFileSync(path.join(folder,'meta/_journal.json')));
const subset=fs.mkdtempSync(path.join(os.tmpdir(),'jx-joint-migration-'));
fs.mkdirSync(path.join(subset,'meta'));
const entries=journal.entries.filter(e=>e.idx<=19);
for(const e of entries)fs.copyFileSync(path.join(folder,e.tag+'.sql'),path.join(subset,e.tag+'.sql'));
fs.writeFileSync(path.join(subset,'meta/_journal.json'),JSON.stringify({...journal,entries}));
const input=new URL(process.env.TEST_DATABASE_URL||'');
if(!['127.0.0.1','localhost'].includes(input.hostname)||!/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(input.pathname))throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
input.pathname='/';const base=input.href;
(async()=>{const admin=new Pool({connectionString:base+'postgres'});const results=[];
try{for(const mode of ['fresh','upgrade_from_0019','already_0020']){
const name='jiuxiao_test_joint-'+mode.replaceAll('_','-')+'-'+Date.now();
await admin.query('CREATE DATABASE "'+name+'"');
const pool=new Pool({connectionString:base+name});
let before;
try{if(mode!=='fresh') {
 let initial=subset;
 if(mode==='already_0020') {
  initial=fs.mkdtempSync(path.join(os.tmpdir(),'jx-old0020-'));fs.mkdirSync(path.join(initial,'meta'));
  const oldEntries=journal.entries.filter(e=>e.idx<=20);
  for(const e of oldEntries)fs.copyFileSync(path.join(folder,e.tag+'.sql'),path.join(initial,e.tag+'.sql'));
  fs.writeFileSync(path.join(initial,'meta/_journal.json'),JSON.stringify({...journal,entries:oldEntries}));
 }
 await migrate(drizzle(pool),{migrationsFolder:initial});
 await pool.query("INSERT INTO auth_accounts(id,email) VALUES ('keep-owner','keep@example.invalid')");
 const policy={mode:'continue',policyVersion:'fixture-v1',schemaVersion:1,clockBasis:'game-minute+npc-grant-sequence-v1',policyArtifactHash:'sha256:'+'a'.repeat(64),cueDictionaryHash:'sha256:'+'b'.repeat(64),normalizerVersion:'fixture',retrievalVersion:'fixture',visibilityPolicyVersion:'fixture',visibilityPolicyHash:'sha256:'+'c'.repeat(64),createdAtRevision:0};
 for(const version of [1,3]) await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot,memory_mode,memory_policy,branch_id,fork_revision,created_policy_version,canon_artifact_hash)
 VALUES($1,'keep-owner',2,$2,'fixture-canon','fixture-rule','fixture-v1',$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9)`,[
  'keep-v'+version,version,JSON.stringify({playerId:'player',locationId:'gate',elapsedMinutes:30,facts:{preserve:'original'}}),version===3?'continue':null,version===3?JSON.stringify(policy):null,version===3?'root':null,version===3?0:null,version===3?'fixture-v1':null,version===3?'sha256:'+'d'.repeat(64):null]);
 before=(await pool.query('SELECT * FROM game_saves ORDER BY id')).rows;
}
await migrate(drizzle(pool),{migrationsFolder:folder});
await migrate(drizzle(pool),{migrationsFolder:folder});
if(mode!=='fresh' && (await pool.query("SELECT id FROM auth_accounts WHERE id='keep-owner'")).rowCount!==1)throw Error('EXISTING_DATA_LOST');
if(before)assert.deepEqual((await pool.query('SELECT * FROM game_saves ORDER BY id')).rows,before);
const columns=await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='npc_authorized_observation_outbox' AND column_name='memory_class'");
const migrations=await pool.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations');
results.push({mode,database:name,migrations:migrations.rows[0].n,memoryClassPresent:columns.rowCount===1,oldSaveRowsPreserved:before?.length??0});
}finally{await pool.end();}}}finally{await admin.end();}
console.log(JSON.stringify({head:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),journal:journal.entries.slice(-2),results},null,2));
if(results.some(r=>!r.memoryClassPresent))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
