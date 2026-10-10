# P66 行动材料：scene-studio 试验的美术许可/真机门槛（2026-10-10）

- 裁决人：LYL + Bird
- 编制：AI 代理执行（LYL 授权）+ Bird 复核代理
- 前置状态：PR #66「[scene-studio] Isolated Three.js mountain-gate pilot」已于 2026-10-09 合并进 main（`26fd958`）；试验素材已在默认分支上，处于**内部候选、待审**状态
- 本材料对应遗留项③：#66 scene-studio 试验的美术许可/真机门槛（PR 自列的三个人工后续：来源/许可核验、真机测试、artifacts 去向）

---

## 1. 现状快照

### 1.1 已合并的现实

PR #66 已于 2026-10-09 合并进 main（`26fd958`），内容包括：

| 内容 | 位置 | 说明 |
|---|---|---|
| 自包含 Vite 工作台 | `apps/scene-studio/` | 不读存档、不收玩家或模型输入、不结算规则、不产生剧情事实（`apps/scene-studio/README.md:3`） |
| 程序化 Three.js 场景核心 | `packages/scene-gate/src/index.ts` | 预览与逐帧导出共用同一 `renderAt(t)`（README.md:36） |
| 导出成果 | `apps/scene-studio/artifacts/` | 横竖版 8 秒静音 H.264（yuv420p、30 FPS、240 帧）、首帧 WebP、12 格接触表、横竖各 3 张关键帧、逐文件 SHA-256 清单 `manifest.json` |
| 规模 | 29 文件，其中 14 个素材二进制 | `artifacts/manifest.json:2-4` 顶层标记 `status: "internal-candidate"`、`sourceAndLicense: "unverified"`、`authorApproval: "pending"` |

**素材已随合并进入默认分支**——当前状态不是"待合并的候选"，而是"已入库、但被工程手段隔离在玩家可达范围之外"。以下三层防线即隔离的全部现行事实。

### 1.2 三层防线（文件行号级引用）

**防线一：素材不在玩家可达目录。**
scene-studio 素材物理位于 `apps/scene-studio/src/assets/`（2 张环境 WebP，`artifacts/manifest.json:38-49` 登记 SHA-256）与 `apps/scene-studio/artifacts/`（12 个导出物，`manifest.json:74-135`），均不在 `apps/web/public/` 内。而媒体门禁的全树扫描范围仅限 `apps/web/public`（`scripts/audit/media-release-check.mjs:28-30`，注释 SEC-05：manifest 之外的任何媒体文件都必须 fail release build）——scene 素材既不在扫描范围内，也不在清单内。`apps/scene-studio/ASSETS.md:12` 自证约束：「将文件移入玩家可访问目录前，必须更新媒体清单并取得同一文件的来源、许可与 Bird/LYL 收据。`JIUXIAO_BUILD_TARGET=release` 的现有门禁仍须拒绝待审内容。」

**防线二：构建/发布流水线不经过 scene 包。**
- 根 `package.json:12/13/16`：`typecheck`、`test`、`build` 三条递归命令均带 `--filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate`，scene 包不会被任何递归流程构建；`package.json:14-15` 提供显式单独入口 `typecheck:scene-pilot` / `test:scene-pilot`。
- `scripts/build/write-manifest.mjs:29-31`：发布产物清单只打包 `apps/web` / `apps/api` / `packages/db` 三份 build-manifest.json，无 scene 包目标。
- `apps/scene-studio/README.md:11-15` 隔离五层表（运行时无 `three` 引用、构建过滤、发布清单、wrangler 路由仅挂 `play.jiuxiaogame.cn`、workspace 按需构建）；README.md:17：「改动本试点不得修改 `apps/web`、`apps/api` 或根脚本的排除过滤器；确实需要时必须在 PR 中说明理由并让 Bird 与 LYL 复核。」

