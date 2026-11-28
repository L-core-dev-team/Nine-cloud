# 工具链清单与验证状态（E1 + E1.1）

状态口径：

- **verified**：已实跑验证（不只看版本号，至少完成一次真实执行并拿到结果）
- **installed**：已安装，尚未做能力验证
- **missing**：本机缺失
- **deferred**：评估后有意不装（体积 / 许可 / 无明确用途）

本文件不含本机绝对安装路径；具体路径由 `<LAB_ROOT>\Management\Manifests\tools-manifest.json` 在本地记录。

**版本复核（2026-11-28）**：全部已装软件与官方最新版逐项比对，结果与升级决策见 `version-audit.md`。当前明确落后且值得处理的是 Node 24→26、pnpm 11→12、ComfyUI 0.30→0.46、FFmpeg 8.1→9.1；四者均需隔离回归，不在本轮原地升级。

---

## 1. 语言与构建

| 工具 | 版本 | 许可 | 状态 | 验证方式 |
|---|---|---|---|---|
| Node.js | 24.16.0 | MIT | verified | 最小 ESM 脚本运行（数组求和输出） |
| pnpm | 11.19.0 | MIT | verified | 与仓库 `packageManager` 锁定版本一致；`corepack prepare` 激活 |
| Corepack | 0.35.0 | MIT | verified | 激活 pnpm 成功 |
| Python（GPU 环境） | 3.13.12 | PSF-2.0 | verified | torch CUDA 张量运算 + 脚本执行 |
| Python（通用环境） | 3.13.13 | PSF-2.0 | installed | 仅 CPU 版 torch，不作 GPU 推理 |
| Rust | 1.98.1 | MIT/Apache-2.0 | verified | `cargo new` + `cargo build` + 运行 `Hello, world!` |
| GCC（MinGW-w64） | 16.2.0 | GPL | verified | 编译并运行 C 程序（输出 42） |
| CMake | 4.4.3 | BSD-3-Clause | verified | 版本 + 参与 Rust/CMake 混合构建配置 |

## 2. 版本控制与协作

| 工具 | 版本 | 许可 | 状态 | 说明 |
|---|---|---|---|---|
| Git | 2.56.0 | GPL-2.0 | verified | 工作树、分支、worktree 操作正常 |
| GitHub CLI | 2.96.0 | MIT | verified | 已登录账号，具备 repo 范围，可开 PR |

## 3. 数据与本地服务

| 工具 | 版本 | 许可 | 状态 | 验证方式 |
|---|---|---|---|---|
| Docker engine | 29.9.3 | Apache-2.0 | verified | 容器拉起、健康检查、端口映射 |
| PostgreSQL（容器） | 17-alpine | PostgreSQL License | verified | 建库 `jiuxiao_test`、建表、插入、`select version()` 返回 17.x |
| PostgreSQL（宿主客户端） | — | PostgreSQL License | **missing** | 仅容器内 psql 可用；宿主原生 psql 需管理员安装（见 blockers） |
| Supabase CLI | 3.4.0 | Apache-2.0 | verified | `--version` 与本地命令可用；**未登录生产** |
| Wrangler | 4.169.0 | MIT/Apache-2.0 | verified | `wrangler dev --local` 启动 Worker，`GET /health` 返回 200；未登录、未部署 |
| aria2 | 1.37.0 | GPL-2.0 | verified | 多连接下载；**大文件最终校验改用单连接** |

## 4. 图形 / 三维 / 媒体

| 工具 | 版本 | 许可 | 状态 | 验证方式 |
|---|---|---|---|---|
| Blender 5.3.0 | 5.3.0（2026-11-10） | GPL-2.0+ | verified | 便携 ZIP，官方 SHA-256 通过；OptiX 1.52 s / GN 625 顶点 / GLB 64,524 B / 浏览器加载 |
| Blender 5.2.5 LTS | 5.2.5（2026-11-24） | GPL-2.0+ | verified | 便携 ZIP，官方 SHA-256 通过；同场景 1.60 s，作为兼容备份 |
| Blender 5.2.2 LTS（系统） | 5.2.2 | GPL-2.0+ | verified | 保留为第三回退点，不覆盖 |
| ComfyUI | 0.30.1 | GPL-3.0 | verified | `/system_stats`、`/object_info`、`/prompt`、`/history` 全流程可用 |
| FFmpeg | 8.1.1 | LGPL/GPL | verified | 音视频转码/探测命令可用 |
| ImageMagick | 7.1.2-36 Q16-HDRI | ImageMagick License | verified | 图像转换、montage、compare 度量 |
| KTX-Software | 4.4.2 | Apache-2.0 | verified | `ktx create` 生成 KTX2 + `ktx info` 校验通过 |
| glTF-Transform CLI | 4.5.1 | MIT | verified | `inspect` / `validate`（零 error / 零 warning） |
| RenderDoc | 1.47 | MIT | installed | `renderdoccmd` CLI 可用；**API 注入失败，无 `.rdc`**，详见 blockers C1 |
| Godot | 4.7.2 | MIT | verified | `--version` 可用（当前无产品用途） |
| **Krita** | **5.3.4.1** | GPL-3.0 | **verified（E1.1）** | 便携解压，官方 SHA-256 匹配；`krita.exe --version` 通过 |
| **Audacity** | **4.0.2** | GPL-2.0 | **verified（E1.1）** | 7z 便携，官方 checksum 匹配；`Audacity4 4.0.2` 启动 |
| **Numba** | **0.68.1** | BSD-2-Clause | **verified（E1.1）** | JIT 求和结果正确（analysis venv） |
| **Taichi** | **1.7.4** | Apache-2.0 | **verified（E1.1）** | `rel_error=3e-6`，`taichi_ok=true` |

## 5. 测试 / 审计

| 工具 | 版本 | 许可 | 状态 | 验证方式 |
|---|---|---|---|---|
| Playwright | 1.63.0 | Apache-2.0 | verified | Chromium 1248 启动、页面加载、控制台零错误 |
| axe-core | 4.14.1 | MPL-2.0 | verified | 本地页面 `violations=0 / passes=4` |
| Lighthouse | 13.6.0 | Apache-2.0 | verified | 静态内容页 100 / 100 / 96 |
| pixelmatch | 6.0.0 | ISC | verified | 同图判 IDENTICAL、异图判 CHANGED（66.5% 像素差） |
| gitleaks | 8.30.1 | MIT | verified | 对文档目录扫描：no leaks found |

## 6. 环境与容器

| 工具 | 版本 | 状态 | 说明 |
|---|---|---|---|
| WSL2 + Ubuntu | Ubuntu 24.04 LTS | verified | `/root/jx-gpu` venv（Python 3.14）+ torch 2.15.0+cu132；8192³ FP16 实测 **67.8 TFLOPS** |
| CUDA Toolkit | — | deferred | 当前无本地 CUDA 扩展编译需求；PyTorch 自带 cu130 运行时已够用 |

---

## 7. 刻意不装的（及原因）

| 工具 | 原因 |
|---|---|
| Unreal Engine / Unity / Houdini / DaVinci Resolve | P2 储备；体积与许可成本高，当前 Web/three.js 路线无明确用途 |
| CUDA Toolkit 整包 | 3–5 GB，且当前无编译原生扩展的需求 |
| 本地大语言模型 | 与 E1 目标无关，且会占用 24 GB 显存中的大部分 |
| Wan 14B 视频模型 | 1.3B 已完整可用，14B 约 28 GB，留给 R1 明确需求后再评估 |
| Inkscape / TripoSR | 可便携安装，但本轮带宽与许可核验未完成；不虚报为已装（DEFERRED） |
