# E1 · GPU 与图形管线实测

采集时间：2026-11-27 ～ 2026-11-28
口径：**跑出结果才写 PASS**；装了没跑写 installed；跑不了写 NOT RUN / BLOCKED 并给出原因。
原始日志与结构化 receipt 留在本地 `<LAB_ROOT>\Management\{Logs,Reports}\`。

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
| CUDA 运行时 | 由 PyTorch 提供：`torch 2.12.1+cu130`，`torch.version.cuda = 13.0` |

`nvcc` 不在 PATH 属预期状态：未安装 CUDA Toolkit 整包。

---

## 2. 计算验证

| 能力 | 状态 | 结果 |
|---|---|---|
| CUDA 可用 | PASS | device = RTX 5090 Laptop，`is_available()=True` |
| GPU 矩阵乘法一致性 | PASS | 1024×1024 matmul，CPU/GPU 最大绝对误差 `4.58e-05` |
| ODE 数值求解 | PASS | 误差 `7.77e-12` |
| ControlNet 前向 | PASS | 输出 10 个张量，mid 形状 `[1,1280,4,4]` |
| WSL2 GPU 可见性 | PASS | `nvidia-smi` 在 WSL 内输出同一设备与驱动 |
| WSL2 GPU 计算 | NOT RUN | 发行版 python3 为 3.14，无 cu130 wheel；未额外下载 3 GB torch |
| Blender Cycles OptiX | PASS | 640×360 渲染 1.546 s，PNG 36,583 B |
| WebGL2 | PASS | ANGLE / NVIDIA D3D11，像素回读 `(64,128,191,255)` |
| WebGPU | PASS | compute 结果 42，`fallback=false` |
| WebAudio | PASS | 正弦 RMS `0.7071` |

---

## 3. SDXL 受控生图（1024×1024，Base 1.0 fp16）

| 工作流 | 耗时 | 峰值显存 | 备注 |
|---|---|---|---|
| Text-to-Image（28 步，dpmpp_2m / karras） | 41.43 s | 14,648 MiB | 首图含 6.9 GB 权重加载 |
| Depth ControlNet（30 步，strength 0.85，end 0.85） | 11.68 s | 19,168 MiB | 条件图来自 Depth Anything V2 Small |
| Canny ControlNet（28 步，阈值 0.35/0.75） | 10.65 s | 19,017 MiB | 边缘由 ComfyUI `Canny` 节点生成 |
| Image-to-Image（26 步，denoise 0.62） | 7.08 s | 16,258 MiB | 结构保留良好 |
| Inpainting（30 步，denoise 0.85，grow 12） | 10.63 s | 14,397 MiB | 椭圆遮罩占画面 12.6% |
| Real-ESRGAN 4×（1024→4096） | 6.28 s | 14,015 MiB | 输出 16.5 MB PNG |

**局部重绘正确性硬证据**：遮罩内平均像素差 `75.65`，遮罩外 `3.24`，比值 `23.3×` —— 证明确实只改了遮罩区域，而不是整图重绘。

---

## 4. 三维资产与 Web 呈现

| 环节 | 状态 | 结果 |
|---|---|---|
| Blender 场景 → GLB | PASS | 18,172 三角面，GLB 981,824 B，渲染 PNG 289,446 B（1.11 s） |
| glTF 结构校验 | PASS | `gltf-transform validate`：No errors / No warnings；扩展 `KHR_materials_transmission` |
| KTX2 转码 | PASS | 512² albedo：PNG 209 KB → KTX2 30.5 KB（≈1/7），`ktx info` 校验通过 |
| 浏览器 GLB + KTX2 | PASS | three.js r186：4 个 mesh、≈18,076 三角面、`ktx2_mipmaps=10`、`console_errors=[]` |

---

## 5. 显存规划建议

- SDXL + 单 ControlNet：预留 **20 GiB** 可用显存即可稳定；实测峰值 19.2 GiB。
- 双 ControlNet 并联：预计 22 GiB 内（**推断**，未实测），R1 若采用需补一次实测。
- Wan 1.3B 视频：权重 2.8 GB + UMT5 6.7 GB，理论可运行；**未实测**（E1 只做完整性核验）。
- LoRA 微调：未测；24 GB 下属紧平衡，建议 512–768 分辨率起步。

---

## 6. 已知限制（实测遇到，写进结论避免重复踩坑）

1. **Lighthouse 不能审计 WebGL/WebGPU 页面**：headless 返回 `NO_FCP`，加 `--enable-unsafe-swiftshader` 亦然。三维页回归改用 Playwright 截图 + pixelmatch。
2. **`ktx create` 参数顺序**：必须 `<input> <output>`；codec 只接受 `basis-lz` / `uastc`，`etc1s` 会被判非法。
3. **RenderDoc zip 解压**：`Expand-Archive` 报 `OperationStopped`，`tar` 报 libarchive 未知错误；用 Python `zipfile` 解出全部 85 个条目。
4. **大文件多连接下载可能产生坏块**：16 连接下载 SDXL 后整体 SHA-256 与上游不符（Range 抽样定位到具体损坏偏移）；最终校验一律改用单连接顺序下载。
