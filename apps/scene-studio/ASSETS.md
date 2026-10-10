# 山门内部试点素材来源

| 元素 | 来源 | 权利与发布状态 |
| --- | --- | --- |
| 山门、门柱、屋檐、石阶、水面、雾层、花瓣 | `packages/scene-gate/src/index.ts` 中的项目程序化几何与材质 | 项目制作候选；Bird 与 LYL 尚未批准美术及公开发布 |
| 横版山水环境 | `src/assets/gate-environment-landscape.webp`；由 Codex `image_gen` 于 2026-10-04 生成，再由 FFmpeg 转为 WebP（quality 84） | 已核验（2026-10-10）：生成模型经原图内嵌 C2PA 内容凭证直读确认为 OpenAI gpt-image（softwareAgent "ChatGPT"、claim_generator "OpenAI Media Service API"、OpenAI OpCo, LLC 数字签名）；输出所有权归用户，内部/公开/商用均允许；条件：不得冒称人工生成、不得用输出训练竞争 OpenAI 的模型、公开发布须按中国《人工智能生成合成内容标识办法》（2025-09-01 施行）加显式+隐式 AI 标识。未使用参考图输入；查证依据 `docs/acceptance/2026-10-10/scene-studio许可与真机查证结论.md`。Bird 与 LYL 审核待完成，只能内部使用 |
| 竖版山水环境 | `src/assets/gate-environment-portrait.webp`；由 Codex `image_gen` 于 2026-10-04 生成，再由 FFmpeg 转为 WebP（quality 84） | 已核验（2026-10-10）：生成模型经原图内嵌 C2PA 内容凭证直读确认为 OpenAI gpt-image（softwareAgent "ChatGPT"、claim_generator "OpenAI Media Service API"、OpenAI OpCo, LLC 数字签名）；输出所有权归用户，内部/公开/商用均允许；条件：不得冒称人工生成、不得用输出训练竞争 OpenAI 的模型、公开发布须按中国《人工智能生成合成内容标识办法》（2025-09-01 施行）加显式+隐式 AI 标识。未使用参考图输入；查证依据 `docs/acceptance/2026-10-10/scene-studio许可与真机查证结论.md`。Bird 与 LYL 审核待完成，只能内部使用 |
| 构图与色彩参照 | `DESIGN.md` 与现有山门候选海报 | 内部视觉参照；既有海报的来源与许可未核实，不能据此认定衍生作品获得发布许可 |
| 字体 | 浏览器本机后备中文衬线字体 | 视频和海报不烧录文字 |
| 音频 | 无 | 导出为静音；网页声音继续由用户点击启动 |

导出视频、海报与接触表由 `scripts/export.mjs` 从同一 Three.js 场景逐帧生成。`test-results/scene-studio` 保留帧及逐文件 SHA-256。将文件移入玩家可访问目录前，必须更新媒体清单并取得同一文件的来源、许可与 Bird/LYL 收据。`JIUXIAO_BUILD_TARGET=release` 的现有门禁仍须拒绝待审内容。

环境图提示词摘要：月下山口、两侧层叠水墨山体、中央远谷、低位银蓝雾、克制的瀑布和水面月光；横版与竖版分别按目标画幅构图。画面不包含山门、建筑、人物、文字或标识。横版生成记录 `exec-7502f1c6-ec02-4054-be6f-9796ae68de9f.png`（1672×940）；竖版记录 `exec-8a01f61c-4179-454f-b2d5-dae28478a33c.png`（941×1672）。另有同轮第三张候选 `exec-655feaac-85d1-4a51-97ab-397322287035.png`（2026-10-10 查证时意外发现，此前未记载；2,862,865 字节，SHA-256 `262a794e637332a29d05b91adbe8cb7fa4b163f28e6f63eae43badb4f79ac288`，已补录留档至 `docs/acceptance/2026-10-10/evidence/`）。生成原图保留在 Codex `generated_images` 目录；工作树只纳入压缩后的 WebP。

## AI 标识义务备忘

公开发布含本组素材（AI 生成环境图及其衍生导出物）的页面或制品时，须同时落实以下标识。此为发布前置条件，不是现在要做的事——Bird 与 LYL 审核完成前素材仍只能内部使用：

- **显式标识**：在展示界面加"部分视觉素材由 AI 生成"声明（用户可感知的文字标识）；
- **隐式标识**：保留文件级 C2PA 内容凭证与元数据，导出链中不得抹除。

依据：中国《人工智能生成合成内容标识办法》（2025-09-01 施行）及 OpenAI 条款"不得冒称人工生成"限制；详见 `docs/acceptance/2026-10-10/scene-studio许可与真机查证结论.md`。

**实施记录（2026-10-10，发布范围批准 · 一次到位含商用档）**：本组两张环境图所对应的运行包文件 `gate-moonlight.webp` / `gate-moonlight-mobile.webp` 已随 G-05 批次 3 入库，并已按《标识办法》第六条补加传播要素隐式标识（`AIGC{ContentProducer:"openai", ContentPropagator:"jiuxiao-web", ...}`，载体 RIFF XMP chunk；注入脚本 `scripts/audit/apply-aigc-propagation-labels.mjs`）。显式标识已在站点四处落地（全站页脚声明、画卷图鉴边界说明、画卷放大查看器、建角页地域画影标注，见 `apps/web/src/main.tsx`）。注意：本 studio 内的 `src/assets/*.webp` 环境图源文件仍无元数据——若后续经决策树 §4.1 把本组导出物纳入运行包，须先经同一注入脚本补加标识并重算清单哈希；真机对照（作者待办 2）仍是 scene 晋升的前置证据条件。
