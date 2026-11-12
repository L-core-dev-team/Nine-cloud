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
 it('rejects malformed attachment links and unsupported methods',async()=>{
  expect((await post('/cards',{links:[{}]})).status).toBe(400);
  expect((await app.request('/native/turns')).status).toBe(404);
 });
 it('rejects PostgreSQL-incompatible text explicitly without destroying original bytes',()=>{
  const b=Buffer.from('{"entries":{"x":"\\u0000"}}');expect(()=>parseFile(b,'worldbook')).toThrow('UNSUPPORTED_JSON_TEXT');expect(b.toString()).toContain('\\u0000');
 });
});
