from pathlib import Path
import json,hashlib
base=Path(__file__).parent
out=base.parent/'outputs'
idx=json.loads((base/'ocr/index.json').read_text(encoding='utf-8-sig'))
duplicates={row['file']:row['duplicate'] for row in idx if row['duplicate']}
sections=['# 九霄设定截图 OCR 汇编（未逐字校订）','共 196 张截图，按文件哈希去重后 182 张。以下按文件名排序，不是原文阅读顺序。保留跨图重叠与 OCR 错字；去除了空格便于检索。规则实施前须回看原图。','## 文件索引']
records=[]
for p in sorted((base/'ocr-normalized').glob('*.txt')):
 text=p.read_text(encoding='utf-8')
 source='C:/Users/11954/Desktop/chatgpt/九霄剧情卡/设定卡/'+p.stem+'.png'
 records.append({'id':p.stem,'source':source,'status':'ocr_unreviewed','text':text})
 sections.append(f'- {p.stem}: '+ ' / '.join(text.splitlines()[4:7]))
for row in records:
 sections.extend(['\n## '+row['id'], '来源：'+row['source'],'```text\n'+row['text'].strip()+'\n```'])
sections.extend(['\n## 完全重复图片映射','源文件 → 与之相同的保留文件'])
sections.extend(f'- {k} → {v}' for k,v in duplicates.items())
(out/'设定截图OCR汇编.md').write_text('\n\n'.join(sections),encoding='utf-8')
(out/'设定OCR数据.json').write_text(json.dumps({'note':'Unreviewed OCR; filenames are not reading order; do not use directly as authoritative game rules','images':196,'unique_images':182,'duplicates':duplicates,'records':records},ensure_ascii=False,indent=2),encoding='utf-8')
(out/'游玩回合索引.txt').write_text('全局记录索引，非完整剧情。第17组AI为空。提取行可能包含NPC修为，不全是玩家属性。\n\n'+(base/'turn-index.txt').read_text(encoding='utf-8'),encoding='utf-8')
assert len(records)==182 and len(duplicates)==14
assert len(json.loads((base/'messages.json').read_text(encoding='utf-8')))==322
for p in out.iterdir():print(p.name,p.stat().st_size)
