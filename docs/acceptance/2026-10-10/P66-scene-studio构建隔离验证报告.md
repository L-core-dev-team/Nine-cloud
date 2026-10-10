# P66 scene-studio 构建隔离验证报告

- 验证日期：2026-10-10
- 验证对象：PR #66 引入的 `apps/scene-studio/`（独立 Vite 工作台）与 `packages/scene-gate/`（Three.js 场景核心）**不得进入玩家可达的网站构建产物**
- 验证环境：分支 `codex/p4-recall-decay-gated`，HEAD `fa1a6b3`（= main 最新 `1093b06` 之上 1 个 docs 提交）；node v24.16.0、pnpm 11.19.0；PowerShell（Windows）
- 性质：只读验证 + 一次根脚本构建；未切分支、未 commit/push、未改动其他文件

## 一、验证方法

1. **静态链核查**：对 `apps/web/`（含 `src/`、配置、public）与 `packages/` 全量正则检索 `scene-studio` / `scene-gate` / `@jiuxiao/scene` / three.js 导入特征；检索所有 `package.json` 确定 `@jiuxiao/scene-gate` 的依赖方。
2. **实际构建**：运行根脚本 `pnpm build`（即 `pnpm worldbook:runtime:check && pnpm -r --filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate build && node scripts/build/write-manifest.mjs --stage S6`），随后对全部 6 个 dist 产物目录共 **453 个文件**做文件名扫描与文件内容扫描（`Get-ChildItem -Recurse` + `Select-String`）。
3. **CI 同款 filter 互补验证**：读取 `.github/workflows/ci.yml` 构建步骤引用的脚本名，另跑一次与 CI 完全相同排除 filter 的递归 typecheck。
4. **理论逃逸路径排查**：逐一核对 `pnpm-workspace.yaml`、`apps/web/vite.config.ts`、`apps/scene-studio/vite.config.ts`、`apps/web/tsconfig.json`、`apps/web/index.html`、`apps/web/package.json`、`scripts/build/pages-preview.mjs`、`scripts/audit/media-release-check.mjs`、`apps/web/public/scenes/candidate/asset-manifest.json`。
5. **three.js 产物对照**：对全部产物按 three.js 库特征字符串（`THREE.WebGLRenderer`/`THREE.REVISION`/`RoundedBoxGeometry`/`ACESFilmicToneMapping`/`three.module`/`three/build`/`node_modules/three`）扫描。

## 二、逐项证据

### 1. 静态链核查 —— ✓ 零引用，依赖图封闭

- `apps/web/` 全树检索 `scene-studio|scene-gate|scene_gate|sceneGate|SceneGate|from ['"]three|import\(.*three|require\(['"]three`：**0 命中**。
- `apps/web/src/` 检索 `THREE\.|WebGLRenderer|PerspectiveCamera|@jiuxiao/scene`：**0 命中**（web 自带的 `src/scenes/SceneAtmosphere.tsx` 用的是自研 WebGL 着色器，不含 three.js）。
- 全仓 `**/package.json` 检索 `@jiuxiao/scene-gate`：仅 `apps/scene-studio/package.json:15`（`"workspace:*"`）。`packages/scene-gate` 的被依赖方**只有 scene-studio**，无任何其他 workspace 包依赖它。
- `packages/` 树检索 `three|@jiuxiao/scene`：全部命中均落在 `packages/scene-gate/` 自身代码内（`src/index.ts:1` `import * as THREE from 'three'`）；`packages/content`、`packages/contracts`、`packages/domain` 中的 "three" 命中均为叙事文本（`text_idle_three_hook`、"three signed locations"），与 three.js 无关。
- `apps/web/package.json` dependencies 仅：`@jiuxiao/contracts`、`@jiuxiao/content`、`@jiuxiao/domain`、`react`、`react-dom`——无 scene 包、无 three。

### 2. 实际构建 + 全产物扫描 —— ✓ 构建成功；包标识内容命中 0

构建命令与关键输出（根 `package.json:16`）：

