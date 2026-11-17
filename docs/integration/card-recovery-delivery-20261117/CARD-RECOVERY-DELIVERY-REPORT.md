# CARD-RECOVERY-DELIVERY-01 本地交付回执

2026-11-17。结论：**角色卡数据恢复、四个 API 真实进程退出窗口、无 Git/含空格路径的运行源码副本均取得限定 PASS**。仅修复一处已复现的本地启动器退出问题；没有修改角色卡业务、原生规则或生产入口。完整仓库归档、第二台 Windows、生产最小数据库权限和真实 Provider 不在这些 PASS 内。

## 固定身份与改动

- 起点：`0fae425e96ef51ca2c096043d00013244326723f`，Tree `1ff7c816c48634e0d9d9b7782118d2b2c96b0286`。
- 独立本地分支：`codex/card-recovery-delivery-20261117`。原 `codex/main-integration-20261111` 仍在上述起点、工作区干净。
- 产品/测试检查点：`7d5cec95f92c15bf87a536c3de6702a692f89a54`，Tree `d64860ba096400f24d87e48cf79024e29f7ea0a3`。后续只补恢复查询隔离测试和本报告，不再改变产品字节。
- 最终提交和 Tree 在交付消息中固定；本报告所在提交可用 `git rev-parse HEAD`、`git rev-parse 'HEAD^{tree}'` 精确复核，避免在提交自身中嵌入无法成立的自引用 SHA。
- 仅本地提交，未 Push、修改 PR #106、合并、部署或执行生产迁移。未读取既有用户演示库，未改变网站封锁及 Cloudflare/Supabase 设置。

| 文件 | 实际修改及理由 |
|---|---|
| `scripts/dev/cards.mjs` | `stop()` 在暂停 stdin 后增加 `process.stdin.unref?.()`。真实浏览器测试复现：子服务停止后，父启动器仍被未关闭的管道保活。修复不删库、不改变鉴权或启动身份校验。 |
| `tests/e2e/cards-dev-demo.cjs` | 复用原浏览器测试，增加可选源码副本目标和 delivery 模式：群聊、重启、端口占用、残留锁。默认路径仍是原项目；只有新模式才执行新增场景。 |
| `tests/integration/database-snapshot.mjs` | 从原 `database-restore.mjs` 提取现有 catalog/完整行内容/结构摘要函数，未重建备份引擎。 |
| `tests/integration/database-restore.mjs` | 导入上述同一摘要函数，原 Docker CI 恢复流程保持不变。本轮不重跑历史绿色 CI。 |
| `tests/integration/card-recovery-host.mjs` | TEST_ONLY 子进程宿主，复用真实 Hono、Session、Repository、Service。只在指定 SQL 边界暂停，父测试按本次 PID 退出整个 API；模型调用账本独立于子进程。 |
| `tests/integration/card-recovery-delivery.mjs` | 新实例身份核验、合成业务夹具、HTTP、定向进程退出、原生 pg_dump/pg_restore、负向恢复和恢复后业务验证。只允许本任务新建库作恢复目标；不删除已有库。 |

报告与 `CARD-RECOVERY-DELIVERY-RESULTS.json` 是本轮两份交付材料。原始数据库、备份、OTP、连接状态和截图只留在忽略的本地目录，不进入提交。

## 1. 数据恢复：PASS，独立实例中的不同数据库

本轮新建实例使用 PostgreSQL **18.4**，独立数据目录/回环端口；复用本机已有 PostgreSQL **18.6** 客户端可执行文件。普通本地启动器安装的 schema 是测试来源，没有加载正式生产迁移环境。`SHOW data_directory` 与新目录一致后才创建测试库。

- 源库：`jiuxiao_test_recovery_source_5353fc5fa76f4869875479776f3de8ae`。
- 恢复库：`jiuxiao_test_recovery_restored_5353fc5fa76f4869875479776f3de8ae`。
- **同实例、不同新数据库**；不冒充第二实例或跨机器灾备。干净源码启动另有第二个新实例，但它不是该备份的恢复目标。
- 应用写入者退出后备份。使用 custom dump；正常恢复使用 `pg_restore --single-transaction --exit-on-error`。源库在恢复前后及恢复库继续游玩后再次比较，内容未变。

通过真实 HTTP/Cookie 建立两账号及如下非空数据：8 个原件导入、7 个卡片/版本、6 个链接、3 个重复策略记录、1 个 Persona 的 2 个版本、5 个会话、固定 Persona/世界书引用、2 名群聊参与者、2 段消息、发言策略、默认/备用开场、递归模式，以及 completed/failed/pending 三类请求。附件和原 JSON/PNG 字节保持独立保存。第二账号有独立卡片和会话。

