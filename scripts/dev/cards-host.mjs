// Dev launcher companion; reuses the existing Hono app, Session service and synthetic adapter.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../apps/api/dist/app.js';
import { EmailAuthService } from '../../apps/api/dist/services/email-auth.js';
import { PostgresEmailAuthRepository } from '../../apps/api/dist/services/postgres-email-auth.js';
import { localCardOptions, verifyLocalCardSchema } from '../../apps/api/dist/card-import/local-runtime.js';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=requireApi('pg'),{serve}=requireApi('@hono/node-server');
const state=JSON.parse(await readFile(new URL('../../.cards-local/state.json',import.meta.url),'utf8'));
if(process.env.NODE_ENV!=='development'||state.root!==fileURLToPath(new URL('../../',import.meta.url))||!state.installed)throw Error('LOCAL_DEMO_IDENTITY_REQUIRED');
const url=new URL(`postgresql://cards_local@127.0.0.1:${state.port}/jiuxiao_test_cards_demo`);url.password=state.password;
const pool=new Pool({connectionString:url.href,max:6});
const cards=localCardOptions(pool,{NODE_ENV:'development',CARD_LOCAL_MODE:'synthetic',DATABASE_URL:url.href,API_HOST:'127.0.0.1'});
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