**防线三：release 构建媒体门禁 fail-closed（`LICENSE_PENDING` 机制）。**
- `apps/web/vite.config.ts:24-31`：`JIUXIAO_BUILD_TARGET` 只认 `release` / `cloudflare-preview` / `test` 三个值（:28 `KNOWN_TARGETS`），未知值（含拼写错误如 `relese`）直接 throw，杜绝静默跳过审计。
- `apps/web/vite.config.ts:57-62`：`media-release-gate` 插件仅在 `BUILD_TARGET === 'release'`（:49）时于 `buildStart` 读取 `apps/web/public/scenes/candidate/asset-manifest.json` 并调用 `requireReleasedMedia`。
- `scripts/audit/media-release-check.mjs` 检查链：
  - :8 清单顶层 `sourceAndLicense !== 'verified'` 或 `authorApproval !== 'approved'` → **抛 `LICENSE_PENDING`**；
  - :12 单条目 `licenseStatus !== 'approved'` 或缺 64 位 `licenseEvidenceSha256` → **抛 `LICENSE_PENDING`**；
  - :13-14 要求 Bird **且** LYL 两份 `authorReceipts`（`assetSha256` 与条目一致、`status: 'approved'`）→ 否则抛 `MEDIA_AUTHOR_APPROVAL_PENDING`；
  - :15-16 对磁盘文件实算 SHA-256 比对 → `MEDIA_DIGEST_MISMATCH`；
  - :20-30 遍历 `apps/web/public` 全树，任何未登记媒体（webp/png/jpg/svg/mp4/webm/mp3/wav/ogg/m4a）→ `UNLISTED_MEDIA_ASSET`。
- `.github/workflows/ci.yml:77-88`：CI 步骤「Prove the release-target build stays fail-closed while media licenses are pending」以 `JIUXIAO_BUILD_TARGET: release` 构建 `@jiuxiao/web`，**断言构建必须失败**且日志含 `LICENSE_PENDING`；注释（:78-81）明示清单核验闭合（BIRD-04 / G-05 closure）后须把该步翻转为"必须成功"。
- 单测：`scripts/audit/media-release-check.test.mjs` 锁定上述检查行为。

### 1.3 scene-studio 素材是否在媒体清单内（已核对：不在）

`apps/web/public/scenes/candidate/asset-manifest.json` 当前共 **84 个条目**（场景候选 8 = 4 场景×桌面/移动画幅、循环视频 2、图鉴类 74），全部来源于作者素材文件夹（`01-场景海报`…`11-战斗场景`）。**无任何 scene-studio 路径**——scene-studio 素材不在媒体清单内。清单顶层仍为 `sourceAndLicense: "unverified"`、`authorApproval: "pending"`，与 G-05 结论一致：「不得因媒体已入哈希清单而解除 `LICENSE_PENDING`」（`docs/acceptance/2026-10-04/P1-author-signed-evidence/G05-媒体登记与真机验收.md:63`）。

scene-studio 自己的 `apps/scene-studio/artifacts/manifest.json` 使用了与门禁相同的词汇（internal-candidate / unverified / pending），但它**未接入任何门禁**——门禁只读 `apps/web/public/scenes/candidate/asset-manifest.json` 这一个文件（`vite.config.ts:60` 路径硬编码）。

---

## 2. 条件一：来源/许可核验工作表

### 2.1 缺失信息清单

依据 `apps/scene-studio/ASSETS.md:6-8,12-14` 现状记录：

