# API 部署交接

## 当前部署路线：Pages + 境内 Node API，先 A 后 B

依据 [2026-10-11 部署路线裁决](../docs/acceptance/2026-10-11/部署路线A-B裁决材料.md)，LYL 已选择前端 Cloudflare Pages、境内 Node API 源站与“先 A 后 B”。Bird 对总路线的独立复核仍待记录；入口封锁与 SES 预检方案的已有批准不等于整个路线 B 或发布获批。

当前工程候选在仓库根 functions/ 提供同源 API 中继；生产是否生效必须由具体部署 SHA 和公网响应证明。中继与源站都保留路线 A 入口封锁，生产账号和短信能力默认关闭。恢复工作及本地验收记录见 [2026-10-13 环境验收](../docs/acceptance/2026-10-13/环境方案恢复与模拟验收.md)。

Worker + Supabase 适配器仍保留为工程候选；Worker 尚未覆盖完整玩法 API，不得据此把全量生产 /api/* 切换到 Worker。[ADR 0008](../docs/adr/0008-cloudflare-workers-supabase-runtime.md) 记录 2026-10-06 的较早运行时选择，后续现场部署路线以 2026-10-11 裁决为准；身份映射、稳定 owner 与隐私门禁继续有效。

## Node API 部署说明（选定路线的工程候选）

本说明只涵盖 API 源站。前端 Functions 和 Caddy 配置必须分别构建、验收并记录部署指纹。已有 api.jiuxiaogame.cn 的只读探测记录不能证明当前候选已部署；完整同源验收的 PUBLIC_API_BASE_URL 应为玩家实际访问的 HTTPS 根地址（如已部署的 play.jiuxiaogame.cn）。

## 安装与启动

1. 下载与目标 `$RC_SHA` 完全相同的 CI 工程评审包；在干净检出中固定该 SHA 后构建 API 镜像。记录源码 SHA、Dockerfile、镜像 registry digest 与推送回执，再将 `API_IMAGE` 固定为 digest。当前 CI 包不含生产镜像，且 `releaseApproved:false` 不代表发布批准。
2. 私有环境填写 api.private.env.example 所列字段，保存成 api.private.env，权限限制为部署账号可读。此文件与 runtime/、backups/ 已忽略；密钥不放 Pages、不上传。
3. 准备 PostgreSQL，并在启用前备份已有数据库。数据库保持仅监听宿主 `127.0.0.1`。先运行 Compose `create` 建立 bridge 网络；检查实际 gateway/subnet，再准备只绑定该 gateway 的宿主 TCP 转发到 PostgreSQL 回环端口。防火墙仅允许该 Compose 子网访问转发端口。`DATABASE_URL` 不得填写容器内 `127.0.0.1`；公网不得开放 5432 或转发端口。核实连接路径后再启动迁移。
4. Compose 的认证默认关闭。按 ADR 0007 使用 Supabase Auth 验证 OTP，由 Hono 签发业务会话并保留稳定 owner ID。生产启用认证必须有正式 HTTPS origin、Supabase publishable key 与仅服务端使用的 secret key、Hono 生命周期发信通道（AUTH_MAILER=ses-api 或 smtp）、公开隐私政策 URL/版号和适用的数据处理政策。
5. 配置同源 `/api/*`、`/health`、`/ready` 路径转发，再将 `PUBLIC_API_BASE_URL` 设为用户访问的同源 HTTPS 根地址。普通构建须让 `VITE_API_BASE_URL` 保持未设置，客户端才默认请求同源 `/api`；Pages 预览构建可设置该变量指向独立 staging API。边缘层与 API 反代须保留 `Origin`、`Cookie`，不可缓存认证路径，并支持至少 180 秒的回合请求超时。VPS 证书覆盖边缘入口连接的源站主机名；前端 origin 的 HTTPS 由边缘/前端托管方提供。
6. 执行 `docker compose --env-file deployment/api.private.env -f deployment/api-production.compose.yml up -d`。认证关闭时可先启动健康检查 API；认证开启且相应发信通道预检失败时 API 不应被认为可用；SES API 预检只校验配置，真实到达仍需独立验收。
7. 在验收终端将 `PUBLIC_API_BASE_URL` 和 `PUBLIC_SITE_BASE_URL` 都设为玩家实际访问的 HTTPS 根地址；路线 A 再设 `SMOKE_ROUTE_A=1`，然后运行 `node scripts/api-production-smoke.mjs`。脚本检查 API 及玩家站点上的 health/ready/session、并以只读 GET 拒绝反射不信任的 Origin；未设置 `PUBLIC_SITE_BASE_URL` 时会明确输出 `siteRelay: NOT_TESTED`，不能据此认定 P3 完成。脚本不发邮件。
8. 实际邮箱、两账号和手机验收按唯一缺口清单进行；Mailpit 结果不能替代生产投递。数据政策生效前禁止云档写入。

前端 `cloud-sync.ts` 通过 `apiRequestUrl('/api/…')` 构造地址；普通构建未设置 `VITE_API_BASE_URL` 时默认同源 `/api/*` 并发送 `credentials: 'include'`。生产方案保持该变量未设置，并由 Pages Functions/Worker 等边缘入口转发 `/api/*`、`/health` 与 `/ready` 到 VPS API。Pages 预览可以使用独立 HTTPS staging API，但那条跨域路径须另验 CORS 和 Cookie。`AUTH_PUBLIC_ORIGIN` 是前端 origin，不是 VPS API 的 origin。

## 认证模式与 Supabase 凭据

`deployment/api.private.env.example` 默认将 `AUTH_ENABLED`、`SUPABASE_AUTH_ENABLED`、邮箱和手机号能力都设为关闭。每次只启用一个 Hono 认证模式。

- 选择 Supabase Auth 时，设置 `AUTH_ENABLED=false`、`SUPABASE_AUTH_ENABLED=true`、`SUPABASE_AUTH_EMAIL_ENABLED=true`，并提供项目 URL、publishable key、至少 32 字节独立 `AUTH_SECRET` 与 `AUTH_IDENTITY_HMAC_SECRET`。浏览器只收到公开的政策链接；Supabase secret/service-role key、SMTP 密码和 Tencent 凭据不得放入 Hono Web 变量、Pages 或客户端。
- `SUPABASE_SECRET_KEY` 供 Hono 服务端调用 Supabase Auth Admin API，同步已验证邮箱变更，以及在手机号解绑/账号删除时清理 Supabase Auth 用户。可使用 Supabase secret key（`sb_secret_...`）或兼容的旧 `service_role` key。它必须只存在于 API 私有环境；不可放入 Vite、Pages、客户端或日志。缺少该密钥时 Supabase Auth 模式启动失败。
- Hono 自己的 AUTH_MAILER 发信通道用于账号邮箱变更、关闭等生命周期验证（当前默认 SES API，可选 SMTP）。Supabase Auth 的 SMTP 用于登录 OTP；两者可以由同一家供应商承载，但需分别配置并实收验收。SMTP 连接预检或 SES 配置预检都不证明实际投递成功。
- 启用生产认证要求配置 `AUTH_PRIVACY_POLICY_URL` 和 `AUTH_PRIVACY_POLICY_VERSION`。该运行时校验只检查 HTTPS URL 与版号，不证明政策内容已审查，也不代替运营主体、数据保留期限、处理方协议及客户端展示验收。
- `packages/db/drizzle/0016_supabase_external_identity.sql` 属于 Hono 业务数据库迁移；迁移前运行只读 `node scripts/audit/auth-identities-preflight.mjs`，核对大小写不敏感的邮箱冲突和 owner 计数。若存在冲突，迁移会在任何 DDL 前停止。此迁移不得套用到错误的数据库。
- `supabase/migrations/202610060001_auth_sms_budget.sql` 属于 Supabase 项目 PostgreSQL，不会由 Hono 的 Drizzle migrator 自动执行。先备份并确认 Supabase 项目 ref，再按批准的维护窗口通过 Supabase CLI 应用。随后部署 `supabase/functions/send-sms-hook`，在 Auth Hook 设置中填写 HTTPS 函数地址及 Standard Webhooks 签名密钥，并关闭该函数的 JWT 验证（仓库 `supabase/config.toml` 已声明；Hook 自行验签）。Hook 内部供应商请求限时 4 秒，低于 Supabase HTTP Auth Hook 的 5 秒执行上限；真实运营商链路仍须实测。
- 该 Supabase 迁移也新增 `purge_auth_sms_ephemeral_data()`。短信入口仍关闭时先由运营方批准摘要/重放记录的保存期；部署后在 Supabase 数据库计划任务中每天调用该函数，确认回执。函数清理超过 2 日的号码 HMAC 限流摘要和超过 7 日的 Hook ID；它不清理活动账号的身份映射或 Supabase Auth 用户。
- Hono 的来源 IP 与账号 HMAC 限流表建议每日预览：`node --env-file=deployment/api.private.env scripts/api-auth-rate-limit-retention.mjs`。运营方批准 2 日保留期且先核对预览后，再加 `--apply`；任务计划需在主机侧安装并记录运行结果。脚本不删除账号、身份映射或登录会话。
- 手机号始终保持关闭，直到 Supabase Auth 的手机号提供方、Turnstile CAPTCHA、Auth Send SMS Hook、短信签名/模板、真实成本、地区 allowlist、月/日/单号/IP/已登录账号限额和供应商密钥全部核验。Hono 同时要求设置 `AUTH_TRUSTED_PROXY_ADDRESSES`：填写 API TCP 对端的精确反向代理 IP；反向代理必须覆盖 `X-Forwarded-For`，仅转发其验证过的客户端 IP。不得信任客户端可控的原始转发链。Hook 的 Tencent 凭据只作为 Supabase Edge Function secrets 配置；RPC 访问优先使用平台提供的 `SUPABASE_SECRET_KEYS`，兼容部署才设置 server-side Supabase secret/service-role key。Hono 的所有 `SMS_*` 开关仍需与 Hook 的非秘密预算/地区配置一致。样例值全为零，不代表免费额度，也不能发送短信。
- 账号关闭后，邮箱和手机号 OTP 都可在 30 日窗口内恢复。手机号解绑前 Hono 会检查 Supabase Auth 用户确为仅有手机号身份的用户，再调用 Admin API 删除远端 Auth 用户并撤销本地映射；无法安全确认身份形态或远端请求失败时，解绑失败且保留本地映射。邮箱变更先通过本地邮件 OTP 验证新地址，再用 Admin API 更新并确认 Supabase 邮箱。
- `ACCOUNT_DELETE_ENABLED` 仍默认关闭。只有数据政策文件通过运行时校验并由运营方确认后才能开启。用户发起立即删除或计划到期删除时，Hono 先逐个删除该 owner 映射的 Supabase Auth 用户，再清理本地数据；远端失败会阻止本地删除。外部 Supabase API 与本地 PostgreSQL 事务无法形成分布式原子事务，若中途失败，重试会将已删除的远端用户视为已完成并继续。冷备份和外部日志的保留/擦除仍由主机和供应商政策负责。
- `scripts/api-auth-rate-limit-retention.mjs` 的预览与清理依赖 Hono 业务库已应用迁移 `0016_supabase_external_identity.sql`；只在正确数据库运行，并先审阅预览。手机号用户摘要与 Hook ID 的 Supabase 定时清理则依赖 Supabase 项目迁移 `202610060001_auth_sms_budget.sql` 已应用。

应用 Supabase 迁移、部署函数、填写 Auth Dashboard、配置生产 SMTP、设置任何非零短信额度、绑定生产域名或启用真实账号，都不由仓库变更自动完成。本次本地工程提交之前不对在线 Supabase 项目、Cloudflare DNS 或生产主机执行写操作。

## 正式规则与叙事接入

把审核后的 JS/MJS 规则模块放入只读 runtime/，TURN_RULES_MODULE 设置为容器绝对路径 `/run/jiuxiao/rules.mjs`。模块默认导出 TurnPlugin：provider（version 和 resolve）、grantsForEvent、policyForNpc、initialState。模块由可信宿主安装，永不从客户端、模型或远程 URL 加载。没有模块时回合/建档 503 RULES_NOT_READY。

initialState 只根据作者批准的建档规则选择，客户端 name/goal 不授予修为或资源。POST /api/games 输入 idempotencyKey 和 choices，返回服务端权威 SaveEnvelope；owner 来自 Session。同键同输入只建一次，不同输入 409。

叙事配置参考 narrative.example.json，将审核过的五岗位设置放在 runtime/narrative.json，设置 NARRATIVE_CONFIG_PATH；所有岗位默认关闭。密钥用 `NARRATIVE_KEY_*` 私有环境注入。配置可声明 required、dependencies、timeoutMs、maxOutputTokens、retries、primary/fallback。story 始终必要，其它岗位可选；可声明依赖已成功的前置岗位。四协议只构造批准字段，响应大小和上下文有上限。日志只包含岗位、状态、尝试次数和预算，不含正文/提示词/密钥。AI 输出仅叙事候选，不修改权威状态。

未批准的正式规则、模型/岗位范围、真实 Key 属外部 Gate。不要把合成测试规则作为生产规则部署。

## 备份、恢复与回滚

使用部署平台已有 PostgreSQL 加密备份，或 `pg_dump --format=custom --file=<私有备份文件>`（通过 PGHOST/PGUSER/PGDATABASE/PGPASSFILE 私有配置传凭据，不把密码放命令行）。备份必须加密、限制访问并按批准期限清除；在线永久删除不证明历史备份已擦除。

恢复演练：新建隔离空数据库 → `pg_restore --exit-on-error --no-owner --dbname=<隔离数据库名> <备份文件>` → /ready 与双账号所有权/回合重放核对 → 记录备份 SHA-256、Schema 和演练结果。未经批准不要覆盖生产数据库。仓库 tests/integration/database-restore.mjs 在 CI 的隔离库验证备份恢复。

API 回滚先固定旧镜像 digest，核对其可读取当前 Schema，再切回旧镜像并跑 smoke。若 Schema 不兼容，停止写入，在隔离库恢复已验证备份、核对后切换数据库；不自动删除迁移、不倒退 live 数据、不 force push。需部署负责人记录恢复点与允许的数据损失范围。

具体人工作业与剩余缺口只维护在 docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md；本文件是执行说明，不创建第二份缺口清单。

## 批准数据政策消费者

生产必须通过 ACCOUNT_DATA_POLICY_PATH 指向只读私有 JSON。字段为 version、expiresAt、approvedBy（Bird/LYL 的真实批准记录）、maxSaves、perSaveBytes、totalBytes、trashRetentionDays、backupPolicy（托管方冷备期限/清除依据）。不要把示例字段自行填成已批准。ACCOUNT_DATA_POLICY_VERSION 标签本身不能启用生产删除。

配额计算 PostgreSQL JSONB 存档快照 UTF-8 字节，软删快照仍占配额；并非整个数据库或冷备空间计量。并发写入按账号串行核对，超额返回 CLOUD_QUOTA_EXCEEDED，政策缺失/到期返回 DATA_POLICY_NOT_READY。正式回合提交使用同一事务内的快照配额门禁。

构建后 `node scripts/api-retention.mjs` 只预览过期软删的客户端档案数量；经负责人核对后 `node scripts/api-retention.mjs --apply` 每批最多处理 100 档。它不会删除权威回合/事件/NPC 记忆，不上传档案内容，不删除托管方冷备。平台加密冷备保留/擦除必须提供真实工单或演练回执，不能用脚本的在线结果冒充。

可选叙事路径有两种凭据来源：玩家在 AI 设置显式保存的批准字段及 Key 留在当前标签页内存，随后在“回合处理”点击生成叙事；或运营方配置私有 NARRATIVE_CONFIG_PATH/NARRATIVE_KEY_*。两者复用一个共享调度器。页面 Key 不会发送给 Auth API；刷新/关闭标签页后失效。跨厂商 CORS 和真实型号权限仍需本人 Key 验收。

## PR #37 后的迁移与生命周期作业

0008–0010 的安全/来源/回收站迁移保留；0011 添加共享配额和最小生命周期审计，0012 为事件背书哈希链、保存归属 FK。新库 CI 从零迁移并重复 migrate 验证幂等。0012 在独占迁移事务中回填旧事件哈希，恢复不可修改触发器；发现孤儿档案时 FK 验证失败，保留原数据，必须由运营核对归属后再部署，禁止伪造账号或删档。

所有生产 API 实例共享 PostgreSQL 原子频控。导出由事务 advisory lock 限单账号1个、同库全局4个，超限 EXPORT_BUSY 可稍后重试；事务超时/连接关闭释放占用，无需依赖进程内状态。备份、限流和迁移使用同一数据库连接策略。

关闭后全部 Session 吊销。30天内本人邮箱 OTP 可在云档页主动恢复；普通登录不自动恢复。到期恢复拒绝。经批准数据政策并开启 ACCOUNT_DELETE_ENABLED 后，运行 `node scripts/api-account-expiry.mjs` 预览，`--apply` 每批最多100个，在账号锁下擦除在线关联数据并留无邮箱审计；与恢复竞争只允许一个赢家。由宿主计划任务定期运行；缺政策/到期/开关关闭禁止执行。冷备仍是运营门禁。

新客户端云档 ID 带账号摘要命名空间；生产服务拒绝其它命名空间而不查占用。旧已存在档案仍按 owner 读写。旧未提交队列先按 owner 查询；本账号已提交的丢回执继续恢复，否则事务重绑定命名空间 ID 后重试，不修改原档。拒绝响应不透露其它账号占用。

回滚先停止写入并核对旧镜像与新 Schema 的兼容性；迁移不自动降级。哈希链的数据库验证与原有确定性规则重放分别验收，不能用链完整代替规则正确。两者改变均生成新 RC/Schema/Canon 指纹。PR #35 仅做独立 API 地址、HTTPS、CORS、Cookie 接口复核，不在此合并其 Pages 部署结构。
