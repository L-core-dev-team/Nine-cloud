# 九霄统一知识体系与制度修订：最终候选（草案，未生效）

- 性质：**只是候选**。本文没有修改、提交或推送任何分支或 PR。每一条修订都要作者逐条批准，并在实施 PR 中落地后才生效。
- 读取基线：
  - `main` = `f1fe6ea`；
  - PR #123 = `chore/repository-structure-audit-20261126` @ `e3c2be5`，三个提交，基于 `f1fe6ea`，共 34 个文件；
  - PR #124 = `docs/vision-02-claude-research` @ `0aeebfb`，base 为 #121 `docs/vision-02-art-direction` @ `4f1c314`。
- 对照材料：
  - Claude 上一轮研究：`docs/design/JX-VISION-02/claude-proposal/08-制度修订候选.md`（下称“08”）、`appendix/md-冲突矩阵.md`（下称“矩阵”）、`appendix/md-全量分类.md`；
  - 在 #124 工作区直接读取的源码、测试与 CI。
- 引用格式：`路径:行号`。#123 中的文件按 `FETCH_HEAD`（`e3c2be5`）的行号引用；其余文件按 #124 工作区 `0aeebfb` 的行号引用。

---

## 0. 结论速览

1. **#123 的导航与台账方向正确，大部分应采纳。** 我做了以下核实：
   - 五份旧导航按原 blob 归档，逐个比对 SHA，与 `main` 完全一致，例如 `README.md` 为 `3ec643b`；
   - #123 新写或改写的 15 份导航文件中，所有仓库内相对链接都能解析到真实路径（用 `git ls-tree` 逐条核对）。这顺带消除了矩阵 §4 第 2 项记录的 `docs/README-workspace-guide.md` 23 条断链。
2. **#123 与 #124（以及 #121 栈）有 6 个文件必然发生文本冲突**：`AGENTS.md`、`README.md`、`docs/README.md`、`docs/README-workspace-guide.md`、`docs/项目结构地图.md`、`docs/项目现状与技术全景.md`。
   - 处理方法：这 5 份导航文件采用 #123 的重写版，原文已归档，不再需要逐份加效力声明；在 `docs/README.md` 和根 `README.md` 的任务表中补一行 VISION 02；`AGENTS.md` 由两边的块合并而成。
   - 做完之后，B 组需要补强声明的文件从 17 份降到 12 份。
3. **采用一条唯一权威链**：L0 宪章 → L1 ADR → L2 现行规范与已签事实 → L3 状态与实施清单 → L4 研究提案 → L5 历史与证据。
   - 每份文档的效力**只在一个地方登记**：拟议的 `docs/repository/doc-status.tsv`。
   - 被哈希锁定的文件不能加头部声明，只在登记表和旁注里说明效力。
4. **A 组 14 处**的处理如下（详见 §3.1）：
   - 3 处已被 #123 解决，即 A7、A8 和 23 条断链；
   - 1 处是研究文件里的过时数字，即 A14；
   - 其余 10 处按下文文本处理：只加声明或补记，不改签署正文。
5. **C 组三道门禁应改造，而不是删除。** “未授权素材或试验包不得进入发布物”这条原则保留；需要改的是检测对象，以及视觉断言所用的基线来源。
   - 本轮更正 Claude 矩阵 §5 的一处事实错误：`tests/e2e/foundation.cjs:19` 当前的冻结基线是 `d73e0b7`，作者在 2026-10-08 批准了这次重置。矩阵写的 `69471c7` 是被它取代的旧基线。
6. **10 份 CI 哈希锁定文件一律不改原字节。** 升级走第 4 节的流程：新版本文件、新摘要、两人批准、测试同步，并保留旧摘要的回归测试。
   - 有一个前提冲突需要作者确认：`docs/acceptance/2026-11-07/PR00-基线与分支差异.md:74` 写着“2026-11-07 决定不保留 Bird 与 LYL 双作者签收作为后续门禁”，而本任务要求“双作者批准”。见 §4.4。

---

## 1. PR #123 逐份阅读

### 1.1 叙述性文档（16 份）

| # | 路径 | 作用 | 关键主张（行号） |
|---|---|---|---|
| 1 | `AGENTS.md` | 在原世界书一节前新增“九霄协作导航（先读）”块 | 第 3 行：先确认 branch/HEAD/工作区，不动他人分支，不强推。第 4 行：先读 `docs/README.md`，全量台账只在审计时读取。第 5 行：命令以 `package.json` 和 CI 为准；未执行的测试标 NOT RUN。第 6 行：不裁决 VISION 02 与文学研究，“不将 main 的历史审美说明覆盖候选研究”。第 7 行：不按路径删除历史。第 8 行：根指令保持精简。第 10–18 行：原世界书一节一字未动 |
| 2 | `README.md` | 原 688 行首页改写为 49 行 | 第 6 行：版本以 `package.json`、构建指纹与发布回执为准，未检测到 Release。第 11–20 行：“我想做什么 → 入口”任务表。第 24–36 行：目录职责。第 45 行：完整验证命令。第 49 行：未见根 LICENSE，公开仓库不等于开源授权 |
| 3 | `docs/README.md` | 唯一通用文档入口，按任务分流 | 第 3 行：日期不是权威证明。第 5–14 行：任务 → 首读 → 补充。第 9 行：设计首读 PRODUCT/DESIGN，“正在进行的创意研究保持独立，不在 main 假定批准”。第 16 行：acceptance、audit、audits、integration 含门禁输入，不能随意搬迁。第 18 行：旧长索引用 SHA 永久链接保留 |
| 4 | `docs/README-workspace-guide.md` | 本地开发指南 | 第 7–10 行：Node ≥24、pnpm 11.19.0、独立 worktree。第 14–23 行：验证命令表。第 25 行：scene-studio/scene-gate 不进生产递归构建。第 27 行：`work`、`outputs` 仍可能被回归依赖 |
| 5 | `docs/项目结构地图.md` | 代码入口地图 | 第 5–19 行：分层职责。第 21–28 行：实测的构建依赖，包括 `work/core-regression.cjs`、`worldbook:runtime:check`、`media-release-check`、`pages-preview` 读取审批 JSON、`write-closeout-packets` 读取 `FINAL_HUMAN_GATES.md`。第 32 行：模型文本、作者 Canon、权威结算与发布许可必须分开 |
| 6 | `docs/项目现状与技术全景.md` | 原文改为导航短页 | 第 3 行：原文是 2026-09-22 单 HTML 阶段的快照，不得再报告“无后端” |
| 7 | `docs/repository/README.md` | 治理区入口 | 第 3 行：保护所有开放 PR 和活跃分支。第 15 行：本分支未执行运行时测试 |
| 8 | `docs/repository/STATUS.md` | 状态与权威路由 | 第 5–14 行：问题 → 首选依据。第 8 行：Canon 34 条，与 AGENTS 一致。第 13 行：#120、#121、#122 是未合并的独立研究。第 14 行：“11-07 以后不再将 Bird/LYL 联合签收当成普遍门禁”，但没有给出处，出处见 §4.4。第 16 行：未验证的写 UNKNOWN 或 NOT RUN |
| 9 | `docs/repository/GOVERNANCE.md` | 文档职责、分支生命周期、资产与证据、验收 | 第 5 行：根 README 与 AGENTS 分工；不新增竞争性的 CLAUDE.md，不改 DESIGN/PRODUCT。第 7 行：文档状态词表 `ACTIVE_GUIDE / DECISION / DRAFT / EVIDENCE / HISTORICAL / GENERATED / UNKNOWN`，历史签署原文不改写。第 8 行：新规范必须写清适用范围、反例、证据和责任人。第 9 行：文档整理不改变艺术自由与作者裁决。第 13–16 行：分支命名与 HOLD 规则；不 force push，不自动删除。第 20–22 行：资产与证据的保留期限。第 26 行：结构 PR 的验收要求 |
| 10 | `docs/repository/MIGRATION.md` | 分阶段迁移 | 第 3–7 行：阶段 A 只动导航，不移动任何运行时文件。第 11–20 行：阶段 B 候选及迁移前提。第 22–28 行：每批迁移的五道门禁，包括反向依赖、可恢复归档、原子迁移和干净检出全测 |
| 11 | `docs/repository/AUDIT.md` | 量化审计 | 第 3 行：5027 文件，约 1.0 GB，141 条分支，121 个 PR。第 7–23 行：15 类路径分类。第 25 行：95 组重复 blob，删除不会减少历史容量。第 43–45 行：未验证项，包括 clone 时 DNS 失败、未逐字阅读全部文件 |
| 12 | `docs/repository/BRANCH-REVIEW.md` | 分支可达性证明 | 第 3 行：732 个 commit 的 parent 闭合证明。第 9–14 行：111 条可达、30 条不可达；100 条为清退候选，13 条分叉。第 18–20 行：可达不等于授权删除。第 26–45 行：13 条分叉分支的 compare 结果，全部 HOLD |
| 13 | `docs/repository/SOURCES.md` | 外部方法依据 | OpenAI harness、Anthropic Claude Code、VS Code、Kubernetes 归档、GitHub、Diátaxis |
| 14 | `docs/repository/inventory/README.md` | 台账说明 | 第 3 行：快照不会自动同步。第 14 行：表中的 SHA 是 Git blob SHA，不是 SHA-256 |
| 15 | `docs/archive/README.md` | 历史入口 | 第 3–11 行：列出原位保留的历史目录。第 7 行把 `outputs/九霄世界书/` 列入“历史”，但同时注明正式内容不是历史垃圾。第 13 行：旧方案不因归档变成当前规则 |
| 16 | `docs/archive/navigation-2026-11-26/README.md` | 旧导航原件表 | 第 5–11 行：原路径、SHA 永久链接与 blob SHA 对应。第 13 行：归档文件中的艺术约束不由归档继承为现行制度 |

