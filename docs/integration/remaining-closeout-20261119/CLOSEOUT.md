# 九霄 M1–M5 接续回执与操作步骤

本候选从 main `1bd7bb5ff6e6221378a7cb1292e559fb19bfbfbc` 建立。逐路径施工登记见 [SCOPE.json](SCOPE.json)，各环境实际执行记录见 [RESULTS.json](RESULTS.json)。SCOPE 中 server-turn.ts、npc-memory-turn-transaction.ts 与 postgres-server-turn.ts 指待签补丁内的路径。运行中的三份原文件与主线逐字节相同。

## M1 模型交接

选择 `gpt-6-luna`、Chat Completions、文本输出。官方将旧快照 `gpt-4o-2024-08-06` 的停用日列为 2027-01-14。Luna 支持 1,050,000 总上下文、最多 922,000 输入及 128,000 输出。应用使用更窄的上下文 65,536、输出 4,096 硬上限，按 UTF-8 字节、消息封装、预留输出与余量估算，超限在出站前拒绝。请求使用 `max_completion_tokens` 和 `reasoning_effort: none`。示例为 16,384/512，空 owner、0 次、关闭。显式选择旧模型仍保留旧协议和预算；更换模型须有新批准，已完成请求按原键、旧快照读取。标准价格（美元/百万 Token）为普通输入 0.10、缓存读取 0.01、输出 0.50。M1 原实施轮的全部模型结果来自本机协议服务，真实供应商调用、真实额度消耗及本轮生成费用估算均为 0，未取得真实供应商用量或账单。[模型与价格](https://developers.openai.com/api/docs/models/gpt-6-luna) · [停用安排](https://developers.openai.com/api/docs/deprecations)

### CARD-LUNA-LIVE-01 限定验收

实测 Commit `cd25360c7929e10f8b2b0fad342fedd943d4f323`，Tree `2a1b66a29623b1461e7f42bd84cf9f1e27eff17c`。单人首轮（Persona 与世界书）、单人续聊、群聊手动、群聊双人分段、出站后取消、客户端应答丢失六个场景均 PASS。6 个请求键对应 6 次 TLS 出站，持久额度消耗 6/6，原键查询和恢复新增出站 0 次。本次批准已关闭，应用和隔离库已停止。

取消发生在出站后，请求最终记录为失败，历史和修订均未增加；供应商 HTTP 状态和用量未知，额度保留。客户端应答丢失发生在应用保存成功之后；供应商已返回 HTTP 200，客户端按原键恢复了已保存的回复。

五次已知用量合计输入 1,359、输出 156 Token，均为默认档，缓存读取为 0。按回执的标准费率估算为 **$0.00021390**。取消请求按 8,192 输入和 512 输出保留 **$0.00506880**，两者合计 **$0.00528270**。

回执另按保守费率复算了五次已知用量：每百万 Token 的输入按 $0.25、输出按 $0.50，再乘 2.2（Fast 档 2 倍、区域处理 1.1 倍）。单人首轮、续聊、群聊手动、群聊双人分段、客户端应答丢失分别为 $0.00011275、$0.00013585、$0.00018810、$0.00033110、$0.00015125，共 $0.00091905。相对标准估算的差额为 $0.00070515，仅作为保守余量。**保守合计 $0.00598785 = $0.00091905 + $0.00506880**。最终账单未取得。

## M2 新库启动与受控升级

1. 使用独立源码目录、Node ≥24 与项目指定 pnpm。运行 `pnpm install --frozen-lockfile`、`pnpm dev:cards --check`。首次在空的新副本运行 `pnpm dev:cards --init --postgres-bin "<本机 PG bin>"`。按照终端指示打开本机地址，用合成邮箱取得本地验证码。用启动器的 stop 或 Ctrl+C 停止；再用同一目录、同一 bin、去掉 `--init` 重启。保留本地状态目录。安装器账号与应用登录分开，同一 OS 用户的本机文件仍在共同的操作系统信任边界内。
2. 已有演示状态出现身份或 schema digest 不匹配时保留原目录和数据。以下是明确选择的**隔离副本**升级步骤；普通启动不会调用旧库升级。先在独立实例验证当前数据库、server address、port、data_directory、session_user、PG ≥15 和已有 0024。用独立备份校验原件字节、owner、卡版本、世界书、Persona、会话、请求键、修订和额度摘要。
3. 停止所有旧 writer 和任务领取。等待已开始的请求进入终态；不通过改状态跳过。撤销旧写入权限与所有可切换成员关系，关闭旧登录，核实 pg_stat_activity 与 catalog。安装账号须拥有被升级对象；共享或超级用户旧登录不视为可安全退休。仅确认历史 schema 与合成夹具相符后，在同一安装连接设置 `jiuxiao.card_retired_writer`。例如给**专用隔离迁移进程**设置 `PGOPTIONS=-c jiuxiao.card_retired_writer=<实际已退休角色>`。通过该进程私有的 `DATABASE_URL` 运行 `pnpm --filter @jiuxiao/db db:migrate`，journal 追加 0025→0026。未知结构、未排空任务、额外对象或不安全权限拒绝。见实际可复现的 `tests/integration/card-install-upgrade.mjs`。严禁向真实旧库使用这里的演练命令。
4. 安装器预建分开的 NOLOGIN 业务角色和受限登录，按职责分配成员资格；安装 0026 后执行 `packages/db/permissions/card-access.sql`，本地合成认证使用 `card-local-auth.sql`（仅对应开发登录）。若启用独立删除身份，单独核验已有生命周期 SQL 权限与真实 session_user，并在安装事务内应用 `erasure-delivery.sql`。实际玩家身份仍由可信 Session 解析；共享运行登录的列授权不提供数据库级租户隔离。不要把安装器、对象 owner 或删除成员资格给普通应用。
5. 旧会话的递归模式保留；新会话默认关闭。没有历史模型快照的请求保持未知。旧版应用禁止与新 writer 并写。回退先隔离、停止新写入，保留升级后全量数据、请求键、版本及消费记录；必要时选择向前修复。不能通过 DROP 新表、恢复旧唯一约束或清空消费来降级。一旦有新写入，单靠旧备份不能作为无损回退。

## M3 删除、对账与隔离恢复

- 生成前持久扣减。无供应商成功确认时为 unknown，收到可解析结果并确认写入后为 acknowledged。普通会话删除、应用重启、取消不退款。永久删除清除 owner/session/key 定位行，保留批准 ID、配置绑定和累计 used；它们仍可能与宿主私有配置关联。
- Node 本地可显式传 `ACCOUNT_ERASURE_DATABASE_URL`，使用独立、同库、受限登录；生产配置不能以此开启实验。PG 资格、锁、卡数据、T1 proof 后清理及审计在同一事务。已有正文数据却缺少相应清理能力时拒绝。Supabase 的目标 subject 在本地删除事务内保存，提交后才发外部 DELETE。无确认时返回待核对，维护进程在已批准政策与专用身份下调用已有 `expireClosed(true)` 重试待办；404 视作已删除。外部应答丢失可重试。正常禁用状态、缺少身份映射或缺少权限时保持关闭。
- 投递完成后删除队列内的原 subject，只保留可关联的摘要、操作号、状态和政策版本。最终清理只向授权维护身份开放 `finish_erasure_retention(policy, reconciled_before)`；需外部核对和已批准的截止点。此调用释放重绑防线，使用前必须证明相关备份与身份凭据已处理。应用不自行选择保留期限。数据库管理员能改变这些限制，属于独立信任边界。
- 在**全新第二实例**中，将维护连接放在私有环境变量 `CARD_RECOVERY_MAINTENANCE_URL`（回环地址、明确端口、postgres 管理库）。对来自受信来源并已校验的备份运行 `node scripts/dev/cards-restore-quarantine.mjs "<第二实例数据目录>" "<pg_restore 所在目录>" "<备份文件>"`。工具验证目标目录，为此次恢复创建随机命名、普通账号连接限额为 0 的库，不向 PUBLIC 开放 CONNECT；使用单事务恢复，最后封闭全部连接。最终核对 pg_database.datallowconn=false。
- 一般数据库功能恢复与**过期备份**是两个场景。前者用完整的已核对合成状态实测双账号登录、续聊；后者在实际消费、删除后恢复旧快照，保持不可登录。只有备份之外的可信记录能核对后续消费和删除。当前无生产对账源，故过期备份保留隔离；不得沿用旧批准、换 ID 恢复额度或直接向玩家提供数据。

## M4 原生正文的权威来源与签署

默认宿主保留原规则及 StoryArchive。待签配置启用时，只有 T1 登记/worker 发布新正文，/story 兼容读取按回执身份核对 0024 历史数据；不覆盖原归档，不因无正文触发生成。来源路由用 sourceId；回执、分页、worker attempt 和授权身份仍各自绑定。旧动作的可信 0022 发布清单、没有正文和 ownership_unknown 分别处理。

显式安装候选在 `packages/db/pending`，0027→0028 **未登记到自动 journal**。需 schema-owner、lock-owner、operator、erasure、worker、runtime 职责分离、旧 writer 完整清单、旧角色失权消退、generation 排空和 fence 证据。测试工具在专用库中构造这些前提。不得仅凭主进程退出切换写入者。标准校验：
`node scripts/build/t1-authority-ci.mjs`，仅在本次独立 test DB 且具备该脚本要求的环境证明时运行。临时应用 [待签补丁](t1-authority.PENDING.patch)，编译并验证原加载器的拒绝和受限 PG 组合。

- 待签代码实现摘要 `sha256:6e7845780218bd7035b13bb174fc37a75228a771fbe857f15bfa2f1967eb52b9`，新聚合 `sha256:24d52dbea9e3effaa6d14bbf9f976e5772ab6a32f3b3f5d1fb283a54e36ed016`，已批准聚合 `sha256:8b938f92e0427ef03b44a7fe6cb90f8fb208e9ca7140a316dae187dfdd422006`。补丁 SHA-256 `23678dd62605da2b95ac956dbc9043912efe88a978ddedbceb4d23d74939b18f`。原 35 项的修改只在补丁中，针对同一回合事务登记/恢复及受限记忆快照；最终正式签署由原授权主体决定。
- 历史黄金 Commit `dbae068d86e5f9cd188d6196e403ce6dd701a1de`、Tree `2281d824dfe18d387b34cb9e13722dff125b49b0`、夹具 SHA-256 `e585515a8b4ca273aac962863f093c8fb0312055d8a49755baf37d4b3404e8e7`。本次合成规则事务、Continue/Forgetting 授权联合测试与正式黄金规则加载验收分别记账。历史原件见 `b0a22eb7:docs/integration/t1-v2-final-closeout-01/T1-V2-OWNER-ACCEPTANCE-EXCEPTIONS.md`。14 项本地 PASS、T03 延期及 T09 可信来源例外仅适用于原封存；新候选不推定旧无正文回执的来源。

## M5 门禁与待决条件

GitHub verify 使用临时 PG、合成凭据及本机协议 stub。新增步骤运行三种旧结构升级与第二实例恢复、待签 T1 组合、资源故障收尾及角色卡浏览器联测；CI 上传限定的脱敏收据。Windows 无 .git 空格目录启动、停机和重开单独实测。正式签署、业务政策和目标环境写操作均不由 CI 代办。

| 验收 | 状态与需要的最小输入 |
|---|---|
| Luna LIVE | CARD-LUNA-LIVE-01 六场景限定 PASS。本次批准已关闭；生产开放须另行授权。 |
| 云端 Supabase 双端删除 | BLOCKED。需要专用非生产项目、合成账号和对这些账号的删除授权；目前为 PG 实测与确定性远端适配器故障。 |
| 生产留存与过期备份重开 | BLOCKED。需要可独立核对的消费/删除记录、留存字段与截止政策、恢复批准主体。 |
| 原生 T1 加载正式规则 | BLOCKED。原批准主体须审阅待签聚合、事务补丁和最终黄金组合；另需确认旧例外对新版本的适用性与迁移角色/fence。 |
| 实际旧库、生产安装、跨物理机器、真机输入与目标部署 | NOT RUN。两数据目录在同一主机，Windows 实测仅限该机器；本轮没有生产变更。 |