# Node API 生产部署交接

仅后端，不修改 Cloudflare Pages。正式公开 API Base URL 尚无实际资源，状态 `PUBLIC_API_BASE_URL_PENDING`；配置必须是实际 `https://<后端域名>`，不能填 localhost 或把示例域名冒充已部署。

## 安装与启动

1. 使用最终 RC 同一 SHA 构建 `apps/api/Dockerfile`，将镜像发布到部署方已有镜像仓库并记录不可变 image digest。将 `API_IMAGE` 设为此 digest。
2. 私有环境填写 api.private.env.example 所列字段，保存成 api.private.env，权限限制为部署账号可读。此文件与 runtime/、backups/ 已忽略；密钥不放 Pages、不上传。
3. 准备 PostgreSQL，并在启用前备份已有数据库。命令：`docker compose --env-file deployment/api.private.env -f deployment/api-production.compose.yml up -d`。迁移完成后 API 才启动；SMTP 连接预检失败会阻止启动。
4. 部署方配置真实域名、TLS 和反向代理，将该域名代理至宿主 127.0.0.1:8787。TLS/域名由已有平台提供；Compose 不自行签发或购买资源，不暴露 PostgreSQL。代理不得缓存认证路径，须保留 Origin 与 Cookie。
5. 设置 PUBLIC_API_BASE_URL 后运行 `node --env-file=deployment/api.private.env scripts/api-production-smoke.mjs`。它检查 health/ready 与未登录 session 401，不发邮件。
6. 实际邮箱、两账号和手机验收按唯一缺口清单进行，Mailpit 结果不能替代生产投递。

前端任务配置 `VITE_API_BASE_URL` 或其正式等价变量为同一公开 HTTPS 地址；独立后端域名请求须 `credentials: include`。优先同站自定义域名 + Strict Cookie；完全跨站需 None + Secure，但 Safari 可能阻止第三方 Cookie，应由前端部署任务改为同站域名/同源转发。AUTH_PUBLIC_ORIGIN 是前端 origin，不是 API 域名。

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