### 1.2 机器可读台账与归档原件（18 份）

- **5 份原样归档**：`docs/archive/navigation-2026-11-26/` 下的 5 个 `.md`。经核对，blob 与 `main` 完全相同。
- **13 份台账**：`docs/repository/inventory/` 下的 13 个 `.tsv`，共 9 万余行。
  - 包括：`files-*.tsv` 全路径文件表；`markdown.tsv`（323 行，`f1fe6ea` 时的 Markdown 及初步分类）；`branches.tsv`、`branch-*.tsv`；`main-ancestry.tsv`；`pull-requests.tsv`；`duplicate-blobs.tsv`；`categories.tsv`。
  - 观察 1：台账没有附带生成脚本，无法重算。
  - 观察 2：快照已经开始过时。例如 `branches.tsv` 记录的 `docs/vision-02-claude-research` tip 是 `67d9c93`，现在是 `0aeebfb`。`inventory/README.md:3` 已声明“不会自动同步”，这一点本身没有问题。

### 1.3 #123 对根文件的处理

| 文件 | #123 的动作 | 依据 |
|---|---|---|
| `AGENTS.md` | 在文件顶部插入 8 行导航块 | diff 第 1–9 行 |
| `CLAUDE.md` | 不新增，不修改 | `GOVERNANCE.md:5` |
| `README.md` | 全文改写 | — |
| `DESIGN.md` / `PRODUCT.md` / `SECURITY.md` | 不改 | `MIGRATION.md:6` |

---

## 2. 唯一权威层级

### 2.1 层级、文件与修改权

“谁有权修改”的角色以 `docs/九霄1.0双作者分工与交付门禁.md:11-13` 为准：

- **作者 A（LYL）**：产品、Canon、体验与审美；
- **作者 B（Bird）**：规则契约、工程、安全与证据。

两条底线：AI 代理只能起草，不能代签；任何层的修改都必须走 PR。

| 层 | 名称 | 放哪些文件 | 谁可以改 | 怎样改 |
|---|---|---|---|---|
| **L0** | 宪章与产品原则 | `PRODUCT.md`（产品原则、无障碍、诚实）；`DESIGN.md`（VISION 02 开放艺术宪章）；`SECURITY.md`；`AGENTS.md` 的“世界书状态”一节（Canon 纪律） | 作者 A 和 B 共同批准。如果作者确认沿用 11-07 决定，则由该条款的指定拥有者批准，另加一名独立复核 | 改正文要走 PR，并附批准原话的出处。L0 只写原则，不写具体的颜色、框架或数值 |
| **L1** | 决定记录（ADR） | `docs/adr/0001`–`0008`，拟议 `0009`；新增 `docs/adr/README.md` 索引和 `TEMPLATE.md` | 按决定所属领域由拥有者批准；跨域决定要两人批准 | 已采纳的 ADR **正文不改**，只允许在“状态”行追加 `状态补记`，或写“被 ADR NNNN 取代”。推翻一项决定要另写新 ADR |
| **L2a** | 已签事实（冻结） | Canon 登记 `packages/content/src/canon.registry.json` 与 `canon-runtime.json`；`docs/世界书Canon1.0交付说明.md` 等世界书文件（AGENTS 所列）；P1 已签规格及另外 9 份哈希锁定文件（见 §4）；G03/G04b；双作者批准记录 | 只有原签署人才能出新版本 | **不改原字节**，只能“新版本 + 新摘要 + 再批准”，见 §4 |
| **L2b** | 现行规范 | `packages/contracts`（以代码为准）；`M3-DATA-POLICY-V1.md`；媒体许可清单 `apps/web/public/scenes/candidate/asset-manifest.json`；拟新建的 `docs/spec/`（视觉断言登记、资产权利与 AIGC 标识、渲染依赖登记、测试诚实规范、文档效力模板） | 领域拥有者批准，另一领域的作者知情 | 规范直接改，旧版本靠 Git 历史和 `CHANGELOG` 段追溯；凡是放宽断言，都必须在 PR 中逐条列出 |
| **L3** | 状态与实施清单 | `docs/repository/STATUS.md`（唯一状态路由）；`docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md`（S 轨唯一维护处）；`docs/九霄1.0P0-P8玩法与双记忆阶段缺口与人工交接清单.md`（P 轨）；`docs/FINAL_HUMAN_GATES.md`（模板，被 `write-closeout-packets.mjs` 读取，不能移动） | 任何协作者都可以更新，但每行必须带证据链接（CI run 或提交 SHA） | 状态只写在这一处，其他文档只链接，不复制 |
| **L4** | 研究与提案 | `docs/design/JX-VISION-02/**`（含 claude-proposal）；#122 文学研究；任何未采纳的方案 | 作者本人或其授权的代理 | 状态固定为 PROPOSAL。采纳时转写成 ADR 或 L2b 规范，提案文件本身保持原样 |
| **L5** | 历史与证据（只增不改） | `docs/acceptance/**`、`docs/audits/**`、`docs/audit/**`、`docs/integration/**`、`tests/experiments/**`、`docs/archive/**`、`outputs/`（除 Canon 正式阅读版）、`work/`、`.workbuddy/`、`.trae/`、`问卷调查分析/` | 任何人都不得改写 | 发现错误时，另写同目录的 `勘误-<日期>.md`，或在 L3 状态页更正；被脚本读取的证据保持原路径 |

**冲突裁决顺序**：

- 问“事实是什么”：运行代码与 CI 回执 > L2a > L3 > L5；
- 问“允许做什么”：L0 > L1 > L2 > L3 > L4。

`DESIGN.md` 属于 L0，但它只授予艺术自由，不推翻 L2a 的事实，也不推翻 L0 中 `SECURITY.md` 和 `PRODUCT.md` 的无障碍与诚实条款。这与 `DESIGN.md:9` 一致。

### 2.2 统一状态词表

本表把 #123 的 `GOVERNANCE.md:7` 和 08 的八类合并成一套：

