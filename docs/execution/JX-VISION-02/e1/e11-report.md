# E1.1 执行报告（收口版）

范围：只改 `<LAB_ROOT>` 与独立 worktree 的本目录文档/脚本；**未改产品代码、未动 R1 分支、未触碰 PR #127、未合并 PR #128**。
判定口径：`PASS` = 真实执行并通过；`REVIEW` = 指标通过但视觉/语义需人工判；`BLOCKED` = 前置缺失；`NOT RUN` = 未执行；`DEFERRED` = 明确推迟。

---

## 1. 总览

| 类别 | 结果 |
|---|---|
| 运行器 | 16/16 离线测试 PASS；`--dry-run`、`dual` 串联、失败 receipt、空图拒收、路径穿越阻断全部覆盖 |
| 自检 | Quick 9/9 PASS、exit 0（ComfyUI 运行态）；服务停止时该单项为 BLOCKED、exit 0（非 Strict）；Full 可跑；负例 N1–N5 + P1 全 PASS、exit 0 |
| 双 ControlNet | PASS：768²、24 步、depth 0.55 / canny 0.7，输出 `e11-dual_jx_00002_.png`（水墨山脊 + 山顶亭塔，视觉可信） |
| Wan 文生视频 | PASS：704×480、49 帧、20 步、cfg 6、seed 20261128 → 67.7 s 出 3.063 s VP9 WebM（89 KB） |
| 局部重绘 | 合成指标 PASS（遮罩外 max diff = 0），内容质量 **REVIEW**；三组参数对比见 §4 |
| WSL2 CUDA | PASS：torch 2.15.0+cu132，capability [12,0]，8192³ FP16 十次矩阵乘 0.162 s → **67.8 TFLOPS** |
| Blender 5.3 / 5.2.5 | PASS：GN 625 顶点、OptiX 1.52 s / 1.60 s、GLB 64,524 B、浏览器 1,164 三角形 |
| Blender 批量 | PASS：3 帧 480×270/16 spp，2.0 s，全成功 |
| Wrangler Worker | PASS：`wrangler dev --local`，`GET /health` 200 `{"ok":true,"worker":"jx-e11"}` |
| 新终端恢复 | PASS：`environment.ps1` dot-source 后 Quick 9/9、exit 0 |
| RenderDoc 抓帧 | **BLOCKED**：目标进程未加载 `renderdoc.dll`，`GetNumCaptures=0`，无 `.rdc` |
| FLUX / Qwen 下载与生成 | **NOT RUN**：等作者 HF 授权回执；镜像带宽 0.41 MB/s |
| Inkscape / TripoSR | **DEFERRED**：带宽与许可核验未完成，不虚报为已装 |

---

## 2. 运行器与自检（审查问题 1、2、3）

### 2.1 运行器修复点

- `_stop_event` 改名，不再覆盖 `Thread._stop`；`try/finally` 保证失败也写 receipt。
- 明确区分 `completed / error / timeout`；拒收空文件、0 字节、PIL 不可解码的 PNG。
- `_safe_relpath` 阻断 `..` 与绝对路径；同名输出自动 `-001`；输入限制在 `JX_INPUT_DIR`。
- 分辨率、步数、cfg、denoise 白名单校验；`--dry-run` 只打印工作流不发请求。
- VRAM 双口径：`device_*`（设备总占用）与 `task_delta_peak_mib`（任务增量峰值），不再混用。
- 新增 `dual` 模式：Depth → Canny 串联，两个 ControlNet 同时生效。

测试：`test-comfy-runner.py` **16 项全绿**。过程中修过两处真实缺陷：输入校验改为每次读 `os.environ["JX_INPUT_DIR"]`（避免测试间污染）；输出下限从 1024 B 降到 64 B 并改为依赖 PIL 解码（避免小图误拒）。

### 2.2 自检分层与退出码

- `verify-environment.ps1`：Quick（9 项）与 Full（追加 torch-cuda / comfyui-models / comfyui-generate / blender / ffmpeg / magick / ktx / gltf / postgres / model-integrity / runner-tests）；`-Strict` 要求必需项全 PASS。
- 退出码：存在 FAIL → 1；Strict 下必需项 BLOCKED → 2；否则 0。
- 负例脚本 `test-verify-negative.ps1`：N1（缺工具 FAIL）、N2（缺模型 FAIL）、N3（服务未起 BLOCKED）、N4（磁盘不足 FAIL）、N5（仅 BLOCKED 无 FAIL 时 Strict 退出 2）、P1（正常环境 exit 0）——**全部 PASS**。

真实输出：`Management/Reports/verify-quick.json`、`neg-*.json`。

---

## 3. 代表性实验

### 3.1 双 ControlNet

- 命令：`comfy-workflow-runner.py dual --depth e1_base.png --canny-edge ... --depth-strength 0.55 --canny-strength 0.7`
- 参数：768×768、24 步、dpmpp_2m/karras、seed 20261128。
- 结果：`Outputs/Images/dual/e11-dual_jx_00002_.png`，水墨山脊与山顶亭塔结构清楚；receipt 记录 **0.57 s**（ComfyUI 节点/模型缓存命中，不代表冷启动）。
- 教训：首次失败是未设 `JX_COMFY_RAW_OUT` 导致“未找到输出”；该变量现已在 `environment.ps1` 中默认设置。

### 3.2 Wan 2.1 T2V

