const {createRequire}=require('node:module');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {Pool}=createRequire('/app/apps/api/package.json')('pg');
const url=process.env.TEST_DATABASE_URL;
if(!url || !new URL(url).pathname.startsWith('/jiuxiao_test'))throw Error('ISOLATED_TEST_DATABASE_REQUIRED');
const pool=new Pool({connectionString:url,max:1});
(async()=>{
 const client=await pool.connect();
 try{
  const dir='/app/packages/db/drizzle/';
  const entries=JSON.parse(readFileSync(dir+'meta/_journal.json','utf8')).entries;
  for(const entry of entries.filter(e=>e.idx<=16)){
   await client.query(readFileSync(dir+entry.tag+'.sql','utf8').replace(/--> statement-breakpoint/g,''));
  }
  await client.query("INSERT INTO auth_accounts(id,email) VALUES ('legacy-test-owner','fixture@example.invalid')");
  const original=(await client.query("SELECT id,email,created_at,closed_at FROM auth_accounts WHERE id='legacy-test-owner'")).rows;
  const fix=readFileSync('/tests/0023_legacy_0017_0019_catchup.sql','utf8').replace(/--> statement-breakpoint/g,'');
  await client.query(fix);
  await client.query(fix);
  const after=(await client.query("SELECT id,email,created_at,closed_at FROM auth_accounts WHERE id='legacy-test-owner'")).rows;
  assert.deepEqual(after,original);
  const columns=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='auth_accounts' AND column_name IN ('is_guest','last_seen_at')) OR (table_name='game_saves' AND column_name IN ('branch_id','canon_artifact_hash')) OR (table_name='npc_authorized_observation_outbox' AND column_name='grant_id_version'))")).rows;
  assert.equal(columns.length,5);
  const pin=(await client.query("SELECT proconfig FROM pg_proc WHERE proname='protect_game_save_memory_policy'")).rows[0];
  assert.ok(pin.proconfig.includes('search_path=pg_catalog, public, pg_temp'));
  await client.query("INSERT INTO auth_accounts(id,email,is_guest,last_seen_at) VALUES ('guest-test-owner',NULL,true,now())");
  console.log(JSON.stringify({legacyUpgrade:'PASS',repeatUpgrade:'PASS',existingOwnerPreserved:true,guestInsert:'PASS',requiredColumns:columns.length,functionSearchPath:'PASS'}));
 }finally{client.release();await pool.end()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