| 状态 | 含义 | 对应 #123 | 对应 08 |
|---|---|---|---|
| `CHARTER` | L0 | ACTIVE_GUIDE 的子集 | 现行设计 / 现行工程中的根文件 |
| `ADR-ACCEPTED` / `ADR-SUPERSEDED` | L1 | DECISION | 现行工程 / 作者已签事实 |
| `SIGNED` | L2a，冻结 | DECISION（已核对生效） | 作者已签事实 |
| `SPEC` | L2b | ACTIVE_GUIDE | 现行工程 / 安全、许可、数据 |
| `STATUS` / `GUIDE` | L3 与操作指南 | ACTIVE_GUIDE | 现行工程 |
| `PROPOSAL` | L4 | DRAFT | — |
| `EVIDENCE` / `HISTORICAL` | L5 | 同名 | 历史验收 / 过时方案 |
| `GENERATED` / `THIRD_PARTY` | 生成物或外部原文 | GENERATED | 第三方或生成内容 |
| `UNKNOWN` | 待分类 | 同名 | 其他 |

附加标记，可以叠加：

- `LOCKED`：被哈希锁定，禁止加头部声明；
- `MACHINE_READ`：被脚本或测试按路径读取，禁止移动；
- `CANON`：世界书权威。

### 2.3 效力声明模板

**登记表是唯一来源**：`docs/repository/doc-status.tsv`。

- 列：`path  status  flags  layer  supersededBy  stillValid  owner  since  evidence`；
- 由 #123 的 `inventory/markdown.tsv` 加上 08 的分类合并生成；
- 头部声明只是给人看的副本，二者不一致时以登记表为准，CI 负责校验一致性（见 §5.8）。

**头部声明模板**，用于非 LOCKED 文件，放在第 1 行，或放在已有的世界书更正行之后：

```markdown
> **效力（YYYY-MM-DD 登记）：HISTORICAL｜层级 L5｜被取代：[<新文件>](<相对路径>)｜仍有效条款：<逐项列出，如数据字段、原文不改写、对比度、降级、测试诚实、许可>｜登记：[doc-status](<相对路径>/docs/repository/doc-status.tsv)**
```

**LOCKED 文件**不加头部声明，改为在同目录新建旁注 `<原文件名>.效力.md`。旁注内容是上面同一行，再加锁定机制说明。旁注不在任何 bundle 清单里，所以不会改变摘要。

### 2.4 历史归档与链接规范

1. **仓库内链接一律写相对路径。** 禁止写 `github.com/.../blob/<分支名>/...` 形式的 URL，因为分支合并或删除后链接会失效；17 条 B 组声明正是这个问题（矩阵 §2）。
2. **指向历史原文时，用提交 SHA 的永久链接**，写法沿用 #123 的 `docs/archive/navigation-2026-11-26/README.md:7-11`。
3. **归档有两种形式**：
   - 原 blob 复制到 `docs/archive/<主题>-<日期>/`，归档 README 记录原路径和 blob SHA，只适用于没有被机器读取的文件；
   - 被机器读取或被哈希绑定的文件**原位保留**，只在登记表里标 HISTORICAL。
4. **原位改写导航页**时，要么在页尾链接固定 SHA 的原文，要么在归档目录保存原 blob，二者至少做一项。#123 两项都做了，可以作为范例。
5. **新规范只能在一处现行**：任何规范性语句（“必须”“不得”）只出现在 L0–L2 中的一份文件里，其他文件只链接。有新规范时，旧文件的登记状态必须在同一个 PR 里改为 `SUPERSEDED` 或 `HISTORICAL`。

### 2.5 命名规则（只约束新文件；旧文件不改名，因为大量文件按路径或 SHA 绑定）

- ADR：`docs/adr/NNNN-<短题>.md`，四位连续编号。
- 需要再签的版本化规范：`<领域>-<主题>-v<主>.<次>.<修>-<YYYYMMDD>.md`。仓库已有先例 `P1-EXEC-SPEC-v3.1.0-20261004.md`。旧版本永不改名。
- 证据目录：`docs/acceptance/YYYY-MM-DD/<任务ID>/`，任务 ID 沿用 `P1`、`G05`、`JX-UI-E-01` 等已有体系。
- 被脚本读取的文件优先使用 ASCII 文件名。面向人读的文件可以用中文，但不要用空格和全角标点。
- 分支名沿用 `GOVERNANCE.md:13`：`<代理或人>/<类型>-<主题>-<YYYYMMDD>`。已有的 `codex/`、`claude/`、`shuilongyin/` 前缀不改。`archive/` 前缀只用于拥有者确认过的历史基线。

---

## 3. A、B、C 三组的最终处理

### 3.1 A 组 14 处

| # | 文件:行 | 最终处理 | 替代规范或声明文本（候选） |
|---|---|---|---|
| A1 | `PRODUCT.md:5` | 只改第二句（L0，需作者确认 1.0 范围口径） | “1.0 范围与发布门槛以 [ADR 0004](docs/adr/0004-1.0不含社区与收费.md)、[ADR 0006](docs/adr/0006-应用商店上架属1.0范围变更.md)、[1.0 预览版统一发布范围](docs/acceptance/2026-10-14/1.0预览版统一发布范围.md) 和唯一阶段清单为准；`docs/九霄1.0公测版重建总方案.md` 是 2026-09-23 的历史方案，其视觉条款已由 VISION 02 取代。” |
| A2 | `PRODUCT.md:59` | 只改措辞 | “…两者当时只用于入口仪式，未替换游戏内原始夜山（历史用法，不约束新方案）；同目录 PNG 是生成源图，不进入发布包（该发布规则仍有效）。” |
| A3 | `docs/九霄1.0公测版重建总方案.md:48/66/72/104` | 不改正文，在第 3 行后加声明 | “> **效力（2026-11-26 登记）：HISTORICAL｜L5｜被取代：范围见 ADR 0004、ADR 0006 与 1.0 预览版统一发布范围；视觉条款（第 48、66 行等）与第 72 行的技术栈由 [VISION 02](design/JX-VISION-02/README.md) 和拟议 ADR 0009 取代｜仍有效：权威链路、存档信封、迁移不丢原文、隐私、计费诚实、测试条款。**” 另在 L2b 写一条“性能指标按画质档分别设定；高画质档不被低端机预算锁死，低画质档提供仍然美观的艺术降级”，覆盖第 104 行 |
| A4 | `docs/九霄1.0产品体验与11项建议落实方案.md:5/15/59` | 只加声明 | “> **效力：** 第 4 节视觉系统及其中固定的品牌元素（山门、月华、朱印、深蓝夜山、冷月银蓝）为 2026-09 历史设计，不约束 VISION 02。仍有效：第 2 节旧能力迁移表；第 5 节中的安全、可玩、全面三个维度；第 7 节验收脚本；“带问题通过不得用于隐私、账务、Canon 越权、存档损坏”；“移动端不得仅把桌面图居中裁断”。” |
| A5 | `docs/九霄1.0分阶段实施与AI执行清单.md:118` | 只加声明 | “> **效力：** 本清单的视觉指令（如第 118 行的首屏与按钮光感）由 VISION 02 取代；同段关于旧字段保留、旧 `localStorage` 原样备份、失败时保留旧键、‘绝不自动删除旧存档’的条款继续有效（L2b 数据规范）。” |
| A6 | `docs/adr/0001-语言与运行时边界.md:11/41/43` | 正文不改；在第 3 行“状态”后追加补记，另立 ADR 0009 | 补记：“> 状态补记（YYYY-MM-DD，作者批准后生效）：第 1 条中‘浏览器端仅保留 React’与第 41–43 行的引入条件被 [ADR 0009](0009-视觉与渲染技术选型.md) 取代；第 5 条（权威状态只由规则事务写入）、迁移不得破坏旧档与事件回放、固定版本与许可证检查、CI 同制品构建继续有效。” ADR 0009 正文见 §3.4 |
| A7 | `docs/项目现状与技术全景.md:97–98` | **已由 #123 解决**：原文已归档，新版第 3 行为导航 | 无需动作 |
| A8 | `docs/README-workspace-guide.md:49` 及 23 条断链 | **已由 #123 解决**：新版指南中无“DESIGN 约束”字样，链接全部可解析 | 无需动作 |
| A9 | `九霄素材-水墨古风/素材说明-README.md:3/8/10/22` | 第 3 行改为事实；第 1 节加声明 | 第 3 行：“…现已被 Git 跟踪（候选原件），仍不进入现有构建流水线；删除须走 Git 提交。” 声明：“> **效力：** 本节摘自 2026-09 的旧 DESIGN/PRODUCT，只记录这批素材生成时的风格语境；素材是否使用、如何使用由 VISION 02 方案决定。来源、AIGC 元数据与许可状态不因本说明改变。” |
| A10 | `docs/世界书四场景内容选择与资产缺口.md:7` | 不改表格，在第 3 行后加声明（属 Canon 边界文件，事实列一字不动） | “> **效力：** ‘山门入口’一行第 3 列的构图与色彩属 2026-09 产品视觉决定，不再约束；同行第 4 列‘不能擅加的事实’，以及野外、城镇、战斗三行的 Canon 原设边界继续有效（CANON）。” |
| A11 | `apps/scene-studio/ASSETS.md:8` | 只改第 2 列的指代 | “2026-11-25 前的旧 `DESIGN.md`（Git 历史 `767ad5d:DESIGN.md`）与现有山门候选海报”。第 3 列的权利陈述一字不动 |
| A12 | `docs/design/JX-UI-E-01/锚点变更记录.md:3/34/36` | 加声明，并由 §3.3 的“视觉断言重建登记”承接 | “> **效力：HISTORICAL｜** ‘同等或更严格’继续适用于行为、数据、无障碍与安全断言；纯视觉指纹（冻结 CSS、背景海报、玻璃参数）按 [视觉断言重建登记](../../spec/visual-assertion-registry.md) 重建，须在同一提交登记旧/新证据与理由，不得静默删除或放宽。” |
| A13 | `docs/九霄1.0双作者分工与交付门禁.md:80` | **不改正文**（高风险治理文本），在 L2b 中写解释性规范 | “性能签字按画质档评估可读、可操作、可恢复与降级路径，不以单一 FPS、LCP 指标否决高画质档的艺术目标；低画质档必须通过。” 另需作者裁定“双签”是否仍适用（见 §4.4） |
| A14 | `docs/design/JX-VISION-02/01-baseline-audit.md:8` | 补注数字 | “…333 份 Markdown（`f1fe6ea` 时；研究分支 `fe171ff` 为 345 份）…” |

