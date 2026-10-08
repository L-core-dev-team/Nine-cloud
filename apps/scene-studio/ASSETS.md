# 山门内部试点素材来源

| 元素 | 来源 | 权利与发布状态 |
| --- | --- | --- |
| 山门、门柱、屋檐、石阶、水面、雾层、花瓣 | `packages/scene-gate/src/index.ts` 中的项目程序化几何与材质 | 项目制作候选；Bird 与 LYL 尚未批准美术及公开发布 |
| 横版山水环境 | `src/assets/gate-environment-landscape.webp`；由 Codex `image_gen` 于 2026-10-04 生成，再由 FFmpeg 转为 WebP（quality 84） | 生成工具底层模型版本在本会话未公开；未使用参考图输入。服务条款与适用权利尚未核验；Bird 与 LYL 审核待完成，只能内部使用 |
| 竖版山水环境 | `src/assets/gate-environment-portrait.webp`；由 Codex `image_gen` 于 2026-10-04 生成，再由 FFmpeg 转为 WebP（quality 84） | 生成工具底层模型版本在本会话未公开；未使用参考图输入。服务条款与适用权利尚未核验；Bird 与 LYL 审核待完成，只能内部使用 |
| 构图与色彩参照 | `DESIGN.md` 与现有山门候选海报 | 内部视觉参照；既有海报的来源与许可未核实，不能据此认定衍生作品获得发布许可 |
| 字体 | 浏览器本机后备中文衬线字体 | 视频和海报不烧录文字 |
| 音频 | 无 | 导出为静音；网页声音继续由用户点击启动 |

导出视频、海报与接触表由 `scripts/export.mjs` 从同一 Three.js 场景逐帧生成。`test-results/scene-studio` 保留帧及逐文件 SHA-256。将文件移入玩家可访问目录前，必须更新媒体清单并取得同一文件的来源、许可与 Bird/LYL 收据。`JIUXIAO_BUILD_TARGET=release` 的现有门禁仍须拒绝待审内容。

环境图提示词摘要：月下山口、两侧层叠水墨山体、中央远谷、低位银蓝雾、克制的瀑布和水面月光；横版与竖版分别按目标画幅构图。画面不包含山门、建筑、人物、文字或标识。横版生成记录 `exec-7502f1c6-ec02-4054-be6f-9796ae68de9f.png`（1672×940）；竖版记录 `exec-8a01f61c-4179-454f-b2d5-dae28478a33c.png`（941×1672）。生成原图保留在 Codex `generated_images` 目录；工作树只纳入压缩后的 WebP。
