# E1.1 · 模型台账（来源 / 字节 / 校验 / 许可 / 选型）

原则：

1. 只用 **safetensors** 等可核验的安全序列化格式（Real-ESRGAN 上游只发 `.pth`，用字节数 + 可加载性 + 实跑作判据）。
2. 每个文件落盘后核对 **字节数 + SHA-256**，并与上游 LFS `oid` 逐项比对；不一致即不可用。
3. 许可以 **Hugging Face API / 模型卡实测** 为准，不沿用旧台账的转抄值；许可不清不进管线。
4. 同一权重只保留一份经校验副本；旧的不完整副本不删除，加 `README-DO-NOT-USE.txt` 标注。

本地路径由 `<LAB_ROOT>\Management\Manifests\models-manifest.json` 记录，不进仓库。

---

## 1. 已就绪（全部经哈希或实跑验证）

| 模型 | 文件 | 字节 | SHA-256 | 上游仓库 | 许可 | 状态 |
|---|---|---|---|---|---|---|
| SDXL Base 1.0 | `sd_xl_base_1.0.safetensors` | 6,938,078,334 | `31e35c80…f7e5b` | `stabilityai/stable-diffusion-xl-base-1.0` | **openrail++** | verified（哈希 = 上游 LFS oid） |
| SDXL Depth ControlNet | `diffusion_pytorch_model.fp16.safetensors` | 2,502,139,134 | 前序阶段已核 | `diffusers/controlnet-depth-sdxl-1.0` | **openrail++** | verified（CUDA 前向 + 双 CN 实跑） |
| SDXL Canny ControlNet | `sdxl_canny_controlnet_fp16.safetensors` | 2,502,139,136 | `b2e7d392…8d6c25` | `diffusers/controlnet-canny-sdxl-1.0` | **openrail++** | verified（844 张量，哈希一致） |
| Depth Anything V2 Small | `model.safetensors` | 99,173,660 | `3152477c…a16b70` | `depth-anything/Depth-Anything-V2-Small-hf` | Apache-2.0 | verified |
| Wan 2.1 T2V 1.3B | `wan2.1_t2v_1.3B_fp16.safetensors` | 2,838,303,560 | `be531024…924dc5` | `Comfy-Org/Wan-2.1` | Apache-2.0 | verified（**已实跑** 704×480/49 帧/20 步，67.7 s） |
| Wan 2.1 UMT5-XXL（fp8） | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6,735,906,897 | `c3355d30…204f68` | 同上 | Apache-2.0 | verified |
| Wan 2.1 VAE | `wan_2.1_vae.safetensors` | **253,815,318** | `2fc39d31…48976b` | 同上 | Apache-2.0 | verified（上游 `X-Linked-Size`=253,815,318、`X-Linked-ETag` 与本地 SHA 完全一致） |
| Real-ESRGAN x4plus | `RealESRGAN_x4plus.pth` | 67,040,989 | 上游未发 sha256 | `xinntao/Real-ESRGAN` v0.1.0 | BSD-3-Clause | verified（字节数 + `params_ema` 加载 + 4× 实跑） |
| SDXL 独立 VAE | `sdxl_vae.safetensors` | 334,641,456 | 未记录 | `stabilityai/sdxl-vae` | **MIT** | 存在但未单独接线（base 自带 VAE 可用） |

### 本轮更正

- Depth / Canny / Base 三者此前写作 Apache-2.0，**HF API 实测均为 `openrail++`**；Refiner（未下载）同为 `openrail++`。
- Wan VAE 旧台账 253,806,574 实为 **alpha VAE**（`wan_alpha_2.1_vae_alpha_channel`）的大小；本文件为 **253,815,318**。
- SDXL Base 旧台账 6,938,040,144 为排版错位，实为 **6,938,078,334**。
- Wan 上游仓库已改名 `Comfy-Org/Wan-2.1`（原 `Wan_2.1_ComfyUI_repackaged` 重定向）。

## 2. 候选：FLUX 全系列与同类图像模型（2026-11-28 现状）

> 只列 **官方已正式发布、可取得权重** 的型号；API-only 型号标注为不可本地部署。许可证按模型卡实测，商用前仍需逐条复核。

