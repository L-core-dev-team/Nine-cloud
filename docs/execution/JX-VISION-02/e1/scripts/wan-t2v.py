# wan-t2v.py —— Wan2.1 T2V-1.3B 最小可复现短视频生成（ComfyUI API）
#
# 用法：python wan-t2v.py --prompt "..." --out <LAB_ROOT>\Outputs\Video\wan --label e11-wan
# 前置：dot-source environment.ps1（设置 JX_COMFY_URL / JX_COMFY_RAW_OUT）
# 产物：<out>\<label>.webm + <label>-first.png / <label>-last.png + <label>.receipt.json
import argparse, json, os, shutil, subprocess, sys, time, urllib.request, uuid

COMFY = os.environ.get("JX_COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
RAW = os.environ.get("JX_COMFY_RAW_OUT")
if not RAW:
    lab = os.environ.get("JX_LAB_ROOT")
    if lab:
        RAW = os.path.join(lab, "Outputs", "Images", "_comfy_raw")
    else:
        sys.exit("JX_COMFY_RAW_OUT 未设置；请先 dot-source environment.ps1")
UNET = os.environ.get("JX_WAN_UNET", "wan2.1_t2v_1.3B_fp16.safetensors")
CLIP = os.environ.get("JX_WAN_CLIP", "umt5_xxl_fp8_e4m3fn_scaled.safetensors")
VAE = os.environ.get("JX_WAN_VAE", "wan_2.1_vae.safetensors")


def api(path, payload=None):
    req = urllib.request.Request(COMFY + path, data=json.dumps(payload).encode() if payload else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def build(prompt, neg, w, h, frames, steps, cfg, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "wan"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["2", 0]}},
        "6": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
        "7": {"class_type": "WanImageToVideo", "inputs": {"positive": ["4", 0], "negative": ["5", 0], "vae": ["3", 0],
                                                          "width": w, "height": h, "length": frames, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["6", 0], "seed": seed, "steps": steps, "cfg": cfg,
                                                   "sampler_name": "uni_pc", "scheduler": "simple", "denoise": 1.0,
                                                   "positive": ["7", 0], "negative": ["7", 1], "latent_image": ["7", 2]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveWEBM", "inputs": {"images": ["9", 0], "filename_prefix": "jx_wan",
                                                    "codec": "vp9", "fps": 16.0, "crf": 28.0}},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--negative", default="色调艳丽，过曝，静态，细节模糊不清，字幕，画面崩塌，畸形，低质量")
    ap.add_argument("--width", type=int, default=704)
    ap.add_argument("--height", type=int, default=480)
    ap.add_argument("--seconds", type=float, default=3.0)
    ap.add_argument("--steps", type=int, default=20)
    ap.add_argument("--cfg", type=float, default=6.0)
    ap.add_argument("--seed", type=int, default=20261128)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="wan")
    ap.add_argument("--timeout", type=int, default=1800)
    a = ap.parse_args()

    frames = int(round(a.seconds * 16)) // 4 * 4 + 1
    graph = build(a.prompt, a.negative, a.width, a.height, frames, a.steps, a.cfg, a.seed)
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    pid = api("/prompt", {"prompt": graph, "client_id": uuid.uuid4().hex})["prompt_id"]
    print(f"[submit] {pid} frames={frames} {a.width}x{a.height}")
    entry, state = None, None
    while time.time() - t0 < a.timeout:
        time.sleep(2)
        h = api(f"/history/{pid}")
        if pid in h:
            entry = h[pid]
            state = entry.get("status", {})
            if state.get("completed") or state.get("status_str") == "error":
                break
    if not entry:
        raise SystemExit(f"[FAIL] 超时 {a.timeout}s")
    if not state.get("completed"):
        raise SystemExit(f"[FAIL] ComfyUI 报错: {json.dumps(state, ensure_ascii=False)[:800]}")

    files = []
    for node_out in entry.get("outputs", {}).values():
        for key in ("images", "videos", "gifs"):
            for f in node_out.get(key, []):
                src = os.path.join(RAW, f.get("subfolder", ""), f["filename"])
                if os.path.isfile(src):
                    dst = os.path.join(a.out, f"{a.label}{os.path.splitext(f['filename'])[1]}")
                    shutil.copy2(src, dst); files.append(dst)
    if not files:
        raise SystemExit("[FAIL] 没有产物")
    video = files[0]
    # 抽首尾帧便于目视
    ff = shutil.which("ffmpeg") or "ffmpeg"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", video, "-frames:v", "1",
                    os.path.join(a.out, f"{a.label}-first.png")], check=False)
    subprocess.run([ff, "-y", "-loglevel", "error", "-sseof", "-0.3", "-i", video, "-frames:v", "1",
                    os.path.join(a.out, f"{a.label}-last.png")], check=False)
    dur = subprocess.run([shutil.which("ffprobe") or "ffprobe",
                          "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video],
                         capture_output=True, text=True).stdout.strip()
    receipt = {"label": a.label, "ok": True, "seconds": round(time.time() - t0, 1), "prompt_id": pid,
               "video": video, "duration": dur, "frames_requested": frames, "resolution": [a.width, a.height],
               "steps": a.steps, "cfg": a.cfg, "seed": a.seed, "prompt": a.prompt}
    with open(os.path.join(a.out, f"{a.label}.receipt.json"), "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, ensure_ascii=False, indent=2)
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
