const fs=require('node:fs');
const {Pool}=require(process.cwd()+'/apps/api/node_modules/pg');
const root='C:/Users/11954/Documents/Codex/p3-test-tools/p3-p6-stage1';
const database=JSON.parse(fs.readFileSync(root+'/migrations.json')).results[0].database;
(async()=>{const p=new Pool({connectionString:'postgresql://p3tester@127.0.0.1:55441/'+database});try{
 const q=await p.query("SELECT count(*) AS sources, coalesce(sum(utf16_length),0) AS utf16_units, coalesce(sum(utf8_length),0) AS utf8_bytes, pg_total_relation_size('narrative_sources') AS source_relation_bytes, pg_database_size(current_database()) AS database_bytes FROM narrative_sources");
 const tables=await p.query("SELECT relname,pg_total_relation_size(relid)::text AS bytes FROM pg_stat_user_tables WHERE relname LIKE 'narrative_%' OR relname='source_event_links' ORDER BY relname");
 const result={database,kind:'synthetic-test-sample-not-production-quota',rows:q.rows,tables:tables.rows,backup:'BLOCKED: bundled PostgreSQL lacks pg_dump/pg_restore binaries; no backup generated'};
 fs.writeFileSync(root+'/capacity.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await p.end();}})().catch(e=>{console.error(e);process.exitCode=1});
