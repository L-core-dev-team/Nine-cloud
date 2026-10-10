# S-STRESS-01 长期稳定性与异常恢复报告

执行人：水龙吟。日期：2026-10-10。结论：页面切换、模拟移动端、超时恢复和 Foundation 通过；关闭标签页后未提交本地草稿丢失，稳定复现三次，整体不能宣称全 PASS。仅新增测试与报告，未修复生产代码。

## 1. Git 与受测版本

- fetch 后 main：`b379719b33cc2f0eced797caa9cdd95c2ab40cf0`。新增 release scope / AIGC 标签提交已调查，未纳入冻结基线，也未重新实现。
- 冻结 S 分支：`shuilongyin/s-main-sync-20261010`，`eb29fa1114592130419116ef3426fc47fa30e0bf`（已验收代码 ab356de51cad3569a029ec6f9f20a2f33f0eee26）。原树干净，无写入。
- 原独立 UI 树：`042f877b4accfc7f6a3671639b8ed7064c26a47c`，干净，无写入。
- 独立 worktree：`C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-S-stress-20261010`；审计分支：`shuilongyin/s-stress-audit-20261010`。
- 最终测试脚本代码 SHA：`d3477a63a63340c6e2c68000cdb190e2078c7ca2`。持续导航/驻留的实际启动 SHA 为 `004fcf0a250953daff1bc09800f5d990dadfba98`；移动、恢复和渲染诊断的启动 SHA 分别见下表。新增测试逐步核验，未更改受测生产内容。报告和证据是后继文档提交，其最终远端 HEAD 见交接完成节点。
- 相对冻结 S，apps/packages/scripts、素材字节规则、锁文件、package.json、AGENTS 零差异。没有合并、推送 main，没有覆盖原 S 或 P3 工作区。

## 2. 环境、命令与计数

Windows NT 10.0.26200.0；Node 24.19.0；pnpm 11.19.0；Playwright 1.63.0；本机 Edge 155.0.4283.45，headless。每个测试独立浏览器上下文，临时目录均限定在水龙吟专用/临时/S-STRESS-01/temp。使用本地 Vite preview，外部及权威 API 请求拦截为合成结果，Foundation 复用仓库已有本地模拟服务。没有账号、真实玩家数据或真机。

新增压力脚本实际执行命令：`node tests/e2e/stress-audit.cjs navigation|mobile|recovery|renderer`（分别执行四个命令）。本地包装器 `C:\Users\11954\Desktop\水龙吟专用\临时\S-STRESS-01/run.cjs` 负责圈地内 TEMP/TMP、日志和既有 pnpm PATH；逐条实际命令、起止时间和退出码见 s-stress-01-evidence.json 的 commands。

计数单位：一个 results 条目为一个场景检查；一个场景可含多步操作。BLOCKED 单独计入计划项；不将内部断言、重复预检、Web 单测或 Foundation 的采样数量重复累加到压力总数。

| 压力类别 | PASS | FAIL | BLOCKED | 实际启动 SHA | 秒 |
|---|---:|---:|---:|---|---:|
| navigation | 301 | 0 | 0 | 004fcf0a250953daff1bc09800f5d990dadfba98 | 624.788 |
| mobile | 31 | 0 | 0 | d3477a63a63340c6e2c68000cdb190e2078c7ca2 | 31.375 |
| recovery | 26 | 3 | 1 | d3477a63a63340c6e2c68000cdb190e2078c7ca2 | 77.529 |
| renderer | 4 | 0 | 0 | d3477a63a63340c6e2c68000cdb190e2078c7ca2 | 31.252 |

压力计划项总计 366：PASS 362，FAIL 3，BLOCKED 1；实际执行 365，NOT RUN 0（仅指本矩阵，外部检查见第 6 节）。recovery 退出码为 1，真实 FAIL 保留；其他压力模式退出码 0。

