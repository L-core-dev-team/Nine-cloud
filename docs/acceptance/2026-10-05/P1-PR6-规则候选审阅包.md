# P1 / PR-6 规则候选审阅包

日期：2026-10-05
状态：**candidate-only；精确摘要已获共同批准并绑定非生产 review runtime；PR-6 验收仍未完成**
工作分支：`codex/p1-pr6-prologue-e2e`
基线提交：`ff9d2d1311703183c41318420696ea18240c91ab`（PR-5 合并点）

## 审阅对象

本包把共同认可的 P1 输入、确定性解析器、契约、行动规则、状态投影和针对性回归测试绑定为一个可复算的源文件摘要。LYL 与 Bird 对本任务所提交作者材料的共同认可已由用户确认；这里不重新索取 NLU 盲标、Bird review 或相同文件的签署。

规则候选包格式为 `jiuxiao-p1-rule-candidate-bundle-v1`，SHA-256：

```text
a4b8fbf7e612084007112ed3fac52d711deb461f652788a71fd791ce05ebc0e2
```

摘要由 `node scripts/p1-rule-candidate-digest.mjs` 生成。脚本按相对路径排序，将每个源文件的路径与 SHA-256 组成 manifest，再对格式标识和 manifest 行计算 SHA-256。脚本本身及本审阅文档不纳入摘要，避免自引用；锁文件 `pnpm-lock.yaml` 纳入。命令输出包含全部 39 个文件及其逐文件摘要。

候选规则簿对象另有结构摘要 `dbdb44603c50cfcf68f6e5eed55eb4ee16c82c47caab4c4defee19c932448cdd`，由 `packages/domain/src/prologue-v1-candidate.test.ts` 断言。它只摘要规则簿数据，不等于上述完整候选包摘要。

审阅包的作者输入核心指纹：

| 输入 | SHA-256 |
| --- | --- |
| P1 执行规格 v3.2.0 | `7677776d40825889694abeff4cb51c33d4fcd4a91e70eafcf8baae491635259e` |
| P1-MAP-01–06 | `5869f3a3518156c2ac166388cc9f652aebc7bd5e36f071172030665f3d0a9e53` |
| P1 NLU 作者共同认可表 | `8d03539dfa2865f3d276c5c63346484e0637ae4a67529b919798c0fc2e50f0b9` |
| G-03 已签规则摘要 | `c4d06467515c865b3a9abad0980e812af4151c5ac58868d9af7db4d74741e879` |

完整 manifest 还绑定 PR-4 验收裁决与审阅材料、ActionIntent/Decision/DomainEvent/Save/WorldState 契约、content/domain 导出面、NLU 解析器与固定语料、游戏时间纯函数、事件重放和状态增量、candidate-only 内容及规则常量、焦点测试，以及锁文件。

## 规则实现摘要

- 只配置作者给出的芦花渡、望气台、折桂坪三个主地点。新档只知前两处；折桂坪及其双向边在领奖事务中解锁。礁石小径与渡口作业位是子区域。
- 新档背包为空。`item_bishuifu` 只能从 `src_ferry_shore` 取得；`item_jiuyifu` 是任务奖励。基础呼吸法以已知能力记录，不作为物品。
- `npcPresence` 与地点、观察目录、可交谈授权、combat target 目录分别处理。岑九的落石话题只产生拒绝交谈事件，不产线索、不清障。
- `scan`、`study` 使用独立目标映射。黄昏后落石观察按 `too_dark` 阻断；观察不能解锁地点。
- 规则不调用随机数，不含 HP、伤害数值或死亡。低于战斗余量阈值时撤退；通过最低余量后，黄昏清障固定为 `clear` 并可同时写 `crowding_bite`。
- 用物负例 `loc_wangqitai` 返回 `RULE_TARGET_MISMATCH`，按 `rejected` 零事件、零耗时、零消耗处理。规则事实仍只经规则决策、事件和投影链写入。
- 候选专项回归直接执行 `tech_breath_basic` 修炼，验证 1 刻结算；未知功法与超过 8 刻均零副作用硬拒绝。

## 审阅时需看到的明确差异

