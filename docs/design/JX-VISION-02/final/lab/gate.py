"""资产门禁（非同义反复版）：
G1 事实保持：合成前的 AI 原图与渲染在事实遮罩区的亮度相关系数 ≥ 0.95
G2 几何一致：AI 原图与渲染的全幅边缘图（Sobel 幅值，模糊后）相关系数 ≥ 0.6
G3 不编造：零样本图文模型（CLIP ViT-B/32，MIT）对禁用概念的相对得分不得高于对照概念
用法：python gate.py name [name ...]   （读取 out/F-<name>.png 与 out/A-<name>.png，可选 out/m-<maskname>-F.png）
"""
import sys, json, numpy as np, torch
from PIL import Image, ImageFilter
from transformers import CLIPModel, CLIPProcessor
MASK = {'talk-0515': 'talk', 'ferry-0530': 'ferry', 'tele-0530': 'tele', 'burst-0545': 'burst', 'macro-0545': 'macro'}
FORBID = ['a modern glass building', 'a suburban villa', 'a western farmhouse', 'a seagull', 'a concrete wall', 'a modern farm with machinery', 'a person sitting']
ALLOW = 'an ancient Chinese rural riverside landscape'
model = CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); proc = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
def L(im): return np.asarray(im.convert('L'), np.float32) / 255
def corr(a, b):
    a = a - a.mean(); b = b - b.mean(); return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum() + 1e-9))
def edges(im):
    g = L(im.filter(ImageFilter.GaussianBlur(1.5))); gx = np.abs(np.diff(g, axis=1))[:-1]; gy = np.abs(np.diff(g, axis=0))[:, :-1]
    e = Image.fromarray(np.clip((gx + gy) * 4 * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)); return L(e)
res = {}
for n in sys.argv[1:]:
    R = Image.open(f'out/F-{n}.png').convert('RGB'); A = Image.open(f'out/A-{n}.png').convert('RGB').resize(R.size)
    r = {}
    if n in MASK:
        m = np.asarray(Image.open(f'out/m-{MASK[n]}-F.png').convert('L').resize(R.size), np.float32) > 128
        r['G1_fact_corr'] = round(corr(L(A)[m], L(R)[m]), 3); r['G1'] = r['G1_fact_corr'] >= 0.95
    r['G2_edge_corr'] = round(corr(edges(A), edges(R)), 3); r['G2'] = r['G2_edge_corr'] >= 0.6
    texts = FORBID + [ALLOW]
    with torch.no_grad():
        inp = proc(text=texts, images=A, return_tensors='pt', padding=True); p = model(**inp).logits_per_image.softmax(-1)[0].numpy()
    worst = int(np.argmax(p[:-1])); r['G3_top_forbidden'] = FORBID[worst]; r['G3_p_forbidden'] = round(float(p[worst]), 3); r['G3_p_allowed'] = round(float(p[-1]), 3)
    r['G3'] = bool(p[-1] > p[worst])
    r['PASS'] = all(v for k, v in r.items() if k in ('G1', 'G2', 'G3'))
    res[n] = r; print(n, r)
json.dump(res, open('out/gate.json', 'w'), ensure_ascii=False, indent=1)
