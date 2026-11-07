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


## CARD-WORLDBOOK-ADVANCED-05（2026-11-07）
本机隔离 PostgreSQL，应用内 HTTP 请求 + 真实 Cookie/Session 与合成模型：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts`：4文件40项 PASS。包含单人与群聊概率100/0、边界与关闭开关、已有账号隔离和会话快照回归。概率测试以合成固定随机数证明选择，不证明真实服务随机分布或完整酒馆行为。API typecheck/build、git diff --check PASS。首次非隔离单测的 Provider 测试因沙盒临时文件 ENOENT 失败；上述隔离环境重跑通过。真实网络断线、真实模型、生产 NOT VERIFIED；正则/递归/互斥功能 NOT IMPLEMENTED；固定ST高级功能运行时互操作未执行。


## CARD-WORLDBOOK-ADVANCED-05B（2026-11-07）
隔离 PostgreSQL、应用内 HTTP、真实 Cookie/Session、合成 Provider：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts`：4 文件 42 项 PASS；覆盖 A→B→C、循环、递归限制、阻断传播、加权/优先分组、分组后概率、单人和群聊组合、已有账号及会话回归。API typecheck/build 和 git diff --check PASS。正则安全实现 BLOCKED（仍拒绝），固定 ST 高级触发运行时对照 NOT VERIFIED；现有验证不等于完整酒馆兼容或真实外部模型/网络/生产验证。


## CARD-WORLDBOOK-05B-VERIFY-FREEZE（2026-11-07）
实际执行 `pnpm --filter @jiuxiao/api typecheck` PASS；`pnpm --filter @jiuxiao/api build` PASS；`pnpm exec vitest run apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/context.test.ts`：2 文件 11 项 PASS；`git diff --check` PASS。固定 ST 运行时八场景全部 NOT VERIFIED：Node 直接导入 world-info.js 因浏览器根路径 /scripts/i18n.js 解析失败；未运行完整浏览器 ST 触发流程。历史隔离数据库与 Cookie 测试仅引用 05B 记录，非本轮新运行。九霄默认递归和 ST 源码默认关闭的行为差异仅由源码确认，尚无 ST 运行时对照。高级世界书冻结 BLOCKED。


## CARD-WORLDBOOK-05B-RUNTIME-VERIFY（2026-11-07）
真实 Chromium 执行固定 ST 应用 checkWorldInfo，公开事件注入合成条目，浏览器与九霄随机源固定；九组对照结果及证据哈希见 CARD-WORLDBOOK-05B-RUNTIME-VERIFY.md。样本覆盖分组优先与权重两端、概率、概率失败的组行为、递归开关/链/循环和次级条件。递归关闭行为差异、递归链插入顺序差异已复现；固定样本不等于所有边界或实际导入链兼容。九霄 API typecheck/build 和世界书+上下文 2 文件 11 测试 PASS。真实 Provider、生产、真实断线 NOT VERIFIED。


## CARD-WORLDBOOK-05C（2026-11-07）
隔离 PostgreSQL + 应用内 HTTP + 真实 Cookie/Session + 合成 Provider：`pnpm exec vitest run apps/api/src/card-import/host.integration.test.ts apps/api/src/card-import/context.test.ts apps/api/src/card-import/worldbook.test.ts apps/api/src/card-import/card-model-provider.test.ts`，4文件45项 PASS；包含单人与群聊默认关闭/显式开启、模式冲突、跨账号拒绝、链顺序和保留旧行 true 的隔离临时表夹具。前置/后置顺序、原排序/分组概率及既有功能有受影响单元回归；仅选定样本符合固定 ST 的既有运行时证据。API typecheck/build PASS。真实旧数据库升级、混合版本写入、真实网络断开与生产 NOT VERIFIED；正式迁移 NOT RUN。


## CARD-INTEGRATION-06A（2026-11-07）
旧结构 054daa0 合成 PostgreSQL 升级与失败回滚、服务读取旧历史和新会话 false、旧唯一约束恢复拒绝：PASS；更早及中间库、真实数据、混合版本并发 NOT VERIFIED。6 文件 54 项隔离数据库/应用内真实 Session 回归 PASS；单个14步串行闭环 NOT RUN。真实本机 TCP 人为延迟响应、提交后客户端断开、原 key 查询及重试不重复模型调用 PASS；处理中断和未知 COMMIT NOT VERIFIED。详情 CARD-INTEGRATION-06A-DATABASE.md、CARD-INTEGRATION-06A-UI-CONTRACT.md、CARD-INTEGRATION-06A-PROVIDER-AND-HTTP.md。生产迁移、真实模型和发布仍未授权。

06A 补充：实际本地 TCP 串行覆盖导入、世界书、卡库、Persona、单人、登出重登、群聊手动/自动、历史、版本编辑和 JSON/PNG 导出 PASS；验证码冷却在隔离测试数据中调整。备用开场、多角色单次输出和跨账号由独立回归用例覆盖，非同一串行测试。


## CARD-UI-S1-LINJIANGXIAN（2026-11-07）
独立候选复用水龙吟 2cd9c46 卡片 UI；真实本地 TCP + 隔离 PG + 实际 Cookie/Session + 合成 Provider 浏览器闭环在360、390、1280宽 PASS，JSON/PNG 原件字节保持、无 Persona/指定 Persona、原始/备用开场、搜索、聊天、刷新、登出重登及跨账号拒绝 PASS；360响应丢失后刷新查询原 key 已完成 PASS；360缩短至500高度模拟键盘时发送按钮可见，非真实键盘。复用原 UI E2E 在320/360/390/844横屏、昼夜共8组（合成 API）PASS。独立 PG 相关回归5文件52项 PASS，后续客户端新增账号切换6项 PASS；API/Web typecheck/build PASS。真实手机、真实网络中断、真实模型/正式迁移/生产 NOT VERIFIED。详见 CARD-UI-S1-RECEIPT.md。


## CARD-UI-S2-LINJIANGXIAN（2026-11-07）
独立候选基线 ec72c94。群聊（2/3角色、策略、manual/auto/multi、服务端身份与历史）、世界书全局管理与未知替换核对、描述版本及 V2/V3/PNG 导出已接入；群聊 null Persona 与单人对齐。真实 Chromium/真实 Cookie/隔离 PostgreSQL/合成 Provider 360、390、844×390、1280 PASS；101合成回合分页与迟到跨账号响应隔离 PASS；S1真实浏览器及8组合成视口回归 PASS；隔离PG相关5文件54项、客户端8项、typecheck/build PASS。真实手机键盘/生产/真实模型及正式迁移 NOT VERIFIED。详见 CARD-UI-S2-RECEIPT.md。