1. NLU-13 对已登记但未持有的 `item_jiuyifu`，作者表建议 `INPUT_NO_SUCH_TARGET`；执行规格区分“未知目标”和“未持有物品”，本实现用 `ENV_ITEM_NOT_OWNED`。两者均为零事件拒绝。代码保留后者，差异已列入 `docs/自主决策记录.md`。
2. G-03 较早文本对战斗与物品拒绝码的部分描述被后续共同认可 MAP 和 v3.2.0 规格修正。本实现按后续明确输入执行；本审阅包同时绑定 G-03 原文和当前规格，便于逐项核查，不把旧表述伪装成一致。
3. 规则簿中的 `obj_ferry_gear` 与 `player_warning` 是为已给出的细察对象和 NLU 拒绝话题补齐的技术 ID，不新增 Canon 人物、地点、势力或剧情事实。

## 本地验证

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 退出 0；7 个 workspace 均已安装，lockfile 未变 |
| `pnpm license:check` | 退出 0；83 个依赖条目通过许可证白名单检查。第一次检查因工作区既有 `node_modules` 的包索引不一致失败；在保留旧依赖目录副本后，从锁文件重新安装，再运行同一检查通过。未改锁文件或许可证白名单。 |
| `pnpm --filter @jiuxiao/contracts test` | 退出 0；2 files / 17 tests passed |
| `pnpm test` | 退出 0；core 28/28，contracts 17，content 43，domain 112，API 97 passed / 31 skipped，Web 157 passed |
| `TEST_DATABASE_URL=<isolated jiuxiao_test_pr6> pnpm test:integration` | 退出 0；10 files / 36 tests passed。使用隔离容器 `jx-p1-pr5-pg` 内新建的 `jiuxiao_test_pr6`；该库已应用 16 条迁移。此套件覆盖既有 API/DB 集成，不等同于 PR-6 游客玩法 E2E。 |
| `TEST_DATABASE_URL=<isolated jiuxiao_test_pr6> pnpm test:e2e` | 本表记录早期基线：仅完成普通 API fail-closed 预检。其后邮箱会话下的非生产候选玩法旅程见下方 2026-10-05 更新。 |
| `pnpm typecheck` | 退出 0；contracts、content、domain、db、api、web 六个项目通过 |
| `pnpm build` | 退出 0；Canon runtime 34 confirmed entries；`receiptsComplete=false`；保留 >500 kB chunk warning |
| `git diff --check` | 退出 0；无输出 |
| `node scripts/p1-rule-candidate-digest.mjs` | 退出 0；输出上述完整候选包摘要及 39 项 manifest；候选专项文件 10 项测试通过 |

`pnpm test` 中 `CANON_RECEIPTS_PENDING` 子进程诊断是预期的 S/Canon fail-closed 检查；测试套件仍通过。该基线命令未设置 `TEST_DATABASE_URL`，所以 API 的 31 个 PostgreSQL 集成断言按常规配置跳过；随后在专用 `jiuxiao_test_pr6` 库运行集成套件。初始版本的 E2E 只覆盖负向门禁预检；下面的 2026-10-05 更新增加了邮箱会话下的非生产候选规则旅程。所有 E2E 数据均写入隔离测试库，并按测试账户范围核验后清理。

许可证检查初次失败的 stdout 原文为 `ERR_PNPM_MISSING_PACKAGE_INDEX_FILE: Failed to find package index file for vitest@5.0.1 ... please consider running 'pnpm install'`。重建忽略的 `node_modules` 后，冻结安装与许可证扫描均成功；未改 lockfile、pnpm 版本或许可证白名单。

## 门禁与退出边界

