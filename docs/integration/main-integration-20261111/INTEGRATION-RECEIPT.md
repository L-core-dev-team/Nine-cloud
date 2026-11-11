# 新 main 独立整合候选 · 2026-11-11

结论：已形成可申请 **独立 Draft 整合 PR** 的本地候选，范围是角色卡后端／S1／S2、普通本地合成宿主和可选 Erasure 身份注入。**不是完整 T1 正文链签收，也不是生产发布许可。** 本轮未 Push、PR、Merge、部署或访问生产数据库。

## 身份和提取范围

- main：`d41351f602efd3c6e526f4577b83b387bfe2116a`，Tree `450edbe308ce79593d185fa345b3d6ce47497fbd`；开始和结束均通过远端查询核实。
- 角色卡：`7fe1d72de8aa977c56490b665f61567fdef8bc45`，Tree `cd90bde8b9daa59d26950ca966193f3fb68dc611`。
- 文档：`0936e548b90c0242dcc15e05a6306574a83ded81`，直接继承角色卡候选；只提取唯一查重总表，不再次移植代码。
- T1 安全提取：`cb697877221a29192a2108fd5f6fef8fc19ce403`，Tree `db204d4873dbeffcc9f60f030c51e6169d4930b7`。
- 新独立分支：`codex/main-integration-20261111`；父基线为上述 main。原角色卡、T1、水龙吟、main 工作树未修改。
- 采用独立 Git 工作副本、本地只读对象复用和稀疏检出；历史大体积证据仍在提交树中，不把未检出的资源视为删除。最终精确 SHA 见本轮交付回执；逐文件来源见 `FILE-DECISIONS.json`。

## 已移植、已存在、暂缓

| 状态 | 内容 | 依据／处理 |
|---|---|---|
| 已移植 | Parser、原件保存、卡库、版本、世界书、Persona、单人／群聊、幂等恢复、出站限制 | `apps/api/src/card-import/` 从 7fe 提取；不重建模块 |
| 已移植 | S1/S2 卡库、单人、群聊、世界书设置、编辑导出 | `card-import-client.ts`、`routes/Card*`、`WorldbookPanel.tsx` 和样式，复用原实现 |
| 最小适配 | `app.ts` | 保留 main 的 `storyArchive` 与 `readReceipt` 参数顺序；追加可选 `cards`，保留 Session 与账号检查 |
| 最小适配 | `main.tsx` | 保留 main 页面和剧情反馈；只增加卡片入口、懒加载和路由 |
| 最小适配 | `index.ts`、`card-import/local-runtime.ts` | 原启动入口显式本地合成模式；原默认关闭行为和生产拒绝不变 |
| 已存在，未覆盖 | 原生规则、P4/P5/P6、R1、缓存、剧情反馈、StoryArchive、Supabase／SES 改进 | main 版本保留；`CloudGame.tsx` 与 `GameShell.tsx` 无整合差异 |
| 已移植并适配 | `AccountLifecycle`、`createEmailAuthRuntime`、capabilities route | 从 cb 复用真实 `session_user` 校验和同事务身份选择；新增参数不覆盖 main 原调用方式 |
| 暂缓 | cb 的 NarrativePublicationRepository、行锁 TEST_ONLY SQL | 缺少获批 T1 schema／装配，不能直接接入；不加入正式迁移或运行入口 |
| 暂缓 | T1 Worker、T1/T3 原文发布、受保护回合 hook、P6 正式 Reader | 独立签署、数据库和权限门禁仍有效 |

未进行整分支 merge，也未覆写已存在的缓存、回执或账号体系。共享 Provider 抽取不在 35 项保护范围；原生四协议 Golden 与传输边界测试包含在本轮 API 回归中。

## 实际冲突和解决

1. main 的 `mountGames` 已插入 `storyArchive` 参数，旧候选的位置不同。保留主线路由调用，单独挂载角色卡；没有复制旧 `games.ts`。
2. main 的页面包含新的阅读定位与剧情反馈，旧 UI 来源包含过时的大厅和 CloudGame。仅提取角色卡页面和入口，未整文件替换 main.tsx。
3. auth-runtime 主线新增 SES 模板核验与 Supabase 行为。保留这些改动，仅追加服务端生命周期依赖参数。
4. T1 原 `0022_narrative_publication`／待审 `0023_narrative_ownership_v2` 与 main 的 `0022_function_scope_hardening`、`0023_legacy_0017_0019_catchup` 已编号冲突。main 另有 `0024_story_narratives`。本轮正式 Drizzle SQL/journal **零变更**。
5. cb 原代码无条件清理 T1 表，将使没有 T1 schema 的主线账号删除失败。未引入该直接依赖。保留原 main 清理，角色卡在显式本地宿主通过现有 beforeDelete 同 client 清理。T1 清理要求在 erasure proof 设置之后执行，不能直接塞进当前 proof 之前的 beforeDelete；该后续适配另行审核。
6. 普通入口第一次实跑发现 cards 参数漏传，已修正并重新实跑通过；测试也修正了创建返回 `greeting_index`、随后 GET 返回 `greeting` 的断言，没有改动既有会话契约。

## 生命周期兼容边界

