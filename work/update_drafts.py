from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
s=s.replace('function render(){',Path('work/drafts.js').read_text(encoding='utf-8')+'\nfunction render(){')
s=s.replace("const s=current(), box=$('#messages');box.replaceChildren();", "const s=current(), box=$('#messages');restoreDraft(s);box.replaceChildren();")
s=s.replace("$('#input').value='';render();await runTurn()", "clearDraft(s);$('#input').value='';render();await runTurn()")
s=s.replace("$('#input').addEventListener('keydown'", "$('#input').addEventListener('input',()=>{const s=current();if(!s||s.pending)return;try{writeDraft(localStorage,s,$('#input').value)}catch{toast('草稿未保存：请先复制输入内容，检查浏览器存储空间。')}});$('#input').addEventListener('keydown'")
s=s.replace('sampleSnapshot:MATERIALS.personal,', 'sampleSnapshot:MATERIALS.personal,writeDraft,readDraft,')
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8')
tests="""
test('草稿按存档隔离并支持恢复',()=>{const cache=new Map(),store={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};const a=j.blank(),b=j.blank();j.writeDraft(store,a,'观察石碑');j.writeDraft(store,b,'向南走');assert(j.readDraft(store,a)==='观察石碑'&&j.readDraft(store,b)==='向南走')});
test('待处理与已推进回合不恢复旧草稿',()=>{const cache=new Map(),store={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};const b=j.blank();j.writeDraft(store,b,'渡河');b.pending={id:'draft',text:'渡河'};assert(j.readDraft(store,b)==='');b.pending=null;b.turn++;assert(j.readDraft(store,b)==='')});
test('草稿写失败可报告且不更改回合',()=>{const b=j.blank();reject(()=>j.writeDraft({setItem:()=>{throw Error('full')}},b,'输入'));assert(b.turn===0&&b.pending===null)});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
