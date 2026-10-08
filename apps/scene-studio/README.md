# 山门 Three.js 内部试点

这个工作区只验证一个问题：受限相机带来的空间观察，是否足以改善《九霄》的月下山门。它不读取存档，不接收玩家或模型脚本，不结算规则，也不产生剧情事实。

## 与正式站的隔离边界

本试点**不参与正式网站的任何环节**。隔离按下表逐层落实，改动前请先核对这些不变量：

| 层面 | 隔离方式 | 核验命令 |
| --- | --- | --- |
| 运行时 | 正式站 `apps/web` 不引用任何 `three` / `@jiuxiao/scene-*` | `git grep -iE "\bthree\b\|scene-gate\|scene-studio" -- apps/web/`（应无命中） |
| 构建时 | 根 `build` / `typecheck` / `test` 均带 `--filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate`，递归命令不会构建本试点 | `pnpm -r --filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate list --depth -1`（不含 scene 包） |
| 发布产物 | 正式发布清单只含 `apps/web` / `apps/api` / `packages/db`；CI 上传 artifact 亦同 | `scripts/build/write-manifest.mjs` |
| 部署配置 | `wrangler.jsonc` 路由只挂 `play.jiuxiaogame.cn`；无任何 Pages/Workers 目标指向本试点 | `git grep -n scene-studio -- '*.jsonc' '*.yml' '*.yaml'` |
| 依赖清单 | 试点包仍在 workspace 内（可单独构建），但**不被递归流程拉入** | `pnpm-workspace.yaml` |

因此：**改动本试点不得修改 `apps/web`、`apps/api` 或根脚本的排除过滤器**；确实需要时必须在 PR 中说明理由并让 Bird 与 LYL 复核。

## 运行与产物

从仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @jiuxiao/scene-gate build
pnpm --filter @jiuxiao/scene-studio dev
```

本试点只按需构建，不进入递归流程。仓库根提供两个显式入口：

```sh
pnpm typecheck:scene-pilot   # 仅类型检查本试点
pnpm test:scene-pilot        # 构建 scene-gate 并跑预览验证
```

访问 `http://127.0.0.1:5185/`。鼠标或触控拖动只在限定角度内移动相机；聚焦画面后可用方向键观察、Home 重置。场景核心位于 `packages/scene-gate/src/index.ts`；预览和逐帧导出调用同一个 `renderAt(t)`。正常预览不保留 WebGL 绘制缓冲；截图和视频导出才启用该选项。回退到静态海报时会停止动画并释放场景资源。

先运行 `pnpm --filter @jiuxiao/scene-studio export:keyframes`，审查横竖版各三张关键帧。然后运行 `pnpm --filter @jiuxiao/scene-studio export:all`。后者以 30 FPS 导出 8 秒静音 MP4、首帧 WebP、12 格接触表、关键帧及逐文件 SHA-256 清单。脚本用独立回环端口启动临时预览，并用 `ffprobe` 验证编码、画幅、帧率、帧数、时长和静音流，再完整解码视频。原始 480 帧和详细报告留在忽略目录 `test-results/scene-studio/`；精简成果放在 `apps/scene-studio/artifacts/`。需要本机 FFmpeg/ffprobe；浏览器截图需 Playwright Chromium。导出过程调用模型 0 次；本次代码编写的模型 token 数无法从会话取得，清单明确记为未知。

`pnpm --filter @jiuxiao/scene-studio verify:preview` 检查鼠标/键盘观察、重置、无效输入、画幅切换期间的过期贴图失败、系统减动、WebGL 启动失败与上下文中断后的海报回退。导出脚本检查乱序时间跳转、未处理异步错误与 `t=0`、`t=8` 的逐像素一致性。外部媒体、音频与字幕均未加入。素材来源见 `ASSETS.md`。

## 第三轮镜头规格

镜头任务：先让观者读到山门阈限，再看清石阶怎样从门槛落向水面；月亮与远山负责地点和尺度，雾与花瓣只补充纵深。镜头保持单一中轴关系，不切镜、不变焦、不加入人物、字幕、声音或玩法事实。横竖画幅各自构图，不依赖中心裁切。

本轮改动：石阶延长并向近景渐宽；下方改为较薄的石质基座，让踏面层级可见；门楼增加承托梁，色彩转为冷灰石色；水边碎石缩小，避免形成大块前景平台。8 秒镜头只增加有限横移，雾与花瓣仍慢速循环。

## 当前审查结论

**工程候选，仍不适合接入玩家页面。** 横竖关键帧和接触表显示，石阶现在形成连续路径并接近水面，前一轮像浮板的宽平台问题已减轻。门楼仍是程序化几何，与水墨远景存在可见的材质差异；这轮只能算结构和构图改进，不能视为美术验收。素材许可未核实，Bird 与 LYL 尚未审核，也没有 Android/iOS 真机五分钟性能对照。

已通过：场景包和工作台构建、仓库级 typecheck、鼠标与键盘观察、重置、无效尺寸与时间、画幅切换中的过期贴图失败、系统减动、WebGL/Canvas 初始化失败和上下文丢失回退。导出脚本逐帧检查未处理错误、循环端点像素一致性、MP4 元数据、完整解码、黑帧和原始帧接缝 SSIM。横竖视频均为 H.264、yuv420p、30 FPS、240 帧、8 秒、无音轨。首尾原始帧 SSIM 为横版 0.9806、竖版 0.9781；相邻帧分别为 0.9783、0.9784。一次全量导出耗时 86 秒，运行在 Playwright 软件 WebGL。npm 官方审计端点返回 140 个依赖、0 个已知漏洞。生产构建入口约 225 KB（71 KB gzip），按需载入的 3D chunk 约 589 KB（151 KB gzip）；3D 模块仍较大，不能据此推断真机帧率、内存或温升。

横版视频约 624 KB，竖版约 712 KB。详细文件摘要和源图摘要在 `artifacts/manifest.json`。所有图像和视频仍标记为内部候选；不能移动到玩家可访问目录。接入前仍需来源/许可审查、Bird 与 LYL 对同一摘要的批准，以及目标 Android/iOS 真机测试。四类场景、玩法演出和玩家自动成片均不在本试点范围内。
