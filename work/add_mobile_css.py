from pathlib import Path
p=Path('work/v1.css')
s=p.read_text(encoding='utf-8')
marker='/* Mobile flow layout:'
if marker in s:s=s[:s.index(marker)]
p.write_text(s+'\n'+Path('work/mobile-layout.css').read_text(encoding='utf-8'),encoding='utf-8')
