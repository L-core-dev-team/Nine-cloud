function loadLibrary(storage){
  let raw;
  try{raw=storage.getItem(STORE)}catch{return {blocked:true,error:'无法访问浏览器存储，暂不能保存。'}}
  if(raw===null)return {library:{version:1,active:null,saves:[]},damaged:null};
  try{
    const d=JSON.parse(raw);
    if(!recordObject(d)||d.version!==1||!Array.isArray(d.saves))throw Error('格式');
    d.saves.forEach(validateSave);
    if(new Set(d.saves.map(s=>s.id)).size!==d.saves.length||d.active!==null&&!d.saves.some(s=>s.id===d.active))throw Error('索引');
    return {library:d,damaged:null};
  }catch{return {damaged:raw,error:'存档库读取失败。原数据已保留；下次保存前会先创建恢复备份。'}}
}
function commitLibrary(storage,next,damaged){
  if(damaged!==null){
    const key=STORE+'_recovery_'+uid();
    storage.setItem(key,damaged);
    storage.setItem(STORE+'_recovery_latest',key);
  }
  storage.setItem(STORE,JSON.stringify(next));
}
function exportRecovery(){
  try{
    const key=localStorage.getItem(STORE+'_recovery_latest');
    const text=damagedLibrary??(key?localStorage.getItem(key):null);
    if(text===null)return toast('没有检测到损坏存档备份。');
    download('九霄-原始恢复备份-'+Date.now()+'.json',text);
  }catch{toast('浏览器存储不可访问，无法读取恢复备份。')}
}
