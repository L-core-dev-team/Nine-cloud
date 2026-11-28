# E1 · 阻塞项与未执行项

三类口径：

- **A 类**：需要作者本人操作（UAC / 账号许可 / 采购决策 / 删除原有文件）。
- **B 类**：环境已具备，E1 未排进时间窗，接任者可直接执行（不算阻塞）。
- **C 类**：平台或工具本身的技术限制，附绕法。

---

## A 类 · 需作者本人

| # | 事项 | 现状 | 需要作者做什么 |
|---|---|---|---|
| A1 | Krita 安装 | winget 两次失败（交互式 UAC 在无人值守下被拒，错误码 `0x800704c7`）；未采用非官方便携包 | 手动执行安装并在 UAC 点"是"，或在 Microsoft Store 安装 |
| A2 | 宿主 PostgreSQL 17 客户端 | 容器内 `psql` 已验证（17-alpine，自定义端口，库表查询通过）；宿主无原生 `psql` | 如需在 PowerShell 直接使用，授权安装 PostgreSQL 17（安装源实测较慢） |
| A3 | FLUX.1-schnell | `gated=auto`，需登录并接受许可 | 在模型页接受许可后通知接任 Agent 拉取 |
| A4 | 旧共享根下两份截断 Wan 权重 | 已加 `README-DO-NOT-USE.txt`，未删除 | 确认后可删（回收约 2.4 GB），或保留 |
| A5 | WSL2 内 GPU 计算 | WSL 可见 GPU，但发行版 python3 为 3.14，无 cu130 wheel | 如需 Linux 侧训练/编译能力，需在 WSL 建 3.12 虚拟环境并下载约 3 GB torch |
| A6 | 大型工具采购（Unreal / Unity / Houdini / DaVinci） | 未安装，理由见 `toolchain.md` §7 | 按需点名，不在 E1 预装 |
| A7 | 独立分支推送与开 PR | 已用作者已登录的 GitHub 凭据完成 | 无需额外授权（除非更换账号/仓库） |

---

## B 类 · 环境已具备、未执行

| # | 事项 | 为什么没跑 | 怎么跑 |
|---|---|---|---|
| B1 | Wan 2.1 视频推理 | E1 仅要求权重完整性核验；一次 480p 短片需重新加载约 9.5 GB 权重 | ComfyUI 原生 Wan 节点，显存预算见 `gpu-and-graphics.md` §5 |
| B2 | 双 ControlNet 并联（Depth + Canny） | 单路各自已验；并联属 R1 构图需求 | 串接两个 `ControlNetApplyAdvanced`，预计 22 GiB 内（推断） |
| B3 | LoRA / 微调 | 无明确训练目标 | R1 明确风格资产需求后，512–768 起步 |
| B4 | RenderDoc 实际抓帧 | 无目标图形进程 | `renderdoccmd capture <exe>`；Web 侧走 Chrome + ANGLE 捕获 |
| B5 | Playwright 截图基线库 | 视觉回归工具已双向验证，但基线应来自真实产品页面 | R1 前端首版后用 `scripts` 内 `vr-check` 思路建立基线 |
| B6 | COLMAP / Brush / SuperSplat / MeshLab / Hunyuan3D / TRELLIS | 三维重建与图生 3D 未进入 R1/R2 主线，一次性拉 12 GB+ 不划算 | 官方来源已登记在本地 download-plan 的 pending 段 |

---

## C 类 · 技术限制与绕法

| # | 限制 | 现象 | 绕法 |
|---|---|---|---|
| C1 | Lighthouse 无法审计 WebGL/WebGPU 页 | headless 返回 `NO_FCP`，swiftshader 亦然 | 三维页走 Playwright 截图 + pixelmatch 视觉回归 |
| C2 | `ktx create` 参数与 codec | 输出参数在前报错；`etc1s` 非法 | 顺序 `<input> <output>`；codec 用 `basis-lz` / `uastc` |
| C3 | RenderDoc zip 解压 | `Expand-Archive` / `tar` 均失败 | 用 Python `zipfile.extractall` |
| C4 | npm 镜像滞后 | 私有镜像报 ETARGET | 显式 `--registry https://registry.npmjs.org` |
| C5 | 直连 huggingface.co 被拒 | `WinError 10060/10061` | 设镜像端点（`HF_ENDPOINT`），大文件用 curl/aria2 |
| C6 | `huggingface_hub` 2.x 与 `transformers` 5.x 冲突 | 版本约束冲突 | 依赖分目录隔离（美术库 / 下载库分开） |
| C7 | 大文件多连接下载产生坏块 | 整文件 SHA-256 与上游不符 | 最终校验用单连接顺序下载 |
| C8 | PowerShell 超时会杀掉其子进程 | winget / aria2 被连带终止 | 长任务用 `Start-Process` 脱离进程并重定向日志 |
| C9 | `LoadImage` 的 MASK 取自 alpha | 灰度遮罩无 alpha → 遮罩全黑，重绘看似无效 | 先接 `ImageToMask`（channel=red）再喂 `VAEEncodeForInpaint` |

---

## 环境层面的"看似可用、实际不可用"

- PATH 首位可能被注入运行时（node 22 / python 3.13 CPU 版 torch），与项目要求的 Node 24 / CUDA 环境冲突 → 一律用 `environment.ps1` 或绝对路径。
- `winget list` 显示"已安装"不代表能在命令行调用；以实际可执行文件路径与版本输出为准。
- ComfyUI 自带的是 DepthAnything **V3** 节点族，不是 E1 使用的 V2 Small；V2 深度图由外部 transformers 脚本生成。
