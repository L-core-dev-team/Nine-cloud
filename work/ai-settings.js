Object.assign(JXAI,(()=>{
  function mount(){
    const modal=el('div');modal.id='multiAIModal';modal.className='modal';modal.setAttribute('aria-hidden','true');
    const body=el('div',undefined,'modalbox ai-config');body.append(el('h2','AI 接口与调度'));
    body.append(el('p','配置仅保存在当前浏览器会话，不写入游戏存档或分享包。兼容 Chat Completions；可填写 Base URL 或完整请求地址。'));
    const mode=el('select');mode.id='aiMode';mode.setAttribute('aria-label','AI 模式');for(const [v,t] of [['single','单 AI'],['multi','多 AI · 五岗位']]){const o=el('option',t);o.value=v;mode.append(o)}body.append(mode);
    const personal=el('button','君煜推荐配置','v1-btn');personal.onclick=()=>{for(const r of Object.keys(JXAI.roles)){$('#ai-'+r+'-model').value=JXAI.preset[r];$('#ai-'+r+'-enabled').checked=true}mode.value='multi';refreshMode();toast('已填入任务书个人预设，请核对服务商实际 Model ID；尚未保存。')};body.append(personal);
    body.append(el('p','个人预设来自作者任务书，型号是否可用以你的接口为准。'));
    for(const [r,name] of Object.entries(JXAI.roles)){
      const group=el('details');group.id='ai-role-'+r;group.open=r==='story';group.append(el('summary',name));
      const enabled=el('input');enabled.type='checkbox';enabled.id='ai-'+r+'-enabled';const enabledLabel=el('label');enabledLabel.append(enabled,document.createTextNode('启用'));group.append(enabledLabel);
      const fields=[['baseUrl','Base URL','url'],['apiKey','API Key','password'],['model','Model','text'],['temperature','Temperature','number'],['maxTokens','最大回复 tokens','number'],['timeout','超时秒数','number']];
      for(const [key,label,type] of fields){
        const l=el('label',label),input=el('input');input.type=type;input.id='ai-'+r+'-'+key;input.autocomplete='off';if(key==='temperature')input.step='0.1';l.htmlFor=input.id;group.append(l);
        if(key==='apiKey'){
          const wrap=el('div',undefined,'api-key-wrap'),toggle=el('button','显示','api-key-toggle');toggle.type='button';toggle.setAttribute('aria-label','显示 API Key');
          toggle.onclick=()=>{const visible=input.type==='text';input.type=visible?'password':'text';toggle.textContent=visible?'显示':'隐藏';toggle.setAttribute('aria-label',(visible?'显示':'隐藏')+' API Key')};
          wrap.append(input,toggle);group.append(wrap);
        }else group.append(input);
      }
      const test=el('button','测试连接','v1-btn'),line=el('div');line.id='ai-'+r+'-test';line.setAttribute('role','status');test.onclick=async()=>{
        test.disabled=true;line.textContent='测试中…';
        try{const c=collect();c.roles[r].enabled=true;const message=r==='stateManager'?'只返回JSON {"ok":true}':'只回复：连接成功';const t=await JXAI.call(r,[{role:'user',content:message}],c,null,{stage:'连接测试'});if(r==='stateManager'&&JXAI.parseJSON(t).ok!==true)throw Error('Invalid JSON：预期 ok=true');line.textContent='连接成功'}catch(e){line.textContent=JXAI.sanitize(e.message,collectSafe())}finally{test.disabled=false}
      };group.append(test,line);body.append(group);
    }
    for(const [key,label] of [['archiveInterval','档案整理周期（回合）'],['contextCount','近期历史消息条数（0–12）']]){const l=el('label',label),input=el('input');input.id='ai-'+key;input.type='number';l.htmlFor=input.id;body.append(l,input)}
    const save=el('button','保存配置','v1-btn');save.onclick=()=>{try{const c=collect();sessionStorage.setItem('jx_ai_config',JSON.stringify(c));close('multiAIModal');badge();toast('AI 配置已保存于当前会话')}catch(e){toast(e.message)}};
    const logs=el('button','调用记录','v1-btn');logs.setAttribute('aria-label','调用日志与 Token');logs.onclick=showLogs;
    const done=el('button','关闭','v1-btn');done.onclick=()=>close('multiAIModal');
    const content=el('div',undefined,'ai-config-content');while(body.firstChild)content.append(body.firstChild);
    const footer=el('div',undefined,'ai-config-footer');footer.append(save,logs,done);body.append(content.querySelector('h2'),content,footer);
    modal.append(body);document.body.append(modal);mode.onchange=refreshMode;
    const logModal=el('div');logModal.id='aiLogsModal';logModal.className='modal';const lb=el('div',undefined,'modalbox');lb.append(el('h2','AI 调用记录'));const output=el('pre');output.id='aiLogsText';lb.append(output);const lc=el('button','关闭','v1-btn');lc.onclick=()=>close('aiLogsModal');lb.append(lc);logModal.append(lb);document.body.append(logModal);
  }
  function collectSafe(){const c=JXAI.defaults();c.mode=$('#aiMode').value;for(const r of Object.keys(JXAI.roles)){const p=c.roles[r];p.enabled=$('#ai-'+r+'-enabled').checked;for(const k of ['baseUrl','apiKey','model'])p[k]=$('#ai-'+r+'-'+k).value.trim();for(const k of ['temperature','maxTokens','timeout'])p[k]=Number($('#ai-'+r+'-'+k).value)}for(const k of ['archiveInterval','contextCount'])c[k]=Number($('#ai-'+k).value);return c;}
  function collect(){return JXAI.validateConfig(collectSafe())}
  function refreshMode(){for(const r of Object.keys(JXAI.roles))if(r!=='story')$('#ai-role-'+r).hidden=$('#aiMode').value==='single'}
  function settings(){const c=JXAI.readConfig();$('#aiMode').value=c.mode;for(const r of Object.keys(JXAI.roles)){for(const k of ['baseUrl','apiKey','model','temperature','maxTokens','timeout'])$('#ai-'+r+'-'+k).value=c.roles[r][k];$('#ai-'+r+'-enabled').checked=c.roles[r].enabled;$('#ai-'+r+'-test').textContent=''}for(const k of ['archiveInterval','contextCount'])$('#ai-'+k).value=c[k];refreshMode();open('multiAIModal')}
  function showLogs(){
    const rows=JXAI.logs,input=JXAI.totals.inputTokens,output=JXAI.totals.outputTokens,unknown=JXAI.totals.unknownUsage;
    $('#aiLogsText').textContent=`当前会话最近 ${rows.length} 条记录\n已报告输入 ${input} / 输出 ${output} tokens\n${unknown} 次调用未报告用量，未按0估算。无可靠价格，不计算费用。\n\n`+rows.map(x=>`${x.time} · 回合 ${x.turn??'测试'} · ${JXAI.roles[x.role]} · ${x.model}\n${x.stage} · ${x.success?'成功':'失败'}${x.fallback?' · 回退':''} · ${x.durationMs??'—'} ms · 输入 ${x.inputTokens??'未知'} / 输出 ${x.outputTokens??'未知'}\n${x.error||''}`).join('\n\n');open('aiLogsModal');
  }
  return {mount,settings,showLogs};
})());
