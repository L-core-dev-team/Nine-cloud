#!/usr/bin/env python3
"""comfy-workflow-runner.py —— 九霄 SDXL 受控生图工作流运行器（脱敏版）

通过 ComfyUI HTTP API 提交工作流、等待完成、回收图片，并记录耗时与峰值显存。
六种模式：t2i / i2i / depth / canny / inpaint / upscale。

配置全部走环境变量，不写死本机路径：
  JX_COMFY_URL        默认 http://127.0.0.1:8188
  JX_CKPT             默认 sd_xl_base_1.0.safetensors
  JX_DEPTH_CN         默认 controlnet-depth-sdxl-1.0\\diffusion_pytorch_model.fp16.safetensors
  JX_CANNY_CN         默认 sdxl_canny_controlnet_fp16.safetensors
  JX_COMFY_RAW_OUT    ComfyUI 输出根目录（与启动参数 --output-directory 一致）
  JX_INPUT_DIR        ComfyUI 输入目录（LoadImage 从这里取图）

示例：
  python comfy-workflow-runner.py t2i    --seed 20261128 --out ./out/t2i
  python comfy-workflow-runner.py depth  --depth e1_depth.png --strength 0.85 --out ./out/depth
  python comfy-workflow-runner.py inpaint --image e1_base.png --mask e1_mask.png --denoise 0.85 --out ./out/inpaint
  python comfy-workflow-runner.py upscale --image e1_base.png --out ./out/upscale

已知坑（已在本脚本内修正，勿回退）：
  1. LoadImage 的 MASK 输出取自 alpha 通道；灰度遮罩 PNG 没有 alpha，必须经 ImageToMask(channel=red) 转换，
     否则遮罩全黑、重绘等于没做（表现为“整图几乎没变”）。
  2. ControlNetApplyAdvanced 的 positive/negative 输出分别为 index 0 / 1，接到 KSampler 时不要接反。
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

COMFY = os.environ.get("JX_COMFY_URL", "http://127.0.0.1:8188")
CKPT = os.environ.get("JX_CKPT", "sd_xl_base_1.0.safetensors")
DEPTH_CN = os.environ.get("JX_DEPTH_CN", "controlnet-depth-sdxl-1.0\\diffusion_pytorch_model.fp16.safetensors")
CANNY_CN = os.environ.get("JX_CANNY_CN", "sdxl_canny_controlnet_fp16.safetensors")
RAW_OUT = os.environ.get("JX_COMFY_RAW_OUT", ".")

NEG = ("low quality, blurry, watermark, text, signature, jpeg artifacts, deformed, "
       "extra limbs, oversaturated, photo watermark")


class VramWatch(threading.Thread):
    """采样 nvidia-smi，记录本次工作流的显存峰值。"""

    def __init__(self):
        super().__init__(daemon=True)
        self.peak = 0
        self._stop = threading.Event()

    def run(self):
        while not self._stop.is_set():
            try:
                out = subprocess.run(
                    ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=5,
                ).stdout.strip().splitlines()
                if out:
                    self.peak = max(self.peak, int(out[0].strip()))
            except Exception:
                pass
            self._stop.wait(0.4)

    def stop(self):
        self._stop.set()
        self.join(timeout=2)


def api(path: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(COMFY + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def queue(graph: dict) -> str:
    res = api("/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})
    if res.get("node_errors"):
        raise RuntimeError(f"node errors: {json.dumps(res['node_errors'])[:2000]}")
    return res["prompt_id"]


def wait(prompt_id: str, timeout: int = 900) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = api(f"/history/{prompt_id}")
        if prompt_id in hist:
            entry = hist[prompt_id]
            status = entry.get("status", {})
            if status.get("completed"):
                return entry
            if status.get("status_str") == "error":
                raise RuntimeError(f"execution error: {json.dumps(status)[:2000]}")
        time.sleep(0.5)
    raise TimeoutError(f"prompt {prompt_id} 未在 {timeout}s 内完成")


def collect(entry: dict, out_dir: str, prefix: str) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    for node_out in entry.get("outputs", {}).values():
        for img in node_out.get("images", []):
            src = os.path.join(RAW_OUT, img.get("subfolder", ""), img["filename"])
            dst = os.path.join(out_dir, f"{prefix}_{img['filename']}")
            shutil.copy2(src, dst)
            saved.append({"source": img["filename"], "copy": dst, "bytes": os.path.getsize(dst)})
    return saved


def run(graph: dict, label: str, out_dir: str, meta: dict, timeout: int = 900) -> dict:
    watch = VramWatch()
    watch.start()
    t0 = time.time()
    prompt_id = queue(graph)
    entry = wait(prompt_id, timeout)
    seconds = round(time.time() - t0, 2)
    watch.stop()
    receipt = {
        "label": label,
        "workflow": meta,
        "prompt_id": prompt_id,
        "seconds": seconds,
        "vram_peak_mib": watch.peak,
        "files": collect(entry, out_dir, label),
    }
    with open(os.path.join(out_dir, f"{label}_receipt.json"), "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2, ensure_ascii=False)
    print(json.dumps(receipt, ensure_ascii=False))
    return receipt


def base_graph(prompt: str, width: int, height: int):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage",
              "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "jx"}},
    }


def ks(seed: int, steps: int, cfg: float, denoise: float, sampler: str, scheduler: str):
    return {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0], "seed": seed, "steps": steps, "cfg": cfg,
            "sampler_name": sampler, "scheduler": scheduler,
            "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["4", 0], "denoise": denoise,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["t2i", "i2i", "depth", "canny", "inpaint", "upscale"])
    ap.add_argument("--prompt", default="ink wash mountain valley at dusk, ridge silhouettes, mist, chinese shan shui painting")
    ap.add_argument("--seed", type=int, default=20261128)
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--image", help="ComfyUI 输入目录内的源图文件名")
    ap.add_argument("--depth", help="ComfyUI 输入目录内的深度图文件名")
    ap.add_argument("--mask", help="ComfyUI 输入目录内的遮罩文件名（灰度 PNG，白=重绘区）")
    ap.add_argument("--denoise", type=float, default=0.62)
    ap.add_argument("--strength", type=float, default=0.9)
    ap.add_argument("--sampler", default="dpmpp_2m")
    ap.add_argument("--scheduler", default="karras")
    ap.add_argument("--upscale-model", default="RealESRGAN_x4plus.pth")
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default=None)
    args = ap.parse_args()
    label = args.label or f"{args.mode}_s{args.seed}"

    if args.mode == "upscale":
        if not args.image:
            ap.error("upscale 模式需要 --image")
        g = {
            "1": {"class_type": "LoadImage", "inputs": {"image": args.image}},
            "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": args.upscale_model}},
            "3": {"class_type": "ImageUpscaleWithModel", "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
            "4": {"class_type": "SaveImage", "inputs": {"images": ["3", 0], "filename_prefix": "jx_up"}},
        }
        run(g, label, args.out, {"mode": "upscale", "source_image": args.image,
                                 "upscale_model": args.upscale_model})
        return 0

    g = base_graph(args.prompt, args.width, args.height)
    g["5"] = ks(args.seed, args.steps, args.cfg, 1.0, args.sampler, args.scheduler)
    meta = {"mode": args.mode, "checkpoint": CKPT, "seed": args.seed, "steps": args.steps,
            "cfg": args.cfg, "resolution": [args.width, args.height],
            "sampler": args.sampler, "scheduler": args.scheduler, "prompt": args.prompt}

    if args.mode == "i2i":
        g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.image}}
        g["9"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["8", 0], "vae": ["1", 2]}}
        g["5"]["inputs"]["latent_image"] = ["9", 0]
        g["5"]["inputs"]["denoise"] = args.denoise
        meta.update({"source_image": args.image, "denoise": args.denoise, "control": "img2img"})

    elif args.mode == "depth":
        g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.depth}}
        g["9"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": DEPTH_CN}}
        g["10"] = {"class_type": "ControlNetApplyAdvanced",
                   "inputs": {"positive": ["2", 0], "negative": ["3", 0], "control_net": ["9", 0],
                              "image": ["8", 0], "strength": args.strength,
                              "start_percent": 0.0, "end_percent": 0.85}}
        g["5"]["inputs"]["positive"] = ["10", 0]
        g["5"]["inputs"]["negative"] = ["10", 1]
        meta.update({"source_image": args.depth, "control": "depth", "controlnet": DEPTH_CN,
                     "strength": args.strength, "end_percent": 0.85})

    elif args.mode == "canny":
        g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.image}}
        g["9"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CANNY_CN}}
        g["10"] = {"class_type": "Canny",
                   "inputs": {"image": ["8", 0], "low_threshold": 0.35, "high_threshold": 0.75}}
        g["11"] = {"class_type": "ControlNetApplyAdvanced",
                   "inputs": {"positive": ["2", 0], "negative": ["3", 0], "control_net": ["9", 0],
                              "image": ["10", 0], "strength": args.strength,
                              "start_percent": 0.0, "end_percent": 0.85}}
        g["5"]["inputs"]["positive"] = ["11", 0]
        g["5"]["inputs"]["negative"] = ["11", 1]
        meta.update({"source_image": args.image, "control": "canny", "controlnet": CANNY_CN,
                     "strength": args.strength, "canny": [0.35, 0.75]})

    elif args.mode == "inpaint":
        g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.image}}
        g["10"] = {"class_type": "LoadImage", "inputs": {"image": args.mask}}
        # 关键：灰度遮罩必须经 ImageToMask 转 MASK（LoadImage 的 MASK 输出只认 alpha 通道）
        g["11"] = {"class_type": "ImageToMask", "inputs": {"image": ["10", 0], "channel": "red"}}
        g["9"] = {"class_type": "VAEEncodeForInpaint",
                  "inputs": {"pixels": ["8", 0], "vae": ["1", 2], "mask": ["11", 0], "grow_mask_by": 12}}
        g["5"]["inputs"]["latent_image"] = ["9", 0]
        g["5"]["inputs"]["denoise"] = args.denoise
        meta.update({"source_image": args.image, "mask": args.mask, "control": "inpaint",
                     "denoise": args.denoise, "grow_mask_by": 12})

    run(g, label, args.out, meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
