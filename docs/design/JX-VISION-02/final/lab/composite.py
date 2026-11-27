"""事实保持合成：AI 重绘图 + 渲染中的事实物体（遮罩羽化）→ 低强度统一 → 遮罩区相关系数核对。
用法：python composite.py render.png ai.png mask.png out.png "prompt"
"""
import sys, json, numpy as np
from PIL import Image, ImageFilter
r, a, m, out, prompt = sys.argv[1:6]
R = Image.open(r).convert('RGB'); A = Image.open(a).convert('RGB').resize(R.size, Image.LANCZOS)
M = Image.open(m).convert('L').resize(R.size, Image.BILINEAR)
Md = M.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3))
rn, an, mn = [np.asarray(x, np.float32) / 255 for x in (R, A, Md)]
mn = mn[..., None]
# match render colours inside mask to the AI image's local mean (simple per-channel gain on a blurred ring)
ring = np.asarray(M.filter(ImageFilter.MaxFilter(31)), np.float32)[..., None] / 255 - mn
ring = np.clip(ring, 0, 1)
if ring.sum() > 10:
    gain = (an * ring).sum((0, 1)) / np.maximum((rn * ring).sum((0, 1)), 1e-4)
    rn2 = np.clip(rn * np.clip(gain, 0.6, 1.6), 0, 1)
else: rn2 = rn
C = an * (1 - mn) + rn2 * mn
Image.fromarray((C * 255).astype(np.uint8)).save(out)
def luma(x): return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]
hard = np.asarray(M, np.float32) / 255 > 0.5
def corr(x, y):
    x = luma(x)[hard]; y = luma(y)[hard]
    if x.size < 20: return None
    x = x - x.mean(); y = y - y.mean(); return float((x * y).sum() / np.sqrt((x * x).sum() * (y * y).sum() + 1e-9))
rep = {'fact_pixels': int(hard.sum()), 'corr_ai_only_vs_render': corr(an, rn), 'corr_composite_vs_render': corr(C, rn)}
json.dump(rep, open(out + '.facts.json', 'w'), indent=1); print(rep)
