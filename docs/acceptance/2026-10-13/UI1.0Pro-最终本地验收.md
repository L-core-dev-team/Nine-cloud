# UI 1.0 / Pro 与 Liquid Glass 最终本地验收

日期：2026-10-13（Asia/Shanghai）

候选分支：`codex/ui-1-pro-completion`

主线基准：`2647439e0cccc9a136606a81131519f53253f125`（本轮 fetch 后核对，其为候选 HEAD 的祖先）

范围：UI 隔离工作树。玩法/双记忆、环境工作树及共享主工作目录未被本轮修改。

## 交付结论与进度

UI 可独立实现和验证的部分已收尾。UI 1.0 合同的软件范围为 12/13；Pro 原 A–H 的 55 项按同一软件口径为 54/55。两份清单尚未闭合的 UI-10 / D4 都依赖真实玩法联合验收，不能把模拟回执或本地构建写成完整生产游戏已经通过。

本轮将剩余主应用字号、圆角、固定间距收敛为统一令牌，隔离开发玻璃样板，补齐玩家实际可操作的错误恢复入口、回执身份检查和模糊结果核对。叙事区去掉嵌套卡片，常驻技术信息精简，规则版本和诊断编号进入按需展开的资料层。费用、密钥、隐私及真实失败后果仍采用准确表述。

10 月 12 日台账曾错误地把 B6、H2、H4 从 10 月 10 日已通过的可控范围退回“部分”，同时混写了 B1/B2/B4 的进展。已在旧报告中更正，不修改历史 closeout 的原始证据。现在的计数来自原 55 项合同，不是新增一份更宽松的清单。

| 合同组 | 软件范围完成数 | 当前证据与边界 |
|---|---:|---|
| A1–A10 | 10/10 | 阅读断行、行高、行长、输入状态与主题取样保留；普通文字 4.5:1、大字 3:1 的原阈值未降低。 |
| B1–B7 | 7/7 | 主应用三份正式 CSS 检查 3,641 条声明；固定字号、圆角及 margin/padding/gap 使用令牌。B6 延续安全合并和层叠审阅，不以媒体规则数量作为质量判据。 |
| C1–C7 | 7/7 | 中文阅读、来源层级、空态和可执行错误文案保留；新错误诊断默认折叠。 |
| D1–D3、D5–D10 | 9/9 | 原输入、焦点、取消、空态、触控和回退行为保留；专业详情焦点专项 10/10。 |
| D4 | 0/1，联合验收阻塞 | UI 映射与模拟核对已通过；真实权限、权威回执持久化、离页/刷新恢复与长局仍需玩法分支整合验收。 |
| E1–E3 | 3/3 | 夜/昼的阅读面、次级文字和控件边界取样通过；场景亮度和透明度分层保留。 |
| F1–F6 | 6/6 | 软件回退、样式约定和截图基线保留；本机性能观测附原始数据，实体设备性能仍未测。 |
| G1–G7 | 7/7 | 沉浸背景与功能层有分工；后续 Apple 任务书授权入口采用圆润玻璃轮廓，首页胶囊入口取代旧六边形轮廓，没有推广多边形按钮。 |
| H1–H5 | 5/5 | 沿用既有可控静态文案审阅，当前新增提示再次逐条复核；动态叙事、作者原设与法律事实不作为 UI 改写材料。 |
| 合计 | **54/55** | 软件范围完成数；不含真机、作者签收、真实玩法联合验收与生产部署。 |

B1/B2/B4 的原始映射范围是主应用样式。四份独立法律/反馈 HTML 保留现行模板；开发样板也有自己的场景样式。它们不计入这次主应用令牌映射，不宣称独立法律页已取得全主题 AA 认证。

## Liquid Glass 的实际技术方案

项目是 React / TypeScript / Vite 网页，采用可复用 [LiquidGlass](../../../apps/web/src/components/LiquidGlass.tsx) 组件、共享主题令牌和统一 [材质 CSS](../../../apps/web/src/components/liquid-glass.css)。没有新增依赖，也没有加入全屏实时折射着色器。

Regular 用于导航、菜单和文字工具层；Clear 用于图像背景之上的少量入口。背景透射和颜色由浏览器实时合成；指针位置控制边缘反射，短促按压与选中状态提供交互反馈。局部 SVG `feTurbulence` / `feGaussianBlur` / `feDisplacementMap` 在适当表面提供可测的位移近似。

折射对照在 17,640 像素区域内有 2,677 个像素变化（15.18%）。这是浏览器位移滤镜产生变化的证据，不是光学正确性、真实玻璃厚度或 Apple 原生材质等效的证明。首页主入口在 Edge 的 SVG 背景合成路径曾有绘制异常，因此保留 CSS 透射与边缘层；存档入口、导航和菜单等稳定表面保留局部 SVG。当前正式首页和降级截图均完整显示“九霄”。

