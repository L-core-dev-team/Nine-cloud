# 九霄 Markdown 全量清单（只读审计，2026-11-26）

审计对象：研究工作区 分支 `docs/vision-02-claude-research` @ `fe171ff`，`git ls-files '*.md'` 共 **345** 份（JX-VISION-02/01 记录的“333份”已过时）。只读，未修改仓库。

## 分类计数

| 类别 | 数量 |
|---|---|
| 现行设计 | 14 |
| 现行工程 | 29 |
| 作者已签事实 | 42 |
| 安全/许可/数据 | 23 |
| 历史验收 | 191 |
| 过时方案 | 24 |
| 第三方/生成 | 13 |
| 其他 | 9 |

## 读法与引用列说明

- **读取深度**：`全文` = 逐行读完；`规范句全文扫描+标题` = 对全文所有含“必须/不得/禁止/只/固定/唯一/不采用/克制/性能/预算”等规范词的行及全部标题逐条阅读（设计/工程/流程文件，按协调方节流要求执行）；`略读` = 标题、首段与关键词命中行。略读文件均为历史报告、验收记录、Canon 产物、实验报告或生成内容。
- **被引用**：在全部非 Markdown 的受跟踪文件中按路径边界匹配文件名（scripts/、tests/、.github/、package.json 及其他代码/清单）。**CI哈希锁** = 改动任何一个字节都会使 `pnpm test`（CI 必跑）失败，或使已批准的 P1 规则身份失配。`（另见…快照）` = 文件在 `docs/acceptance/2026-10-13/security-file-inventory.json` 中有 2026-10-13 的哈希快照（共 220 份 md；无脚本校验该快照，修改不会破坏 CI，但会与历史快照不一致——这是预期的）。
- `.github/workflows/ci.yml` 与根 `package.json` 不直接引用任何 .md；CI 通过 `pnpm test`、`pnpm build`（含 `worldbook:runtime:check`）和 `write-closeout-packets.mjs` 间接依赖下列被标注文件。

## 清单

