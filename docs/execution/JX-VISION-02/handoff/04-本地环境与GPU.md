# 04 · 本地环境与 GPU（Windows）

原则：**先检测，再决定**。不要假定 GPU 的厂商、型号或显存；不要一次装齐所有工具；只装当前任务真正需要的。每装一样，跑最小验证命令并记录结果。

## 1. 第一步：检测（PowerShell，全部只读）

```powershell
# 系统、CPU、内存、磁盘
Get-ComputerInfo -Property OsName,OsVersion,CsProcessors,CsTotalPhysicalMemory
Get-PSDrive -PSProvider FileSystem | Select Name,Used,Free
# GPU 与驱动
Get-CimInstance Win32_VideoController | Select Name,DriverVersion,AdapterRAM
nvidia-smi        # 只对 NVIDIA 有效；AdapterRAM 对大显存显示不准，以 nvidia-smi 为准
# 工具链
git --version; node -v; pnpm -v; python --version; py -0p
wsl --status; docker version
blender --version
```

把结果写进 `docs/execution/JX-VISION-02/local-environment.md`。只写硬件与版本，不写用户名、路径、序列号。

## 2. 按检测结果选择计算后端

| 检测结果 | 渲染（Blender Cycles） | AI 推理（PyTorch） |
|---|---|---|
| NVIDIA RTX（≥ 8 GB） | OptiX，其次 CUDA | CUDA 版 PyTorch |
| NVIDIA，较旧或显存小 | CUDA | CUDA，配合半精度或分块；SDXL 需要 ≥ 8–12 GB |
| AMD Radeon | HIP（Blender 支持的型号） | Windows 上用 DirectML（`torch-directml`），或在 WSL2 里用 ROCm（仅限官方支持的显卡）；ComfyUI 有对应说明 |
| Intel Arc | oneAPI（Blender 支持） | PyTorch XPU 版 |
| 没有可用 GPU | CPU（每帧约 3 分钟，已实测） | 只做小规模实验；需要 GPU 时告诉作者 |

最小验证：

```powershell
python -c "import torch;print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
blender -b --python-expr "import bpy;p=bpy.context.preferences.addons['cycles'].preferences;p.get_devices();print([(d.name,d.type,d.use) for d in p.devices])"
```

## 3. 工具清单（按需安装）

| 工具 | 何时需要 | 版本建议 | 官方来源 | 费用 |
|---|---|---|---|---|
| Git for Windows | 立即 | 最新 | git-scm.com | 免费 |
| Node.js | 立即 | **24.x**（`package.json` 要求 ≥ 24；CI 用 24） | nodejs.org | 免费 |
| pnpm | 立即 | **11.19.0**（`packageManager` 固定）；`corepack enable` 之后由它提供 | pnpm.io | 免费 |
| PostgreSQL | 跑集成测试 | 17（与 CI 一致）；或 Docker `postgres:17-alpine` | postgresql.org | 免费 |
| Docker Desktop 或 WSL2 | 想完整复现 CI（Mailpit、镜像冒烟） | 最新 | docker.com、Microsoft | Docker Desktop 对大公司收费，个人免费 |
| Playwright / Chromium | e2e | 随仓库（`playwright@1.63.0`）：`pnpm exec playwright install chromium` | playwright.dev | 免费 |
| Blender | 资产与渲染 | 5.x。原型脚本用 bpy 5.2.5 写成，用桌面版 Blender 运行时需小改（`blender -b -P scene.py -- 参数`） | blender.org | 免费（GPL，不约束渲染输出） |
| Python | 资产管线 | 3.11–3.13，用 venv | python.org | 免费 |
| PyTorch | AI 管线 | 按第 2 节选择后端；从 pytorch.org 的安装选择器生成命令 | pytorch.org | 免费 |
| ComfyUI 或 diffusers | 生成管线 | 二选一或都用：ComfyUI 适合节点式 ControlNet 与 inpaint；diffusers 适合脚本化与批处理（原型 `final/lab/paint.py` 用 diffusers） | github.com/comfyanonymous/ComfyUI、huggingface.co/docs/diffusers | 免费 |
| exiftool、gitleaks、lychee、axe-core | 新 CI 检查 | 最新 | 各自官网 | 免费 |

