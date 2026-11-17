import { lookup } from 'node:dns/promises';
import { Agent, request } from 'node:https';
import { isIP } from 'node:net';

/** Server-owned destination configuration. Never construct from a card or player text. */
export type CardEgressPolicy = { allowedHosts: readonly string[] };
type Address = { address:string; family:number };
type Resolver = (hostname:string) => Promise<readonly Address[]>;
type Sender = (url:URL, init:RequestInit, address:string) => Promise<Response>;

// Fail closed for special-use ranges; intentionally no IPv6 support in this first gate.
function publicIPv4(address:string): boolean {
 if(isIP(address)!==4) return false;
 const a=address.split('.').map(Number), x=a[0]!, y=a[1]!, z=a[2]!;
 return !(x===0 || x===10 || x===127 || x>=224 || (x===100&&y>=64&&y<=127) || (x===169&&y===254) || (x===172&&y>=16&&y<=31) || (x===192&&(y===168||y===0||y===88&&z===99)) || (x===198&&(y===18||y===19||y===51&&z===100)) || (x===203&&y===0&&z===113));
}
const defaultResolver:Resolver = async hostname => lookup(hostname,{all:true,verbatim:true});

/** Connect to the checked IP while retaining the original hostname for TLS and Host. */
const pinnedSender:Sender = (url,init,address) => new Promise((resolve,reject)=>{
 const headers=new Headers(init.headers); const requestHeaders:Record<string,string>={};headers.forEach((v,k)=>{requestHeaders[k]=v;});
 const req=request(url,{method:'POST',headers:requestHeaders,signal:init.signal??undefined,agent:new Agent({keepAlive:false}),family:4,lookup:(_host,_opts,callback)=>callback(null,address,4)},res=>{
  const chunks:Buffer[]=[];let size=0;
  res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000){req.destroy(new Error('PROVIDER_RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});
  res.on('error',reject);
  res.on('end',()=>{const responseHeaders=new Headers();for(const [k,v] of Object.entries(res.headers))if(v!==undefined)responseHeaders.set(k,Array.isArray(v)?v.join(', '):v);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode??500,headers:responseHeaders}));});
 });
 req.on('error',reject);
 if(typeof init.body!=='string'){req.destroy();reject(new Error('PROVIDER_INVALID_BODY'));return;}
 req.end(init.body);
});

/** Deny unknown hosts, redirects, non-public answers and DNS rebinding before forwarding credentials. */
export function createCardEgressFetch(policy:CardEgressPolicy, resolve:Resolver=defaultResolver, send:Sender=pinnedSender):typeof fetch {
 const hosts=new Set(policy.allowedHosts.map(host=>host.toLowerCase()));
 if(!hosts.size || [...hosts].some(host=>!host || host.endsWith('.') || isIP(host)!==0 || !/^[a-z0-9.-]+$/.test(host))) throw new Error('CARD_EGRESS_POLICY_INVALID');
 return async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.protocol!=='https:' || url.port && url.port!=='443' || url.username || url.password || url.search || url.hash || !hosts.has(url.hostname.toLowerCase()) || init?.method!=='POST' || init.redirect!=='error' || init.credentials!=='omit') throw new Error('CARD_EGRESS_DENIED');
  const addresses=await resolve(url.hostname);
  if(!addresses.length || addresses.some(row=>row.family!==4||!publicIPv4(row.address))) throw new Error('CARD_EGRESS_DENIED');
  if(init.signal?.aborted) throw new Error('CARD_EGRESS_CANCELLED');
  return send(url,init,addresses[0]!.address);
 };
}
