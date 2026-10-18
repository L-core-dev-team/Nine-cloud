const { createRequire } = require('node:module');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'packages/db/package.json'));
const { Pool } = req('pg'), { drizzle } = req('drizzle-orm/node-postgres'), { migrate } = req('drizzle-orm/node-postgres/migrator');
const url = new URL(process.env.TEST_DATABASE_URL || '');
if (!['127.0.0.1','localhost'].includes(url.hostname) || !/^\/jiuxiao_test(?:_[a-z0-9-]+)?$/.test(url.pathname)) throw Error('LOCAL_ISOLATED_DATABASE_REQUIRED');
url.pathname = '/postgres';
const folder = path.join(root, 'packages/db/drizzle');
const journal = JSON.parse(fs.readFileSync(path.join(folder, 'meta/_journal.json')));
const sql = fs.readFileSync(path.join(folder, '0022_narrative_publication.sql'), 'utf8');
const old = fs.mkdtempSync(path.join(os.tmpdir(), 'jx-before0022-'));
fs.mkdirSync(path.join(old,'meta'));
const entries = journal.entries.filter(e => e.idx <= 21);
for (const e of entries) fs.copyFileSync(path.join(folder,e.tag+'.sql'), path.join(old,e.tag+'.sql'));
fs.writeFileSync(path.join(old,'meta/_journal.json'), JSON.stringify({...journal,entries}));
(async () => {
 const admin = new Pool({connectionString:url.href}); const results=[];
 try {
  for (const mode of ['fresh','upgrade0021','interrupted','collision']) {
   const name='jiuxiao_test_narrative-'+mode+'-'+Date.now();
   await admin.query('CREATE DATABASE "'+name+'"'); url.pathname='/'+name;
   const pool=new Pool({connectionString:url.href});
   try {
    let before;
    if(mode!=='fresh') {
     await migrate(drizzle(pool),{migrationsFolder:old});
     await pool.query("INSERT INTO auth_accounts(id,email) VALUES('keep-owner','keep@example.invalid')");
 const policy={mode:'continue',policyVersion:'fixture-v1',schemaVersion:1,clockBasis:'game-minute+npc-grant-sequence-v1',policyArtifactHash:'sha256:'+'a'.repeat(64),cueDictionaryHash:'sha256:'+'b'.repeat(64),normalizerVersion:'fixture',retrievalVersion:'fixture',visibilityPolicyVersion:'fixture',visibilityPolicyHash:'sha256:'+'c'.repeat(64),createdAtRevision:0};
 for(const version of [1,3]) await pool.query(`INSERT INTO game_saves(id,owner_id,revision,schema_version,canon_version,rule_version,memory_policy_version,snapshot,memory_mode,memory_policy,branch_id,fork_revision,created_policy_version,canon_artifact_hash)
 VALUES($1,'keep-owner',2,$2,'fixture-canon','fixture-rule','fixture-v1',$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9)`,[
  'keep-v'+version,version,JSON.stringify({playerId:'player',locationId:'gate',elapsedMinutes:30,facts:{preserve:'original'}}),version===3?'continue':null,version===3?JSON.stringify(policy):null,version===3?'root':null,version===3?0:null,version===3?'fixture-v1':null,version===3?'sha256:'+'d'.repeat(64):null]);

     before=(await pool.query('SELECT * FROM game_saves ORDER BY id')).rows;
    }
    if(mode==='interrupted') {const c=await pool.connect();try {await c.query('BEGIN');await c.query(sql);await c.query('ROLLBACK');}finally{c.release();}
     assert.equal((await pool.query("SELECT to_regclass('narrative_sources') AS t")).rows[0].t,null);}
    if(mode==='collision') {
     await pool.query('CREATE TABLE narrative_sources(marker text)');
     const beforeJournal=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations')).rows;
     await assert.rejects(()=>migrate(drizzle(pool),{migrationsFolder:folder}));
     assert.deepEqual((await pool.query('SELECT * FROM drizzle.__drizzle_migrations')).rows,beforeJournal);
     assert.deepEqual((await pool.query('SELECT * FROM game_saves ORDER BY id')).rows,before);
     assert.equal((await pool.query("SELECT to_regclass('narrative_context_snapshots') AS t")).rows[0].t,null);
     results.push({mode,database:name,status:'PASS',atomicRejection:true});continue;
    }
    await migrate(drizzle(pool),{migrationsFolder:folder}); await migrate(drizzle(pool),{migrationsFolder:folder});
    if(before)assert.deepEqual((await pool.query('SELECT * FROM game_saves ORDER BY id')).rows,before);
    const names=['narrative_context_snapshots','narrative_generation_requests','narrative_attempts','narrative_sources','narrative_publications','narrative_segments','source_event_links','narrative_outbox'];
    for(const n of names)assert.equal((await pool.query('SELECT to_regclass($1) AS t',[n])).rows[0].t,n);
    results.push({mode,database:name,status:'PASS',schema:'0022',oldSaveRowsPreserved:before?.length??0,
     pgVersion:(await pool.query('SHOW server_version')).rows[0].server_version});
   }finally{await pool.end();}
  }
  console.log(JSON.stringify({results},null,2));
 } finally {await admin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
