import {expect,it,vi} from 'vitest';
import { EventEmitter } from 'node:events';
const state=vi.hoisted(()=>({ options:null as any, hostname:'', lookupResult:'' }));
vi.mock('node:dns/promises',()=>({lookup:vi.fn(async()=>[{address:'8.8.8.8',family:4}])}));
vi.mock('node:https',()=>({
 Agent:class { constructor(public options:unknown){} },
 request:(url:URL,options:any,callback:(res:any)=>void)=>{
  state.options=options;state.hostname=url.hostname;
  options.lookup(url.hostname,{},(_error:unknown,ip:string)=>{state.lookupResult=ip;});
  const req=new EventEmitter() as EventEmitter & {end:(body:string)=>void;destroy:()=>void};
  req.destroy=()=>{};req.end=()=>{const res=new EventEmitter() as EventEmitter & {statusCode:number;headers:object};res.statusCode=200;res.headers={'content-type':'application/json'};callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from('{}'));res.emit('end');});};
  return req;
 },
}));
import {createCardEgressFetch} from './provider-egress.js';
it('connects with a pinned IPv4 lookup and the original TLS hostname without proxy agent reuse',async()=>{
 const fetcher=createCardEgressFetch({allowedHosts:['provider.example']});
 const response=await fetcher('https://provider.example/v1',{method:'POST',body:'{}',redirect:'error',credentials:'omit'});
 expect(await response.text()).toBe('{}');expect(state.hostname).toBe('provider.example');expect(state.lookupResult).toBe('8.8.8.8');
 expect(state.options.family).toBe(4);expect(state.options.agent.options).toEqual({keepAlive:false});
});
