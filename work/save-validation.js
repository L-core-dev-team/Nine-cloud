function recordObject(x){return !!x&&typeof x==='object'&&!Array.isArray(x)}
function validNPCs(x){return Array.isArray(x)&&x.every(n=>recordObject(n)&&typeof n.id==='string'&&n.id.trim()&&typeof n.name==='string'&&n.name.trim()&&['GM_ONLY','PLAYER_KNOWN'].includes(n.visibility))&&new Set(x.map(n=>n.id)).size===x.length}
function validateSave(s){
  if(!recordObject(s)||typeof s.id!=='string'||typeof s.name!=='string'||!recordObject(s.player)||!recordObject(s.world)||!recordObject(s.legacy))throw Error('存档基础资料无效');
  if(!Number.isSafeInteger(s.turn)||s.turn<0||!Number.isSafeInteger(s.world.elapsedMinutes)||s.world.elapsedMinutes<0||typeof s.world.location!=='string')throw Error('存档回合或时间无效');
  if(!Array.isArray(s.messages)||s.messages.some(m=>!recordObject(m)||!['user','assistant'].includes(m.role)||typeof m.content!=='string'))throw Error('存档消息无效');
  if(!validItems(s.items)||!validNPCs(s.npcs))throw Error('存档物品或人物无效');
  for(const k of ['events','stm','ltm'])if(!Array.isArray(s[k])||s[k].some(e=>!recordObject(e)||typeof e.id!=='string'||typeof e.summary!=='string'))throw Error('存档记忆无效：'+k);
  if(s.stm.length>5||!Array.isArray(s.actions)||s.actions.length>6||s.actions.some(x=>typeof x!=='string')||!Array.isArray(s.facts)||s.facts.some(x=>typeof x!=='string')||!Array.isArray(s.supplements))throw Error('存档列表无效');
  if(s.pending&&(!recordObject(s.pending)||typeof s.pending.id!=='string'||!s.pending.id||typeof s.pending.text!=='string'||!s.pending.text.trim()))throw Error('待处理行动无效');
  if(/"(?:__proto__|constructor|prototype)"\s*:/.test(JSON.stringify(s)))throw Error('非法数据键');
  return s;
}
function mergeItems(previous,incoming){
  if(incoming===null)return previous;
  return incoming.map(x=>({...previous.find(p=>p.id===x.id),...x}));
}
