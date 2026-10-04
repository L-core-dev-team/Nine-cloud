# 功能真实性审核

> 审计冻结时间：2026-10-05T00:57:20+08:00（北京时间）。主线：`3fe25f7bdad5ad65415ee060f43203c28650576b`。历史与 PR 元数据、代码入口、测试运行分别核对；不继承阶段完成标签。

主线自动验证：[37203520798](https://github.com/L-core-dev-team/Nine-cloud/actions/runs/37203520798)，success。

| 功能 | 代码 | 调用 | 验证 | 用户体验 | 最终状态 |
| --- | --- | --- | --- | --- | --- |
| 创建角色 | 有，main.tsx 建角与 game-creation.ts 权威建档 | 本地建角已接；权威建档需规则 runtime | foundation、creation-race；主线 CI 通过 | 本地可用；权威新局受门禁 | 🟠 部分实现 |
| 世界进入/资料阅读 | main.tsx 首页、世界入口、worldbook.ts 搜索 | 路由与内容动态加载已接 | foundation 世界阅读/返回测试通过 | 测试环境可进入与阅读 | 🟢 完整闭环（限定阅读导航） |
| 行动系统 | 本地 pendingQueue、ActionIntent、action-draft | 本地只排队；/turns 为独立流程 | action-draft/turn-client、模拟回执 E2E | 输入可用，正式结算不能推进 | 🟡 工程存在但未接通 |
| 回合系统 | ServerTurnService、RuleResolver、事务与恢复 | API 和 UI 入口存在，加载门禁关闭 | 集成测试与模拟回执 E2E 通过 | 正式回合返回 RULES_NOT_READY | 🟡 工程存在但未接通 |
| 规则系统 | 序章 reducer、规则接口、签署常量 | createPrologueV1RuleModule 生产实例化未找到；gate 版本 null | prologue-v1-rules.test.ts | 正式玩法尚不可用；不是规则没写 | 🟡 工程存在但未接通 |
| 战斗/事件 | 战斗分支、事件日志、hash/replay | 事件框架接事务；正式战斗仍随规则阻塞 | 规则/事件/回放测试 | 暂无完整正式战斗流程验证 | 🟡 工程存在但未接通 |
| 剧情推进 | pageNarrator/providerAdapter/NarrativeScheduler | 只能在已接受回执之后调用 | 协议、调度、重试/取消验证 | 上游正式回合未开；真人模型未验 | 🟡 工程存在但未接通 |
| 模型调用 | 四种协议、连接探测、五岗位适配 | AI 设置和叙事调用入口存在 | 自动测试；部分请求被模拟 | 连接测试可操作，真实供应商待验 | 🟠 部分实现 |
| Prompt | 固定回执提示构造 | 请求适配器已用；完整管理器未找到 | 适配测试 | 不等于可编辑提示词管理产品 | 🟠 部分实现 |
| 世界观约束 | 回执事实限制、Canon 版本/搜索 | 世界阅读接入；Canon 动态注入叙事未见闭环 | 结构/边界测试 | 不能证明叙事长期遵守全部设定 | 🟠 部分实现 |
| NPC 行为 | talk 规则、授权观察、序章内容候选 | 规则入口关闭；候选资料部分在 #51 | 部分规则测试 | 尚无完整 NPC 自主行为验收 | 🟠 部分实现 |
| NPC 记忆 | 写入、授权 outbox、retrieveNpcMemories、分页 | 检索函数与分页调用目前只找到测试消费者 | 记忆单测/事务隔离集成测试 | 未接正式 AI 回忆消费 | 🟡 工程存在但未接通 |
| Canon 发布 | 摘要、版本、发布器和历史双签 | 34条机器回执 reviews 为空 | 严格检查 CANON_RECEIPTS_PENDING；允许 pending 的工程检查通过 | 阅读可用，正式发布绑定未齐 | 🟡 工程存在但未接通 |
| 本地存档 | IndexedDB、迁移、冲突、导出脱敏 | 页面直接使用 | foundation/存档测试通过 | 已测环境可使用 | 🟢 完整闭环（限定已测范围） |
| 云同步 | 队列、CAS、鉴权、恢复 | CloudSettings 与 API 路由已接 | 真实隔离 SMTP/PostgreSQL 浏览器测试通过 | 测试环境可用；公网未确认 | 🟠 部分实现 |
| 用户系统 | 验证码/session、邮箱修改、导出、关闭/恢复/删除 | 启动入口按 AUTH_ENABLED 配置挂载 | 隔离登录及生命周期集成测试通过 | 本地服务可验；生产政策/邮件待验 | 🟠 部分实现 |
| Cloudflare | #35 存在 API URL 和预览构建实现 | 不在当前 main；远端部署控制台未核验 | 不能将其他分支预览校验当线上验收 | 未确认现行 Pages 实例 | 🟡 工程存在但未接通（主线） |
| API 服务 | Hono、PostgreSQL、SMTP、路由 | index.ts 实际挂载；auth 默认关闭可配置 | 容器 smoke/隔离测试成功 | 测试环境成立，公开 HTTPS 未验 | 🟠 部分实现 |
| 运行环境 | Compose、变量校验、迁移0000–0014 | 有模板；API localhost 端口留给外部 HTTPS 转发 | CI 新库重复迁移和恢复通过 | 真实资源未由本次审计证实 | 🟠 部分实现 |
| 手机/视听 | 响应式 UI、场景/降级/声音 | 页面已接，候选媒体授权门禁关闭 | 模拟视口与降级测试通过 | 不等于真实 iPhone 温度/耗电验收 | 🟠 部分实现 |

## 关键可定位证据

- [apps/web/src/main.tsx](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/apps/web/src/main.tsx#L413)
- [apps/api/src/services/turn-runtime.ts](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/apps/api/src/services/turn-runtime.ts#L28)
- [apps/api/src/services/author-rules-gate.ts](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/apps/api/src/services/author-rules-gate.ts#L11)
- [packages/domain/src/memory/retrieve.ts](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/packages/domain/src/memory/retrieve.ts#L6)
- [packages/content/src/canon-receipts.json](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/packages/content/src/canon-receipts.json#L1)
- [scripts/build-canon-runtime.mjs](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/scripts/build-canon-runtime.mjs#L47)
- [apps/api/src/index.ts](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/apps/api/src/index.ts#L29)
- [apps/web/src/cloud-sync.ts](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/apps/web/src/cloud-sync.ts#L45)
- [tests/e2e/turns.cjs](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/tests/e2e/turns.cjs#L2)
- [.github/workflows/ci.yml](https://github.com/L-core-dev-team/Nine-cloud/blob/3fe25f7bdad5ad65415ee060f43203c28650576b/.github/workflows/ci.yml#L66)

基础模块存在且通过测试，不等于完整产品已闭环；不存在证据时不擅自认定完全没写。

## 证据边界

- 已获取完整 Git 提交图（非浅克隆）、50 个现存远端分支、53 个 PR 的元数据/文件/提交清单、270 次可列出的 Actions 运行。
- 主线含 249 个可达提交；全部现存分支可达提交并集为 326。主线第一父链 36 个节点用于核对主线接收过程。
- 元数据是多次只读请求的时间快照。PR #51 在审计期间继续前进；末次 PR head 单独记录，不将其计入 main。
- 326 是完整历史取回时的提交并集；其后 #51 前进到 67f51c5（相对 main 19 提交/37 文件），固定 SHA 差异与新增提交另行附录，不把较早分支表冒充同步瞬间快照。
- 所有历史分支均检查提交图与文件清单；功能深查集中于当前主线和相关开放 PR，不声称逐行复核所有旧版本/生成 HTML。
- 使用主线 SHA 对应 CI 的成功记录及测试源码确认覆盖范围；没有重跑全套 CI，没有真实手机、真实供应商或公网部署实测。
- 只生成本目录报告和证据；未修改项目功能、配置、分支、远端或原项目工作区。
