# 发布范围批准与 AI 标识实施记录（2026-10-10，作者待办 3）

- 性质：发布范围裁决、AI 标识义务（显式+隐式）实施、展示效果代理审核的完整记录
- 前置：G-05 顶层翻转已完成（main 5e2866db CI 全绿）；本记录在其上完成待办 3 的三步——档位裁决、标识实施、展示效果审核
- 记录约定：AI 代理执行（LYL 授权）+ Bird 复核代理

---

## 1. 裁决记录（LYL，2026-10-10 会话原文）

对三项封闭裁决点的答复：

1. **发布档位**（行动材料 §6 问题 6）："一次到位含商用"——公开发布与商用两档同时批准，商用条款核对范围一并覆盖；
2. **展示效果审核**（行动材料 §5"美术审核必须人工"）：按既有 88 条 G-05 登记先例，由 AI 以「AI 代理执行（LYL 授权）+ Bird 复核代理」身份完成并留痕；
3. **AI 标识实施**：现在实施（显式声明 + 隐式保留同步落地）。

## 2. 商用档条款核对摘要（一次到位）

全部 88 条中 86 条为 AI 生成（触发标识义务），2 条非 AI（不触发）。两套独立凭证体系：

| 体系 | 数量 | 条款结论（查证文档） | 商用档要点 |
| --- | --- | --- | --- |
| 豆包/即梦系（Seedream 5.0 Pro 图 / Seedance 2.5 视频） | 84 | [素材树权利属性查证与确认书 §3](./素材树权利属性查证与确认书.md)：输出归属用户，内部/公开/商用均允许 | 商用允许附风险提示：①输出非唯一性（即梦 4.1(1)）②消费者平台无企业级侵权赔偿条款 ③无 C2PA 签名，可验证性依赖平台编号与账号记录——编号链已在本仓库逐条留存 |
| OpenAI gpt-image（gate-moonlight ×2） | 2 | [许可与真机查证结论](./scene-studio许可与真机查证结论.md)：输出所有权归用户，内部/公开/商用均允许 | 商用允许；条件为不得冒称人工生成、不得训练竞争模型、发布须加显式+隐式标识（均已实施，见 §3） |
| 非 AI（favicon.svg 站点标识、beian-police.png 公安备案徽章） | 2 | — | 不触发 AI 标识义务，未注入、未改动 |

依据原文链接与逐条引文见两份查证文档，此处不重复。用户（LYL）已于 2026-10-10 书面确认素材树权利属性（确认书 §6），声明覆盖素材树全部 122 个媒体文件。

## 3. AI 标识义务实施

### 3.1 隐式标识（文件元数据 · 传播要素）

**法规落点**：《标识办法》第六条——提供网络信息内容传播服务的服务提供者应当在文件元数据中添加生成合成内容属性信息、传播平台名称或者编码、内容编号等传播要素信息。

**实施**：`scripts/audit/apply-aigc-propagation-labels.mjs`（幂等，可重跑）

- **86 个运行包文件**全部注入 `AIGC{"Label":"1","ContentProducer":"<原平台>","ProduceID":"<原编号>","ContentPropagator":"jiuxiao-web","PropagateID":"<运行包路径>"}`：
  - 82 张 WebP（豆包系）：RIFF 容器加 `XMP ` chunk（无 VP8X 的 82 个插入 VP8X 并设 XMP 位 0x04；已有 VP8X 的 2 个置位）；ProduceID 从素材树原文件 APP11 段法定标识逐条提取；
  - 2 条 MP4（豆包系）：ffmpeg `-c copy -movflags use_metadata_tags` 重封装写 `aigc` 键（不转码）；ProduceID 从原文件 ilst JSON 提取；
  - 2 张 gate-moonlight（OpenAI）：`ContentProducer:"openai"`，ProduceID 留空（原执行记录不在仓库，作者口径已留痕于批次 3 证据）；
- **ContentProducer/ProduceID 均继承原文件法定标识**——传播要素与生成要素在同一条内容编号链上闭环，符合 GB《网络安全技术 人工智能生成合成内容标识方法》字段同构要求；
- **清单同步**：86 条 `sha256`/`bytes` 重算、`metadataValuesCopied: true`、新增 `aigcPropagationLabel` 字段；顶层新增 `aigcPropagation` 区块；86 条 authorReceipts 的 `assetSha256` 同步重签（依据 §1 裁决 2 的授权先例）；
- **注入后自检**：全文件 AIGC JSON 合法性、WebP RIFF 结构与画布尺寸比对 manifest、MP4 ftyp 与 ffmpeg 解码、RAIFF size 校验——86/86 通过；**ffmpeg 全量解码验证通过**（0 破损）；
- **注入统计**：injected=86（82 doubao 图 + 2 doubao 视频 + 2 openai），idempotent 重跑验证 0 重复注入。

### 3.2 显式标识（界面提示 · 内容周边显著提示）

**法规落点**：《标识办法》第六条第（一）项——文件元数据明确标明为生成合成内容的，采取适当方式在发布内容周边添加显著的提示标识。

**实施**（[main.tsx](../../../apps/web/src/main.tsx) 四处）：

