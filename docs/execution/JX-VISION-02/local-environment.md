# 本地工程与艺术环境

2026-11-27 接任实测。产品代码基线为 `64ca7ddf`，工程基线、集成测试和 GitHub CI 见[执行台账](README.md)。本页记录这台开发机可以重现的能力及其边界。

## 平台和工具

| 项目 | 检测结果及实际用途 |
|---|---|
| Windows 与 CPU | Windows 11 家庭版 x64，build 26300。Core Ultra 9 290HX Plus，24 核 / 24 线程。两条 32 GiB 内存，操作系统可见约 63.7 GiB。 |
| GPU 与存储 | NVIDIA GeForce RTX 5090 **Laptop**，驱动 617.42，计算能力 12.0。NVIDIA 报告总显存 24,463 MiB，取样时空闲 18,788 MiB。系统盘、数据盘取样时各空闲约 15.4、240.9 GiB。缓存和新输出使用数据盘。 |
| Linux 与容器 | WSL2 已登记 Ubuntu、PCMClawUbuntu、docker-desktop。启动默认 Ubuntu 后得到 26.04.1 LTS、内核 6.18.33.2，WSL 能枚举同一 GPU。WSL 内 CUDA 计算 NOT RUN。Docker Desktop 客户端和服务端均返回 29.9.3，初次检查时引擎为停止状态。 |
| JavaScript 与 Git | Node 24.16.0，Git 2.56.0.windows.4，gh 2.96.0，Corepack 0.35.0，npm 11.13.0。当前 shell 中直接调用 pnpm 得到 11.25.0，项目声明 11.19.0，现有外部 Corepack 启动脚本在执行工作树返回 11.19.0。新工作树先运行 `corepack pnpm --version`，确保嵌套脚本的 PATH 同样解析至该版本。 |
| 编译与脚本 | PowerShell 7.6.9，默认 Miniconda Python 3.13.13，py 启动器另登记 3.12 和 3.11，ComfyUI 环境为 3.13.12。uv 0.11.32，Conda 26.3.2，Rust / Cargo 1.98.1，CMake 4.4.3，MinGW g++ 16.2.0，MSVC cl 文件版本 19.44.35229.0。编译器为版本清点。 |
| 浏览器及测试 | Chrome 158.0.8127.38、Edge 158.0.4370.45；项目 Playwright 1.63.0，已缓存 Chromium revision 1248。下面的实际探针通过 Playwright 启动 Chrome。gitleaks 8.30.1 可调用。项目依赖中未检出 axe-core 或 Lighthouse，产品级无障碍与性能审查应根据 R2 场景执行。 |
| 服务工具 | 锁定依赖中的 Wrangler 可执行，返回 4.147.0。项目使用 pg 8.23.1；主机 PATH 上未找到 psql、Supabase CLI 和全局 Wrangler。Cloudflare、Supabase 与 GitHub 连接器在本轮工具目录中可见；云端资源操作应依据具体目标和权限。 |
| 数值及媒体 | PyTorch 2.12.1+cu130，NumPy 2.5.1，SciPy 1.18.0，SymPy 1.14.0，Pillow 12.3.0。项目外扩展库含 diffusers 0.40.0 与 accelerate 1.16.0。FFmpeg 8.1.1；Godot 4.7.2 可调用。另发现 COLMAP 4.2.0、Brush、SuperSplat 3.3.0、MATLAB R2026a 安装或工作目录，三维重建流程 NOT RUN。 |
| 工具缺口 | 当前 PATH 未解析 nvcc、Krita、ImageMagick 的 magick、Houdini 和 RenderDoc。OptiX 与 PyTorch 的下列测试复用了已安装驱动及各自运行时；本轮无需安装 CUDA Toolkit 或升级驱动。 |

## 已执行的能力测试

| 任务 | 检验与结果 |
|---|---|
| CUDA 矩阵乘法、CPU 数值校验 | 固定种子 17，在 CUDA 上以 FP32 相乘两个 512 × 512 标准正态矩阵，显式同步。对 CPU FP64 参考值转 FP32 后逐元检查，最大绝对误差 `4.57763671875e-5`。SciPy 在无量纲区间 [0,1] 积分 y′=−y，y(0)=1，和 exp(−1) 的绝对误差为 `7.77e-12`。 |
| Blender Cycles | Blender 5.2.2 LTS，恢复出厂启动场景，启用 OptiX 设备，关闭 CPU 渲染设备和降噪，8 spp，320 × 180。实写并重新解码有明暗变化的 PNG（36,583 字节）。该尺寸供冒烟验证，未测序章全景资产的时延或显存上限。 |
| 深度条件网络 | 离线载入已有 SDXL depth ControlNet FP16 权重，在 cuda:0 对合成的 128 × 128 条件图与 16 × 16 潜空间做单次前向，返回 10 个有限 CUDA 张量，中间输出 [1,1280,4,4]。此次单独前向测得 PyTorch 分配峰值约 2.44 GiB；完整 SDXL 管线及 X1(b) 为 NOT RUN。 |
| ComfyUI | 核心 0.30.1，从独立基础目录启动，监听回环地址，禁用自定义节点和 API 节点。真实排队执行 EmptyImage → SaveImage，重新解码 64 × 64 PNG，中心 RGB 为 (22,106,135)。服务识别 CUDA。启动日志另报告一个可选 API 工作流模板的预览图片缺失，该模板未测。 |
| 浏览器图形和声音 | Windows Chrome 无头模式，WebGL2 通过 ANGLE / NVIDIA D3D11 清屏并回读 RGBA (64,128,191,255)。WebGPU 在 NVIDIA 非回退适配器提交 WGSL 计算并回读 42。Web Audio 离线生成 48 kHz 单声道 440 Hz 纯音 4,800 样本，RMS 0.7071066。移动端浏览器、真实听感和游戏帧率均为 NOT RUN。 |