### 3.2 B 组 17 份声明的补强

- **5 份已经不需要声明**：`README.md`、`docs/README.md`、`docs/README-workspace-guide.md`、`docs/项目结构地图.md`、`docs/项目现状与技术全景.md`。#123 已把这 5 份改写成新导航，旧原文已归档。合并 #121 栈时，应丢弃 #121 给这 5 份加的第 1 行声明，改用 #123 的版本。
- **其余 12 份**只替换第 1 行声明，正文不动：
  - `docs/九霄UI设计1.0方案.md`
  - `docs/九霄UI1.0Pro增量实施方案-2026-10-05.md`
  - `docs/九霄动态场景渲染与画质设置方案.md`
  - `docs/design/Apple-Liquid-Glass-原始任务书.md`
  - `docs/design/2026-10-13-空间化UI方案审阅.md`
  - `docs/design/2026-10-13-空间化UI逐文件升级清单.md`
  - `docs/design/JX-UI-E-01/` 下的 `README`、`00`、`01`、`02`、`03`、`04` 共 6 份

统一替换文本如下。链接按文件位置改写成相对路径：`docs/design/JX-UI-E-01/*` 用 `../JX-VISION-02/README.md`，`docs/design/*` 用 `JX-VISION-02/README.md`，`docs/*.md` 用 `design/JX-VISION-02/README.md`。

```markdown
> **效力（2026-11-25 设计更新，2026-11-26 补强）：HISTORICAL｜** 作者认定方案E只是初版，现行艺术与全栈研究入口为 [VISION 02](<相对路径>)。本页原有布局、配色、材质、框架、性能优先、固定视觉配额与只改前端等限制（含标注“【定】”的视觉与技术选型条款）不约束新方案。**以下条款继续作为产品要求有效**：真实字段与数据契约；AI 与用户原文不改写；加载与状态文案准确；正文对比度、实色回退与降级；无障碍；测试诚实（未测写“未测量”，结论只取 PASS/PARTIAL/BLOCKED）；依赖许可（如 GSAP 须单独评估）。实际数据、Canon、权限、安全、许可和生产发布事实不因本声明改变。
```

额外两处：

- 在 `docs/design/JX-UI-E-01/04-执行提示词.md:17` 之下加一句：“> 本提示词仅用于复现 JX-UI-E-01 历史实施，不得用于 VISION 02 或之后的任务。”
- `00-原始任务书-E.md` 和 `Apple-Liquid-Glass-原始任务书.md` 是作者原话，第 1 行的声明替换之外，一字不改。

**迁入 L2b 的仍有效条款**：从 B 组正文抽出，写进 `docs/spec/product-requirements-carryover.md`，每条注明来源文件和行号：

- `01-设计总纲.md:321`（不改写 AI 与用户文字）
- `01-设计总纲.md:354`（长文下方须有足够不透明的面，取其可读性目的）
- `01-设计总纲.md:461`（加载文案准确）
- `03-工程实施与验收.md:398` 与 `:503`（测试诚实）
- `Apple-Liquid-Glass-原始任务书.md:162-169`（不冒充原生光学）
- `2026-10-13-空间化UI方案审阅.md:84`（动作文案准确）

做完这一步，B 组文件就只是历史记录，执行者不必再读它们。

### 3.3 C 组门禁：改造方式与替代规范

| # | 现状（文件:行） | 最终处理 | 替代规范文本（写入 ADR 0009 或 L2b） |
|---|---|---|---|
| C1 | `scripts/audit/artifact-scan.mjs:7-10`：`PATH_PATTERN` 匹配 scene-studio 与 scene-gate；`LIBRARY_NEEDLES = ['THREE.Revision','three.module','three.core']`。CI 在 `.github/workflows/ci.yml:87-93` 和 `:106-111` 各扫描一次 `apps/web/dist` | **保留路径与包名扫描**（未批准试验包不得进发布物）。把“库特征一律失败”改成“对照**渲染依赖登记**检查”：`dist` 中检测到的每个渲染库特征都必须在 `docs/spec/render-dependencies.json` 中登记为 `approved`，且版本、许可、维护人与 `apps/web/package.json` 一致；没有登记就失败。同步改 `artifact-scan.test.mjs`，至少三个用例：已登记 three 通过、未登记库失败、scene 包名失败 | “发布物只能包含经 ADR 0009 批准并登记在渲染依赖清单中的渲染库。试验包（scene-studio、scene-gate 及其素材）在未按 P66 决策树晋升前不得进入发布物。扫描失败即关闭（fail closed）。” |
| C2 | `apps/scene-studio/README.md:11-17`；根 `package.json:14,15,18` 的 `--filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate` | 过滤器**保留**，只要试点仍是试点就不动。晋升流程：可复用的代码迁到新包（例如 `packages/render`），素材走媒体许可清单，然后由新包进入生产构建；scene-studio 本身继续被过滤。第 17 行“让 Bird 与 LYL 复核”改为“按 ADR 0009 与渲染依赖登记批准” | “试点包始终排除在生产递归构建之外。正式渲染代码只能来自经 ADR 0009 批准的生产包；晋升须提交真机证据、降级路径与许可清单（沿用 `docs/acceptance/2026-10-10/P66-scene-studio试验遗留条件行动材料.md` 第 4 节决策树）。” |
| C3 | P66 决策树 | L5 历史，正文不改；作为晋升流程的引用来源 | — |
| C4 | `tests/e2e/foundation.cjs:14-20`：`PROFESSIONAL_BASELINE_COMMIT = 'd73e0b7'`，通过 `git show` 取当时的 `style.css`，与现行计算样式比较，断言位于 `:837`；CI 因此需要 `fetch-depth: 0`（`ci.yml:39`）。**更正：矩阵 §5 写的 `69471c7` 是旧基线，已于 2026-10-08 被 `d73e0b7` 取代** | 拆成两类。① **行为、数据、无障碍、安全断言**：同等或更严格，原样保留。包括 `professional-readability-contract.cjs` 里的对比度和字号下限、焦点、编辑器可用、不拦截输入。② **纯视觉指纹**：计算样式与旧提交对比、“所有页面背景保留所选场景海报”。这部分迁到新的版本化截图基线，旧断言随新设计上线同一提交退役。截图基线不再依赖 git 历史，`fetch-depth: 0` 的理由随之消失 | 新建 `docs/spec/visual-assertion-registry.md`，每行一个断言：`旧断言位置｜类别（行为/数据/a11y/安全/视觉指纹）｜处理（保留/加严/重建/退役）｜新断言位置｜新基线 manifest 摘要｜批准记录`。规则：“前四类不得放宽；视觉指纹只能整组重建，不得单条静默删除；重建须附新旧截图证据。” |
| C5 | `tests/e2e/design-token-audit.cjs`、`jx-ui-e-visual.cjs`（`package.json:29` 中的 `test:e2e:design`，不在 CI 中） | 在登记表中标 HISTORICAL；新设计上线后，改为指向新 token 或退役 | — |