| 操作明细 | 次数 / 结果 |
|---|---|
| 原生 UI 页面切换 | 240 尝试，240 成功、0 失败；大厅/创建/世界书/AI/画质/云账号/大厅/管理存档，30 轮 |
| 浏览器后退与前进 | 30 对，60 次历史移动，全部通过 |
| 存档管理页刷新 | 10 次，通过 |
| 世界书长驻留 | 601.000 秒；20 个间隔检查、搜索及恢复，通过 |
| 专业目录弹窗 | 导航过程中打开/关闭 30 次，Tab 与 Escape 检查通过 |
| 模拟手机矩阵 | 320/390/430px × 正常动画/reduced-motion × 5 轮 = 30 组，全部通过 |
| 手机组内操作 | 输入聚焦/移焦 30 对；90 次资料弹窗；60 次横竖视口改变；240 次滚动；30 次昼夜切换 |
| 合成存档刷新 | 12 次，存档镜像和同标签页草稿不变 |
| 非法 JSON 导入 | 3 次，无导入预览，显示错误，原存档不变 |
| 关闭标签页后新开 | 存档保护 3/3 PASS；未提交草稿恢复 0/3 PASS，3/3 FAIL |
| 合成 HTTP 503 + 显式重试 | 3 组，每组仅 2 个行动请求，无自动重试 |
| 请求处理中重复提交 | 一组：额外 requestSubmit 两次，实际 POST 仍仅一次 |
| 真实客户端 20 秒期限 | 3 组，超时保留输入；显式重试清空输入、显示合成拒绝回执、修订仍 0 |
| 独立渲染观察 | 3 次：WebGL 2，55 FPS，目标 60；正常动画，页面可见 |

## 3. 内存与运行表现

CDP Performance.getMetrics / Memory.getDOMCounters 测量的是当前页面 JS 堆、DOM、文档和事件监听器；不等于 OS 进程总内存、GPU 内存或手机内存。导航每轮在同一 /saves 阶段采样；驻留每约 30 秒采样。自然采样和显式 HeapProfiler.collectGarbage 分开记录。自动化及 Foundation 并行使用同一主机，FPS 不是独占性能基准。

- 导航自然堆使用量范围：6.81–16.30 MiB。
- 世界书驻留自然堆使用量范围：6.12–6.80 MiB；首个 6.66 MiB，末个 6.35 MiB。
- 逐次强制 GC 后数据：

| 阶段 | JS 堆 MiB | DOM 节点 | 文档 | 事件监听 |
|---|---:|---:|---:|---:|
| cycle-2 | 5.330 | 290 | 5 | 366 |
| cycle-9 | 4.323 | 258 | 1 | 210 |
| cycle-19 | 5.329 | 276 | 3 | 366 |
| cycle-29 | 5.369 | 276 | 3 | 366 |
| world-end-GC | 5.915 | 1424 | 1 | 441 |

未见本次观察窗内的明显持续堆增长或交互失效。/saves 与 /world 内容不同，其 GC 后大小不可直接作泄漏比较。长期驻留的节点细小变化及自然 GC 波动均保留原数值，不能据此推断无限期运行稳定。导航/移动/恢复/渲染四个模式 pageerror 和 crash 均为零。console 中合成 503、Foundation 未启动的本地代理连接错误按环境注入/本地未服务请求记录，不冒充真实服务可用；诊断列表最多保留 100 条，非完整请求总计。

## 4. 可复现风险与分析

**S-STRESS-DRAFT-01：P2 / 中，关闭标签页后未提交草稿丢失。**

复现：合成角色进入本地游戏 → 输入“合成未提交草稿” → 关闭标签页 → 同一浏览器上下文新开标签页访问原游戏 URL。草稿预期值与实际空字符串不一致，三次均 FAIL；相同存档镜像三次均严格一致。更早一次独立复验也失败，证据未删除。

原因事实：apps/web/src/storage.ts:218–226 的 readActionDraft/writeActionDraft 使用 sessionStorage；main.tsx 的输入改变立即调用 writeActionDraft。同一标签页刷新 12/12 恢复，但新标签页没有原 sessionStorage。这是已有生命期限制，未证实由本轮引入；没有权威存档损坏或回合结算变化。

建议道主另行决定是否需要跨标签页/浏览器中断的未提交草稿恢复，或提示草稿的有限生命期。届时须明确本地草稿规则，云端草稿需 P3 所有权与恢复契约。本轮不改存储键、UI 或业务。

