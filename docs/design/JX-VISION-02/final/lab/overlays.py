"""Render all UI overlays and measure text contrast against the real background."""
import json, subprocess, urllib.parse, os
from PIL import Image
S = os.environ.get('JX_WORK', '.')
D = os.environ.get('JX_FRAMES', 'frames')
JOBS = [
 ('ui-you', 'you', {'bg': 'img/cc0-wqt.jpg', 'tabs': ['游', '读', '观', '忆']}, 1600, 900, ''),
 ('ui-tan', 'tan', {'bg': 'img/cc0-talk.jpg', 'place': '芦花渡', 'time': '卯初二刻　05:30', 'task': ''}, 1600, 900, ''),
 ('ui-dou', 'dou', {'bg': 'img/burst.jpg', 'note': '占位：鸦与石为程序化模型，底图经 AI 重绘且未过门禁；打鸦为示意'}, 1600, 900, ''),
 ('ui-du', 'du', {'bg': 'img/cc0-wqt.jpg', 'tabs': ['游', '读', '观', '忆']}, 1600, 900, ''),
 ('ui-yi', 'yi', {'note': '缩略图：Blender 渲染（到渡为程序化材质，其余为 CC0 扫描材质），未经 AI', 'thumbs': [['img/arrive-render.jpg', '到渡　卯初'], ['img/cc0-wqt.jpg', '望气台　05:15'], ['img/cc0-ferry.jpg', '落石　（渡口近景）']], 'tabs': ['游', '读', '观', '忆']}, 1600, 900, ''),
 ('ui-home', 'home', {'bg': 'img/arrive-render.jpg', 'time': '此刻　卯初', 'dark': True, 'note': '画面：Blender 渲染（程序化材质），未经 AI'}, 1600, 900, ''),
 ('ui-phone-a', 'phone', {'bg': 'img/cc0-talk.jpg', 'place': '芦花渡', 'time': '卯初二刻　05:30', 'pos': '56% center'}, 390, 844, '&phone=1'),
 ('ui-phone-b', 'phone', {'bg': 'img/cc0-wqt.jpg', 'place': '望气台', 'kbd': True, 'pos': '60% 55%'}, 390, 844, '&phone=1'),
]
os.makedirs(f'{S}/v5', exist_ok=True)
for name, mode, cfg, w, h, extra in JOBS:
    url = f"http://127.0.0.1:8731/ui.html?mode={mode}{extra}&cfg={urllib.parse.quote(json.dumps(cfg, ensure_ascii=False))}"
    pre = f'{S}/v5/{name}'
    subprocess.run(['node', f'{S}/tools/measure.cjs', url, pre, str(w), str(h)], check=True)
    print(subprocess.run(['python3', f'{S}/tools/contrast.py', pre], capture_output=True, text=True).stdout.strip())
    if not name.startswith('ui-phone'): Image.open(pre + '-with.png').convert('RGB').save(f'{D}/{name}.webp', quality=84, method=6)
W = Image.new('RGB', (390 * 2 + 24, 844), (7, 9, 12)); W.paste(Image.open(f'{S}/v5/ui-phone-a-with.png').convert('RGB'), (0, 0)); W.paste(Image.open(f'{S}/v5/ui-phone-b-with.png').convert('RGB'), (414, 0)); W.save(f'{D}/ui-phone.webp', quality=84, method=6)