- `erasurePool === undefined`：保留 main 原生命周期模式，未赋予 Runtime Erasure 角色。这不应被描述为已启用 T1 专用删除。
- 显式传入 `null`：永久删除能力不可用，执行拒绝。
- 显式传入独立 Pool：capabilities 检查真实 session_user；永久删除和 expireClosed 用该连接，在事务内复验资格。连接失败或身份无效不回退 Runtime。
- 原认证、关闭、取消和 Session resolver 使用原连接。main 的 Supabase 钩子保持原样；远端 Supabase 删除与本地 PG 的跨系统原子性仍 **NOT VERIFIED**。
- 本轮证明卡片清理与 main 账号／审计同事务；不声称验证了未接入的 T1 正文表清理。部署普通原生入口时不传新参数，保持现有行为。

## 本轮实际验证

所有 PG 位于本轮新建 PostgreSQL 18.4 回环实例 `127.0.0.1:55491`，合成账号和数据；安装身份仅用于测试 DDL。专用身份测试使用非超级用户 `joint_runtime`／`joint_eraser`，后者是 NOLOGIN Erasure 业务角色成员，前者不是。没有 ALL TABLES 授权。夹具权限不属于正式安装工件。

| 验证 | 结果 | 范围 |
|---|---|---|
| contracts/content/domain 构建 | PASS | main 锁定依赖 |
| API/Web 类型检查与构建 | PASS | 新候选实际执行；Web 大 chunk 提示保留 |
| API 单元 | PASS，387 | 另有 87 个无对应环境的集成测试 skip，不当作 PASS |
| 测试数据库守卫 | PASS，7 | 原 node:test |
| Web 单元 | PASS，255 | 含卡片客户端与主线现有回归 |
| 角色卡 PG / real Session / 原生回执共宿主 | PASS，35 | host、card-import、joint-host 三个 suite |
| 原生 ServerTurn / StoryArchive / 原生命周期 PG | PASS，21 | 120 回合持久化、分页、生命周期；未修改原规则 |
| 新身份组合 PG | PASS，4 | 独立 session_user、跨账号拒绝、错误确认、无池／错误池拒绝；卡片清理后和最终审计写入失败的逐记录+审计哈希回滚；expireClosed |
| 普通 Node index HTTP | PASS | Cookie、导入、备用开场、单 Key 幂等、请求查询、历史；本地合成模型；宿主不执行 DDL |
| S1 Chrome | PASS | 360/390/1280，Persona、开场、刷新、注销再登录、跨账号、原件保全 |
| S2 Chrome | PASS | 360/390/844×390/1280，群聊三模式、多段历史、世界书快照、替换未知结果不重试、编辑导出 |
| main 原 story-first-golden Chrome + PG | PASS | 原签署规则、剧情反馈与归档恢复；保留脚本原有 NOT_PROVEN/HUMAN_REQUIRED 限定 |
| 35 项、Canon、正式批准、正式迁移、主线 CloudGame 字节/对象保护 | PASS | 提交差异零覆盖；语义摘要只读计算，不重新签署 |
| 正式 T1 / 真实模型 / 真机键盘 / 生产迁移与发布 | NOT VERIFIED / 未获授权 | 不能从本地 PASS 推导 |

本轮环境初次失败：完整 fetch 大对象超时；pnpm 沙箱 EPERM；Windows Rolldown 可选包缺失；稀疏资源／CRLF 原字节测试差异；测试库名称不符合原 cleanup guard；合成卡缺字段；Runtime 夹具缺 operation.phase 权限。均保留原失败日志，再针对原因复验；未改签署值、迁移保护或测试预期来掩盖问题。锁定 Rolldown 包通过 lockfile SHA512 后补装，仅影响 node_modules。

日志、截图、合成身份细节保留本地，不入产品提交。`TEST-RECEIPT.json` 绑定命令、实际退出码和日志 SHA256。历史 14 项 T1 证据没有作为本次联合 PASS 重报。

## 本地启动与下一步

在独立、已准备 main + card schema 的测试库设置 `NODE_ENV=development`、`CARD_LOCAL_MODE=synthetic`、`DATABASE_URL` 指向 `127.0.0.1/jiuxiao_test_*`、`API_HOST=127.0.0.1`，沿用既有 AUTH 配置后运行 `pnpm dev:api`；`pnpm dev:web` 沿用代理。新入口只生成明确标注的合成回复，不读取卡片里的地址或凭据。未设置 CARD_LOCAL_MODE 时角色卡 API 不挂载；生产模式显式拒绝。

可申请 Draft PR 的范围：本提交内角色卡 + 兼容身份装配 + 本地测试，不附带生产迁移／真实 Provider 启用。正式发布前仍需：角色卡正式迁移和 writer 切换审批、实际模型出站与 Token/费用验收、数据保留和账号导出/备份政策、内容与生产开放门禁。完整 T1 需单独决定与 StoryArchive 的关系、重新安排迁移编号、审核 proof 后清理点与受保护 hook，不能把本次候选描述成完整 T1 合并。

回退：本轮仅有新独立候选；旧 main 和全部来源不变。关闭 CARD_LOCAL_MODE 可停止本地入口。数据库测试实例独立停机保留，不用回滚 SQL 删除新版本卡片数据。
