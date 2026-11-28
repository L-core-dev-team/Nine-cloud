# JX-VISION-02 · E1 / E1.1 本地环境建设（脱敏交付说明）

本目录记录 E1（2026-11-27 ～ 28）与 E1.1 收口（2026-11-28）在本机完成的环境建设、审查修复与复现方法。
**不包含任何产品代码改动**：不改游戏源码、世界观、数据库结构、前端设计、锁文件与 CI 门禁；未合并任何 PR、未部署、未做生产库迁移；R1 分支与 PR #127 未被触碰。

> 公开仓库只保留相对路径、版本号、校验值、许可与复现命令。
> 本机绝对安装路径、账号状态、原始素材与大型权重均留在本地，不进入 Git。

---

## 1. 结论摘要

| 维度 | E1 结果 | E1.1 收口 |
|---|---|---|
| 开发工具链 | Node 24 / pnpm 11.19 / Python 3.13 / Rust 1.98 / GCC 16.2 / CMake 4.4 版本+最小运行双验 | 全量版本复核，给出升级/保持决策（`version-audit.md`） |
| 数据库与本地服务 | PostgreSQL 17 容器建库建表；Supabase CLI 3.4、Wrangler 4.169 本地能力验证 | Wrangler Worker `GET /health` 200（本地 `dev --local`） |
| GPU 计算 | RTX 5090 Laptop 24,463 MiB / compute 12.0；torch 2.12.1+cu130 前向通过 | WSL2 + torch 2.15.0+cu132 实测 **67.8 TFLOPS** |
| SDXL 受控生图 | T2I / I2I / Depth / Canny / Inpaint / 4× 超分六条真实出图 | 双 ControlNet 串联出图；局部重绘严格度量（合成 PASS / 内容 REVIEW） |
| 视频 | Wan 权重哈希对齐 | Wan T2V 实跑 3.063 s / 67.7 s（704×480、49 帧） |
| 三维链路 | Blender 5.2 LTS → GLB → glTF 校验 → three.js + KTX2 | Blender **5.3.0 + 5.2.5 LTS 双版本** OptiX/GN/GLB/浏览器全验 |
| 自检 | 版本检查为主 | Quick/Full + Strict + 真实退出码；负例 N1–N5 + P1 全 PASS |
| 运行器 | 基础六工作流 | 16/16 回归、失败 receipt、空图拒收、路径穿越阻断、VRAM 双口径 |
| 新工具 | — | Krita 5.3.4.1、Audacity 4.0.2、Numba 0.68.1、Taichi 1.7.4 |

未完成项（明确标注，不冒充）：RenderDoc 实抓帧 **BLOCKED**；FLUX/Qwen 权重下载与生成 **NOT RUN**（等作者 HF 授权回执）；Inkscape/TripoSR **DEFERRED**。详见 `e11-report.md`。

---

## 2. 复现路径（三步）

```powershell
# 1) 载入环境（会话级，不写系统配置）
. <LAB_ROOT>\Management\environment.ps1

# 2) 健康检查（Quick 默认；Full 追加真实计算/渲染/生图/数据库）
jx-verify
jx-verify -Mode Full
jx-verify -Mode Full -Strict   # 必需项 BLOCKED 时退出码 2

# 3) 需要 API 生图时启动 ComfyUI（已在跑会自动跳过）
Start-JxComfyUI
```

`environment.ps1` 的模板在 `scripts/environment.ps1`：`<LAB_ROOT>` 可任意放置（建议剩余空间 ≥60 GiB），`JX_COMFY_ROOT` 指向既有 ComfyUI，不搬家、不复制模型。

运行器示例：

```powershell
python scripts\comfy-workflow-runner.py t2i --prompt "ink wash mountain" --width 1024 --height 1024
python scripts\comfy-workflow-runner.py dual --depth in.png --canny-edge edge.png --depth-strength 0.55 --canny-strength 0.7
python scripts\comfy-workflow-runner.py --dry-run inpaint --image a.png --mask m.png --prompt "stone tower"
```

