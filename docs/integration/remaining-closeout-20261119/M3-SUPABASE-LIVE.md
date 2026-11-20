# M3：真实 Supabase 删除联测入口

本项接续 CLOSEOUT.md 中的“云端 Supabase 双端删除”。真实云端验收仍为 **NOT RUN**；本文件和本地模拟结果不能将其改为 PASS。

## 为什么需要这次最小修改

现有 auth_external_identities 开启了行级安全（RLS）。原受限 PG 夹具只给删除登录授予 SELECT，同时以常量替代 remote.subjects()，因此未验证真实 SupabaseAuthService.erasureSubjects() 的读取。

独立宿主接入真实适配器后，在已有身份映射的情况下复现 SUPABASE_IDENTITIES_NOT_FOUND：查询被 RLS 隐藏，本地事务回滚，没有投递远端 DELETE。

可选安装脚本 packages/db/permissions/erasure-delivery.sql 现在只为 jiuxiao_narrative_erasure 增加：

- FOR SELECT 行策略。
- provider_subject、owner_id 两列的读取权。

跨 owner 的可见性用于拒绝同一供应商身份被两个账号共享。普通 runtime 无此权限；删除登录不能读取身份摘要，也没有直接写入或删除映射的权限。没有关闭 RLS、赋予 BYPASSRLS 或修改自动迁移登记。

## 本次范围

1. 上述可选权限安装脚本。
2. 现有 PG 集成用例改为调用真实身份查询，并验证列权限、身份共享拒绝和账号隔离。
3. 三个测试专用文件：
   - tests/integration/supabase-erasure-live.mjs
   - tests/integration/supabase-erasure-live-guard.mjs
   - tests/integration/supabase-erasure-live-guard.test.mjs
4. 本说明。

初版六文件修复与测试覆盖上述内容。收口复核另修正 Supabase 业务适配器对 DELETE 404 的确认条件，并为测试入口的 Git 子进程限定环境变量。缺少明确 Auth 错误码 `error_code=user_not_found` 时，删除投递保留原操作号及待投递身份，状态为 unknown。隔离模拟另覆盖网关 404 后的同号恢复。

scripts/api-account-expiry.mjs 的旧云端拒绝继续保留。该维护入口没有完整装配专用删除身份和清理钩子，**不得将它当作本次恢复命令**。本入口只按已登记的 operationId 调用既有 deliverExternalErasure()，不扫描其他用户。

## 要验收的闭环

使用三个由本轮生成的合成账号：

| 场景 | 必须观察到的结果 |
|---|---|
| 正常删除 | 本地受限事务提交后，真实 Supabase 删除确认；原 Cookie 失效，卡片、身份映射、会话及逐次用量定位行清除，累计消耗不退款。 |
| 提交前回滚 | 在清理事务内注入失败，本地逐记录摘要保持一致，远端请求新增 0；云端账号仍存在。 |
| 成功后丢失应答 | 真实 DELETE 成功后在测试适配器边界抛错；本地保存 unknown/pending，按原操作号重试，已不存在的用户得到明确 user_not_found 后完成。 |
| 已完成操作再恢复 | 没有新的 HTTP 分派。 |
| 对照账号 | 前述操作期间，第三个账号的本地数据摘要及云端身份保持完整；最终清理时才删除该合成云端账号。 |

本地邮箱验证码只由内存收件器接收。这里验证应用 Cookie、本地受限 PG 和真实云端 Admin 删除；**不宣称验证了 Supabase 登录、真实发信、短信、供应商自身故障或公网浏览器访问**。

## 运行方式

### 1. 本地模拟

在独立工作副本中安装锁定依赖，使用已有 PostgreSQL 二进制目录：

    pnpm install --frozen-lockfile
    $env:CARD_TEST_PG_BIN = '<PostgreSQL 的 bin 目录>'
    node --test tests/integration/supabase-erasure-live-guard.test.mjs
    node tests/integration/supabase-erasure-live.mjs --simulate

--simulate 用内存模拟 Auth 响应，外部 Supabase 请求为 0。每轮新建回环地址的 PostgreSQL 集群，使用真实业务模块、受限登录和已有迁移；结果明确记为 SIMULATION_PASS，不记为 LIVE。

### 2. 道主准备独立测试项目

