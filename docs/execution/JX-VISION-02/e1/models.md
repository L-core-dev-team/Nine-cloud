# E1 · 模型台账（来源 / 字节 / 校验 / 许可）

原则：

1. 只用 **safetensors** 等可核验的安全序列化格式（Real-ESRGAN 的上游只发 `.pth`，用字节数 + 可加载性作判据，并在台账注明）。
2. 每个文件落盘后必须核对 **字节数 + SHA-256**，并与上游 LFS oid 逐项比对；不一致即视为不可用。
3. 许可清晰才进入管线；gated 模型需账号接受许可，未授权前不下载、不使用。
4. 同一权重只保留一份经校验副本；旧的不完整副本**不删除**，加 `README-DO-NOT-USE.txt` 标注。

本地路径由 `<LAB_ROOT>\Management\Manifests\models-manifest.json` 记录，不进仓库。

---

## 1. 已就绪（可直接用于工作流）

| 模型 | 文件 | 字节 | SHA-256 | 上游仓库 | 许可 | 状态 |
|---|---|---|---|---|---|---|
| SDXL Base 1.0 | `sd_xl_base_1.0.safetensors` | 6,938,078,334 | `31e35c80…f7e5b` | `stabilityai/stable-diffusion-xl-base-1.0` | CreativeML Open RAIL++-M | verified（哈希与上游 LFS oid 完全一致） |
| SDXL Depth ControlNet | `diffusion_pytorch_model.fp16.safetensors` | 2,502,139,136 | 前序阶段已核 | `diffusers/controlnet-depth-sdxl-1.0` | Apache-2.0 | verified（CUDA 前向通过） |
| SDXL Canny ControlNet | `sdxl_canny_controlnet_fp16.safetensors` | 2,502,139,136 | `b2e7d392…8d6c25` | `diffusers/controlnet-canny-sdxl-1.0` | Apache-2.0 | verified（844 张量，哈希一致） |
| Depth Anything V2 Small | `model.safetensors` | 99,173,660 | `3152477c…a16b70` | `depth-anything/Depth-Anything-V2-Small-hf` | Apache-2.0 | verified |
| Wan 2.1 T2V 1.3B | `wan2.1_t2v_1.3B_fp16.safetensors` | 2,838,303,560 | `be531024…924dc5` | `Comfy-Org/Wan_2.1_ComfyUI_repackaged` | Apache-2.0 | verified（结构与哈希双通过；推理未跑） |
| Wan 2.1 UMT5-XXL（fp8） | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6,735,906,897 | `c3355d30…204f68` | 同上 | Apache-2.0 | verified |
| Wan 2.1 VAE | `wan_2.1_vae.safetensors` | 253,806,574 | `2fc39d31…48976b` | 同上 | Apache-2.0 | 结构完整；上游 oid 待补 |
| Real-ESRGAN x4plus | `RealESRGAN_x4plus.pth` | 67,040,989 | `4fa0d389…d682f1` | `xinntao/Real-ESRGAN`（v0.1.0 release） | BSD-3-Clause | verified（字节数一致 + `params_ema` 可加载） |

## 2. 缺失 / 待补

| 模型 | 体积 | 许可 | 原因 |
|---|---|---|---|
| SDXL VAE（独立） | 334 MB | MIT | base 自带 VAE 已可用；仅在出现灰暗/溢出色偏时再补 |
| FLUX.1-schnell | ≈24 GB | Apache-2.0（模型卡）但 `gated=auto` | 需账号接受许可；未授权前不进入管线 |

## 3. 完整性告警（已存在但不可用的副本）

旧共享模型根下有两份 **截断** 权重，加载会失败或产生错误结果：

| 文件 | 实际字节 | 头部声明字节 | 缺失 |
|---|---|---|---|
| `wan2.1_t2v_1.3B_fp16.safetensors` | 1,228,184,115 | 2,838,303,560 | 1,610,119,445 |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 1,222,596,802 | 6,735,906,897 | 5,513,310,095 |

处理方式：**未删除、未移动**，在原目录放置 `README-DO-NOT-USE.txt` 说明并指向完整副本。是否清理由作者决定。

---

## 4. 素材（非模型）

| 类别 | 数量 | 来源 | 许可 | 说明 |
|---|---|---|---|---|
| 4K pure sky HDRI | 15 | polyhaven.com | CC0 1.0 | 时间/天气覆盖 dawn→night，共 250 MB |
| PBR 材质套（4K PNG 全通道） | 30 套 / 150 文件 | polyhaven.com | CC0 1.0 | 岩石、泥土、砖石、木构、茅草屋顶、水岸卵石等，共 963 MB |

素材本体保留在既有 CC0 缓存目录，**未复制**进资源中心，只在台账登记引用，避免同一批贴图占两份磁盘。

---

## 5. 许可注意事项

- 基础模型的许可会**传导**到生成资产。SDXL 为 CreativeML Open RAIL++-M：允许商用，但附使用限制条款（不得用于违法、伤害、误导性深度伪造等）。对外发布九霄美术资产前应保留该条款说明。
- CC0 素材无署名义务，但仍建议在致谢中保留来源链接，便于溯源。
- gated 模型（FLUX 系列）的许可由作者本人接受，E1 不代为接受。
