// Dev launcher companion; reuses the existing Hono app, Session service and synthetic adapter.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../apps/api/dist/app.js';
import { EmailAuthService } from '../../apps/api/dist/services/email-auth.js';
import { PostgresEmailAuthRepository } from '../../apps/api/dist/services/postgres-email-auth.js';
import { localCardOptions, verifyLocalCardSchema } from '../../apps/api/dist/card-import/local-runtime.js';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=requireApi('pg'),{serve}=requireApi('@hono/node-server');
const state=JSON.parse(process.env.CARD_DEMO_RUNTIME || 'null');
delete process.env.CARD_DEMO_RUNTIME;
if(process.env.NODE_ENV!=='development'||state?.root!==fileURLToPath(new URL('../../',import.meta.url))||
  ![state.port,state.webPort,state.apiPort].every(p=>Number.isInteger(p)&&p>0&&p<=65535)||
  ![state.appPassword,state.secret].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))) {
  throw Error('LOCAL_RUNTIME_IDENTITY_REQUIRED');
}
const url=new URL(`postgresql://cards_demo_app@127.0.0.1:${state.port}/jiuxiao_test_cards_demo`);url.password=state.appPassword;
const pool=new Pool({connectionString:url.href,max:6});
const identity=await pool.query(`SELECT current_user=session_user AND session_user='cards_demo_app'
  AND current_database()='jiuxiao_test_cards_demo'
  AND pg_has_role(session_user,'jiuxiao_card_runtime','USAGE')
  AND NOT pg_has_role(session_user,'jiuxiao_card_erasure','MEMBER')
  AND NOT has_database_privilege(current_database(),'CREATE')
  AND NOT has_schema_privilege('card_import','CREATE')
  AND NOT has_schema_privilege('public','CREATE')
  AND NOT has_table_privilege('card_import.model_allowances','DELETE,TRUNCATE')
  AND NOT has_table_privilege('card_import.model_calls','DELETE,TRUNCATE')
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_has_role(session_user,r.oid,'MEMBER') AND
    (r.rolname NOT IN ('cards_demo_app','jiuxiao_card_runtime') OR r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication))
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname IN ('public','card_import') AND pg_has_role(session_user,c.relowner,'MEMBER'))
  AS allowed`);
if(identity.rows[0]?.allowed!==true){await pool.end();throw Error('LOCAL_RUNTIME_AUTHORITY_REJECTED');}
const cards=localCardOptions(pool,{NODE_ENV:'development',CARD_LOCAL_MODE:process.env.CARD_LOCAL_MODE||'synthetic',CARD_LOCAL_CONFIG:process.env.CARD_LOCAL_CONFIG,NARRATIVE_KEY_CARD_LOCAL:process.env.NARRATIVE_KEY_CARD_LOCAL,DATABASE_URL:url.href,API_HOST:'127.0.0.1'});
await verifyLocalCardSchema(pool);
const origin=`http://127.0.0.1:${state.webPort}`;
const auth=new EmailAuthService(new PostgresEmailAuthRepository(pool,state.secret),async(email,code)=>{
  if(!email.endsWith('@example.invalid'))throw Error('SYNTHETIC_EMAIL_ONLY');
  console.log(`LOCAL_DEMO_CODE ${email} ${code} (synthetic identity only)`);
},state.secret);
// No lifecycle/export/production model configuration is injected into the demo.
const app=createApp(undefined,undefined,{service:auth,origin},undefined,cards);
const server=serve({hostname:'127.0.0.1',port:state.apiPort,fetch:request=>{
  if(![`127.0.0.1:${state.webPort}`,`127.0.0.1:${state.apiPort}`].includes(new URL(request.url).host))return new Response('LOCAL_HOST_REQUIRED',{status:403});
  return app.fetch(request);
}},()=>console.log(`LOCAL_CARDS_READY http://127.0.0.1:${state.apiPort}/ready`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>void pool.end()));
