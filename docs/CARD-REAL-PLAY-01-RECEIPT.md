# CARD-REAL-PLAY-01 实施回执

**2026-11-18 收口结论：限定范围 LIVE PASS。** 下表记录真实供应商结果。后文保留 11 月 17 日本地协议测试及原申请作为历史记录。

## 真实供应商联测

实际受测 Commit `052ff0d0de2a72416ed82077bc5dc0caed275050`，Tree `8341a7893917d38ca4c9f092df51d27d2d4fbb3b`。本次通过现有角色卡 API 向 `POST https://api.openai.com/v1/chat/completions` 发送合成文字，模型固定为 `gpt-4o-2024-08-06`。

| 场景 | 已核实的持久化结果 | 本地估算输入 token | 供应商输入 / 输出 token |
|---|---|---:|---:|
| 单人首轮 | 上下文含 Persona 和世界书，保存 1 条，修订 1 | 176 | 173 / 110 |
| 单人续聊 | 保存 1 条，原会话修订升至 2 | 307 | 299 / 30 |
| 群聊手动发言 | 保存指定参与者的 1 段发言，修订 1 | 323 | 319 / 56 |
| 群聊 multi | 两名选定参与者各保存 1 段，共同对应修订 2 | 488 | 482 / 90 |

发起 4 次，实际发出 4 次，供应商返回 HTTP 200 共 4 次，持久账本消耗 4/6。四次均以原请求键回读完成结果，模型绑定、修订及历史匹配，恢复查询新增生成次数为 0。实际输入 1,273、输出 286 token，本地输入估算合计 1,294。按执行时每百万输入 $2.50、输出 $10.00 估算，费用约 **$0.0060425**，最终金额以供应商账单为准。

真实供应商取消、已提交后响应丢失两项均为 **NOT RUN**。本次授权已关闭，测试应用已退出，隔离 PG 已停止，数据及额度账本保留在仓库外。

## 源码同步与旧演示库

2026-11-18 只读核对 GitHub main 为 `3efa7ad4fdd0bcf9777a43d02e4fb58f9a47a9f8`，也是本分支的共同祖先。main 的本地角色卡宿主只接受 synthetic；候选复用主线协议和会话实现，新增宿主授权、模型预算和持久额度。两方没有分叉冲突，main 未含候选等价补丁。同步单位为本分支完整历史，包含实现、原回执、本次文档收口，共涉及 19 个路径。

按 `scripts/dev/cards.mjs` 的实际分支核对，已安装演示库的 SQL 摘要不符时，启动器拒绝启动应用并提示 `Schema changed: no automatic upgrade of preserved demo data. Review a new isolated copy.`。已有非空但未标记安装完成的库同样拒绝执行安装 SQL。`--init` 不会覆盖上述判断。原工作副本、数据库目录或 Docker 卷及其状态文件应整体保留。

需要体验新版合成演示时，在**没有 `.cards-local` 的新工作副本**根目录执行 `pnpm install --frozen-lockfile` 和 `pnpm dev:cards --check`。原生 PG 首次启动用 `pnpm dev:cards --init --postgres-bin "<PostgreSQL bin 目录>"`，后续在同一副本、同一 bin 路径去掉 `--init`。Docker Desktop 已运行时可用 `pnpm dev:cards --init`，后续用 `pnpm dev:cards`；Docker 路径本次未实跑。详见[本地演示说明](integration/main-integration-20261111/LOCAL-CARDS-DEMO.md)。本次为源码与说明核对，未对旧库执行升级演练。

## 身份与范围

- 独立分支：`codex/card-real-play-20261117`，工作目录名 `Nine-cloud-card-real-play-20261117`。
- 开始时读取、fetch 并核对远端 main：`3efa7ad4fdd0bcf9777a43d02e4fb58f9a47a9f8`；Tree `f77db2663e637025a33a8b83a6974d88ae68ebee`。
- 已固定代码及测试 Commit：`9447782b10349a577a8584f94632381e9d04bb45`；Tree `36317d5a6df0d83a133653d260c050eaf6032c08`。
- 本文作为后续单独文档提交；最终候选由本文所在 Git Commit/Tree 唯一绑定，交付消息给出完整值。避免把提交自身的 SHA 写入其内容造成循环定义。
- 代码提交共 18 个路径。未修改 main、PR #106、原生 Provider、P3/P4/P5/P6、Canon、正式迁移 journal、生产宿主或其他工作树。未 Push/PR/合并/部署。