### 3.4 拟议 ADR 0009《视觉与渲染技术选型》要点

- 引入新的渲染代码、库或语言时，依据如下：
  1. 在同一场景、同一数据下做效果对比，证据为截图、录屏或真机记录；
  2. 写明可读性、输入延迟、降级路径、内存与电量影响；
  3. 写明许可、维护人、回退方案。

  性能数据是条件之一，不是唯一条件。
- 继续有效的约束：权威状态只由规则事务写入；画面中的可读元素只能来自已结算的事实（画面 ⊆ 事实）；依赖固定版本；许可检查；CI 同制品构建；无 WebGL 时有完整可玩的降级路径（`PRODUCT.md:67`）。
- 产出物：`docs/spec/render-dependencies.json`，供 C1 使用。

---

## 4. 10 份 CI 哈希锁定文件：版本升级与再批准流程

### 4.1 锁定清单与机制（复核）

| 文件 | 锁 |
|---|---|
| `docs/九霄P1序章作者原创输入登记-2026-10-03.md` | `canon.registry.json` 中的 `candidateDocumentSha256`（第 1799、1846、1920 行附近）← `packages/content/src/prologue/prologue-v1.test.ts:46-51` |
| `docs/acceptance/2026-10-04/P1-author-inputs/archived-candidates/P1-EXEC-SPEC-v3.1.0-20261004.md` | registry 中的 `sourceArtifact.sha256` ← 同一测试 |
| `docs/九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md` | `prologue-v1.test.ts:30`，另在 bundle 清单中 |
| `docs/acceptance/2026-10-04/P1-author-inputs/P1-MAP-作者可执行映射.md` | `prologue-v1.test.ts:31`，另在 bundle 清单中 |
| P1-NLU 盲标表、P1-PR51 审阅依据、共同认可与 PR-4 裁决、审阅结论（代签）、PR-4 对照、G03 行动规则表，共 6 份 | `scripts/p1-rule-candidate-bundle.files.json`（format `v2`）→ `apps/api/src/services/p1-review-rule-approval.test.ts:20-26` 断言 `bundleSha256` 等于 `p1-review-rule-approval.ts:50` 中的 `sha256:468a26ad…` |

**新发现的耦合**：bundle 清单还包含 `packages/content/src/canon.registry.json` 本身。因此，在 registry 中**新增任何 Canon 或 intake 条目**，都会改变 `bundleSha256`，P1 测试随之失败。流程必须把这一点算进去：要么接受每次都重新固定一次 bundle 摘要，要么另立 ADR，只把 P1 相关的 registry 切片纳入 bundle。

### 4.2 流程：新版本、新摘要、两人批准、测试同步

1. **立项**。开一个 Issue 或 Draft PR，说明：要改哪一份锁定文件；改动属于哪一类——**语义变更**（规则、数值、Canon、记忆语义）、**纯身份漂移**（依赖、导出变化，规则字节不变，例如 `docs/integration/2026-11-09-zod-semantic-approval.md`），或**仅注记**；影响哪些摘要（`candidateDocumentSha256`、`sourceArtifact.sha256`、`bundleSha256`、`semanticSha256`、`pluginSourceSha256`）。
2. **仅注记**：建旁注 `<原名>.效力.md` 或 `<原名>.勘误-<日期>.md`，不进 bundle 清单，**不触发再批准**。流程到此结束。
3. **新版本文件**。原文件一个字节都不改。按 §2.5 命名新建文件，例如 `docs/rules/P1-EXEC-SPEC-v3.2.0-YYYYMMDD.md`，文首写 `supersedes: <旧路径>@sha256:<旧值>`。
4. **新摘要**。
   - registry 新增 intake 条目，字段为 `version`、`path`、`sha256`、`supersedes`；旧条目标 `status: superseded`，**保留**。
   - bundle 清单升级为 `format: …-v3`，列入新文件路径；旧 v2 清单另存为 `scripts/p1-rule-candidate-bundle.v2.files.json`，留作回归。
   - 运行 `node scripts/p1-rule-candidate-digest.mjs`，用输出重算各项摘要。
5. **批准记录**。在 `docs/acceptance/<日期>/P1-RULE-v3.2.0-再批准记录.md` 中写明：
   - 旧摘要与新摘要对照表；
   - 规范化后的差异摘要；
   - 适用范围（非生产或生产）；
   - 每位批准人的原话、时间和渠道，**AI 不得代签**，沿用 `docs/九霄1.0作者验收复核-2026-10-02.md:30` 的口径；
   - 撤回方法。
6. **两人批准（两把钥匙）**：
   - 语义变更：作者 A（Canon 与体验）和作者 B（规则契约与工程）都要批准，依据是 `双作者分工与交付门禁.md:11-13` 的互不越权条款；
   - 纯身份漂移：工程拥有者批准，另一位作者知情，并由一名非作者复核者（人或代理，只复核不签字）核对“规则字节不变”的差异证据。
7. **代码与测试同步，在同一个提交中完成**：
   - 改写 `p1-review-rule-approval.ts` 的常量，注释指向批准记录；
   - `prologue-v1.test.ts` 新增“新版本路径 = 新摘要”的断言，**同时保留“旧文件仍等于旧摘要”的断言**，用来证明历史完整；
   - 新增“绑定旧 `ruleVersion` 的旧存档仍按旧规则回放”的测试；
   - CI 守卫：凡是触碰锁定路径、bundle 清单或批准常量的 PR，若没有新增 `*再批准记录.md`，或其中的摘要与实算值不一致，即失败（见 §5.7）。
8. **完整验证**：typecheck、unit、真实 PG 集成、构建、容器、E2E，全部以同一 SHA 跑出 CI 绿灯后才能合并。任何一项失败都保持 fail closed。不得为了通过而关闭摘要比较，`2026-11-09-zod-semantic-approval.md` 已立此先例。
9. **生效**：合并后在 L3 状态页登记“现行规则版本 = v3.2.0”，旧版本状态改为 `SUPERSEDED`。

### 4.3 适用范围

同一套流程适用于其他按摘要绑定的对象：