Windows 注意事项：

- 原型的 shell 脚本（`*.sh`）在 Git Bash 或 WSL 里运行。
- 测试脚本假定 POSIX 环境的地方，优先在 WSL2 里跑 CI 等价流程。
- 原生 Windows 上 Claude Code 没有沙箱（见 06）。

## 4. 模型与素材许可（逐个核对，写进资产台账）

| 资源 | 许可 | 结论 |
|---|---|---|
| Stable Diffusion 1.5 | CreativeML OpenRAIL-M | 可商用，有用途限制 |
| SDXL 1.0 | OpenRAIL++-M | 可商用，有用途限制 |
| FLUX.1 **schnell** | Apache-2.0 | 可商用 |
| FLUX.1 **dev** | 非商用许可 | **正式资产不得使用**，除非另购许可（付费，需要预算） |
| ControlNet 各权重 | 各不相同 | 逐个核对 |
| Depth Anything V2 **Small** | Apache-2.0 | 可用；Base 与 Large 是非商用，不得使用 |
| Poly Haven 材质与 HDRI | CC0 | 可用，记录来源 |
| ambientCG | CC0 | 可用 |
| Sketchfab 等模型站 | 逐个看（CC-BY 要署名，NC 不可用） | 逐个登记 |
| 作者提供的 58 张参考图 | 只供参考 | **不进仓库、不做训练、不当素材** |

资产台账记录：来源 URL、许可、作者、下载日期、哈希；AI 资产还要记录模型、版本、提示词、种子、参数、ControlNet 输入。格式见 final/09 §5。

## 5. 目录与缓存

```
<仓库外>\jx-assets\
  cache\models\        # HF_HOME、ComfyUI models，不进 git
  cache\cc0\           # 下载的 CC0 原始材质
  work\renders\        # 中间渲染、G-buffer 原始 EXR
  work\ai\             # AI 中间输出
<仓库内>
  docs\design\JX-VISION-02\final\lab\   # 原型脚本（已在仓库）
  apps\web\public\scenes\...            # 只放通过门禁、登记过许可的成品
```

- 设置 `HF_HOME` 指向仓库外。
- 大文件（> 5 MB 的 EXR、模型权重、原始材质）不进 git。正式画板体积合适时放 Pages；规模化存储（R2 等）需要预算。

## 6. 常见失败与替代

| 失败 | 替代 |
|---|---|
| CUDA 与 PyTorch 版本不匹配 | 用 pytorch.org 选择器给出的匹配组合；不要混装 |
| 显存不足 | 半精度、`enable_model_cpu_offload`、降低分辨率、分块（tiled）推理、换小模型 |
| Blender 看不到 GPU | 更新驱动；在偏好设置里启用设备；用 `-- --cycles-device OPTIX` |
| `pnpm install` 因 Node 版本警告 | 换 Node 24；本会话在 Node 22 下也能通过测试，但以 24 为准 |
| 集成测试连不上数据库 | 数据库名必须以 `jiuxiao_test` 开头（`scripts/assert-test-database.mjs`）；确认服务在运行 |
| `card-real-play` 要自建集群 | 它会自己调用 initdb，需要 `CARD_TEST_PG_BIN` 指向 PostgreSQL 的 bin 目录 |

## 7. 免费与可能收费

- **免费**：上面全部开源工具，以及 CC0 素材。
- **可能收费，必须先给作者预算**：租用云 GPU、付费生成 API、FLUX dev 商用许可、Cloudflare R2 等付费存储、云真机、Figma AI 生图（消耗点数）、短信。
