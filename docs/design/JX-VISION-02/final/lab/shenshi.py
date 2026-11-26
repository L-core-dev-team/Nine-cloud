"""神识层：求解序章区域的灵力场 Φ（屏蔽泊松，水体为反射边界），投影到望气台相机，按境界叠加。
九霄虚构设定 + 真实数学；参数为示意。用法：python shenshi.py base.png out.png
"""
import sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.argv = [sys.argv[0]] + sys.argv[1:]
base_path, out_path = sys.argv[1], sys.argv[2]
# --- geography (same functions as scene.py) ---
import importlib.util, types
src = open(__file__.replace('shenshi.py', 'scene.py')).read()
geo_src = src[src.index('# ---------------- noise'):src.index('# ---------------- utilities')]
g = {'np': np, 'math': math}; exec(geo_src, g)
height, river_center, river_half, WQT = g['height'], g['river_center'], g['river_half'], g['WQT']
FM = np.array([0.0, float(river_center(np.array([0.0]))[0] - river_half(np.array([0.0]))[0])])
# --- grid ---
h = 10.0; xs = np.arange(-1800, 600, h); ys = np.arange(-1700, 500, h); X, Y = np.meshgrid(xs, ys)
Z = height(X.astype(np.float32), Y.astype(np.float32))
water = Z < 0.0
# sources: 灵脉节点 on the 望气台 hill (candidate) + a weak ridge line on the north hills
S = 4.0 * np.exp(-((X - WQT[0]) ** 2 + (Y - WQT[1]) ** 2) / (2 * 90.0 ** 2))
S += 0.6 * np.exp(-((Y - (river_center(X) + river_half(X) + 500)) ** 2) / (2 * 120.0 ** 2)) * (0.5 + 0.5 * np.sin(X / 260.0))
D, lam = 1.0, 1.0 / (380.0 ** 2)        # ℓ = sqrt(D/λ) = 380 m
# sparse solve of (n_land_nbrs + λh²/D) Φ_i − Σ_land Φ_j = S_i h²/D ; water neighbours = reflective (no flux)
import scipy.sparse as sp, scipy.sparse.linalg as spl
land = ~water; ny_, nx_ = Z.shape; idmap = -np.ones(Z.shape, int); li = np.argwhere(land); idmap[land] = np.arange(len(li))
rows, cols, vals = [], [], []; diag = np.full(len(li), lam * h * h / D)
for di, dj in ((0, 1), (0, -1), (1, 0), (-1, 0)):
    ii = li[:, 0] + di; jj = li[:, 1] + dj; ok = (ii >= 0) & (ii < ny_) & (jj >= 0) & (jj < nx_)
    nbland = np.zeros(len(li), bool); nbland[ok] = land[ii[ok], jj[ok]]
    diag += nbland
    rows += list(np.nonzero(nbland)[0]); cols += list(idmap[ii[nbland], jj[nbland]]); vals += [-1.0] * int(nbland.sum())
A = sp.csr_matrix((vals + list(diag), (rows + list(range(len(li))), cols + list(range(len(li))))), shape=(len(li), len(li)))
sol = spl.spsolve(A.tocsc(), S[land] * h * h / D)
P = np.zeros(Z.shape); P[land] = sol
Phi = P / P.max()
gy, gx = np.gradient(Phi, h)
J = np.stack([-gx, -gy], -1)
# --- camera (identical to scene.py 'wqt') ---
deck = float(height(np.array([WQT[0] + 40], np.float32), np.array([WQT[1] + 30], np.float32))[0]) + 5.5
C = np.array([WQT[0] + 40 - 1.9, WQT[1] + 30 - 1.9, deck + 1.6]); T = np.array([FM[0] - 40, FM[1] - 40, 0.0]); lens = 30.0
img = Image.open(base_path).convert('RGB'); W, H = img.size
d = T - C; d /= np.linalg.norm(d); right = np.cross(d, [0, 0, 1.0]); right /= np.linalg.norm(right); up = np.cross(right, d)
def proj(P3):
    v = P3 - C; z = v @ d; x = v @ right; y = v @ up
    k = (lens / 36.0) * W
    return np.stack([W / 2 + x / z * k, H / 2 - y / z * k, z], -1)
