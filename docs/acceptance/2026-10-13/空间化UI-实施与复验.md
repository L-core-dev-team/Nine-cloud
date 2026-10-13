# 空间化 UI：实施与复验

日期：2026-10-13（Asia/Shanghai）。范围：UI 隔离分支 `codex/ui-1-pro-completion`，从 `c927de5c13968279fe8a19027ebc6fa5edb878c6` 开始。

本轮负责人在完成五份方案审阅后明确要求“请开始”。实施依据为 [冲突审阅](../../design/2026-10-13-空间化UI方案审阅.md) 与 [逐文件清单](../../design/2026-10-13-空间化UI逐文件升级清单.md)。本文不把建议文档中引用者的命令、设计评分或工期当作已核实结论。

## 实际改动

| 批次 | 实现 | 代码与边界 |
|---|---|---|
| U00 | 修复世界资料切换选中样式 | CSS 统一匹配现有 `aria-pressed`；保持正文/图鉴切换语义。独立提交 `996ed1f`。 |
| U01 | 提取已有令牌、首页和导航 | 新 `design-system/tokens.css`、`GlassHeader`、`pages/Landing/Landing`；原变量值、导航回调、存档状态和品牌文案保留。独立提交 `2549701`。 |
| U02 | 清透入口与首页悬浮导航 | 局部 `liquid-glass--crystal` 样板通过后集成。薄边、真实背景透射、低模糊、明暗文字色、短形态反馈；首页 fixed 悬浮，阅读页继续 sticky；菜单跟随悬浮工具保持可操作。 |
| U03 | 统一局部受光调度 | 单一指针监听/合帧调度，仅注册的功能表面更新局部坐标；无全屏追光，无高频 React 树更新；触摸、减少动态、降低透明度、强制颜色、省流、隐藏页、窗口失焦及卸载有启停/清理。 |
| U04 | 功能层保持一致，内容层保持易读 | 世界资料选中分组修复；首页去掉存档状态内部第二层玻璃；已有设置、长文及纪事稳定底色保留。没有重做 Canon、建角字段或 AI 调用。 |
| U05 | 入口加载与场景成本整理 | AI/云档/画面设置按需加载，加载失败保留导航与明确返回操作；移除旧多边形和循环入口光流；既有 CSS 场景运动服从减少动态/省流，削弱昼间不自然的瀑布虚线。没有新增渲染器或依赖。 |
| U06 | 未实施，联合项 | 境界光色与真实叙事阶段反馈须依权威字段、规则版本和权限整合后验收。没有把建角草稿或 AI 文字推断为真实修为。 |

未新建 `PortalButton` 空壳、第二套 GlassPanel、全屏 Canvas 光团或新 CloudLayer；现有组件可表达这些功能。没有为“目录看起来完整”增加重复实现。

## 材质、原型与差异

开发样板 `/__liquid-glass?material=crystal` 对照旧材质；沿用同一场景、Regular/Clear 控件和原交互。样板只在开发环境加载，正式构建仍通过独立资源/路由守卫检查。

原型先验证，再把共享材料类用在正式两个入口。Regular 导航保留足够文字遮罩；Clear 入口以 1px 背景模糊与 1.18 饱和度为基准，读取存档在已验证路径中保留 SVG 位移。主入口继续避免已知 Edge SVG 合成缺陷，没有声称所有控件都实现几何折射。

现有 SVG 是平滑噪声位移，能产生可测背景变化，但不是基于真实厚度/边缘法线的物理透镜。没有 Apple 原生窗口集成、设备姿态、动态亮度采样/文字反相或 `GlassEffectUnion` 融合。网页功能分组、短按压与圆角过渡不能宣称原生等效。

品牌“九霄”和“修途自此启程。”保留；手机导航长句按两个自然分句展示，工具有至少 44px 操作区域。首页没有添加 AI 引擎口号、英文副标、无限呼吸或延迟一秒才可点击的入口。阅读与错误提示继续表达真实动作。

## 发现并修复的验证问题

