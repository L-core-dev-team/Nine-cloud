'use strict';
const path=require('node:path'),{createRequire}=require('node:module');const req=createRequire(path.resolve(__dirname,'../packages/db/package.json'));const {Pool}=req('pg');
const name=process.argv[2];if(!/^jiuxiao_test_handover[-_][a-z0-9_-]+$/.test(name??''))throw Error('NEW_HANDOVER_DATABASE_NAME_REQUIRED');
const pool=new Pool({connectionString:'postgresql://handover_tester@127.0.0.1:55461/postgres',connectionTimeoutMillis:3000,query_timeout:5000});
(async()=>{try{const row=(await pool.query("SELECT current_user, inet_server_port() AS port, current_setting('data_directory') AS directory")).rows[0];
 if(row.current_user!=='handover_tester'||row.port!==55461||row.directory.replaceAll('\\','/').toLowerCase()!=='j:/pgdata-handover-02')throw Error('ISOLATION_GUARD_FAILED');
 await pool.query('CREATE DATABASE "'+name+'"');console.log(JSON.stringify({...row,created:name,noDropOrReset:true}));
}finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
