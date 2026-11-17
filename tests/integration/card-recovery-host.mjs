// TEST_ONLY child process. No production host/configuration changes.
// Parent sends private connection material over IPC, never command-line arguments.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { createApp } from '../../apps/api/dist/app.js';
import { EmailAuthService } from '../../apps/api/dist/services/email-auth.js';
import { PostgresEmailAuthRepository } from '../../apps/api/dist/services/postgres-email-auth.js';
import { assertLocalCardDatabase } from '../../apps/api/dist/card-import/local-runtime.js';
const requireApi=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const { Pool }=requireApi('pg'), { serve }=requireApi('@hono/node-server');
process.once('message',async config=>{
 assertLocalCardDatabase(config.url);
 const pool=new Pool({connectionString:config.url,max:8});
 const checkpoint=async stage=>{process.send({type:'checkpoint',stage,pid:process.pid});await new Promise(()=>{});};
 // Interpose only to stop at a deterministic boundary. SQL is still the existing
 // service SQL, executed by the real driver; the parent kills this whole process.
 const wrapped=new Proxy(pool,{get(target,key){
  if(key==='connect')return async()=>{
   const client=await pool.connect();let registered=false,completed=false;
   return new Proxy(client,{get(c,k){if(k==='query')return async(sql,...rest)=>{
    const text=typeof sql==='string'?sql:sql.text;
    if(text.startsWith('INSERT INTO card_import.requests'))registered=true;
    if(text.startsWith("UPDATE card_import.requests SET status='completed'"))completed=true;
    if(config.window==='segment'&&text.startsWith('INSERT INTO card_import.group_messages')&&rest[0]?.[3]===1)await checkpoint('first-segment-uncommitted');
    const result=await c.query(sql,...rest);
    if(text==='COMMIT'&&registered&&config.window==='registered')await checkpoint('pending-committed-before-model');
    if(text==='COMMIT'&&completed&&config.window==='committed')await checkpoint('response-committed-before-http');
    return result;
   };const v=c[k];return typeof v==='function'?v.bind(c):v;}});
  };const v=target[key];return typeof v==='function'?v.bind(target):v;
 }});
 const auth=new EmailAuthService(new PostgresEmailAuthRepository(wrapped,config.secret),async(email,code)=>{
  if(!email.endsWith('@example.invalid'))throw Error('SYNTHETIC_ONLY');
  process.send({type:'code',email,code});
 },config.secret);
 const model=async input=>{
  // Durable synthetic-provider ledger survives the API's crash/restart.
  appendFileSync(config.ledger,JSON.stringify({action:input.action,pid:process.pid})+'\n');
  if(config.window==='model')await checkpoint('provider-in-flight');
  if(input.action==='synthetic-failure')throw Error('SYNTHETIC_PROVIDER_FAILURE');
  let payload={};try{payload=JSON.parse(input.messages.at(-1)?.content??'');}catch{}
  return payload.output_contract?.startsWith('JSON object')
   ?JSON.stringify({messages:payload.selected_participant_ids.map(participantId=>({participantId,text:'synthetic segment '+participantId}))})
   :'synthetic response';
 };
 const origin=`http://127.0.0.1:${config.port}`;
 const app=createApp(undefined,undefined,{service:auth,origin},undefined,{pool:wrapped,model,timeoutMs:5000});
 const server=serve({hostname:'127.0.0.1',port:config.port,fetch:r=>app.fetch(r)},()=>process.send({type:'ready',pid:process.pid}));
 process.on('message',m=>{if(m.type==='stop')server.close(()=>pool.end().then(()=>process.exit(0)));});
});
