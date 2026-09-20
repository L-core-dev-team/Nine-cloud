from pathlib import Path
import re,json
root=Path(r'C:\Users\11954\Desktop\chatgpt\九霄剧情卡')
work=Path(__file__).parent
for p in root.glob('*.html'):
 s=p.read_text(encoding='utf-8-sig')
 constants={}
 for m in re.finditer(r'const\s+(\w+)\s*=\s*("(?:\\.|[^"\\])*")',s):
  try: constants[m[1]]=json.loads(m[2])
  except: pass
 (work/(p.stem+'.constants.json')).write_text(json.dumps(constants,ensure_ascii=False,indent=2),encoding='utf-8')
 (work/(p.stem+'.scripts.js')).write_text('\n'.join(re.findall(r'<script[^>]*>([\s\S]*?)</script>',s)),encoding='utf-8')
log=next((root/'输出示例').glob('*.txt')).read_text(encoding='utf-8-sig')
parts=re.split(r'(?m)^\[(USER|AI)\]:',log)
messages=[{'role':parts[i], 'text':parts[i+1]} for i in range(1,len(parts),2)]
(work/'messages.json').write_text(json.dumps(messages,ensure_ascii=False,indent=2),encoding='utf-8')
lines=[]
for i,m in enumerate(messages):
 if m['role']=='USER':
  t=re.split(r'\n#[-=]{5}',m['text'])[0].strip()
  lines.append(f'回合 {i//2+1} 玩家: {t[:1200]}')
 else:
  lines.append(' | '.join(re.findall(r'^.*(?:当前时间|当前区域|\*\*修为\*\*|本次长期记忆条数|本次短期记忆条数|长期记忆归档条数).*$',m['text'],re.M)[:8]))
(work/'turn-index.txt').write_text('\n'.join(lines),encoding='utf-8')
print('Extracted',len(messages),'messages')