- `AUTHOR_RULES_GATE` 仍为 `BLOCKED_BY_OWNER`，`ActionRulesVersion` 与 `CombatRulesVersion` 均为 `null`。普通 `/api/turns` 仍按既有契约返回 503 `RULES_NOT_READY`。
- Candidate rulebook 未从 `packages/content/src/index.ts` 导出；只由精确 review plugin 在非 production 环境加载。活动 Canon/runtime 与 `receiptsComplete=false` 均未改变。
- 本摘要是供作者审阅的精确候选，不是作者批准记录、生产版本号、Canon 发布回执或 P1/PR-6 完成声明。
- LYL 在 Codex 对话中明确代表两位作者批准上述完整摘要；记录见 [`P1-PR6 规则摘要双作者批准记录`](P1-PR6-规则摘要双作者批准记录.md)。批准仅支持该精确包进入非生产运行时核验，不等于生产授权、活动 Canon 或 GitHub review event。
- 此处早期记录的缺口已由下方更新逐项复核。授权观察 outbox 召回已接入叙事路径；剩余项目以文末“当前未关闭的验收门”为准，不再把已完成的记忆接线重复计作缺口。
- 本次未改 deployment、未改既有迁移、未解除任何 production fail-closed 门禁、未启用活动 Canon。当前改动位于隔离 worktree；需按仓库提交授权交给 PR #61 审阅，并等待新 head CI。

## 2026-10-05 非生产运行时与认证旅程更新

工作区基线仍为 `a909e74185023497134f5126262ca4d3f2c8c645`；本节结果来自其后的未提交工作区改动，不能当作该旧 head 的 CI 结果。

| 命令 / 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0；contracts、content、domain、db、api、web 均通过 |
| `pnpm test` | 退出 0；core 28/28，contracts 17，content 43，domain 116，API 110 passed / 31 PostgreSQL tests skipped，web 157 |
| `pnpm build` | 退出 0；API 与 web 构建成功；Canon runtime 34 confirmed entries，`receiptsComplete=false`；保留既有 >500 kB chunk warning |
| `TEST_DATABASE_URL=<jiuxiao_test_pr6> pnpm test:integration` | 退出 0；10 文件 / 36 项通过 |
| `TEST_DATABASE_URL=<jiuxiao_test_pr6> pnpm test:e2e` | 退出 0；手机/桌面 UI、渲染回退和音频同意回归通过；负向预检确认未识别规则文件不能绕过 production gate；测试邮箱 session 下非 production 精确 review plugin 完成 12 个回合请求、14 个事件、2 条 NPC 直接授权。Continue/Forgetting 分别经不同确定性路线完成首个清障；硬拒绝未改 revision，重复叙事重用同一 receipt 与相同回退文本。 |
| `pnpm install --frozen-lockfile` / `pnpm license:check` | 均退出 0；冻结依赖已满足，83 个依赖条目通过许可证检查。 |
| `node scripts/p1-rule-candidate-digest.mjs` | 退出 0；39 文件包仍为已批准 SHA `a4b8fbf7e612084007112ed3fac52d711deb461f652788a71fd791ce05ebc0e2`；新增 API 测试会在 CI 复算该摘要 |
| `git diff --check` | 需在本节文档改动完成后重跑 |

叙事边界：NPC 回忆从追加写入的授权观察 outbox 重建，并按 V2 存档中的策略版本检索；只有当前直接交谈的 NPC 会被注入上下文。服务层测试证明上下文被过滤并传给 narrator，provider 测试证明 prompt 显式约束其用途；E2E 没有启用模型，故未证明模型确实按回忆作出合格回应，也未验证真人长局中的遗忘体验。模型不可用时，服务从同一已提交 receipt 生成确定性文本，不重跑规则。review plugin 源码 SHA-256 为 `94c57793bfde874469b81c1d97c914ab5591d628631564679f07d7e3aef83735`，运行时非生产加载前校验。

总体验收边界：此旅程使用测试夹具预置邮箱 session，只在 `NODE_ENV=test` 加载精确 review plugin。它不是游客旅程，也不把候选规则发布为 Canon。生产 API 仍由 `AUTHOR_RULES_GATE` fail-closed，Canon `receiptsComplete=false` 未变。用户要求保留邮箱登录并维持游客门未完成；因此 PR-6/P1 不得宣称完成。PR-8 的时段规则和自动化测试已在该候选包中通过；PR-7、首屏/首任务限时证据、真实设备记录仍开放。

## 2026-10-05 精确 head CI 与制品复核