- 新脚本 `wan-t2v.py`：UNETLoader（`wan2.1_t2v_1.3B_fp16`）+ CLIPLoader type=wan + `WanImageToVideo`（无 start_image）+ `ModelSamplingSD3` shift 8 + KSampler（uni_pc/simple）+ SaveWEBM（VP9/16fps）。
- 实测：704×480、49 帧、20 步、cfg 6、seed 20261128 → **67.7 s**，3.063 s WebM（89 KB），首帧为云海孤塔写实画面。
- 结论：1.3B 在 24 GB 上可跑，可作“动态构图预演”；不是最终视频质量，正式镜头仍需更大模型或分层渲染。

### 3.3 WSL2 CUDA

- Ubuntu 24.04 + Python 3.14 venv `/root/jx-gpu`，torch **2.15.0+cu132**（TUNA 镜像）。
- `wsl-cuda-bench.py`：8192³ FP16 十次 matmul 0.162 s → **67.8 TFLOPS**；`torch.cuda.is_available()=True`，capability **[12,0]**。
- 意义：证明 Windows 侧暂不升级 torch 不影响 WSL 侧使用新 CUDA 轮子；两条栈可并存。

### 3.4 Blender 双版本与批量

- 详见 `blender-5.3.md`；5.3.0 OptiX 1.52 s、5.2.5 1.60 s，GLB 均 64,524 B，浏览器均 WebGL2 / 1,164 三角形 / ANGLE RTX 5090。
- 批量：`batch-render.py` 3 帧 480×270/16 spp，**2.0 s**，文件 `batch_0001..0003.png` 全存在。

### 3.5 Wrangler Worker

- `Workspaces/Toolchain-test/wrangler-worker`，`wrangler dev --local`。
- `GET /health` → 200 `{"ok":true,"worker":"jx-e11",...}`；仅本地能力验证，未登录 Cloudflare、未部署。

---

## 4. 局部重绘：指标与视觉分离

度量脚本 `inpaint-metrics.py`：内缩 6 px + σ4 羽化，输出 SSIM（全域/遮罩外/遮罩内）与 Sobel 边缘相关，并保存 `original / ai-raw / mask / mask-feathered / composite` 五张存档。

| 尝试 | 参数 | SSIM outside | SSIM inside | 边缘相关 | 遮罩外 max diff | 视觉 |
|---|---|---|---|---|---|---|
| v1 | denoise 0.85 / 24 步 | 0.9995 | 0.3834 | 0.0756 | 0 | 塔顶黑色畸变，差 |
| v2 | denoise 0.95 / 30 步 | 0.9994 | 0.2455 | 0.0417 | 0 | 结构完整（亭塔），但左侧出现大面积柔和光晕 |
| v3 | denoise 0.65 / 30 步 | 0.9995 | 0.4542 | 0.2099 | 0 | 原山峰纹理被抹平，塔未出现 |

**判定**：合成层面 **PASS**（遮罩外像素零改动、边界无缝）；语义/视觉层面 **REVIEW**。这不是“重绘成功”的证据，而是“度量能可靠区分合成正确与内容失败”的证据。

生产建议：
1. 遮罩必须贴合目标轮廓，`grow_mask_by` 控制在 4–8，避免 12 以上的大范围重绘。
2. denoise 0.75–0.85 + 明确描述“保留原山体、只加塔”比 0.95 更稳。
3. 正式资产需要人工修版或分割式合成；纯 SDXL inpaint 不足以直接交付。

---

## 5. RenderDoc：BLOCKED 的技术结论

已排除：API 索引错误（按官方 header 修正 Set=0/Start=8/End=10）、HWND 传参、GL 上下文（moderngl 3.3 / RTX 5090 / 617.42 正常）、sandbox Python 与 ComfyUI Python 两种目标、F12 SendKeys。

实测：`renderdoccmd capture` 启动目标后，进程内 `EnumProcessModules` **未发现 renderdoc.dll**；手动 `WinDLL` 加载是第二实例，`StartFrameCapture` 无效、`IsFrameCapturing` 返回垃圾值、`GetNumCaptures=0`。

结论：当前环境无法完成 API 注入式抓帧，**不伪造 `.rdc`**。可选下一步（需作者决定）：管理员权限重试、临时关闭安全软件、改用 D3D11 目标、或接受“内置 profiler + 浏览器 WebGL 检查”的替代证据链。

---

## 6. 新工具与实训

| 工具 | 版本 | 校验 | 实测 |
|---|---|---|---|
| Krita | 5.3.4.1 | 官方 SHA-256 匹配 `eda810…d032` | `krita.exe --version` → `krita 5.3.4.1 (git bd6e8d0)` |
| Audacity | 4.0.2 | 官方 checksum 匹配 `6f3756…c5b3` | `Audacity4 4.0.2` 启动通过 |
| Numba | 0.68.1 | pip 安装 | 求和结果正确 |
| Taichi | 1.7.4 | pip 安装 | `rel_error=3e-6`，`taichi_ok=true` |
| analysis venv | Python 3.13.18 | — | numpy 2.5.5 / scikit-image 0.26.0 / scipy 1.18.1 / moderngl 5.13 / glfw |

Krita 用于手绘遮罩与笔触修版，Audacity 用于对白/环境声预演；二者均为便携解压，不写系统安装。

---

## 7. 结论边界

- 本报告不声称“FLUX 已接入”或“RenderDoc 已抓帧”；这两项分别是 NOT RUN 与 BLOCKED。
- 双 CN 的 0.57 s、Wan 的 67.7 s 都是**本机特定缓存状态**下的单次测量，不作跨机器性能承诺。
- 局部重绘的 PASS 只针对合成正确性；内容质量明确标 REVIEW。
- 所有资产仍留 `<LAB_ROOT>`，未进 Git；本目录只含脚本、路径模板与脱敏数据。

复现入口见 `README.md` 与 `playbook.md`。
