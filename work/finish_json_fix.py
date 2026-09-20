from pathlib import Path
p=Path('work/v1.js')
s=p.read_text(encoding='utf-8')
start=s.index('async function request(messages,')
end=s.index('\n',start)
s=s[:start]+'''async function request(messages,c,signal,max=c.maxTokens){const cfg=JXAI.defaults();cfg.roles.story={...cfg.roles.story,...c,enabled:true,baseUrl:c.endpoint,maxTokens:max};return JXAI.call('story',messages,cfg,signal,{stage:'连接测试'})}'''+s[end:]
anchor=" if(s.pending?.draftNarrative)"
idx=s.index(anchor)
s=s[:idx]+''' if(s.pending?.rawResponse){const details=el('details','','msg ai');details.append(el('summary','查看保留的模型原始回复'));details.append(el('div',s.pending.rawResponse.text||'',''));box.append(details)}
 if(s.pending?.failure&&!s.pending.draftNarrative)box.append(el('div',s.pending.failure,'readmark'));
'''+s[idx:]
s=s.replace("if(!e.persistenceFailure)updatePending(p=>p.failure=message);toast(message)","if(!e.persistenceFailure){try{updatePending(p=>p.failure=message)}catch{}}toast(message)")
p.write_text(s,encoding='utf-8')