从项目根目录重跑以下探针。Python 使用已有独立环境；如需测试深度网络，将 diffusers 加入该环境，并通过 `--controlnet <已核验的本地目录>` 指定权重。Blender 的输出路径需位于已有的临时目录，文件名尚未占用。浏览器探针需要项目的 Playwright 依赖及 Chrome 稳定通道。

```text
python scripts/art/probes/gpu-probe.py
blender --background --factory-startup --python-exit-code 1 --python scripts/art/probes/cycles-optix-probe.py -- <新的本机输出文件.png>
node scripts/art/probes/browser-probe.cjs
```

## 上一执行者留下的可复用资产

- [已核验的缓存明细](art-cache.tsv)逐文件列出相对路径、发布方网址、作者、许可、长度与摘要。现场材质清单包含 30 套材质，每套有颜色、OpenGL 法线、粗糙度、位移和 AO 五通道，另有 15 张 4K HDRI。165 个文件逐项复算 SHA-256 和长度，全部与原台账一致，失败清单为空。项目可从现有缓存制作场景；逐项记录作者、用途、变更及正式包中的资产 ID。Poly Haven 的 CC0 说明适用于其发布的资产。[Poly Haven 许可](https://polyhaven.com/license)
- 比对两个模型日志与实际文件，depth 配置、depth 权重、Canny 配置共三项均与原摘要一致。Depth FP16 权重含 844 个张量，2,502,139,134 字节，SHA-256 为 `66a6813e6bd7270ecfe68206a59ddd605a011ae85321188376605c66e0a4f303`，也匹配发布方 LFS 对象。模型卡标注 OpenRAIL++，入正式资产管线时需同时核查基础模型与衍生素材的许可。[模型卡](https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0) · [发布方文件索引](https://huggingface.co/api/models/diffusers/controlnet-depth-sdxl-1.0/tree/main)
- 在原脚本指定的位置，SDXL base、Canny 权重及 Depth Anything V2 Small 模型均缺失。项目专用 HF 缓存、渲染和 AI 输出目录无完成品。ComfyUI 的共享模型目录中 Wan 主权重与文本编码器大小低于各自 safetensors 头部声明；另一模型根目录有同名、大小符合的副本。视频推理与这些副本的来源校验仍为 NOT RUN。
- 作者参考合包 58 张，三分包各 6、18、34 张。逐成员解码，按图片原始字节 SHA-256 多重集合比对，两种打包方式完全一致。仅作本地参考，图像及私有摘要不进入玩家包。逐图研究来源见[原登记](../../design/JX-VISION-02/claude-proposal/02-参考58图登记.md)。
- 本轮环境已具备最小验证所需的工具，复用了前序下载和独立依赖。R2 首个需要补齐的模型是选定并核准许可的基础模型；以已有 Blender 深度通道作条件时，可先开展 X1(b)，无需为生成深度图先引入额外估计模型。

## 工具入口与可检验的后续选择

本机两个通用技能根目录分别有 80 和 95 个 `SKILL.md`，插件缓存内有 471 份，计数包含子目录、不同版本与重复技能。当前会话目录列有 Blender MCP、GitHub、Cloudflare 文档和连接器、Supabase、Figma、MATLAB、浏览器及本地终端。执行工作树留有 Claude 项目技能 `jiuxiao-vision-research`，指向当前台账及里程碑独立评审。按本次会话实际暴露的工具选用；上述缓存数量不代表有效授权数。[OpenAI 技能与插件](https://developers.openai.com/plugins/concepts/skills)

| 阶段问题 | 从原始资料得到的可操作选项 |
|---|---|
| R2，怎样维持昼夜云层的一致光向 | Guerrilla 的云层研究将云形、运动和光照分开组织。在芦花渡选固定镜头，以九霄历法的太阳方向驱动主光，对同一云型比较晨昏两帧；单独测浏览器时间和低档静帧。[Guerrilla 技术说明](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn) |
| R2，如何评估局部 AI 增强 | 同一相机、几何和深度条件下保留渲染底片，用遮罩限定增强区，固定种子，分别比对结构边界、遮罩外像素和故事时间。Diffusers 提供 depth 条件与 inpaint 接口，强度及条件权重应和输出一起登记。[Diffusers ControlNet](https://huggingface.co/docs/diffusers/using-diffusers/controlnet) |
| R2，桌面实时材质如何降档 | three.js WebGPURenderer 支持 WebGL2 后备；在两个后端逐一测着色器、首帧、内存及颜色。若采用 glTF 资产，glTF Transform 可用于离线处理，保留未压缩主文件并对材质误差做图像比较。[three.js 渲染文档](https://threejs.org/manual/pages/webgpurenderer) · [glTF Transform](https://gltf-transform.dev/) · [工具 MIT 许可](https://github.com/donmccurdy/glTF-Transform/blob/main/LICENSE.md) |
| R2–R5，音景、数值和浏览器验证 | 音频先离线检验包络、声道、峰值，再做耳机与手机试听；天气或灵力的连续时间模型用独立 ODE 解、步长减半、容差和守恒量做对照；跨设备试玩保留用户可见断言与可回放 trace。[W3C Web Audio](https://www.w3.org/TR/webaudio/) · [SciPy 初值积分](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html) · [Playwright 测试实践](https://playwright.dev/docs/best-practices) |
