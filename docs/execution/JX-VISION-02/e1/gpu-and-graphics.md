# GPU 与图形管线实测（E1 + E1.1）

采集：2026-11-27 ～ 2026-11-28
口径：**跑出结果才写 PASS**；装了没跑写 installed；跑不了写 NOT RUN / BLOCKED 并给出原因。
原始日志与 receipt 在 `<LAB_ROOT>\Management\{Logs,Reports}\`。

---

## 1. 硬件

| 项 | 值 |
|---|---|
| CPU | Intel Core Ultra 9 290HX Plus（24C/24T） |
| 内存 | 63.7 GiB |
| GPU | NVIDIA GeForce RTX 5090 Laptop GPU |
| 驱动 | 617.42（未升级、未改动） |
| 显存 | 24,463 MiB（`nvidia-smi`） |
| 计算能力 | 12.0（Blackwell，`[12, 0]`） |
| CUDA 运行时（Windows） | PyTorch 提供：`torch 2.12.1+cu130`，`torch.version.cuda = 13.0` |
| CUDA 运行时（WSL2） | `torch 2.15.0+cu132`，Python 3.14 venv |

`nvcc` 不在 PATH 属预期：未安装 CUDA Toolkit 整包。

---

## 2. 计算验证

| 能力 | 状态 | 结果 |
|---|---|---|
| CUDA 可用（Windows） | PASS | RTX 5090 Laptop，`is_available()=True` |
| GPU 矩阵乘法一致性 | PASS | 1024×1024 matmul，CPU/GPU 最大绝对误差 `4.58e-05` |
| ODE 数值求解 | PASS | 误差 `7.77e-12` |
| ControlNet 前向 | PASS | 输出 10 张量，mid 形状 `[1,1280,4,4]` |
| WSL2 GPU 可见性 | PASS | `nvidia-smi` 输出同一设备与驱动 |
| **WSL2 CUDA 计算** | **PASS（E1.1）** | 8192³ FP16 ×10 matmul = 0.162 s → **67.8 TFLOPS**；capability [12,0] |
| Blender 5.3 Cycles OptiX | PASS | 960×640 / 48 spp，1.52 s，PNG 756,466 B |
| Blender 5.2.5 Cycles OptiX | PASS | 同场景 1.60 s，PNG 755,838 B |
| WebGL2 | PASS | ANGLE / NVIDIA D3D11，像素回读 `(64,128,191,255)` |
| WebGPU | PASS | compute 结果 42，`fallback=false` |
| WebAudio | PASS | 正弦 RMS `0.7071` |

---

## 3. SDXL 受控生图（1024×1024，Base 1.0 fp16）

| 工作流 | 耗时 | 峰值显存 | 备注 |
|---|---|---|---|
| Text-to-Image（28 步） | 41.43 s | 14,648 MiB | 首图含 6.9 GB 权重加载 |
| Depth ControlNet（30 步，0.85/0.85） | 11.68 s | 19,168 MiB | 条件图来自 Depth Anything V2 Small |
| Canny ControlNet（28 步，0.35/0.75） | 10.65 s | 19,017 MiB | Canny 节点生成边缘 |
| Image-to-Image（26 步，denoise 0.62） | 7.08 s | 16,258 MiB | 结构保留良好 |
| Inpainting（30 步，denoise 0.85，grow 12） | 10.63 s | 14,397 MiB | 椭圆遮罩占 12.6% |
| Real-ESRGAN 4×（1024→4096） | 6.28 s | 14,015 MiB | 16.5 MB PNG |
| **双 ControlNet（Depth→Canny）** | **0.57 s（缓存命中）** | 未记录增量 | 768²、24 步，0.55/0.7，输出结构可信 |

**局部重绘的严格度量（E1.1）**：遮罩外 `max_abs_diff=0`、SSIM outside `0.9995`；遮罩内 SSIM 0.25–0.45、边缘相关 0.04–0.21。合成正确，但内容质量 REVIEW（详见 `e11-report.md` §4）。

**Wan 2.1 T2V 1.3B（E1.1）**：704×480、49 帧、20 步、cfg 6 → **67.7 s**，3.063 s VP9 WebM（89 KB）。显存增量未做独立口径，整机在 24 GB 内未 OOM。

---

## 4. 三维资产与 Web 呈现

| 环节 | 状态 | 结果 |
|---|---|---|
| 技术验收场景（5.3 / 5.2.5） | PASS | GN 625 顶点；Principled + Noise Bump；GLB 64,524 B |
| Blender 5.3 OptiX | PASS | 960×640/48 spp，1.52 s |
| Blender 5.2.5 OptiX | PASS | 同场景 1.60 s |
| 批量渲染 | PASS | 3 帧 480×270/16 spp，2.0 s |
| glTF 结构校验 | PASS | 旧场景 18,172 三角面 / 981,824 B，`validate` 零 error 零 warning |
| KTX2 转码 | PASS | 512² albedo：PNG 209 KB → KTX2 30.5 KB（≈1/7） |
| 浏览器 GLB + KTX2 | PASS | three.js r186：4 mesh、≈18,076 三角面、`ktx2_mipmaps=10`、零 console error |
| 浏览器 GLB（5.3/5.2.5） | PASS | WebGL2 / 1,164 三角形 / ANGLE RTX 5090，截图各一张 |

---

## 5. 显存规划（以实测替换推断）

| 场景 | 实测/结论 |
|---|---|
| SDXL + 单 ControlNet | 峰值 19.2 GiB，预留 20 GiB 稳定 |
| SDXL 双 ControlNet | 已实跑成功；768² 下未 OOM。1024² 双 CN 未测，预算按 22 GiB 上限控制 |
| Wan 1.3B 视频 | 已实跑 704×480/49 帧成功；与 SDXL 不要同时驻留，先停 ComfyUI 或清模型 |
| Inpainting | 峰值 14.4 GiB；与 T2I 共用底座 |
| LoRA 微调 | **未测**；24 GB 下建议 512–768 起步 |
| FLUX.2 klein 4B | 公开资料约 13 GB 显存；**未实测**，下载后回填 |
| Qwen-Image 20B FP8 | 约 20.4 GB 权重，24 GB 紧平衡；**未实测** |

---

## 6. 已知限制

1. **Lighthouse 不能审计 WebGL/WebGPU**：headless 返回 `NO_FCP`，SwiftShader 亦然；三维页改用 Playwright 截图 + pixelmatch。
2. **`ktx create` 参数顺序**：必须 `<input> <output>`；codec 只接受 `basis-lz` / `uastc`。
3. **RenderDoc zip 解压**：`Expand-Archive`/`tar` 失败，用 Python `zipfile`。
4. **大文件多连接下载坏块**：16 连接下载 SDXL 后 SHA 不符；改单连接顺序下载 + 整文件校验。
5. **RenderDoc 注入失败**：见 `blockers.md` C1；当前无 `.rdc`，不伪造。
6. **Blender 技术场景不是艺术样例**：验收图用于证明管线，不用于评价美术质量。
