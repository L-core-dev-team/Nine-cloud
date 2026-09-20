from pathlib import Path
p=Path('work/v1.js')
s=p.read_text(encoding='utf-8')
s=s.replace('function importData(text){let s;',Path('work/legacy-migration.js').read_text(encoding='utf-8')+'\nfunction importData(text){let s;let native=false;')
s=s.replace("s=d.save;if(!s", "native=true;s=d.save;if(!s")
s=s.replace("s.id=uid();s.updated=new Date().toISOString();return s}","if(!native)migrateLegacy(s);s.id=uid();s.updated=new Date().toISOString();return s}")
s=s.replace('ltm:ranked,legacy:s.legacy','ltm:ranked,legacy:s.legacy.migration?{migration:s.legacy.migration,recentMemory:s.legacy.recentMemory}:s.legacy')
s=s.replace('window.JX={validate,','window.JX={sampleSnapshot:MATERIALS.personal,validate,')
p.write_text(s,encoding='utf-8')
p=Path('outputs/九霄WEB-1.0/tests.html')
s=p.read_text(encoding='utf-8')
tests="""
test('真实临江仙快照迁移角色地点和记忆',()=>{const old=j.importData(j.sampleSnapshot);assert(old.name==='临江仙'&&old.player.修为.includes('假婴')&&old.world.location.includes('南疆')&&old.npcs.length===2&&old.ltm.length===26&&old.stm.length===2&&old.player.物品栏.includes('三瓶'));});
test('旧JSON正确计算回合',()=>{const old=j.importData(JSON.stringify({messages:[{role:'assistant',content:j.sampleSnapshot}]}));assert(old.turn===1&&old.ltm.length===26)});
test('旧记忆进入续玩上下文但不重复携带原配置',()=>{const old=j.importData(j.sampleSnapshot);old.pending={id:'test',text:'继续'};const ctx=j.context(old);assert(ctx[1].content.includes('假婴')&&!ctx[1].content.includes('接收用户明确指令'));});
test('迁移后的新存档再次导入不重复记忆',()=>{const old=j.importData(j.sampleSnapshot);const copy=j.importData(JSON.stringify({format:'JIUXIAO_SAVE',version:1,save:old}));assert(copy.ltm.length===26&&copy.stm.length===2&&copy.name==='临江仙')});
"""
s=s.replace("document.getElementById('result').textContent=out",tests+"\ndocument.getElementById('result').textContent=out")
p.write_text(s,encoding='utf-8')
