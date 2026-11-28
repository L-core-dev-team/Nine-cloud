# 中断前的资产准备脚本

接任时从仓库外恢复。此目录记录前序实验所用方法。现有资产先按[缓存明细](../../../docs/execution/JX-VISION-02/art-cache.tsv)核验。基础模型与全管线仍未就绪。三个可实跑的独立能力检查位于[probes](../probes/)。

| 文件 | 输入与行为 | 接任验证 |
|---|---|---|
| fetch_cc0.py | 指定独立目录 `JX_CC0_DIR`，从 Poly Haven 读取材质与 HDRI 并写来源台账。再次联网获取前核对 API 使用条件。 | 现场已取得的 165 个文件全部核对；未重下。 |
| fetch_models.py | 指定 `HF_HOME`、`JX_MODEL_DIR` 后传入单个发布方仓库名。原两份下载清单的交集已合并。项目可按阶段单独取模型。 | 核对现有 depth；未重跑远程下载。下载成功后仍要比对发布方独立摘要与许可。 |
| smoke_sdxl_controlnet.py | 使用 `JX_MODEL_DIR`、尚不存在的 `JX_SMOKE_OUTPUT` 与本地 diffusers 缓存，合成深度条件并以两个种子离线输出；完整管线需 SDXL base、ControlNet 及对应配置。 | Python 语法已查。完整推理 NOT RUN。原实验使用全幅深度约束；X1(b) 的局部遮罩、几何对照及人工评审另行实施。 |

模型和缓存留在仓库外。