| # | 缺失信息 | 现状记录 | 缺口性质 |
|---|---|---|---|
| 1 | **生成模型名称与版本** | 只记「Codex `image_gen`」；「生成工具底层模型版本在本会话未公开」（ASSETS.md:6-7） | **只有作者/操作者知道的事实**，AI 无法推断 |
| 2 | 生成日期 | 2026-10-04（ASSETS.md:6-7；`artifacts/manifest.json:67` `generatedAt`） | ✅ 已有 |
| 3 | prompt 出处记录 | ASSETS.md:13-14 有提示词摘要及两条生成记录：横版 `exec-7502f1c6-ec02-4054-be6f-9796ae68de9f.png`（1672×940）、竖版 `exec-8a01f61c-4179-454f-b2d5-dae28478a33c.png`（941×1672）；「生成原图保留在 Codex `generated_images` 目录；工作树只纳入压缩后的 WebP」 | 原图未入库；需确认可取回并留存 |
| 4 | 服务条款·内部使用 | 未核验（ASSETS.md:6-7「服务条款与适用权利尚未核验」） | 条款查证可代办 |
| 5 | 服务条款·公开发布 | 未核验 | 条款查证可代办 |
| 6 | 服务条款·商用与再授权 | 未核验 | 条款查证可代办 |
| 7 | 参照物许可 | 「构图与色彩参照 DESIGN.md 与现有山门候选海报……既有海报的来源与许可未核实，不能据此认定衍生作品获得发布许可」（ASSETS.md:8） | 待核 |
| 8 | Bird 与 LYL 美术审核 | 「Bird 与 LYL 尚未批准美术及公开发布」（ASSETS.md:5-7；README.md:50「这轮只能算结构和构图改进，不能视为美术验收」） | 必须人工 |

### 2.2 核验步骤（谁做什么）

| 步骤 | 谁 | 做什么 | 依据/产出 |
|---|---|---|---|
| S1 | **LYL** | 提供"当时是用什么模型生成的"：模型名称、版本、生成账号/订阅档位（如可考）；确认两张生成原图（exec-7502f1c6… / exec-8a01f61c…）能否取回 | 这是唯一无法代办的事实输入（ASSETS.md 明记版本"在本会话未公开"） |
| S2 | AI 代办 | 取得模型名称后检索该服务商现行服务条款，逐条摘要：输出内容的权利归属、允许用途（内部使用/公开发布/商用/再分发）、留档义务、训练数据争议条款；出具对照表（三档用途 × 条款原文引文 × 访问日期） | 摘要文档，附条款 URL 与访问日期 |
| S3 | AI 代办 | 起草 `apps/scene-studio/ASSETS.md` 补全稿：把模型名称/版本、条款结论、原图留存位置填入 :6-7 两行的空白处；：8 的参照物许可状态一并补记 | ASSETS.md 修改稿（diff 形式供审） |
| S4 | **Bird + LYL** | 对**同一份**条款摘要批准（与媒体门禁的双签收据机制对齐：`media-release-check.mjs:13-14` 要求 Bird 与 LYL 同时出具 approved 收据）；审定 ASSETS.md 补全稿 | 批准记录进入验收文档 |
| S5 | AI 代办 | 把批准记录与条款摘要归档进 `docs/acceptance/`，作为未来翻转 `LICENSE_PENDING` 时 `licenseEvidenceSha256` 可挂靠的证据锚点（G-05 惯例：凭证必须落到具体哈希，G05-媒体登记与真机验收.md:35） | 证据文档 + 相关文件 SHA-256 |

### 2.3 产出物

1. `apps/scene-studio/ASSETS.md` 补全（模型版本、条款结论、原图留存位置）。
2. 条款摘要文档（含条款原文引文、URL、访问日期、三档用途对照）。
3. Bird+LYL 双批准记录。

**注意**：即便条款核验通过，Bird/LYL 对**美术本身**的审核仍是独立门槛（README.md:50 明确本轮"不能视为美术验收"）；两道批准不可互相替代。

---

## 3. 条件二：真机性能对照协议

### 3.1 为什么桌面数据不算数

README.md:52：桌面生产构建入口约 225 KB（71 KB gzip）、按需 3D chunk 约 589 KB（151 KB gzip），「3D 模块仍较大，不能据此推断真机帧率、内存或温升」；现有导出验证运行在 Playwright **软件 WebGL** 上（README.md:52），不是真机 GPU 证据。G-05 铁律同样适用：「桌面 Chrome 模拟视口的数据一律不得填入本表」（G05-媒体登记与真机验收.md:69,99）。

### 3.2 设备档位建议（具体由作者定）

