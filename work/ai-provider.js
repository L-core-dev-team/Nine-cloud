'use strict';
// Provider boundary: no game state writes, no vendor-specific branches.
const JXAI=(()=>{
  const roles={story:'主剧情',director:'剧情导演',stateManager:'状态与记忆',archive:'世界档案',premiumDirector:'高级剧情'};
  const preset={story:'deepseek-flash',director:'gpt-5.6-terra',stateManager:'qwen3.5-plus',archive:'gemini-flash',premiumDirector:'gpt-5.6-sol'};
  const defaults=()=>({version:1,mode:'single',archiveInterval:25,contextCount:8,roles:Object.fromEntries(Object.keys(roles).map(role=>[role,{enabled:role==='story',name:roles[role],baseUrl:'',apiKey:'',model:'',temperature:role==='story'?0.7:0.2,maxTokens:role==='story'?8192:4096,timeout:120}]))});
  function readConfig(){
    const c=defaults();
    try{
      const saved=JSON.parse(sessionStorage.getItem('jx_ai_config')||'null');
      if(saved){Object.assign(c,saved);c.roles=Object.fromEntries(Object.keys(roles).map(r=>[r,{...defaults().roles[r],...saved.roles?.[r]}]));}
      else {const old=JSON.parse(sessionStorage.getItem('jx1_config')||'{}');if(old.endpoint){c.roles.story={...c.roles.story,...old,baseUrl:old.endpoint};c.contextCount=old.contextCount??8;}}
    }catch{}
    return c;
  }
  function endpoint(base){const u=new URL(base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Base URL 必须是无账号、查询参数和片段的 HTTP(S) 地址');u.pathname=u.pathname.replace(/\/+$/,'');if(!u.pathname.endsWith('/chat/completions'))u.pathname+='/chat/completions';return u.href;}
  function validateConfig(c){
    if(!c||typeof c!=='object'||Array.isArray(c)||!c.roles||typeof c.roles!=='object'||Array.isArray(c.roles))throw Error('AI 配置结构无效，请打开设置重新保存');
    if(!['single','multi'].includes(c.mode)||!Number.isInteger(c.archiveInterval)||c.archiveInterval<1||c.archiveInterval>100||!Number.isInteger(c.contextCount)||c.contextCount<0||c.contextCount>12)throw Error('模式、档案周期或历史条数无效');
    for(const r of Object.keys(roles)){
      const p=c.roles[r];if(!p||typeof p.enabled!=='boolean')throw Error('岗位配置无效');
      for(const k of ['baseUrl','apiKey','model'])if(typeof p[k]!=='string')throw Error(roles[r]+'的地址、密钥和模型名称必须为文本，请在设置中修正');
      if(p.baseUrl)endpoint(p.baseUrl);
      if(!Number.isFinite(p.temperature)||p.temperature<0||p.temperature>2||!Number.isInteger(p.maxTokens)||p.maxTokens<128||p.maxTokens>131072||!Number.isFinite(p.timeout)||p.timeout<5||p.timeout>600)throw Error(roles[r]+'参数超出范围');
    }
    return c;
  }
  const ready=p=>!!(p?.enabled===true&&typeof p.baseUrl==='string'&&p.baseUrl.trim()&&typeof p.model==='string'&&p.model.trim());
  // Only AI text uses this tolerant boundary. Save/config imports remain strict.
  function parseAIResponse(text){
    if(typeof text!=='string'||!text.trim())throw Error('Invalid JSON：模型回复为空');
    const source=text.replace(/^\uFEFF/,'').trim();
    function safe(d){
      if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Invalid JSON：根结构必须是对象');
      const stack=[d];while(stack.length){const node=stack.pop();for(const key of Object.keys(node)){
        if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid JSON：包含不安全的数据键');
        if(node[key]&&typeof node[key]==='object')stack.push(node[key]);
      }}return d;
    }
    function decode(s){try{return {ok:true,value:JSON.parse(s)}}catch{return {ok:false}}}
    const direct=decode(source);if(direct.ok)return safe(direct.value);
    // Escape literal controls inside strings and remove trailing commas outside them.
    // Never guess missing quotes/braces, evaluate code, or modify valid string values.
    function repair(s){let out='',quoted=false,escaped=false;
      for(let i=0;i<s.length;i++){const ch=s[i];
        if(quoted){if(escaped){out+=ch;escaped=false;continue}if(ch==='\\'){out+=ch;escaped=true;continue}if(ch==='"')quoted=false;out+=ch.charCodeAt(0)<32?JSON.stringify(ch).slice(1,-1):ch;}
        else {if(ch==='"')quoted=true;if(ch===','&&/^\s*[}\]]/.test(s.slice(i+1)))continue;out+=ch;}
      }return out;
    }
    function objects(s){const found=[];let start=-1,depth=0,quoted=false,escaped=false;
      for(let i=0;i<s.length;i++){const ch=s[i];
        if(start<0){if(ch==='{'||ch==='['){start=i;depth=1;}continue}
        if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue}
        if(ch==='"')quoted=true;else if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']'){if(--depth===0){found.push(s.slice(start,i+1));start=-1}}
      }return found;
    }
    const fences=[...source.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)].map(x=>x[1].trim());
    const candidates=[source,...fences,...objects(source)],values=new Map();
    for(const candidate of candidates){let parsed=decode(candidate);if(!parsed.ok)parsed=decode(repair(candidate));if(parsed.ok){const d=safe(parsed.value);values.set(JSON.stringify(d),d)}}
    if(values.size===1)return values.values().next().value;
    if(values.size>1)throw Error('Invalid JSON：回复包含多个不同 JSON 对象，无法确定本轮结果');
    throw Error('Invalid JSON：无法提取完整 JSON，原始回复已保留，可重试格式整理');
  }
  const parseJSON=parseAIResponse;
  const logs=[],totals={calls:0,inputTokens:0,outputTokens:0,unknownUsage:0};
  function redact(message,configs){let s=String(message);for(const p of Object.values(configs.roles||{}))if(p.apiKey)s=s.split(p.apiKey).join('[已隐藏]');return s.replace(/Bearer\s+\S+/gi,'Bearer [已隐藏]').replace(/sk-[A-Za-z0-9_-]+/g,'[已隐藏]');}
  function sanitize(message,configs){return redact(message,configs).slice(0,400);}
  function addLog(entry){logs.push(entry);if(logs.length>200)logs.shift();}
  async function call(role,messages,c,signal,meta={},fetcher=fetch){
    const p=c.roles[role];if(!ready(p))throw Error(roles[role]+'尚未配置 AI 接口。');
    const ac=new AbortController(),start=performance.now();let timedOut=false;
    const abort=()=>ac.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>{timedOut=true;ac.abort()},p.timeout*1000);
    const log={time:new Date().toISOString(),turn:meta.turn??null,runId:meta.runId??null,role,model:sanitize(p.model,c),durationMs:0,inputTokens:null,outputTokens:null,success:false,fallback:!!meta.fallback,stage:meta.stage||role};
    try{
      const headers={'Content-Type':'application/json'};if(p.apiKey)headers.Authorization='Bearer '+p.apiKey;
      const response=await fetcher(endpoint(p.baseUrl),{method:'POST',headers,signal:ac.signal,body:JSON.stringify({model:p.model,messages,temperature:p.temperature,max_tokens:p.maxTokens,stream:false})});
      if(!response.ok){let detail='';try{const d=await response.json();detail=d.error?.message||d.message||''}catch{}throw Error('HTTP '+response.status+(detail?'：'+sanitize(detail,c):''));}
      const data=await response.json(),choice=data.choices?.[0],content=choice?.message?.content;
      const text=typeof content==='string'?content:Array.isArray(content)?content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join(''):null;
      log.inputTokens=Number.isSafeInteger(data.usage?.prompt_tokens)&&data.usage.prompt_tokens>=0?data.usage.prompt_tokens:null;
      log.outputTokens=Number.isSafeInteger(data.usage?.completion_tokens)&&data.usage.completion_tokens>=0?data.usage.completion_tokens:null;
      if(choice?.finish_reason==='length'){const e=Error('回复长度达到上限，请提高 maxTokens 后重试');e.rawResponse=text;e.truncated=true;throw e;}
      if(typeof text!=='string'||!text.trim())throw Error('接口未返回有效文本');
      log.success=true;return text;
    }catch(e){const msg=timedOut?'Timeout：请求超时':signal?.aborted?'已取消':sanitize(e.message,c);log.error=msg;const err=new Error(msg);if(e.rawResponse){err.rawResponse=redact(e.rawResponse,c);err.truncated=!!e.truncated}if(signal?.aborted)err.name='AbortError';throw err}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);log.durationMs=Math.round(performance.now()-start);totals.calls++;totals.inputTokens+=log.inputTokens||0;totals.outputTokens+=log.outputTokens||0;if(log.inputTokens===null||log.outputTokens===null)totals.unknownUsage++;addLog(log);}
  }
  return {roles,preset,defaults,readConfig,validateConfig,endpoint,ready,parseJSON,parseAIResponse,call,logs,totals,sanitize,redact,addLog};
})();