| 型号 | 参数/权重 | 许可 | 24 GB 可行性 | 定位与判断 |
|---|---|---|---|---|
| **FLUX.2 [klein] 4B** | 4B，Apache-2.0，非 gated | **Apache-2.0** | ✅ 约 13 GB 显存，4 步亚秒级 | **首选候选**：唯一可商用的 FLUX.2 开放权重；速度快、许可干净，适合批量概念图 |
| FLUX.2 [klein] 9B | 9B | 非商用 | ✅ | 质量更高但许可不允许正式资产，**排除** |
| FLUX.2 [dev] | 32B | 非商用（FLUX.2 Non-Commercial） | ⚠️ FP8 约 32 GB，需 offload | 艺术质量强，但不能用于九霄商业发布，**仅研究** |
| FLUX.2 [max]/[pro]/[flex] | 专有 API | BFL 商业条款 | —（云端） | 不本地部署；按量计费，不新增费用前提下不接入 |
| FLUX.1 [schnell] | 12B，Apache-2.0 | Apache-2.0（`gated=auto`） | ✅ | 已被 FLUX.2 取代；12B 比 klein 4B 慢，**不再新建工作流** |
| FLUX.1 [dev] | 12B | 非商用 | ✅ | 同上，排除 |
| **Qwen-Image 2512** | 20B，FP8 ≈20.4 GB | **Apache-2.0**，非 gated | ✅ 紧贴 24 GB（需 `--lowvram` 余量） | **中文文字渲染与复杂构图最强**；适合九霄匾额、题跋、UI 文案图 |
| **Qwen-Image-Edit 2511** | 20B | **Apache-2.0** | ✅ 同上 | 指令式图像编辑（换字、改材质、保结构），与 klein 互补 |
| Qwen-Image 2.1 | 20B | 非商用 Research License | ✅ | 质量略高但许可受限，**排除正式资产** |
| SDXL + 双 ControlNet | 3.5B | openrail++ | ✅ 已跑 | 现有可控性基线，继续保留 |
| Wan 2.1 T2V 1.3B | 1.3B | Apache-2.0 | ✅ 已跑 | 现有视频基线 |

**选型结论（面向九霄 + RTX 5090 Laptop 24 GB）**

1. **FLUX.2 [klein] 4B**：许可与速度最优，作为“高频概念图/构图探索”主力；4 步出图适合一次生成 20–40 张候选。
2. **Qwen-Image 2512 / Edit 2511**：中文文字与指令编辑不可替代；FP8 权重约 20.4 GB，在 24 GB 上可跑但需关闭其他模型、限制分辨率 ≤1024。
3. **SDXL 双 ControlNet**：保留为“结构必须精确”的线稿/深度约束链路；klein 的参考图控制不替代 depth/canny 的像素级约束。
4. **不选**：FLUX.2 dev / klein 9B / Qwen 2.1（非商用）；FLUX.1 schnell（过时）；FLUX.3 系列许可按年收入分层，正式商用前需法务确认，暂不投入。

详细比较、下载体积与实测计划见 `flux-selection.md`。

## 3. 完整性告警（已存在但不可用的副本）

旧共享模型根下有两份 **截断** 权重，加载会失败或产生错误结果：

| 文件 | 实际字节 | 头部声明字节 | 缺失 |
|---|---|---|---|
| `wan2.1_t2v_1.3B_fp16.safetensors` | 1,228,184,115 | 2,838,303,560 | 1,610,119,445 |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 1,222,596,802 | 6,735,906,897 | 5,513,310,095 |

处理方式：**未删除、未移动**，原目录有 `README-DO-NOT-USE.txt` 指向完整副本；是否清理由作者决定（作者已原则同意，待完整副本二次核验后执行）。

---

## 4. 素材（非模型）

| 类别 | 数量 | 来源 | 许可 | 说明 |
|---|---|---|---|---|
| 4K pure sky HDRI | 15 | polyhaven.com | CC0 1.0 | dawn→night，共 250 MB |
| PBR 材质套（4K PNG 全通道） | 30 套 / 150 文件 | polyhaven.com | CC0 1.0 | 岩石、泥土、砖石、木构、茅草屋顶、水岸卵石等，963 MB |

素材本体保留在既有 CC0 缓存，未复制进资源中心，只登记引用，避免双份磁盘。

---

## 5. 许可注意事项

- 基础模型许可**传导**到生成资产。openrail++ 允许商用但附使用限制（不得违法、伤害、误导性深度伪造等）；对外发布九霄资产前保留条款说明。
- CC0 素材无署名义务，仍建议致谢保留来源链接。
- gated 模型（FLUX.1 schnell 等）的许可由作者本人接受，E1 不代为接受、不代为登录。
- 商用判断以 **模型卡 LICENSE 原文** 为准；本表只作工程筛除，不构成法律意见。