| 档位 | 建议 | 说明 |
|---|---|---|
| Android | 中端机型 1 台（建议取发布目标支持的最低档） | WebGL 性能下限决定是否需要降级方案 |
| iOS | iPhone 1 台，Safari | G-05 设备要求先例：「至少 iPhone Safari 一台 + 目标 Android 一台」（G05:69） |

### 3.3 每台 5 分钟流程

1. 冷启动打开预览页（构建产物，非 dev server），记录首帧可交互时间（3D chunk 589 KB 的加载含在内）。
2. 连续渲染 **5 分钟**：在限定角度内持续拖动观察，中途至少完成一次横竖画幅切换。
3. 采样记录：帧率（页面内 `performance.now` 采样脚本或录屏后逐帧统计）、内存峰值、温升趋势、是否出现降频/掉帧/崩溃/页面重载。
4. 退出后重新打开一次，验证恢复行为；开启系统"减弱动态"验证海报回退（README.md:40 已在桌面验证的路径，真机复测）。

### 3.4 通过阈值建议（数值需作者确认）

| 项 | 建议阈值 | 说明 |
|---|---|---|
| 帧率 | ≥30 FPS 稳定 | 与导出目标一致（`artifacts/manifest.json:51` `fps: 30`）；低于即记为不通过或触发降级裁决 |
| 降频 | 无可感知降频/持续掉帧 | 定性判定，记录录屏佐证 |
| 稳定性 | 无崩溃、无黑屏、无意外重载 | 画幅切换期间过期贴图失败路径需正确回退 |
| 温升 | 记录趋势；明显烫手记为问题项 | 对齐 G-05 判定线（G05:95） |

### 3.5 证据记录格式（对齐仓库惯例）

- 记录表字段沿用 G-05 §3.1：设备型号/系统/浏览器版本、网络条件、电源状态、画质档、冷启动、连续时长、帧时间/内存峰值、温升/耗电趋势——**不可测项写「不可测」**（G05:71-85）。
- 截图/录屏存入证据目录（仓库先例：`docs/acceptance/2026-10-04/P1-author-signed-evidence/`），建议落位 `docs/acceptance/2026-10-10/P66-真机性能证据/`；逐文件 SHA-256 登记（仓库先例：`artifacts/manifest.json` 的 `files[].sha256`、G-05 的 `media-digests.csv`）。
- 原始帧与详细运行报告留在忽略目录 `test-results/scene-studio/`（README.md:38 惯例），其摘要与哈希抄录进证据文档。
- AI 可代办：页面内 FPS/内存采样脚本、记录表模板、证据哈希登记——脚本化后真机上由作者一键运行。

---

## 4. 条件三：artifacts 去向决策树

### 4.1 两条都通过（许可核验 ✓ 且 真机测试 ✓）

**批准人**：Bird + LYL 双批准——这不是礼仪要求而是机制要求：`media-release-check.mjs:13-14` 要求每个条目同时携带 Bird 与 LYL 的 approved 收据。

**要动的门（按序）**：

1. **选定纳入物**：横/竖 MP4、首帧 WebP（如需接触表/关键帧一并纳入则逐件登记），复制进 `apps/web/public/scenes/…`（门禁扫描树内）。
2. **媒体清单接线**：在 `apps/web/public/scenes/candidate/asset-manifest.json`（或届时的继任清单文件）逐条新增：`path`（`/scenes/…` 格式，:11 校验）、`sha256`、`licenseStatus: "approved"`、`licenseEvidenceSha256`（挂 §2 产出的许可证据）、`authorReceipts`（Bird+LYL 各一条，`assetSha256` 与条目一致）。
3. **清单顶层翻转**：`sourceAndLicense: "unverified" → "verified"`、`authorApproval: "pending" → "approved"`（:8 检查点）。
   ⚠️ **粒度警告**：顶层两个标志是**整份清单一个值**。当前清单 84 个条目里，既有条目尚有未闭合的凭证缺口（G-05：宗门/城镇与战斗视频缺失、环境声缺失、权利凭证待核，G05:54-63）。由于 :12 的逐条 `licenseStatus` 检查独立生效，即便顶层翻转，任何一条未备齐的条目仍会让 release 构建抛 `LICENSE_PENDING`——**release 门禁要全清单齐备才转绿**。若希望 scene-studio 素材独立于旧候选先行入库，需要扩门禁支持多清单/按条目独立翻转（代码改动，按 README.md:17 纪律须 Bird/LYL 复核）——见 §6 裁决点 4。