PR #61 head `1517a4a9c6cb467c08fc6594903af7c69f6cef7e` 的 Actions run [`37290513895`](https://github.com/L-core-dev-team/Nine-cloud/actions/runs/37290513895) 已完成且结论为 success。run 中冻结安装、许可证检查、typecheck、单测、build、规则 fail-closed、API 容器、PostgreSQL 集成、E2E、耐久 UI、邮件/云浏览器、备份恢复、制品绑定和审阅包上传均成功。CI 工程包包含 `RC_MANIFEST.json`，绑定同一 commit 与 artifact hash `sha256:ecf9af82fbed2e36e26a48e59450b0d97db66e60662dd8522ebc1d958cf64176`；`CI_STATUS_AT_GENERATION` 为 `in_progress`，但其所绑定的 run 后续已结束并通过。`DeviceTestRecord.json` 的状态仍为 `DEVICE_TEST_PENDING`，设备、浏览器、时长、帧率、内存、温度与审核人均为空；CI 不能代替真人 15 分钟实机记录。

### 当前未关闭的验收门

- 普通游客零配置完成首个任务 ≤3 分钟：依用户指示保留邮箱登录且游客门保持未完成。邮箱会话 E2E 不替代游客验收。
- 确定性解析器已接入精确获批的非生产 candidate runtime；解析只使用当前存档授权的可见目标目录。生产 `AUTHOR_RULES_GATE` 仍关闭，不允许该 candidate 进入生产 `/api/turns`。
- PR-7 工程实现已包括状态派生建议、点击后写入可编辑 free-text、低体力描写、岑九伤势回应、第三次闲谈钩子及 W3/W8 自动检查；本轮仍需精确 head CI 和 15 分钟真实设备记录，才可判断 PR-7 阶段退出。
- 390×844 浏览器视口 E2E 通过，选档后首条建议按钮 28 ms 可见。这是模拟视口证据，不满足实机记录。
- `DeviceTestRecord.json` 仍待填入实际设备、浏览器、持续时间、帧率、内存、温度与审核人。
- 活动 Canon 与生产规则门仍受 S 轨 G-03/G-04a 独立门禁约束；这不是 PR-6 候选 E2E 的通过证据，也不并入 P 轨销账。

## 2026-10-05 PR-6/PR-7 本地工程复验

基于 PR #61 已通过 CI 的父提交 `1517a4a9c6cb467c08fc6594903af7c69f6cef7e`，本次工作树新增 free-text 到确定性 parser/reducer 的 candidate-only 接线、存档状态派生的建议接口与可编辑按钮、状态派生叙事提示和对应测试。解析器不读取自然语言模型输出作为权限或结算依据；候选 runtime 仅在精确摘要审核路径里可加载。新建存档时写入的 `creationRequestHash` 是持久化幂等元数据，不属于严格 P1 facts；parser/建议目录构造前将它剥离，避免存储字段使整份游戏事实解析失败。

同一工作树的 `pnpm test:e2e` 退出码为 0。它包括 390/1366px 浏览器视口基础回归、API `RULES_NOT_READY` 负向门、邮箱会话下两种记忆策略的候选规则旅程，以及新增的建议按钮 UI 回归。建议按钮在选档后 28 ms 可见；点选后行动类别仍为 `free_text`，文本仍可编辑。此数据来自 emulated Chromium 视口，不是物理设备。

