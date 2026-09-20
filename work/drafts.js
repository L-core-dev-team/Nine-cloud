function writeDraft(storage,s,text){storage.setItem(STORE+'_draft_'+s.id,JSON.stringify({turn:s.turn,text}))}
function readDraft(storage,s){
  if(s.pending)return '';
  const raw=storage.getItem(STORE+'_draft_'+s.id);
  if(!raw)return '';
  try{const d=JSON.parse(raw);return d.turn===s.turn&&typeof d.text==='string'?d.text:''}catch{return ''}
}
function restoreDraft(s){
  try{$('#input').value=s?readDraft(localStorage,s):''}catch{toast('无法读取行动草稿。')}
}
function clearDraft(s){try{localStorage.removeItem(STORE+'_draft_'+s.id)}catch{toast('行动已保存，但未能清理旧草稿；旧草稿不会在下一回合恢复。')}}
