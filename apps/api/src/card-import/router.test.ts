import { describe, it, expect } from 'vitest';
import { parseFile } from './parser.js';
import { createCardImportRouter } from './router.js';
import type { CardImportService } from './service.js';

describe('card HTTP boundary before service calls',()=>{
 const app=createCardImportRouter({} as CardImportService,{resolveOwnerId:async()=> 'A'},'http://card.test');
 const post=(path:string,data:unknown,headers:Record<string,string>={})=>app.request(path,{method:'POST',headers:{Origin:'http://card.test','Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 it('rejects oversized text and account-switch header before model or storage',async()=>{
  expect((await post('/sessions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/actions',{action:'x'.repeat(8001)})).status).toBe(400);
  expect((await post('/imports',{}, {'x-jiuxiao-account':'B'})).status).toBe(403);
 });
 it.each([
   {mode:'manual',requireAllSelected:true}, {mode:'auto',requireAllSelected:true},
   {requireAllSelected:true}, {mode:'multi',requireAllSelected:'true'}, {mode:'multi',requireAllSelected:null},
 ])('rejects invalid strict multi options before admission: %o',async options=>{
   const response=await post('/sessions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/group-actions',{action:'test',...options});
   expect(response.status).toBe(400);
   expect(await response.json()).toMatchObject({error:'INVALID_GROUP_MODE'});
 });
 it('rejects a strict flag on a single-character action',async()=>{
   const response=await post('/sessions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/actions',{action:'test',requireAllSelected:true});
   expect(await response.json()).toMatchObject({error:'INVALID_GROUP_MODE'});
 });
 it('rejects malformed attachment links and unsupported methods',async()=>{
  expect((await post('/cards',{links:[{}]})).status).toBe(400);
  expect((await app.request('/native/turns')).status).toBe(404);
 });
 it('rejects PostgreSQL-incompatible text explicitly without destroying original bytes',()=>{
  const b=Buffer.from('{"entries":{"x":"\\u0000"}}');expect(()=>parseFile(b,'worldbook')).toThrow('UNSUPPORTED_JSON_TEXT');expect(b.toString()).toContain('\\u0000');
 });
});
