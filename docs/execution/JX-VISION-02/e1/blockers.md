# E1.1 · 阻塞项与未执行项

三类口径：

- **A 类**：需要作者本人操作（账号授权 / 采购决策 / 删除原有文件）。
- **B 类**：环境已具备、本轮未排入，接任者可直接执行（不算阻塞）。
- **C 类**：平台或工具本身的技术限制，附绕法。

---

## A 类 · 需作者本人

| # | 事项 | 现状 | 需要作者做什么 |
|---|---|---|---|
| A1 | Hugging Face 注册/登录/FLUX 访问授权 + 本地身份验证 | 本机 `~/.cache/huggingface/token` 不存在；助手不代注册、不代登录 | 完成注册与登录，接受目标模型许可，回执“已授权”；之后由助手下载、校验、配置、实跑 |
| A2 | FLUX.2 [klein] 4B（Apache-2.0）/ Qwen-Image 2512（Apache-2.0）下载 | 未下载：授权未回执 + 带宽 0.41 MB/s（klein 约 8 GB 需 5–6 h，Qwen FP8 20.4 GB 需 14 h+）；且 FLUX.2 需更新 ComfyUI 核心/节点与配套编码器，当前 0.30.1 不保证加载 | 授权回执后先确认目标 ComfyUI 版本与节点，再决定只下 klein 或同时评估 ModelScope 镜像 |
| A3 | 旧共享根下两份截断 Wan 权重 | 已加 `README-DO-NOT-USE.txt`，未删除；完整副本已哈希核验但未做“删除后重跑”二次确认 | 确认后删除（回收约 2.4 GB）；或明确保留 |
| A4 | RenderDoc 抓帧是否继续 | 已确认 API 注入失败（详见 §C1），当前无 `.rdc` | 决定：管理员权限/关安全软件重试，或接受 BLOCKED 并改用内置 profiler |
| A5 | 大型商业工具（Unreal / Unity / Houdini / DaVinci） | 未安装，不在本轮范围 | 按需点名，不预装、不产生费用 |
| A6 | Inkscape / TripoSR 图生 3D | Inkscape 未装（可便携）；TripoSR 许可 MIT、`gated=False`，但权重与依赖体积未评估完 | 若需要，授权后按官方源安装并实测 |

---

## B 类 · 环境已具备、未执行

| # | 事项 | 为什么没跑 | 怎么跑 |
|---|---|---|---|
| B1 | LoRA / 微调 | 无明确训练目标与数据集边界 | 等 R1 明确风格资产需求后，512–768 起步；不在 E1.1 凭空训练 |
| B2 | Playwright 视觉基线库 | 工具双向验证过，但基线应来自真实产品页面 | R1 前端首版后建立；不要用测试页冒充产品基线 |
| B3 | COLMAP / Brush / SuperSplat / MeshLab / Hunyuan3D / TRELLIS | 图生 3D 未进入 R1/R2 主线，一次性拉 12 GB+ 不划算 | 官方来源已登记在本地 download-plan 的 pending 段 |
| B4 | FLUX 与 Qwen 的实际生成测试 | 权重未下载（A1/A2） | 授权后按 `flux-selection.md` §5 的七项测试逐条跑，未跑不得写“已选型” |

---

## C 类 · 技术限制与绕法

| # | 限制 | 现象 | 绕法 |
|---|---|---|---|
| C1 | RenderDoc 注入式抓帧 | `renderdoccmd capture` 启动目标后进程内无 `renderdoc.dll`；手动 `WinDLL` 为第二实例，`GetNumCaptures=0`，F12 无效 | 需管理员权限/关安全软件/换 D3D11 目标；当前如实标 BLOCKED，不伪造 `.rdc` |
| C2 | Lighthouse 无法审计 WebGL/WebGPU | headless 返回 `NO_FCP`，SwiftShader 同样 | 三维页走 Playwright 截图 + pixelmatch 视觉回归 |
| C3 | `ktx create` 参数与 codec | 输出参数在前报错；`etc1s` 非法 | 顺序 `<input> <output>`；codec 用 `basis-lz` / `uastc` |
| C4 | RenderDoc zip 解压 | `Expand-Archive` / `tar` 均失败 | Python `zipfile.extractall` |
| C5 | Blender 便携 ZIP 校验 | `7zr` 只支持 `.7z`，测不了 zip | Python `zipfile` + 官方 SHA-256 |
| C6 | npm 镜像滞后 | 私有镜像报 ETARGET | 显式 `--registry https://registry.npmjs.org` |
| C7 | 直连 huggingface.co 被拒 | `WinError 10060/10061` | `HF_ENDPOINT=https://hf-mirror.com`；大文件单连接 curl |
| C8 | `huggingface_hub` API 差异 | `hf_hub_download(max_workers=...)` 不存在 | 用 `snapshot_download` 或直接 `requests` 断点下载 |
| C9 | 大文件多连接下载坏块 | 整文件 SHA 与上游不符 | 单连接顺序下载，整文件 SHA-256 校验 |
| C10 | PowerShell 超时杀子进程 | winget / aria2 被连带终止 | 长任务 `Start-Process -WindowStyle Hidden -Redirect...` 脱离 |
| C11 | WSL 后台进程随 shell 退出 | `nohup ... &` 被杀 | 前台限时跑，或从 Windows `Start-Process wsl` 保持 |
| C12 | `LoadImage` 的 MASK 取自 alpha | 灰度遮罩无 alpha → 全黑，重绘看似无效 | 先接 `ImageToMask`（channel=red）再喂 `VAEEncodeForInpaint` |
| C13 | 局部重绘内容质量 | 合成边界完美（遮罩外 diff=0），但高 denoise 会产生光晕/畸变 | 内缩羽化 + denoise 0.75–0.85 + 紧贴轮廓遮罩；正式资产人工修版 |

---

## 环境层面的“看似可用、实际不可用”

- PATH 首位可能被注入运行时（Node 22 / Python 3.13 CPU 版 torch），与项目要求的 Node 24 / CUDA 冲突 → 一律用 `environment.ps1` 或绝对路径。
- `winget list` 显示“已安装”不等于命令行可调用；以实际可执行文件与 `--version` 输出为准。
- ComfyUI 自带 DepthAnything **V3** 节点族，不是 E1 使用的 V2 Small；V2 深度图由外部脚本生成。
- 版本审计里 npm 项目内依赖（axe-core / lighthouse / pixelmatch）显示为空，是“未装全局”，不代表项目内不存在。