| 文件 | 实际作用 |
|---|---|
| `apps/api/src/card-import/local-provider.ts` | 固定宿主配置、账号许可、持久调用额度与并发装配，复用已有 Provider |
| `model-access.ts`、`model-budget.ts`（同目录） | 服务端身份调用契约；最终消息 token 估算及拒绝 |
| `local-runtime.ts`、`host.ts`、`router.ts`、`service.ts`（同目录） | 显式本地 provider 模式；认证后的状态接口；固定请求模型；复用上下文裁剪与历史提交 |
| `schema.sql`（同目录） | 本地候选字段/额度账本；未登记正式迁移 |
| `apps/web/src/card-import-client.ts`、`routes/CardSession.tsx` | 显示合成/待授权/固定模型/限制；提交配置绑定；沿用已知 key 恢复 |
| `scripts/dev/cards.mjs`、`cards-host.mjs` | 显式 `--provider-config`；只向 API 子进程传指定凭据 |
| `apps/api/package.json`、`pnpm-lock.yaml` | 固定 `js-tiktoken@1.0.21`，不全仓升级 |
| `model-budget.test.ts`、`local-runtime.test.ts`（card-import） | 预算、配置及本地准入回归 |
| `tests/integration/card-real-play.mjs` | 独立 PG、真实 Cookie/TCP、协议服务、浏览器定向联测 |
| `docs/examples/cards-provider.example.json` | 无凭据、未批准、额度 0 的公开示例 |

## 复用关系与配置边界

```text
现有 CardSession UI / Cookie Session
  → 原 card-import 路由 owner resolver / ownerGuard
  → CardImportService 原请求登记、上下文、群聊解析与历史事务
  → localProviderOptions（账号、绑定、预算、持久额度、并发）
  → 原 createCardProvider → createCardModel → createProviderTransport
  → 原 createCardEgressFetch / DNS 固定 / HTTPS TLS / providerHttp
  → 原响应解析 → 原请求与历史保存 → 原 key 查询恢复
```

`apps/web/src/ai-settings.tsx` 的模型参数主要在当前标签页 sessionStorage，当前密钥在页面内存；历史格式迁移另有提示。没有把这些密钥上传服务器，没有把角色卡绑定到原生岗位。协议、模型、目标和 keyEnv 继续使用现有 ProviderConfig 字段，服务端另需明确提供账号/期限/额度授权。

默认 `pnpm dev:cards` 仍为合成演示。环境中碰巧存在密钥不会启用 provider。仅显式 `--provider-config <本机私密 JSON>` 选择新模式；配置不存在/无效时状态不可用。示例 `approved:false`、`allowedOwners:[]`、`maxCalls:0`，不是实际批准。

第一条路径固定 `openai-chat`、`https://api.openai.com/v1`、`gpt-4o-2024-08-06`、`NARRATIVE_KEY_CARD_LOCAL`。配置拒绝未知字段、其他模型/地址/凭据变量，不接受代理参数。只从指定变量读取凭据；API 子进程可以收到它，Vite、构建、PG 子进程不能收到。没有搜索已有密钥，没有真实凭据或私密配置进入 Git。

账号来自现有服务端 Cookie Session。未经授权 owner 的 `/api/card-import/model` 不返回模型、配置绑定或额度；客户端伪造账号头仍被原 host 拒绝。角色卡、世界书、输入只进入不可信素材消息，不能选择 endpoint、Header、API key 或工具。共享传输的四协议行为未改动。

出站沿用授权域名、全部 DNS 结果校验、公网 IPv4 限制、连接 IP 固定、授权域名 TLS/Host、重定向拒绝及响应上限。没有新增私网/证书绕过开关。本轮协议测试在代码夹具中注入本机 sender，**不证明真实供应商 DNS/TLS 可达性**；既有出站与固定连接测试另行回归。

## 请求固定、额度与 UI

- 新请求要求当前 `/model` 返回的 `modelBinding`，登记时保存 `requests.model_snapshot`；配置不一致在生成前拒绝。凭据不在 snapshot、配置摘要或响应中。
- 已登记同 key 继续执行原指纹规则并返回原结果；不因配置变化换模型、不再次生成。UI 复用原 pending key 和查询，结果未知不自动 POST，也不自动测试连接。
- UI 显示合成演示、待授权/无资格/缺失配置、当前模型、输出上限、估算性质和剩余额度；最近核实请求另显示其固定模型。不可用时禁用提交，查询/恢复仍保留。
- 一个专用连接持有按 approvalId 划分的 PostgreSQL advisory 并发锁；请求计数在网络发送前独立提交，未知失败、超时、取消均不退回额度。重建宿主不会重置账本。同 approvalId 的配置变化被拒绝；新 approvalId 必须代表新批准，不能用改 ID 自动补额度。
- `model_calls` 防止同批准/owner/session/key 重复出站。解锁失败销毁连接，避免向池返还带锁连接。无自动重试、故障转移、在线计数、额外角色选择模型调用。
- HTTP 401/429/500、非法响应统一对客户端返回脱敏业务错误，不保存供应商原始错误正文。调用额度是次数限制，不是准确账单。

