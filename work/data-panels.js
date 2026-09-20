function archivePanel(parent,title,text){
  if(!text)return;
  const details=el('details'),body=el('div',text,'v1-stack');
  details.append(el('summary',title),body);parent.append(details);
}
function renderData(s){
  const status=$('#statusPane'),intel=$('#intelPane'),memory=$('#memoryPane');
  status.replaceChildren();intel.replaceChildren();memory.replaceChildren();
  const player={...s.player};
  if(s.legacy.migration?.version>=2)delete player['物品栏'];
  status.append(el('div',format(player),'v1-stack'),el('h3','当前物品'),el('div',inventoryText(s.items),'v1-stack'));
  archivePanel(status,'导入时的角色原文 · 历史档案',s.legacy.status);
  intel.append(el('div',format({所在地:s.world.location,导入时间基准:s.world.importedTime||'未记录',此后推进分钟:s.world.elapsedMinutes,情报:s.world.intel||[]}),'v1-stack'));
  for(const npc of s.npcs.filter(x=>x.visibility!=='GM_ONLY')){
    const details=el('details');details.append(el('summary',npc.name));
    const labels={identity:'身份',location:'所在地点',relationship:'关系',current_state:'近况',goals:'目标',known_information:'已知信息',record:'导入记录'};
    const info=Object.fromEntries(Object.entries(labels).filter(([k])=>npc[k]!=null).map(([k,v])=>[v,npc[k]]));
    details.append(el('div',format(info),'v1-stack'));intel.append(details);
  }
  archivePanel(intel,'导入时的情报原文 · 历史档案',s.legacy.intel);
  memory.append(el('div',`短期记忆 ${s.stm.length}/6\n${s.stm.map(e=>e.summary).join('\n\n')}\n\n长期记忆 ${s.ltm.length}\n${s.ltm.map(e=>e.summary).join('\n\n')}\n\n重要事实\n${s.facts.join('\n')}`,'v1-stack'));
  archivePanel(memory,'导入时的记忆原文 · 历史档案',s.legacy.memory);
}
function recoverUnanswered(s){
  let start=s.messages.length;
  while(start>0&&s.messages[start-1].role==='user')start--;
  if(start===s.messages.length)return;
  const unanswered=s.messages.splice(start);
  s.legacy.unanswered=clone(unanswered);
  s.pending={id:uid(),text:unanswered.map(m=>m.content).join('\n\n'),gm:false,source:'IMPORTED_UNANSWERED'};
}
