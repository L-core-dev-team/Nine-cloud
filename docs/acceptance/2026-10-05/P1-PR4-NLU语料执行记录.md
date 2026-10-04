# P1 PR-4 NLU 语料执行记录

日期：2026-10-05  
代码基线：解析器与语料实现 `92b7f33c389b9bb6d9f03ce8976c025ec834ceb8`；当前 PR head `67f51c51c9cb34e6317167db9836e3adbbecbefb` 未再修改这些代码。2026-10-05 已在当前 head 重跑定向测试。
作者验收依据：[`P1-作者共同认可与PR-4验收裁决-2026-10-05.md`](../2026-10-04/P1-author-inputs/P1-作者共同认可与PR-4验收裁决-2026-10-05.md)

## 实现内容

- 新增 `packages/domain/src/nlu/prologue-v1-nlu-fixtures.ts`，固定作者共同认可的 NLU-01–14、当前阶段确定性模板和测试可见目录。
- 补入 `走到` → `move` 别名；`我看看` → `observe(scan)`，但缺 `targetId` 时只返回澄清，不产生 `ActionIntent`。
- 目标目录使用已提交材料中的 `loc_wangqitai`、`npc_cenjiu`、`obj_ferry`、`item_bishuifu`。测试目录不代表生产目录或 Canon runtime 已发布。
- 对 NLU-10/13 分两层验收：解析均为 `unknown` 且不生成意图；直接规则探针分别被拒绝。无事件副作用。地点探针码为 `INPUT_NO_SUCH_TARGET`；未持有物品探针码为 `ENV_ITEM_NOT_OWNED`。
- `clarify` 持久对象不含玩家原文；未知输入原文只出现在临时展示字段。

## 样本与结果

| 类别 | 数量 | 结果 |
| --- | ---: | --- |
| `ready` | 5 | NLU-01、02、11、12、14；动作和槽位精确匹配作者认可预期 |
| `missing` | 2 | NLU-03 缺 `destinationId`；NLU-04 缺 `targetId`；无意图、无事件 |
| `ambiguous` | 0 | 这 14 条输入中没有歧义样本；既有解析器单测继续覆盖多义、固定候选顺序与最多四项 |
| `unknown` | 7 | NLU-05–10、13；不产生 ActionIntent、0 事件 |

在 14 条冻结输入上未发现误接受。另有两个规则层伪造目标拒绝探针通过。该结论限于这 14 条作者认可样本及既有单元测试，不外推为总体误解析率为零，也不证明生产目录装配或完整 P1 事件结果。

## 命令与结果

| 命令 | 退出 | 关键原始输出 |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | `Already up to date`；`Done in 267ms using pnpm v11.19.0` |
| `pnpm --filter @jiuxiao/domain exec vitest run src/nlu/action-parser.test.ts src/nlu/prologue-v1-nlu-fixtures.test.ts src/prologue-v1-rules.test.ts --reporter=verbose` | 0 | `Test Files 3 passed (3)`；`Tests 63 passed (63)` |
| `pnpm typecheck` | 0 | contracts/content/domain build 完成；6 个工作区项目 typecheck 完成 |
| `pnpm test` | 0 | core regressions 28/28；contracts 17；content 41；domain 102；web 157；API 95 passed / 30 skipped。API/PG 集成因 `TEST_DATABASE_URL` 未设置而跳过。本地测试包含预期的 `CANON_RECEIPTS_PENDING` fail-closed 断言，Vitest 均通过。 |
| `pnpm build` | 0 | `Verified public Canon runtime 1.0: 34 confirmed entries; receiptsComplete=false`；API/web/schema build 完成；保留既有 555.13 kB bundle warning |

当前 head 的 GitHub Actions run `37217898217` 已完成安装、迁移、类型检查、单元测试、构建、容器冒烟和 PostgreSQL 集成；最后核对时 `pnpm test:e2e` 仍在运行，其余证据生成步骤尚未开始。因此完整 CI 暂不记为通过。定向测试在当前 head 重跑，3 个文件、63 个测试全部通过。

## 仍未覆盖的边界

- `NLU-11` parser 产出正确的 `talk` intent；表内 `talk.occurred outcome='refuse'` 尚未由当前规则模块验证。该项与共同认可的 MAP-02 / 现行规则簿存在规格一致化和实现工作，不能以 parser 通过替代。
- NLU-01/12 的事件、任务及 Canon 输出不由本语料测试证明；测试只验 parser 状态/槽位。完整事务闭环属后续 P1 阶段验收。
- 生产代码仍未调用 `parseActionText`，也没有生产 `VisibleTargetCatalog` 构造器；`cultivate`、`acquire_item`、`combat`、`quest` 没有本语料覆盖的自然语言模板。
- `receiptsComplete=false`、活动 Canon 状态与 `/api/turns` 的 `503 RULES_NOT_READY` 均保持原样。