- `docs/sources/世界书_保守补全版.md`，由 `build-worldbook-draft-index.mjs` 按 SHA-256 绑定；
- 世界书正式阅读版，由 `test-worldbook-final.mjs` 逐字校验；
- `docs/audits/2026-10-05/SOURCE_MANIFEST.json`；
- `P6-MAIN-SYNC-01-evidence/integrity.json`；
- 媒体清单中的 `licenseEvidenceSha256`。

**例外**：AGENTS 明令不得重跑的 `scripts/prepare-worldbook-final.mjs` 与 `write-worldbook-author-handoff.mjs` 不在此流程内。

### 4.4 必须先由作者裁定的冲突

`docs/acceptance/2026-11-07/PR00-基线与分支差异.md:74` 记载：“2026-11-07 决定不保留 Bird 与 LYL 双作者签收作为后续门禁”。#123 的 `STATUS.md:14` 也据此写了同样的结论，只是没有给出处。

本候选在 §4.2 第 6 步采用“语义变更需 A、B 两人批准”，理由是 P1 锁定文件当初就是双作者签署，原签署人出新版本是最小的信任替换。但它与 11-07 决定存在张力。请作者在以下两项中二选一：

- **(a)** 对 L2a 中原本双签的文件恢复双签，其他场景维持 11-07 决定；
- **(b)** 维持 11-07 决定，改为“指定拥有者批准 + 独立复核”。

在作者裁定之前，不得把任何一项写成现行规则。

---

## 5. 新 CI 检查清单（每项给出可实现的方法）

现有能力不重复列出，只写扩展部分。现有能力包括：`license:check`、`media-release-check`、`migration-upgrade`、`card-install-upgrade`、`database-restore`、`m3-reconciliation`、`ci-evidence.test`、`write-review-bundle`、`scan:artifacts`、`worldbook:runtime:check` 和 P1 摘要测试。

### 5.1 数据、规则与存档正确性

- **存档黄金样本往返**：在 `tests/fixtures/legacy/` 以及每个历史 `ruleVersion` 下各取一个存档，执行“迁移 → 规范化 JSON → SHA-256”，结果与登记值比较。另断言原文字段逐字节保留，对应 `PRODUCT.md:41`。
- **事件回放确定性**：用固定种子跑 N 回合，用事件日志重放出的状态哈希必须等于在线结算得到的状态哈希，并且跨两次运行一致。
- **规则不变量的性质测试**：用 `fast-check` 生成随机 `ActionIntent` 序列，断言 `gameMinute` 单调、体力和资源不越界、不存在未授权的 `StateDelta`。
- **契约快照**：把 `packages/contracts` 的 zod schema 导出为 JSON Schema 并做快照。快照出现 diff 时，PR 必须同时修改迁移文件或 ADR，否则失败。
- **画面 ⊆ 事实**：渲染层 view-model 中的每个可读元素都带 `factId`。E2E 在固定存档下收集 DOM 或 canvas 层登记的 `factId` 集合，断言它是权威投影 `factId` 集合的子集；未实现的系统不得出现入口，用路由白名单检查。
- **Canon 越权**：在现有 `worldbook:runtime:check` 的基础上，用 `docs/世界书剧情禁则与NPC认知验收样例.md` 中的样例做离线断言。

### 5.2 安全与隐私

- **密钥扫描**：在 PR diff 上运行 `gitleaks detect --log-opts=<base>..<head>`；仓库全量扫描每周跑一次。
- **依赖漏洞**：`pnpm audit --prod --audit-level=high` 设为失败阈值，并启用 GitHub CodeQL（JS/TS）。
- **发布物泄漏**：扩展 `artifact-scan.mjs`，在 `dist` 中检索以下内容，命中即失败：
  - 本机绝对路径（`/Users/`、`/home/`、`C:\\Users\\`）；
  - 私有原图目录名；
  - 未登记的 `.env` 键名；
  - `@` 邮箱、手机号等 PII 正则。

  对应 AGENTS 要求的“不将私有原图、本机绝对路径打进公开包”，以及矩阵 §4 第 10 项。
- **测试隔离**：集成测试启动时断言 `DATABASE_URL` 指向 CI 临时实例（本地 host 加随机库名），出现生产域名时拒绝运行。
- **响应头**：解析 `deployment/Caddyfile` 和 Pages `_headers`，断言 CSP、`X-Content-Type-Options`、Referrer-Policy 等存在，且 Route A 封锁路径仍然返回拒绝（`test:pages-relay` 已有基础）。

### 5.3 资产权利、许可与 AI 生成标识

- **全类型媒体清单**：`dist` 中凡是媒体或渲染资产（图片、音视频、字体、`.ktx2`、`.glb`/`.gltf`、`.hdr`、着色器文件），都必须出现在媒体清单中，并具备 `licenseStatus: approved`、`licenseEvidenceSha256`、作者回执。也就是把 `media-release-check.mjs:18-23` 的逻辑从“候选场景目录”扩展到全部发布物。对应 09 第 6 项。
- **AIGC 隐式标识**：对清单中 `producer` 为 AI 的资产，用 `exiftool -json`（图片）或 `ffprobe -show_format`（MP4）读取元数据，断言存在 `apply-aigc-propagation-labels.mjs` 写入的 AIGC JSON 字段（Label、ContentProducer、ProduceID 等）。
- **AIGC 显式标识**：E2E 中断言展示 AI 生成图像或音视频的节点附近有可见的 “AI 生成” 标识，或在可访问名称里带有该标识。依据《人工智能生成合成内容标识办法》（2025-09-01 施行）。具体呈现方式由作者和法务口径确认，本项只检查标识是否存在。
- **字体与第三方代码**：每个字体文件旁必须有许可文件，例如 `apps/web/public/fonts/OFL-NotoSerifSC.txt`；复制进仓库的着色器或代码片段要有 SPDX 头，用 `reuse lint` 或自写正则检查。
- **私有与参考素材隔离**：58 张参考图和世界书原图所在路径列入 deny 表，构建产物和 Pages 预览包中一旦出现，即失败。

### 5.4 无障碍

- **自动规则**：在关键路由上运行 `@axe-core/playwright`（首屏、建角、游玩、存档、设置、世界书），要求 `serious` 与 `critical` 为 0，结果附在审阅包中。
- **键盘**：用 Playwright 逐个 Tab，断言所有可交互元素可达、焦点可见（`outline` 或 `box-shadow` 的计算值不为空）、没有键盘陷阱。
- **动态背景上的对比度**：在多个 `gameMinute`（如 05:15、12:00、16:00、22:00）和每个画质档下截图，对每个文本框，在其包围盒内取背景像素的第 5 百分位亮度，计算 WCAG 对比度，正文须 ≥4.5:1。这一项直接回应 #124 自述的“16:00 偏暗”问题，可复用现有 `world-description-contrast.cjs` 与 `contrast.test.ts`。
- **偏好设置**：分别用 `emulateMedia({ reducedMotion: 'reduce' })`、`forcedColors: 'active'`、`prefers-reduced-transparency` 运行，断言没有持续时间超过阈值的动画、有实色回退，且核心流程能完成。
- **触控目标与读屏**：交互目标 ≥24×24 CSS px（WCAG 2.2 第 2.5.8 条）；canvas 画面要有等价的文字事实区（`aria-live`），并与 §5.1 的 `factId` 对应。

### 5.5 渲染正确与降级

