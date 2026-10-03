import {it,expect,vi,afterEach} from 'vitest';
import {cloudRequest} from './cloud-sync';
afterEach(()=>vi.unstubAllGlobals());
it('preserves bounded auth failure metadata without server secrets',async()=>{
 vi.stubGlobal('fetch',async()=>Response.json({code:'MAIL_AUTH_FAILED',stage:'mail_connect',requestId:'12345678-1234-1234-1234-123456789abc',message:'private smtp credentials'}, {status:503}));
 let error:unknown;try{await cloudRequest('/api/auth/code','POST',{});}catch(value){error=value;}
 expect(error).toMatchObject({code:'MAIL_AUTH_FAILED',stage:'mail_connect',status:503});expect(JSON.stringify(error)).not.toContain('private');
 vi.stubGlobal('fetch',async()=>new Response('x'.repeat(5000),{status:503}));
 await expect(cloudRequest('/api/auth/code','POST',{})).rejects.toMatchObject({status:503,code:undefined});
});
