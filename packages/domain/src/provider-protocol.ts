import { providerHttp } from './provider-http.js';

type Protocol='openai-chat'|'openai-responses'|'anthropic-messages'|'gemini-content';
export type ProviderConfig={protocol:Protocol;baseUrl:string;model:string;keyEnv:string;temperature?:number;top_p?:number};
export type ProviderMessage={role:'user'|'assistant';content:string};
type ProviderInput={mode:'legacy';prompt:string;maxOutputTokens:number}|{mode:'card';system:string;messages:readonly ProviderMessage[];maxOutputTokens:number};
const protocols=['openai-chat','openai-responses','anthropic-messages','gemini-content'];

/** Shared protocol construction and parsing; no game or card semantics. */
export function createProviderTransport(config:ProviderConfig,env:Record<string,string|undefined>,fetcher:typeof fetch=fetch) {
 if(!config||!protocols.includes(config.protocol)||typeof config.model!=='string'||!config.model.trim()||config.model.length>200||/[\r\n\0]/.test(config.model)||typeof config.keyEnv!=='string'||!/^NARRATIVE_KEY_[A-Z0-9_]+$/.test(config.keyEnv))throw new Error('INVALID_PROVIDER_CONFIG');
 const url=new URL(config.baseUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('PROVIDER_HTTPS_REQUIRED');
 const key=env[config.keyEnv];if(!key)throw new Error('PROVIDER_CREDENTIAL_MISSING');
 for(const [value,min,max] of [[config.temperature,0,2],[config.top_p,0,1]] as const)if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max))throw new Error('INVALID_PROVIDER_PARAMETER');
 return async(input:ProviderInput,signal:AbortSignal)=>{
  const endpoint=new URL(url);let path=url.pathname.replace(/\/+$/,'').replace(/\/(chat\/completions|responses|messages)$/,'');
  const headers:Record<string,string>={'content-type':'application/json'};let body:unknown;
  const omitSampling=['claude-opus-5-5','claude-sonnet-5','claude-sonnet-5-5','gemini-3.8-flash'].includes(config.model.trim().toLowerCase());
  const sample={...(omitSampling||config.temperature===undefined?{}:{temperature:config.temperature}),...(omitSampling||config.top_p===undefined?{}:{top_p:config.top_p})};
  // Adjacent messages of the same role are joined with explicit boundaries for providers requiring alternation.
  const turns:ProviderMessage[]=[];
  if(input.mode==='card') for(const m of input.messages) {
   if((m.role!=='user'&&m.role!=='assistant')||typeof m.content!=='string') throw new Error('INVALID_CARD_MESSAGE');
   const prior=turns[turns.length-1]; if(prior?.role===m.role) prior.content+='\n\n---\n\n'+m.content; else turns.push({...m});
  }
  if(input.mode==='card'&&(typeof input.system!=='string'||!input.system||!turns.length||turns[0]?.role!=='user'||turns[turns.length-1]?.role!=='user')) throw new Error('INVALID_CARD_MESSAGE');
  if(config.protocol==='gemini-content'){
   endpoint.pathname=path.replace(/\/v1(beta)?$/,'')+`/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;headers['x-goog-api-key']=key;
   body=input.mode==='legacy'?{contents:[{role:'user',parts:[{text:input.prompt}]}],generationConfig:{maxOutputTokens:input.maxOutputTokens,...(sample.temperature===undefined?{}:{temperature:sample.temperature}),...(sample.top_p===undefined?{}:{topP:sample.top_p})}}:{systemInstruction:{parts:[{text:input.system}]},contents:turns.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:input.maxOutputTokens,...(sample.temperature===undefined?{}:{temperature:sample.temperature}),...(sample.top_p===undefined?{}:{topP:sample.top_p})}};
  }else{
   if(!/\/v\d+(beta)?$/.test(path))path+='/v1';
   endpoint.pathname=path+(config.protocol==='openai-chat'?'/chat/completions':config.protocol==='openai-responses'?'/responses':'/messages');
   if(config.protocol==='anthropic-messages'){headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';}
   else headers.authorization=`Bearer ${key}`;
   if(input.mode==='legacy') body=config.protocol==='openai-responses'?{model:config.model,input:input.prompt,...sample,max_output_tokens:input.maxOutputTokens,store:false,stream:false}:{model:config.model,messages:[{role:'user',content:input.prompt}],...sample,max_tokens:input.maxOutputTokens,stream:false};
   else if(config.protocol==='openai-responses') body={model:config.model,input:[{role:'system',content:input.system},...turns],...sample,max_output_tokens:input.maxOutputTokens,store:false,stream:false};
   else if(config.protocol==='anthropic-messages') body={model:config.model,system:input.system,messages:turns,...sample,max_tokens:input.maxOutputTokens,stream:false};
   else body={model:config.model,messages:[{role:'system',content:input.system},...turns],...sample,max_tokens:input.maxOutputTokens,stream:false};
  }
  try{
   const data=await providerHttp(fetcher,endpoint,headers,body,signal) as any;
   if(!data||data.error)throw new Error('INVALID_PROVIDER_OUTPUT');
   const parts=(rows:unknown)=>Array.isArray(rows)?rows.filter(p=>p&&p.thought!==true&&(p.type===undefined||p.type==='text'||p.type==='output_text')).map(p=>typeof p.text==='string'?p.text:'').join(''):'';
   let output='',tokens:unknown;
   if(config.protocol==='openai-chat'){const c=data.choices?.[0];output=typeof c?.message?.content==='string'?c.message.content:parts(c?.message?.content);tokens=data.usage?.completion_tokens;}
   else if(config.protocol==='openai-responses'){output=(Array.isArray(data.output)?data.output:[]).filter((p:{type?:string})=>p.type==='message').map((p:{content?:unknown})=>parts(p.content)).join('');tokens=data.usage?.output_tokens;}
   else if(config.protocol==='anthropic-messages'){output=parts(data.content);tokens=data.usage?.output_tokens;}
   else{output=parts(data.candidates?.[0]?.content?.parts);tokens=data.usageMetadata?.candidatesTokenCount;}
   if(!output.trim()||output.length>100_000||(tokens!==undefined&&tokens!==null&&(!Number.isSafeInteger(tokens)||Number(tokens)<0||Number(tokens)>input.maxOutputTokens)))throw new Error('INVALID_PROVIDER_OUTPUT');
   return {text:output,outputTokens:tokens===undefined||tokens===null?null:Number(tokens)};
  }catch{throw new Error(signal.aborted?'PROVIDER_CANCELLED':'PROVIDER_UNAVAILABLE');}
 };
}
