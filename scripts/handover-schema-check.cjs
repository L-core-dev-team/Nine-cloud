'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {root,req,isolatedPool}=require('./handover-test-support.cjs'),{getTableName}=req('drizzle-orm'),{getTableConfig,PgDialect}=req('drizzle-orm/pg-core');
const name=process.argv[2];if(!/^[a-z0-9-]+$/.test(name??''))throw Error('New run required');const out=path.join(root,'docs/integration/handover-01',name);fs.mkdirSync(out);
const signature=cols=>cols.map(c=>typeof c==='string'?c:c.name).join(','),sort=a=>a.sort(),plainDefault=x=>String(x??'').replace(/::(?:text|integer)/g,'').replace(/^'(.*)'$/,'$1').replaceAll(' ','').toLowerCase();
(async()=>{const pool=await isolatedPool(),client=await pool.connect();try{const schema=await import(pathToFileURL(path.join(root,'packages/db/dist/schema.js')).href),rows=[];let counter=0;
 for(const key of ['narrativeContextSnapshots','narrativeGenerationRequests','narrativeAttempts','narrativeSources','narrativePublications','narrativeSegments','sourceEventLinks','narrativeOutbox']){const table=schema[key],config=getTableConfig(table),tableName=getTableName(table);
  const columns=(await client.query('SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',['public',tableName])).rows;
  assert.equal(columns.length,config.columns.length);for(const c of config.columns){const live=columns.find(x=>x.column_name===c.name);assert.ok(live,c.name);assert.equal(live.data_type,c.getSQLType());assert.equal(live.is_nullable,c.notNull?'NO':'YES');const expected=c.default&&typeof c.default==='object'?new PgDialect().sqlToQuery(c.default).sql:c.default;assert.equal(plainDefault(live.column_default),plainDefault(expected));}
  const constraints=(await client.query(`SELECT c.contype,pg_get_constraintdef(c.oid) AS definition,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.i) AS columns,
    c.confrelid::regclass::text AS target,
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.i) AS target_columns
    FROM pg_constraint c WHERE c.conrelid=$1::regclass`,[tableName])).rows;
  const primary=[...config.columns.filter(c=>c.primary),...config.primaryKeys.flatMap(k=>k.columns)];assert.deepEqual(constraints.filter(c=>c.contype==='p').map(c=>c.columns.join(',')),[signature(primary)]);
  const expectedFk=sort(config.foreignKeys.map(f=>{const r=f.reference();return signature(r.columns)+'->'+getTableName(r.foreignTable)+'('+signature(r.foreignColumns)+')';}));
  assert.deepEqual(sort(constraints.filter(c=>c.contype==='f').map(c=>c.columns.join(',')+'->'+c.target+'('+c.target_columns.join(',')+')')),expectedFk);
  const indexes=(await client.query(`SELECT i.indisunique AS unique,pg_get_expr(i.indpred,i.indrelid) AS predicate,
    ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n ORDER BY k.o) AS columns
    FROM pg_index i WHERE i.indrelid=$1::regclass AND NOT i.indisprimary`,[tableName])).rows;
  const norm=x=>String(x??'').replace(/"[^" ]+"\./g,'').replaceAll('"','').replaceAll("'",'').replace(/::text|\s|[()]/g,'');
  const expectedIndexes=[...config.columns.filter(c=>c.isUnique).map(c=>({cols:c.name,predicate:''})),...config.uniqueConstraints.map(c=>({cols:signature(c.columns),predicate:''})),...config.indexes.filter(i=>i.config.unique).map(i=>({cols:signature(i.config.columns),predicate:i.config.where?new PgDialect().sqlToQuery(i.config.where).sql:''}))];
  assert.deepEqual(sort(indexes.filter(i=>i.unique).map(i=>i.columns.join(',')+'|'+norm(i.predicate))),sort(expectedIndexes.map(i=>i.cols+'|'+norm(i.predicate))));
  const expectedChecks=[];for(const check of config.checks){const temp='handover_check_'+(++counter),sql=new PgDialect().sqlToQuery(check.value).sql.replace(/"[^" ]+"\./g,'');await client.query('CREATE TEMP TABLE '+temp+' ('+config.columns.map(c=>'"'+c.name+'" '+c.getSQLType()).join(',')+', CHECK ('+sql+'))');expectedChecks.push((await client.query("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c'",[temp])).rows[0].d);}
  // PostgreSQL itself parses both expressions: no lossy hand-written equivalence normalizer for checks.
  assert.deepEqual(sort(constraints.filter(c=>c.contype==='c').map(c=>c.definition)),sort(expectedChecks));
  rows.push({table:tableName,columns:columns.length,foreignKeys:expectedFk.length,uniqueIndexes:indexes.length,checks:expectedChecks.length});
 }
 const triggers=(await client.query("SELECT t.tgname,p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('narrative_context_snapshots','narrative_generation_requests','narrative_attempts','narrative_sources','narrative_publications','narrative_segments','source_event_links','narrative_outbox') ORDER BY t.tgname")).rows;
 assert.equal(triggers.length,12);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({status:'PASS',tables:rows,triggers,checksParsedByPostgres:counter,migrationsNotRegenerated:true},null,2));console.log(JSON.stringify({status:'PASS',tables:rows.length,checks:counter,triggers:triggers.length}));
 }finally{client.release();await pool.end();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.log'),e.stack);console.error(e);process.exitCode=1;});
