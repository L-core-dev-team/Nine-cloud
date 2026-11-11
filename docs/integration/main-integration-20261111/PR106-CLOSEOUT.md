# PR #106 限定合并前收口

基线：`fd1e4737ccc39ba856ef9515f4bcf5795a262896`；main：`d41351f602efd3c6e526f4577b83b387bfe2116a`。本文件随修复提交绑定身份；不批准合并、生产迁移、部署或完整 T1。

## 已结束的原 CI

[verify run 43039550694](https://github.com/L-core-dev-team/Nine-cloud/actions/runs/43039550694)，job `130587362052`，2026-11-11 14:45:44 UTC 结束为 FAILURE。

- 安装、类型检查、单测、构建、API 容器 smoke、原生 PostgreSQL 集成等前置步骤 SUCCESS。
- `playwright install --with-deps chromium` 失败：Ubuntu APT 无法解析 `azure.archive.ubuntu.com`，依赖安装 exit 100，步骤 exit 1。这是安装网络故障，未出现应用 E2E 断言失败。
- Playwright E2E、turns/cloud 浏览器流程、数据库备份恢复、review bundle、证据上传均 SKIPPED，不能宣称完成或通过。
- CodeQL 成功；Supabase Preview 跳过，说明 PR preview branching 已禁用。
- 未盲目重跑原任务、未更换包源或降低测试门槛。本修复普通推送后由 PR 自动化执行新 SHA；最终状态应读取该新 run，不能沿用旧结果。

## 定向修复

1. `app.ts:createApp` 在已有无缓存 `/api/auth/providers` 响应增加 `cardImport`，仅由实际 `cards` 宿主依赖决定；不是请求参数、卡片内容或客户端声明。没有新增认证体系或生产启用参数。
2. `card-availability.ts` 使用已有受限 `cloudRequest`。只有严格 boolean true 才开放；缺字段、错误、超大响应和取消均关闭，不持久化能力缓存。焦点恢复会重新查询，不因查询开始主动卸载现有视图。
3. `main.tsx:WorldHub` 默认隐藏入口；`CardArea` 同时保护直接链接。能力不替代 Session/owner 校验。原生玩法入口、缓存、回执未改。
4. `local-runtime.ts:assertLocalCardDatabase` 拒绝 URL query/hash。发现原检查只看 hostname/path，而 pg 连接解析允许 `?host=...` 或 `?dbname=...` 覆盖真实目标；已在本地宿主及角色卡测试 Pool 建立前复用严格检查。仅接受 PostgreSQL、127.0.0.1 和各 suite 的测试库名称。该检查不证明数据库归属，执行者仍必须核对实例数据目录。
5. CI 在安装 Chromium 后增加独立入口显示测试，使用构建后的真实网页、模拟 API；不访问数据库、不调用真实模型。

## 删除、隔离与初始化复核

- `services/account-lifecycle.ts:complete`：有限预读只选择连接；选定连接 BEGIN 后重新检查 Session/owner、operation、有效期、确认内容和状态。专用连接验证实际 session_user；卡片 beforeDelete、账号/存档/会话清理、operation 和 audit 使用同一个 PoolClient。失败 ROLLBACK；缺失或无效显式 Erasure pool 不回退 Runtime。
- `expireClosed` 复用专用身份并锁定账号，在同事务执行清理与审计。原默认 undefined 模式保留 main 行为，不等于 T1 删除已经上线。
- `card-import/host.ts` 的可信 owner 来自 Session resolver；客户端 owner 不能决定访问对象。service 的 owner 条件及关联约束、账号生命周期锁继续存在。普通 Runtime 不能 SET ROLE Erasure。
- `schema.sql` 仍是隔离候选安装工件，不在正式 Drizzle journal；运行入口只通过 `verifyLocalCardSchema` 做 SELECT 预检，不创建表。host 集成测试实际证明安装中断完整回滚、Session/跨账号拒绝。
- 本轮生命周期 PG 测试对卡片清理后故障及最终 audit 写入故障核对逐记录内容和审计哈希，不只核对数量。真实执行使用受限 joint_runtime/joint_eraser；管理员仅准备合成夹具。测试权限不是生产最小权限安装批准。
- 剩余边界：远端 Supabase 账号删除与 PG 的跨系统原子性 NOT VERIFIED；完整 T1 清理 hook 的 proof 顺序、T1 表与角色未接入，不能用本轮结果销账。账号导出/保留政策和正式 card schema 迁移仍待审批。

## 本轮实际验证与失败记录

| 命令/证据 | 结果 | 范围 |
|---|---|---|
| API vitest：capability、local-runtime、router、email-auth | PASS 28 | 默认关闭、伪造开关无效、仍需认证、无 DDL、URL 覆盖拒绝及已有认证回归 |
| Web vitest：card-availability、card-import-client | PASS 17 | 能力类型/失败关闭、既有客户端身份与恢复 |
| API/Web typecheck、build | PASS | 本地，Web chunk 提示保留 |
| host.integration + main-integration-lifecycle.integration | PASS 32 | 全新 card host 库和专用 main 副本，PG 18.4，真实 Cookie/Session、合成模型、受限删除身份、故障哈希回滚 |
| local-node-card-host.mjs | PASS | 普通 Node index 真实 TCP HTTP，公开能力、Cookie、导入、备用开场、聊天、原 Key 查询、历史；宿主不执行迁移 |
| card-availability.cjs | PASS | 已安装 Chrome，360/1280；真实构建网页 + 模拟 API，不是 PG E2E |
| 原 S1/S2、原生剧情反馈、完整 T1 历史矩阵 | 未重跑 | 使用原固定 SHA 证据；不冒充本轮实跑 |

失败原件保留本地：沙箱 Vitest 临时文件 ENOENT；前端新增测试初次 TS tuple 类型错误已修正；浏览器断言误匹配全站账号导航已改为卡片特定提示；默认 Playwright Chromium 未安装，随后显式使用已安装 Chrome 验证。未下载或禁用浏览器安全功能来制造通过。

## GitHub CI 覆盖与缺口

- `pnpm test` 实际包含新增能力/本地地址守卫单测；有专用 env 的 PG suites 缺 env 会 skip，不能算 PASS。
- 新增 `Verify card entry mounting capability` 是 mock API 展示门禁；它不证明真实 Session/PG 端到端。
- `pnpm test:integration` 的显式列表仍是原生集成；CI 未设置 CARD_IMPORT_HOST_TEST_DATABASE_URL 或 MAIN_COMPOSITION_TEST_DATABASE_URL，也未安装 card_import schema。角色卡 PG、受限 Erasure 组合、普通 Node cards 闭环仍为本地证据。
- `pnpm test:e2e` 仍包含原生剧情/缓存/回执等流程；角色卡 S1/S2 完整浏览器链仍未加入 CI。
- 自动化只增加上述无写入外部环境的本地网页测试；保留原临时 PG/Mailpit。没有新增生产密钥、迁移、部署步骤或 main 写入权限。

## 合并门禁

PR 继续 Draft、auto-merge 关闭。等待新 SHA verify 全部终结；尤其 E2E、备份恢复与证据上传不能由前置步骤成功代替。入口修复和测试库守卫不授权生产 cards、真实模型、正式迁移或完整 T1。若 CI 再失败，按具体失败步骤处理，不把环境问题当业务回归，也不将跳过算通过。
