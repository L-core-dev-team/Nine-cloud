# 工具调用手册（E1.1）

面向接任者的最短操作路径与已知坑。所有命令默认已 `dot-source` `environment.ps1`。

---

## 1. 环境

```powershell
. <LAB_ROOT>\Management\environment.ps1
jx-verify                 # Quick 9 项
jx-verify -Mode Full      # 追加真实计算/渲染/生图/数据库
```

- `environment.ps1` 只改当前进程：`JX_LAB_ROOT`、`JX_COMFY_ROOT`、`JX_COMFY_URL`、`JX_COMFY_PY`、`JX_COMFY_RAW_OUT`、`JX_INPUT_DIR`、`JX_BLENDER` 与函数。
- 新窗口必须重新 dot-source；不要把变量写进系统环境。

## 2. ComfyUI

```powershell
Start-JxComfyUI          # PID 写 Cache\comfyui.pid，日志 Management\Logs
Stop-JxComfyUI
Invoke-RestMethod http://127.0.0.1:8188/system_stats
```

坑：

- `JX_COMFY_RAW_OUT` 未设置时，运行器会报“未找到输出”；先 dot-source 或手动设。
- 输入图必须在 `JX_INPUT_DIR` 内，运行器不接受任意外部路径。
- `LoadImage` 的 `MASK` 输出只认 alpha；普通遮罩图需 `ImageToMask channel=red`。
- 首次跑含模型加载，耗时不代表稳态；缓存命中时 0.5–1 s 属正常。

## 3. 运行器

```powershell
python scripts\comfy-workflow-runner.py t2i --prompt "..." --width 1024 --height 1024 --steps 24
python scripts\comfy-workflow-runner.py i2i --image base.png --prompt "..." --denoise 0.6
python scripts\comfy-workflow-runner.py inpaint --image base.png --mask mask.png --prompt "..." --denoise 0.8
python scripts\comfy-workflow-runner.py dual --depth base.png --canny-edge edge.png --depth-strength 0.55 --canny-strength 0.7
python scripts\comfy-workflow-runner.py --dry-run t2i --prompt "..."
python scripts\test-comfy-runner.py        # 16 项离线回归
```

退出码：0 成功；非 0 失败。失败也会写 `receipt.json`，先看 `error` 字段，不要盲重跑。

## 4. 视频

```powershell
python scripts\wan-t2v.py --prompt "..." --width 704 --height 480 --frames 49 --steps 20 --out <OUT>
```

- 输出 VP9 WebM；同时存首/末帧 PNG 与 receipt。
- 1.3B 模型约 16 GB 显存；与 SDXL 同时跑前先 `Stop-JxComfyUI` 或清模型。

## 5. Blender

```powershell
& $env:JX_BLENDER -b --factory-startup --python-exit-code 1 `
  --python scripts\verify-blender.py -- <OUT_DIR> <TAG>
```

- 便携 ZIP 用 Python `zipfile` 校验，`7zr` 不支持 zip。
- 双版本路径由 `environment.ps1` 探测：5.3.0 → 5.2.5 → 系统 5.2。
- GLB 导出后用 `gltf-transform validate` 与 `scripts/jx-glb-check.cjs` 双重检查。

## 6. 下载与校验

```powershell
python scripts\hf_download_verified.py --repo <org/name> --file <path> --dest <DIR> --sha256 <HEX>
```

- 先 `curl -sIL <resolve-url>` 读 `X-Linked-Size` / `X-Linked-ETag`，再下载。
- 大文件用单连接 curl 断点续传；aria2 多连接曾产生坏块。
- `hf-mirror.com` 可用但慢；`huggingface.co` 直连常超时。
- 下载后必须整文件 SHA-256 + 字节双校验，不能只看“下载完成”。

## 7. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 运行器“未找到输出” | 未设 `JX_COMFY_RAW_OUT` | dot-source `environment.ps1` |
| ComfyUI 起不来 | 端口占用 / venv 缺包 | 看 `Management\Logs\comfyui.err`；`Stop-JxComfyUI` 后重启 |
| Blender 渲染全黑/构图怪 | 相机未对准 | 用 `to_track_quat('-Z','Y')` 指向目标 |
| `ktx create` 参数报错 | 只接受 `<input> <output>` | 用 `--codec basis-lz|uastc`，不要旧版多参数写法 |
| npm 安装 ETARGET | 镜像缺版本 | `--registry https://registry.npmjs.org` |
| WSL 后台进程随 shell 退出 | `nohup &` 被杀 | 前台限时跑，或从 Windows `Start-Process wsl` 保持 |
| RenderDoc 无 `.rdc` | 注入未生效 | 见 `blockers.md`；不要伪造抓帧结果 |

## 8. 禁止事项

- 不把私料、原始图、权重、绝对路径、token 提交到 Git。
- 不原地升级 Node/pnpm/ComfyUI/FFmpeg；先隔离目录回归。
- 不为通过检查而伪造 JSON、日志或 `.rdc`。
- 不删除截断权重，直到完整副本二次核验完成。
- 不代作者注册/登录 HF，不代接受 gated 许可。