- 样板的新材料覆盖了高对比度边界，首次检查得到 1px 而不是 2px。补上同等优先级的高对比规则后再运行，未降低判据。
- 正式页桌面工具高度不足 44px，补齐最小操作区域；不是放宽触控断言。
- 初次截图继承了宿主降低透明度偏好，显示实色回退；测试明确区分默认透明效果和回退，不把实色图当默认材质。
- 旧首页断言写死 `78dvh`、18px 模糊及贴顶 0px；新首页为悬浮工具留白，因此按新布局更新参数，同时保留首屏入口、标题与触控区域检查。阅读页导航继续沿用原设计。
- 昼间首页入口文字两处对比度为 4.09/4.11，未达到 4.5:1。调深 Clear 文字语义色后复核，不增加粗边或以变厚遮罩掩盖。
- 独立 Web 构建会清掉根构建生成的 `build-manifest.json`，导致焦点测试记录阶段失败。最终验证须先执行根 `pnpm build`，不能把该次异常算作通过。
- 旧测试脚本直接写历史验收 PNG。已将恢复/生产守卫输出改为忽略目录，并恢复本次被改写的旧截图；新证据另行保存。

## 复验状态

最终源码复验完成。以下均为本轮本地结果；代码指纹记录在 [源码及构建快照](evidence/spatial-ui/source-snapshot.json)，不以父 HEAD 代替实际被测源码。检查经过失败、修复和复验，只有下表最终通过项算作完成。

| 检查 | 本轮已观测结果 |
|---|---|
| 类型检查 | `pnpm typecheck` 全工作区通过；最终 Web 再复核通过。 |
| 单元测试 | core 28/28、AI 核心脚本 54/54；contracts 17、content 25、domain 133、Web 189；API 327 通过、38 数据库项跳过。 |
| 世界切换 | 昼夜 × 键盘/触摸 4 组通过，选中材质随实际按钮切换。 |
| 正式首页 | 320/390/720/1366/1440/1920px × 昼夜 12 组；标题、入口、操作区域、横向溢出检查通过。 |
| 受光与模块失败 | 指针坐标、减少动态、省流、窗口失焦通过；设置模块下载失败仍可返回山门。 |
| Crystal 原型 | 明暗/滚动/按压/菜单/回退与对比度检查通过；局部位移像素对照有变化，不是物理正确性证明。 |
| 首页对比度专项 | 调深文字后 4 组基线、176 文字样本、32 边界样本通过，阈值不变。 |
| 旅程 | 六组视口/主题及两组无滤镜旅程通过；原请求恢复及六组异常分支通过。 |
| 全页面设计审计 | 最终 20 组基线，4,620 文字样本、686 控件边界；专业设置/世界资料对比度失败均为 0；采样器回归 3/3，阈值不变。 |
| 令牌 | 五份正式 CSS 的 3,707 条声明通过，迁移后的文件纳入扫描；未漏扫新文件。 |
| 专业详情焦点 | 最终 10/10 通过：精确回到来源、Tab/Shift+Tab、Escape、触摸、延迟渲染、重开和卸载。 |
| 材质样板 | 默认与 Crystal 两次专项均通过；Crystal 位移对照 17,640 像素中 3,689 变化，20.91%，平均最大通道差 1.77。只证明滤镜产生变化。 |
| 正式资源隔离 | PASS；正式构建无样板组件/专属样式；样板 URL 回正式首页；降低透明度滤镜为 none、标题和入口完整。 |
| 构建与产物扫描 | 根 `pnpm build` PASS；106 文件、17,841,627 字节，未检出试验版山门包/代码。不是全栈安全扫描。 |
| 差异检查 | `git diff --check` 通过；API、规则、存储 schema 和 Canon 未修改。 |

## 性能与空间限制

主入口 JS 从约 629.16 kB（gzip 192.64 kB）降至约 491.29 kB（gzip 152.68 kB），减小约 22%。拆出的设置模块仍计入总下载体积；这不表示完整站点体积等比例下降，也不是实际公网首屏速度、手机 FPS 或功耗证明。

Edge `155.0.4283.45` 的本机暖缓存生产预览，390/1366px、昼夜、首页/世界资料共八组各两秒合成滚动：各组 P95 调度间隔 4.3ms，超过 34ms 间隔和 Long Task 均为 0。见 [原始性能记录](evidence/spatial-ui/performance.json)。这是桌面调度代理，不能换算为 GPU FPS、手机 45fps、温度或电池续航；现场可能有其他任务，未把它描述成隔离实验室测量。

