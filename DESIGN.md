---
name: 九霄 WEB
description: 夜山为世界画布，玉玻璃承载行动，烟纱承载长时阅读。
colors:
  night-abyss: "#030a11"
  night-soft: "#071421"
  moon-paper: "#f1ece5"
  mist-text: "rgba(205, 220, 232, 0.72)"
  peach-light: "#efa8cb"
  seal-red: "#a73846"
  reading-text: "#edf1f4"
typography:
  display:
    fontFamily: "JXPoem, STKaiti, KaiTi, serif"
    fontSize: "clamp(74px, 9vw, 136px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "JXPoem, STKaiti, KaiTi, serif"
    fontSize: "clamp(24px, 3vw, 34px)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.04em"
  body:
    fontFamily: "JXReading, Songti SC, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 2
  label:
    fontFamily: "JXUI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  oath: "7px"
  control: "11px"
  action: "14px"
  surface: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  portal-primary:
    backgroundColor: "{colors.night-soft}"
    textColor: "{colors.moon-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "0 20px"
    height: "44px"
  tab-active:
    backgroundColor: "rgba(229, 206, 220, 0.13)"
    textColor: "{colors.reading-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "46px"
  reading-surface:
    backgroundColor: "{colors.night-soft}"
    textColor: "{colors.reading-text}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: 九霄 WEB

## Overview

**Creative North Star: "月下入界山门"**

夜山不是背景装饰，而是持续存在的世界画布。月、雾、山、水、梅和朱印构成视觉语法。界面只在玩家需要行动时显形。清透玉玻璃用于导航、按钮和输入；高不透明烟纱用于剧情、表单和资料。

系统追求克制的仪式感。首屏允许一个明确的入界时刻。进入游戏后，视觉重心立即转向阅读和行动。长时界面不使用持续炫光、逐字打字机或大面积折射。

**Key Characteristics:**

- 深蓝黑夜山承担主要氛围，月白承担正文和题字。
- 桃粉只用于细微光感、焦点和边界；朱红只作为印记。
- 控件通透，内容稳定；材质强度服从任务时长。
- 所有效果都具有无动效、无透明和低性能回退。

## Colors

色彩来自夜山、月雾、桃花与朱印。主画面保持低饱和，强调色因稀少而有效。

### Primary

- **桃月微光**：用于焦点、主动作边界、选区和少量互动反馈。

### Secondary

- **朱印红**：只用于品牌印记和极少量语义强调。

### Neutral

- **深夜渊**：页面基底和无透明回退面。
- **夜山烟青**：剧情卡、表单和资料面的稳定底色。
- **月纸白**：题字、主标题和最高层级文本。
- **山雾灰蓝**：次要文字、边界和非主状态。

**The Rare Accent Rule.** 桃粉和朱红不承担大面积背景。任何单屏都应以夜色和月白为主。

## Typography

**Display Font:** JXPoem，以华文楷体和楷体为回退。

**Body Font:** JXReading，以宋体为回退。

**Label Font:** JXUI，以系统无衬线字体为回退。

题字负责世界观与仪式感。宋体负责长时阅读。无衬线只负责操作和状态，避免把游戏写成后台仪表盘。

### Hierarchy

- **Display**：只用于首页“九霄”题字。
- **Headline**：用于页面标题、资料标题和模态框主要标题。
- **Body**：用于剧情、世界资料和说明，默认宽松行距。
- **Label**：用于按钮、导航、状态和短提示。

**The Three Voices Rule.** 题字、正文和操作各用一种文字声音；不要把楷体铺到设置表单，也不要用无衬线替代剧情正文。

## Layout

首页采用中轴构图。山门、月华、题字和主动作位于同一纵轴。移动端 hero 为 78dvh，让下层标签和当前任务在首屏下缘可见；桌面端 hero 为完整视口。内容宽度使用 `min(1120px, 100vw - 48px)`。

