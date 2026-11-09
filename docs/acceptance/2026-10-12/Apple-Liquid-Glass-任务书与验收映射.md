# Apple Liquid Glass 任务书与验收映射

记录日期：2026-10-12（Asia/Shanghai）

提出人：刘佑林（本项目负责人）

适用代码线：UI 1.0 Pro；本文件只记录要求和核验边界，不代表生产发布签收。

## 来源与项目边界

本记录来自负责人在本项目对话中直接提供的《Apple Liquid Glass（液态玻璃）官方规范实现任务书》。完整原文已保存为 [原始任务书](../../design/Apple-Liquid-Glass-原始任务书.md)。这里保留官方链接、要求摘要、实现映射和验收限制。

当前项目是 React、TypeScript、Vite 网页。网页不能调用 SwiftUI 的 `.glassEffect`、`GlassEffectContainer`、`.interactive()` 等系统材质 API，也不能精确复刻系统级环境光、设备姿态和原生滚动边缘。实现目标是尊重 Apple 的层级原则，并以网页能力做可运行、可回退的近似。

## 官方资料

1. [Liquid Glass 技术总览](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)
2. [Human Interface Guidelines：Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
3. [Applying Liquid Glass to Custom Views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
4. [WWDC25：Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
5. [WWDC25：Get to Know the New Design System](https://developer.apple.com/videos/play/wwdc2025/356/)
6. [WWDC25：Build a SwiftUI App with the New Design](https://developer.apple.com/videos/play/wwdc2025/323/)

资料访问方式：WWDC25 三场视频的官方文字稿已读取；Materials 和 SwiftUI 自定义视图资料通过 Apple 官方同址的索引正文读取。技术总览直连抓取只返回 JavaScript 壳，2026-10-13 已通过 Apple 官方同址的完整索引正文补读其介绍、采用路径、示例、设计原则和视频章节。没有将仅有链接或页面壳当作已读正文。

## 规范要求与实现映射

| 要求 | 本项目实现 | 验收边界 |
|---|---|---|
| 玻璃透射真实背景 | Regular 与 Clear 材质采用不同模糊、饱和度和底色；固定导航和首页入口随背后图像滚动/变化 | 网页背景滤镜是浏览器合成，不是 Apple 系统材质引擎 |
| 玻璃边缘与厚度 | 共享边缘高光、内侧亮边、环境反射和克制阴影；SVG `feTurbulence`、`feGaussianBlur`、`feDisplacementMap` 为局部背景提供折射近似 | Edge 对首页主入口上的 SVG backdrop filter 有文字合成缺陷；首页入口保留透射与光学边缘层，菜单和存档等稳定区域保留局部 SVG 折射 |
| 环境适应 | Regular 用于有文字的导航、菜单和工具层；Clear 用于山门图像上的悬浮入口；昼夜主题分别提供色值和高光 | 明暗背景、当前静态场景和控件背景覆盖模拟浏览器验收，不代表所有显示器校准 |
| 自然交互 | 悬停/焦点边缘光、按压反馈、选中状态；动画时间短且没有持续抖动 | 用鼠标、键盘和触摸模拟；不是实体设备帧率、温度或功耗测试 |
| 空间层级 | 导航、弹出菜单、浮动工具、世界设定分类和首页入口使用玻璃；长文、设置表单和资料阅读面保持稳定内容底色 | 每个页面仍需随新内容持续复核，禁止为了统一而铺满玻璃 |
| 兼容与无障碍 | SVG filter 不可用时退回 CSS 模糊；浏览器不支持 backdrop filter 或系统要求降低透明度时使用稳定实色；支持减少动态、高对比和强制颜色偏好 | 回退会降低玻璃透射，这是用户系统偏好或浏览器能力触发的有意行为 |
| 正式/样板分离 | `/__liquid-glass` 仅在 Vite 开发环境动态加载；正式构建不含样板组件或其专属 CSS，生产访问该路径返回正式首页 | 生产路由与静态资源由独立守卫脚本核验；这不是生产域名已更新的证据 |

## 层级与材质约定

- **Regular Glass**：用于固定导航、菜单和有文字的功能层，首先保证易读。
- **Clear Glass**：用于山门背景之上的少量入口控件，优先显示图像和环境光。
- 文章、人物资料、设置内容和长篇阅读区域不默认使用液态玻璃。
- 不以截图或静态 PNG 作为运行材质；所有材质由 CSS/DOM 根据浏览器实时背景合成。
- SVG 折射只在较小交互表面运行。浏览器对局部合成表现异常的元素使用安全的背景透射与边缘光退化路径，确保标题、正文和操作完整绘制。

## 运行与复核

专属样板使用 `pnpm test:e2e:liquid-glass` 在开发服务器运行，覆盖明暗主题、窄屏与桌面、滚动、菜单键盘/触摸、降低透明度、对比度和局部折射像素变化。正式资源隔离与 `/__liquid-glass` 路由由 `pnpm test:e2e:liquid-glass-production` 检查：正式资源不得包含 `LiquidGlassDemo` 或 `.liquid-lab`，正式入口必须绘制完整，系统偏好切换时背景滤镜必须按要求退化。

最终本地验收记录和截图 SHA-256 见同目录的 [UI 1.0 Pro 与 Liquid Glass 验收记录](UI1.0Pro-LiquidGlass-验收记录.md)。模拟浏览器不是实体手机或不同 GPU 的验收；合并、生产部署和上线后的真实访问需分别记录。

## 与 Apple 原生效果的差异

浏览器 CSS 不具备 Apple 系统材质的完整采样、光线响应、深度、设备运动、原生窗口/滚动集成和能耗调度。本项目不宣称达到像素级或物理级复刻。SVG 位移滤镜的效果取决于浏览器合成实现；本项目检测其能力并保留回退，且对已发现的 Edge 文字合成问题采用逐控件退化。此限制不妨碍普通浏览器在兼容路径下显示正式首页和使用功能。

## 组件复用

主应用在 `main.tsx` 导入 `style.css` 和 `components/liquid-glass.css`，并只挂载一份 `LiquidGlassFilters`。沿用相同功能层和主题令牌复用组件：

```tsx
import { LiquidGlass } from './components/LiquidGlass';

<LiquidGlass as="button" type="button" variant="clear" className="portal-enter" onClick={enterWorld}>
  <span>进入世界</span>
</LiquidGlass>
```

`variant="regular"` 适用于带文字的导航或菜单；`clear` 适用于图像之上的少量入口。组件保留原生按钮/导航的属性和事件，不新增运行依赖。它提供指针位置高光、共享光学层和克制按压反馈；正式表面是否启用 SVG 位移由统一 CSS 选择器决定，并非每个实例都强制滤镜。多项工具在同一父材质中分组，子项保持轻薄；这只是网页分组和形态过渡，不等同原生 `glassEffectUnion` 的几何融合。