---

## 3. 目录职责（与产品工作树分离）

```
<LAB_ROOT>\
├─ Tools\        独立安装的可执行工具（便携优先，不污染系统 PATH）
├─ Models\       统一模型根（经 ComfyUI extra_model_paths.yaml 共享）
├─ Environments\ 隔离 Python 依赖（AI 美术 / 科学计算 / 三维重建 / 浏览器抓帧）
├─ Assets\       素材登记（本体可留在既有 CC0 缓存，不重复拷贝）
├─ Cache\        HuggingFace / Torch / 渲染临时 / 下载包
├─ Workspaces\   实验工程（图形 / AI-Art / 物理 / 音频 / 工具链）
├─ Outputs\      测试产物（真实生成图、视频、GLB、截图）
└─ Management\   清单、脚本、日志、报告、许可、接任说明
```

正式代码工作树保持原状，不做迁移；已装好的 ComfyUI / Blender / Python 不搬家，只登记真实路径并通过 `extra_model_paths.yaml` 复用模型。

---

## 4. 本目录文件索引

| 文件 | 内容 |
|---|---|
| `toolchain.md` | 工具版本、许可、验证状态与验证方式 |
| `gpu-and-graphics.md` | GPU 与图形管线实测数据、显存规划、已知限制 |
| `models.md` | 模型来源、字节、SHA-256、许可与 FLUX 选型结论 |
| `flux-selection.md` | FLUX 全系列与 Qwen/SDXL 对比、许可边界、下载后实测清单 |
| `version-audit.md` | 全软件版本复核与升级/保持决策 |
| `blender-5.3.md` | Blender 5.3.0 与 5.2.5 双版本验证、5.3 新功能对九霄的价值 |
| `e11-report.md` | E1.1 逐项证据、局部重绘三组对比、RenderDoc BLOCKED 结论 |
| `blockers.md` | 需作者本人处理项 / 尚未执行项 / 技术限制与绕法 |
| `playbook.md` | 常用命令、故障排查、禁止事项 |
| `scripts/verify-environment.ps1` | Quick/Full + Strict + 退出码的健康检查（参数化根目录） |
| `scripts/comfy-workflow-runner.py` | 七种受控工作流（含 dual）的 API 运行器（路径全走环境变量） |
| `scripts/test-comfy-runner.py` | 16 项离线回归 |
| `scripts/test-verify-negative.ps1` | N1–N5 + P1 负例 |
| `scripts/environment.ps1` | 环境入口模板（变量、PATH、启动/停止/自检） |
| `scripts/hf_download_verified.py` | HF 断点下载 + 字节/SHA 校验 |
| `scripts/wan-t2v.py` / `scripts/inpaint-metrics.py` | 视频最小工作流 / 重绘严格度量 |
| `scripts/audit-versions.ps1` / `scripts/wsl-cuda-bench.py` / `scripts/test-science-stack.py` | 版本审计 / WSL CUDA / 科学栈验收 |
| `scripts/verify-blender.py` / `scripts/batch-render.py` / `scripts/jx-glb-check.cjs` | Blender 双版本验证 / 批量渲染 / 浏览器 GLB 检查 |

---

## 5. 给接任者的硬约束

1. **不要重复安装**：先看 `toolchain.md` 的验证状态，`verified` 的不要再装。
2. **不要相信 PATH**：本机存在注入的运行时（Node 22 / Python 3.13 CPU 版 torch）会遮蔽真实环境；一律用 `environment.ps1` 或绝对路径。
3. **模型先校验再用**：字节 + SHA-256 与上游 LFS oid 一致才算可用；截断权重只标注、不删除（作者已原则同意清理，待完整副本二次核验）。
4. **gated 模型不代登录**：FLUX 等需作者本人完成 HF 授权；助手只负责授权后的下载、校验、配置与实跑。
5. **大版本升级先隔离**：Node 26 / pnpm 12 / ComfyUI 0.46 均需独立目录回归，禁止原地覆盖当前可用环境。