4. **CI 步骤翻转**：`.github/workflows/ci.yml:77-88` 的 fail-closed 证明步骤按其注释（:79-81）翻转为"release 构建必须成功"。
5. **（仅当纳入实时渲染路径时）**解除 `package.json:12/13/16` 的 `--filter` 排除并允许 `apps/web` 引用 `three`/scene 包——这属于架构级变更，README.md:17 要求 PR 说明理由 + Bird/LYL 复核；若只纳入导出的视频/海报产物则不需要此步。

### 4.2 任一不通过

**现状维持，零改动**：

- 素材留在 `apps/scene-studio/`，不进 `apps/web/public/`，媒体清单不动，`LICENSE_PENDING` 门禁照旧拒绝待审内容；
- 构建过滤不动，scene 包继续隔离于递归流程与发布产物；
- artifacts/ 作为内部评审材料保留在仓库（README.md:52：「所有图像和视频仍标记为内部候选；不能移动到玩家可访问目录」），`artifacts/manifest.json` 的 internal-candidate 标记不变；
- 不存在"半开"状态：门禁是二值的，部分通过 = 不通过。

---

## 5. AI 可代办 vs 必须人工

| 事项 | 谁 | 说明 |
|---|---|---|
| 条款查证与三档用途摘要起草 | **AI 可代办** | 取得模型名称后即可执行；产出附引文与访问日期 |
| `ASSETS.md` 补全稿起草 | **AI 可代办** | 事实位留空待 LYL 填，格式位可直接补 |
| 媒体清单接线准备（条目 JSON 草案、`licenseEvidenceSha256` 挂靠说明、CI 翻转 diff 草案） | **AI 可代办** | 只出草案，不执行翻转 |
| 真机协议脚本化（FPS/内存采样、记录表模板、证据哈希登记） | **AI 可代办** | 脚本备好后由作者在真机一键运行 |
| 纳入物 SHA-256 实算与清单片段生成 | **AI 可代办** | 哈希只证明字节一致，不证明权利（G05:23） |
| **提供"当时用什么模型生成的"** | **必须人工（LYL）** | ASSETS.md 明记版本"在本会话未公开"——只有操作者知道 |
| 取回生成原图（exec-7502f1c6… / exec-8a01f61c…） | **必须人工（LYL）** | 原图在 Codex `generated_images` 目录，未入库 |
| **真机实物测试** | **必须人工** | G-05 铁律：桌面模拟视口数据一律不得填表（G05:99） |
| **美术审核** | **必须人工（Bird+LYL）** | README.md:50：本轮仅结构与构图改进，未作美术验收 |
| **条款摘要批准与媒体清单翻转批准** | **必须人工（Bird+LYL 双签）** | 机制要求：`media-release-check.mjs:13-14` 双收据 |

---

## 6. 裁决点（需 LYL/Bird 拍板的封闭问题）

1. **真机最低设备档位**：Android 取哪一档（编制方建议：发布目标支持的最低档中端机）？iOS 用哪台（取决于 LYL/Bird 手头设备）？
2. **性能阈值数值**：≥30 FPS 稳定是否作为通过线？降频/温升的"可接受"判定口径？（数值确认后写入 §3.4 定稿。）
3. **artifacts 纳入方式**：许可核验通过后，用**现生成物**（2026-10-04 导出，SHA-256 已登记于 `artifacts/manifest.json`）还是**重新导出**？（重生成则全部哈希重算、清单重出，§4.1 第 1-2 步以新清单为准。）
4. **清单翻转粒度**：与既有 84 条候选共用 `asset-manifest.json` 全清单一起翻转（release 门禁须等全部条目齐备，含 G-05 未闭合的凭证缺口），还是扩门禁支持按清单/条目独立翻转（代码改动，按 README.md:17 纪律须 Bird/LYL 复核）？
5. **纳入范围**：仅导出的视频/海报产物（不动构建过滤），还是包含实时 Three.js 渲染路径（须解除 `package.json` 过滤与 `apps/web` 引用隔离——架构级决策）？
6. **发布范围档位**：许可核验通过后按"内部使用 → 公开发布 → 商用"逐档批准，还是一次到位？（每档对应不同的条款核对范围，§2.1 项 4-6。）

