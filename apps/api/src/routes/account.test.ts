import {Hono} from 'hono';
import {describe,it,expect,vi} from 'vitest';
import {mountAccount} from './account.js';
import type {EmailAuthService} from '../services/email-auth.js';
import type {AccountLifecycle} from '../services/account-lifecycle.js';
import type {AccountExport} from '../services/account-export.js';
function fixture(){const app=new Hono();const lifecycle={capabilities:()=>({emailChange:true,close:false,permanentDelete:false}),begin:vi.fn(),verify:vi.fn(),complete:vi.fn(),cancel:vi.fn()};const exporter={read:vi.fn(async()=>({account:{id:'owner-a'},data:{}}))};const auth={resolve:vi.fn(async(token:string|null)=>token?{ownerId:'owner-a',email:'a@example.invalid',expiresAt:new Date()}:null)};mountAccount(app,auth as unknown as EmailAuthService,lifecycle as unknown as AccountLifecycle,exporter as unknown as AccountExport,'https://fixture.invalid');return{app,lifecycle,exporter};}
describe('account HTTP owner and input boundary',()=>{
 it('refuses missing session and mismatched expected owner before reading data',async()=>{const f=fixture();expect((await f.app.request('/api/account/export')).status).toBe(401);expect((await f.app.request('/api/account/export',{headers:{cookie:'jx_session=fixture-token','x-jiuxiao-account':'owner-b'}})).status).toBe(401);expect(f.exporter.read).not.toHaveBeenCalled();});
 it('exports only the verified session owner and refuses injected owner fields',async()=>{const f=fixture();expect((await f.app.request('/api/account/export',{headers:{cookie:'jx_session=fixture-token'}})).status).toBe(200);expect(f.exporter.read).toHaveBeenCalledWith('owner-a');const response=await f.app.request('/api/account/operation/begin',{method:'POST',headers:{cookie:'jx_session=fixture-token','content-type':'application/json'},body:JSON.stringify({operation:'email_change',newEmail:'new@example.invalid',ownerId:'owner-b'})});expect(response.status).toBe(400);expect(f.lifecycle.begin).not.toHaveBeenCalled();});
});
