import json, sys, re, numpy as np
from PIL import Image
prefix = sys.argv[1]
bg = np.asarray(Image.open(prefix + '-bg.png').convert('RGB'), np.float32) / 255
els = json.load(open(prefix + '-els.json'))
def lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def L(rgb): r = lin(rgb); return 0.2126 * r[..., 0] + 0.7152 * r[..., 1] + 0.0722 * r[..., 2]
res = []
for e in els:
    m = re.findall(r'[\d.]+', e['color']); r, g, b = [float(v) / 255 for v in m[:3]]; a = float(m[3]) if len(m) > 3 else 1.0
    x0, y0 = max(0, int(e['x'])), max(0, int(e['y'])); x1, y1 = min(bg.shape[1], int(e['x'] + e['w'])), min(bg.shape[0], int(e['y'] + e['h']))
    if x1 <= x0 or y1 <= y0: continue
    patch = bg[y0:y1, x0:x1].reshape(-1, 3)
    text = np.array([r, g, b]); lt = L(text[None])[0]
    lb = L(patch); worst_bg = np.percentile(lb, 90) if lt > np.median(lb) else np.percentile(lb, 10)
    # alpha-composited text colour against the worst background
    bgc = patch[np.argmin(abs(lb - worst_bg))]; eff = text * a + bgc * (1 - a); le = L(eff[None])[0]
    hi, lo = max(le, worst_bg), min(le, worst_bg); ratio = (hi + 0.05) / (lo + 0.05)
    large = e['size'] >= 24 or (e['size'] >= 18.66 and int(e['weight']) >= 700)
    res.append((round(ratio, 2), e['t'], e['size'], 'large' if large else 'small'))
fails = [r for r in res if r[0] < (3.0 if r[3] == 'large' else 4.5)]
print(prefix.split('/')[-1], 'n=', len(res), 'min=', min(r[0] for r in res), 'fails=', len(fails))
for f in sorted(fails)[:12]: print('   ', f)
