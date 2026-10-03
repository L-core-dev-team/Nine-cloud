# Node API 生产部署交接

仅后端，不修改 Cloudflare Pages。正式公开 API Base URL 尚无实际资源，状态 `PUBLIC_API_BASE_URL_PENDING`；配置必须是实际 `https://<后端域名>`，不能填 localhost 或把示例域名冒充已部署。

## 安装与启动

1. 下载与目标 `$RC_SHA` 完全相同的 CI 工程评审包；在干净检出中固定该 SHA 后构建 API 镜像。记录源码 SHA、Dockerfile、镜像 registry digest 与推送回执，再将 `API_IMAGE` 固定为 digest。当前 CI 包不含生产镜像，且 `releaseApproved:false` 不代表发布批准。
2. 私有环境填写 api.private.env.example 所列字段，保存成 api.private.env，权限限制为部署账号可读。此文件与 runtime/、backups/ 已忽略；密钥不放 Pages、不上传。
3. 准备 PostgreSQL，并在启用前备份已有数据库。数据库保持仅监听宿主 `127.0.0.1`。先运行 Compose `create` 建立 bridge 网络；检查实际 gateway/subnet，再准备只绑定该 gateway 的宿主 TCP 转发到 PostgreSQL 回环端口。防火墙仅允许该 Compose 子网访问转发端口。`DATABASE_URL` 不得填写容器内 `127.0.0.1`；公网不得开放 5432 或转发端口。核实连接路径后再启动迁移。
4. 核对路线 A/B 与 `deployment/api-production.compose.yml`：当前 Compose 固定启用邮箱认证及 SMTP 启动预检。路线 A 若要保持“不开放账号”，必须先完成经批准的入口封锁和预检方案；否则不得声称该路线已落地。路线 B 必须先有有效双作者数据政策和真实邮件资源。
5. 配置同源 `/api/*`、`/health`、`/ready` 路径转发，再将 `PUBLIC_API_BASE_URL` 设为用户访问的同源 HTTPS 根地址。客户端当前使用相对 `/api`，不读取 `VITE_API_BASE_URL`。前端边缘层与 API 反代须保留 `Origin`、`Cookie`，不可缓存认证路径，并支持至少 180 秒的回合请求超时。VPS 证书覆盖边缘入口连接的源站主机名；前端 origin 的 HTTPS 由边缘/前端托管方提供。
6. 执行 `docker compose --env-file deployment/api.private.env -f deployment/api-production.compose.yml up -d`。迁移完成后 API 才启动；SMTP 连接预检失败会阻止启动。
7. 设置 `PUBLIC_API_BASE_URL` 后运行 `node --env-file=deployment/api.private.env scripts/api-production-smoke.mjs`。它检查 health/ready 与未登录 session 401，不发邮件。
8. 实际邮箱、两账号和手机验收按唯一缺口清单进行；Mailpit 结果不能替代生产投递。数据政策生效前禁止云档写入。

前端当前使用相对 `/api/*` 并发送 `credentials: include`；正式路径应由 Pages Functions/Worker 等边缘入口转发到 VPS API，维持浏览器侧同源。若改成独立 API 域名，须先实现并验证客户端 API base URL、CORS 与 Cookie 行为，不能只设置一个目前未使用的 `VITE_API_BASE_URL`。`AUTH_PUBLIC_ORIGIN` 是前端 origin，不是 VPS API 的 origin。

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