1. 在 [Supabase 官方控制台](https://supabase.com/dashboard)选择能管理的组织，再选 **New project**。查看套餐、区域与费用后，由道主决定是否创建专用空项目。给它起容易区分的测试名称。建项目时的数据库密码保存在自己的密码管理器，此联测不连接云端 Postgres。
2. 打开新项目的 **Connect**，复制 Project URL。打开 **Settings → General** 核对项目 ID（ref），在 **Settings → API Keys** 复制 publishable key。这三项可用于标识和配置测试目标。该项目专用的服务端 secret key 只在执行当天放进本机进程环境，避免进入聊天、命令历史、文件或截图。[官方密钥说明](https://supabase.com/docs/guides/api/api-keys)
3. 核对项目名与 ref，在 **Authentication → Users** 清除筛选，确认用户列表为空。确认这个新项目没有连接现有应用、导入任务或玩家注册入口。发现任何已有用户即停止，保留其数据。测试前无需手动添加用户。[用户管理](https://supabase.com/docs/guides/auth/managing-user-data)
4. 道主单独批准该 ref、本轮候选及三个合成账号的创建和最终删除后，由执行者在干净候选中按下表设置本机配置，先运行 `--check`，通过后仅执行一轮 `--live`。入口预登记三个账号，并分别检验正常删除、失败恢复、对照账号保全。一次运行最多 40 次 HTTP 分派、最多 6 次 DELETE（含恢复与收尾）。
5. 结束后核对脱敏回执中三个标签均为 `confirmed_absent`、`databaseStopped=true`，再刷新同一项目的 **Authentication → Users**，确认回到空列表。如果出现 `UNCONFIRMED` 或列表有残留，保留仓库外私密清单，只按本轮三个 UUID 核查；批量删除及重新运行都会超出本轮清理范围。撤下本机进程密钥。

### 3. 真实验收的最小输入

必须明确指定一个专用非生产 Supabase 项目，以及允许本轮创建并最终删除三个合成账号。项目 ref、NODE_ENV 和确认值只能绑定指定目标，不能自动证明该项目没有真实用户。不能使用仓库模板中的历史项目地址代替这一确认。

只在启动联测的本机进程内设置以下变量；服务端密钥不发送到聊天、不写入仓库：

| 变量 | 含义 |
|---|---|
| CARD_SUPABASE_LIVE_PROJECT_REF | 专用测试项目的 20 位 ref。 |
| SUPABASE_URL | 必须精确为 https://<上述 ref>.supabase.co，不带尾部斜杠。 |
| SUPABASE_SECRET_KEY | 该项目的服务端 secret key，或 legacy service-role JWT。 |
| SUPABASE_PUBLISHABLE_KEY | 同一项目的公开 key；业务构造器需要，测试不使用它发送 OTP。 |
| CARD_TEST_PG_BIN | 本机 PostgreSQL 二进制目录。 |
| CARD_SUPABASE_LIVE_OUTPUT | 仓库以外的绝对私密输出目录。 |
| CARD_SUPABASE_LIVE_COMMIT | 已审阅候选的完整 Commit；须与干净 checkout 一致。 |
| CARD_SUPABASE_LIVE_CONFIRM | 固定为 SYNTHETIC_USERS_ONLY。 |

不得使用 NODE_ENV=production。本地数据库密码、会话密钥、身份摘要密钥及测试策略由入口本轮生成；不需要复用线上数据库或线上身份密钥。

    node tests/integration/supabase-erasure-live.mjs --check
    node tests/integration/supabase-erasure-live.mjs --live

--check 不创建数据库、不发 HTTP，只检查配置、候选身份及 PG 二进制存在。--live 会先从该干净提交重新运行现有 API 及依赖构建，记录产物摘要，再加载模块，避免将旧 dist 当作固定提交的证据。它不安装依赖、不运行生产迁移。

## 出站与收尾约束

- 只允许固定项目的 Admin 用户接口以及三个预登记 UUID；禁止列举用户、其他路径、重定向和跨项目请求。
- 创建前把 UUID、合成邮箱和本轮标记保存在私密清单。每 UUID 最多尝试一次创建；响应未知时只能查询该 UUID 核对，不自动重新创建。
- 只有确认属于本轮的 UUID、邮箱与 app_metadata 一致时，才允许删除。既存账号、元数据不符账号不被认领。
- 每轮最多 40 次 HTTP 分派、其中最多 6 次 DELETE；响应有时间和大小上限。请求头必须与原业务适配器一致，不由测试包装器修正。
- 404 还需核对原始 Auth 响应的 error_code=user_not_found。网关 404、权限不足和超时不能当作删除完成。
- 成功和异常路径都会尝试清理本轮合成云端账号并停止本轮 PG。清理无法确认则记为失败，保留私密清单供定向核查，不做批量删除。
- 回执的 requests 是应用层 HTTP 分派及观察到的状态，不能据此声称每次超时都已到达供应商。
- 本轮无模型调用、无短信或真实邮件；不修改线上应用、主线开关、生产迁移或正式留存政策。

输出中的 receipt.json 仅含受测提交/Tree、产物摘要、场景标签、HTTP 状态及清理结论。private-users.json、数据库、密码、原始数据库日志和 private-error.txt 保留在仓库外，不随源码上传。

## 仍保留的事项

当前尚未连接专用项目执行 --live。本地模拟通过不解除该项阻塞。

即使本项真实验收通过，正式生产维护命令接线、数据留存/过期备份对账、T1 正式签署和目标生产环境验收仍按原清单处理。本说明不自行确定留存天数、不批准生产账号删除。