def tier_canvas(kind):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(layer)
    if kind == 'lianqi':   # scalar haze within ~ 400 m
        idx = np.argwhere(land & (np.hypot(X - C[0], Y - C[1]) < 1600))
        rng = np.random.default_rng(1); idx = idx[rng.random(len(idx)) < 0.6]
        pts = np.stack([X[idx[:, 0], idx[:, 1]], Y[idx[:, 0], idx[:, 1]], Z[idx[:, 0], idx[:, 1]] + 1.5], -1); pr = proj(pts)
        for (sx, sy, z), (i, j) in zip(pr, idx):
            if z <= 5: continue
            a = Phi[i, j]; r = max(1.2, 500 / z)
            dr.ellipse([sx - r, sy - r * 0.5, sx + r, sy + r * 0.5], fill=(150, 235, 210, int(25 + 200 * a ** 0.8)))
        layer = layer.filter(ImageFilter.GaussianBlur(5.5))
    elif kind in ('zhuji', 'jiedan'):
        rng = np.random.default_rng(2)
        seeds = rng.uniform([-1600, -1600], [400, 300], (900 if kind == 'zhuji' else 0, 2))
        for sx0, sy0 in seeds:
            x, y = sx0, sy0; path = []
            for k in range(60):
                i = int((y - ys[0]) / h); j = int((x - xs[0]) / h)
                if not (0 <= i < len(ys) and 0 <= j < len(xs)) or water[i, j]: break
                v = J[i, j]; n = np.hypot(*v) + 1e-9
                if n < 2e-5: break
                path.append((x, y, Z[i, j] + 2)); x += v[0] / n * 14; y += v[1] / n * 14
            if len(path) > 4:
                pr = proj(np.array(path))
                ok = pr[:, 2] > 5
                pts = [(float(a), float(b)) for a, b, c in pr[ok]]
                if len(pts) > 2:
                    a0 = float(np.mean([Phi[int((p[1] - ys[0]) / h), int((p[0] - xs[0]) / h)] for p in path]))
                    dr.line(pts, fill=(170, 225, 255, int(70 + 170 * a0)), width=1)
        if kind == 'jiedan':
            # 晶格：沿地表每 60 m 的经纬线，亮度随 Φ；再标出灵眼（局部极大）
            for axis in (0, 1):
                for k0 in range(0, (Z.shape[1] if axis == 0 else Z.shape[0]), 6):
                    if axis == 0: line = [(xs[k0], ys[i], Z[i, k0] + 2, Phi[i, k0], water[i, k0]) for i in range(Z.shape[0])]
                    else: line = [(xs[j], ys[k0], Z[k0, j] + 2, Phi[k0, j], water[k0, j]) for j in range(Z.shape[1])]
                    for q in range(len(line) - 1):
                        a0, b0 = line[q], line[q + 1]
                        if a0[4] or b0[4] or a0[3] < 0.01: continue
                        pr = proj(np.array([a0[:3], b0[:3]]))
                        if pr[0, 2] > 8 and pr[1, 2] > 8:
                            dr.line([tuple(pr[0, :2]), tuple(pr[1, :2])], fill=(240, 205, 120, int(min(255, 30 + 400 * a0[3] ** 0.7))), width=1)
            from scipy.ndimage import maximum_filter
            mx = (Phi == maximum_filter(Phi, size=15)) & land & (Phi > 0.002)
            peaks = np.argwhere(mx); P3 = np.stack([X[peaks[:, 0], peaks[:, 1]], Y[peaks[:, 0], peaks[:, 1]], Z[peaks[:, 0], peaks[:, 1]] + 3], -1); pr = proj(P3)
            for (sx, sy, z), (i, j) in zip(pr, peaks):
                if z > 8: r = 4 + 3000 / z * Phi[i, j]; dr.ellipse([sx - r, sy - r, sx + r, sy + r], outline=(255, 225, 150, 240), width=2)
    return layer
import os
OCC = np.asarray(Image.open(sys.argv[3]).convert('L').resize((W, H)), np.float32) / 255 if len(sys.argv) > 3 and os.path.exists(sys.argv[3]) else None
font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 22)
panels = []
for kind, label in (('lianti', '炼体　无灵气数据，只有风与寒'), ('lianqi', '炼气　近处灵气的浓淡'), ('zhuji', '筑基　灵流'), ('jiedan', '结丹　灵眼与灵脉网络')):
    im = img.copy().convert('RGBA')
    if kind != 'lianti':
        lay = tier_canvas(kind)
        if OCC is not None:
            al = np.asarray(lay.split()[3], np.float32) * (1 - OCC); lay.putalpha(Image.fromarray(al.astype(np.uint8)))
        im = Image.alpha_composite(im, lay)
    dr = ImageDraw.Draw(im); dr.rectangle([0, H - 46, W, H], fill=(6, 8, 12, 200)); dr.text((20, H - 38), label, font=font, fill=(236, 230, 216, 255))
    panels.append(im.convert('RGB'))
Wp, Hp = W // 2, H // 2
sheet = Image.new('RGB', (Wp * 2 + 8, Hp * 2 + 8), (6, 8, 12))
for k, p in enumerate(panels): sheet.paste(p.resize((Wp, Hp), Image.LANCZOS), ((k % 2) * (Wp + 8), (k // 2) * (Hp + 8)))
sheet.save(out_path); print('saved', out_path, 'phi max src', float(S.max()), 'ell', math.sqrt(D / lam))
