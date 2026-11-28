#!/usr/bin/env python3
"""comfy-workflow-runner.py —— 九霄 SDXL 受控生图工作流运行器（E1.1 修订版）

相对 E1 初版修复的问题（对应 GPT-6.2 独立审查意见）：
  1. 显存采样线程不再覆盖 Thread 内部方法 `_stop`，改用 `_stop_event`；
  2. run() 用 try/finally 保证异常/超时/中断时采样线程一定结束；
  3. wait() 区分“真正完成”“执行错误”“排队被取消”“超时”，并校验 outputs 非空；
  4. queue() 把服务端 400/node_errors 的完整原因抛出，而不是只给 HTTP 状态；
  5. collect() 拒绝空输出、0 字节文件、损坏图片（PIL 校验失败即抛错）；
  6. 输出文件重名不再静默覆盖，自动追加 -001/-002 序号；
  7. 输入参数完整性校验：图片/遮罩文件存在性、路径不得逃逸输入目录、尺寸/步数/denoise 取值范围；
  8. 显存口径区分：device_used（整卡占用，来自 nvidia-smi）与 task_delta（相对基线的增量）；
  9. 增加 --dry-run，可在不调用 GPU 的情况下校验工作流构造（供回归测试使用）。

配置（全部走环境变量，新终端可独立运行）：
  JX_COMFY_URL        默认 http://127.0.0.1:8188
  JX_CKPT             默认 sd_xl_base_1.0.safetensors
  JX_DEPTH_CN         默认 controlnet-depth-sdxl-1.0\\diffusion_pytorch_model.fp16.safetensors
  JX_CANNY_CN         默认 sdxl_canny_controlnet_fp16.safetensors
  JX_COMFY_RAW_OUT    ComfyUI 的 --output-directory
  JX_INPUT_DIR        ComfyUI 的 --input-directory（LoadImage 取图目录）

用法：
  python comfy-workflow-runner.py t2i     --out ./out/t2i --seed 20261128
  python comfy-workflow-runner.py depth   --depth e1_depth.png --out ./out/depth
  python comfy-workflow-runner.py canny   --image e1_base.png --out ./out/canny
  python comfy-workflow-runner.py dual    --depth e1_depth.png --image e1_base.png --out ./out/dual
  python comfy-workflow-runner.py inpaint --image e1_base.png --mask e1_mask.png --out ./out/inpaint
  python comfy-workflow-runner.py upscale --image e1_base.png --out ./out/upscale
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

COMFY = os.environ.get("JX_COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
CKPT = os.environ.get("JX_CKPT", "sd_xl_base_1.0.safetensors")
DEPTH_CN = os.environ.get("JX_DEPTH_CN", "controlnet-depth-sdxl-1.0\\diffusion_pytorch_model.fp16.safetensors")
CANNY_CN = os.environ.get("JX_CANNY_CN", "sdxl_canny_controlnet_fp16.safetensors")
RAW_OUT = os.environ.get("JX_COMFY_RAW_OUT", ".")
INPUT_DIR = os.environ.get("JX_INPUT_DIR", "")

NEG = ("low quality, blurry, watermark, text, signature, jpeg artifacts, deformed, "
       "extra limbs, oversaturated, photo watermark")


class RunnerError(RuntimeError):
    """运行器自身的可预期错误：参数非法、服务端拒绝、输出异常。"""


# ---------------------------------------------------------------- 显存采样
def gpu_memory_used_mib() -> int | None:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode != 0:
            return None
        lines = out.stdout.strip().splitlines()
        return int(lines[0].strip()) if lines else None
    except Exception:
        return None


def gpu_memory_total_mib() -> int | None:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode != 0:
            return None
        lines = out.stdout.strip().splitlines()
        return int(lines[0].strip()) if lines else None
    except Exception:
        return None


class VramWatch(threading.Thread):
    """采样整卡显存占用。注意：不要定义 self._stop，那是 Thread 的内部方法名。"""

    def __init__(self, interval: float = 0.4):
        super().__init__(daemon=True)
        self.interval = interval
        self.peak_device_mib = 0
        self._stop_event = threading.Event()

    def run(self) -> None:
        while not self._stop_event.is_set():
            used = gpu_memory_used_mib()
            if used is not None:
                self.peak_device_mib = max(self.peak_device_mib, used)
            self._stop_event.wait(self.interval)

    def stop(self) -> None:
        self._stop_event.set()
        self.join(timeout=2.0)


# ---------------------------------------------------------------- HTTP
def api(path: str, payload: dict | None = None, timeout: float = 30.0):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(COMFY + path, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", "replace")[:2000]
        except Exception:
            pass
        raise RunnerError(f"HTTP {exc.code} {path}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RunnerError(f"无法连接 ComfyUI {COMFY}（{exc.reason}）") from exc


def queue_graph(graph: dict) -> str:
    res = api("/prompt", {"prompt": graph, "client_id": str(uuid.uuid4())})
    if res.get("node_errors"):
        raise RunnerError("工作流节点错误: " + json.dumps(res["node_errors"], ensure_ascii=False)[:2000])
    if not res.get("prompt_id"):
        raise RunnerError("服务端未返回 prompt_id: " + json.dumps(res, ensure_ascii=False)[:500])
    return res["prompt_id"]


def wait_for(prompt_id: str, timeout: float = 900.0) -> dict:
    """轮询 /history。只有 completed 且 outputs 非空才算成功。"""
    t0 = time.time()
    last_state = "unknown"
    while time.time() - t0 < timeout:
        hist = api(f"/history/{prompt_id}")
        if prompt_id in hist:
            entry = hist[prompt_id]
            status = entry.get("status", {})
            last_state = status.get("status_str", last_state)
            if last_state == "error":
                raise RunnerError("ComfyUI 执行错误: " + json.dumps(status, ensure_ascii=False)[:2000])
            if status.get("completed"):
                if not entry.get("outputs"):
                    raise RunnerError("工作流报告完成但没有任何输出节点结果")
                return entry
        time.sleep(0.5)
    raise RunnerError(f"工作流 {prompt_id} 超时（{timeout}s，最后状态={last_state}）")


# ---------------------------------------------------------------- 输出
def _safe_relpath(rel: str) -> str:
    """拒绝绝对路径与 .. 逃逸。"""
    rel = rel.replace("\\", "/").strip("/")
    if not rel:
        return ""
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise RunnerError(f"输出子路径包含 .. 逃逸: {rel}")
    return os.path.join(*parts) if parts else ""


def unique_path(path: str) -> str:
    """同名不覆盖：存在时追加 -001/-002…"""
    if not os.path.exists(path):
        return path
    root, ext = os.path.splitext(path)
    for i in range(1, 1000):
        cand = f"{root}-{i:03d}{ext}"
        if not os.path.exists(cand):
            return cand
    raise RunnerError(f"无法为 {path} 生成不冲突的文件名")


def verify_image_file(path: str) -> None:
    """拒绝空文件与不可解码图片；尺寸过小视为异常。"""
    if not os.path.isfile(path):
        raise RunnerError(f"输出文件不存在: {path}")
    size = os.path.getsize(path)
    # 0 字节必然失败；几十字节只可能是残片。正常 PNG 头部+IDAT 至少数百字节，
    # 但纯色小图确实可能只有 ~180 B，所以下限放到 64 B，真伪交给解码校验。
    if size < 64:
        raise RunnerError(f"输出文件过小（{size} B），疑似空图: {path}")
    try:
        from PIL import Image  # pillow 由 ComfyUI venv 提供
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            if im.width < 8 or im.height < 8:
                raise RunnerError(f"输出图像尺寸异常: {im.width}x{im.height}")
    except RunnerError:
        raise
    except Exception as exc:
        raise RunnerError(f"输出图片无法解码（已拒绝）: {path} :: {exc}") from exc


def collect(entry: dict, out_dir: str, prefix: str) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    for node_out in entry.get("outputs", {}).values():
        for img in node_out.get("images", []):
            name = os.path.basename(img.get("filename", ""))
            if not name:
                raise RunnerError("输出节点返回了空文件名")
            src = os.path.join(RAW_OUT, _safe_relpath(img.get("subfolder", "")), name)
            if not os.path.isfile(src):
                raise RunnerError(f"未在 ComfyUI 输出目录找到 {src}")
            dst = unique_path(os.path.join(out_dir, f"{prefix}_{name}"))
            shutil.copy2(src, dst)
            verify_image_file(dst)
            saved.append({"source": name, "copy": dst, "bytes": os.path.getsize(dst)})
    if not saved:
        raise RunnerError("没有任何图片被回收")
    return saved


def run_prompt(graph: dict, label: str, out_dir: str, meta: dict, timeout: float = 900.0) -> dict:
    baseline = gpu_memory_used_mib()
    watch = VramWatch()
    watch.start()
    t0 = time.time()
    prompt_id = None
    error = None
    try:
        prompt_id = queue_graph(graph)
        entry = wait_for(prompt_id, timeout)
    except BaseException as exc:      # 包含 KeyboardInterrupt：也要收尾再抛出
        error = exc
        entry = None
    finally:
        watch.stop()
    seconds = round(time.time() - t0, 2)

    if error is not None:
        receipt = {
            "label": label, "workflow": meta, "prompt_id": prompt_id,
            "ok": False, "seconds": seconds,
            "error": f"{type(error).__name__}: {error}",
            "device_peak_mib": watch.peak_device_mib,
            "device_total_mib": gpu_memory_total_mib(),
            "task_delta_peak_mib": (watch.peak_device_mib - baseline) if baseline is not None and watch.peak_device_mib else None,
        }
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, f"{label}_receipt.json"), "w", encoding="utf-8") as fh:
            json.dump(receipt, fh, indent=2, ensure_ascii=False)
        print(json.dumps(receipt, ensure_ascii=False))
        raise RunnerError(receipt["error"])

    files = collect(entry, out_dir, label)
    receipt = {
        "label": label, "workflow": meta, "prompt_id": prompt_id, "ok": True,
        "seconds": seconds,
        "device_baseline_mib": baseline,
        "device_peak_mib": watch.peak_device_mib,
        "device_total_mib": gpu_memory_total_mib(),
        "task_delta_peak_mib": (watch.peak_device_mib - baseline) if baseline is not None and watch.peak_device_mib else None,
        "files": files,
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{label}_receipt.json"), "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2, ensure_ascii=False)
    print(json.dumps(receipt, ensure_ascii=False))
    return receipt


# ---------------------------------------------------------------- 工作流
def base_graph(prompt: str, width: int, height: int) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage",
              "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "jx"}},
    }


def ks(seed: int, steps: int, cfg: float, denoise: float, sampler: str, scheduler: str) -> dict:
    return {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0], "seed": seed, "steps": steps, "cfg": cfg,
            "sampler_name": sampler, "scheduler": scheduler,
            "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["4", 0], "denoise": denoise,
        },
    }


def require_input(name: str, kind: str) -> None:
    """校验输入文件：必须位于 JX_INPUT_DIR（若已设置），且为普通文件。"""
    if not name:
        raise RunnerError(f"{kind} 参数缺失")
    if os.path.isabs(name) or ".." in name.replace("\\", "/").split("/"):
        raise RunnerError(f"{kind} 只接受输入目录内的相对文件名，收到: {name}")
    input_dir = os.environ.get("JX_INPUT_DIR", "")
    if input_dir:
        p = os.path.join(input_dir, name)
        if not os.path.isfile(p):
            raise RunnerError(f"{kind} 文件不在输入目录: {p}")
        if os.path.getsize(p) < 1024:
            raise RunnerError(f"{kind} 文件过小: {p}")


def validate_common(args) -> None:
    if args.width < 256 or args.height < 256 or args.width % 8 or args.height % 8:
        raise RunnerError(f"分辨率必须是 ≥256 且为 8 的倍数，收到 {args.width}x{args.height}")
    if not (1 <= args.steps <= 150):
        raise RunnerError(f"steps 超出合理范围: {args.steps}")
    if not (0.0 <= args.cfg <= 30.0):
        raise RunnerError(f"cfg 超出合理范围: {args.cfg}")
    if not (0.0 <= args.denoise <= 1.0):
        raise RunnerError(f"denoise 必须在 0–1: {args.denoise}")
    if not (0.0 <= args.strength <= 1.0):
        raise RunnerError(f"strength 必须在 0–1: {args.strength}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["t2i", "i2i", "depth", "canny", "dual", "inpaint", "upscale"])
    ap.add_argument("--prompt", default="ink wash mountain valley at dusk, ridge silhouettes, mist, chinese shan shui painting")
    ap.add_argument("--seed", type=int, default=20261128)
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--image", help="输入目录内的源图文件名")
    ap.add_argument("--depth", help="输入目录内的深度图文件名")
    ap.add_argument("--mask", help="输入目录内的遮罩文件名（灰度 PNG，白=重绘区）")
    ap.add_argument("--denoise", type=float, default=0.62)
    ap.add_argument("--strength", type=float, default=0.9)
    ap.add_argument("--depth-strength", type=float, default=0.85, help="dual 模式下 Depth 分支强度")
    ap.add_argument("--sampler", default="dpmpp_2m")
    ap.add_argument("--scheduler", default="karras")
    ap.add_argument("--upscale-model", default="RealESRGAN_x4plus.pth")
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default=None)
    ap.add_argument("--timeout", type=float, default=900.0)
    ap.add_argument("--dry-run", action="store_true", help="只校验并打印工作流 JSON，不提交")
    args = ap.parse_args()
    label = args.label or f"{args.mode}_s{args.seed}"

    try:
        meta = {"mode": args.mode, "checkpoint": CKPT, "seed": args.seed, "steps": args.steps,
                "cfg": args.cfg, "resolution": [args.width, args.height],
                "sampler": args.sampler, "scheduler": args.scheduler, "prompt": args.prompt}

        if args.mode == "upscale":
            require_input(args.image, "--image")
            g = {
                "1": {"class_type": "LoadImage", "inputs": {"image": args.image}},
                "2": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": args.upscale_model}},
                "3": {"class_type": "ImageUpscaleWithModel",
                      "inputs": {"upscale_model": ["2", 0], "image": ["1", 0]}},
                "4": {"class_type": "SaveImage", "inputs": {"images": ["3", 0], "filename_prefix": "jx_up"}},
            }
            meta = {"mode": "upscale", "source_image": args.image, "upscale_model": args.upscale_model}
        else:
            validate_common(args)
            g = base_graph(args.prompt, args.width, args.height)
            g["5"] = ks(args.seed, args.steps, args.cfg, 1.0, args.sampler, args.scheduler)

            if args.mode == "i2i":
                require_input(args.image, "--image")
                g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.image}}
                g["9"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["8", 0], "vae": ["1", 2]}}
                g["5"]["inputs"]["latent_image"] = ["9", 0]
                g["5"]["inputs"]["denoise"] = args.denoise
                meta.update({"source_image": args.image, "denoise": args.denoise, "control": "img2img"})

            elif args.mode == "depth":
                require_input(args.depth, "--depth")
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
                require_input(args.image, "--image")
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

            elif args.mode == "dual":
                # Depth 管体量、Canny 管硬边：两路串联，第二路作用在第一路的结果上
                require_input(args.depth, "--depth")
                require_input(args.image, "--image")
                g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.depth}}
                g["12"] = {"class_type": "LoadImage", "inputs": {"image": args.image}}
                g["9"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": DEPTH_CN}}
                g["10"] = {"class_type": "ControlNetApplyAdvanced",
                           "inputs": {"positive": ["2", 0], "negative": ["3", 0], "control_net": ["9", 0],
                                      "image": ["8", 0], "strength": args.depth_strength,
                                      "start_percent": 0.0, "end_percent": 0.85}}
                g["13"] = {"class_type": "Canny",
                           "inputs": {"image": ["12", 0], "low_threshold": 0.35, "high_threshold": 0.75}}
                g["14"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CANNY_CN}}
                g["11"] = {"class_type": "ControlNetApplyAdvanced",
                           "inputs": {"positive": ["10", 0], "negative": ["10", 1], "control_net": ["14", 0],
                                      "image": ["13", 0], "strength": args.strength,
                                      "start_percent": 0.0, "end_percent": 0.7}}
                g["5"]["inputs"]["positive"] = ["11", 0]
                g["5"]["inputs"]["negative"] = ["11", 1]
                meta.update({"control": "depth+canny", "depth_image": args.depth,
                             "canny_source": args.image, "depth_strength": args.depth_strength,
                             "canny_strength": args.strength})

            elif args.mode == "inpaint":
                require_input(args.image, "--image")
                require_input(args.mask, "--mask")
                g["8"] = {"class_type": "LoadImage", "inputs": {"image": args.image}}
                g["10"] = {"class_type": "LoadImage", "inputs": {"image": args.mask}}
                # 灰度遮罩必须经 ImageToMask 转 MASK（LoadImage 的 MASK 输出只认 alpha 通道）
                g["11"] = {"class_type": "ImageToMask", "inputs": {"image": ["10", 0], "channel": "red"}}
                g["9"] = {"class_type": "VAEEncodeForInpaint",
                          "inputs": {"pixels": ["8", 0], "vae": ["1", 2], "mask": ["11", 0],
                                     "grow_mask_by": 12}}
                g["5"]["inputs"]["latent_image"] = ["9", 0]
                g["5"]["inputs"]["denoise"] = args.denoise
                meta.update({"source_image": args.image, "mask": args.mask, "control": "inpaint",
                             "denoise": args.denoise, "grow_mask_by": 12})

        if args.mode != "t2i" and not os.path.isabs(args.out):
            print(f"[warn] --out 为相对路径，将相对当前工作目录解析: {os.path.abspath(args.out)}", file=sys.stderr)
        args.out = os.path.abspath(args.out)

        if args.dry_run:
            print(json.dumps({"mode": args.mode, "meta": meta, "graph": g, "out": args.out},
                             ensure_ascii=False, indent=2))
            return 0

        run_prompt(g, label, args.out, meta, timeout=args.timeout)
        return 0

    except RunnerError as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("[FAIL] 被中断，采样线程已收尾", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
