from pathlib import Path
import base64
import json
import re
import shutil


root = Path(__file__).resolve().parent
out = root.parent
template = root / '九霄_WEB_v2.8_空白版.html'
if not template.exists():
    raise FileNotFoundError('Missing source template: 九霄_WEB_v2.8_空白版.html')

shutil.copy2(root / 'manifest.json', out / 'manifest.json')
s = template.read_text(encoding='utf-8-sig')
s = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', s)

# Keep only the structural stylesheet from the historical template. The copied
# source styles below are the authoritative UI layers for this delivery.
first_style_end = s.find('</style>') + len('</style>')
head_end = s.find('</head>')
if first_style_end < len('</style>') or head_end < first_style_end:
    raise RuntimeError('template head styles not found')
s = s[:first_style_end] + '\n' + s[head_end:]

s = s.replace(
    '<div class="messages" id="messages"></div>',
    '<section class="story-card" aria-label="剧情"><div class="messages story-scroll" id="messages" tabindex="0"></div></section>',
)
s = s.replace('道阻且长 · 与君共赴', '道阻且长 · 与君共勉')
s = s.replace('九霄<span class="fy-redseal">', (root / 'logo.svg').read_text(encoding='utf-8') + '<span class="fy-redseal">')
s = s.replace('</header>', '</header><div class="jx-verse" aria-hidden="true"><span>九霄之上</span><span>自有长生</span><i>印</i></div>', 1)
s = s.replace('WEB v2.8 · 空白版', 'WEB 1.0').replace('查看完整设定', '查看世界资料')
s = s.replace('WEB v2.8 空白版', 'WEB 1.0')
s = s.replace('可写多项；也可以留空让AI按规则生成', '每行一项，最多三项；留空则不指定天赋')
s = s.replace('<option>随机开局</option><option>中州天枢域</option>', '<option>中州天枢域</option><option>随机开局</option>')
s = s.replace('从旧版重新覆盖设定', '导入补充资料（TXT）').replace('当前权威设定', '世界资料').replace('accept=".html,.htm"', 'accept=".txt"')
s = s.replace('value="4096"', 'value="8192"').replace('value="30"', 'value="8"')

panel_icons = {
    '✨ 角色状态 ✨': '<svg class="jx-panel-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3l2.1 5.1L19 10l-4.9 1.9L12 17l-2.1-5.1L5 10l4.9-1.9L12 3Z"/><path d="M18.5 16.5l.7 1.7 1.8.8-1.8.8-.7 1.7-.8-1.7L16 19l1.7-.8.8-1.7Z"/></svg><span>角色状态</span>',
    '🗺️ 综合情报 🗺️': '<svg class="jx-panel-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m3.5 6.5 5-2.2 7 2.4 5-2.2v13l-5 2.2-7-2.4-5 2.2v-13Z"/><path d="M8.5 4.3v13M15.5 6.7v13"/></svg><span>综合情报</span>',
}
for label, markup in panel_icons.items():
    s = s.replace(f'<summary>{label}</summary>', f'<summary>{markup}</summary>')

s = s.replace('</head>', '<style>' + (root / 'ui-fonts.css').read_text(encoding='utf-8') + '</style></head>')
s = s.replace(
    '</head>',
    '<link rel="icon" href="data:,"><link rel="manifest" href="manifest.json">'
    '<meta name="apple-mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
    '<meta name="apple-mobile-web-app-title" content="九霄"><style>'
    + (root / 'v1.css').read_text(encoding='utf-8')
    + '\n'
    + (root / 'ui-replica.css').read_text(encoding='utf-8')
    + '\n'
    + (root / 'jx-glass.css').read_text(encoding='utf-8')
    + '</style></head>',
)

corpus = json.loads((root / '设定OCR数据.json').read_text(encoding='utf-8'))
old = json.loads((root / '九霄_WEB_v2.8_空白版.constants.json').read_text(encoding='utf-8'))
personal = json.loads((root / '九霄_WEB_v2.8_临江仙存档版.constants.json').read_text(encoding='utf-8'))
data = {'sources': corpus['records'], 'legacy': old['EMBEDDED_V1_AUTHORITY'], 'personal': personal['PERSONAL_SAVE']}

script_names = [
    'ai-provider.js',
    'ai-router.js',
    'ai-settings.js',
    'v1.js',
    'vendor/anime.umd.min.js',
    'jx-atmo.js',
    'jx-motion.js',
]
s = s.replace(
    '</body>',
    '<script>const MATERIALS='
    + json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    + ';</script><script>'
    + ''.join((root / name).read_text(encoding='utf-8') + '\n' for name in script_names)
    + '</script></body>',
)

images = {
    '仙山夜景.png': ('image/png', out / '仙山夜景.png'),
    '九霄入界山门-移动.webp': ('image/webp', root / 'assets/九霄入界山门-移动.webp'),
    '九霄入界山门-桌面.webp': ('image/webp', root / 'assets/九霄入界山门-桌面.webp'),
}
for name, (mime, path) in images.items():
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    s = s.replace(f"url('{name}')", f"url('data:{mime};base64,{encoded}')")

s = s.replace('\r\n', '\n').replace('\r', '\n')
(out / '九霄WEB-1.0.html').write_text(s, encoding='utf-8', newline='\n')
(out / '九霄_WEB_空白版.html').write_text(s, encoding='utf-8', newline='\n')
(out / '九霄_WEB_1.0_空白版.html').write_text(s, encoding='utf-8', newline='\n')
personal_html = s.replace('<script>const MATERIALS=', '<script>window.JX_EDITION="personal";</script><script>const MATERIALS=', 1)
(out / '九霄_WEB_临江仙存档版.html').write_text(personal_html, encoding='utf-8', newline='\n')
(out / '九霄_WEB_1.0_临江仙存档版.html').write_text(personal_html, encoding='utf-8', newline='\n')
print('Built', len(s), 'characters')
