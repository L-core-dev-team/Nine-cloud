from pathlib import Path
p=Path('work/v1.js');s=p.read_text(encoding='utf-8')
s=s.replace('function validate(r,s)',Path('work/inventory.js').read_text(encoding='utf-8')+'\nfunction validate(r,s)')
a=s.index("if(r.items!==null&&");b=s.index("throw Error('物品数量或ID无效');",a)
s=s[:a]+"if(r.items!==null&&!validItems(r.items))"+s[b:]
s=s.replace("s.items.some(x=>!Number.isSafeInteger(x.quantity)||x.quantity<0)","!validItems(s.items)")
s=s.replace("每项{id,name,quantity}。","每项{id,name,quantity,unit}，quantity只能是非负整数或null（数量未知）；unit保留原计量单位，不把瓶数当丹药颗数。未知数量不推测，更新旧物品复用ID。角色物品栏是旧存档原文，当前库存以items为准。")
s=s.replace("  s.legacy.migration={version:1", "  if(s.player['物品栏'])s.items=importItems(s.player['物品栏']);\n  s.legacy.migration={version:2")
s=s.replace('物品及数量暂按角色物品栏原文读取','物品已迁移；未明示数量保留未知；原物品栏仅为历史参考')
s=s.replace("format(s.items)+(s.legacy.status?", "inventoryText(s.items)+(s.legacy.status?")
s=s.replace("sampleSnapshot:MATERIALS.personal,validate,", "sampleSnapshot:MATERIALS.personal,importItems,validate,")
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html');s=p.read_text(encoding='utf-8')
tests="""
test('真实旧物品迁移保留瓶包与未知数量',()=>{const b=j.importData(j.sampleSnapshot);assert(b.items.length===6);assert(b.items.find(x=>x.name==='化煞辟毒丹').quantity===3&&b.items.find(x=>x.name==='化煞辟毒丹').unit==='瓶');assert(b.items.find(x=>x.name==='避蝎引灵散').quantity===2&&b.items[0].quantity===null)});
test('未知库存数量可以导出再导入',()=>{const b=j.importData(j.sampleSnapshot);const c=j.importData(JSON.stringify({format:'JIUXIAO_SAVE',version:1,save:b}));assert(c.items.length===6&&c.items[0].quantity===null)});
test('模型库存接受未知数量，拒绝小数',()=>{const r=response();r.items[0].quantity=null;j.validate(r,s);r.items[0].quantity=1.5;reject(()=>j.validate(r,s))});
test('导入库存拒绝重复ID与空项',()=>{const b=j.blank();b.items=[{id:'x',name:'丹',quantity:null},{id:'x',name:'丹',quantity:1}];reject(()=>j.importData(JSON.stringify({format:'JIUXIAO_SAVE',version:1,save:b})));b.items=[null];reject(()=>j.importData(JSON.stringify({format:'JIUXIAO_SAVE',version:1,save:b})))});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
