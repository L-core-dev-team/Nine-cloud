"""Render all UI overlays and measure text contrast against the real background."""
import json, subprocess, urllib.parse, os
from PIL import Image
S = os.environ.get('JX_WORK', '.')
D = os.environ.get('JX_FRAMES', 'frames')
JOBS = [
 ('ui-you', 'you', {'bg': 'img/wqt-0530.jpg'}, 1600, 900, ''),
 ('ui-tan', 'tan', {'bg': 'img/talk.jpg', 'place': '芦花渡', 'time': '卯初一刻　05:15'}, 1600, 900, ''),
 ('ui-dou', 'dou', {'bg': 'img/burst.jpg', 'note': '占位：鸦与石为程序化模型；打鸦为示意'}, 1600, 900, ''),
 ('ui-du', 'du', {'bg': 'img/wqt-0530.jpg'}, 1600, 900, ''),
 ('ui-yi', 'yi', {'thumbs': [['img/arrive.jpg', '到渡　卯初'], ['img/talk.jpg', '岑九　05:15'], ['img/wqt-0530.jpg', '望气台　05:30'], ['img/ferry-0530.jpg', '落石　（之后）']]}, 1600, 900, ''),
 ('ui-home', 'home', {'bg': 'img/aerial.jpg', 'time': '此刻　卯初二刻'}, 1600, 900, ''),
 ('ui-phone-a', 'phone', {'bg': 'img/talk.jpg', 'place': '芦花渡', 'pos': '56% center'}, 390, 844, '&phone=1'),
 ('ui-phone-b', 'phone', {'bg': 'img/wqt-0530.jpg', 'place': '望气台', 'kbd': True, 'pos': '60% 55%'}, 390, 844, '&phone=1'),
]
os.makedirs(f'{S}/v5', exist_ok=True)
for name, mode, cfg, w, h, extra in JOBS:
    url = f"http://127.0.0.1:8731/ui.html?mode={mode}{extra}&cfg={urllib.parse.quote(json.dumps(cfg, ensure_ascii=False))}"
    pre = f'{S}/v5/{name}'
    subprocess.run(['node', f'{S}/tools/measure.cjs', url, pre, str(w), str(h)], check=True)
    print(subprocess.run(['python3', f'{S}/tools/contrast.py', pre], capture_output=True, text=True).stdout.strip())
    if not name.startswith('ui-phone'): Image.open(pre + '-with.png').convert('RGB').save(f'{D}/{name}.webp', quality=84, method=6)
W = Image.new('RGB', (390 * 2 + 24, 844), (7, 9, 12)); W.paste(Image.open(f'{S}/v5/ui-phone-a-with.png').convert('RGB'), (0, 0)); W.paste(Image.open(f'{S}/v5/ui-phone-b-with.png').convert('RGB'), (414, 0)); W.save(f'{D}/ui-phone.webp', quality=84, method=6)
