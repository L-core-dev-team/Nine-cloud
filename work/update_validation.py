from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
s=s.replace('function validate(r,s)',Path('work/save-validation.js').read_text(encoding='utf-8')+'\nfunction validate(r,s)')
s=s.replace("if(d&&d.version===1&&Array.isArray(d.saves))library=d", "if(d&&d.version===1&&Array.isArray(d.saves)){d.saves.forEach(validateSave);library=d}")
s=s.replace("if(!Array.isArray(r.npcs)||r.npcs.some(n=>!n||typeof n.id!=='string'||typeof n.name!=='string'||!['GM_ONLY','PLAYER_KNOWN'].includes(n.visibility)))", "if(!validNPCs(r.npcs))")
s=s.replace("if(r.items!==null)n.items=r.items;", "n.items=mergeItems(n.items,r.items);")
s=s.replace("const n=clone(s);const event=", "if(!Number.isSafeInteger(s.world.elapsedMinutes+r.elapsedMinutes)||!Number.isSafeInteger(s.turn+1))throw Error('累计时间或回合超出安全范围');const n=clone(s);const event=")
s=s.replace("if(!native){migrateLegacy(s);recoverUnanswered(s);}s.id=", "if(!native){migrateLegacy(s);recoverUnanswered(s);}validateSave(s);s.id=")
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8')
tests="""
test('物品数量更新保留原描述和单位',()=>{const b=j.importData(j.sampleSnapshot);b.pending={id:'keep',text:'使用一瓶丹药'};const r=response();r.items=b.items.map(x=>({id:x.id,name:x.name,quantity:x.quantity}));r.items[2].quantity=2;const c=j.apply(b,j.validate(r,b));assert(c.items[2].unit==='瓶'&&c.items[2].record.includes('来历')&&c.items[2].quantity===2&&b.items[2].quantity===3)});
test('模型回复拒绝重复NPC与空名称',()=>{const r=response();r.npcs=[{id:'x',name:'人物',visibility:'PLAYER_KNOWN'},{id:'x',name:'人物2',visibility:'GM_ONLY'}];reject(()=>j.validate(r,s));r.npcs=[{id:'x',name:' ',visibility:'PLAYER_KNOWN'}];reject(()=>j.validate(r,s))});
test('畸形记忆与人物存档被拒绝',()=>{const b=j.blank();b.ltm=[null];reject(()=>j.importData(JSON.stringify({format:'JIUXIAO_SAVE',version:1,save:b})));b.ltm=[];b.npcs=[{id:'x',name:'未知可见性'}];reject(()=>j.importData(JSON.stringify({format:'JIUXIAO_SAVE',version:1,save:b})))});
test('累计时间溢出不提交',()=>{const b=j.blank();b.world.elapsedMinutes=Number.MAX_SAFE_INTEGER;b.pending={id:'overflow',text:'等待'};reject(()=>j.apply(b,j.validate(response(),b)));assert(b.turn===0&&b.pending!==null)});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
