# inpaint-metrics.py —— 局部重绘的严格度量与三分存档
#
# 产物（<out> 下）：
#   archive/original.png        原图
#   archive/ai-raw.png          ComfyUI 直接输出（未合成）
#   archive/mask.png            二值遮罩
#   archive/mask-feathered.png  合成权重（遮罩内羽化，遮罩外恒 0）
#   archive/composite.png       最终合成（遮罩外逐像素等于原图）
#   inpaint-metrics.json        全部指标
#
# 口径：
#   遮罩外（outside）= 二值遮罩之外，合成图在该区域必须逐像素等于原图（max=0）。
#   遮罩内先内缩 erode_px 再高斯羽化，保证边界处权重从 0 平滑升到 1，避免接缝。
#   SSIM 的 outside 统计在 outside 区域；inside 统计在遮罩内。
import argparse, json, os, shutil
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, gaussian_filter, sobel
from skimage.metrics import structural_similarity


def load_rgb(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--original", required=True)
    ap.add_argument("--raw", required=True)
    ap.add_argument("--mask", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--threshold", type=int, default=127)
    ap.add_argument("--erode-px", type=int, default=6)
    ap.add_argument("--feather-sigma", type=float, default=4.0)
    a = ap.parse_args()

    orig = load_rgb(a.original); raw = load_rgb(a.raw)
    if raw.shape != orig.shape:
        raise SystemExit(f"[FAIL] 尺寸不一致 {orig.shape} vs {raw.shape}")
    m = np.asarray(Image.open(a.mask).convert("L"))
    if m.shape != orig.shape[:2]:
        raise SystemExit("[FAIL] 遮罩尺寸与图不一致")
    inside = m > a.threshold
    outside = ~inside

    d = np.abs(raw.astype(np.int16) - orig.astype(np.int16)).max(axis=2)
    raw_out = {"mean_abs_diff": round(float(d[outside].mean()), 2), "max_abs_diff": int(d[outside].max()),
               "ratio_gt4": round(float((d[outside] > 4).mean()), 4),
               "ratio_gt16": round(float((d[outside] > 16).mean()), 4)}
    raw_in_mean = round(float(d[inside].mean()), 2)

    core = binary_erosion(inside, iterations=a.erode_px) if a.erode_px > 0 else inside
    weight = np.clip(gaussian_filter(core.astype(np.float32), sigma=a.feather_sigma), 0, 1) * inside.astype(np.float32)
    comp = np.clip(raw.astype(np.float32) * weight[..., None] + orig.astype(np.float32) * (1 - weight[..., None]),
                   0, 255).astype(np.uint8)
    dc = np.abs(comp.astype(np.int16) - orig.astype(np.int16)).max(axis=2)
    comp_out_max = int(dc[outside].max())

    gray_o = np.asarray(Image.fromarray(orig).convert("L"), dtype=np.float32)
    gray_c = np.asarray(Image.fromarray(comp).convert("L"), dtype=np.float32)
    ssim_full = float(structural_similarity(gray_o, gray_c, data_range=255))
    smap = structural_similarity(gray_o, gray_c, data_range=255, full=True)[1]
    ssim_out = float(smap[outside].mean()); ssim_in = float(smap[inside].mean())

    def edges(g):
        return np.hypot(sobel(g, axis=1), sobel(g, axis=0))
    eo, ec = edges(gray_o), edges(gray_c)
    x, y = eo[inside].ravel(), ec[inside].ravel()
    edge_corr = float(np.corrcoef(x, y)[0, 1]) if x.std() > 0 and y.std() > 0 else 0.0

    arc = os.path.join(a.out, "archive"); os.makedirs(arc, exist_ok=True)
    shutil.copy2(a.original, os.path.join(arc, "original.png"))
    shutil.copy2(a.raw, os.path.join(arc, "ai-raw.png"))
    shutil.copy2(a.mask, os.path.join(arc, "mask.png"))
    Image.fromarray((weight * 255).astype(np.uint8)).save(os.path.join(arc, "mask-feathered.png"))
    Image.fromarray(comp).save(os.path.join(arc, "composite.png"))

    rep = {
        "files": {"original": a.original, "raw": a.raw, "mask": a.mask,
                  "composite": os.path.join(arc, "composite.png")},
        "mask_area_px": int(inside.sum()), "mask_area_ratio": round(float(inside.mean()), 4),
        "blend": {"erode_px": a.erode_px, "feather_sigma": a.feather_sigma},
        "raw_vs_original_outside": raw_out,
        "raw_vs_original_inside_mean_abs_diff": raw_in_mean,
        "composite_outside_max_abs_diff": comp_out_max,
        "ssim": {"full": round(ssim_full, 4), "outside_mean": round(ssim_out, 4), "inside_mean": round(ssim_in, 4)},
        "edge_corr_inside": round(edge_corr, 4),
        "verdict": "PASS" if comp_out_max == 0 and ssim_out >= 0.999 else "REVIEW",
    }
    with open(os.path.join(a.out, "inpaint-metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=2)
    print(json.dumps(rep, ensure_ascii=False))


if __name__ == "__main__":
    main()
