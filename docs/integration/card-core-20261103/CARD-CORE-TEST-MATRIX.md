# 测试矩阵

> 以下原段落是早期历史断点；与本文件末尾 CARD-CORE-CLOSE-02 记录不一致时，以后者为准。
环境：独立本地副本、pnpm offline、合成数据。命令 pnpm exec vitest run apps/api/src/card-import/context-service.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/parser.test.ts apps/api/src/card-import/router.test.ts：PASS 5文件18项（2026-11-03；context-service 使用模拟 pool 与模型）。pnpm --filter @jiuxiao/api typecheck：PASS；pnpm --filter @jiuxiao/api build：PASS。最初沙箱运行因临时目录 ENOENT 失败，后授权在独立目录重跑通过。独立 PG 端到端 NOT RUN；真实 Provider NOT RUN；真机和生产 NOT VERIFIED。上述未覆盖完整开场、跨账号真实数据库、真实失败恢复、三卡真实模型端到端；历史证据不冒充本轮。

## 后续增量（2026-11-03）
独立 PG 57462、真实 Email Session/Cookie，合成数据：host.integration.test.ts 6项 PASS（含卡片导入、世界书命中、模拟Provider及出站校验、重复提交、历史和跨账号拒绝）。provider-egress、pinning、card-model、provider golden、context、worldbook 等7文件27项 PASS；API typecheck/build PASS。DNS及发送器采用模拟，不证明真实 TLS、生产出站安全或真实模型。真实外部 Provider、真机、生产 NOT VERIFIED。


## CARD-CORE-CLOSE-02 当前结果（2026-11-03）
- 隔离PG + 真实认证 Cookie / Hono 请求，host.integration.test.ts：PASS 10项；包含开场选择、不同选择冲突、旧行默认值临时表升级、重新登录继续、请求列表与跨账号、模型超时/取消/迟到及同key幂等。模拟Provider；邮箱限流通过仅隔离库时间前移模拟。初次重登因一分钟限流失败、修正测试后通过；非生产测试环境。
- vitest 9文件37项 PASS；API typecheck/build PASS；git diff --check PASS。
- 测试专用副本 + 本机真实 TLS：PASS，测试CA受信时校验 SNI/Host/连接回环IP，错误主机名、未受信自签名证书拒绝；重定向未跟随且 Provider 归一化失败；未授权域名、IPv6和私网拒绝。该副本额外允许 127.0.0.1 和57464端口；生产代码未开放，不能把该结果当公网/生产代理策略验收。
- 真实外部模型 NOT RUN；生产迁移 NOT RUN；真实网络断线传播 NOT VERIFIED；生产出站防护、实机与内容审核 NOT VERIFIED。

## CARD-FEATURE-COMPLETE-03 隔离回归（2026-11-05）
独立 PostgreSQL、真实 Cookie/Session、合成账号和模型：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/export.test.ts apps/api/src/card-import/parser.test.ts apps/api/src/card-import/router.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts apps/api/src/services/provider-golden.test.ts`：7文件41项 PASS，含三种世界书场景、编辑版本原件/旧会话隔离、卡库过滤、V2/V3/PNG本机回读和世界书副本。API typecheck/build PASS。PNG初次使用固定图片发生 PNG_EXPORT_INVALID，改用正确生成分块并复测通过；真实ST导入和封面保持 NOT VERIFIED。真实Provider NOT RUN；生产部署、正式迁移 NOT RUN。测试数据库独立创建并已停止实例。

## CARD-FEATURE-COMPLETE-03B 受影响回归（2026-11-05）
隔离 PostgreSQL + 真实 Cookie/Session + 合成模型：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/export.test.ts apps/api/src/card-import/parser.test.ts apps/api/src/card-import/router.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts apps/api/src/services/provider-golden.test.ts`：7文件45项 PASS；包含关联写入失败触发器注入并检查导入计数回滚、关联版本和旧会话、101项相同微秒时间分页、PNG后代导出图片块与原件相等。API typecheck/build PASS。此测试没有证明所有回滚、旧库升级、真实供应商、固定ST互操作或生产安全；均 NOT VERIFIED / NOT RUN。