本地 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`、隔离 PostgreSQL 的 `pnpm test:integration`、`pnpm build`、`pnpm license:check` 均退出 0。完整单测中 API/PG 的 31 项因为未设置 `TEST_DATABASE_URL` 而跳过；独立集成套件在 `jiuxiao_test_pr6` 上 10 文件 / 36 项通过。build 仍以 `receiptsComplete=false` 执行显式 pending-receipts 路径；34 条 confirmed runtime 记录和 >500 kB 前端 chunk 提示均保留。

Codex 依用户明确授权替代可由软件完成的人工检查，对本候选文本及三条 runtime hint 逐条检查了 §3.8 W1–W10 和自检三问：当前固定语料中 W3 无破折号，W8 每条完整文本均命中 SHA 校验过的作者来源；低体力、岑九伤势问句及第三次闲谈钩子只由提交后状态/回执触发，且不写入事实投影。体力/伤势提示仅在当前存档 revision 与回执 `resultingRevision` 一致时读取，避免旧回执叙事引用更晚存档的状态。这个模型辅助审读不是 Bird 的 GitHub review，也不能证明未来任意模型输出都符合写作纪律；运行时 W3/W8 门禁只覆盖登记文本与这三条固定提示。

### 当前退出计数

| P1 总退出项 | 状态 | 依据 |
| --- | --- | --- |
| 八类行动与结构化结算样例 | 本地通过 | 规则候选测试覆盖 move、cultivate、acquire_item、use_item、talk、observe、combat、quest，并覆盖成功、合法失败和零事件拒绝。 |
| 游客零配置首任务 ≤3 分钟 | **保持开放** | 用户明确要求保留邮箱登录并暂不关闭游客门。不能用预置 session 测试替代。 |
| 幂等重试 / 叙事重试不重结算 | 本地通过 | candidate E2E 检查相同 receipt、事件 id、回退叙事及数据库事件计数。 |
| 观察每次返回 clue 或 `none` | 本地通过 | candidate/reducer 测试覆盖找到线索、重复观察 `none` 和暗时段阻断。 |
| 双账号隔离 | 本地通过 | PostgreSQL integration 对 foreign owner 查询返回 not-found，且不泄漏存档存在性。 |
| NLU-01–14 语料与作者共同认可 | 已记录 | 依用户确认的共同认可材料及 PR-4 执行记录；不再要求重复盲标或 Bird review。 |
| `RULES_NOT_READY` fail-closed | 本地通过 | E2E 负向路径确认错误规则模块不写存档、回执、事件或 NPC memory。 |
| 同一提交 RC manifest / artifact hash | **待新 head CI** | 当前工作树尚未推送；父提交 CI 不覆盖本次改动。 |
| P 轨与 S/UI 轨分开 | 已核对 | 只更新 P 轨代码、测试和文档；没有改写 S/UI 台账。 |

因此，在新 head CI 通过之后，九项总退出里仍有一项按用户裁决保持开放：游客首局。PR-7 的 15 分钟真实设备记录是另一项独立阶段门；当前生成的 `DeviceTestRecord.json` 仍为 `DEVICE_TEST_PENDING`。二者都不能由本地浏览器模拟数据代填。生产 `AUTHOR_RULES_GATE` / Canon 收据继续按 S 轨既有 fail-closed 门禁处理，不并入 P1 销账。


## 2026-10-05 已验收代码 head CI 与退出状态

PR #61 的实现提交 1c655d1db2e37fcbf102cd6bba6b7ab9e7471d0a 对应 CI run 37303409239 已全部通过。冻结安装、许可证检查、typecheck、单测、build、release-target fail-closed、API 容器、PostgreSQL 集成、全量 E2E、耐久回执恢复、邮件/云浏览器路径、数据库恢复、manifest 绑定及审阅包上传均成功。前一 run 37301439149 在新增状态建议 GET 的合成 mock 缺失时失败；实现提交加入 mock 后，node tests/e2e/turns.cjs 本地四视口通过，完整 CI 复验成功。

从该 run 下载的工程制品核对结果：RC_MANIFEST.json 的 RC_SHA 与 PR head 完全相同；CI_RUN 为 37303409239；ARTIFACT_HASH 为 sha256:cafe17601a727a1f8b792d70876b3d72e7e46a433e508ec604f5afd14b62ac60。独立计算 artifact-manifest.json SHA-256 与 artifact-manifest.sha256 sidecar、RC_MANIFEST.ARTIFACT_HASH 三方相同。DeviceTestRecord.json 仍为 DEVICE_TEST_PENDING，releaseApproved=false。

P1 九项总退出现有八项通过证据，唯一未关闭项是用户此前决定保留邮箱登录并维持开放的游客零配置首局；PR-7 的 15 分钟真实设备记录是额外阶段门，不能由浏览器模拟补填。AUTHOR_RULES_GATE / Canon 仍按 S 轨 fail-closed，不因本候选 CI 改变。以上内容覆盖早期“工作树未提交 / 新 head CI 待跑”的历史快照。