```
$ pnpm worldbook:runtime:check && pnpm -r --filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate build && node scripts/build/write-manifest.mjs --stage S6
Scope: 6 of 9 workspace projects
packages/{content,contracts,db,domain} build: Done；apps/api build: Done
apps/web build: ✓ 164 modules transformed. … ✓ built in 1.33s
Built web, API and schema at fa1a6b31718ab3a72e62fd49a3281e7c5775bc09 (clean worktree; 0 changed paths)
```

- `Scope: 6 of 9`：9 个 workspace 项目（root + 4 packages + 3 apps）中只有 6 个非 scene 项目进入构建图；**scene-gate、scene-studio 未被构建**。
- 产物盘点：`apps/web/dist` 103 文件 / 17,541,106 B；`apps/api/dist` 148；`packages/{contracts,content,db,domain}/dist` 36/51/64/51；合计扫描 **453 文件**。`apps/scene-studio/dist` 与 `packages/scene-gate/dist` 均 **MISSING**（从未在本机构建产物）。
- 文件名扫描（`Get-ChildItem -Recurse -File | Where-Object { $_.Name -match 'scene-studio|scene-gate|gate-environment|mountain-gate|three' }`）：**3 命中**，全部为 `apps/web/dist/scenes/candidate/mountain-gate.desktop.webp`、`mountain-gate.loop.mp4`、`mountain-gate.mobile.webp`。
  **甄别（非泄漏，仅命名同词）**：`git log --follow` 显示这三个文件只由 `503edfd feat: harden s0-s7 and integrate candidate media`（PR #66 之前）引入；PR #66 提交 `ff2b37c feat(scene-studio): add the isolated Three.js mountain-gate pilot` 对 `apps/web/public` 的改动 `git show --stat ff2b37c -- apps/web/public` 输出为**空**。它们是 web 自有的、受 84 条目 `asset-manifest.json` 门禁管辖的山门候选图/视频，与试验包无任何文件级或代码级关联。
- 内容扫描（对 453 文件 `Select-String -Pattern 'scene-studio|scene-gate|gate-environment|@jiuxiao/scene' -List`）：**0 命中**。
- 发布清单脚本 `scripts/build/write-manifest.mjs:28-31` 实证：只写 `apps/web/dist/build-manifest.json`、`apps/api/dist/build-manifest.json`、`packages/db/dist/build-manifest.json` 三处，无 scene 路径。

### 3. CI 同款 filter 互补验证 —— ✓ CI 构建图不含 scene 包

- `.github/workflows/ci.yml:74-76` 依次执行 `pnpm typecheck` / `pnpm test` / `pnpm build`，三者均引用根脚本（`package.json:12-16`），全部携带 `--filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate`。
- `ci.yml:83` release 门禁证明步骤仅 `pnpm --filter @jiuxiao/web build`（单一 web 包）。
- `ci.yml:123-135` upload-artifact 路径清单仅 `apps/web/dist/`、`apps/api/dist/`、`packages/{db,contracts,domain,content}/dist/`——**无任何 scene 目录**。
- 本机复跑 CI 同款组合：`corepack pnpm -r --filter='!@jiuxiao/scene-studio' --filter='!@jiuxiao/scene-gate' typecheck` → 输出 `Scope: 6 of 9 workspace projects`，contracts/db/content/domain/api/web 六项 typecheck 全部 Done，scene 两包不在执行范围。

### 4. 理论逃逸路径排查 —— ✓ 五条路径全部封闭