玻璃主要落在浮动功能层；普通文章、设置卡和叙事阅读面保持稳定底色。相邻控件共用父材质、子项保持轻薄；网页的形态过渡不等同原生 `GlassEffectContainer` / `glassEffectUnion` 的几何融合。没有设备姿态响应、系统环境光采样或原生滚动边缘渲染器。

原始任务书、六项 Apple 官方资料的访问方式、组件复用示例及逐项平台边界已保存：

- [用户任务书原文](../../design/Apple-Liquid-Glass-原始任务书.md)
- [任务书与验收映射](../2026-10-12/Apple-Liquid-Glass-任务书与验收映射.md)

`/__liquid-glass` 只在 Vite 开发环境动态加载。正式构建未包含 `LiquidGlassDemo` 或 `.liquid-lab` 专属资源；正式构建访问此路径会回到正式首页。样板截图只是验收材料，不会成为生产首页。

## 错误恢复与结果核对

[CloudGame](../../../apps/web/src/routes/CloudGame.tsx) 和 [错误映射](../../../apps/web/src/routes/cloud-game-errors.ts) 完成以下 UI 行为，API、规则及存储 schema 未修改：

- 已知错误提供对应的账号、存档列表或重新读取操作；内部代码只在“查看错误详情”中显示，原始异常和提供商响应不进入诊断文案。
- 超时、连接断开、无效 JSON 或其他未知提交结果保留原文、原修订及幂等键；核对使用原请求并关闭再次生成叙事的请求。
- 核对途中遇到“规则未就绪”等提前失败时，仍保留原请求键，不以本次核对失败推断之前没有提交。
- 回执必须同时匹配当前存档和原请求编号；不匹配的回执不展示为本次结果。
- 已收到回执但最新存档刷新失败时，保留回执并阻止基于旧快照继续提交；重新读取成功后恢复输入。
- 重新读取返回会话失效或找不到存档时，隐藏此前缓存的存档及回执；不继续显示上一个账号的快照。
- 界面按 `saveId` 重建会话，避免切档时沿用另一档的未确认请求。

本轮浏览器 fixture 证明“提交成功、响应丢失”后两次请求只记录一个模拟事件，并且只请求一次叙事；另覆盖刷新失败、错误存档回执、错误请求回执、版本不匹配、核对期间规则不可用及刷新时已无读取权限六种情况。这个 mock 不是生产服务器。当前未确认请求仅在页面会话内保留，跨刷新/离页的持久恢复没有借此宣称完成。

## 实际验证

| 检查 | 结果 | 范围 |
|---|---|---|
| `pnpm typecheck` | PASS | 最终 UI 源码的相关工作区类型检查。 |
| `pnpm test` | PASS | core 28/28；额外 AI 核心脚本 54/54；contracts 17；content 25；domain 133；Web 189；API 327 通过、38 跳过。 |
| `pnpm --filter @jiuxiao/web test` | PASS | 最后一次 UI 修改后重新通过 27 个文件、189 项测试。 |
| `pnpm build` | PASS | 34 条 Canon runtime 检查；主 JS 629.16 kB（gzip 192.64 kB），CSS 151.43 kB（gzip 26.96 kB）。超过 500 kB 的主包提示保留。 |
| `pnpm test:e2e:design` | PASS | 3/3 对比度工具回归；20 组五页基线，4,756 个文字样本和 764 个控件边界样本；专业 AI / 世界书对比度失败均为 0。最后新增的样式仅作用于 CloudGame，另由其专项验证。 |
| `node tests/e2e/design-token-audit.cjs` | PASS | 最终三份产品样式表 3,641 条声明；含光学校正、圆形、流体字号、安全区和具名功能锚点的明确例外。 |
| `pnpm test:e2e:ui` | PASS | 六组视口/主题旅程与两组无模糊回退；长剧情、输入、导入导出、弹窗焦点、世界书往返、刷新、横屏和窄高度。 |
| `node tests/e2e/cloud-game-recovery.cjs` | PASS | 最终错误恢复/精简阅读布局；模糊提交结果、六组异常分支和原请求核对。 |
| `pnpm test:e2e:liquid-glass` | PASS | 390/1440px、夜/昼、键盘/触摸菜单、滚动、悬停/按压、位移像素对照；64 个可见文字片段的对比度取样。 |
| `node tests/e2e/professional-focus.cjs` | PASS 10/10 | 目录/详情、精确焦点返回、延迟内容、Tab/Shift+Tab、Escape、触摸、重开和卸载。 |
| `pnpm test:e2e:liquid-glass-production` | PASS | 正式资源无开发样板；样板 URL 回到正式首页；标题及入口可见；降低透明度时滤镜为 none；正式路由无页面异常。 |
| `pnpm scan:artifacts` | PASS | 最终产物 103 文件、17,832,538 字节；未检出试验版 scene-studio / scene-gate 包和代码。该扫描不是全栈安全渗透审计。 |
| `git diff --check` | PASS | 代码、文档和测试改动的空白检查。 |