从实际 catalog 枚举所有用户 schema 的 **38 张表，其中角色卡 16 张表均非空**，逐行使用排序后的完整 `to_jsonb` 内容参与摘要，包括 bytea 原件、归属、版本、请求及关联。比较全部行内容，不只比较数量；同时比较列、索引、约束、触发器定义。

- 行内容 SHA-256：`554da161e8448761994ee806d7dff0729e8a1a7818726fead700e7b663afab04`。
- 结构 SHA-256：`e88fc69e92b16a338afd5eccd86147fcd5ec1e6c2e7d451bbbcd888848ade398`。
- 备份 SHA-256：`bb4260d4210ece6a813632e13db70e4426b76b94fc65b075c196668d4489c26c`。

恢复后重新请求验证码、真实登录，确认原账号身份、旧 Persona 版本、备用开场和历史，成功新增单人回复及双角色多段回复。跨账号卡片、会话、群聊历史、附件读取返回 404。补充检查：同账号另一个会话查询原 Key 为 unknown，其他账号查询为 404；请求行未变、模型调用为零。

| 负向恢复 | 实际结果 |
|---|---|
| 非回环/错误目标、源库目标 | PASS：执行恢复前拒绝；仅允许本轮登记的新库。 |
| 非空目标 | PASS：保留 sentinel，不覆盖，不称为可用恢复库。 |
| 截断或破坏 dump | PASS：pg_restore 非零失败，目标仍为空，原件保留。 |
| 中断恢复 | PASS：由原 dump 导出的 SQL 测试副本，在真实 CREATE TABLE 后加入事务内 advisory barrier；实际 psql `--single-transaction` 到达 barrier 后终止该 PID 及精确匹配的阻塞后台。整事务回滚，目标为空。原 custom dump 未改。 |
| 源库保护 | PASS：上述操作及恢复后继续游玩均不改变源库摘要。 |

中断恢复证据是**真实恢复客户端/后台退出 + 测试 SQL barrier**，不是声称原 pg_restore custom 解码器任意字节位置中断都已覆盖。备份不包括操作系统、角色定义、应用认证 secret 或外部文件库；本例原件均在 DB。生产恢复还须另行管理角色、secret、版本和最小权限。

## 2. 请求进程退出：四项 PASS

使用真实 TCP POST、真实 Session、现有请求表和服务流程；只暂停测试 wrapper，不改产品事务。计数写入父目录 ledger，每次 API 重启后继续读取同一文件。

| 窗口 | 重启查询 | 模型次数 | 历史/revision | 同 Key 后续 |
|---|---|---:|---|---|
| pending COMMIT 后、模型调用前（单人） | pending | 0 | 0 / 0 | 不再生成；自然到期后 recover → failed |
| 模型调用中（单人） | pending | 1 | 0 / 0 | 不再生成；自然到期后 recover → failed |
| 群聊第一段写入后、第二段写入前 | pending | 1 | 全部回滚，0 / 0 | 不重调；自然到期后 recover → failed |
| 群聊 COMMIT 后、HTTP 回包前 | completed | 1 | 2 段 / 1 | 原 Key 返回同一 completed，不改判失败 |

每项均记录指定子进程 PID、退出结果和客户端真实 TCP 断开；模型计数未因重启归零。未知结果不等于未提交；没有自动新 Key，也未补造模型输出。另将真实登记后退出形成的 pending 纳入备份，恢复后只按既有到期规则恢复，不产生模型调用。

证据级别：本轮为 **真实 API 退出伴随 TCP 中断**。暂停位置借助真实数据库客户端 wrapper，但不是仅抛一个客户端异常。历史 COMMIT 回包异常注入、应用内模拟取消证据只继承，不混写为本轮进程退出。没有验证真实供应商严格一次计费。

## 3. 源码副本交付：限定 PASS

同一台 Windows，Node **26.13.0**、pnpm **11.25.0**（项目锁定 11.19.0，既有启动器允许该 11.x 兼容范围），复用已安装 PostgreSQL 可执行文件和正常包缓存。未复制 node_modules、dist、.env、.cards-local；未安装 Docker、系统服务或更改全局配置。

本地 partial clone 有缺失的历史文档/测试 blob，直接 git archive 失败，未无限重试。改为从固定 Git 对象导出 **485 个运行源码文件**，逐个核对 Git Blob 身份；不包含无关历史测试档案、原生大型场景媒体及非运行文档。**这不是完整仓库源码 ZIP 的验收**。缺失场景媒体的 Vite 警告已保留，不将角色卡路径通过扩大为全部原生场景通过。