## CARD-FEATURE-COMPLETE-03B-FINAL 定向结果（2026-11-05）
独立 PostgreSQL、真实 Cookie/Session、合成模型：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/export.test.ts apps/api/src/card-import/parser.test.ts apps/api/src/card-import/router.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts apps/api/src/services/provider-golden.test.ts`，7文件48项 PASS；新增启用/关闭时新旧会话隔离、跨账号拒绝、引用删除拒绝、三种重复策略并发同键、旧唯一约束模拟升级及失败回退保全。API typecheck/build PASS。全量旧库升级、生产迁移及固定 ST 实际互操作 NOT RUN/NOT VERIFIED。模拟临时表不能替代真实旧库生产迁移验证。

## CARD-03B-CLOSEOUT 测试（2026-11-05）
独立 PostgreSQL、真实 Cookie/Session、合成模型：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/export.test.ts apps/api/src/card-import/parser.test.ts apps/api/src/card-import/router.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts apps/api/src/services/provider-golden.test.ts`：7文件49项 PASS，含替换中会话并发、账号隔离、插入故障回滚、既有45项相关回归；API typecheck/build PASS。固定 SillyTavern 1.19.0（06bde939）本机 HTTP 合成 V2/V3/PNG 导入、PNG/JSON 导出到九霄解析、世界书导入与读取 PASS；测试样本未知字段/扩展保留 PASS，ST PNG 往返图片块逐字节一致 FAIL。真实旧库迁移、正式生产环境、真实模型 NOT RUN。

## CARD-PERSONA-GROUP-04 阶段测试（2026-11-05）
隔离 PostgreSQL、真实 Cookie/Session 和合成模型：host.integration、context、export、worldbook、provider-golden 共5文件38项 PASS；Persona 不同版本的会话固定、跨账号拒绝、已引用时删除拒绝及模型不可信上下文通过。API typecheck/build PASS。Persona 多用户和正式迁移仍需进一步验证；群聊及所有群聊验收 NOT RUN；真实 Provider NOT RUN。


## CARD-PERSONA-GROUP-04B 本地定向验证（2026-11-05）
真实 PostgreSQL 隔离实例、真实 Email Cookie/Session、合成模型：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts`，4 文件 34 项 PASS。覆盖 2/3 人创建、指定/轮询、合法多段、伪造参与者拒绝、重复键、历史、跨账号读取、Persona 选定、第二段插入故障回滚、单人已有回归。首次 SQL 类型错误和单人历史内部键泄露引起失败，修正后新空库复测通过。API `pnpm --filter @jiuxiao/api typecheck`、`pnpm --filter @jiuxiao/api build`、`git diff --check` PASS。
群聊世界书实际触发和固定版本专项、并发同键、取消/迟到及跨会话恢复专项 NOT RUN；结构错误专项仅验证了非法参与者，非 JSON 样本 NOT RUN。真实模型和生产 NOT VERIFIED；正式迁移 NOT RUN。上述未完成项不得标为 PASS。


## CARD-PERSONA-GROUP-04B-CLOSEOUT（2026-11-05）
本机独立 PostgreSQL、Hono app.request + 真实 Email Cookie/Session、合成 Provider：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts apps/api/src/services/provider-golden.test.ts`：5 文件 46 项 PASS。包括群聊书快照/去重/账号隔离；策略切换与重登录恢复；同键并发及内容冲突；超时与生成中取消、迟到结果；生成前、事务行锁等待中的提交前取消与提交后取消；模拟多段第二条插入失败回滚；模型非法 JSON、缺失字段、伪造身份、空/过长/过多/混合段拒绝，重复发言及额外字段处理；旧单人及 Persona 回归、预算裁剪。重登录为避免等待测试通过数据库调整了合成验证码请求的时间，不是生产认证行为变更。
API `pnpm --filter @jiuxiao/api typecheck`、`pnpm --filter @jiuxiao/api build`、`git diff --check` PASS。此前一次重新登录测试因真实认证冷却 FAIL，经合成时间调整后在新库复测 PASS。请求通过应用内 HTTP 接口而非真实 TCP；客户端真实断线到服务器的取消传播 NOT VERIFIED。COMMIT 未知结果、正式迁移、真实模型及生产 NOT VERIFIED/NOT RUN；不将测试授权解释为生产签收。
