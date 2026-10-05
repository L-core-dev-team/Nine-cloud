# P1 / PR-6 规则候选审阅包

日期：2026-10-05
状态：**candidate-only；未接入生产 API；未解除作者规则门禁**
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
| `TEST_DATABASE_URL=<isolated jiuxiao_test_pr6> pnpm test:e2e` | 退出 0；既有手机/桌面 UI 回归通过；新增 P1 普通 HTTP API 门禁预检通过，真实 session 下 `/api/games` 与 `/api/turns` 均返回 `503 RULES_NOT_READY`，未写入存档/回执/事件/NPC 记忆。完整玩法旅程仍未运行。 |
| `pnpm typecheck` | 退出 0；contracts、content、domain、db、api、web 六个项目通过 |
| `pnpm build` | 退出 0；Canon runtime 34 confirmed entries；`receiptsComplete=false`；保留 >500 kB chunk warning |
| `git diff --check` | 退出 0；无输出 |
| `node scripts/p1-rule-candidate-digest.mjs` | 退出 0；输出上述完整候选包摘要及 39 项 manifest；候选专项文件 10 项测试通过 |

`pnpm test` 中 `CANON_RECEIPTS_PENDING` 子进程诊断是预期的 S/Canon fail-closed 检查；测试套件仍通过。该命令未设置 `TEST_DATABASE_URL`，所以 API 的 31 个 PostgreSQL 集成断言按常规测试配置跳过；随后在新建的 `jiuxiao_test_pr6` 专用测试库中单独运行完整 PostgreSQL 集成套件，10 个文件 / 36 项通过。测试库位于本机回环端口映射的 `jx-p1-pr5-pg` 专用 PostgreSQL 17 容器，未使用 `jiuxiao_test` 空库或任何开发/生产库。`pnpm test:e2e` 不设置该变量时会在数据库安全断言处退出，未启动测试旅程；带隔离库重跑才通过。其新增部分只验证真实 HTTP/API fail-closed：它配置 candidate 模块路径但不注入规则，在无规则签署时确认建档/回合均返回 503 且无世界写入。该结果不是完整游客玩法验收；完整 E2E 仍须等待精确规则摘要获准并绑定版本。

许可证检查初次失败的 stdout 原文为 `ERR_PNPM_MISSING_PACKAGE_INDEX_FILE: Failed to find package index file for vitest@5.0.1 ... please consider running 'pnpm install'`。重建忽略的 `node_modules` 后，冻结安装与许可证扫描均成功；未改 lockfile、pnpm 版本或许可证白名单。

## 门禁与退出边界

- `AUTHOR_RULES_GATE` 仍为 `BLOCKED_BY_OWNER`，`ActionRulesVersion` 与 `CombatRulesVersion` 均为 `null`。普通 `/api/turns` 仍按既有契约返回 503 `RULES_NOT_READY`。
- Candidate rulebook 未从 `packages/content/src/index.ts` 导出，且没有 API 导入；活动 Canon/runtime 与 `receiptsComplete=false` 均未改变。
- 本摘要是供作者审阅的精确候选，不是作者批准记录、生产版本号、Canon 发布回执或 P1/PR-6 完成声明。
- PR-6 仍缺：对上方完整摘要的作者批准；随后按已批准摘要绑定规则版本、完成普通游客 API 的无绕门 E2E（五类行动、两条清障路径、失败恢复与幂等），并达到首个可点行动 ≤3 秒、首个任务 ≤3 分钟。此处不要求重复 NLU 盲标或单独 GitHub review。
- 本次未改 deployment、未改既有迁移、未解除任何 fail-closed 门禁、未接入生产规则。当前修改仍是隔离 worktree 中的未提交候选。
