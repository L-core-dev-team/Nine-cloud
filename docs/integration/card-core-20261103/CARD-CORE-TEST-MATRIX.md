# 测试矩阵
环境：独立本地副本、pnpm offline、合成数据。命令 pnpm exec vitest run apps/api/src/card-import/context-service.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/parser.test.ts apps/api/src/card-import/router.test.ts：PASS 5文件18项（2026-11-03；context-service 使用模拟 pool 与模型）。pnpm --filter @jiuxiao/api typecheck：PASS；pnpm --filter @jiuxiao/api build：PASS。最初沙箱运行因临时目录 ENOENT 失败，后授权在独立目录重跑通过。独立 PG 端到端 NOT RUN；真实 Provider NOT RUN；真机和生产 NOT VERIFIED。上述未覆盖完整开场、跨账号真实数据库、真实失败恢复、三卡真实模型端到端；历史证据不冒充本轮。

## 后续增量（2026-11-03）
独立 PG 57462、真实 Email Session/Cookie，合成数据：host.integration.test.ts 6项 PASS（含卡片导入、世界书命中、模拟Provider及出站校验、重复提交、历史和跨账号拒绝）。provider-egress、pinning、card-model、provider golden、context、worldbook 等7文件27项 PASS；API typecheck/build PASS。DNS及发送器采用模拟，不证明真实 TLS、生产出站安全或真实模型。真实外部 Provider、真机、生产 NOT VERIFIED。
