import { buildProbeRequest, type ProtocolId, type ProbeRequest } from './ai-protocols';
import { filterSamplingParameters } from './ai-model-compatibility';

/** Round 2 minimum approved parameters. No arbitrary body fields or saved drafts pass through. */
export const generationParameterWhitelist = ['temperature','top_p','max_tokens'] as const;
export function buildGenerationRequest(protocol:ProtocolId,baseUrl:string,model:string,key:string,prompt:string,raw:unknown):ProbeRequest {
  if(!prompt.trim()||prompt.length>100_000)throw new Error('INVALID_PROMPT');
  const config=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const bounded=(name:string,min:number,max:number)=>Object.hasOwn(config,name)&&typeof config[name]==='number'&&Number.isFinite(config[name])&&config[name]>=min&&config[name]<=max?config[name] as number:undefined;
  const max=bounded('max_tokens',1,131072);if(max!==undefined&&!Number.isInteger(max))throw new Error('INVALID_OUTPUT_LIMIT');
  const temperature=bounded('temperature',0,2),topP=bounded('top_p',0,1);
  const sampling=filterSamplingParameters(model,{...(temperature===undefined?{}:{temperature}),...(topP===undefined?{}:{topP})});
  const request=buildProbeRequest(protocol,baseUrl,model,key);
  const values={...(sampling.temperature===undefined?{}:{temperature:sampling.temperature}),...(sampling.topP===undefined?{}:{top_p:sampling.topP})};
  const tokens=max??4096;
  if(protocol==='openai-chat')request.body={model,messages:[{role:'user',content:prompt}],...values,max_tokens:tokens,stream:false};
  else if(protocol==='openai-responses')request.body={model,input:prompt,...values,max_output_tokens:tokens,store:false,stream:false};
  else if(protocol==='anthropic-messages')request.body={model,messages:[{role:'user',content:prompt}],...values,max_tokens:tokens,stream:false};
  else request.body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{...(sampling.temperature===undefined?{}:{temperature:sampling.temperature}),...(sampling.topP===undefined?{}:{topP:sampling.topP}),maxOutputTokens:tokens}};
  return request;
}
