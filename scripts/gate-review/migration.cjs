'use strict';
const fs=require('fs'),path=require('path'),{createHash}=require('crypto');
const {root,evidence,req}=require('./support.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function prepareRoles(admin){
 for(const role of ['jiuxiao_narrative_operator','jiuxiao_narrative_erasure','jiuxiao_narrative_schema_owner','jiuxiao_narrative_runtime'])
  if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)
   await admin.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 for(const role of ['gr01_app','gr01_operator','gr01_eraser','gr01_retired'])
  if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)
   await admin.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
 await admin.query('GRANT jiuxiao_narrative_operator TO gr01_operator');
 await admin.query('GRANT jiuxiao_narrative_erasure TO gr01_eraser');
 await admin.query('GRANT jiuxiao_narrative_runtime TO gr01_app');
}
function buildCandidate(run,destination=evidence){
 const folder=path.join(destination,'isolated-migration-bundle-'+run);fs.mkdirSync(folder);fs.mkdirSync(path.join(folder,'meta'));
 const journal=JSON.parse(fs.readFileSync(path.join(root,'packages/db/drizzle/meta/_journal.json'))),original=[];
 for(const entry of journal.entries){const name=entry.tag+'.sql',b=fs.readFileSync(path.join(root,'packages/db/drizzle',name));fs.writeFileSync(path.join(folder,name),b);original.push({path:name,sha256:sha(b)});}
 const sql=fs.readFileSync(path.join(root,'docs/integration/pending/0023_narrative_ownership_v2.sql'));
 fs.writeFileSync(path.join(folder,'0023_narrative_ownership_v2.sql'),sql);
 journal.entries.push({idx:23,version:'7',when:1792108800000,tag:'0023_narrative_ownership_v2',breakpoints:true});
 fs.writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify(journal,null,2));
 fs.writeFileSync(path.join(destination,'migration-bundle-manifest-'+run+'.json'),JSON.stringify({mode:'development-only-alternate-journal',productionJournalUnchanged:true,original,pending0023Sha256:sha(sql)},null,2),{flag:'wx'});
 return folder;
}
async function migrateCandidate(p,folder){const {drizzle}=req('drizzle-orm/node-postgres'),{migrate}=req('drizzle-orm/node-postgres/migrator');await migrate(drizzle(p),{migrationsFolder:folder});}
async function grantApplication(admin){
 await admin.query('GRANT USAGE ON SCHEMA public TO gr01_app,gr01_eraser,gr01_retired');
 await admin.query('GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO gr01_app');
 await admin.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO gr01_app,gr01_eraser');
 await admin.query('REVOKE ALL ON narrative_writer_fence FROM gr01_app');
 await admin.query('GRANT SELECT ON narrative_writer_fence TO gr01_app');
 await admin.query('REVOKE UPDATE ON narrative_receipt_ownership FROM gr01_app');
 await admin.query('GRANT UPDATE(generation_id) ON narrative_receipt_ownership TO gr01_app');
 // No DELETE/TRUNCATE/DDL, role membership, gate writes or legacy-import ability for app.
 await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO gr01_eraser');
 await admin.query('REVOKE ALL ON narrative_writer_fence FROM gr01_eraser');
 await admin.query('GRANT SELECT ON narrative_writer_fence TO gr01_eraser');
 await admin.query('REVOKE INSERT,UPDATE ON narrative_receipt_ownership FROM gr01_eraser');
 // Application INSERT must not manufacture a trusted legacy inventory row.
 await admin.query('REVOKE INSERT ON narrative_receipt_ownership FROM gr01_app');
 await admin.query(`GRANT INSERT(owner_id,save_id,request_key,receipt_sha,protocol_version,ownership,
   request_narrative,renderer_version,context_version,branch_id) ON narrative_receipt_ownership TO gr01_app`);
}
module.exports={prepareRoles,buildCandidate,migrateCandidate,grantApplication};
