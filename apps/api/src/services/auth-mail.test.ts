import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import type {Pool} from 'pg';
const mocks=vi.hoisted(()=>({send:vi.fn(),verify:vi.fn(),invalidate:vi.fn()}));
vi.mock('nodemailer',()=>({default:{createTransport:()=>({sendMail:mocks.send,verify:mocks.verify})}}));
vi.mock('./postgres-email-auth.js',()=>({PostgresEmailAuthRepository:class {
 issue=async()=>true;
 invalidate=mocks.invalidate;
}}));
import {createEmailAuthRuntime} from './auth-runtime.js';
const env={AUTH_ENABLED:'true',AUTH_PUBLIC_ORIGIN:'https://app.example.invalid',AUTH_SECRET:'x'.repeat(32),AUTH_MAIL_FROM:'login@example.invalid',SMTP_URL:'smtps://user:secret@mail.example.invalid:465'};
beforeEach(()=>{vi.resetAllMocks();vi.spyOn(console,'info').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>vi.restoreAllMocks());
describe('SMTP provider acceptance and preflight',()=>{
 it('returns sent only after the intended recipient is accepted',async()=>{
  mocks.send.mockResolvedValue({accepted:['a@example.invalid'],rejected:[],messageId:'private-message-id'});
  const runtime=createEmailAuthRuntime({} as Pool,env)!;
  expect(await runtime.service.requestCode('A@example.invalid')).toBe('sent');
  expect(mocks.send.mock.calls[0]![0].text).toMatch(/验证码：\d{6}/);
  const log=String(vi.mocked(console.info).mock.calls[0]![0]);
  expect(log).toContain('PROVIDER_ACCEPTED');expect(log).not.toContain('private-message-id');expect(log).not.toContain('a@example.invalid');
 });
 it('rejects wrong recipient, rejected recipient and missing provider acknowledgement',async()=>{
  for(const result of [{accepted:[],rejected:['a@example.invalid']},{accepted:['other@example.invalid'],rejected:[]},{}]){
   mocks.send.mockResolvedValue(result);
   await expect(createEmailAuthRuntime({} as Pool,env)!.service.requestCode('a@example.invalid')).rejects.toMatchObject({code:'MAIL_REJECTED'});
  }
  expect(mocks.invalidate).toHaveBeenCalledTimes(3);
 });
 it('preflight reports connection only and does not send a message',async()=>{
  const runtime=createEmailAuthRuntime({} as Pool,env)!;mocks.verify.mockResolvedValue(true);
  expect(await runtime.verifyMail()).toEqual({status:'SMTP_CONNECTION_VERIFIED',delivery:'NOT_TESTED'});
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.verify.mockRejectedValue({code:'EAUTH',message:'private-password'});
  await expect(runtime.verifyMail()).rejects.toMatchObject({code:'MAIL_AUTH_FAILED',stage:'mail_connect'});
 });
});