---

## 7. 查证结果交付（2026-10-10，LYL 指令：六项缺口由 AI 代办完成）

本文档 §2/§3/§5/§6 所列事实缺口已由 AI 查证补全，结论与证据落在两份配套文档：

1. **[构建隔离验证报告](./P66-scene-studio构建隔离验证报告.md)**——对应用户红线"试验版本绝不构建进网站"：
   - 实际执行 `pnpm build`：Scope 6 of 9，scene 两包不在构建图；453 个产物文件扫描 `scene-studio|scene-gate|gate-environment|three` 全部 **0 命中**
   - 静态链 0 引用、CI 同款 filter 实证、逃逸路径（alias/optimizeDeps/outDir）逐一排除
   - 文件名含 `mountain-gate` 的 3 个产物文件为 PR #66 之前入库的 web 自有候选媒体（`503edfd`），仅命名同词、非泄漏（git 已证）
   - **残余风险**：隔离是逐命令负向 filter，未来显式 import 可穿透——报告建议 CI 增加构建后 fail-closed 产物扫描守卫（待作者批准后实施）
2. **[许可与真机查证结论](./scene-studio许可与真机查证结论.md)**——六项缺口的结论：
   - **模型已锁定（C2PA 内容凭证直读，非推测）**：两张原图内嵌 OpenAI 数字签名的内容凭证，`softwareAgent="ChatGPT" version="gpt-image"`；条款结论=输出所有权归用户，内部/公开/商用均允许，附条件（不得冒称人工生成、不得训练竞争模型、公开发布需按中国《AI 生成合成内容标识办法》加显式+隐式标识）
   - **两张原图已取回留档**：`docs/acceptance/2026-10-10/evidence/`（SHA-256 复核一致，与 artifacts/manifest 闭环比对吻合）；**意外发现第三张生成图 `exec-655feaac-…`（ASSETS.md 未记载）**——是否补录由作者裁定
   - **真机协议已脚本化**：`apps/scene-studio/scripts/device-audit.mjs`（adb+CDP 自动采集 FPS/JS 堆，PASS/FAIL JSON）；最低档建议骁龙 7s Gen3/天玑 7300+6GB、iPhone 12；阈值已定稿（均值与 P95 ≥30FPS、低帧 ≤5%、最差 60s 滑窗 ≥24、堆斜率 ≤0.5MB/min、首尾增长 ≤10MB）——AI 定稿，作者可否决
   - **84 条媒体候选凭证盘点**：licenseStatus/licenseEvidenceSha256/双收据全部 **0/84**；74 条图鉴类缺许可+双收据，10 条场景海报/视频连来源核验都未标；来源均指向作者编号素材树（无第三方字段），权利属性待作者书面确认
   - DESIGN.md 无图像资产（低风险）；山门候选海报（2 图 1 视频）内部参照低风险、公开/商用高风险
3. **剩余必须人工的最小清单**：①作者书面确认素材树权利属性 ②两台真机各跑 5 分钟（脚本已就绪） ③Bird+LYL 双批准收据（机制强制，AI 不可代签） ④公开发布时加 AI 标识 ⑤第三张生成图是否补录的裁定 ⑥CI 产物扫描守卫是否采纳

---

*本材料仅陈述事实与方案，不代表已裁决。裁决以 LYL+Bird 签署为准。*

签名：AI 代理执行（LYL 授权）+ Bird 复核代理
日期：2026-10-10