| # | 路径 | 类别 | 用途（一行） | 被 scripts/tests/CI/代码引用 | 行数 | 读取深度 |
|---|---|---|---|---|---|---|
| 1 | `.claude/skills/jiuxiao-vision-research/SKILL.md` | 现行设计 | 项目 Skill：VISION 02 独立研究流程 | — | 6 | 全文 |
| 2 | `.trae/documents/cloudflare-progressive-email-auth-plan.md` | 过时方案 | Cloudflare 纯免费全家桶：邮箱账号登录与生产化实施计划 | —；（另见 2026-10-13 安全文件清单快照哈希） | 110 | 略读（标题/首段/关键词） |
| 3 | `.workbuddy/memory/2026-10-02.md` | 第三方/生成 | 2026-10-02 | —；（另见 2026-10-13 安全文件清单快照哈希） | 17 | 略读（标题/首段/关键词） |
| 4 | `.workbuddy/memory/2026-10-03.md` | 第三方/生成 | 2026-10-03 00:40 调查回收与分析（贾维斯） | —；（另见 2026-10-13 安全文件清单快照哈希） | 266 | 略读（标题/首段/关键词） |
| 5 | `.workbuddy/memory/2026-10-04.md` | 第三方/生成 | 2026-10-04 工作日志 | —；（另见 2026-10-13 安全文件清单快照哈希） | 41 | 略读（标题/首段/关键词） |
| 6 | `AGENTS.md` | 作者已签事实 | 协作代理入口：VISION 02 创意方向指针 + 世界书/Canon 状态权威说明 | tests/experiments/p6-longmem-{prose,reliability}/verify.ts 的受保护路径（离线实验，非CI）；（另见 2026-10-13 安全文件清单快照哈希） | 13 | 全文 |
| 7 | `CLAUDE.md` | 现行设计 | Claude 项目入口：原创艺术总监角色、只交方案、安全/许可/数据仍有效 | — | 7 | 全文 |
| 8 | `DESIGN.md` | 现行设计 | 开放艺术设计宪章 VISION 02（取代旧 DESIGN 与方案 E 的硬性视觉规范） | —；（另见 2026-10-13 安全文件清单快照哈希） | 11 | 全文 |
| 9 | `PRODUCT.md` | 现行设计 | 产品定位、用户、原则、可访问性；含标注为历史的旧原型/S1 语境 | —；（另见 2026-10-13 安全文件清单快照哈希） | 75 | 全文 |
| 10 | `README.md` | 现行工程 | 仓库总览：架构、安全、门禁、技术栈、快速开始、ADR 索引 | —（代码中同名 README.md 命中均指子目录文件；仅证据清单快照）；（另见 2026-10-13 安全文件清单快照哈希） | 690 | 规范句全文扫描+标题 |
| 11 | `SECURITY.md` | 安全/许可/数据 | Security Policy | —；（另见 2026-10-13 安全文件清单快照哈希） | 131 | 规范句全文扫描+标题 |
| 12 | `apps/scene-studio/ASSETS.md` | 安全/许可/数据 | 山门内部试点素材来源 | —；（另见 2026-10-13 安全文件清单快照哈希） | 25 | 全文 |
| 13 | `apps/scene-studio/README.md` | 现行工程 | 山门 Three.js 内部试点 | pnpm-workspace.yaml 注释；（另见 2026-10-13 安全文件清单快照哈希） | 54 | 全文 |
| 14 | `apps/ses-callback/README.md` | 现行工程 | Tencent SES callback Worker | —；（另见 2026-10-13 安全文件清单快照哈希） | 35 | 规范句全文扫描+标题 |
| 15 | `deployment/README.md` | 现行工程 | API 部署交接 | —；（另见 2026-10-13 安全文件清单快照哈希） | 87 | 规范句全文扫描+标题 |
| 16 | `deployment/worker-production.md` | 现行工程 | Cloudflare Workers + Supabase 部署准备 | —；（另见 2026-10-13 安全文件清单快照哈希） | 35 | 规范句全文扫描+标题 |
| 17 | `docs/AI模型价格快照核验-2026-10-04.md` | 历史验收 | AI 模型价格快照核验（2026-10-04） | —；（另见 2026-10-13 安全文件清单快照哈希） | 36 | 略读（标题/首段/关键词） |
| 18 | `docs/CARD-REAL-PLAY-01-RECEIPT.md` | 历史验收 | CARD-REAL-PLAY-01 实施回执 | — | 155 | 略读（标题/首段/关键词） |
| 19 | `docs/Cloudflare-Pages前端预览接入.md` | 现行工程 | Cloudflare Pages 前端预览 | —；（另见 2026-10-13 安全文件清单快照哈希） | 57 | 规范句全文扫描+标题 |
| 20 | `docs/FINAL_HUMAN_GATES.md` | 现行工程 | 九霄 1.0 最终人工门禁 | scripts/build/write-closeout-packets.mjs 作为模板读取（CI 步骤“Generate exact-build G1 and Canon review packets”）；（另见 2026-10-13 安全文件清单快照哈希） | 70 | 规范句全文扫描+标题 |
| 21 | `docs/README-workspace-guide.md` | 现行工程 | 九霄 WEB | —；（另见 2026-10-13 安全文件清单快照哈希） | 63 | 规范句全文扫描+标题 |
| 22 | `docs/README.md` | 现行工程 | 项目文档索引 | —；（另见 2026-10-13 安全文件清单快照哈希） | 107 | 规范句全文扫描+标题 |
| 23 | `docs/S5真实手机验收模板-2026-10-02.md` | 现行工程 | S5 真实手机验收记录模板 | 其他: outputs/acceptance-correction-20261003/九霄1.0全缺口验收记录表-2026-10-03.xlsx.inspect.ndjson；（另见 2026-10-13 安全文件清单快照哈希） | 29 | 略读（标题/首段/关键词） |
| 24 | `docs/acceptance/2026-10-04/P1-NLU-作者盲标候选语料.md` | 历史验收 | P1 自然语言解析作者盲标候选语料 | —；（另见 2026-10-13 安全文件清单快照哈希） | 28 | 略读（标题/首段/关键词） |
| 25 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-MAP-作者可执行映射.md` | 作者已签事实 | P1 作者可执行映射（P1-MAP-01 … P1-MAP-06 + NPC presence 来源 | **CI哈希锁：prologue-v1.test.ts:31 + P1 规则包 bundleSha256（pnpm test）**；其他: acc/2026-10-11/P6-LONGMEM-01-evidence/read-only-hash-diagnostic.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/content-readonly-diagnostic.json, packages/content/src/prologue/prologue-v1.ts；（另见 2026-10-13 安全文件清单快照哈希） | 193 | 略读（标题/首段/关键词） |
| 26 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-NLU-双作者盲标表.md` | 作者已签事实 | P1 NLU 双作者盲标表（NLU-01 … NLU-14） | **CI哈希锁：scripts/p1-rule-candidate-bundle.files.json → bundleSha256 ← p1-review-rule-approval.test.ts:26（pnpm test）**；（另见 2026-10-13 安全文件清单快照哈希） | 88 | 略读（标题/首段/关键词） |
| 27 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-PR51-技术审阅依据.md` | 历史验收 | PR #51 技术审阅依据（head `0aa9a2a`） | **CI哈希锁：scripts/p1-rule-candidate-bundle.files.json → bundleSha256 ← p1-review-rule-approval.test.ts:26（pnpm test）**；（另见 2026-10-13 安全文件清单快照哈希） | 150 | 略读（标题/首段/关键词） |
| 28 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-作者共同认可与PR-4验收裁决-2026-10-05.md` | 作者已签事实 | P1 作者共同认可与 PR-4 验收裁决 | **CI哈希锁：scripts/p1-rule-candidate-bundle.files.json → bundleSha256 ← p1-review-rule-approval.test.ts:26（pnpm test）**；（另见 2026-10-13 安全文件清单快照哈希） | 26 | 略读（标题/首段/关键词） |
| 29 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-审阅结论-代签-核对记录.md` | 历史验收 | P1 审阅结论代签材料：归档与核对 | —；（另见 2026-10-13 安全文件清单快照哈希） | 39 | 略读（标题/首段/关键词） |
| 30 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-审阅结论-代签.md` | 作者已签事实 | P1 审阅结论（代 LYL / Bird 双签） | **CI哈希锁：scripts/p1-rule-candidate-bundle.files.json → bundleSha256 ← p1-review-rule-approval.test.ts:26（pnpm test）**；（另见 2026-10-13 安全文件清单快照哈希） | 335 | 略读（标题/首段/关键词） |
| 31 | `docs/acceptance/2026-10-04/P1-author-inputs/P1-输入复核记录.md` | 历史验收 | P1 作者交付材料复核记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 87 | 略读（标题/首段/关键词） |
| 32 | `docs/acceptance/2026-10-04/P1-author-inputs/PR-4-执行规格对照与边界裁定.md` | 作者已签事实 | PR-4 执行规格对照与边界裁定 | **CI哈希锁：scripts/p1-rule-candidate-bundle.files.json → bundleSha256 ← p1-review-rule-approval.test.ts:26（pnpm test）**；（另见 2026-10-13 安全文件清单快照哈希） | 94 | 略读（标题/首段/关键词） |
| 33 | `docs/acceptance/2026-10-04/P1-author-inputs/archived-candidates/P1-EXEC-SPEC-v3.1.0-20261004.md` | 作者已签事实 | 执行规格（GPT 交付版） | **CI哈希锁：canon.registry.json sourceArtifact ← prologue-v1.test.ts（pnpm test）**；其他: acc/2026-10-11/P6-LONGMEM-01-evidence/read-only-hash-diagnostic.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/content-readonly-diagnostic.json；（另见 2026-10-13 安全文件清单快照哈希） | 752 | 略读（标题/首段/关键词） |
| 34 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G02-联合走查矩阵.md` | 历史验收 | G-02 · 联合 G1 走查矩阵 | —；（另见 2026-10-13 安全文件清单快照哈希） | 89 | 略读（标题/首段/关键词） |
| 35 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G03-行动规则表.md` | 作者已签事实 | G-03 · 行动规则表（可执行成稿） | **CI哈希锁：scripts/p1-rule-candidate-bundle.files.json → bundleSha256 ← p1-review-rule-approval.test.ts:26（pnpm test）**；（另见 2026-10-13 安全文件清单快照哈希） | 360 | 略读（标题/首段/关键词） |
| 36 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G04a-Canon摘要与回执.md` | 作者已签事实 | G-04a · Canon 摘要与双作者回执 | —；（另见 2026-10-13 安全文件清单快照哈希） | 73 | 略读（标题/首段/关键词） |
| 37 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G04a-回执-已签署.md` | 作者已签事实 | G-04a · Canon 双作者回执 | —；（另见 2026-10-13 安全文件清单快照哈希） | 68 | 略读（标题/首段/关键词） |
| 38 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G04b-记忆语义规范.md` | 作者已签事实 | G-04b · NPC 记忆语义规范 | —；（另见 2026-10-13 安全文件清单快照哈希） | 181 | 略读（标题/首段/关键词） |
| 39 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G05-媒体登记与真机验收.md` | 安全/许可/数据 | G-05 · 媒体登记与真机验收 | —；（另见 2026-10-13 安全文件清单快照哈希） | 107 | 略读（标题/首段/关键词） |
| 40 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G06-数据政策与部署验收.md` | 安全/许可/数据 | G-06 · 数据政策与生产部署验收 | —；（另见 2026-10-13 安全文件清单快照哈希） | 97 | 略读（标题/首段/关键词） |
| 41 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/G08-G09-目录与供应商验收.md` | 历史验收 | G-08 / G-09 · 模型目录与供应商验收 | —；（另见 2026-10-13 安全文件清单快照哈希） | 115 | 略读（标题/首段/关键词） |
| 42 | `docs/acceptance/2026-10-04/P1-author-signed-evidence/README.md` | 历史验收 | 《九霄》P1 交付工作区 | —；（另见 2026-10-13 安全文件清单快照哈希） | 111 | 略读（标题/首段/关键词） |
| 43 | `docs/acceptance/2026-10-05/P1-PR4-NLU语料执行记录.md` | 历史验收 | P1 PR-4 NLU 语料执行记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 43 | 略读（标题/首段/关键词） |
| 44 | `docs/acceptance/2026-10-05/P1-PR5-事件与投影持久化交付记录.md` | 历史验收 | P1 PR-5 事件与投影持久化交付记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 57 | 略读（标题/首段/关键词） |
| 45 | `docs/acceptance/2026-10-05/P1-PR6-规则候选审阅包.md` | 历史验收 | P1 / PR-6 规则候选审阅包 | —；（另见 2026-10-13 安全文件清单快照哈希） | 142 | 略读（标题/首段/关键词） |
| 46 | `docs/acceptance/2026-10-05/P1-PR6-规则摘要双作者批准记录.md` | 作者已签事实 | P1 / PR-6 规则摘要双作者批准记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 27 | 略读（标题/首段/关键词） |
| 47 | `docs/acceptance/2026-10-05/P1-PR7-工程实现验证-2026-10-05.md` | 历史验收 | P1 / PR-7 工程实现与验收记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 43 | 略读（标题/首段/关键词） |
| 48 | `docs/acceptance/2026-10-05/S0-S8工程复核记录.md` | 历史验收 | S0–S8 工程续接复核记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 47 | 略读（标题/首段/关键词） |
| 49 | `docs/acceptance/2026-10-05/UI-实机问题登记与复核表.md` | 历史验收 | UI 实机问题登记与复核表（2026-10-05） | —；（另见 2026-10-13 安全文件清单快照哈希） | 99 | 略读（标题/首段/关键词） |
| 50 | `docs/acceptance/2026-10-06/P1-游客模式工程实现与边界.md` | 历史验收 | P1 游客模式工程实现与边界 | —；（另见 2026-10-13 安全文件清单快照哈希） | 99 | 略读（标题/首段/关键词） |
| 51 | `docs/acceptance/2026-10-06/P2-玩家可访问收口核验.md` | 历史验收 | P2「收口至玩家可访问」核验 | —；（另见 2026-10-13 安全文件清单快照哈希） | 161 | 略读（标题/首段/关键词） |
| 52 | `docs/acceptance/2026-10-06/P2-语义指纹边界审计与补充.md` | 历史验收 | P2 语义指纹边界审计与补充 | —；（另见 2026-10-13 安全文件清单快照哈希） | 151 | 略读（标题/首段/关键词） |
| 53 | `docs/acceptance/2026-10-06/S-UI基础回归修复.md` | 历史验收 | S/UI 基础回归修复 | —；（另见 2026-10-13 安全文件清单快照哈希） | 24 | 略读（标题/首段/关键词） |
| 54 | `docs/acceptance/2026-10-08/CI主分支迁移阻塞修复.md` | 历史验收 | CI 主分支迁移阻塞修复记录（2026-10-08） | —；（另见 2026-10-13 安全文件清单快照哈希） | 84 | 略读（标题/首段/关键词） |
| 55 | `docs/acceptance/2026-10-08/S-UI-final-closeout.md` | 历史验收 | S 轨 UI 收尾候选与验收边界（2026-10-08） | —；（另见 2026-10-13 安全文件清单快照哈希） | 83 | 略读（标题/首段/关键词） |
| 56 | `docs/acceptance/2026-10-09/P4分支与主支对照裁决简报.md` | 历史验收 | P4 分支（codex/p4-authorized-recall）与 main 对照裁决简报 | —；（另见 2026-10-13 安全文件清单快照哈希） | 120 | 略读（标题/首段/关键词） |
| 57 | `docs/acceptance/2026-10-09/P4融合架构变更摘要.md` | 历史验收 | P4 融合架构变更摘要（main @ d98c221） | —；（另见 2026-10-13 安全文件清单快照哈希） | 72 | 略读（标题/首段/关键词） |
| 58 | `docs/acceptance/2026-10-09/S-FINAL-验收与收官报告.md` | 历史验收 | 九霄 WEB · S轨最终验收与收官报告（候选，2026-10-09） | —；（另见 2026-10-13 安全文件清单快照哈希） | 144 | 略读（标题/首段/关键词） |
| 59 | `docs/acceptance/2026-10-10/G05-batch1-license-evidence.md` | 安全/许可/数据 | G-05 第一批登记许可证据（冻结快照，2026-10-10） | 其他: apps/web/public/scenes/candidate/asset-manifest.json；（另见 2026-10-13 安全文件清单快照哈希） | 39 | 略读（标题/首段/关键词） |
| 60 | `docs/acceptance/2026-10-10/G05-batch2-license-evidence.md` | 安全/许可/数据 | G-05 第二批登记许可证据（冻结快照，2026-10-10） | 其他: apps/web/public/scenes/candidate/asset-manifest.json；（另见 2026-10-13 安全文件清单快照哈希） | 103 | 略读（标题/首段/关键词） |
| 61 | `docs/acceptance/2026-10-10/G05-batch3-license-evidence.md` | 安全/许可/数据 | G-05 第三批登记许可证据（冻结快照，2026-10-10） | 其他: apps/web/public/scenes/candidate/asset-manifest.json；（另见 2026-10-13 安全文件清单快照哈希） | 34 | 略读（标题/首段/关键词） |
| 62 | `docs/acceptance/2026-10-10/G05-flip-readiness-assessment.md` | 安全/许可/数据 | G-05 翻转就绪评估（2026-10-10） | —；（另见 2026-10-13 安全文件清单快照哈希） | 47 | 略读（标题/首段/关键词） |
| 63 | `docs/acceptance/2026-10-10/G05-top-level-flip-record.md` | 安全/许可/数据 | G-05 顶层翻转记录（2026-10-10，release 媒体门禁最终人工把关） | —；（另见 2026-10-13 安全文件清单快照哈希） | 36 | 略读（标题/首段/关键词） |
| 64 | `docs/acceptance/2026-10-10/P4-Forgetting模式授权召回语义裁决材料.md` | 作者已签事实 | P4 裁决材料：Forgetting 模式下的授权召回语义（2026-10-10） | —；（另见 2026-10-13 安全文件清单快照哈希） | 120 | 略读（标题/首段/关键词） |
| 65 | `docs/acceptance/2026-10-10/P66-scene-studio内部使用批准与权利声明.md` | 安全/许可/数据 | P66 批准与声明：scene-studio 试验素材内部使用范围 + 素材树权利声明（2026-1 | —；（另见 2026-10-13 安全文件清单快照哈希） | 68 | 略读（标题/首段/关键词） |
| 66 | `docs/acceptance/2026-10-10/P66-scene-studio构建隔离验证报告.md` | 历史验收 | P66 scene-studio 构建隔离验证报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 78 | 略读（标题/首段/关键词） |
| 67 | `docs/acceptance/2026-10-10/P66-scene-studio试验遗留条件行动材料.md` | 安全/许可/数据 | P66 行动材料：scene-studio 试验的美术许可/真机门槛（2026-10-10） | —；（另见 2026-10-13 安全文件清单快照哈希） | 206 | 略读（标题/首段/关键词） |
| 68 | `docs/acceptance/2026-10-10/P66-发布范围批准与AI标识实施记录.md` | 安全/许可/数据 | 发布范围批准与 AI 标识实施记录（2026-10-10，作者待办 3） | —；（另见 2026-10-13 安全文件清单快照哈希） | 107 | 略读（标题/首段/关键词） |
| 69 | `docs/acceptance/2026-10-10/S-FINAL-CLOSEOUT-最终UI质量报告.md` | 历史验收 | 《九霄 WEB · S-FINAL-CLOSEOUT 最终 UI 质量报告》 | —；（另见 2026-10-13 安全文件清单快照哈希） | 132 | 略读（标题/首段/关键词） |
| 70 | `docs/acceptance/2026-10-10/S-FINAL-CLOSEOUT-范围与差异登记.md` | 历史验收 | S-FINAL-CLOSEOUT 范围与差异登记 | —；（另见 2026-10-13 安全文件清单快照哈希） | 74 | 略读（标题/首段/关键词） |
| 71 | `docs/acceptance/2026-10-10/S-FINAL-续做核对与验收.md` | 历史验收 | S-FINAL 续做核对与验收（2026-10-10） | —；（另见 2026-10-13 安全文件清单快照哈希） | 54 | 略读（标题/首段/关键词） |
| 72 | `docs/acceptance/2026-10-10/S-HANDOFF-D8修复报告.md` | 历史验收 | S-HANDOFF · D8 专业详情焦点修复报告 | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json；（另见 2026-10-13 安全文件清单快照哈希） | 62 | 略读（标题/首段/关键词） |
| 73 | `docs/acceptance/2026-10-10/S-HANDOFF-技术UI冻结报告.md` | 历史验收 | S-HANDOFF · S轨技术UI冻结报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 106 | 略读（标题/首段/关键词） |
| 74 | `docs/acceptance/2026-10-10/S-HANDOFF-联合UI验收状态.md` | 历史验收 | S-HANDOFF · 联合UI验收状态 | —；（另见 2026-10-13 安全文件清单快照哈希） | 9 | 略读（标题/首段/关键词） |
| 75 | `docs/acceptance/2026-10-10/S-HANDOFF-致临江仙交接通知.md` | 历史验收 | 致临江仙 · S-HANDOFF正式技术交接通知 | —；（另见 2026-10-13 安全文件清单快照哈希） | 13 | 略读（标题/首段/关键词） |
| 76 | `docs/acceptance/2026-10-10/S-P3-展示接口交接.md` | 历史验收 | S / P3 最终展示接口交接（待临江仙确认） | —；（另见 2026-10-13 安全文件清单快照哈希） | 59 | 略读（标题/首段/关键词） |
| 77 | `docs/acceptance/2026-10-10/S-QUALITY-FINAL 最终技术质量报告.md` | 历史验收 | S-QUALITY-FINAL 最终技术质量报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 105 | 略读（标题/首段/关键词） |
| 78 | `docs/acceptance/2026-10-10/S-STRESS-01 长期稳定性与异常恢复报告.md` | 历史验收 | S-STRESS-01 长期稳定性与异常恢复报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 106 | 略读（标题/首段/关键词） |
| 79 | `docs/acceptance/2026-10-10/scene-studio许可与真机查证结论.md` | 安全/许可/数据 | scene-studio 六项事实缺口查证结论（2026-10-10） | apps/scene-studio/scripts/device-audit.mjs；（另见 2026-10-13 安全文件清单快照哈希） | 221 | 略读（标题/首段/关键词） |
| 80 | `docs/acceptance/2026-10-10/作者待办清单.md` | 历史验收 | 作者待办清单（2026-10-10 交付） | —；（另见 2026-10-13 安全文件清单快照哈希） | 45 | 略读（标题/首段/关键词） |
| 81 | `docs/acceptance/2026-10-10/全权执行处置总结报告.md` | 历史验收 | 全权执行处置总结报告（2026-10-10） | —；（另见 2026-10-13 安全文件清单快照哈希） | 100 | 略读（标题/首段/关键词） |
| 82 | `docs/acceptance/2026-10-10/水龙吟 S-main 同步与去重报告.md` | 历史验收 | 水龙吟 S-main 同步与去重报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 112 | 略读（标题/首段/关键词） |
| 83 | `docs/acceptance/2026-10-10/素材树权利属性查证与确认书.md` | 安全/许可/数据 | 素材树权利属性查证与确认书（草稿）（2026-10-10） | scripts/audit/apply-aigc-propagation-labels.mjs 注释；（另见 2026-10-13 安全文件清单快照哈希） | 123 | 略读（标题/首段/关键词） |
| 84 | `docs/acceptance/2026-10-11/GPT-工作交接与状态总结-2026-10-11.md` | 历史验收 | GPT 工作交接与状态总结（2026-10-11，AI 代理 → GPT） | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json；（另见 2026-10-13 安全文件清单快照哈希） | 79 | 略读（标题/首段/关键词） |
| 85 | `docs/acceptance/2026-10-11/P1-服务器初始化执行清单.md` | 历史验收 | P1 服务器初始化执行清单（轻量服务器 · 境内路线准备） | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json；（另见 2026-10-13 安全文件清单快照哈希） | 100 | 略读（标题/首段/关键词） |
| 86 | `docs/acceptance/2026-10-11/P2-P3-P4-P5-P7-P8本机玩法与双记忆候选验收.md` | 历史验收 | P2–P8 本机玩法与双记忆候选验收（2026-10-11） | —；（另见 2026-10-13 安全文件清单快照哈希） | 70 | 略读（标题/首段/关键词） |
| 87 | `docs/acceptance/2026-10-11/P6-LONGMEM-01-evidence/review/summary.md` | 第三方/生成 | P6-LONGMEM-01 synthetic evaluation | 其他: acc/2026-10-11/P6-LONGMEM-01-evidence/review/verification.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/p6-01-original-verification.json | 30 | 略读（标题/首段/关键词） |
| 88 | `docs/acceptance/2026-10-11/P6-LONGMEM-01-evidence/summary.md` | 第三方/生成 | P6-LONGMEM-01 synthetic evaluation | 其他: acc/2026-10-11/P6-LONGMEM-01-evidence/checks-and-manifest.json, acc/2026-10-11/P6-LONGMEM-01-evidence/review/verification.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json 等4 | 30 | 略读（标题/首段/关键词） |
| 89 | `docs/acceptance/2026-10-11/P6-LONGMEM-01-长剧情记忆评测与Token成本分析报告.md` | 历史验收 | P6-LONGMEM-01 长剧情记忆评测与 Token 成本分析报告 | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json | 150 | 略读（标题/首段/关键词） |
| 90 | `docs/acceptance/2026-10-11/P6-LONGMEM-02-长剧情记忆精度强化与复杂千回合测试报告.md` | 历史验收 | P6-LONGMEM-02 长剧情记忆精度强化与复杂千回合测试报告 | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json | 139 | 略读（标题/首段/关键词） |
| 91 | `docs/acceptance/2026-10-11/环境方案多路径模拟验收记录.md` | 历史验收 | 环境方案多路径模拟验收记录 | — | 85 | 略读（标题/首段/关键词） |
| 92 | `docs/acceptance/2026-10-11/路线A入口封锁规则.md` | 安全/许可/数据 | 路线 A 入口封锁规则（边缘层，含批准记录） | deployment/Caddyfile 注释（Caddyfile 在 CI 中 caddy validate）；（另见 2026-10-13 安全文件清单快照哈希） | 138 | 略读（标题/首段/关键词） |
| 93 | `docs/acceptance/2026-10-11/路线A邮件发信预检方案-SES-API.md` | 现行工程 | 路线 A 邮件发信预检方案（腾讯云 SES API 替代 SMTP） | deployment/api-production.compose.yml 注释；（另见 2026-10-13 安全文件清单快照哈希） | 51 | 略读（标题/首段/关键词） |
| 94 | `docs/acceptance/2026-10-11/部署路线A-B裁决材料.md` | 作者已签事实 | 部署路线 A/B 裁决材料（含拓扑取舍） | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json；（另见 2026-10-13 安全文件清单快照哈希） | 53 | 略读（标题/首段/关键词） |
| 95 | `docs/acceptance/2026-10-12/Apple-Liquid-Glass-任务书与验收映射.md` | 历史验收 | Apple Liquid Glass 任务书与验收映射 | — | 68 | 略读（标题/首段/关键词） |
| 96 | `docs/acceptance/2026-10-12/P6-LONGMEM-03-长期剧情原文检索强化报告.md` | 历史验收 | P6-LONGMEM-03｜长期剧情原文检索强化报告 | tests: exp/p6-longmem-prose/delivery-manifest.json | 139 | 略读（标题/首段/关键词） |
| 97 | `docs/acceptance/2026-10-12/P6-LONGMEM-03.1-中文近义表达强化回执.md` | 历史验收 | P6-LONGMEM-03.1 中文近义表达强化回执 | tests: exp/p6-longmem-lexical/delivery-manifest.json | 55 | 略读（标题/首段/关键词） |
| 98 | `docs/acceptance/2026-10-12/P6-LONGMEM-04-PRE-原文保存与恢复验证回执.md` | 历史验收 | P6-LONGMEM-04-PRE 原文保存与恢复验证回执 | tests: exp/p6-longmem-durability/evidence/summary.json | 59 | 略读（标题/首段/关键词） |
| 99 | `docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-evidence/p6-01/summary.md` | 第三方/生成 | P6-LONGMEM-01 synthetic evaluation | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/delivery-evidence-manifest.json | 30 | 略读（标题/首段/关键词） |
| 100 | `docs/acceptance/2026-10-12/P6-MAIN-SYNC-01-主线同步与双阶段兼容性报告.md` | 历史验收 | P6-MAIN-SYNC-01 主线同步与双阶段兼容性报告 | — | 105 | 略读（标题/首段/关键词） |
| 101 | `docs/acceptance/2026-10-12/P6-剧情摘要候选队列实施与验收.md` | 历史验收 | P6 剧情摘要候选队列实施与验收（2026-10-12） | —；（另见 2026-10-13 安全文件清单快照哈希） | 58 | 略读（标题/首段/关键词） |
| 102 | `docs/acceptance/2026-10-12/UI1.0Pro-LiquidGlass-验收记录.md` | 历史验收 | 九霄 UI 1.0 / Pro 与 Liquid Glass 验收记录 | — | 93 | 略读（标题/首段/关键词） |
| 103 | `docs/acceptance/2026-10-12/玩法与双记忆方案续作验收.md` | 历史验收 | 玩法与双记忆方案续作验收（2026-10-12） | —；（另见 2026-10-13 安全文件清单快照哈希） | 102 | 略读（标题/首段/关键词） |
| 104 | `docs/acceptance/2026-10-13/2026-10-13-P6P7-v4检收裁定与上线作战方案.md` | 作者已签事实 | P6 / P7 v4 检收裁定 + 上线作战方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 266 | 略读（标题/首段/关键词） |
| 105 | `docs/acceptance/2026-10-13/2026-10-13-致GPT-v4检收回执与上线指令.md` | 历史验收 | 致 GPT · v4 检收回执与上线指令 | —；（另见 2026-10-13 安全文件清单快照哈希） | 156 | 略读（标题/首段/关键词） |
| 106 | `docs/acceptance/2026-10-13/P6-LONGMEM-04-完整研发与验收报告.md` | 历史验收 | P6-LONGMEM-04｜长期记忆可靠性与万回合离线闭环 | — | 152 | 略读（标题/首段/关键词） |
| 107 | `docs/acceptance/2026-10-13/P6-LONGMEM-04-恢复与阶段计划.md` | 历史验收 | P6-LONGMEM-04 恢复与阶段计划 | — | 29 | 略读（标题/首段/关键词） |
| 108 | `docs/acceptance/2026-10-13/P6-LONGMEM-04-生产接入方案.md` | 历史验收 | P6-LONGMEM-04 生产接入方案（设计交付，不实施） | — | 60 | 略读（标题/首段/关键词） |
| 109 | `docs/acceptance/2026-10-13/P6P7-v4执行记录.md` | 作者已签事实 | P6/P7 v4 作者签收与执行记录（2026-10-13） | —；（另见 2026-10-13 安全文件清单快照哈希） | 40 | 略读（标题/首段/关键词） |
| 110 | `docs/acceptance/2026-10-13/UI1.0Pro-最终本地验收.md` | 历史验收 | UI 1.0 / Pro 与 Liquid Glass 最终本地验收 | — | 112 | 略读（标题/首段/关键词） |
| 111 | `docs/acceptance/2026-10-13/全项目代码安全审计与修复.md` | 安全/许可/数据 | 全项目代码安全审计与修复（2026-10-13） | —；（另见 2026-10-13 安全文件清单快照哈希） | 46 | 略读（标题/首段/关键词） |
| 112 | `docs/acceptance/2026-10-13/备案徽章CI修复验收.md` | 安全/许可/数据 | 备案徽章 CI 修复验收（2026-10-13） | — | 12 | 略读（标题/首段/关键词） |
| 113 | `docs/acceptance/2026-10-13/备案徽章替换登记.md` | 安全/许可/数据 | 备案徽章替换登记（2026-10-13） | 其他: apps/web/public/scenes/candidate/asset-manifest.json | 21 | 略读（标题/首段/关键词） |
| 114 | `docs/acceptance/2026-10-13/环境方案恢复与模拟验收.md` | 历史验收 | 环境方案恢复与模拟验收 | — | 68 | 略读（标题/首段/关键词） |
| 115 | `docs/acceptance/2026-10-13/空间化UI-实施与复验.md` | 历史验收 | 空间化 UI：实施与复验 | — | 118 | 略读（标题/首段/关键词） |
| 116 | `docs/acceptance/2026-10-14/1.0预览版统一发布范围.md` | 作者已签事实 | 1.0 预览版统一发布范围 | — | 40 | 略读（标题/首段/关键词） |
| 117 | `docs/acceptance/2026-11-07/PR00-基线与分支差异.md` | 历史验收 | PR 00：基线与分支差异 | — | 84 | 略读（标题/首段/关键词） |
| 118 | `docs/acceptance/2026-11-07/PR01-中继隔离验证.md` | 历史验收 | PR 01：Pages/API 中继的隔离验证 | — | 27 | 略读（标题/首段/关键词） |
| 119 | `docs/acceptance/2026-11-07/PR03-TRUNCATE只读评估.md` | 历史验收 | PR 03：TRUNCATE 授权的只读评估 | — | 64 | 略读（标题/首段/关键词） |
| 120 | `docs/acceptance/2026-11-08/P0首次游玩与核心闭环审计.md` | 历史验收 | P0 首次游玩与核心闭环审计 | — | 134 | 略读（标题/首段/关键词） |
| 121 | `docs/acceptance/2026-11-08/平板真机验收.md` | 历史验收 | 平板真机工程验收 · 2026-11-08 | — | 61 | 略读（标题/首段/关键词） |
| 122 | `docs/acceptance/2026-11-22/JX-UI-E-01-M0-基线.md` | 历史验收 | JX-UI-E-01 · M0 基线记录 | — | 51 | 略读（标题/首段/关键词） |
| 123 | `docs/acceptance/2026-11-23/JX-UI-E-01-最终报告.md` | 历史验收 | JX-UI-E-01 最终报告 | — | 301 | 略读（标题/首段/关键词） |
| 124 | `docs/acceptance/2026-11-23/JX-UI-E-01-读屏与真机核对清单.md` | 历史验收 | JX-UI-E-01 · 读屏与真机核对清单 | — | 98 | 略读（标题/首段/关键词） |
| 125 | `docs/acceptance/README.md` | 现行工程 | 作者验收记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 24 | 规范句全文扫描+标题 |
| 126 | `docs/adr/0001-语言与运行时边界.md` | 现行工程 | ADR 0001：语言与运行时边界 | —；（另见 2026-10-13 安全文件清单快照哈希） | 48 | 全文 |
| 127 | `docs/adr/0002-npc-memory-modes-and-authorized-observation-ledger.md` | 作者已签事实 | ADR 0002：NPC 双记忆模式与授权观察账本 | —；（另见 2026-10-13 安全文件清单快照哈希） | 93 | 规范句全文扫描+标题 |
| 128 | `docs/adr/0003-S6邮箱会话与客户端备份边界.md` | 作者已签事实 | ADR 0003：S6 邮箱会话与客户端备份边界 | 其他: outputs/acceptance-correction-20261003/九霄1.0全缺口验收记录表-2026-10-03.xlsx.inspect.ndjson；（另见 2026-10-13 安全文件清单快照哈希） | 31 | 规范句全文扫描+标题 |
| 129 | `docs/adr/0004-1.0不含社区与收费.md` | 作者已签事实 | ADR 0004：1.0 不含社区与收费 | scripts/build/write-closeout-packets.mjs；docs/acceptance/2026-10-02-LYL-decisions.json；（另见 2026-10-13 安全文件清单快照哈希） | 21 | 规范句全文扫描+标题 |
| 130 | `docs/adr/0005-1.0内测环境采用境外单节点.md` | 作者已签事实 | ADR 0005：1.0 内测环境采用境外单节点 Docker | —；（另见 2026-10-13 安全文件清单快照哈希） | 52 | 规范句全文扫描+标题 |
| 131 | `docs/adr/0006-应用商店上架属1.0范围变更.md` | 作者已签事实 | ADR 0006：应用商店上架属 1.0 范围变更 | —；（另见 2026-10-13 安全文件清单快照哈希） | 53 | 规范句全文扫描+标题 |
| 132 | `docs/adr/0007-在线账号与Supabase身份源.md` | 安全/许可/数据 | ADR 0007：在线账号与 Supabase 身份源 | —；（另见 2026-10-13 安全文件清单快照哈希） | 51 | 规范句全文扫描+标题 |
| 133 | `docs/adr/0008-cloudflare-workers-supabase-runtime.md` | 现行工程 | ADR 0008: Cloudflare Workers 与 Supabase 运行边界 | —；（另见 2026-10-13 安全文件清单快照哈希） | 52 | 规范句全文扫描+标题 |
| 134 | `docs/audits/2026-10-05/README.md` | 历史验收 | 九霄历史审计、主线收敛与下一阶段计划 | —；（另见 2026-10-13 安全文件清单快照哈希） | 41 | 略读（标题/首段/关键词） |
| 135 | `docs/audits/2026-10-05/convergence/BRANCH_MERGE_PLAN.md` | 历史验收 | 分支收敛计划 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 67 | 略读（标题/首段/关键词） |
| 136 | `docs/audits/2026-10-05/convergence/DEMO_GAP_ANALYSIS.md` | 历史验收 | Demo 差距与最小目标 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 57 | 略读（标题/首段/关键词） |
| 137 | `docs/audits/2026-10-05/convergence/FEATURE_ROADMAP.md` | 历史验收 | 功能收敛地图 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 46 | 略读（标题/首段/关键词） |
| 138 | `docs/audits/2026-10-05/convergence/NEXT_PHASE_PLAN.md` | 历史验收 | 九霄下一阶段完善计划与分工 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 88 | 略读（标题/首段/关键词） |
| 139 | `docs/audits/2026-10-05/convergence/OWNER_CONVERGENCE_REPORT.md` | 历史验收 | 九霄主线收敛负责人报告 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 59 | 略读（标题/首段/关键词） |
| 140 | `docs/audits/2026-10-05/convergence/PR_MERGE_DECISION.md` | 历史验收 | PR 收敛决策 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 88 | 略读（标题/首段/关键词） |
| 141 | `docs/audits/2026-10-05/history/BRANCH_AUDIT.md` | 历史验收 | 远端分支审计 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 68 | 略读（标题/首段/关键词） |
| 142 | `docs/audits/2026-10-05/history/COMMIT_AUDIT.md` | 历史验收 | 提交历史审计 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 362 | 略读（标题/首段/关键词） |
| 143 | `docs/audits/2026-10-05/history/COMPLETION_CORRECTION.md` | 历史验收 | 历史状态纠正表 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 18 | 略读（标题/首段/关键词） |
| 144 | `docs/audits/2026-10-05/history/CURRENT_BASELINE.md` | 历史验收 | 当前可信基线 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 59 | 略读（标题/首段/关键词） |
| 145 | `docs/audits/2026-10-05/history/FEATURE_REALITY_AUDIT.md` | 历史验收 | 功能真实性审核 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 53 | 略读（标题/首段/关键词） |
| 146 | `docs/audits/2026-10-05/history/OWNER_SUMMARY.md` | 历史验收 | 九霄项目负责人历史审核摘要 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 39 | 略读（标题/首段/关键词） |
| 147 | `docs/audits/2026-10-05/history/PR_AUDIT.md` | 历史验收 | PR 全量审计 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 71 | 略读（标题/首段/关键词） |
| 148 | `docs/audits/2026-10-05/history/STAGE_MAPPING.md` | 历史验收 | S0–S7 代码来源映射 | 其他: docs/audits/2026-10-05/SOURCE_MANIFEST.json；（另见 2026-10-13 安全文件清单快照哈希） | 44 | 略读（标题/首段/关键词） |
| 149 | `docs/auth-login-privacy-data-inventory-2026-10-06.md` | 安全/许可/数据 | 登录工程隐私数据流盘点（内部草稿） | —；（另见 2026-10-13 安全文件清单快照哈希） | 34 | 略读（标题/首段/关键词） |
| 150 | `docs/design/2026-10-13-空间化UI方案审阅.md` | 过时方案 | 九霄空间化 UI：五份方案审阅 | — | 107 | 规范句全文扫描+标题 |
| 151 | `docs/design/2026-10-13-空间化UI逐文件升级清单.md` | 过时方案 | 九霄空间化 UI：逐文件升级清单 | — | 112 | 规范句全文扫描+标题 |
| 152 | `docs/design/Apple-Liquid-Glass-原始任务书.md` | 过时方案 | Apple Liquid Glass 原始任务书 | — | 227 | 规范句全文扫描+标题 |
| 153 | `docs/design/JX-UI-E-01/00-原始任务书-E.md` | 过时方案 | JX-UI-E-01｜《九霄》全站视觉与交互重构任务书 | — | 242 | 规范句全文扫描+标题 |
| 154 | `docs/design/JX-UI-E-01/01-设计总纲.md` | 过时方案 | 01 · 设计总纲：仰观九霄，俯读人间 | apps/web/src/design-system/tokens-v2.css 与 apps/web/src/ui/Ornaments.tsx 注释称其为 source of truth | 518 | 规范句全文扫描+标题 |
| 155 | `docs/design/JX-UI-E-01/02-页面规格.md` | 过时方案 | 02 · 页面规格 | — | 664 | 规范句全文扫描+标题 |
| 156 | `docs/design/JX-UI-E-01/03-工程实施与验收.md` | 过时方案 | 03 · 工程实施与验收 | tests/e2e/jx-ui-e-visual.cjs 注释引用 §9.2（非CI默认套件） | 503 | 规范句全文扫描+标题 |
| 157 | `docs/design/JX-UI-E-01/04-执行提示词.md` | 过时方案 | 04 · 执行提示词 | — | 277 | 规范句全文扫描+标题 |
| 158 | `docs/design/JX-UI-E-01/README.md` | 过时方案 | JX-UI-E-01 · 《九霄》全站视觉与交互重构 | — | 105 | 全文 |
| 159 | `docs/design/JX-UI-E-01/锚点变更记录.md` | 历史验收 | 锚点变更记录 | — | 59 | 规范句全文扫描+标题 |
| 160 | `docs/design/JX-VISION-02/00-作者原文.md` | 现行设计 | 作者 2026-11-25 原话逐字记录 | — | 6 | 全文 |
| 161 | `docs/design/JX-VISION-02/01-baseline-audit.md` | 现行设计 | 初版诊断、基线 SHA 与旧制度冲突根因 | — | 21 | 全文 |
| 162 | `docs/design/JX-VISION-02/02-visual-reference.md` | 现行设计 | 作者提供的58张视觉/技术参考 | — | 25 | 全文 |
| 163 | `docs/design/JX-VISION-02/03-art-direction.md` | 现行设计 | 六种艺术原型与原创体验方向（不限制Claude） | — | 20 | 全文 |
| 164 | `docs/design/JX-VISION-02/04-technology.md` | 现行设计 | 技术与知识菜单：设计决定选型 | — | 25 | 全文 |
| 165 | `docs/design/JX-VISION-02/05-claude-master-brief.md` | 现行设计 | Claude Code｜使用当前实际可用的最高能力模型与推理设置｜九霄 VISION 02 独立艺术 | — | 43 | 全文 |
| 166 | `docs/design/JX-VISION-02/06-sources.md` | 现行设计 | 本轮研究来源（2026-11-25北京时间） | — | 10 | 全文 |
| 167 | `docs/design/JX-VISION-02/07-creative-critique-protocol.md` | 现行设计 | VISION 02｜独立创作与评价协议（仅研究与方案） | — | 29 | 全文 |
| 168 | `docs/design/JX-VISION-02/README.md` | 现行设计 | 九霄 VISION 02｜从网页游戏到可进入的艺术世界 | — | 15 | 全文 |
| 169 | `docs/design/JX-VISION-02/claude-proposal/README.md` | 现行设计 | Claude 研究成果目录占位（研究进行中） | — | 12 | 全文 |
| 170 | `docs/integration/2026-11-09-release-review.md` | 历史验收 | 双方候选合并与隔离试玩发布审查 | — | 35 | 略读（标题/首段/关键词） |
| 171 | `docs/integration/2026-11-09-zod-semantic-approval.md` | 作者已签事实 | 依赖安全更新触发的 P1 语义身份复核（待拥有者裁定） | apps/api/src/services/p1-review-rule-approval.ts 注释 | 28 | 略读（标题/首段/关键词） |
| 172 | `docs/integration/2026-11-10-feedback-visibility.md` | 历史验收 | 新回合正文可见性修复 | — | 25 | 略读（标题/首段/关键词） |
| 173 | `docs/integration/JX-TAVERN-MEMORY-01.md` | 现行工程 | 角色卡关键历史引用 | — | 22 | 略读（标题/首段/关键词） |
| 174 | `docs/integration/P3-FINAL-candidate-report-20261011.md` | 历史验收 | P3-FINAL 候选验收说明 | — | 37 | 略读（标题/首段/关键词） |
| 175 | `docs/integration/P3-FINAL-resume-20261011.md` | 历史验收 | P3-FINAL 安全恢复检查点（2026-10-11） | — | 34 | 略读（标题/首段/关键词） |
| 176 | `docs/integration/P3-merge-migration-note.md` | 历史验收 | P3组合迁移登记说明 | — | 3 | 略读（标题/首段/关键词） |
| 177 | `docs/integration/S-P3-cache-progress-20261011.md` | 历史验收 | 独立云游戏缓存实施断点 · 2026-10-11 | — | 33 | 略读（标题/首段/关键词） |
| 178 | `docs/integration/S-P3-eight-contracts-20261010.md` | 历史验收 | S/P3 八项正式接口契约及 UI 接线任务 | — | 139 | 略读（标题/首段/关键词） |
| 179 | `docs/integration/S-P3-integration-preparation-20261010.md` | 历史验收 | 三方整合准备、实际测试与未完成清单 | — | 104 | 略读（标题/首段/关键词） |
| 180 | `docs/integration/card-core-20261103/CARD-03B-CLOSEOUT-MIGRATION-PLAN.md` | 历史验收 | CARD-03B-CLOSEOUT 数据库升级准备（仅方案） | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 7 | 略读（标题/首段/关键词） |
| 181 | `docs/integration/card-core-20261103/CARD-CORE-ARCHITECTURE.md` | 历史验收 | 核心架构与现状 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 5 | 略读（标题/首段/关键词） |
| 182 | `docs/integration/card-core-20261103/CARD-CORE-BASELINE.md` | 历史验收 | 施工基线 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 2 | 略读（标题/首段/关键词） |
| 183 | `docs/integration/card-core-20261103/CARD-CORE-CLOSE-02.md` | 历史验收 | CARD-CORE-CLOSE-02 隔离升级与 TLS 回执 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 15 | 略读（标题/首段/关键词） |
| 184 | `docs/integration/card-core-20261103/CARD-CORE-HANDOVER.md` | 历史验收 | 交接 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 101 | 略读（标题/首段/关键词） |
| 185 | `docs/integration/card-core-20261103/CARD-CORE-TEST-MATRIX.md` | 历史验收 | 测试矩阵 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 73 | 略读（标题/首段/关键词） |
| 186 | `docs/integration/card-core-20261103/CARD-FIELD-COMPATIBILITY.md` | 历史验收 | 字段兼容 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 5 | 略读（标题/首段/关键词） |
| 187 | `docs/integration/card-core-20261103/CARD-INTEGRATION-06A-DATABASE.md` | 历史验收 | CARD-INTEGRATION-06A 数据库隔离演练 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 9 | 略读（标题/首段/关键词） |
| 188 | `docs/integration/card-core-20261103/CARD-INTEGRATION-06A-PROVIDER-AND-HTTP.md` | 历史验收 | CARD-INTEGRATION-06A Provider 与 HTTP | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 10 | 略读（标题/首段/关键词） |
| 189 | `docs/integration/card-core-20261103/CARD-INTEGRATION-06A-UI-CONTRACT.md` | 历史验收 | CARD-INTEGRATION-06A UI 接口交接（本地候选） | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 24 | 略读（标题/首段/关键词） |
| 190 | `docs/integration/card-core-20261103/CARD-PROVIDER-INTEGRATION.md` | 历史验收 | Provider 集成边界 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 2 | 略读（标题/首段/关键词） |
| 191 | `docs/integration/card-core-20261103/CARD-UI-S1-RECEIPT.md` | 历史验收 | CARD-UI-S1-LINJIANGXIAN 接续记录 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 11 | 略读（标题/首段/关键词） |
| 192 | `docs/integration/card-core-20261103/CARD-UI-S2-RECEIPT.md` | 历史验收 | CARD-UI-S2-LINJIANGXIAN 本地交付 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 17 | 略读（标题/首段/关键词） |
| 193 | `docs/integration/card-core-20261103/CARD-WORLDBOOK-05B-RUNTIME-VERIFY.md` | 历史验收 | CARD-WORLDBOOK-05B-RUNTIME-VERIFY | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 28 | 略读（标题/首段/关键词） |
| 194 | `docs/integration/card-core-20261103/CARD-WORLDBOOK-COMPATIBILITY.md` | 历史验收 | 世界书兼容 | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 2 | 略读（标题/首段/关键词） |
| 195 | `docs/integration/dual-track-20261025/NINE-CLOUD-NO-DUP-BASELINE.md` | 历史验收 | NINE-CLOUD-NO-DUP-BASELINE — 唯一跨轨总表（A/B固定候选已交叉复核） | 其他: docs/integration/main-integration-20261111/FILE-DECISIONS.json | 82 | 略读（标题/首段/关键词） |
| 196 | `docs/integration/main-integration-20261111/INTEGRATION-RECEIPT.md` | 历史验收 | 新 main 独立整合候选 · 2026-11-11 | — | 78 | 略读（标题/首段/关键词） |
| 197 | `docs/integration/main-integration-20261111/LOCAL-CARDS-DEMO.md` | 历史验收 | Windows 本地角色卡演示 | — | 47 | 略读（标题/首段/关键词） |
| 198 | `docs/integration/main-integration-20261111/PR106-CLOSEOUT.md` | 历史验收 | PR #106 限定合并前收口 | — | 56 | 略读（标题/首段/关键词） |
| 199 | `docs/integration/main-integration-20261111/PR106-OVERNIGHT-STABILIZATION-REPORT.md` | 历史验收 | PR106 夜间稳定化（执行记录） | — | 60 | 略读（标题/首段/关键词） |
| 200 | `docs/integration/remaining-closeout-20261119/CLOSEOUT.md` | 历史验收 | 九霄 M1–M5 接续回执与操作步骤 | 其他: docs/integration/remaining-closeout-20261119/RESULTS.json, docs/integration/remaining-closeout-20261119/SCOPE.json | 57 | 略读（标题/首段/关键词） |
| 201 | `docs/integration/remaining-closeout-20261119/M3-DATA-POLICY-V1.md` | 安全/许可/数据 | 《九霄》M3 数据留存与恢复安全政策 V1.0 | — | 51 | 略读（标题/首段/关键词） |
| 202 | `docs/integration/remaining-closeout-20261119/M3-EXTERNAL-RECONCILIATION.md` | 历史验收 | M3 库外对账与隔离恢复验收 | — | 40 | 略读（标题/首段/关键词） |
| 203 | `docs/integration/remaining-closeout-20261119/M3-RETENTION-PREP.md` | 历史验收 | M3 数据留存、消费对账与过期备份恢复审核回执 | — | 53 | 略读（标题/首段/关键词） |
| 204 | `docs/integration/remaining-closeout-20261119/M3-SUPABASE-LIVE.md` | 安全/许可/数据 | M3：真实 Supabase 删除联测入口 | — | 108 | 略读（标题/首段/关键词） |
| 205 | `docs/sources/README.md` | 作者已签事实 | Canon 来源文件 | —；（另见 2026-10-13 安全文件清单快照哈希） | 20 | 略读（标题/首段/关键词） |
| 206 | `docs/sources/世界书_保守补全版.md` | 作者已签事实 | 《九霄》世界书 · 审核修正版（未入库） | scripts/audit/build-worldbook-draft-index.mjs 以 SHA-256 索引（改动使 pnpm worldbook:index:check 失败；非CI）+ docs/sources/worldbook-draft-index.json + .gitattributes；（另见 2026-10-13 安全文件清单快照哈希） | 1825 | 略读（标题/首段/关键词） |
| 207 | `docs/story-first/五人问卷生成提示词.md` | 其他 | 五位陌生玩家：问卷生成提示词 | — | 49 | 略读（标题/首段/关键词） |
| 208 | `docs/story-first/交付与门禁.md` | 历史验收 | 本轮隔离候选交付说明 | — | 63 | 略读（标题/首段/关键词） |
| 209 | `docs/story-first/作者审查与签署需求.md` | 历史验收 | 作者审查申请：记忆叙事与自然语言扩展（未实施、未签署） | — | 40 | 略读（标题/首段/关键词） |
| 210 | `docs/story-first/架构与功能矩阵.md` | 历史验收 | 本轮架构与功能审计 | — | 61 | 略读（标题/首段/关键词） |
| 211 | `docs/世界书Canon1.0交付说明.md` | 作者已签事实 | 《九霄》世界书 Canon 1.0：作者侧交付 | scripts/build-worldbook-reading-edition.mjs 在生成的阅读版正文中写入其路径（改名即断链；手动脚本，非CI）；（另见 2026-10-13 安全文件清单快照哈希） | 61 | 略读（标题/首段/关键词） |
| 212 | `docs/世界书作者侧交付验收索引.md` | 作者已签事实 | 《九霄》世界书作者侧交付验收索引 | scripts/write-worldbook-author-handoff.mjs（AGENTS 禁止重跑）；（另见 2026-10-13 安全文件清单快照哈希） | 26 | 略读（标题/首段/关键词） |
| 213 | `docs/世界书分支协作说明-远端指引副本.md` | 历史验收 | 世界书分支协作说明：远端 AGENTS.md 副本 | —；（另见 2026-10-13 安全文件清单快照哈希） | 11 | 略读（标题/首段/关键词） |
| 214 | `docs/世界书剧情禁则与NPC认知验收样例.md` | 作者已签事实 | 《九霄》Canon 1.0 剧情禁则与 NPC 认知验收样例 | —；（另见 2026-10-13 安全文件清单快照哈希） | 34 | 略读（标题/首段/关键词） |
| 215 | `docs/世界书四场景内容选择与资产缺口.md` | 作者已签事实 | 《九霄》首批四场景内容选择与资产缺口 | —；（另见 2026-10-13 安全文件清单快照哈希） | 23 | 略读（标题/首段/关键词） |
| 216 | `docs/世界书核验状态更正.md` | 作者已签事实 | 《九霄》世界书核验状态更正 | —；（另见 2026-10-13 安全文件清单快照哈希） | 13 | 略读（标题/首段/关键词） |
| 217 | `docs/九境五域世界书依据表.md` | 作者已签事实 | 九境五域：世界书依据表 | —；（另见 2026-10-13 安全文件清单快照哈希） | 41 | 略读（标题/首段/关键词） |
| 218 | `docs/九境五域玩法语义矩阵.md` | 作者已签事实 | 《九霄》九境 × 五域 × 行动：作者侧玩法语义矩阵 | 其他: outputs/acceptance-correction-20261003/九霄1.0全缺口验收记录表-2026-10-03.xlsx.inspect.ndjson；（另见 2026-10-13 安全文件清单快照哈希） | 50 | 略读（标题/首段/关键词） |
| 219 | `docs/九霄1.0-AI厂商覆盖表-2026-09-30.md` | 历史验收 | AI 厂商覆盖表（BIRD-07 / G-08 工程交接） | 其他: outputs/acceptance-correction-20261003/九霄1.0全缺口验收记录表-2026-10-03.xlsx.inspect.ndjson；（另见 2026-10-13 安全文件清单快照哈希） | 57 | 略读（标题/首段/关键词） |
| 220 | `docs/九霄1.0-AI配置执行矩阵-2026-09-30.md` | 历史验收 | AI 配置执行矩阵（BIRD-08 / G-09 工程证据） | 其他: outputs/acceptance-correction-20261003/九霄1.0全缺口验收记录表-2026-10-03.xlsx.inspect.ndjson；（另见 2026-10-13 安全文件清单快照哈希） | 58 | 略读（标题/首段/关键词） |
| 221 | `docs/九霄1.0-P0双记忆契约与评审记录.md` | 作者已签事实 | 《九霄》1.0 P0：双记忆契约与评审记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 282 | 略读（标题/首段/关键词） |
| 222 | `docs/九霄1.0-P1-八项决定与润色方案-2026-10-03.md` | 作者已签事实 | 八项决定与润色方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 391 | 略读（标题/首段/关键词） |
| 223 | `docs/九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md` | 作者已签事实 | 执行规格（GPT 交付版） | **CI哈希锁：prologue-v1.test.ts:30 + P1 规则包 bundleSha256 ← apps/api/src/services/p1-review-rule-approval.test.ts:26（pnpm test）**；其他: acc/2026-10-04/P1-author-inputs/archived-candidates/prologue-v1-20261004.ts, acc/2026-10-11/P6-LONGMEM-01-evidence/read-only-hash-diagnostic.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/content-readonly-diagnostic.json 等4；（另见 2026-10-13 安全文件清单快照哈希） | 775 | 略读（标题/首段/关键词） |
| 224 | `docs/九霄1.0-P1-玩法规则与序章-交付包-起草稿-2026-10-03.md` | 过时方案 | P1 交付包 | —；（另见 2026-10-13 安全文件清单快照哈希） | 566 | 略读（标题/首段/关键词） |
| 225 | `docs/九霄1.0-P1-玩法规则与序章交付底稿-2026-10-03.md` | 过时方案 | 《九霄》1.0 P1：玩法规则与序章交付底稿 | —；（另见 2026-10-13 安全文件清单快照哈希） | 166 | 略读（标题/首段/关键词） |
| 226 | `docs/九霄1.0-Round2收尾记录-2026-10-02.md` | 历史验收 | 九霄 1.0 Round 2 收尾记录（2026-10-02） | —；（另见 2026-10-13 安全文件清单快照哈希） | 43 | 略读（标题/首段/关键词） |
| 227 | `docs/九霄1.0-S0-S2审查报告.md` | 历史验收 | 《九霄》1.0 S0–S2 复审报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 80 | 略读（标题/首段/关键词） |
| 228 | `docs/九霄1.0-S0-S2用户待办与操作手册.md` | 历史验收 | 《九霄》1.0 S0–S2 用户待办与操作手册 | —；（另见 2026-10-13 安全文件清单快照哈希） | 115 | 略读（标题/首段/关键词） |
| 229 | `docs/九霄1.0-S0-S4-Bird修复复核-2026-09-28.md` | 历史验收 | 《九霄》1.0 S0–S4：Bird 远端修复复核 | —；（另见 2026-10-13 安全文件清单快照哈希） | 74 | 略读（标题/首段/关键词） |
| 230 | `docs/九霄1.0-S0-S4缺口与Bird交接清单.md` | 历史验收 | 《九霄》1.0：S0–S4 缺口与 Bird 交接清单 | —；（另见 2026-10-13 安全文件清单快照哈希） | 61 | 略读（标题/首段/关键词） |
| 231 | `docs/九霄1.0-S0-S5本轮执行记录-2026-09-28.md` | 历史验收 | 《九霄》1.0 S0–S5 本轮执行记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 137 | 略读（标题/首段/关键词） |
| 232 | `docs/九霄1.0-S0-S5缺口基线与S6启动记录-2026-09-28.md` | 历史验收 | 《九霄》S0–S5 缺口基线与 S6 启动记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 65 | 略读（标题/首段/关键词） |
| 233 | `docs/九霄1.0-S0-S7本轮修复与人工缺口清单-2026-09-28.md` | 历史验收 | 《九霄》1.0 S0–S7 本轮修复与人工缺口清单 | —；（另见 2026-10-13 安全文件清单快照哈希） | 117 | 略读（标题/首段/关键词） |
| 234 | `docs/九霄1.0-S1工程基线.md` | 历史验收 | 《九霄》1.0 S1 工程基线 | —；（另见 2026-10-13 安全文件清单快照哈希） | 49 | 略读（标题/首段/关键词） |
| 235 | `docs/九霄1.0-S2导航与本地迁移.md` | 历史验收 | 九霄 1.0 S2：导航、建角与本地迁移阶段记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 94 | 略读（标题/首段/关键词） |
| 236 | `docs/九霄1.0-S2旧功能行为矩阵-2026-09-30.md` | 历史验收 | S2 旧功能行为矩阵（BIRD-01 / G-02） | —；（另见 2026-10-13 安全文件清单快照哈希） | 50 | 略读（标题/首段/关键词） |
| 237 | `docs/九霄1.0-S3S4回合衔接记录-2026-10-01.md` | 历史验收 | S3/S4 服务端回合与可见记忆衔接记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 27 | 略读（标题/首段/关键词） |
| 238 | `docs/九霄1.0-S3回合基础与待补规则.md` | 历史验收 | 《九霄》1.0 S3 回合基础与待补规则 | —；（另见 2026-10-13 安全文件清单快照哈希） | 67 | 略读（标题/首段/关键词） |
| 239 | `docs/九霄1.0-S4世界书审核与记忆边界.md` | 历史验收 | 《九霄》1.0 S4 世界书审核与记忆边界 | —；（另见 2026-10-13 安全文件清单快照哈希） | 68 | 略读（标题/首段/关键词） |
| 240 | `docs/九霄1.0-S6云档续接报告-2026-10-01.md` | 历史验收 | S6 云档续接工程报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 30 | 略读（标题/首段/关键词） |
| 241 | `docs/九霄1.0P0-P8玩法与双记忆阶段缺口与人工交接清单.md` | 现行工程 | 《九霄》1.0 P0–P8 玩法与双记忆专项缺口及人工交接清单 | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json；（另见 2026-10-13 安全文件清单快照哈希） | 279 | 规范句全文扫描+标题 |
| 242 | `docs/九霄1.0产品体验与11项建议落实方案.md` | 过时方案 | 《九霄》1.0 产品体验与 11 项建议落实方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 109 | 全文 |
| 243 | `docs/九霄1.0作者验收复核-2026-10-02.md` | 历史验收 | 《九霄》1.0 作者验收复核与反馈修复 | —；（另见 2026-10-13 安全文件清单快照哈希） | 133 | 略读（标题/首段/关键词） |
| 244 | `docs/九霄1.0全仓复核与技术选型-2026-09-29.md` | 历史验收 | 《九霄》1.0 全仓复核、S0–S7 缺口与技术选型 | —；（另见 2026-10-13 安全文件清单快照哈希） | 118 | 规范句全文扫描+标题 |
| 245 | `docs/九霄1.0公测版重建总方案.md` | 过时方案 | 《九霄》1.0 公测版重建总方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 117 | 全文 |
| 246 | `docs/九霄1.0内测环境方案-境外-2026-10-03.md` | 过时方案 | 《九霄》1.0 内测环境方案（境外） | —；（另见 2026-10-13 安全文件清单快照哈希） | 328 | 略读（标题/首段/关键词） |
| 247 | `docs/九霄1.0分阶段实施与AI执行清单.md` | 过时方案 | 《九霄》1.0 分阶段实施与 AI 执行清单 | —；（另见 2026-10-13 安全文件清单快照哈希） | 188 | 规范句全文扫描+标题 |
| 248 | `docs/九霄1.0剩余闭环报告-2026-10-02.md` | 历史验收 | 九霄1.0剩余闭环报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 42 | 略读（标题/首段/关键词） |
| 249 | `docs/九霄1.0双作者分工与交付门禁.md` | 现行工程 | 《九霄》1.0 双作者分工与交付门禁 | —；（另见 2026-10-13 安全文件清单快照哈希） | 105 | 规范句全文扫描+标题 |
| 250 | `docs/九霄1.0合作者修复复核-2026-10-02.md` | 历史验收 | 《九霄》合作者修复复核 | —；（另见 2026-10-13 安全文件清单快照哈希） | 103 | 略读（标题/首段/关键词） |
| 251 | `docs/九霄1.0旧功能对照与存档样本.md` | 作者已签事实 | 《九霄》1.0 旧功能对照与存档样本 | —；（另见 2026-10-13 安全文件清单快照哈希） | 123 | 略读（标题/首段/关键词） |
| 252 | `docs/九霄1.0本期工程收尾报告-2026-10-01.md` | 历史验收 | 本期工程收尾报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 43 | 略读（标题/首段/关键词） |
| 253 | `docs/九霄1.0玩法与双记忆-审阅补充与优化建议-2026-10-03.md` | 过时方案 | 审阅补充与优化建议 v4.0 | —；（另见 2026-10-13 安全文件清单快照哈希） | 680 | 略读（标题/首段/关键词） |
| 254 | `docs/九霄1.0玩法与双记忆模式分阶段实施方案.md` | 现行工程 | 《九霄》1.0 玩法与双记忆模式分阶段实施方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 471 | 规范句全文扫描+标题 |
| 255 | `docs/九霄1.0玩法与双记忆补充方案-审阅采纳裁决-2026-10-03.md` | 作者已签事实 | 审阅结论 | —；（另见 2026-10-13 安全文件清单快照哈希） | 128 | 略读（标题/首段/关键词） |
| 256 | `docs/九霄1.0环境方案-主索引与执行手册.md` | 现行工程 | 九霄 1.0 环境方案 · 主索引与执行手册 | —；（另见 2026-10-13 安全文件清单快照哈希） | 922 | 规范句全文扫描+标题 |
| 257 | `docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md` | 现行工程 | 《九霄》1.0 S0–S8 阶段缺口与人工交接清单 | 其他: acc/2026-10-02-LYL-decisions.json, outputs/acceptance-correction-20261003/九霄1.0全缺口验收记录表-2026-10-03.xlsx.inspect.ndjson；（另见 2026-10-13 安全文件清单快照哈希） | 359 | 规范句全文扫描+标题 |
| 258 | `docs/九霄P1序章Canon来源核对与候选路径.md` | 作者已签事实 | 《九霄》P1 序章 Canon 来源核对与候选路径 | —；（另见 2026-10-13 安全文件清单快照哈希） | 80 | 略读（标题/首段/关键词） |
| 259 | `docs/九霄P1序章作者原创输入登记-2026-10-03.md` | 作者已签事实 | P1 序章作者原创输入登记 | **CI哈希锁：canon.registry.json candidateDocumentSha256 ← packages/content/src/prologue/prologue-v1.test.ts（pnpm test）**；其他: acc/2026-10-11/P6-LONGMEM-01-evidence/read-only-hash-diagnostic.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/content-readonly-diagnostic.json；（另见 2026-10-13 安全文件清单快照哈希） | 41 | 略读（标题/首段/关键词） |
| 260 | `docs/九霄S6认证后端交接-2026-10-02.md` | 历史验收 | S6 认证后端闭环与前端接口交接 | —；（另见 2026-10-13 安全文件清单快照哈希） | 62 | 略读（标题/首段/关键词） |
| 261 | `docs/九霄UI1.0Pro增量实施方案-2026-10-05.md` | 过时方案 | 九霄 UI 1.0 Pro 增量实施方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 436 | 规范句全文扫描+标题 |
| 262 | `docs/九霄UI设计1.0方案.md` | 过时方案 | 九霄 UI 设计 1.0 方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 126 | 规范句全文扫描+标题 |
| 263 | `docs/九霄动态场景渲染与画质设置方案.md` | 过时方案 | 《九霄》动态场景渲染与设备画质设置 | —；（另见 2026-10-13 安全文件清单快照哈希） | 92 | 规范句全文扫描+标题 |
| 264 | `docs/九霄双人并行实施方案.md` | 过时方案 | 《九霄》双人并行实施总方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 564 | 规范句全文扫描+标题 |
| 265 | `docs/九霄素材名称与页面映射-2026-09-28.md` | 现行工程 | 《九霄》补充素材名称与页面映射 | —；（另见 2026-10-13 安全文件清单快照哈希） | 115 | 规范句全文扫描+标题 |
| 266 | `docs/九霄首段任务四态验收脚本.md` | 其他 | 《九霄》首段任务：正常、失败、取消、无模型四态验收脚本 | —；（另见 2026-10-13 安全文件清单快照哈希） | 39 | 略读（标题/首段/关键词） |
| 267 | `docs/九霄首段剧情骨架与人物边界草案.md` | 其他 | 《九霄》首段剧情骨架与人物边界（作者侧草案） | —；（另见 2026-10-13 安全文件清单快照哈希） | 42 | 略读（标题/首段/关键词） |
| 268 | `docs/合作者执行方案.md` | 过时方案 | 《九霄》合作者执行方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 139 | 规范句全文扫描+标题 |
| 269 | `docs/技术联合负责人执行方案.md` | 过时方案 | 《九霄》技术联合负责人执行方案 | —；（另见 2026-10-13 安全文件清单快照哈希） | 170 | 规范句全文扫描+标题 |
| 270 | `docs/本地服务链配置与验收.md` | 现行工程 | 本地服务链配置与验收 | —；（另见 2026-10-13 安全文件清单快照哈希） | 120 | 规范句全文扫描+标题 |
| 271 | `docs/登录体系闭环与低成本实施任务书-2026-10-06.md` | 现行工程 | 九霄网站登录体系闭环与低成本实施任务书 | —；（另见 2026-10-13 安全文件清单快照哈希） | 286 | 略读（标题/首段/关键词） |
| 272 | `docs/自主决策记录.md` | 历史验收 | P 阶段自主决策记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 300 | 略读（标题/首段/关键词） |
| 273 | `docs/部署形态可行性分析-宝塔-Vercel-Cloudflare-2026-10-03.md` | 过时方案 | 部署形态可行性分析 v3.0 | —；（另见 2026-10-13 安全文件清单快照哈希） | 483 | 略读（标题/首段/关键词） |
| 274 | `docs/青鸟AI配置体验与能力分期.md` | 现行工程 | 青鸟 AI 配置体验与能力分期 | —；（另见 2026-10-13 安全文件清单快照哈希） | 146 | 规范句全文扫描+标题 |
| 275 | `docs/青鸟推荐模型价格与采样兼容审计-2026-09-28.md` | 历史验收 | 青鸟推荐：价格快照与采样参数核验 | —；（另见 2026-10-13 安全文件清单快照哈希） | 76 | 略读（标题/首段/关键词） |
| 276 | `docs/项目现状与技术全景.md` | 历史验收 | 《九霄 WEB》项目现状与技术全景 | —；（另见 2026-10-13 安全文件清单快照哈希） | 241 | 规范句全文扫描+标题 |
| 277 | `docs/项目结构地图.md` | 现行工程 | 《九霄》项目结构地图 | —；（另见 2026-10-13 安全文件清单快照哈希） | 96 | 规范句全文扫描+标题 |
| 278 | `outputs/README.md` | 现行工程 | 试玩产物与资料区 | —；（另见 2026-10-13 安全文件清单快照哈希） | 23 | 规范句全文扫描+标题 |
| 279 | `outputs/cloudflare-onboard/操作手册.md` | 现行工程 | Cloudflare 接入操作手册 — juxiaogame.cn | —；（另见 2026-10-13 安全文件清单快照哈希） | 167 | 略读（标题/首段/关键词） |
| 280 | `outputs/九霄WEB-1.0/0号试玩计划.md` | 历史验收 | 0号试玩版：范围与两阶段计划 | —；（另见 2026-10-13 安全文件清单快照哈希） | 35 | 略读（标题/首段/关键词） |
| 281 | `outputs/九霄WEB-1.0/1.0剩余工作.md` | 历史验收 | 1.0 剩余工作与验收标准 | —；（另见 2026-10-13 安全文件清单快照哈希） | 36 | 略读（标题/首段/关键词） |
| 282 | `outputs/九霄WEB-1.0/JSON修复说明.md` | 第三方/生成 | 2026-09-13：AI JSON 兼容性修复 | work/document_json_fix.py 生成；（另见 2026-10-13 安全文件清单快照哈希） | 12 | 略读（标题/首段/关键词） |
| 283 | `outputs/九霄WEB-1.0/source/README.md` | 第三方/生成 | 九霄 WEB 源码 | work/package_source.py 生成；（另见 2026-10-13 安全文件清单快照哈希） | 9 | 略读（标题/首段/关键词） |
| 284 | `outputs/九霄WEB-1.0/source/vendor/anime.LICENSE.md` | 第三方/生成 | The MIT License | —；（另见 2026-10-13 安全文件清单快照哈希） | 9 | 略读（标题/首段/关键词） |
| 285 | `outputs/九霄WEB-1.0/使用说明.md` | 历史验收 | 九霄 WEB 1.0 · 开发预览 | work/checkpoint*.py、finalize_ai_docs.py 追加写入；（另见 2026-10-13 安全文件清单快照哈希） | 50 | 略读（标题/首段/关键词） |
| 286 | `outputs/九霄WEB-1.0/多AI接入说明.md` | 历史验收 | 多 AI 接入与调度预览 | —；（另见 2026-10-13 安全文件清单快照哈希） | 61 | 略读（标题/首段/关键词） |
| 287 | `outputs/九霄WEB-1.0/开发恢复记录.md` | 历史验收 | 九霄 WEB 1.0 开发恢复检查点 | work/checkpoint*.py、finalize_ai_docs.py 追加写入；（另见 2026-10-13 安全文件清单快照哈希） | 94 | 略读（标题/首段/关键词） |
| 288 | `outputs/九霄WEB-1.0/当前续接点.md` | 第三方/生成 | 2026-09-13：AI JSON 兼容性修复 | work/finalize_ai_docs.py 生成；（另见 2026-10-13 安全文件清单快照哈希） | 51 | 略读（标题/首段/关键词） |
| 289 | `outputs/九霄WEB-1.0/核心稳定性修复说明.md` | 历史验收 | 核心稳定性修复 · 2026-09-14 | —；（另见 2026-10-13 安全文件清单快照哈希） | 15 | 略读（标题/首段/关键词） |
| 290 | `outputs/九霄WEB-1.0/移动端UI复刻报告.md` | 历史验收 | 《九霄 WEB》移动端 UI 复刻报告 | —；（另见 2026-10-13 安全文件清单快照哈希） | 82 | 略读（标题/首段/关键词） |
| 291 | `outputs/九霄WEB-1.0/移动端定点修复说明.md` | 历史验收 | 移动端定点修复 · 2026-09-15 | —；（另见 2026-10-13 安全文件清单快照哈希） | 23 | 略读（标题/首段/关键词） |
| 292 | `outputs/九霄WEB-1.0/试玩反馈模板.md` | 其他 | 九霄0号试玩反馈 | —；（另见 2026-10-13 安全文件清单快照哈希） | 16 | 略读（标题/首段/关键词） |
| 293 | `outputs/九霄WEB-1.0/试玩验收与恢复指南.md` | 历史验收 | 0号试玩：验收与恢复 | —；（另见 2026-10-13 安全文件清单快照哈希） | 38 | 略读（标题/首段/关键词） |
| 294 | `outputs/九霄世界书/01_地理与区域_游戏版.md` | 历史验收 | 九霄世界书：地理与区域 | —；（另见 2026-10-13 安全文件清单快照哈希） | 51 | 略读（标题/首段/关键词） |
| 295 | `outputs/九霄世界书/01_地理与区域_转换审核记录.md` | 历史验收 | 九霄世界书转换审核记录：地理与区域 | —；（另见 2026-10-13 安全文件清单快照哈希） | 39 | 略读（标题/首段/关键词） |
| 296 | `outputs/九霄世界书/README.md` | 作者已签事实 | 世界书交付目录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 7 | 略读（标题/首段/关键词） |
| 297 | `outputs/九霄世界书/九霄世界书_Canon1.0_来源审核表.md` | 作者已签事实 | 《九霄》世界书 Canon 1.0 来源与缺口审核表 | scripts/build-worldbook-reading-edition.mjs 生成；scripts/test-worldbook-final.mjs 逐字校验（手动脚本，非CI；手改即失配）；（另见 2026-10-13 安全文件清单快照哈希） | 63 | 略读（标题/首段/关键词） |
| 298 | `outputs/九霄世界书/九霄世界书_Canon1.0_正式阅读版.md` | 作者已签事实 | 《九霄》世界书 Canon 1.0 正式阅读版 | scripts/build-worldbook-reading-edition.mjs 生成；scripts/test-worldbook-final.mjs 逐字校验（手动脚本，非CI；手改即失配）；（另见 2026-10-13 安全文件清单快照哈希） | 982 | 略读（标题/首段/关键词） |
| 299 | `outputs/九霄世界书/原设恢复与待核对记录.md` | 历史验收 | 原设恢复与待核对记录 | —；（另见 2026-10-13 安全文件清单快照哈希） | 18 | 略读（标题/首段/关键词） |
| 300 | `outputs/九霄运行结构分析.md` | 历史验收 | 九霄：运行结构与开发依据 | —；（另见 2026-10-13 安全文件清单快照哈希） | 160 | 略读（标题/首段/关键词） |
| 301 | `outputs/设定截图OCR汇编.md` | 第三方/生成 | 182 张设定截图 OCR 原始汇编（未校订，脚本生成） | work/package.py 生成；（另见 2026-10-13 安全文件清单快照哈希） | 6570 | 略读（标题/首段/关键词） |
| 302 | `tests/experiments/p6-adapter-01/README.md` | 历史验收 | P6-ADAPTER-01（REVIEW_READY阶段的独立原型） | tests: exp/p6-adapter-01/evidence/delivery-01/summary.json, exp/p6-adapter-01/evidence/delivery-02/summary.json | 21 | 略读（标题/首段/关键词） |
| 303 | `tests/experiments/p6-adapter-01/reports/P6-ADAPTER-01-契约测试与验收报告.md` | 历史验收 | P6-ADAPTER-01 契约测试与验收报告 | tests: exp/p6-adapter-01/evidence/delivery-01/summary.json, exp/p6-adapter-01/evidence/delivery-02/summary.json | 52 | 略读（标题/首段/关键词） |
| 304 | `tests/experiments/p6-adapter-01/reports/P6-ADAPTER-01-性能对比报告.md` | 历史验收 | P6-ADAPTER-01 性能对比报告 | tests: exp/p6-adapter-01/evidence/delivery-01/summary.json, exp/p6-adapter-01/evidence/delivery-02/summary.json | 55 | 略读（标题/首段/关键词） |
| 305 | `tests/experiments/p6-adapter-01/reports/P6-ADAPTER-01-模块接入与Reader对接说明.md` | 历史验收 | P6-ADAPTER-01 模块接入与Reader对接说明 | tests: exp/p6-adapter-01/evidence/delivery-01/summary.json, exp/p6-adapter-01/evidence/delivery-02/summary.json | 72 | 略读（标题/首段/关键词） |
| 306 | `tests/experiments/p6-integration-ready/CHECKPOINT-20261013.md` | 历史验收 | P6-INTEGRATION-READY-01 暂停恢复断点｜2026-10-13 | tests: exp/p6-integration-ready/evidence/delivery-01/summary.json, exp/p6-integration-ready/evidence/resume-01/summary.json | 96 | 略读（标题/首段/关键词） |
| 307 | `tests/experiments/p6-integration-ready/README.md` | 历史验收 | P6-INTEGRATION-READY-01（独立离线待审提案） | tests: exp/p6-integration-ready/evidence/delivery-01/summary.json, exp/p6-integration-ready/evidence/resume-01/summary.json | 26 | 略读（标题/首段/关键词） |
| 308 | `tests/experiments/p6-integration-ready/reports/P6-INTEGRATION-READY-01-接入准备报告.md` | 历史验收 | P6-INTEGRATION-READY-01 接入准备报告 | tests: exp/p6-integration-ready/evidence/delivery-01/summary.json | 54 | 略读（标题/首段/关键词） |
| 309 | `tests/experiments/p6-integration-ready/reports/P6-P3-数据契约需求清单.md` | 历史验收 | P6 → P3 数据契约需求清单 | tests: exp/p6-integration-ready/evidence/delivery-01/summary.json | 53 | 略读（标题/首段/关键词） |
| 310 | `tests/experiments/p6-integration-ready/reports/P6-长期记忆对抗测试与性能评测报告.md` | 历史验收 | P6 长期记忆对抗测试与性能评测报告 | tests: exp/p6-integration-ready/evidence/delivery-01/summary.json | 63 | 略读（标题/首段/关键词） |
| 311 | `tests/experiments/p6-longmem-05b/README.md` | 历史验收 | P6-LONGMEM-05B：H-14-2最小实验修复 | — | 13 | 略读（标题/首段/关键词） |
| 312 | `tests/experiments/p6-longmem-05c/CHECKPOINT.md` | 历史验收 | ﻿# P6-LONGMEM-05C final checkpoint | tests: exp/p6-longmem-05c/file-manifest.json | 14 | 略读（标题/首段/关键词） |
| 313 | `tests/experiments/p6-longmem-05c/README.md` | 历史验收 | P6-LONGMEM-05C 独立研发候选 | tests: exp/p6-longmem-05c/file-manifest.json | 29 | 略读（标题/首段/关键词） |
| 314 | `tests/experiments/p6-longmem-05c/evidence/environment-events.md` | 历史验收 | ﻿# Environment events retained | tests: exp/p6-longmem-05c/deliver.cjs, exp/p6-longmem-05c/file-manifest.json | 7 | 略读（标题/首段/关键词） |
| 315 | `tests/experiments/p6-longmem-05c/reports/P6万回合性能及资源对比报告.md` | 历史验收 | P6 万回合性能及资源对比报告 | tests: exp/p6-longmem-05c/deliver.cjs, exp/p6-longmem-05c/file-manifest.json | 106 | 略读（标题/首段/关键词） |
| 316 | `tests/experiments/p6-longmem-05c/reports/P6安全回归与新增失败清单.md` | 历史验收 | P6 安全回归与新增失败清单 | tests: exp/p6-longmem-05c/deliver.cjs, exp/p6-longmem-05c/file-manifest.json | 38 | 略读（标题/首段/关键词） |
| 317 | `tests/experiments/p6-longmem-05c/reports/P6提交临江仙的融合候选成果清单.md` | 历史验收 | P6 提交临江仙的融合候选成果清单 | tests: exp/p6-longmem-05c/deliver.cjs, exp/p6-longmem-05c/file-manifest.json | 58 | 略读（标题/首段/关键词） |
| 318 | `tests/experiments/p6-longmem-05c/reports/P6长期记忆检索算法强化报告.md` | 历史验收 | P6 长期记忆检索算法强化报告 | tests: exp/p6-longmem-05c/deliver.cjs, exp/p6-longmem-05c/file-manifest.json | 54 | 略读（标题/首段/关键词） |
| 319 | `tests/experiments/p6-longmem-05c/reports/P6长篇剧情测试集与准确率报告.md` | 历史验收 | P6 长篇剧情测试集与准确率报告 | tests: exp/p6-longmem-05c/deliver.cjs, exp/p6-longmem-05c/file-manifest.json | 53 | 略读（标题/首段/关键词） |
| 320 | `tests/experiments/p6-longmem-06/CHECKPOINT.md` | 历史验收 | P6-LONGMEM-06 恢复断点 | tests: exp/p6-longmem-06/file-manifest.json | 20 | 略读（标题/首段/关键词） |
| 321 | `tests/experiments/p6-longmem-06/README.md` | 历史验收 | P6-LONGMEM-06 独立融合候选 | tests: exp/p6-longmem-06/file-manifest.json, exp/p6-longmem-06a/file-manifest.json | 34 | 略读（标题/首段/关键词） |
| 322 | `tests/experiments/p6-longmem-06/evidence/batch-history.md` | 历史验收 | ﻿# 保留集批次变更记录 | tests: exp/p6-longmem-06/file-manifest.json | 9 | 略读（标题/首段/关键词） |
| 323 | `tests/experiments/p6-longmem-06/reports/P6-LONGMEM-06传闻与权威事实隔离报告.md` | 历史验收 | P6-LONGMEM-06 传闻与权威事实隔离报告 | tests: exp/p6-longmem-06/deliver.cjs, exp/p6-longmem-06/file-manifest.json | 34 | 略读（标题/首段/关键词） |
| 324 | `tests/experiments/p6-longmem-06/reports/P6-LONGMEM-06历史对白完整性修复报告.md` | 历史验收 | P6-LONGMEM-06 历史对白完整性修复报告 | tests: exp/p6-longmem-06/deliver.cjs, exp/p6-longmem-06/file-manifest.json, exp/p6-longmem-06/finalize.cjs | 53 | 略读（标题/首段/关键词） |
| 325 | `tests/experiments/p6-longmem-06/reports/P6-LONGMEM-06承诺与历史状态检索报告.md` | 历史验收 | P6-LONGMEM-06 承诺与历史状态检索报告 | tests: exp/p6-longmem-06/deliver.cjs, exp/p6-longmem-06/file-manifest.json | 30 | 略读（标题/首段/关键词） |
| 326 | `tests/experiments/p6-longmem-06/reports/P6-LONGMEM-06新保留集与安全验收报告.md` | 历史验收 | P6-LONGMEM-06 新保留集与安全验收报告 | tests: exp/p6-longmem-06/deliver.cjs, exp/p6-longmem-06/file-manifest.json | 73 | 略读（标题/首段/关键词） |
| 327 | `tests/experiments/p6-longmem-06/reports/P6-LONGMEM-06最终融合候选与交接清单.md` | 历史验收 | P6-LONGMEM-06 最终融合候选与交接清单 | tests: exp/p6-longmem-06/deliver.cjs, exp/p6-longmem-06/file-manifest.json | 59 | 略读（标题/首段/关键词） |
| 328 | `tests/experiments/p6-longmem-06a/P6-LONGMEM-06A历史引号边界误拒报告.md` | 历史验收 | P6-LONGMEM-06A 历史引号边界误拒报告 | tests: exp/p6-longmem-06a/file-manifest.json | 53 | 略读（标题/首段/关键词） |
| 329 | `tests/experiments/p6-longmem-06a/README.md` | 历史验收 | P6-LONGMEM-06A 历史引号边界误拒：保守停止候选 | tests: exp/p6-longmem-06a/file-manifest.json | 19 | 略读（标题/首段/关键词） |
| 330 | `tests/experiments/p6-longmem-06a/环境与失败记录.md` | 历史验收 | 1. 新06A副本建分支命令首次被自动审批拒绝，理由为可能操作原06工作区；命令未执行。随后只读确认06A不是链接、其.git独立、原06干 | tests: exp/p6-longmem-06a/file-manifest.json | 5 | 略读（标题/首段/关键词） |
| 331 | `tests/experiments/p6-longmem-durability/README.md` | 历史验收 | P6-LONGMEM-04-PRE：原始剧情文件保存原型 | tests: exp/p6-longmem-durability/evidence/summary.json | 46 | 略读（标题/首段/关键词） |
| 332 | `tests/experiments/p6-longmem-hardening/README.md` | 历史验收 | P6-LONGMEM-02 独立实验 | 其他: acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json | 27 | 略读（标题/首段/关键词） |
| 333 | `tests/experiments/p6-longmem-prose/README.md` | 历史验收 | P6-LONGMEM-03：长期剧情原文检索强化（独立实验） | tests: exp/p6-longmem-prose/delivery-manifest.json | 40 | 略读（标题/首段/关键词） |
| 334 | `tests/experiments/p6-longmem-reliability/README.md` | 历史验收 | P6-LONGMEM-04：原文可靠性与万回合离线闭环 | — | 26 | 略读（标题/首段/关键词） |
| 335 | `tests/experiments/p6-longmem/README.md` | 历史验收 | P6-LONGMEM-01：离线长剧情评测 | 其他: acc/2026-10-11/P6-LONGMEM-01-evidence/review/verification.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/integrity.json, acc/2026-10-12/P6-MAIN-SYNC-01-evidence/p6-01-original-verification.json；tests: exp/p6-longmem-05c/file-manifest.json, exp/p6-longmem-06/file-manifest.json, exp/p6-longmem-06a/file-manifest.json | 75 | 略读（标题/首段/关键词） |
| 336 | `tests/fixtures/legacy/README.md` | 现行工程 | 旧档测试样本 | —；（另见 2026-10-13 安全文件清单快照哈希） | 7 | 规范句全文扫描+标题 |
| 337 | `work/README.md` | 现行工程 | 原型工作区说明 | work/package_source.py；（另见 2026-10-13 安全文件清单快照哈希） | 37 | 规范句全文扫描+标题 |
| 338 | `work/vendor/anime.LICENSE.md` | 第三方/生成 | The MIT License | —；（另见 2026-10-13 安全文件清单快照哈希） | 9 | 略读（标题/首段/关键词） |
| 339 | `九霄素材-水墨古风/README.md` | 安全/许可/数据 | 九霄水墨风格候选素材 | —；（另见 2026-10-13 安全文件清单快照哈希） | 21 | 全文 |
| 340 | `九霄素材-水墨古风/素材说明-README.md` | 第三方/生成 | 《九霄 WEB》水墨古风素材包 · 说明清单 | —；（另见 2026-10-13 安全文件清单快照哈希） | 220 | 规范句全文扫描+标题 |
| 341 | `问卷调查分析/00-README.md` | 其他 | 《九霄》玩家需求调查 · 回收与分析 | —；（另见 2026-10-13 安全文件清单快照哈希） | 51 | 略读（标题/首段/关键词） |
| 342 | `问卷调查分析/01-总览与关键结论.md` | 其他 | 01 · 总览与关键结论 | —；（另见 2026-10-13 安全文件清单快照哈希） | 60 | 略读（标题/首段/关键词） |
| 343 | `问卷调查分析/02-分版块详细分析.md` | 其他 | 02 · 分版块详细分析 | —；（另见 2026-10-13 安全文件清单快照哈希） | 183 | 略读（标题/首段/关键词） |
| 344 | `问卷调查分析/03-开放题原文与主题编码.md` | 其他 | 03 · 开放题原文与主题编码 | —；（另见 2026-10-13 安全文件清单快照哈希） | 107 | 略读（标题/首段/关键词） |
| 345 | `问卷调查分析/04-对开发决策的建议.md` | 其他 | 04 · 对开发决策的建议 | —；（另见 2026-10-13 安全文件清单快照哈希） | 67 | 略读（标题/首段/关键词） |
