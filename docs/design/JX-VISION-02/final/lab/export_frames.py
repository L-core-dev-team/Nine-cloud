"""Assemble final evidence frames (webp) and UI overlays from renders, AI repaints and composites."""
import os, json, subprocess, urllib.parse, numpy as np
from PIL import Image
S = os.environ.get('JX_WORK', '.')
OUT = f'{S}/b3d/out'; LAB = f'{S}/lab'; IMG = f'{LAB}/img'; V4 = f'{S}/v4'
DST = 'docs/design/JX-VISION-02/final/frames'
os.makedirs(IMG, exist_ok=True); os.makedirs(V4, exist_ok=True); os.makedirs(DST, exist_ok=True)
def best(n):
    for p in (f'{OUT}/C-{n}.png', f'{OUT}/A-{n}.png', f'{OUT}/F-{n}.png'):
        if os.path.exists(p): return p
def up(src, w=1600, h=900):
    return Image.open(src).convert('RGB').resize((w, h), Image.LANCZOS)
def save(im, name, q=84): im.save(f'{DST}/{name}.webp', quality=q, method=6)
plain = {'arrive': 'arrive-0500', 'aerial': 'aerial-0530', 'wqt-0530': 'wqt-0530', 'tele-0530': 'tele-0530', 'ferry-0530': 'ferry-0530',
         'ferry-cleared': 'ferry-cleared', 'talk': 'talk-0515', 'macro': 'macro-0545', 'burst': 'burst-0545', 'wqt-1715': 'wqt-1715', 'tribulation': 'trib'}
for k, n in plain.items():
    p = best(n)
    if p: save(up(p), k); Image.open(p).convert('RGB').save(f'{IMG}/{k}.jpg', quality=92)
# day strip (AI repaints of the same camera at four times)
tiles = [best(n) for n in ('wqt-0530', 'wqt-1200', 'wqt-1645', 'wqt-1715')]
if all(tiles):
    W = Image.new('RGB', (4 * 400 + 3 * 8, 225), (7, 9, 12))
    for i, p in enumerate(tiles): W.paste(up(p, 400, 225), (i * 408, 0))
    save(W, 'day-strip')
# pipeline comparison
if os.path.exists(f'{OUT}/C-talk-0515.png'):
    W = Image.new('RGB', (3 * 640 + 16, 360), (7, 9, 12))
    for i, p in enumerate((f'{OUT}/F-talk-0515.png', f'{OUT}/A-talk-0515.png', f'{OUT}/C-talk-0515.png')): W.paste(up(p, 640, 360), (i * 648, 0))
    save(W, 'pipeline-talk')
if os.path.exists(f'{OUT}/shenshi-tiers.png'): save(Image.open(f'{OUT}/shenshi-tiers.png').convert('RGB'), 'shenshi-tiers')
if os.path.exists(f'{V4}/atlas-ui.png'): save(Image.open(f'{V4}/atlas-ui.png').convert('RGB'), 'atlas')
# anchors for the tele frame from the fact mask
def anchors_from(mask, w=1600, h=900):
    m = np.asarray(Image.open(mask).convert('L').resize((w, h)), np.float32) > 128
    ys, xs = np.nonzero(m)
    if len(xs) == 0: return []
    x0, x1, y0 = np.percentile(xs, 5), np.percentile(xs, 95), np.percentile(ys, 5)
    return [{'t': '落石', 'x': int((x0 + x1) / 2), 'y': int(y0), 'l': 34}, {'t': '灰羽鸦　几十只', 'x': int(x1 + 90), 'y': int(y0 + 20), 'l': 18}]
def shoot(mode, cfg, out, w=1600, h=900, extra=''):
    url = f"http://127.0.0.1:8731/ui.html?mode={mode}{extra}&cfg={urllib.parse.quote(json.dumps(cfg, ensure_ascii=False))}"
    r = subprocess.run(['node', f'{S}/tools/shoot.cjs', url, out, str(w), str(h)], capture_output=True, text=True); print(r.stdout.strip()[-80:], r.stderr.strip()[-200:])
shoot('you', {'bg': 'img/tele-0530.jpg', 'anchors': anchors_from(f'{OUT}/m-tele-F.png')}, f'{V4}/ui-you.png')
shoot('tan', {'bg': 'img/talk.jpg', 'place': '芦花渡', 'time': '卯初一刻　05:15'}, f'{V4}/ui-tan.png')
shoot('dou', {'bg': 'img/burst.jpg', 'note': '画面：Blender 渲染 + AI 受控重绘（AIGC）；打鸦为示意，不对应真实存档的某一步'}, f'{V4}/ui-dou.png')
shoot('du', {'bg': 'img/wqt-0530.jpg'}, f'{V4}/ui-du.png')
shoot('yi', {'thumbs': [['img/arrive.jpg', '到渡　卯初'], ['img/wqt-0530.jpg', '望气台　05:15'], ['img/tele-0530.jpg', '环视　05:30'], ['img/macro.jpg', '细察　06:00']]}, f'{V4}/ui-yi.png')
shoot('home', {'bg': 'img/aerial.jpg', 'time': '此刻　卯初二刻'}, f'{V4}/ui-home.png')
shoot('phone', {'bg': 'img/talk.jpg', 'place': '芦花渡', 'pos': '56% center'}, f'{V4}/ui-phone-a.png', 390, 844, '&phone=1')
shoot('phone', {'bg': 'img/tele-0530.jpg', 'place': '望气台', 'kbd': True, 'pos': '50% 60%'}, f'{V4}/ui-phone-b.png', 390, 844, '&phone=1')
for n in ('ui-you', 'ui-tan', 'ui-dou', 'ui-du', 'ui-yi', 'ui-home'):
    if os.path.exists(f'{V4}/{n}.png'): save(Image.open(f'{V4}/{n}.png').convert('RGB'), n)
if os.path.exists(f'{V4}/ui-phone-a.png'):
    W = Image.new('RGB', (390 * 2 + 24, 844), (7, 9, 12)); W.paste(Image.open(f'{V4}/ui-phone-a.png').convert('RGB'), (0, 0)); W.paste(Image.open(f'{V4}/ui-phone-b.png').convert('RGB'), (414, 0)); save(W, 'ui-phone')
# record fact-check numbers
facts = {}
for f in os.listdir(OUT):
    if f.endswith('.facts.json'): facts[f.replace('.png.facts.json', '')] = json.load(open(f'{OUT}/{f}'))
meta = {}
for f in os.listdir(OUT):
    if f.startswith('A-') and f.endswith('.png.json'): m = json.load(open(f'{OUT}/{f}')); meta[f.replace('.png.json', '')] = {k: m[k] for k in ('model', 'license', 'strength', 'steps', 'seed', 'seconds', 'sha256', 'prompt')}
json.dump({'factcheck': facts, 'ai': meta}, open(f'{DST}/manifest.json', 'w'), ensure_ascii=False, indent=1)
print('exported', sorted(os.listdir(DST)))