- **矩阵运行**：Chromium 分三种配置：(a) 正常 WebGL2；(b) `--disable-gpu`，走 SwiftShader 软件渲染；(c) `--disable-webgl`。每种配置都跑通“进入 → 一回合 → 存档”。(c) 必须走无 WebGL 的降级路径，对应 `PRODUCT.md:67`。
- **控制台零错误**：着色器编译错误、`WebGL: CONTEXT_LOST`、未捕获异常，一律判失败。
- **上下文丢失**：调用 `WEBGL_lose_context.loseContext()` 和 `restoreContext()`，断言画面恢复，且游戏状态不变。
- **确定性渲染**：固定种子、固定 `gameMinute` 和固定视口时，连续两次截图的像素差应在阈值内。这是视觉回归能成立的前提。
- **性能是报告，不是门槛**：按画质档记录帧时间 p95、长任务数和堆内存（CDP `Performance.getMetrics`），写入审阅包。只有最低画质档设硬阈值，即不得阻塞输入；高画质档只报告，不判失败。对应 A3 与 A13 的替代规范。
- **省流量**：模拟 `Save-Data: on` 或慢网，断言加载的是轻量资产并有降级提示。

### 5.6 新视觉回归

- **基线位置**：`tests/visual/baselines/<设计版本>/`，由 `manifest.json` 记录每张图的 SHA-256，以及批准记录路径。基线只在新设计**获批后**建立，不从旧设计继承。
- **比较方法**：使用 Playwright 的 `toHaveScreenshot`，或 `pixelmatch` 加 SSIM 阈值。动态区域（粒子、天空）用 `mask` 遮罩，或固定种子。
- **基线更新**：PR 修改 baselines 时，必须同时新增批准记录，且记录中的 manifest 摘要与实际一致，否则失败。旧基线目录整体保留为 HISTORICAL，不覆盖。
- **退役旧断言**：`foundation.cjs` 中“与 `d73e0b7` 比较计算样式”的部分，在新基线生效的同一个提交里退役，按 §3.3 C4 的登记表执行。

### 5.7 证据可靠性

- **PASS 必须有出处**：扫描 L3 和新增的 L5 文档，凡是出现 `PASS`、`通过` 的行，同一行或相邻行里必须有 CI run URL 或 40 位 SHA；否则判失败，提示改写成 `NOT RUN` 或 `UNKNOWN`。
- **历史证据只增不改**：PR 若修改 `docs/acceptance/**`、`docs/audits/**`、`docs/integration/**` 下的**既有**文件（`git diff --diff-filter=M`），且同一 PR 中没有对应的 `勘误-*.md` 或白名单生成脚本，即失败。`deliver.cjs`、`finalize.cjs` 等合法回写的生成器列入白名单。
- **锁定文件守卫**：维护一份锁定路径清单（§4.1 的 10 份，加上 §4.3 的对象），在 CI 中断言其字节等于登记的历史摘要；触碰批准常量的 PR 必须附带再批准记录。
- **审阅包绑定**：沿用 `write-review-bundle.mjs`，另外校验文档中引用的 RC_SHA 与 artifact 的 `head_sha` 一致。
- **台账可重算**：#123 的台账需要补一个生成脚本，例如 `scripts/repository/inventory.mjs`，CI 可以按需重跑，比对表头和行数，避免台账成为不可复现的手工产物。

### 5.8 文档治理

本节对应知识体系本身，属于额外的检查项。

- **离线链接检查**：`lychee --offline` 或自写解析器，扫描所有非 L5 的 Markdown。本轮用来核对 #123 的方法可以直接改成脚本。
- **禁止分支 blob URL**：正则 `github\.com/[^/]+/[^/]+/blob/(?![0-9a-f]{7,40}/)` 命中即失败。
- **效力一致性**：非 LOCKED 文件的头部声明状态必须与 `doc-status.tsv` 一致；每份 Markdown 都必须在登记表中有一行。
- **入口体积**：`AGENTS.md` 不超过 80 行，`CLAUDE.md` 不超过 20 行。
- **规范句唯一**：同一条规范句（“必须”“不得”开头的句子，做哈希近似去重）出现在多份 L0–L2 文件中时，发出警告。

---

## 6. 对 PR #123 的逐条裁定

| 建议（位置） | 裁定 | 理由与修改 |
|---|---|---|
| 精简根 `README.md`，原文按 blob 归档 | **采纳** | 已核实字节一致、链接全部可解析；与 Diátaxis 及“短根说明”的原则相符 |
| `docs/README.md` 任务路由表（第 5–14 行） | **采纳并修改** | 合并 #121 后，把第 9 行改为“视觉、玩法、全栈设计：首读 [DESIGN（开放艺术宪章）](../DESIGN.md) 与 [VISION 02](design/JX-VISION-02/README.md)；已采纳的决定看 ADR，提案状态为 PROPOSAL”，并删去“不在 main 假定批准”这句会过期的表述 |
| `AGENTS.md` 新导航块 | **采纳并与 #121 块融合** | 合并文本见 §7.2。保留第 5 行的 NOT RUN 纪律和第 7 行的不删除纪律 |
| `STATUS.md` 作为唯一状态路由 | **采纳并修改** | 第 13 行描述未合并 PR，会很快过期，应改为“设计研究：见 L4 目录及其 README 中的状态”；第 14 行补出处 `docs/acceptance/2026-11-07/PR00-基线与分支差异.md:74`；每行增加“最后核对 SHA / 日期”列 |
| `GOVERNANCE.md:7` 状态词表 | **融合** | 并入 §2.2 的统一词表；增加 `LOCKED`、`MACHINE_READ`、`CANON` 三个标记，以及登记表作为唯一来源 |
| `GOVERNANCE.md:5`：不新增竞争 CLAUDE.md，不改 DESIGN/PRODUCT | **采纳**，作为本阶段的协作边界 | VISION 02 结束后，`CLAUDE.md` 改为引用 AGENTS 的薄入口（§7） |
| `GOVERNANCE.md:13-16` 分支生命周期与 HOLD 规则 | **采纳** | 与“不删除、不强推”的要求一致 |
| `BRANCH-REVIEW.md`：可达性证明，100 个候选、13 条分叉 | **采纳为证据（EVIDENCE）**，不作为操作指令 | 自身第 20 行已声明；删除仍需拥有者逐条确认 |
| `MIGRATION.md` 阶段 B 门禁 | **采纳** | 与 §4、§5.7 互补；“小批原子迁移、兼容入口、干净检出全测”可直接写进 L2b |
| `inventory/*.tsv`（9 万余行，提交进仓库） | **修改后采纳** | 补生成脚本（§5.7）；在 `inventory/` 放一个 `.ignore`（ripgrep 会读取），避免 AI 全仓检索时被大表淹没；文件名带基线 SHA 短码，或在 README 首行写明 |
| `archive/README.md:7` 把 `outputs/九霄世界书/` 列在“历史”下 | **修改** | AGENTS 规定审阅全文要从 `outputs/九霄世界书/README.md` 进入，正式阅读版是现行 Canon。这一条应移到 `docs/README.md` 的世界书行；archive 中只列“该目录中的旧快照” |
| `项目结构地图.md:21-28` 真实构建依赖 | **采纳并补充** | 补两项会限制设计的门禁：`scan:artifacts` 的 three.js 特征（C1）和 `foundation.cjs` 的冻结基线（C4），让后来者知道门禁所在位置 |
| `SOURCES.md` | **采纳** | — |
| “本分支尚未执行运行时测试”（`repository/README.md:15`） | **采纳，诚实标注** | 合并前仍需 CI 全绿。#123 不改运行时文件，风险低 |
| 不采纳项 | 无整条不采纳 | #123 刻意避开了设计裁决，没有与本候选方向相反的建议 |

### 6.1 与 #124（及 #121 栈）的冲突与解决

