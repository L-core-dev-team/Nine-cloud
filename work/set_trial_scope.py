from pathlib import Path
for p in [Path('work/build_v1.py'),Path('outputs/九霄WEB-1.0/source/build.py')]:
    s=p.read_text(encoding='utf-8')
    if '0号试玩 · 开发中' not in s:s=s.replace("s=s.replace('</head>'", "s=s.replace('WEB 1.0','0号试玩 · 开发中')\ns=s.replace('</head>'")
    p.write_text(s,encoding='utf-8')
