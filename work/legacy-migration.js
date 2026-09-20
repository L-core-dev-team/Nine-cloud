// Old snapshots remain archived verbatim; only explicit fields are migrated.
function migrateLegacy(s) {
  const last=[...s.messages].reverse().find(m=>m.role==='assistant');
  const doc=new DOMParser().parseFromString(last?.content||'', 'text/html');
  const sections=[...doc.body.children].filter(e=>e.tagName==='DETAILS');
  const section=word=>sections.find(e=>e.querySelector('summary')?.textContent.includes(word));
  const fields=text=>{
    const result={}; let key=null;
    for(const line of text.split('\n')) {
      const match=line.match(/^[-*] \*\*([^*]+)\*\*\s*[:：]\s*(.*)$/);
      if(match){key=match[1];result[key]=match[2].trim()}
      else if(key&&line.trim())result[key]+='\n'+line.trim();
    }
    return result;
  };
  const status=section('角色状态');
  if(status){const copy=status.cloneNode(true);copy.querySelector('summary')?.remove();Object.assign(s.player,fields(copy.textContent));}
  const intel=section('综合情报');
  if(intel){
    s.npcs=[...intel.querySelectorAll('details')].map((node,i)=>{
      const name=node.querySelector('summary')?.textContent.trim()||'未署名人物';
      return {id:'legacy-npc-'+i,name,record:node.textContent.trim(),visibility:'PLAYER_KNOWN',source:'IMPORTED_SAVE'};
    });
    const copy=intel.cloneNode(true);copy.querySelectorAll('summary,details').forEach(n=>n.remove());
    const f=fields(copy.textContent);
    if(f['当前区域'])s.world.location=f['当前区域'].replace(/^\[|\]$/g,'');
    if(f['当前时间'])s.world.importedTime=f['当前时间'];
    s.world.intel=Object.entries(f).filter(([k])=>!['当前区域','当前时间','人物关系管理'].includes(k)).map(([k,v])=>k+'：'+v);
  }
  const memory=section('星记忆回廊');let kind=null;
  for(const line of (memory?.textContent||'').split('\n')){
    if(line.includes('[STM]'))kind='stm';if(line.includes('[LTM]'))kind='ltm';
    const cells=line.split('|').map(x=>x.trim());
    if(kind&&cells.length>=6&&/^\d+$/.test(cells[1]))s[kind].push({id:'legacy-'+kind+'-'+cells[1],summary:cells[4],time:cells[2],scene:cells[3],eventIds:[],source:'IMPORTED_SAVE'});
  }
  // Six old STM may already have a matching LTM. Keep them out of the new archive cycle.
  if(s.stm.length>5){s.legacy.recentMemory=s.stm;s.stm=[];}
  s.turn=s.messages.filter(m=>m.role==='assistant').length;
  if(s.player['姓名'])s.name=s.player['姓名'].split(/[（(]/)[0].trim();
  s.legacy.migration={version:1,character:!!status,intel:!!intel,memory:!!memory,note:'原文保留；物品及数量暂按角色物品栏原文读取；旧历法时间仅作基准标签，不换算天数。'};
  return s;
}
