async function runTurn(){
  if(busy)return;const s=current();if(!s?.pending)return;
  const c=JXAI.readConfig();if(!JXAI.ready(c.roles.story)){toast('尚未配置 AI 接口。角色和行动已保存。');settings();return}
  try{JXAI.validateConfig(c)}catch(e){toast(e.message);return}
  busy=true;controller=new AbortController();render();
  function updatePending(fn){if(!mutate(l=>{const target=l.saves.find(x=>x.id===s.id);if(target?.pending?.id!==s.pending.id)throw Error('回合已变化');fn(target.pending)}))throw Error('未能保存正文草稿，已停止后续调用')}
  try{
    const info=await JXAI.run(s,c,controller.signal,async narrative=>updatePending(p=>{p.draftNarrative=narrative;p.failure=null}));
    if(controller.signal.aborted)throw Object.assign(Error('已取消'),{name:'AbortError'});
    if(info.unsettled){updatePending(p=>p.failure=info.warnings.join('\n'));toast('正文已保留，状态尚未结算；重试将继续结算。');return}
    const next=JXAI.applyExtensions(apply(s,info.result),info.result,info);
    if(!mutate(l=>{const i=l.saves.findIndex(x=>x.id===s.id);if(l.saves[i].pending?.id!==s.pending.id)throw Error('回合已变化');l.saves[i]=next}))return;
    toast(info.warnings.length?'本回合已保存，部分调用回退或字段未写入，可在情报中查看。':'本回合已保存');
    const review=await JXAI.archive(next,c,controller.signal);
    if(review)mutate(l=>{const target=l.saves.find(x=>x.id===next.id);if(target?.turn===next.turn)target.archiveReview=review});
  }catch(e){toast(e.name==='AbortError'?'已取消，行动与已生成正文保留。':'未提交回合：'+JXAI.sanitize(e.message,c))}
  finally{busy=false;controller=null;render()}
}
