# JX-VISION-02 · E1 本地环境建设（脱敏交付说明）

本目录记录 E1 阶段（2026-11-27 ～ 2026-11-28）在本机完成的环境建设结果与可复现方法。
**E1 不包含任何产品代码改动**：不改游戏源码、世界观、数据库结构、前端设计、锁文件与 CI 门禁；未合并任何 PR、未部署、未做生产库迁移。
正式产品开发权仍归 GPT-6.2 / Codex，E1 停在环境建设完成处。

> 公开仓库只保留相对路径、版本号、校验值、许可与复现命令。
> 本机绝对安装路径、账号状态、原始素材与大型权重均留在本地，不进入 Git。

---

## 1. 结论摘要

| 维度 | 结果 |
|---|---|
| 开发工具链 | Node 24 / pnpm 11.19.0 / Python 3.13 / Rust 1.98 / GCC 16.2 / CMake 4.4 全部通过"版本 + 最小运行"双向验证 |
| 数据库与本地服务 | Docker engine 29.9.3 可用；PostgreSQL 17 容器 `postgres:17-alpine` 完成建库、建表、查询验证；Supabase CLI 3.4、Wrangler 4.169 仅本地能力验证，未登录生产 |
| GPU 计算 | RTX 5090 Laptop（24,463 MiB，compute 12.0，驱动未改动）＋ PyTorch 2.12.1+cu130：矩阵乘法、ODE 求解、ControlNet 前向全部通过，CPU/GPU 误差 4.58e-05 |
| SDXL 受控生图 | Text-to-Image / Image-to-Image / Depth ControlNet / Canny ControlNet / Inpainting / Real-ESRGAN 4× 六条工作流全部真实出图，1024² 单图 6–12 s（首图含加载 41 s），峰值显存 19.2 GiB |
| 三维资产链路 | Blender 5.2 LTS（Cycles OptiX）→ GLB 导出 → `gltf-transform validate` 零错误 → three.js 浏览器加载 + KTX2 贴图显示，全链路打通 |
| Web 测试工具 | Playwright 1.63 + Chromium、axe-core 4.14（violations=0）、Lighthouse 13.6（100/100/96）、pixelmatch 6.0（双向判定正确） |
| 素材与模型 | 复用既有 30 套 CC0 PBR 材质（150 文件）+ 15 张 4K HDRI；Wan 2.1 权重经 SHA-256 与官方 LFS oid 对齐后判定完整，旧截断副本仅标注不删除 |

---

## 2. 复现路径（三步）

```powershell
# 1) 载入环境（会话级，不写系统配置）
. <LAB_ROOT>\Management\environment.ps1

# 2) 健康检查（20+ 项，输出 PASS / FAIL / BLOCKED 与 JSON 报告）
Invoke-JxVerify

# 3) 需要 API 生图时启动 ComfyUI（已在跑会自动跳过）
Start-JxComfyUI
```

`<LAB_ROOT>` 为本机资源中心根目录（建议 `D:\Jiuxiao-Lab`，也可放在任意剩余空间 ≥60 GiB 的盘）。
`environment.ps1` 与 `verify-environment.ps1` 的脱敏模板见本目录 `scripts/`。

---

## 3. 目录职责（与产品工作树分离）

```
<LAB_ROOT>\
├─ Tools\        独立安装的可执行工具（便携优先，不污染系统 PATH）
├─ Models\       统一模型根（经 ComfyUI extra_model_paths.yaml 共享）
├─ Environments\ 隔离 Python 依赖（AI 美术 / 科学计算 / 三维重建）
├─ Assets\       素材登记（本体可留在既有 CC0 缓存，不重复拷贝）
├─ Cache\        HuggingFace / Torch / 渲染临时 / 下载包
├─ Workspaces\   实验工程（图形 / AI-Art / 物理 / 音频）
├─ Outputs\      测试产物（含 E1 真实生成图与基准）
└─ Management\   清单、脚本、日志、报告、许可、接任说明
```

正式代码工作树保持原状，不做迁移；已装好的 ComfyUI / Blender / Python 不搬家，只登记真实路径并通过 `extra_model_paths.yaml` 复用模型。

---

## 4. 本目录文件索引

| 文件 | 内容 |
|---|---|
| `toolchain.md` | 工具版本、许可、验证状态与验证方式 |
| `gpu-and-graphics.md` | GPU 与图形管线实测数据、显存规划、已知限制 |
| `models.md` | 模型来源、字节数、SHA-256、许可与放置约定 |
| `blockers.md` | 需作者本人处理项 / 尚未执行项 / 技术限制与绕法 |
| `scripts/verify-environment.ps1` | 脱敏健康检查脚本（参数化根目录） |
| `scripts/comfy-workflow-runner.py` | 六种受控生图工作流的 API 运行器（路径全部走环境变量） |

---

## 5. 给接任者的三条硬约束

1. **不要重复安装**：先看 `toolchain.md` 的验证状态，`verified` 的不要再装。
2. **不要相信 PATH**：本机存在注入的运行时（node 22 / python 3.13 CPU 版 torch）会遮蔽真实环境；一律用 `environment.ps1` 或绝对路径。
3. **模型先校验再用**：字节数 + SHA-256 与上游 LFS oid 一致才算可用；截断权重只标注、不删除。
