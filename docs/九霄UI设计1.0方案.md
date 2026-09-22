# 九霄 UI 设计 1.0 方案

> 状态：已进入实现。范围仅为 UI/UX 壳、响应式布局、可访问状态与不改变语义的动效。

## 1. 结论

1.0 不应做成“液态玻璃特效展”。它应把现有夜山变成世界画布，把玻璃限制在导航、输入与短时反馈上。剧情与表单使用更厚的烟纱材质，确保长时间阅读。

本轮方向是：**山门入界，玉玻璃承载行动，烟纱承载阅读。**

在三份构图中，用户选择了 B：中央山门、纵向月华与低位入界动作。山门只用于 Landing。游戏阅读页继续使用原始夜山，避免每个页面都重复同一场仪式。

设计种子 `ef177a98` 给出的超现实“云层采石场”被否决。它会把修仙文字 RPG 误读为建造器。保留的只有一条纪律：雾不是贴图装饰，而是前景、中景与远景之间的空间层。

## 2. 不可变边界

- 不改存档 schema、验证、迁移与导入导出。
- 不改 AI provider/router、提示语义、JSON 解析与记忆归档。
- 不改角色、物品、伏笔、世界状态的数据结构。
- 不把 vanilla 单页重写成 React。
- 不直接编辑 11MB 生成 HTML；所有变更进入 `work/`，再走构建脚本。
- 不虚构账号、云同步、付费、数据库或社区能力。

## 3. 信息架构

### 首页

首页首屏只回答三个问题：这是哪个世界、我是否要进入、我能否继续旧局。

- 首屏：中央书法标题、月华中轴与山门；月、远山、瀑布、亭灯和梅枝仍是世界线索。
- 主动作：“进入世界”。次动作：“读取存档”。
- 第二层：作品简介、角色创建、世界观设定。原有内容与字段全部保留。
- 移动端：首屏压缩至 78dvh，标签与任务面明确进入首屏下缘，避免只有宣传画而找不到任务。

### 游戏

- 桌面剧情面由约 294px 扩至最高 680px。
- 桌面底部四项导航改为左侧薄轨，阅读与输入仍在中部偏左。
- 手机保留底栏，但剧情面扩至视口约 88%。
- 模型、地点和回合组成一条轻状态线。它只读取已有状态，不创建新事实。
- 输入条是全页折射最强的组件；剧情卡保持稳定，不随指针变形。

## 4. 材质与动效

Apple 官方指导把 Liquid Glass 定义为控件与导航的功能层，并明确反对把它铺进内容层。九霄因此只在按钮、输入条、模型胶囊与导航上使用清透材质。剧情、表单、资料与设置使用高不透明度烟纱。

网页不等于 Apple 原生 Liquid Glass。开源实现依赖 Chromium 的 `backdrop-filter: url()`，Safari 与 Firefox只能回退为普通模糊；大于约 800px 的折射面还可能造成 GPU 卡顿。因此 1.0 不引入全屏 SVG/WebGL 折射库，只实现动态高光、轻色散感与可验证的实色回退。

anime.js 固定为 `4.5.0`，仅用于后续可编排动效能力。当前首屏、消息、面板和发送反馈保持短时、可取消、无逐字打字机。动效禁区包括滚动劫持、自定义鼠标、循环彩虹、满屏常驻粒子。

## 5. 跨端规则

| 宽度/环境 | 1.0 行为 | 后续封装关注点 |
|---|---|---|
| 手机浏览器 | 底栏、88% 阅读面、安全区、16px 表单字号 | iOS 键盘与安全区；Android 返回；HarmonyOS ArkWeb 输入法 |
| 平板/折叠屏 | 宽阅读面，避免简单等比放大 | 分屏、横竖切换、展开态信息增益 |
| 桌面浏览器 | 680px 阅读面、左侧薄轨、更多世界画布 | 键盘导航、窗口缩放、滚轮与文本选择 |
| 原生 WebView | 不假定拥有原生材质 API | 文件选择、返回、深链、支付与安全存储需原生桥接 |

HarmonyOS 的设计检查要求在不同尺寸上不发生错位、截断或变形；大屏应提供更多内容而不是把手机界面放大。ArkWeb 文档还提醒 Web 容器与宿主滚动、回弹和输入法之间可能冲突。因此当前 Web 只建立响应式语义，不把“未来能封装”误称为“已通过应用市场验收”。

## 6. 渐进增强

- `prefers-reduced-motion: reduce`：取消入场、漂移和粒子。
- `prefers-reduced-transparency: reduce`：所有玻璃改为高不透明度深色面。
- 不支持 `backdrop-filter`：保持边界、层级与文本对比，不依赖模糊表达状态。
- Save-Data、低内存或低核心数设备：不创建粒子画布和发送粒子。
- 特效层始终 `pointer-events:none`。
- 山门画布按桌面与移动端分别构图，并以 WebP 打包；发布物不重复嵌入两张 2MB 级 PNG 源图。

## 7. 实施分期

### P0：结构与阅读

- 首页入界构图。
- 桌面阅读面加宽。
- 移动端阅读面扩至 88%。
- 资料与设置统一为烟纱材质。
- 修复构建脚本对旧电脑绝对路径的依赖。

### P1：材质

- 交互控件动态高光。
- 输入焦点、悬停、禁用、忙碌、错误与键盘焦点统一。
- 无透明与无模糊回退。

### P2：光与动作

- 月华与低密度尘点。
- 首页单次入场、消息段落出现、面板转场、发送短粒子。
- reduced motion、Save-Data 与低端设备降级。

### P3：暂不进入 1.0

- WebGL/SVG 真折射。
- 突破、死亡等剧情事件的粒子消散。
- 原生震动、实时活动、桌面窗口材质。

这些功能必须等规则事件、性能预算和原生壳确定后再做。现在实现只会固化错误接口。

## 8. 验收

- 390×844、430×932、1440×900 主路径检查。
- 进入游戏、读取存档、建角、发送、资料、设置、返回首页。
- 核心回归与世界书 UI 测试不受影响。
- 浏览器控制台无新增错误。
- 关闭动效、关闭透明或无 `backdrop-filter` 时任务仍可完成。
- 不调用真实模型；这轮不是长局、商店或商业化验收。

本地视觉证据可用 `node work/capture-ui.js 8771 .impeccable/review` 批量生成。脚本要求本地已有 Playwright，并复用系统 Edge，不下载独立浏览器。

## Works Cited

Apple. “Materials.” *Human Interface Guidelines*, Apple Developer, 2026, https://developer.apple.com/design/human-interface-guidelines/materials. Accessed 22 Sept. 2026.

Garnier, Julian. “Anime.js.” *GitHub*, version 4.5.0, 2026, https://github.com/juliangarnier/anime. Accessed 22 Sept. 2026.

Huawei. “HarmonyOS NEXT Design.” *HUAWEI Developers*, 2026, https://developer.huawei.com/consumer/en/design/. Accessed 22 Sept. 2026.

Mozilla. “backdrop-filter.” *MDN Web Docs*, 20 Apr. 2026, https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter. Accessed 22 Sept. 2026.

Mozilla. “prefers-reduced-motion.” *MDN Web Docs*, 2026, https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion. Accessed 22 Sept. 2026.

Roze, Riz. “Liquid Glass.” *GitHub*, 2026, https://github.com/rizzytoday/liquid-glass. Accessed 22 Sept. 2026.