最初源码字节来自 `0fae425e`；唯一运行源码修复 `scripts/dev/cards.mjs` 取自已提交 `7d5cec95`。最终逐字节核对与该产品检查点一致，其余应用源码未变。运行源码 ZIP SHA-256：`809effa3641f3a2e3199e82c5ddd4162c8c579ec242a4fdc2393794ae1a45528`。

实际执行：

```text
pnpm install --frozen-lockfile --registry https://registry.npmjs.org --fetch-retries=1 --fetch-timeout=30000
pnpm dev:cards --check
pnpm dev:cards --init --postgres-bin <本机已安装的独立 PG bin>
CARD_DEMO_SOURCE_ROOT=<无 .git、含空格的新副本>
CARD_DEMO_DELIVERY=1
pnpm test:cards-demo
pnpm --filter @jiuxiao/web typecheck
pnpm --filter @jiuxiao/web build
```

真实浏览器 360px：测试登录 → 导入 → 单人回复 → 刷新 → 第二张卡 → 双角色 multi 回复 → 刷新 → stdin stop → 重启 → 两段历史仍在 → 登出后隔离，通过。另验证已有端口监听者未被杀死、重复启动拒绝、合成残留锁拒绝，state 身份未变。启动器构建 API/contracts/content/domain 成功，Web 类型检查和构建成功。未重跑历史全量 CI。

## 失败保留与复现

1. 重复 copy 使用带必需附件的卡时按现有契约返回 `MISSING_OR_DUPLICATE_ASSET`；仅修正重复策略夹具为无附件合成卡，原附件关联夹具仍保留。没有绕过校验或更改产品。
2. 首次备份找不到 pg_dump（ENOENT），四个崩溃测试已通过。找到已安装 18.6 客户端后只执行 `--backup-only`，不重复四项。
3. 首次依赖安装留下可选 Windows binding 缺失；第二个全新副本按同一锁文件安装成功。未复制旧依赖或升级版本。workerd 可选包下载警告不等于角色卡 Web binding 不可用，实际启动和构建另有证据。
4. `pnpm exec node` 没有本启动器需要的 npm_execpath；改用现有 `pnpm test:cards-demo`，未删除启动身份检查。
5. stdin stop 保活导致失败，增加 unref 后在相同新副本中实测停止/重启通过；没有通过删除数据库解决启动。

完整本地记录在忽略目录，脱敏 JSON 给出相对路径与 SHA：

```text
test-results/card-recovery/7e08f5cd7e0d4a6593174309c52b1e90/   # 四项退出 PASS；随后工具 ENOENT
test-results/card-recovery/5353fc5fa76f4869875479776f3de8ae/   # 恢复成功
test-results/card-recovery/7810f9c07f974142bcb8651c6c4261d4/   # 额外请求归属隔离
test-results/source-delivery/                              # 浏览器结果、截图、源码字节清单
```

复现恢复：在新的本地副本先运行既有 dev:cards --init；设置 `CARD_TEST_PG_CLIENT_BIN` 指向现有 pg_dump/pg_restore/psql 后运行 `node tests/integration/card-recovery-delivery.mjs`。脚本验证数据目录、创建随机新库，故障只影响其自建子进程。测试备份和原始日志不可上传。实际业务登录仍沿用本地演示 bootstrap DB login，**没有证明生产 Runtime 最小 ACL**。

## 剩余边界与建议

| 项目 | 状态 |
|---|---|
| 非空角色卡完整逻辑备份及同实例新库恢复、恢复后继续游玩 | PASS |
| 四窗口真实 API 进程退出/原 Key 恢复 | PASS |
| 运行源码无 Git、空格路径、真实本地浏览器及重启 | PASS（明确排除历史档案和大型原生媒体） |
| 完整仓库 ZIP/第二台 Windows | NOT_VERIFIED |
| 第二实例备份恢复 | NOT_RUN |
| Docker 路径 | BLOCKED：本机没有 Docker，未安装 |
| 真实模型、计费一次性、生产最小 ACL、外部系统备份 | NOT_VERIFIED |
| 生产迁移、真实环境开放、内容审核、部署 | NOT_RUN；原门禁继续有效 |

适合后续独立审核的小补丁：启动器一行退出修复、共享摘要测试 helper、可选浏览器交付模式和 TEST_ONLY 恢复测试。无需新聊天/备份系统，也无需重跑已绿色的全量 CI。PR #106 继续保持原候选和 Draft，本轮候选只留本地，等待道主决定是否提取这些小补丁。
