from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
s=s.replace('function render(){',Path('work/data-panels.js').read_text(encoding='utf-8')+'\nfunction render(){')
a=s.index(" $('#statusPane').textContent=");b=s.index(" $('#send').disabled=",a)
s=s[:a]+' renderData(s);\n'+s[b:]
s=s.replace('if(!native)migrateLegacy(s);','if(!native){migrateLegacy(s);recoverUnanswered(s);}')
s=s.replace('sampleSnapshot:MATERIALS.personal,importItems,','sampleSnapshot:MATERIALS.personal,importItems,renderData,')
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8')
s=s.replace("old.messages.length!==3||old.turn!==1", "old.messages.length!==2||old.turn!==1||old.pending.text!=='继续'")
tests="""
test('旧记录末尾行动恢复并仅提交一次',()=>{const b=j.importData('[USER]:开始\\n[AI]:第一幕\\n[USER]:向北走');assert(b.pending.text==='向北走'&&b.turn===1&&b.messages.length===2);const c=j.apply(b,j.validate(response(),b));assert(c.turn===2&&c.messages.filter(x=>x.content==='向北走').length===1&&b.pending!==null)});
test('连续未回复输入按原顺序恢复',()=>{const b=j.importData('[USER]:观察\\n[USER]:先别走');assert(b.pending.text==='观察\\n\\n先别走'&&b.messages.length===0&&b.legacy.unanswered.length===2)});
test('已有回复的旧局不重复发起行动',()=>{const b=j.importData('[USER]:继续\\n[AI]:第二幕');assert(b.pending===null&&b.turn===1)});
test('状态面板折叠旧档案并隐藏GM人物',()=>{const b=j.importData(j.sampleSnapshot);b.npcs.push({id:'secret',name:'DEV秘密人物',visibility:'GM_ONLY'});j.renderData(b);const d=document.getElementById('app').contentDocument;assert(d.querySelector('#statusPane details')&&!d.querySelector('#statusPane details').open);assert(!d.querySelector('#intelPane').textContent.includes('DEV秘密人物'));assert(d.querySelector('#statusPane').firstChild.textContent.indexOf('物品栏')===-1)});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
