import {createCardEgressFetch} from '../../../apps/api/dist/card-import/provider-egress.js';

const send=createCardEgressFetch({allowedHosts:['api.openai.com']});
export function playerTransport(key){
  return async (wire,requestId,signal)=>{
    if(wire.model!=='gpt-6-luna'||wire.max_completion_tokens!==512||wire.service_tier!=='default'||wire.reasoning_effort!=='none')throw Error('MODEL_CONFIGURATION');
    const upper=wire.messages.reduce((n,m)=>n+16+Buffer.byteLength(m.content)+Buffer.byteLength(m.role),32);
    if(upper+1024+512>8192)throw Error('CONTEXT_LIMIT');
    const res=await send('https://api.openai.com/v1/chat/completions',{method:'POST',redirect:'error',credentials:'omit',
      headers:{authorization:'Bearer '+key,'content-type':'application/json','X-Client-Request-Id':requestId},
      body:JSON.stringify(wire),signal:AbortSignal.any([signal,AbortSignal.timeout(75000)])});
    const raw=await res.text();
    if(raw.includes(key))throw Error('PRIVATE_RESPONSE');
    return {status:res.status,text:async()=>raw};
  };
}
export function playerNarrator(key){
  if(!key?.trim())return undefined;
  const transport=playerTransport(key);
  return async(wire,receipt,signal)=>{
    const res=await transport(wire,receipt.idempotencyKey,signal);
    if(res.status!==200)throw Object.assign(Error('PROVIDER_DECLINED'),{code:'PROVIDER_DECLINED'});
    const body=JSON.parse(await res.text()),first=body.choices?.[0];
    if(body.model!==wire.model||body.service_tier!=='default'||body.choices.length!==1||first.finish_reason!=='stop'||
       first.message?.refusal||first.message?.tool_calls||typeof first.message?.content!=='string'||!first.message.content.trim())throw Error('UNCONFIRMED_PROSE');
    return first.message.content;
  };
}