游戏页以阅读为中心。桌面剧情面最高约 680px，置于中部偏左，功能导航成为左侧薄轨。移动端剧情宽度约为视口的 88%，并保留底部导航、安全区和至少 44px 的触控目标。大屏增加画布和信息余量，不把手机界面简单等比放大。

间距以 4px 为基础节奏。常用间隔为 8、12、16 和 24px。表单与长文保持稳定垂直流，不使用滚动劫持。

## Elevation & Depth

深度主要来自背景景深、半透明叠层、细边界和内侧月光，而不是厚重投影。短时控件可以使用低幅环境阴影；剧情卡和表单保持稳定，不随指针折射。模态框使用背景模糊隔离任务，但不牺牲正文对比。

### Shadow Vocabulary

- **玉玻璃控件**：`0 12px 34px rgba(0,0,0,.20)`，用于入口按钮和短时操作。
- **烟纱页面**：`0 28px 72px rgba(0,0,0,.30)`，用于首页下层页面。
- **内侧月线**：`inset 0 1px 0 rgba(255,255,255,.07)`，用于解释材质边缘。

**The Content Stability Rule.** 动态高光只属于交互 chrome。剧情、资料和表单不能因指针位置产生形变。

## Shapes

界面使用轻柔圆角和一像素低对比边界。小提示为 7px，标签控件为 11px，主动作约 14px，页面与主要容器为 16px。圆角用于表达湿润玉石与雾面容器，不使用胶囊泛滥，也不使用硬直角科技面板。

## Components

### Buttons

- **Shape:** 主动作使用 14px 圆角和至少 44px 高度。
- **Primary:** 深夜透明底、月白文字、桃粉边界提示；首屏只保留一个主动作。
- **Hover / Focus:** 上移不超过 2px。边界变亮。键盘焦点必须清晰可见。
- **Secondary:** 降低文字和边界对比，但保持同等触控面积。

### Cards / Containers

- **Corner Style:** 主要表面使用 16px 圆角。
- **Background:** 长文使用高不透明夜山烟青；短控件才允许更透明。
- **Shadow Strategy:** 以环境阴影和内侧月线形成层级。
- **Border:** 一像素灰蓝边界，不使用高亮白框包围全部内容。
- **Internal Padding:** 常用 24px；较大页面随视口在 28–56px 之间变化。

### Inputs / Fields

- **Style:** 输入条是游戏页材质最强的可操作表面，但背景仍足够深以保证文字可读。
- **Focus:** 桃粉 caret、边界增强和稳定的键盘焦点。
- **Error / Disabled:** 通过文案、边界和明度同时表达，不只依赖颜色。

### Navigation

首页三标签使用单一玉玻璃容器。活动项以浅月粉内层区分。桌面游戏导航是左侧薄轨；移动端回到底栏。图标使用自绘 SVG 或 CSS 几何，不使用 emoji 作为正式界面图标。

### 入界山门

山门是首页专属的签名构图。桌面和移动端使用独立 WebP 构图。题字和按钮保持真实 HTML，以保证响应式、可访问性和后续本地化。游戏页不重复山门仪式，继续使用原夜山阅读背景。

## Do's and Don'ts

### Do:

- **Do** 把透明度与动效当作渐进增强，确保实色回退仍能完成任务。
- **Do** 为长文保留宋体、宽松行距和稳定背景。
- **Do** 在手机上优先保证安全区、键盘、滚动和 44px 触控目标。
- **Do** 使用自绘 SVG 或 CSS 图形维持同一图标语言。

### Don't:

- **Don't** 把液态玻璃铺进剧情正文、世界资料或长表单。
- **Don't** 使用满屏常驻粒子、循环彩虹、逐字打字机、自定义鼠标或滚动劫持。
- **Don't** 虚构地点、存档、账号、云同步或商业能力来填充界面。
- **Don't** 把 Apple、Huawei、Claude 或开源演示的品牌外观直接复制为《九霄》的身份。
