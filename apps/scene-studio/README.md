# 山门 Three.js 内部试点

这个工作区只验证一个问题：受限相机带来的空间观察，是否足以改善《九霄》的月下山门。它不读取存档，不接收玩家或模型脚本，不结算规则，也不产生剧情事实。

## 运行与产物

从仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @jiuxiao/scene-gate build
pnpm --filter @jiuxiao/scene-studio dev
```

访问 `http://127.0.0.1:5185/`。鼠标或触控拖动只在限定角度内移动相机。“重置视角”恢复中轴。场景核心位于 `packages/scene-gate/src/index.ts`；预览和逐帧导出调用同一个 `renderAt(t)`。关窗时清理几何体、材质、纹理和 WebGL 上下文。

先运行 `pnpm --filter @jiuxiao/scene-studio export:keyframes`，审查横竖版各三张关键帧。然后运行 `pnpm --filter @jiuxiao/scene-studio export:all`。后者以 30 FPS 导出 8 秒静音 MP4、首帧 WebP、12 格接触表、关键帧及逐文件 SHA-256 清单。原始 480 帧和详细报告留在忽略目录 `test-results/scene-studio/`；精简成果放在 `apps/scene-studio/artifacts/`。编码需本机 FFmpeg；浏览器截图需 Playwright Chromium。导出过程调用模型 0 次；本次代码编写的模型 token 数无法从会话取得，清单明确记为未知。

`pnpm --filter @jiuxiao/scene-studio verify:preview` 检查拖动、重置、系统减动、WebGL 启动失败与上下文中断后的海报回退。导出脚本检查乱序时间跳转与 `t=0`、`t=8` 的逐像素一致性。外部媒体、音频与字幕均未加入。素材来源见 `ASSETS.md`。

## 当前审查结论

**工程候选，视觉未通过。** 三维门柱、石阶、山体与水面的前中后景能表现视差，但关键帧仍显得平直、几何化。现有候选海报的水墨山体、瀑布、雾和门楼细节没有被充分转译。接触表中的 8 秒变化非常轻微，尚不能证明它比当前平面氛围层更有空间观察价值。按试点约束，现阶段不接入玩家页面，也不替换四场景素材。

若继续美术迭代，先由作者确认三张关键帧的构图、山形和门楼语言，再重新导出。即使美术通过，仍需 Android 与 iOS 真机各五分钟的帧时间、内存、温升、加载量与输入响应对照。资源移入 `apps/web/public` 后，媒体发布清单必须逐文件登记来源、许可、摘要和 Bird/LYL 对同一摘要的批准；现有发布门禁不得绕过。
