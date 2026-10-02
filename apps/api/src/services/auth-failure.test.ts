import {describe,it,expect} from 'vitest';
import {classifyMailFailure,AuthFailure} from './auth-failure.js';
import {EmailAuthService,type EmailAuthRepository} from './email-auth.js';
import {createApp} from '../app.js';
describe('sanitized auth failure stages',()=>{
 it('classifies provider failure without exposing its message',()=>{
  for(const [code,expected,stage] of [['EAUTH','MAIL_AUTH_FAILED','mail_connect'],['ETIMEDOUT','MAIL_UNAVAILABLE','mail_connect'],['EENVELOPE','MAIL_REJECTED','mail_send']]){
   const failure=classifyMailFailure({code,message:'private SMTP secret'});
   expect(failure).toMatchObject({code:expected,stage});expect(failure.requestId).toMatch(/^[a-f0-9-]{36}$/);expect(JSON.stringify(failure)).not.toContain('private');
  }
 });
 it('never calls mail when storing the code fails and returns a traceable stage',async()=>{
  let sent=false;const repo={issue:async()=>{throw new Error('private database');}} as unknown as EmailAuthRepository;
  const service=new EmailAuthService(repo,async()=>{sent=true;},'x'.repeat(32));
  const app=createApp(undefined,undefined,{service,origin:'https://game.example.invalid'});
  const response=await app.request('/api/auth/code',{method:'POST',headers:{origin:'https://game.example.invalid','content-type':'application/json'},body:JSON.stringify({email:'a@example.invalid'})});
  expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:'VERIFICATION_STORE_FAILED',stage:'verification_store'});expect(sent).toBe(false);
 });
 it('invalidates a challenge after a provider refusal',async()=>{
  let invalidated=false;const repo={issue:async()=>true,issueIpLimit:async()=>true,refundIssue:async()=>{},invalidate:async()=>{invalidated=true;}} as unknown as EmailAuthRepository;
  const service=new EmailAuthService(repo,async()=>{throw new AuthFailure('MAIL_REJECTED','mail_send');},'x'.repeat(32));
  await expect(service.requestCode('a@example.invalid')).rejects.toMatchObject({code:'MAIL_REJECTED'});expect(invalidated).toBe(true);
 });
 it('permits only configured credentialed HTTPS frontend and secure cross-site cookie',async()=>{
  const repo={issue:async()=>true,consume:async()=>({ownerId:'a',email:'a@example.invalid',expiresAt:new Date(Date.now()+60000)})} as unknown as EmailAuthRepository;
  const service=new EmailAuthService(repo,async()=>{},'x'.repeat(32));const origin='https://app.example.invalid';
  const app=createApp(undefined,undefined,{service,origin,cookieSameSite:'None'});
  const preflight=await app.request('/api/auth/code',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
  expect(preflight.status).toBe(204);expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
  const response=await app.request('/api/auth/verify',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'a@example.invalid',code:'123456'})});
  expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('SameSite=None');expect(response.headers.get('set-cookie')).toContain('Secure');expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect((await app.request('/api/auth/code',{method:'OPTIONS',headers:{origin:'https://evil.invalid','access-control-request-method':'POST'}})).status).toBe(403);
  expect(()=>createApp(undefined,undefined,{service,origin:'http://localhost:4173',cookieSameSite:'None'})).toThrow('HTTPS');
 });
});