## Token 预算

固定文本 profile 的依据：官方 [GPT-4o 模型页](https://developers.openai.com/api/docs/models/gpt-4o) 列出 128,000 上下文和 16,384 最大输出；[tiktoken 模型映射](https://github.com/openai/tiktoken/blob/main/tiktoken/model.py) 与 [Chat 计数示例](https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb) 作为本地编码/包装估算依据。本次查询模型页已标记该快照 **Deprecated**；真实验收须确认账号可用性，不能静默替换其他模型。

依赖固定 `js-tiktoken@1.0.21`（包声明 MIT），传递依赖 `base64-js@1.5.1`。官方包 SHA512 与锁文件一致：`biOj/6M5qdgx5TKjDnFT1ymSpM5tbd3ylwDtrQvFQSu0Z7bBYko2dF+W/aUkXUPuk6IVpRxk/3Q2sHOzGlS36g==`。Node 26.13.0 下运行通过，未修改全局依赖。

对最终 messages 使用 o200k_base 文本分块估算，按共享协议相同角色合并分隔符计入内容，另计 Chat 包装与 `max(1024, ceil(inputEstimate × 10%))` 余量。为限制长重复 BPE 字符串耗时，按代码点构成约 128 UTF-16 单元的小块编码；**不是供应商精确 token 计数或数学硬上界**。仅支持本轮文本 profile，不涵盖图像、工具或隐藏供应商包装。

发送前要求：`inputEstimate + maxOutputTokens + margin <= configuredWindow`，并单独限制输出不超过 16,384。复用原完整回合裁剪，先移除最早完整历史、再移除允许裁剪的世界书条目；不截断群聊半个多段回合，不删除数据库历史，不裁掉必要 Persona、角色、平台约束和当前输入。必需内容仍超限返回 `MODEL_CONTEXT_LIMIT`，协议服务计数不增加。单人与群聊共用此判定。

## 2026-11-17 本地协议验证（历史）

环境：Node 26.13.0、PostgreSQL 18.4、新随机回环端口/专属数据目录、合成账号/素材/凭据、真实认证服务 Cookie、Chrome 无头浏览器 390×844。测试创建专属实例并核验 data_directory，结束停止该实例，保留证据。测试数据库管理员仅用于完全隔离环境，本轮**不宣称验证了生产最小数据库 ACL**。

| 验证 | 状态与范围 |
|---|---|
| 9 文件相关单测 | PASS，47 项：原生四协议 golden/transport/narrative、角色卡映射、出站/固定地址、本地准入、预算、前端 client |
| 最终准入/预算定向复核 | PASS，14 项，属于上述相关集合的受影响复核，不额外累计覆盖数量 |
| contracts/content/domain/API 构建，API/Web 类型检查 | PASS；最终 API 编译、Web noEmit 退出 0 |
| Web Vite build | PASS；既有场景资源构建时未解析、主 chunk >500KB 警告保留 |
| 真实本机协议/PG/浏览器 | PASS，22 检查点，17 次本机协议请求，进程退出 0 |
| 合成默认、未授权、过期、零额度 | PASS；对应协议生成请求为 0 |
| 单人、Persona、备用开场、世界书、恢复 | PASS，经真实 HTTP 请求构造/响应解析/PG 保存 |
| 群聊 auto UI、多角色结构化输出 | PASS；错误结构不保存部分消息、不重试 |
| 接近/超过 token 边界 | PASS 定向单测；必要上下文超限 API 拒绝且发送数不变 |
| 长历史 | PASS；仅裁剪本次发送内容，保存历史数量不变 |
| 错误、超时、并发、同 key、持久次数上限 | PASS；消耗唯一额度后重建宿主，下一次不发送 |
| 已提交但 TCP 响应丢失 | PASS；从原请求记录恢复 completed，不重生成 |
| 实际 TCP 客户端取消 | PASS，本次最终记录 failed；不推论所有断线均回滚供应商/数据库 |
| 账号切换迟到响应、登出读取 | PASS；确认请求已发出才切换，旧账号文本不进入新视图 |
| UI 未批准状态 | PASS，明确待授权并禁用发送 |
| 真实供应商与实际剧情质量 | NOT RUN，未获授权；外部供应商请求 0 |
| 真机软键盘/额外视口 | NOT VERIFIED，本轮只对新增状态做 390px 浏览器验证 |
| 生产开放/正式迁移 | NOT AUTHORIZED |

原始脱敏回执在本机忽略目录 `test-results/card-real-play/23137ae1-c66a-4138-af94-cb522ddaf6ee/receipt.json`，SHA256 `85c90b4f859787dc80017a97474068969102c43d6c46b706783a1c30c4c53374`。截图、PG 目录、临时随机密码和失败运行记录均保留本机，不纳入提交。

测试方式：本机 HTTP 协议服务接收真实 OpenAI-chat 请求，核对 URL/Header/Body，返回可控成功/失败/多角色响应。通过已有 egress 代码验证授权域名/解析结果后，**仅测试依赖注入**将连接映射至回环 HTTP；浏览器禁止非回环请求。它与直接 CardModel 返回字符串的合成测试分开记录，不能当作真实供应商测试。

失败记录保留：最初合成卡缺少必需字段、Playwright bundled browser 不存在（改用已安装 Chrome）、新增浏览器刷新后未重新选择发言模式，均为夹具问题；修正后退出 0。初始长重复 Unicode 计数超时是实现问题，已增加有界分块并回归。安装遇网络中断/EPERM，官方包完整性核对后仅在独立工作树采用本地缓存安装；仓库锁文件保留标准 registry 版本，无本机 tgz 路径。没有为通过检查修改原生 golden 快照。

可复现的定向命令（在当前候选根目录、依赖安装后）：

```sh
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/content/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/domain/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit
node node_modules/vitest/vitest.mjs run apps/api/src/card-import/model-budget.test.ts apps/api/src/card-import/local-runtime.test.ts apps/api/src/card-import/card-model-provider.test.ts apps/api/src/card-import/provider-egress.test.ts apps/api/src/card-import/provider-egress-pinning.test.ts apps/web/src/card-import-client.test.ts apps/api/src/services/provider-golden.test.ts apps/api/src/services/provider-transport-boundary.test.ts apps/api/src/services/provider-narrative.test.ts --maxWorkers=1
# 设置 CARD_TEST_PG_BIN 为专用本地 PostgreSQL bin；不要设置生产连接串。
node tests/integration/card-real-play.mjs
# 在 apps/web 中：node node_modules/vite/bin/vite.js build
```

## 数据兼容与保留门禁

本轮只在全新合成库执行 `schema.sql`。未来旧库候选升级需要先备份/停旧 writer，再在一个受审事务中为 requests 增加可空 model_snapshot，并创建 model_allowances/model_calls 两表。旧记录保持 null，不能补造历史模型身份。新代码需要这些字段，旧库不能直接运行；启动器 schemaDigest 不匹配时拒绝，不自动迁移或删库。

额度账本故意不随会话删除或进程重启清空。其 owner/session/key 保留及账号永久删除政策尚未纳入正式 Erasure；生产前必须单独确定保留、去标识及最小权限。禁止通过回退 schema 丢弃账本后重新给额度；任何恢复旧备份也须复核未计入的出站消费。当前预算不是防数据库管理员篡改或备份回滚的计费系统。

## 2026-11-17 一次性真实供应商联测申请（历史）

| 项 | 拟申请范围 |
|---|---|
| 精确目标 | `POST https://api.openai.com/v1/chat/completions`；openai-chat；`gpt-4o-2024-08-06`。先由用户在控制台确认该 Deprecated 快照仍可用；不可用则停止，不自动替换 |
| 凭据 | 用户自行在本机进程环境设置 `NARRATIVE_KEY_CARD_LOCAL`；不粘贴报告，不读取浏览器密钥 |
| 配置 | 复制公开示例到仓库外私密文件；明确本机已登录 owner、批准 ID/截止时间；批准后才设置 approved=true |
| 上限 | contextWindow=8192，maxOutputTokens=512，maxCalls=6，maxConcurrent=1；仅合成文字，无私人卡/图片/工具/在线计数/自动重试 |
| 内容 | 2 次单人含 Persona/世界书及备用开场，1 次群聊手动，1 次 multi，最多 2 次明确批准的取消/失败恢复；已知 key 查询不发新请求 |
| 费用估算 | 模型页当前文本单价输入 $2.50/百万、输出 $10/百万。若每次输入不超过 8192、输出不超过 512，则 6 次约 $0.1536，未含税/费率变化；本地计数为估算，**此数不是硬账单保证**，需供应商侧预算控制与当日价格复核 |
| 成功标准 | 使用固定模型；返回经解析的文本/合法参与者分段；历史和修订持久化；世界书仅作为不可信素材；同 key 恢复零新增调用；失败不自动换模型/重试；没有凭据泄露 |
| 启动 | 批准且完成隔离数据准备后：`pnpm dev:cards --provider-config <private-config.json>`；native PG 继续传既有 `--postgres-bin`；全新实例才允许 `--init` |
| 失败与停止 | 模型不再可用、额度用完、身份/DNS/TLS/预算拒绝即停止真实调用。原 key 查询与已存历史保留，不更换批准 ID 偷补额度 |

上述申请已按文首四个场景执行并关闭。内容审核、数据治理、正式迁移、生产权限与开放仍属后续独立事项。