负责人提示 C 盘空间不足时，实测约 1.03 GB。将本任务约 116 MB 的 `test-results` 移到 D 盘并保留目录连接，随后约 1.15 GB 可用；后续浏览器临时目录也设在 D 盘。没有删除系统文件、依赖缓存、其他任务资料或其他浏览器进程，没有安装新浏览器或依赖。

## 正式视觉证据

以下是正式候选页面截图，未作为运行材质加载：

- [手机夜间首页](evidence/spatial-ui/home-night-390.png)、[桌面昼间首页](evidence/spatial-ui/home-day-1366.png)。
- [世界资料选中状态](evidence/spatial-ui/world-night-touch.png)、[降低透明度回退](evidence/spatial-ui/home-reduced-390.png)。
- [布局/状态/光感/下载失败验证记录](evidence/spatial-ui/spatial-audit.json)、[文件证据哈希](evidence/spatial-ui/manifest.json)。

选定截图和 JSON 约 2.63 MB；完整日志与其他尺寸截图保留在 D 盘的本任务验证目录，未把大量可重建测试文件放进 Git。源码快照覆盖 116 个源码、测试与配置，合成 SHA-256 为 `94a8389151aef61c58eb8d0fb21e60084c8a791f77c2df46a5fe234dbfd19c13`。提交后逐文件复核，构建资源亦按哈希核对。

## 复用与修改文件

主入口依次导入 `design-system/tokens.css`、`style.css`、`components/liquid-glass.css`、`pages/Landing/landing.css`。玻璃滤镜定义仍只挂一份；正常实例沿用 `LiquidGlass`，需更清透的图像上功能控件可采用：

```tsx
<LiquidGlass as="button" type="button" variant="clear"
  className="portal-enter liquid-glass--crystal" onClick={onEnter}>
  <span>进入世界</span>
</LiquidGlass>
```

文字丰富的导航/菜单继续 Regular；不要给内容段落或已在玻璃父容器里的每个子按钮再次套材质。`GlassHeader` 与 Landing 用显式回调复用，不复制业务路由或保存状态。

源码改动：`main.tsx`、`style.css`、`components/GlassHeader.tsx`、`LiquidGlass.tsx`、`LiquidGlassDemo.tsx`、`liquid-glass.css`、`liquid-glass-demo.css`、`RouteModuleBoundary.tsx`、`design-system/tokens.css`、`light-controller.ts`、`pages/Landing/Landing.tsx`、`landing.css`。

测试改动：`spatial-ui.cjs`、`design-token-audit.cjs`、`design-acceptance.cjs`、`game-shell.cjs`、`liquid-glass.cjs`、`cloud-game-recovery.cjs`、`liquid-glass-production-guard.cjs`。无新依赖，未修改 API、规则、存档结构或 Canon 内容。

## 运行与发布边界

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:design
pnpm test:e2e:ui
node tests/e2e/spatial-ui.cjs
node tests/e2e/professional-focus.cjs
pnpm test:e2e:liquid-glass
pnpm test:e2e:liquid-glass-production
pnpm scan:artifacts
git diff --check
```

Crystal 对照另外设置 `UI_GLASS_MATERIAL=crystal` 再运行 `liquid-glass.cjs`；只影响测试样板 URL。本机后续浏览器运行将 TEMP/TMP 指向 D 盘，不更改用户系统级环境变量。

本地模拟不等于实体设备或原生 Apple/Huawei 材质。数据库集成与真实玩法联合未借 UI mock 完成。候选分支上传、主线整合、CI 和正式部署分开记录；不触发尚未解除的 GitHub 账户门禁，不把此文写成生产更新证明。

完成口径：本轮首轮升级 U00–U05 已实现并复验；U06 是后续联合项。原 UI 1.0/Pro 的真实玩法联合关口仍未借此签收；本轮新发现的选中高光缺陷已修复，旧软件进度计数不能代替这份新证据。实体设备、Firefox/WebKit 与实际生产域名没有本轮验证结论。
