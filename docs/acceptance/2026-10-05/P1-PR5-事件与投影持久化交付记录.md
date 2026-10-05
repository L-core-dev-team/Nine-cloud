# P1 PR-5 事件与投影持久化交付记录

日期：2026-10-05
基线：PR #51 head `467428dc48cb8723dca3465db0932ddf28ad5d12`
分支：`codex/p1-pr5-event-projections`
作者输入状态：用户明确确认，本轮提供的审阅结论、A/B NLU 表与 MAP 材料均由 LYL 与 Bird 共同认可。PR-5 不再等待另份 Bird review 或重复盲标。

## 范围与实现

- 只追加 `packages/db/drizzle/0015_p1_gameplay_persistence.sql`，并在 Drizzle journal 追加 index 15。已有 0014 是已应用的 NPC 授权观察 outbox，未重写或复用旧迁移。
- 复用 `turn_events`、`turn_requests` 和 `game_saves.snapshot`，没有新增第二份玩法状态投影。
- `turn_events.branch_id` 使用默认值并受数据库约束固定为 `root`；NPC 回合事务写入事件时显式持久化 `branchId`。旧事件哈希算法和历史记录不变。
- 新增保存 V2 policy 的 `game_saves.memory_mode` 与 `memory_policy`。V1 行两列均为 `NULL`，继续用 V1 envelope 读取和写入；不从 `memory_policy_version` 推断模式，也不自动将 V1 升级为 V2。
- V2 创建时保存 `memoryMode`、完整严格 policy、原 `memoryPolicyVersion`。替换接口拒绝 schema downgrade 与 policy 更改；数据库触发器也拒绝绕过 API 的修改。
- 数据库检查把版本互斥条件包进 `IS TRUE`，防止 PostgreSQL 将 `CHECK` 结果 `UNKNOWN` 当作通过。集成测试用原始 SQL 确认缺少 policy 与 policy 必填字段为 `null` 都会被数据库拒绝。
- 不可信本地归档仍限定为 V1；V2 不进入旧归档删除/恢复契约。云存档和回合配额均计入 V2 policy JSON 字节。
- 仅扩展事件/存档持久化；不接通生产规则目录或生产 parser，不改变 `ActionIntent → rules → DomainEvent → projection → authorized NPC memory → narrative` 的权威链，不改变 `/api/turns` 的 fail-closed 行为，不更改活动 Canon/runtime。

## 验收证据

所有数据库验证都指向新建的隔离数据库 `jiuxiao_test_pr5b`（PostgreSQL 17），未连接 `web-db-1` 或任何开发/生产数据库。应用迁移两次均成功。完整集成套件在同一全新数据库通过。

| 命令 | 退出 | 关键原始输出 / 覆盖 |
| --- | ---: | --- |
| `pnpm --filter @jiuxiao/db db:migrate`（新库首次） | 0 | `migrations applied successfully!` |
| `pnpm --filter @jiuxiao/db db:migrate`（同库重复） | 0 | `migrations applied successfully!`；无重复建列或迁移历史改写 |
| `$env:TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/jiuxiao_test_pr5b'; pnpm test:integration` | 0 | `Test Files 10 passed (10)`；`Tests 36 passed (36)`。覆盖存档 V1/V2 round-trip、V2 policy 不可变及直接 SQL 无效 policy 拒绝、V2 排除出不可信归档、root branch 落库及拒绝非 root、owner 隔离、事件链和事务路径；执行后清除该临时环境变量。 |
| `pnpm test` | 0 | core regressions `28/28`；API `97 passed / 31 skipped`；Web `157`；domain `102`；content `41`；contracts `17`。API/PG 集成项在该命令中因未设置 `TEST_DATABASE_URL` 而跳过，另由上一行全量运行。Content 测试内有预期的 `CANON_RECEIPTS_PENDING` fail-closed 子进程诊断，Vitest 套件退出 0。 |
| `pnpm --filter @jiuxiao/contracts test` | 0 | `Test Files 2 passed (2)`；`Tests 17 passed (17)` |
| `pnpm typecheck` | 0 | 6 个工作区项目均完成 typecheck |
| `pnpm build` | 0 | `Verified public Canon runtime 1.0: 34 confirmed entries; receiptsComplete=false`；API/web/schema build 完成。既有 Vite >500 kB chunk warning 仍在。 |
| `pnpm install --frozen-lockfile` | 0 | `Scope: all 7 workspace projects`；`Already up to date`（依赖没有改动） |
| `git diff --check` | 0 | 无输出；无 whitespace error |

执行规格当前 SHA-256 已复核为 `3edba2136ef1a783a701327c16208bab289908f83db0084dc748bdc612fa526f`；作者原创候选文档 `packages/content/src/prologue/prologue-v1.ts` SHA-256 为 `66c7557c74263813d7a7ea832de4961c612a12fa48a6f15ecdf6c53a7a1a571f`，与 registry 一致。P 轨作者输入仍为 candidate-only；未发布到 Canon runtime。

## 自主决策与人工交接

- A 决策见 [`自主决策记录.md`](../../自主决策记录.md) 的“PR-5 · 事件与投影落库”：采用迁移 0015、保留 V1、不猜测记忆模式、固定 V2 policy、branch 限定 root、扩展 quota 统计、local archive 保持 V1，以及 `CHECK ... IS TRUE` 的数据库约束修正。
- PR-5 无待 LYL/Bird 补交的规则、Canon 或盲标材料。用户确认的共同认可材料已经进入仓库记录。
- PR-5 阶段退出仍要求将本变更推送到 GitHub 并确认该 PR 精确 head 的 CI。GitHub PR 检查不等同于作者验收，也不替代项目已认可的材料。

## 尚未由 PR-5 验收的事项

- 本地普通 `pnpm test` 中 31 个 API integration assertions 未执行；独立完整 PostgreSQL suite 的 36 项已通过。
- 本阶段没有运行 P1 序章浏览器 E2E、真机测试或游客计时验收；这些属于 PR-6/PR-7 退出门槛。
- 本次 V2 存储不实现两种 NPC 记忆检索算法，也不代表 Mem0/UwU 运行集成已完成；Continue/Forgetting 的运行隔离仍属后续 P1 阶段。
- 构建保留 `receiptsComplete=false` 与大包警告。Canon/S 轨回执、规则签署门和 `RULES_NOT_READY` 均未放宽。
- P1 整体仍未完成；PR-6 及后续 P1 退出条件必须分别验证，P 轨事项不写入 S/UI 缺口台账。
