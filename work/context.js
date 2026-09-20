// Character ceiling is a transport safeguard, not a model token estimate.
function context(s){
  const limit=60000,q=s.pending.text;
  const keys=[...new Set((q.match(/[\u4e00-\u9fff]{2,}/g)||[]).flatMap(t=>Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2))))];
  const ranked=s.ltm.map((e,i)=>({e,i,score:keys.filter(k=>e.summary.includes(k)).length})).sort((a,b)=>b.score-a.score||b.i-a.i).slice(0,5).map(x=>x.e);
  const state={player:s.player,npcs:s.npcs,world:s.world,items:s.items,facts:s.facts,stm:s.stm,legacy:s.legacy.migration?{migration:s.legacy.migration,recentMemory:s.legacy.recentMemory}:s.legacy};
  const data={state,ltm:[],materials:[],supplements:s.supplements};
  const first={role:'system',content:RULES},last={role:'user',content:JSON.stringify(s.pending)};
  const recent=[];
  const size=()=>JSON.stringify([first,{role:'system',content:JSON.stringify(data)},...recent,last]).length;
  if(size()>limit)throw Error('角色、记忆或补充资料已超过上下文容量，请先导出备份并精简补充资料；本次行动已保留');
  for(const e of ranked){data.ltm.push(e);if(size()>limit)data.ltm.pop()}
  // Prefer latest narrative, and never split a message mid-sentence.
  for(const m of s.messages.slice(-Math.min(12,config().contextCount||8)).reverse()){
    recent.unshift({role:m.role,content:m.legacy?legacyParts(m.content).story:m.content});
    if(size()>limit){recent.shift();break}
  }
  for(const material of selectSources(s,q)){data.materials.push(material);if(size()>limit)data.materials.pop()}
  return [first,{role:'system',content:JSON.stringify(data)},...recent,last];
}