| 路径 | 证据 | 结论 |
| --- | --- | --- |
| workspace filter 语义 | `pnpm-workspace.yaml` 含 `apps/*`、`packages/*`，scene 两包**在** workspace 内；排除完全依赖根脚本每条命令上的负向 filter（构建日志 `Scope: 6 of 9` 实证排除生效） | 排除是逐命令策略，非结构性；当前每条生产命令均已排除 |
| web vite 配置吸入 scene 代码 | `apps/web/vite.config.ts` 全文：仅 react、media-release-gate、pages 字体三个插件；**无 alias、无 optimizeDeps、无 additional input**；media 门禁扫描根为 `apps/web/public/`（`vite.config.ts:59`） | 无吸入通道 |
| scene-gate 被 tree-shake 进 web | 前提是 web 源码存在 import；第 1 项双确认 `apps/web/src` 0 命中，且 `apps/web/tsconfig.json` `include` 仅 `src/**/*` 与 `vite.config.ts`，无 paths 映射 | 不可能发生 |
| scene-studio outDir 写入 web 产物 | `apps/scene-studio/vite.config.ts` 全文仅 react 插件 + dev server 端口 5185，**无 outDir** → Vite 默认输出到 `apps/scene-studio/dist`（本机当前不存在）；即使构建也与 `apps/web/dist` 无交集，且 CI 根本不构建、不上传它 | 不可能发生 |
| Pages 预览打包旁路 | `scripts/build/pages-preview.mjs:36-64`：仅从 `apps/web/public` 复制经 `docs/audit/public-demo-media-approval.json` 审批且哈希固定的 `/scenes/…` 媒体到 `apps/web/dist`，路径越界即抛 `PUBLIC_DEMO_RUNTIME_MEDIA_PATH_OUTSIDE_ROOT` | 无 scene 包参与 |
| 媒体门禁与 manifest | `scripts/audit/media-release-check.mjs:33` 扫描树 `apps/web/public`；`asset-manifest.json` 检索 `scene-studio|scene-gate`：0 命中 | 门禁范围与试验包无交集 |

### 5. three.js 产物对照 —— ✓ 产物中无 three.js 库代码

- 库特征扫描（`THREE\.(WebGLRenderer|REVISION|Scene|PerspectiveCamera)|RoundedBoxGeometry|ACESFilmicToneMapping|three\.module|three/build|node_modules/three`，453 文件）：**0 命中**。
- 宽松子串 `three`（仅 .js/.html/.css/.json）：2 命中，均为世界书叙事事件 ID `text_idle_three_hook`（`packages/content/dist/canon.registry.json:1866`、`prologue/prologue-v1.js:233`），是游戏文本数据而非 three.js 代码。
- 结论：web 构建产物（613 KB 主 chunk + 220 KB worldbook chunk）不含任何 three.js 运行时代码。

## 三、结论

**试验包（@jiuxiao/scene-studio、@jiuxiao/scene-gate 及 three.js）在玩家可达构建产物中的存在性 = 0**：453 个产物文件中，`scene-studio|scene-gate|gate-environment|@jiuxiao/scene` 内容命中 **0**，three.js 库特征命中 **0**，文件名命中 3 处均为 PR #66 之前已入库的 web 自有候选媒体（命名同词，非泄漏）；根构建 filter 排除生效（`Scope: 6 of 9`，scene 两包未构建、其 dist 目录不存在），CI 构建图与 artifact 上传清单均不含 scene 目录。

## 四、残余风险声明

1. **隔离是"逐命令负向 filter"策略，非结构性隔离**：scene 两包仍在 workspace 内，若未来有人在 `apps/web/src` 显式 `import '@jiuxiao/scene-gate'`（workspace 包可直接解析），当前没有任何门禁会阻止 vite 将其打进 web 产物——现有 grep 只证明"今天没有"，不阻止"明天有"。**建议加固：在 CI 的 `pnpm build` 之后增加 fail-closed 产物扫描守卫步骤**（对 `apps/web/dist` 等发布产物 grep `scene-gate|scene-studio` 及 three.js 特征串，命中即失败），把本次人工验证固化为机器守卫；并考虑在 `apps/web` 内加 eslint no-restricted-imports 禁止 `@jiuxiao/scene-*` 与 `three`。
2. **命名同词陷阱**：web 自有候选媒体 `mountain-gate.*`（山门图）与试验包 pilot 同名，粗粒度按 "mountain-gate" 扫描产物会误报；守卫规则应精确到 `scene-studio|scene-gate|@jiuxiao/scene` 与 three.js 库特征，避免被既有媒体名干扰。
3. **显式 opt-in 命令的存在**：`typecheck:scene-pilot`、`test:scene-pilot` 及在 `apps/scene-studio` 目录内的本地 vite 构建可产出 `apps/scene-studio/dist`，它在 CI 范围之外且不会被上传，但若有人手工将其部署则会绕过本报告全部证据链——该操作需显式人为行为，当前无自动路径。
4. 本次验证基于 HEAD `fa1a6b3`（main `1093b06` + docs 提交）与当日构建；后续任何对根脚本 filter、`ci.yml`、web vite 配置或 web 依赖清单的改动都会使本报告失效，需重新验证。
