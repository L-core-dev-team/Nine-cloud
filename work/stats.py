from pathlib import Path
import json,re,statistics
ms=json.loads(Path('work/messages.json').read_text(encoding='utf-8'))
a=[m['text'] for m in ms if m['role']=='AI']
print('Reply characters min/median/max:',min(map(len,a)),int(statistics.median(map(len,a))),max(map(len,a)))
print('First/last reply characters:',len(a[0]),len(a[-1]))
print('Turn 17:',a[16][:500])
pos=a[-1].find('星记忆配置')
print('Last memory config:',a[-1][pos:pos+1100])
cs=json.loads(Path('work/九霄_WEB_v2.8_临江仙存档版.constants.json').read_text(encoding='utf-8'))
print('Saved constants:',[(k,len(str(v))) for k,v in cs.items()])
print('Longer player inputs:')
for i,m in enumerate(ms):
 t=m['text'].split('\n#')[0].strip()
 if m['role']=='USER' and len(t)>8: print(i//2+1,t[:240])
print('Last response section sizes:')
for term in ['✨ 角色状态','🗺️ 综合情报','星记忆回廊','行动建议']:print(term,a[-1].find(term))
