from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
a=s.index('try{const d=JSON.parse(localStorage.getItem(STORE))');b=s.index('const current=',a)
s=s[:a]+Path('work/storage-recovery.js').read_text(encoding='utf-8')+"\nconst loadedLibrary=loadLibrary(localStorage);let damagedLibrary=loadedLibrary.damaged??null;const storageBlocked=!!loadedLibrary.blocked;if(loadedLibrary.library)library=loadedLibrary.library;if(loadedLibrary.error)toast(loadedLibrary.error);\n"+s[b:]
s=s.replace('function persist(next){localStorage.setItem(STORE,JSON.stringify(next));library=next}',"function persist(next){if(storageBlocked)throw Error('存储不可访问');commitLibrary(localStorage,next,damagedLibrary);damagedLibrary=null;library=next}")
s=s.replace("[['存档列表',saveList],", "[['导出原始恢复备份',exportRecovery],['存档列表',saveList],")
s=s.replace('sampleSnapshot:MATERIALS.personal,', 'sampleSnapshot:MATERIALS.personal,loadLibrary,commitLibrary,')
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8')
tests="""
test('损坏存档库保留原文，不伪装成空库',()=>{const loaded=j.loadLibrary({getItem:()=>'{bad json'});assert(loaded.damaged==='{bad json'&&!loaded.library&&!loaded.blocked)});
test('存储读取被拒绝时禁止继续写入',()=>{assert(j.loadLibrary({getItem:()=>{throw Error('denied')}}).blocked)});
test('新存档覆盖前先备份损坏原文',()=>{const calls=[];j.commitLibrary({setItem:(k,v)=>calls.push({k,v})},{version:1,active:null,saves:[]},'OLD DATA');assert(calls.length===3&&calls[0].v==='OLD DATA'&&calls[1].k.endsWith('_recovery_latest')&&calls[2].k==='jiuxiao_v1_library')});
test('备份写入失败时原存档不被覆盖',()=>{const calls=[];reject(()=>j.commitLibrary({setItem:(k,v)=>{calls.push(k);throw Error('quota')}},{},'OLD'));assert(calls.length===1&&calls[0]!=='jiuxiao_v1_library')});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