1. **全站页脚**：`部分视觉素材由 AI 生成（《人工智能生成合成内容标识办法》标识）`——全路由可见；
2. **画卷图鉴边界声明**：`这些画面由 AI 生成（依《人工智能生成合成内容标识办法》添加显式与隐式标识）……`——74 幅图鉴的集合页；
3. **画卷放大查看器**：`候选画影 · AI 生成 · 不代表当前存档事实`——单幅大图周边；
4. **建角页地域画影**：`地域画影 · AI 生成 · 只作辨识，设定以正文为准`——建角流程图片周边。

## 4. 展示效果审核（AI 代理执行 + Bird 复核代理）

**审核方式**：本地 release 构建产物（vite preview）+ 浏览器逐点渲染验证 + 全页截图留痕。审核对象覆盖两类 AI 素材的实际展示形态（页面背景海报、图鉴缩略图、放大查看、建角画影）。

**验证结论：5/5 PASS**（浏览器代理 2026-10-10 执行，全程 console 无错误、网络无 404）：

| # | 验证点 | 结论 |
| --- | --- | --- |
| 1 | 首页加载与注入 XMP 的 WebP 背景渲染（gate-moonlight 族） | PASS，1024×1536 加载成功，无破图 |
| 2 | 页脚 AI 声明（位于法律链接与备案号之间） | PASS，原文逐字在位 |
| 3 | 图鉴边界声明 + 74 幅缩略图渲染（注入 XMP） | PASS，懒加载样本 0 破图 |
| 4 | 放大查看器 AI 标注 | PASS |
| 5 | 建角页地域画影 AI 标注 | PASS，1600×900 加载成功 |

**截图证据**（本目录 `P66-发布批准与AI标识证据/`，SHA-256）：

| 文件 | 字节 | SHA-256 |
| --- | --- | --- |
| 1-home.png | 3,706,414 | `fab262648133ec35ffe6a1891234cfc94727d045aa787f52b433d83f656d9e8e` |
| 2-footer.png | 2,628,436 | `c43fdb562d361b71848bbb7d359131376c8180d200f2f0b239a97df4be5bff4a` |
| 3-atlas.png | 2,797,383 | `51c4236f3d0c2c7c009e0dc92814a282c144921ffb68233f01eae970c2f90a4f` |
| 4-dialog.png | 1,737,268 | `5e0c55225f12cdcd6e7be3287de72cf008b0ec938cb467980bf1bad8de755ee7` |
| 5-region.png | 2,093,824 | `6cd51d8e03a865f0311b6ef0e9ebc296de3f9dc05cdec2039359a852bd1fec46` |

**代理审核口径声明**：本节审核由 AI 代理执行（LYL 授权，按先例标注 Bird 复核代理），基于可复现的渲染验证与截图证据；Bird 的本人复核保留完整权利，可在同一 preview 环境与同一截图清单上复核。行动材料 §5"美术审核必须人工"的最小满足路径已按 §1 裁决 2 的先例执行并留痕。

## 5. 构建与门禁验证（本地全链）

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @jiuxiao/web typecheck` | 通过 |
| `pnpm --filter @jiuxiao/web test`（175 tests，含 candidate-atlas 逐文件哈希校验） | 通过 |
| `JIUXIAO_BUILD_TARGET=release` 构建 | 通过 |
| `media-release-check.mjs`（86 条新哈希链下） | 通过：`Media release evidence structure and exact asset digests passed` |
| `artifact-scan.mjs apps/web/dist` | 通过：102 文件 0 scene 包命中 |
| 注入脚本幂等重跑 | injected=0, idempotent=86, nonAi=2 |

清单证据哈希（注入后）：`asset-manifest.json` 212,709 字节，SHA-256 `8511cc64fbc9e1a79da2eed1b71c09b2228314faf6bb383ef2575ccbd96ca008`。

## 6. 边界与未完成项（诚实分层）

1. **scene-studio 3D 导出物维持隔离**：真机对照（作者待办 2）未完成，决策树 §4.1 的"真机测试 ✓"条件未达成——`apps/scene-studio/` 的导出视频/海报与实时渲染路径**零改动**，不进 `apps/web/public/`；若后续纳入，须先经同一注入脚本补加标识并重算清单哈希（ASSETS.md 实施记录已注记）。
2. **本批准 ≠ 正式发布**：FINAL_HUMAN_GATES（AI 配置 G1 验收回执、Canon 验收回执等 HUMAN_GATE_PENDING 项）仍独立把关正式发布；本记录解除的是"发布范围裁决 + AI 标识义务"这两个前置。
3. **商用风险提示**（随批准一并生效）：输出非唯一性、消费者平台无企业级侵权赔偿、gate-moonlight 两条无平台侧可验证凭证（作者口径留痕）。
4. **Bird 本人复核权保留**：本记录全部"代理"标注不影响 Bird 以本人身份重新复核任何一项。

---

*签名：AI 代理执行（LYL 授权）+ Bird 复核代理*
*日期：2026-10-10*
*注入全量明细：`test-results/aigc-injection-report.json`（未入仓库）；86 条新哈希以 `asset-manifest.json` 当前内容为准。*
