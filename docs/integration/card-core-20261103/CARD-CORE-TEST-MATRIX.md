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
