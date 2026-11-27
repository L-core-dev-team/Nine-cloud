# 本地执行环境（2026-11-27 检测）

只记录硬件与版本，不记录用户名、路径与序列号。检测方法见 [handoff/04 §1](handoff/04-本地环境与GPU.md)。

## 硬件

| 项 | 结果 |
|---|---|
| 操作系统 | Windows 11 家庭版 中文版，内部版本 26300 |
| CPU | Intel Core Ultra 9 290HX Plus，24 核 / 24 线程 |
| 内存 | 64 GB |
| GPU | NVIDIA GeForce RTX 5090 Laptop GPU，24 GB 显存（`nvidia-smi` 24463 MiB），计算能力 12.0（Blackwell） |
| 驱动 | NVIDIA 617.42，CUDA UMD 13.4 |
| 磁盘 | 系统盘可用约 10 GB（**不得**放模型或缓存）；数据盘可用约 250 GB |

## 软件

| 工具 | 版本 | 备注 |
|---|---|---|
| Git | 2.56.0 | |
| Node.js | 24.16.0 | 满足 `engines.node >= 24` |
| pnpm | 11.19.0（经 corepack） | 全局未装 pnpm；会话用一个仓库外的 `pnpm` 垫片调用 `corepack pnpm` |
| Python | 3.11.9（默认）、3.12 | 资产管线用独立 venv |
| PyTorch | 2.12.1 + CUDA 13.0 | 在本机 ComfyUI 的 venv 中，`torch.cuda.is_available() = True`，识别 sm_120 |
| ComfyUI | 桌面版，已装 | 现有模型只有视频类（Wan 2.1 1.3B 等），**没有** SDXL、FLUX schnell、ControlNet、Depth Anything |
| Blender | 5.2.2 LTS | Cycles 设备：CUDA、**OptiX**（RTX 5090 Laptop）、CPU |
| Docker | 29.9.3（Docker Desktop，WSL2 后端） | 集成测试用独立容器 `postgres:17-alpine` |
| WSL2 | Ubuntu（已停止） | 需要 POSIX 环境时可用 |
| FFmpeg | 8.1.1 | |
| gh | 2.96.0 | 已登录 |
| gitleaks | 8.30.1 | |
| VS Code | 1.143.1 | |
| 未安装 | PostgreSQL 客户端（psql）、exiftool、lychee、wrangler、7-Zip、Krita、CUDA Toolkit（nvcc） | wrangler 可经 `pnpm dlx` 使用；其余按需 |

## 计算后端选择（按 handoff/04 §2）

- 渲染：Blender Cycles **OptiX**。
- AI 推理：CUDA 版 PyTorch（与 ComfyUI 共用的 2.12 + cu130 已验证可用）。24 GB 显存足以运行 SDXL + ControlNet 全精度、FLUX.1 schnell fp8。
- 实时渲染原型：浏览器 WebGL2 / WebGPU（RTX 5090 Laptop）。移动端档位仍需真机。

## 基线（`claude/jx-exec-r1` @ `06b327b`，Node 24.16，Windows）

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm build` | 通过 |
| `pnpm test` | 通过：web 319、api 445（另 100 项需数据库而跳过）、domain 141、content 25、contracts 17；冻结检查与 core regression 通过 |
| PR #127 CI（`verify`，GitHub） | 通过（run 45929785918） |

数据库相关测试结果记在执行台账第 4 节。
