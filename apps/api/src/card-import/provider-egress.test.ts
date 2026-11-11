import {expect,it,vi} from 'vitest';
import {createCardEgressFetch} from './provider-egress.js';
const init={method:'POST',headers:{authorization:'Bearer synthetic'},body:'{}',redirect:'error' as const,credentials:'omit' as const};
it('pins a verified address for the approved host',async()=>{
 const resolve=vi.fn(async()=>[{address:'8.8.8.8',family:4}]);
 const send=vi.fn(async (_url:URL,_init:RequestInit,_ip:string)=>new Response('{}'));
 const run=createCardEgressFetch({allowedHosts:['provider.example']},resolve,send);
 await run('https://provider.example/v1/chat/completions',init);
 expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0]![2]).toBe('8.8.8.8');
});
it('rejects unapproved host, IP literal, non-HTTPS, redirects, custom ports and metadata URL before sending',async()=>{
 const resolve=vi.fn(async()=>[{address:'8.8.8.8',family:4}]);const send=vi.fn();
 const run=createCardEgressFetch({allowedHosts:['provider.example']},resolve,send);
 for(const url of ['http://provider.example','https://evil.example','https://127.0.0.1','https://169.254.169.254','https://provider.example:8443','https://provider.example/?x=1']) await expect(run(url,init)).rejects.toThrow('CARD_EGRESS_DENIED');
 await expect(run('https://provider.example',{...init,redirect:'follow'})).rejects.toThrow('CARD_EGRESS_DENIED');
 expect(resolve).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});
it('rejects private, reserved, IPv6, mixed and empty DNS answers, including rebinding',async()=>{
 const send=vi.fn();
 for(const rows of [[],[{address:'127.0.0.1',family:4}],[{address:'10.1.2.3',family:4}],[{address:'169.254.169.254',family:4}],[{address:'::1',family:6}],[{address:'8.8.8.8',family:4},{address:'192.168.1.1',family:4}]]) {
  const run=createCardEgressFetch({allowedHosts:['provider.example']},async()=>rows,send);
  await expect(run('https://provider.example',init)).rejects.toThrow('CARD_EGRESS_DENIED');
 }
 const resolve=vi.fn().mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'10.0.0.1',family:4}]);
 const allowedSend=vi.fn(async()=>new Response('{}'));const run=createCardEgressFetch({allowedHosts:['provider.example']},resolve,allowedSend);
 await run('https://provider.example',init);await expect(run('https://provider.example',init)).rejects.toThrow('CARD_EGRESS_DENIED');expect(allowedSend).toHaveBeenCalledOnce();
});
it('fails closed for invalid policy and cancelled request',async()=>{
 expect(()=>createCardEgressFetch({allowedHosts:['127.0.0.1']})).toThrow('CARD_EGRESS_POLICY_INVALID');
 const signal=new AbortController();signal.abort();const send=vi.fn();
 const run=createCardEgressFetch({allowedHosts:['provider.example']},async()=>[{address:'8.8.8.8',family:4}],send);
 await expect(run('https://provider.example',{...init,signal:signal.signal})).rejects.toThrow('CARD_EGRESS_CANCELLED');expect(send).not.toHaveBeenCalled();
});
