# 九霄 UI 1.0 / Pro 与 Liquid Glass 验收记录

日期：2026-10-12（Asia/Shanghai）
候选分支：codex/ui-1-pro-completion
测试基线：已 rebase 到最新 GitHub `main`（`2647439e0cccc9a136606a81131519f53253f125`）的 UI 候选；浏览器截图及验收记录来自该代码树。

## 结论

UI 1.0 的核心阅读、输入、主题、存档、世界书、AI 设置与移动布局已实现并通过当前软件验收矩阵。Liquid Glass 浏览器样板已经集成到适合悬浮的导航、菜单、主要入口、选择器和临时操作控件；文章、资料卡和大面积阅读区保持稳定内容层。夜间首页继续保留沉浸山水背景与清晰阅读层次。

本次不把浏览器效果称为 Apple 原生 Liquid Glass：项目是 React / TypeScript / Vite 网页，不能调用 SwiftUI 的系统渲染器。本实现用实时背景透射、受限 SVG 位移、边缘光、环境明暗调整和交互过渡做近似。HTML/截图没有覆盖系统级环境光、设备姿态、原生滚动边缘效果，也没有取代真实设备验收。

## Apple 资料与设计取舍

已阅读 Apple 官方 Liquid Glass 技术总览、HIG Materials、SwiftUI 自定义视图文档，以及 WWDC25 219、356、323。Apple 的指导将 Liquid Glass 放在浮动的导航/功能层，并要求按文字可读性与媒体背景选择 Regular / Clear，避免把内容卡片全部玻璃化；这也是本次只给交互层加材质、让阅读面保持不透明的依据。