API 的 38 项数据库集成测试仍未运行；没有使用生产数据库替代隔离测试库。完整数据库 E2E、真实账号/模型费用、长局服务端恢复及实体设备均未在本次 UI 候选中验证。

## 性能、兼容性与无障碍

Edge `155.0.4283.45`，本机暖缓存生产预览，在 390/1366px、昼夜、首页/世界书共八组各进行两秒合成滚动。此次 rAF 调度间隔中位数 4.2ms、P95 4.3ms，观测到的超过 34ms 间隔与 long task 均为 0。原始记录见 [performance JSON](evidence/liquid-glass-performance.json)。这只是桌面浏览器调度代理数据；不能推导手机 FPS、GPU 绘制帧率、网络首屏、温度或电池消耗。

减少动态、降低透明度、提高对比度和强制颜色的模拟已通过；无滤镜手机夜间、桌面昼间仍可完成主要操作。使用 Edge/Chromium 的真实浏览器运行和模拟视口，未把 iPhone User-Agent 当作 Safari 内核。当前机器没有安装 Playwright Firefox/WebKit，未宣称这两个内核实测通过；不支持 SVG 背景引用滤镜时由 CSS 能力回退，不支持背景滤镜或降低透明度时由稳定表面回退。

本次没有发现可阻断已测试主要 UI 旅程的缺陷，但主包体积仍是后续性能优化项，真实低端设备和完整动态内容尚未穷举。没有把这份 UI 检查写成“网站无任何漏洞”。

## 视觉证据与可复现性

以下均是实际浏览器截图，网页不会加载这些 PNG 作为材质覆盖层：

- 正式页面：[手机夜间首页](evidence/formal-home-night-390.png)、[手机昼间首页](evidence/formal-home-day-390.png)、[桌面昼间首页](evidence/formal-home-day-1366.png)、[透明度降低回退](evidence/formal-home-reduced-390.png)。
- 正式功能：[专业设置阅读面](evidence/formal-settings-night-390.png)、[云端行旅结果与输入](evidence/formal-cloud-recovery-390.png)。
- 开发样板：[夜间材质](evidence/glass-demo-night-390.png)、[昼间材质](evidence/glass-demo-day-1440.png)、[弹出菜单](evidence/glass-demo-menu-390.png)。
- [所附截图/JSON 的 SHA-256 清单](evidence/evidence-manifest.json)、[20 组设计基线清单与判据](evidence/ui-baseline-manifest.json)、[最终源码和构建资源快照](evidence/source-snapshot.json)。

快照记录 81 个 UI 源文件/配置，合成源码 SHA-256 为 `577dd5b87d756924548e397e62af8cdeb7d884732508b9e3c3da00b04de2fe7e`。它在最终代码修改后生成；提交及重建后继续用逐文件哈希核对，不用父 HEAD 的旧测试名义覆盖脏工作树。完整可重建截图位于 `test-results/e2e` 与 `test-results/ui-final` 忽略目录；仓库只收录本文选定证据和清单。

## 修改文件与发布边界

代码：`apps/web/src/main.tsx`、`components/LiquidGlassDemo.tsx`、`components/liquid-glass.css`、`components/liquid-glass-demo.css`、`components/game-shell.css`、`style.css`、`routes/CloudGame.tsx`、`routes/cloud-game-errors.ts` 及单元测试。

测试/入口：`tests/e2e/design-token-audit.cjs`、`design-acceptance-runner.cjs`、`liquid-glass.cjs`、`liquid-glass-production-guard.cjs`、`cloud-game-recovery.cjs`、根 `package.json`。文档为任务书原文、验收映射、旧台账更正、本记录及所附证据。没有新增依赖或修改 API/存储 schema。

本次 GitHub 同步只针对 `codex/ui-1-pro-completion`。同步前已核对只有 `ci.yml`，其触发条件为 `main` push / PR；该 UI 分支没有开放 PR。因 Actions 额度截图显示已用满，本次不创建 PR、不触发新的这套 Actions，也不将本地验证称为精确提交 CI 通过。

未合并到主线、未执行生产部署或真实域名发布验收。正式页面的本地构建已经与开发样板分离；实际网站更新仍需后续合并和生产部署。并行玩法、环境分支的完成状态与生产事实必须在各自整合后核对。