三次超时实测值：20193 ms，20226 ms，20227 ms。不是加速时钟。请求超过现有期限后有提示、释放输入、保留文本，手动重试恢复；没有后台自动重试。拒绝回执全部为合成数据，不能证明真实规则或服务器幂等性。

预检证据：无存档时“管理存档”入口不存在，首次导航预检缺前置条件；世界书采用异步加载，首个预检在加载完成前计数为 0；这些是测试前置/等待错误，保留原日志后沿用已有工具的合成创建与等待条件，34 条断言未降低。超时恢复初版错误期待“空输入的提交按钮启用”，实际成功清空后本就应禁用；截图证实正常状态，改为输入解禁、空草稿、正确回执与零修订联合断言，原三次误判日志保留。正式压力统计不将这些脚本预检当成产品故障。

## 5. 既有工具与实际复测

| 命令 | 退出码 | 结果 | 证据 |
|---|---:|---|---|
| pnpm build | 0 | PASS | build/command-0.log；首次 PATH 缺 pnpm 的启动失败保留 build.log，修正执行环境后通过 |
| pnpm --filter @jiuxiao/web test | 0 | PASS，25 文件 / 175 项 | regression/command-0.log |
| node tests/e2e/professional-focus.cjs | 0 | PASS，D8 10/10 | regression/command-1.log |
| node tests/e2e/cloud-game-shell.cjs | 0 | PASS，8/8 模拟展示 | regression/command-2.log |
| node tests/e2e/foundation.cjs | 0 | PASS，真实执行 | foundation/command-0.log，foundation/e2e/ui-baseline-manifest.json |
| git diff --check | 0 | PASS | 交付 Git 记录 |

Foundation 覆盖 390/1366px 本地创建、存档写入失败、IDB 和镜像配额失败、导入保护/竞态、草稿、AI 5 秒实际中止与恢复、WebGL 故障回退，以及 20 个页面基线、4396 文本采样、572 控件边界采样。Foundation 的整体退出码为 0，不引用上一轮 PASS 替代本次运行。这里不把其内部检查虚构为固定新增压力用例数。

与已有 S-QUALITY-FINAL 的差别：此前重心为逐帧普通文字对比度、Windows 全新检出字节稳定和常规布局/焦点旅程；本轮新增密集 240 次 SPA 切换、历史与刷新循环、10 分钟活跃驻留/JS 堆采样、手机反复弹窗/旋转/滚动、关闭标签页生命周期、503 与真实 20 秒超时循环和重复提交观察。没有重复开发 GameShell、CloudGame、D8、字体阴影、世界书截图或素材规则。

## 6. 边界与外部阻塞

- **BLOCKED**：真实 P3 历史、草稿所有权与生命期、服务器幂等/重复结算保证、真实失败回执与恢复语义、授权记忆展示；仍等待正式八项契约，不用模拟通过替代权威验收。
- **NOT RUN**：真机 iPhone/Android、真实 AI/账号、生产环境、多小时/多日运行、OS/GPU 内存泄漏专项、数据库与 content 历史故障修复、联合候选及人类 UI 审美验收。
- **NOT RUN（本轮独立命令）**：TypeScript 全仓检查、本地 UI 六组独立脚本、96 项窄屏独立脚本、S-QUALITY-FINAL 80 帧专项、全新 Windows 再检出哈希专项。生产代码未变；它们的历史通过只作为冻结背景，不登记成本轮 PASS。
- B1/B2/B4 的冻结风格例外、D4/P3 依赖保持原登记，不擅自改 PASS。

## 7. 交付与停止

本轮只新增 tests/e2e/stress-audit.cjs、此报告、s-stress-01-evidence.json。正式报告和关键 JSON 进入独立审计分支，截图及完整日志保留在水龙吟专用/临时/S-STRESS-01（索引含 SHA256 和体积）。正常推送此独立分支，最终 HEAD / 干净状态 / 远端匹配记录在水龙吟专用/交接/S-STRESS-01-完成节点-2026-10-10.md。

没有修改任何生产文件，没有删除文件；没有圈地外写入、真实玩家数据、P3 工作区操作、main 合并/推送或部署。原 S 技术冻结保持不变。建议复核草稿生命期风险后决定是否另行授权修复；本轮到此停止施工，等待道主与道童审核。
