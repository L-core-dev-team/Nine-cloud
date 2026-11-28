# 软件版本复核与升级决策（2026-11-28）

数据源：`Management/Reports/version-audit.json`（本机实装版本 + 官方发布通道查询）。
原则：**不盲目升级，也不长期停留在过时版本**；每条给出“升级 / 保持 / 隔离验证”的明确结论。

---

## 1. 结论表

| 软件 | 本机 | 官方最新 | 差距 | 决策 |
|---|---|---|---|---|
| Node.js | v24.16.0 | v26.13.1 | 2 个大版本 | **隔离升级**：Node 26 已进入 LTS 通道；先建独立目录 + 新 pnpm，跑 `pnpm install --frozen-lockfile` 与前端构建，通过后再切换；不在本轮直接替换 |
| pnpm | 11.19.0 | 12.23.0 | 1 个大版本 | **随 Node 一起升级**；pnpm 12 改变锁文件解析，需验证 lockfile 不被动改写 |
| Python（ComfyUI venv） | 3.13.12 | 3.15.2 | 2 个版本 | **保持 3.13**：ComfyUI/torch CUDA 轮子兼容优先；WSL 侧已有 3.14 独立 venv，不为追新换解释器 |
| ComfyUI | 0.30.1 | v0.46.0 | 16 个小版本 | **隔离克隆验证**：工作流 JSON 与前端 API 均有变动；在 `<LAB_ROOT>\Workspaces\ComfyUI-next` 克隆后跑六条工作流 + 双 CN + Wan，全部通过再切换；禁止原地 `git pull` 覆盖现有可用环境 |
| PyTorch（ComfyUI venv） | 2.12.1+cu130 | 2.15.0 | 3 个小版本 | **随 ComfyUI 升级一起评估**；WSL 侧已实测 2.15.0+cu132 可用（67.8 TFLOPS），Windows 侧暂不动，避免自定义节点 CUDA 扩展失效 |
| FFmpeg | 8.1.1 | 9.1 | 1 个大版本 | **保持 8.1.1**；现有视频封装/抽帧脚本未做 9.x 回归，升级收益低 |
| Blender | 5.2.2 LTS（系统） | 5.3.0 / 5.2.5 LTS | 已补装 | **双版本便携并存**：5.3.0 为默认创作版，5.2.5 为兼容备份，系统 5.2.2 保留；三者互不覆盖 |
| ImageMagick | 7.1.2-36 | 7.1.2-36 | 0 | 保持 |
| KTX-Software | v4.4.2 | v4.4.2 | 0 | 保持 |
| RenderDoc | v1.47 | v1.47 | 0 | 保持（功能抓帧仍 BLOCKED，见 `blockers.md`） |
| Godot | 4.7.2 | 4.7.2 | 0 | 保持 |
| gitleaks | 8.30.1 | v8.30.1 | 0 | 保持 |
| GitHub CLI | 2.96.0 | v2.106.0 | 10 个小版本 | **建议升级**：独立二进制，升级风险低；`gh pr` 行为需复核一次 |
| Git for Windows | 2.56.0 | 2.56.1 | 补丁 | **建议升级**：纯修复版本 |
| Supabase CLI | 3.4.0 | v3.4.0 | 0 | 保持 |
| aria2 | 1.37.0 | 1.37.0 | 0 | 保持（大文件仍建议单连接 curl，见 blockers） |
| Docker | 29.9.3 | 随 Desktop 通道 | — | 保持自动更新 |
| PostgreSQL | 17（容器） | 17.x | — | 保持；不升 18，避免扩展与 Supabase 镜像不匹配 |
| WSL2 Ubuntu | 24.04 LTS | 24.04 LTS | 0 | 保持 |
| Krita | 5.3.4.1 | 5.3.4.1（桌面） | 0 | 保持；Android 侧 5.3.4.2 不影响桌面 |
| Audacity | 4.0.2 | 4.0.2 | 0 | 保持（2026-11-02 发布，修复项目损坏类问题） |
| Numba | 0.68.1 | 0.68.1 | 0 | 保持 |
| Taichi | 1.7.4 | 1.7.4 | 0 | 保持 |

---

## 2. 本轮实际动作

- **已装** Blender 5.3.0 与 5.2.5 LTS 便携 ZIP，官方 SHA-256 校验通过；两版均完成 Geometry Nodes / 材质 / Cycles OptiX / GLB 导出 / 浏览器加载验证（见 `blender-5.3.md`）。
- **已装** Krita 5.3.4.1、Audacity 4.0.2，官方校验和比对通过，`--version` 实跑通过。
- **已装** Numba 0.68.1、Taichi 1.7.4，科学计算栈实跑通过（相对误差 3e-6）。
- **未升级** Node/pnpm/ComfyUI/FFmpeg：大版本升级需要在独立目录做完整回归，本轮只给方案，不在可用环境上冒险。

## 3. 插件与扩展面

| 面 | 现状 | 结论 |
|---|---|---|
| ComfyUI 自定义节点 | `custom_nodes` 下无第三方节点（仅 `__pycache__`） | 无节点版本/安全更新可审；工作流只用核心节点，升级 0.46 时不受第三方节点阻塞 |
| Blender 扩展 | 仅官方 `system` 目录，无用户扩展 | 无第三方插件兼容风险；5.3/5.2.5 双版本均用出厂节点 |
| Python 包 | analysis venv：numpy 2.5.5 / scikit-image 0.26.0 / scipy 1.18.1 / moderngl 5.13 / numba 0.68.1 / taichi 1.7.4 | 均为当前稳定版；科学栈实跑通过 |
| IDE 扩展（Cursor/VS Code） | 属于开发工具，不在资产生产链 | 本轮不做逐扩展审计；若后续引入 Blender/GLSL 扩展，再登记到 `tools-manifest.json` |

## 4. 审计脚本的已知盲区

- npm 项目内依赖（axe-core、lighthouse、pixelmatch）未装全局，`installed` 显示为空；实际版本以各工作区 `package.json` / `node_modules` 为准。
- Python 最新版字段在首版审计中为空（endoflife 返回结构未适配）；`scripts/audit-versions.ps1` 已修正，实测返回 3.15.2。当前 Windows 3.13.12、WSL 3.14 均可用，**不为追新而更换 ComfyUI 解释器**。
- RenderDoc 的版本输出被 PowerShell 匹配对象包装，JSON 中显示为对象而非字符串；实际版本 v1.47 正确。

## 5. 升级执行顺序（建议）

1. Git / GitHub CLI（低风险，先做）。
2. Node 26 + pnpm 12（独立目录，锁文件只读验证）。
3. ComfyUI 0.46 克隆（六条工作流 + 双 CN + Wan 回归）。
4. PyTorch 2.15（跟随 ComfyUI 决定）。
5. FFmpeg 9.1（最后，等脚本回归用例补齐）。

任何一步失败即回退到本表“本机”列记录的版本；便携版均保留原目录，不做覆盖式升级。


