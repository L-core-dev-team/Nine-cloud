'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createRequire}=require('module'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../..'),req=createRequire(path.join(root,'packages/db/package.json')),{Pool}=req('pg');
const evidence=path.join(root,'docs/integration/t1-v2-gate-review-01');
async function pool(name,user='gate_review_admin'){
 assert.ok(/^jiuxiao_test_gate-[a-z0-9-]+$/.test(name)||name==='postgres');
 const p=new Pool({connectionString:`postgresql://${user}@127.0.0.1:55463/${name}`,connectionTimeoutMillis:3000,max:12});
 try {
  // Verify the cluster via its administrator, without granting settings access to the app.
  if(user!=='gate_review_admin'){const admin=await pool(name);await admin.end();}
  const r=(await p.query(user==='gate_review_admin'
   ? "SELECT current_setting('data_directory') AS d,inet_server_port() AS p,current_database() AS db"
   : "SELECT inet_server_port() AS p,current_database() AS db")).rows[0];
  if(r.d)assert.equal(r.d.toLowerCase().replaceAll('\\','/'),'j:/gate-review-01/pgdata-02');
  assert.equal(r.p,55463);assert.equal(r.db,name);return p;
 }catch(e){await p.end();throw e;}
}
async function createDatabase(name){const p=await pool('postgres');try{await p.query('CREATE DATABASE "'+name+'"');}finally{await p.end();}return pool(name);}
async function migrate(p){const {drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');await migrate(drizzle(p),{migrationsFolder:path.join(root,'packages/db/drizzle')});}
const load=n=>import(pathToFileURL(path.join(root,'apps/api/dist/services/'+n+'.js')).href);
const {fixture}=require('../handover-test-support.cjs');
async function recordOwner(c,f,mode='managed'){
 await c.query(`INSERT INTO narrative_receipt_ownership(owner_id,save_id,request_key,receipt_sha,protocol_version,
  ownership,request_narrative,renderer_version,context_version,branch_id)
  SELECT $1,$2,$3,encode(sha256(convert_to(result::text,'UTF8')),'hex'),2,$4,$5,'handover-fixture-v1','authority-context-v1','root'
  FROM turn_requests WHERE save_id=$2 AND idempotency_key=$3`,[f.owner,f.saveId,f.key,mode,mode==='managed']);
}
async function seedManaged(p){const f=await fixture(p,{seed:false}),s=await load('narrative-publication-repository'),c=await p.connect();try{await c.query('BEGIN');await recordOwner(c,f);f.generation=await s.seedNarrativeInTransaction(c,{ownerId:f.owner,receipt:f.receipt,save:f.save,rendererVersion:'handover-fixture-v1'});await c.query('UPDATE narrative_receipt_ownership SET generation_id=$1 WHERE save_id=$2 AND request_key=$3',[f.generation,f.saveId,f.key]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return f;}
module.exports={root,evidence,req,pool,createDatabase,migrate,load,fixture,recordOwner,seedManaged};