| 冲突 | 位置 | 解决 |
|---|---|---|
| 文本冲突 | `AGENTS.md` 第 1 行起：#121 插入“九霄当前创意方向”4 行，#123 插入“协作导航”8 行 | 按 §7.2 合并成一个块，世界书一节保持原样置后 |
| 文本冲突 | `README.md`、`docs/README.md`、`docs/README-workspace-guide.md`、`docs/项目结构地图.md`、`docs/项目现状与技术全景.md`：#121 在第 1 行加 B 组声明，#123 全文改写 | 取 #123 版本，丢弃 #121 的声明行；在 `README.md` 和 `docs/README.md` 的任务表中补 VISION 02 行 |
| 统计口径 | #123 `AUDIT.md:3` 与 `markdown.tsv` 基于 `f1fe6ea`（323 份 Markdown），08 基于 `fe171ff`（345 份） | 都是各自 SHA 下的正确数字，不算冲突；在登记表中注明基线 SHA |
| 状态过期 | `STATUS.md:13` 称 #120、#121、#122 未合并 | 见上一表 |
| 词表差异 | #123 七类，08 八类 | §2.2 统一 |
| 合并顺序 | #123 → main；#124 → #121 → #120 → #119，后者含大量 `apps/web` 生产代码 | 建议先把 #123 合入 main（只有文档，无运行时改动），再让 #121 栈 rebase，按上表解决 6 个文件。最终由作者决定 |
| 未触及 | `CLAUDE.md`、`DESIGN.md`、`PRODUCT.md`、`.claude/skills/**` | #123 未修改，无冲突 |

---

## 7. 面向人类与多种 AI 的入口设计

### 7.1 原则

- **一个通用指令文件**：`AGENTS.md`。Codex、Cursor 等工具都读取它。
- **工具专属文件只做薄指针**：
  - `CLAUDE.md` 用 `@AGENTS.md` 导入，只补 Claude 特有的内容：skills 位置、评审协议；
  - Copilot 或 Gemini 只有在团队确实使用时，才新增 `.github/copilot-instructions.md` 或 `GEMINI.md`，内容一律是一行指向 AGENTS。
- **根文件只放导航和硬边界**，专题按需读取。依据是 #123 `SOURCES.md:3-5` 引用的 OpenAI 与 Anthropic 做法。
- **`.workbuddy/`、`.trae/` 是工具记忆**，标记为 `TOOL_CONTEXT`，不在入口中链接。
- 每个代码目录都有一份不超过 30 行的 `README.md`，内容包括：职责；入口文件；测试命令；受哪些 L1、L2 文件约束；**不能做什么**，例如 `packages/content`：不得手改 `canon-runtime.json`。

### 7.2 合并后的 `AGENTS.md`（候选全文骨架）

```markdown
# 九霄协作入口（所有代理先读）

1. 先确认 branch、HEAD、工作区与目标范围；不改他人分支/PR/未提交内容，独立分支或 worktree 工作，不强推、不擅自合并或部署。
2. 先读 [docs/README.md](docs/README.md)（按任务路由）。权威层级与效力登记见 [docs/repository/AUTHORITY.md](docs/repository/AUTHORITY.md)；当前状态只看 [STATUS](docs/repository/STATUS.md)。
3. 设计：视觉、玩法与全栈设计以 [DESIGN.md](DESIGN.md)（开放艺术宪章）与 [VISION 02](docs/design/JX-VISION-02/README.md) 为准；旧色系、布局、材质、框架与性能优先的艺术限制已是历史。真实世界状态、数据完整、安全、许可、隐私、无障碍与测试诚实仍有效。
4. 命令以 package.json 与 .github/workflows/ci.yml 为准；测试用隔离数据。未执行写 NOT RUN，未批准写候选。AI 不得代签任何作者批准。
5. 不删除、不移动、不改写历史证据与哈希锁定文件（清单见 AUTHORITY §锁定）；勘误另建文件。全量台账仅审计时读取。

# 协作代理交接：世界书状态
（原文一字不改）
```

### 7.3 建议目录树（只新增 ★ 标记项；其余是现有文件，不移动）

```text
AGENTS.md                 通用入口（≤80 行）
CLAUDE.md                 @AGENTS.md + Claude 专属（≤20 行）
README.md                 人类首页（#123 版 + VISION 02 行）
PRODUCT.md  DESIGN.md  SECURITY.md      L0
docs/
  README.md               唯一文档路由：任务 → 首读 → 补充；附层级图
  repository/             治理区（沿用 #123 命名，不另建 governance/）
    README.md  STATUS.md  GOVERNANCE.md  MIGRATION.md  BRANCH-REVIEW.md  SOURCES.md  AUDIT.md
    AUTHORITY.md        ★ 权威层级、修改权、效力模板、锁定清单（即本候选 §2、§4 采纳后的正文）
    doc-status.tsv      ★ 全部 Markdown 的效力登记（唯一来源）
    inventory/            快照证据（+ ★ .ignore、★ 生成脚本链接）
  adr/
    README.md           ★ 索引与状态表
    TEMPLATE.md         ★
    0001…0008             （0001 只追加状态补记）
    0009-视觉与渲染技术选型.md  ★（批准后）
  spec/                 ★ L2b 现行规范
    README.md
    visual-assertion-registry.md
    render-dependencies.json
    asset-rights-and-aigc.md
    test-honesty.md
    product-requirements-carryover.md
  design/
    README.md           ★ 现行 = JX-VISION-02 的已采纳部分；PROPOSAL = claude-proposal 等；HISTORICAL = JX-UI-E-01、空间化、Apple
    JX-VISION-02/  JX-UI-E-01/ …
  rules/                ★ 今后新版本的已签规格（旧版原位不动）
  acceptance/ audits/ audit/ integration/   L5，每个顶层目录一份 README（★ 缺的补上），只增不改
  archive/                历史导航原件（#123）
  世界书*.md、九霄1.0*.md   原位（被链接或哈希绑定，不搬）
apps/web/README.md      ★   apps/api/README.md ★   packages/{contracts,domain,content,db}/README.md ★
tests/README.md         ★ 测试分类、哪些是 CI 门禁、视觉基线规则、证据纪律
scripts/README.md       ★ 脚本用途；明确列出“禁止重跑”的世界书脚本
outputs/README.md  work/README.md          现有；补一行效力（历史、Canon 正式阅读版除外）
```

### 7.4 阅读预算（给 AI）

| 任务 | 必读 | 按需 |
|---|---|---|
| 任意任务 | `AGENTS.md`（约 3 KB）、`docs/README.md`（约 2 KB） | — |
| 代码改动 | 对应目录的 `README.md`、`STATUS` | ADR、spec |
| 设计 | `DESIGN.md`、`VISION 02/README` | `claude-proposal/README` |
| 审计 | `docs/repository/*` | `inventory/*.tsv`，用脚本筛选，不全量加载 |

---

## 8. 保留红线（任何修订都不得触碰）

以下各项与 AGENTS 及本任务要求一致：

- **历史事实与原话**：验收原文；PARTIAL 结论；作者原始任务书；问卷原话；日期与签署。
- **Canon**：34 条运行内容；`resolvedSourceGaps`；世界书路径与 SHA 绑定；禁止重跑的两个脚本。
- **作者签署**：只能出新版本，不能改写；AI 不得代签。
- **数据完整**：迁移不丢原文；不自动删除旧存档；事件可回放。
- **安全、许可、隐私**：未授权素材不得进入发布物；私有原图和本机路径不得进入公开包；AIGC 标识；依赖许可。
- **无障碍**：对比度、焦点、减弱动效与透明、不以颜色作为唯一信号（`PRODUCT.md:71-75`）。
- **测试诚实**：NOT RUN、UNKNOWN、PARTIAL 如实标注；放宽断言须逐条登记；不得关闭摘要比较。

## 9. 待作者裁定（本候选新增）

1. §4.4：双作者批准是恢复（a），还是维持 11-07 决定（b）。
2. A1 的 1.0 范围口径：PRODUCT 第 5 行的替换句。
3. ADR 0009 是否立项；渲染依赖登记的首批条目（例如 three，含版本与许可）。
4. Canon registry 与 P1 bundle 的耦合（§4.1）：是接受每次重新固定，还是改为只纳入 P1 切片。
5. 合并顺序：#123 是否先于 #121 栈合入 main（§6.1）。
6. `docs/spec/` 与 `docs/rules/` 两个新目录名，以及 `AUTHORITY.md` 是否放在 `docs/repository/` 下。

本阶段只出候选，不生效。