- [Liquid Glass 技术总览](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)
- [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Applying Liquid Glass to Custom Views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
- [WWDC25 Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25 Get to Know the New Design System](https://developer.apple.com/videos/play/wwdc2025/356/)
- [WWDC25 Build a SwiftUI App with the New Design](https://developer.apple.com/videos/play/wwdc2025/323/)

网页端无法直接等同 `.glassEffect(.regular/.clear).interactive()`、`GlassEffectContainer` 等系统能力；React 组件是可复用的浏览器近似。SVG `backdrop-filter: url(...)` 位移能力在本次 Edge 环境可用，其他浏览器不支持时会走稳定的模糊或实色回退。

## 实现内容

- 新增可复用 `LiquidGlass`，提供 Regular（文字/导航清晰优先）与 Clear（图像背景透射优先）两类材质；共享 SVG filter 定义不依赖静态 PNG。
- 对小型玻璃表面应用 `feTurbulence` + `feGaussianBlur` + `feDisplacementMap` 位移；玻璃表面仅做小范围采样，不运行全屏实时着色器。边缘高光跟随鼠标位置，按压与悬停只做短促、克制的形态反馈。
- 新增 `/__liquid-glass` 独立浏览器样板：玻璃导航、弹出菜单、分段控制、悬浮按钮，包含复杂明暗背景、滚动与交互。
- 将材质应用到站点页眉导航/菜单、山门入口按钮、世界书分类/图鉴视图选择、游戏功能层和合适的短时浮层；文字密集的设置卡、剧情/资料阅读容器不叠玻璃。
- 支持日/夜材质差异、普通浏览器滤镜回退、降低透明度、减少动态效果、高对比度和强制颜色。输入控件保持至少 16px，避免 iOS Safari 因小字号聚焦自动放大。
- 规范核心 `style.css` 固定字号、圆角和间距为语义令牌；响应式 `clamp()`、安全区与组件专属锚点/底栏避让以具名参数保留。修正无效的 `-var(...)` 负间距写法。
- 改进 AI 提供商错误归类与可执行提示，并补充不记录密钥/响应正文的回归测试。

## 方案进度

### UI 1.0 Pro：A–H 清单

原 2026-10-05 台账记录 45/55 完成、10 项部分完成。本分支在同一判定口径下补齐 A5、B1、B2、B4、E1、F6 的软件验收范围，因此目前为 **51/55 完成、4 项部分完成**。未把真机、作者签收或生产部署混入软件验收。

| 条目 | 当前状态 | 依据与剩余边界 |
|---|---|---|
| A5 / E1 / F6 | 软件矩阵通过 | 日/夜、手机/桌面、专业 AI 与世界书文字/控件取样均为零对比度失败。模拟像素检查不代表全部设备、显示器亮度和所有动态内容。 |
| B1 / B2 / B4 | 核心样式令牌通过 | 固定样式的字号、圆角、间距归并到设计令牌；响应式字号、内容缩进、安全区及功能性空间作为具名例外保留。 |
| B6 | 部分 | 当前 `style.css` 有 19 处媒体条件。按功能条件保留断点，尚未做全表层叠重排；机械合并会改变页面计算样式。 |
| D4 | 部分 | AI 提供商错误现在说明事实和下一步；权威游戏回合与服务端重试/恢复仍依赖玩法接口，不由 UI 文案冒充完成。 |
| H2 / H4 | 范围内静态审阅通过，整体部分 | 既有 2026-10-10 审阅覆盖 41 个 TS/TSX 文件、1,790 条静态中文片段；动态 AI 文本、Canon/角色原文仍不纳入 UI 文案重写。 |

### PR #59：13 项合同

- UI-01–09、UI-11–13：代码行为在本轮浏览器模拟与既有回归中通过。作者后来允许合理扩展 UI 范围，因此 UI-11 世界书的分类/计数/空态和玻璃控件增量不再按旧的“不得改世界书”冻结规则拒收。
- UI-10：继续标记 **BLOCKED**。UI 分支没有证明真实账号/模型、权威规则状态变化、叙事、服务器存档、刷新后继续的完整真实回合链。该项须与并行玩法工作整合后另行验收。
- 计划总项不能整体记为 100%：UI-10 依赖真实玩法闭环，B6、D4、H2、H4 仍有上述边界。

## 验证结果

合并最新 `main` 后的最终浏览器综合验收在 2026-10-12 19:04–19:17（本地时间）完成。

| 检查 | 结果 | 覆盖/限制 |
|---|---|---|
| `pnpm typecheck` | PASS | workspace 相关包 TypeScript 检查通过。 |
| `pnpm test` | PASS | 核心回归 28/28；domain 133；content 25；contracts 17；web 185；API 327 通过、38 跳过。 |
| `pnpm build` | PASS | Canon runtime 检查 34 条；未包含私有来源元数据。主 JS 626.77 kB（gzip 192.39 kB），构建保留 >500 kB 体积提示。 |
| `pnpm test:e2e:ui` | PASS | 六组视口/主题旅程加两组无模糊回退旅程；长文、输入提交、导入导出、弹窗焦点、世界书返回、刷新、横屏、窄高度和回退路径。 |
| `pnpm test:e2e:liquid-glass` | PASS | 390/1440 宽度、日/夜；SVG 位移支持；菜单键盘/触摸、滚动固定、悬停/按压和无障碍回退。2,677/17,640 对照像素变化（15.18%），确认 Clear 玻璃内的背景折射有效。 |
| `pnpm test:e2e:filings` | PASS | 最新主线页脚备案条目在 320/390/1366px 均正确显示、居中，无横向溢出，徽标成功加载。 |
| `node tests/e2e/professional-focus.cjs` | PASS 10/10 | 专业 AI 页目录/详情焦点落点、Tab/Shift+Tab、Escape、触摸、重开、延迟内容与导航卸载。 |
| `node tests/e2e/foundation.cjs` | PASS | 20 个五页基线；4,756 文字样本、764 控件边界样本；专业 AI/世界书对比度失败 0。WebGL 2、WebGL/Canvas/静态回退、世界书搜索、存档冲突恢复与音频手势检查通过。 |
| `pnpm test:e2e:design` | PASS | 对比度回归 3/3；再次通过 20 个五页基线、4,756 文字样本和 764 控件边界样本。 |
| `git diff --check` | PASS | 当前代码与文档改动无空白错误。 |

API 的 38 项跳过依赖独立 PostgreSQL 集成数据库；当前没有运行该数据库。Foundation 浏览器日志还记录了开发代理连接 `127.0.0.1:8787` 被拒绝，因为本次隔离 UI harness 没启动 API 进程；浏览器脚本退出 0 并通过模拟 smoke 断言，但它不构成真实 API 集成证据。

已使用 Edge 浏览器的模拟视口、键盘/触摸事件和系统偏好模拟。没有在真实 iPhone、HarmonyOS、真实软键盘、实体键盘或不同 GPU 上测温、帧率与耗电，因此不会将模拟结果称作真机验收。

## 截图证据

以下 PNG 是浏览器运行截图，只作为证据，不被网页用作材质叠层。

- [390px 夜间山门首页](evidence/390-night-home.png) — `055DA6333C5B555ED698AB4CE54496B0139CA78DB95FAED7EC47943FBAC5D583`
- [390px 夜间玻璃样板](evidence/390-night-liquid-glass.png) — `CED29368C4A09C22FD14994E1C4C3168DAC7D3BBF7977316C3B46A8ECA1AAE99`
- [390px 夜间弹出菜单](evidence/390-night-liquid-glass-menu.png) — `7D26EFAF73E7B68F0F9D49F7A25EB5F473D7C91D5C1569B9F92F9306CF58F614`
- [1440px 日间玻璃样板](evidence/1440-day-liquid-glass.png) — `45177BB5E74D0F9922277263A0B738857A9ECE24A086B464AFF2A708FE6DC19D`

## 文件与同步边界

主要实现文件：`apps/web/src/components/LiquidGlass.tsx`、`apps/web/src/components/LiquidGlassDemo.tsx`、`apps/web/src/components/liquid-glass.css`、`apps/web/src/style.css`、`apps/web/src/main.tsx`、`apps/web/src/ai-settings.tsx`。验收/回归文件：`tests/e2e/liquid-glass.cjs`、`tests/e2e/design-acceptance.cjs`、`tests/e2e/design-acceptance-runner.cjs`、`tests/e2e/foundation.cjs`、`tests/e2e/game-shell.cjs`、`apps/web/src/ai-provider-errors.ts` 及其测试、`package.json`、`.impeccable/design.json`。本报告和四张截图位于 `docs/acceptance/2026-10-12/`。

该候选只在隔离分支 `codex/ui-1-pro-completion`，其基线已跟进 GitHub 最新 `main` 的备案提示提交。用户明确说明 UI、玩法/双记忆、环境有三个并行 Codex 对话处理同一项目；本候选没有改共享主工作目录，也没有合并另两个对话的分支或修改。上传 GitHub UI 分支不等于合并到 `main` 或生产上线；本次没有执行生产部署。
