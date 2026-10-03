---
document_id: JX-DEPLOY-FEASIBILITY
title: 九霄 WEB 部署形态可行性分析（宝塔 / Vercel / Cloudflare 增量接入）
version: 3.0.0
last_updated: 2026-10-03
supersedes: null
status: 论证稿，供 LYL / Bird 裁决
scope: 仅论证增量部署形态；不修改 Docker 接入、不修改任何运行代码
baseline_read:
  repo_state: 工作区 dirty，分支含 PR #33/#37 候选
  canon_registry: 34 条活动条目
  db_migrations: 0000–0013（0012_closeout_runtime_controls, 0013_event_integrity_ownership）
  stage_gates_open: [G-02, G-03, G-04a, G-04b, G-05, G-06, G-08, G-09]
  scope_adr: ADR-0004（1.0 不含社区与收费）
  product_hard_blockers: [PUBLIC_API_BASE_URL_PENDING, RULES_NOT_READY, LICENSE_PENDING, CANON_RECEIPTS_PENDING]
source_of_truth:
  deployment_runbook: deployment/README.md
  production_compose: deployment/api-production.compose.yml
  private_env_template: deployment/api.private.env.example
  ci: .github/workflows/ci.yml
  gap_registry: docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md
  human_gates: docs/FINAL_HUMAN_GATES.md
  scope_decision: docs/adr/0004-1.0不含社区与收费.md
  backend_handoff: docs/九霄S6认证后端交接-2026-10-02.md
conventions:
  FACT: 可在本仓库文件或公开文档中直接复核，附出处
  INFERENCE: 由事实推导，标注【推断】
  TO_VERIFY: 未验证，标注【待核】
  UNKNOWN: 无证据，不猜测
---

# 部署形态可行性分析 v3.0

## 0. 机器可读摘要

```yaml
verdict: PARTIAL_ONLY
one_line: "境外服务器可用于内测且应立即启用；境内服务器是公测的唯一合规落点；宝塔只做运维面；Vercel 只做预览与离线分析；Cloudflare 只做边缘转发/媒体/异步，不碰权威状态。"

do_not_do:
  - id: DND-1
    rule: 禁止将生产 API 或生产 PostgreSQL 迁往 Vercel Functions 或 Cloudflare Workers
    reason: 依赖长驻进程、PG 事务、advisory lock、append-only 触发器、只读文件挂载 rules.mjs
    evidence: deployment/README.md:18,40,48; packages/db/drizzle/0008_*.sql
  - id: DND-2
    rule: 禁止用宝塔「Docker 管理器」接管既有 compose
    reason: 会破坏不可变镜像 digest 约定与 migrate 一次性门禁
    evidence: deployment/README.md:7-9
  - id: DND-3
    rule: 禁止新增第二个前端部署目标
    reason: Cloudflare Pages 已在前端任务中，重复投入无收益
    evidence: deployment/README.md:3,56
  - id: DND-4
    rule: 禁止在备案主体与数据政策就位前对外发布或收费
    reason: ADR-0004 已排除 1.0 收费；EXT-01 外部条件未完成
    evidence: docs/adr/0004-1.0不含社区与收费.md:9,15

recommended_additions:
  - id: ADD-1
    name: 同源边缘转发层（Cloudflare Worker 或境内 Nginx）
    solves: Safari 第三方 Cookie 阻断；PR #35 独立 API 域名无法建 Cookie 会话
    touches_docker: false
    priority: P0
  - id: ADD-2
    name: 宝塔运维面（仅 Nginx/TLS/防火墙/计划任务/备份）
    solves: deployment/README.md:10「部署方配置真实域名、TLS、反向代理」至今无人认领；scripts/api-*.mjs 需宿主计划任务
    touches_docker: false
    priority: P0（境内公测前必需）
  - id: ADD-3
    name: R2 承载媒体资产
    solves: 场景图/视频/图鉴的出口成本；内测期静态资源分发
    cost: 存储 $0.015/GB-月，Class A $4.50/百万，Class B $0.36/百万，出口 $0
    priority: P1（受 LICENSE_PENDING 门禁约束）
  - id: ADD-4
    name: Cloudflare Queues 承载未来媒体生成异步任务
    solves: 总方案第 5/6 节的异步媒体任务链；当前未实现，属远期
    boundary: 只更新媒体任务状态，不得写 DomainEvent 或 Canon
    priority: P2
  - id: ADD-5
    name: PR 预览环境（用已有 Cloudflare Pages，不引入 Vercel）
    solves: G1 双签「同一 SHA 同一制品」走查的可核验链接
    priority: P0
  - id: ADD-6
    name: 固定出口 IP 规划（供模型服务商白名单）
    solves: G-09 所述「服务商 CORS 受限时由运营方配置私有服务端适配」
    priority: P1，且是境内迁移的最大隐性成本

platform_roles:
  baota: 境内服务器运维面（Nginx/TLS/防火墙/计划任务/备份），不接管容器
  vercel: 仅 PR 预览（可选）与离线只读分析 Workflows；不承载生产 API
  cloudflare: 边缘同源转发、媒体 R2、异步队列、限流防护；不承载权威状态
  supabase: 评估后否决——无境内部署、连接池破坏 advisory lock、出口费高
  cloudbase: 评估后否决——与「compose 是不变量」冲突，且已有更简单的境内 VPS 解

cost_model_cny_per_month:   # 2026-10 预算估算；活动价及续费价须按下单页复核
  beta_overseas:
    vps: 16.6            # 方案假设的首年活动报价 ¥199/年；购买前和续费时均须复核
    domain_amortized: 5  # 预算假设约 ¥60/年；须按实际注册商报价核算
    frontend: 0          # Cloudflare Pages 免费
    edge: 0              # Workers Free 10万次/天
    media: 0             # R2 免费层 10GB + 出口 $0
    mail: 0              # 不发送验证码时无投递量费用；当前 Compose 仍要求 SMTP 连接预检
    total: ~21.6          # VPS + 域名摊销；不含备份、超额用量与续费价，不等于全口径运营成本
  public_mainland:
    vps_first_year: 8.3  # 方案假设的首年活动报价 ¥99/年；日常价假设 ¥576/年，续费约 ¥48/月
    vps_regular_renewal: 48
    domain_amortized: 5  # 约 ¥60/年摊销
    filing: 0            # ICP 备案与公安备案均免费
    media_cdn: 1~2       # 境内对象存储，5–10GB 量级【待核】
    mail: 0~0.2          # 阿里云邮件推送免费额度：共 2000 封，每天上限 200 封
    total_first_year: ~15 # 首年优惠口径；包含域名、媒体和邮件低用量估算
    total_regular_renewal: ~55 # 续费口径；仍不含异地备份、运维、税费与超额流量
  hard_constraint: >
    以上预算依赖首年活动价、域名估值和免费额度，且不含异地备份、运维与续费。
    ADR-0004 可避免支付、退款和商户运营成本，但不是低基础设施成本的唯一条件。
    一旦引入收费，还须单独评估 ICP 许可证、支付通道、退款/对账与商户资质。

cost_do_not:
  - 不要为 1.0 引入托管数据库；境内轻量自托管 PostgreSQL 即可，compose 一个字不改
  - 不要为内测期付 Workers Paid 的 $5/月；Free 档 10万次/天足够
  - 不要买 Supabase Pro 的 $25/月 + PITR 的约 $100/月；出口费 $0.09/GB 是 R2 的无穷倍
  - 不要买邮件独立 IP 的 $128/月；早期免费额度足够

unresolvable_by_any_platform:
  - ICP 备案（需境内服务器 + 境内接入商 + 主体）
  - 公安联网备案
  - 生成式 AI 算法备案 / 大模型登记或备案
  - 运营主体与数据地区书面确认
  - 媒体商用授权凭证（LICENSE_PENDING）
  - 正式玩法规则签署（RULES_NOT_READY）
  - Canon 双作者同摘要回执（CANON_RECEIPTS_PENDING）
```

---

## 1. 术语表（供机器消歧）

| 术语 | 本文定义 | 权威出处 |
| --- | --- | --- |
| RC | 同一 Git SHA 的完整 CI 产物；人工签收的唯一身份 | `docs/FINAL_HUMAN_GATES.md:5-16` |
| fail-closed 门禁 | 条件不满足时构建或运行必须失败，不得放行 | `RULES_NOT_READY` / `LICENSE_PENDING` / `CANON_RECEIPTS_PENDING` |
| 权威状态 | 由规则事务提交的 `DomainEvent` 与状态投影 | `docs/九霄1.0公测版重建总方案.md` §4 |
| 候选 / main 已销账 | 候选修复 ≠ 合入 main；CI 绿 ≠ 阶段签收 | `docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md:23,51` |
| 边缘层 | 无状态、不写权威状态的前置代理 | 本文定义 |
| 同源 | 前端与 API 同 scheme/host/port | `deployment/README.md:14` |
| BYOK | 玩家自持模型 Key，不构成向玩家收费 | `docs/adr/0004-1.0不含社区与收费.md:9` |

---

## 2. 事实基线（仅陈述可复核事实）

### 2.1 运行形态

| 维度 | 事实 | 出处 |
| --- | --- | --- |
| 前端托管 | Cloudflare Pages，由独立任务负责 | `deployment/README.md:3,56` |
| 后端编排 | Compose 仅两服务：`migrate`（一次性）+ `api`（长驻） | `deployment/api-production.compose.yml` |
| 端口绑定 | `127.0.0.1:8787:8787`，Compose 不暴露 PostgreSQL | 同上 `ports` |
| 运行时 | Node 24 + `@hono/node-server` + `pg` + `nodemailer` | `apps/api/package.json` |
| API 装配 | `createApp(database, cloudSaves, emailAuth, turns)` 依赖注入式条件挂载 | `apps/api/src/app.ts:19-51` |
| 已挂载路由 | `/health`、`/ready`、auth、account、saves、turns、games | `apps/api/src/app.ts:28-47` |
| 规则模块 | `TURN_RULES_MODULE` → 只读挂载 `/run/jiuxiao`，**永不从客户端/模型/远程 URL 加载** | `deployment/README.md:18` |
| 宿主计划任务 | `api-retention.mjs`、`api-account-expiry.mjs` 需宿主调度 | `deployment/README.md:42,52` |
| 迁移 | Drizzle `0000`–`0013`；`0008` 起 append-only 触发器，`0013` 加事件哈希链与 owner FK | `packages/db/drizzle/` |
| 限流 | 生产共享 PostgreSQL 原子计数；导出 advisory lock 单账号 1 / 全局 4 | 缺口清单 PR #37 更新段 |
| 代理信任 | IP 限流「仅信任配置代理」→ `trustedProxyAddresses` | 缺口清单 `SEC-02` |
| 配额 | 每账号 20 份 / 单档 1 MB / 总快照 10 MB（拟定数值） | 缺口清单 `LYL-05` |
| 发布门禁 | 媒体未核验时 release 构建必须以 `LICENSE_PENDING` 失败 | `.github/workflows/ci.yml:59-70` |
| 现状 | `PUBLIC_API_BASE_URL_PENDING`，无公开 HTTPS API Base URL | `docs/FINAL_HUMAN_GATES.md:50` |

### 2.2 产品与范围

| 维度 | 事实 | 出处 |
| --- | --- | --- |
| 目标市场 | 中国大陆优先的成人 Web/PWA 公测 | `docs/九霄1.0公测版重建总方案.md:4` |
| 1.0 范围 | **不含社区、不含收费**；玩家自持 Key 不构成向玩家收费 | ADR-0004 |
| 现有付费入口 | 玩家路由无社区/购买/支付/退款入口；内部权益账本仅基础设施 | ADR-0004 §工程边界 |
| 目录时效 | 25 家厂商静态价格快照，**2026-12-27 到期**，过期或缺价不精算 | 缺口清单 `G-08` |
| 外部条件 | 运营主体、正式域名/托管、数据地区、事故联系人、撤回方案、备份策略 | 缺口清单 `EXT-01` |

> **交叉观察【推断】**：《九霄》玩家调查（8 份，N 极小）中 75% 期望一次性买断，而 ADR-0004 明确 1.0 不含收费。两者不冲突，但意味着**买断属于 2.0 范围，需要新 ADR**，不能由问卷结果反推 1.0 应开收费。

---

## 3. 平台能力矩阵（2026-10-03 联网核实）

### 3.1 Cloudflare

| 项 | Free | Paid | 核实要点 |
| --- | --- | --- | --- |
| CPU / 请求 | 10 ms | 默认 30 s，**上限 5 min**（`limits.cpu_ms`） | 等待网络/DB 不计 CPU |
| 内存 / isolate | 128 MB | 128 MB | 上限不可调 |
| 包体积 | 64 MiB | 64 MiB | — |
| 出站并发连接 | 6 / 请求 | 6 / 请求 | **转发场景的关键限制【待核实测】** |
| 计费 | 10 万次/天 | **$5/月**，含 1000 万请求 + 3000 万 CPU-ms；超出 $0.30/百万请求、$0.02/百万 CPU-ms | 无出口费 |
| R2 | 存储 $0.015/GB-月；Class A $4.50/百万；Class B $0.36/百万；**出口 $0**；免费层 10 GB / 1M A / 10M B | 同 | 对媒体负载结构性省钱 |
| Hyperdrive | 10 配置，源库连接 2–20 | 25 配置，源库连接约 100 | **查询缓存默认开启**，写后立即读可能返回旧值；事务会独占连接 |
| 中国大陆节点 | ❌ | ❌（China Network 为企业级且需 ICP） | 境内访问走香港/日本/美西 |

### 3.2 Vercel

| 项 | 数值 | 核实要点 |
| --- | --- | --- |
| 默认最大执行 | 全部套餐 300 s | — |
| 上限 | Pro/Enterprise **800 s**（GA）；Node/Python 可选 1800 s（beta） | — |
| 内存 | Standard 1 vCPU/2 GB；Performance 2 vCPU/4 GB（Active CPU 计费） | — |
| 载荷 | **4.5 MB 硬上限** | 与 JSONB 快照 + 叙事 32768 token 输出冲突 |
| 默认区域 | `iad1`（美国） | **无中国大陆区域** |
| Workflows | 分钟级至月级长任务，无执行时长上限 | 仅适合离线只读分析 |
| Hono | 官方列为适配良好 | 技术适配 ≠ 状态模型适配 |

### 3.3 宝塔面板

| 能力 | 与本项目的对接点 |
| --- | --- |
| 站点反向代理 | 域名 → `http://127.0.0.1:8787`，`deployment/README.md:10` 的未认领项 |
| SSL（Let's Encrypt） | 自动签发与续期，消除人工 TLS 步骤 |
| 计划任务（Shell） | 运行 `node scripts/api-retention.mjs --apply` / `api-account-expiry.mjs --apply` |
| 防火墙 | 仅放行 22/80/443；8787 与 5432 不出网 |
| Docker 管理器 / 镜像加速 | **仅用于装 Docker 与配 registry-mirrors，不接管 compose** |
| 备份 | `pg_dump --format=custom` + 加密 + 受限访问 |

---

## 4. 合规事实与推论

| 依据 | 原文要点 | 对本项目的推论 |
| --- | --- | --- |
| 阿里云《Check the server for ICP filing》 | 「托管于非中国内地服务器的网站无需进行 ICP 备案」；但所有可备案产品均要求「服务器位于中国内地」 | 境外服务器**无法办理** ICP 备案——非豁免，而是无法代办 【FACT】 |
| 《非经营性互联网信息服务备案管理办法》第八条 | 备案须由境内接入服务商代办 | 境外无境内接入商，通道不存在 【FACT】 |
| 同办法第二十二条 | 未备案在境内从事非经营性服务，责令限期改正并处罚款，拒不改正关闭网站 | 面向境内公众 ⇒ 需备案 ⇒ 需境内服务器 【FACT】 |
| 锦尚律所合规分析 | 部署在非境内服务器但境内可访问的，仍须办理**公安联网备案** | 境外部署不豁免公安联网备案 【FACT】 |
| 《生成式人工智能服务管理暂行办法》第二条 | 适用条件为「向境内公众提供」；**未向境内公众提供的不适用** | 「是否面向境内公众」是唯一分水岭 【FACT】 |
| 同办法第二十条 | 对来源于境外向境内提供生成式 AI 服务不符合规定的，网信部门应通知有关机构采取技术措施处置 | 「境外向境内提供」被法规明文点名 【FACT】 |
| 腾讯云合规文章 | 属地管辖与可及性原则；面向境内公众即适用中国法律，与模型部署地无关 | 无法靠「模型在境外」规避 【FACT】 |
| 备案 vs 登记 | 自研/微调 → 大模型备案；纯调用已备案 API 无改造 → 大模型登记 | **本项目默认是 BYOK ⇒ 走「登记」，成本显著低于备案**【INFERENCE】【待核：属地口径】 |
| ADR-0004 | 1.0 不含社区与收费 | 只需**非经营性 ICP 备案**，不需要 ICP 许可证、不需要支付商户 【FACT】 |

> **合规路径收敛【INFERENCE】**：因 ADR-0004 排除收费，1.0 的合规链条为
> `境内服务器 + ICP 备案（非经营性） → 公安联网备案 → 生成式 AI 大模型登记（BYOK 形态）+ 视情况算法备案 → 等保三级`
> 其中周期最长且不可压缩的是等保与属地审批，均**不因选型而改变**。

---

## 5. 逐平台裁定

### 5.1 Vercel — 判定：仅预览与离线分析

| 维度 | 判定 | 依据 |
| --- | --- | --- |
| 承载生产 API | ❌ 禁止 | 无大陆节点；4.5 MB 载荷；serverless 与 PG 事务/advisory lock/append-only 触发器冲突；`@hono/node-server` 长驻语义失效 |
| PR 预览 | ⚠️ 可但**不必需** | Cloudflare Pages 已具备每 PR 预览，重复投入 |
| 离线只读分析 | ✅ 适合 | Workflows 无时长上限；读导出快照不触碰 `DATABASE_URL` |

### 5.2 Cloudflare — 判定：纯增量四件事，API 留在 Docker

| 用途 | 判定 | 关键约束 |
| --- | --- | --- |
| 同源边缘转发 `/api/*` | ✅ 推荐 | 纯代理、不写状态；若经过 Cloudflare，Nginx 先按 Cloudflare 官方 IP 段校验并还原访客 IP，再向 API 传递可信地址。API 只配置实际直连代理的精确 IP（≤8 项），不得将 Cloudflare CIDR 填入 `AUTH_TRUSTED_PROXY_ADDRESSES` |
| `/media/*` → R2 | ✅ 推荐 | 出口零费用；**不解决境内访问速度** |
| Queues 媒体生成任务 | ⚠️ 远期 | 当前媒体生成为离线 Python 派生（`scripts/assets/build-visual-candidates.py`），尚无运行时任务链；引入时只更新任务状态 |
| Hyperdrive 直连 PG | ❌ 禁止 | 查询缓存默认开启会破坏「回合提交后回执」；`TURN_RULES_MODULE` 无文件挂载等价物；`nodemailer` SMTP 需重写 |
| Durable Objects | ⚠️ 仅边缘协调 | 可做幂等键去重与前置校验，**不得成为第二权威** |

### 5.3 宝塔 — 判定：境内运维面，不接管容器

| 判定 | 说明 |
| --- | --- |
| ✅ 承接 `deployment/README.md:10` 的域名/TLS/反代 | 该项目前无人认领，是最明确的空缺 |
| ✅ 承接宿主计划任务 | retention / account-expiry / 备份 |
| ✅ 收敛同主域子域 | 使 `AUTH_COOKIE_SAME_SITE=Strict` 与 PR #35 的 `credentials: include` 同时可行 |
| ❌ 不接管 compose | 保持 `API_IMAGE` digest 与 `migrate` 一次性门禁 |
| ⚠️ 自身是攻击面 | 改默认端口 + 面板 SSL + 办公 IP 白名单 + 最小插件 |
| ⚠️ 产生第二份事实源 | 面板配置可重建，不得反向手改进仓库 |

### 5.4 Supabase — 判定：否决（仅可作内测原型）

**技术吸引力是真的**：托管 PostgreSQL + Auth + Storage 一套解决，且本项目默认是 BYOK 形态（`ADR-0004`），恰好落在「纯调用已备案 API ⇒ 大模型登记」的轻路径上。仓库中无任何 Supabase 痕迹（已全仓检索确认）。

**但有五个否决级冲突**：

| # | 冲突 | 依据 |
| --- | --- | --- |
| 1 | **无中国大陆区域** ⇒ 托管数据库落在境外 ⇒ 与 §4 的 ICP 备案与大模型登记要求直接冲突 | 公开资料与国内替代方案对比均指出其「数据存储在境外，ICP 备案和等保合规有隐患」 |
| 2 | **连接池破坏本项目的并发不变量** | transaction-mode pooler（端口 6543）在事务间归还连接，会**静默失效** session 级特性：`pg_advisory_lock`、`SET`、`prepared statements`、临时表。本项目导出串行化依赖事务级 advisory lock，且 `0008` 起有 append-only 触发器与顺序锁。改用 5432 直连则失去池化意义，且托管实例连接数有限 |
| 3 | **Free 档 1 周不活跃自动暂停**，且仅 2 个活跃项目 | 不适合承载任何长期运行的服务 |
| 4 | **成本倒挂** | Pro $25/月，8GB 磁盘、250GB 出口后 $0.09/GB；PITR 另加约 $100/月。媒体负载下出口费是 R2（$0）的无穷倍 |
| 5 | **备份与保留期不满足项目合同** | Pro 每日备份仅保留 7 天；项目要求冷备最长 90 天且需清除依据（`LYL-05`），托管方无法出具符合要求的工单/演练回执 |

**保留的唯一合法用途**：内测期做一次性原型或第三方 schema 试验，**不得承载账号、云档或媒体**。

### 5.5 腾讯云 CloudBase（云开发）— 判定：否决，但有一项值得借鉴

| 项 | 事实 | 对本项目 |
| --- | --- | --- |
| 境内部署 | ✅ 腾讯云出品，满足 ICP 备案前置 | 唯一合规的 Supabase 对标物 |
| 价格 | Free 3,000 资源点/月（≈¥3，**单次续期 6 个月**）；个人版 ¥19.9/月起 | 内测可用；公测需 ¥199/月标准版 |
| 固定出口 IP | ✅ 个人版起提供 | **恰好命中 G-09「服务商 CORS 受限时配置私有服务端适配」的需求** |
| 与本项目的冲突 | ❌ 连接自有数据库仅标准版起（且主打 MySQL/SQL Server）；需重写数据访问层与 `pg`/`Drizzle` 装配 | 违反「不重建已有模块」与「compose 是不变量」 |
| 超额单价 | 外网出流量 ¥0.8/GB；存储流量 ¥0.21/GB；CDN 回源 ¥0.15/GB | 媒体负载显著贵于 R2（¥0） |

**判定**：不引入。理由是它要求重写数据访问层，而 `apps/api/src/app.ts:19-23` 的依赖注入式装配与 14 条迁移已经过完整测试。

**值得借鉴的一点**：它把「固定出口 IP」做成了套餐能力，证明**出口 IP 稳定性是可采购的产品特性**。对本项目更简单的等价解是：境内轻量服务器本身就带固定公网 IP，无需额外采购。参见 §8.2。

---

## 6. 增量架构（不改动 Docker）

```
玩家
 ├─ Cloudflare DNS / CDN / WAF                 [已有能力]
 ├─ Cloudflare Pages                            [已有：前端任务]
 ├─ Cloudflare Worker            ★新增          [无状态边缘]
 │    ├─ /api/*、/health、/ready → 同源转发 → 源站 :8787 [会话与健康检查]
 │    ├─ /media/* → R2                           [零出口费]
 │    └─ 限流 / Bot / 错误码映射
 ├─ Cloudflare R2 + Queues       ★新增(远期)    [媒体资产 + 异步任务]
 └─ 境内服务器（宝塔）           ★新增(公测前)
      ├─ Nginx 反代 + TLS                       ──► 127.0.0.1:8787
      ├─ Docker Compose: migrate + api          ★保持原样
      ├─ PostgreSQL 17                          ★保持原样
      ├─ 计划任务：api-retention / api-account-expiry / pg_dump
      └─ 防火墙：仅 22/80/443

不变清单：deployment/api-production.compose.yml、docker-compose.yml、apps/api、packages/db 迁移、
         TURN_RULES_MODULE 只读挂载、LICENSE_PENDING 门禁、RULES_NOT_READY fail-closed
```

---

## 7. 缺口对照：谁解决得了，谁解决不了

| 当前卡点 | 编号 | 宝塔 | Vercel | Cloudflare | 净结论 |
| --- | --- | --- | --- | --- | --- |
| 无真实后端域名 / TLS / 反代 | G-06 | ✅ | ❌ | ⚠️ 需境内 | **宝塔可解**，前置为主体+域名 |
| 独立 API 域名无法建 Cookie 会话 | G-06 / PR #35 | ✅ 同主域 | ⚠️ | ✅ 同源转发 | **可解，二选一** |
| `PUBLIC_API_BASE_URL_PENDING` | G-06 | ⚠️ 需真实公网地址 | ❌ | ⚠️ | 需实际采购，非选型问题 |
| 同一 SHA 同一制品双签走查 | G-02 | ❌ | ✅ | ✅ Pages 已具备 | **已可解，无需新平台** |
| 媒体资产出口成本 | G-05 | ⚠️ 需另配对象存储 | ⚠️ Blob | ✅ R2 零出口 | **Cloudflare 可解**（受 LICENSE_PENDING 约束） |
| 媒体商用授权 | G-05 | ❌ | ❌ | ❌ | 需权利人凭证 |
| 模型服务商 CORS 受限需服务端适配 | G-09 | ⚠️ 需固定出口 IP | ⚠️ IP 不固定 | ⚠️ | **需固定出口 IP 规划** |
| 分布式限流多实例 | SEC-08 | ✅ 多实例 | ⚠️ | ❌ | 已用 PG 原子计数，**宝塔可多实例** |
| IP 限流需信任代理 | SEC-02 | ✅ 直连免配 | ⚠️ | ⚠️ 须配 `trustedProxyAddresses` | 引入 Worker 的**必做配置项** |
| 宿主定时任务 | G-06 | ✅ | ❌ | ❌ | **宝塔可解** |
| 备份 / 冷备清除证据 | G-06 / EXT-01 | ✅ | ❌ | ❌ | 需运营主体书面确认 |
| 价格目录 2026-12-27 过期 | G-08 | ✅ 计划任务 | ❌ | ❌ | 需运维点承载更新流程 |
| 真机 15 分钟稳定性 | G-05 / LYL-06 | ⚠️ 需真机 | ❌ | ❌ | 需真机，非选型问题 |
| 正式规则签署 | G-03 | ❌ | ❌ | ❌ | 需 LYL/Bird |
| Canon 双回执 | G-04a | ❌ | ❌ | ❌ | 需双作者 |
| ICP / 公安 / 算法 / 大模型登记 | EXT-01 | ❌ | ❌ | ❌ | **无人可解，需主体资质** |
| 运营主体 / 数据地区 | EXT-01 | ❌ | ❌ | ❌ | **无人可解** |

---

## 8. 迁移成本与顺序

### 8.0 预算口径：首年估算与续费须分开

**ADR-0004 减少产品成本，但不把基础设施成本变成零。** 下表是按首年活动价的预算，不是续费承诺。境外 VPS 按 ¥199/年约 ¥16.6/月、域名按约 ¥60/年约 ¥5/月估算，合计约 ¥21.6/月；不含异地备份、运维、续费调价及超额用量。上线采购前须以服务商当日结算报价替换估算。

| 成本项 | 内测期（境外） | 公测期（境内） | 是否可避免 |
| --- | --- | --- | --- |
| VPS | ¥16.6/月（轻量 2核4G30M 首尔 ¥199/年） | ¥8.3/月（轻量 2核2G4M 上海 ¥99/年，日常价 ¥576/年） | ❌ 公测期必需（合规） |
| 域名 | 摊销 ≈¥5/月 | 摊销 ≈¥5/月 | ❌ |
| ICP 备案 | — | ¥0 | 免费 |
| 公安联网备案 | — | ¥0 | 免费 |
| 前端托管 | ¥0（Pages） | ¥0 或境内 CDN | — |
| 边缘层 | ¥0（Workers Free 10万次/天） | ¥0 | — |
| 媒体存储 | ¥0（R2 免费层 10GB，出口 $0） | ¥1~2（境内对象存储）【待核】 | 内测期可省 |
| 邮件 | 无验证码投递时不计投递量费用；当前 Compose 仍要求 SMTP 连接预检 | ¥0~0.2（按既有免费额度假设，须采购时核实） | 内测期可省投递量 |
| **合计** | **≈¥21.6/月**（VPS + 域名，未计备份与运维） | **≈¥15/月首年优惠；续费约 ¥55/月**（未计备份与运维） | |

**四条成本控制原则**：

1. **不另购托管数据库**。PostgreSQL 装在宿主机上（**不进 compose**），仅监听宿主 `127.0.0.1:5432`。Compose 容器必须经执行手册 P2 所述、只绑定 bridge gateway 且受防火墙限制的转发端口连接；容器内 `127.0.0.1` 不是宿主机。Supabase Pro/PITR 报价须采购时复核。
2. **不买 Workers Paid**。Free 档 10 万次/天对 1.0 早期绰绰有余；`$5/月` 只在流量或 CPU 超限后才需要。
3. **不买邮件独立 IP**。阿里云 $128/月 的独立 IP 是给营销场景的；早期免费额度足够，OTP 事务邮件不走独立 IP。
4. **媒体先 R2 后境内**。内测期放 R2（出口 $0）；公测期若追求境内速度再迁 COS/OSS，并接受 ¥0.21/GB 的存储流量费。

**收费会增加另一组成本和审批事项**：可能涉及 ICP 许可证、支付通道费率、退款对账、客服与商户资质。它们应作为独立产品与合规决策评估；基础设施续费、备份与流量超额同样可能使预算上升。

### 8.1 境内迁移成本为何低【INFERENCE】

因为 `deployment/api-production.compose.yml` 是本项目的**部署不变量**：换服务器 = 换公网 IP + 重跑 compose + 重跑迁移 + 重跑 `api-production-smoke.mjs`。这同时是 DND-1 的第二条理由——若把 API 迁往 serverless，就永久失去这一性质。

### 8.2 最大的隐性成本：出口 IP【待核】

`docs/FINAL_HUMAN_GATES.md:38` 记载「服务商有浏览器 CORS 限制时记为该路径不可用，由运营方按已批准范围配置私有服务端适配」。若该适配需要向模型服务商申请**出口 IP 白名单**，则：

- 境内迁移会改变出口 IP → 所有白名单需重新申请；
- 因此**出口 IP 的选择必须在迁境内之前定稿**，否则 G-09 会出现二次返工。

### 8.3 建议顺序

| 序 | 动作 | 前置 | 触碰 Docker |
| --- | --- | --- | --- |
| 1 | 启用 Cloudflare Pages 每 PR 预览 + 固定 preview 域，纳入 G-02 走查记录 | 无 | 否 |
| 2 | 境外内测 VPS 跑现成 compose；内测邀请制、不收费、不开放账号/云档。另核实 CDN、反代与服务器访问日志中的 IP 等标识及其告知/保留策略，不宣称“零个人信息” | EXT-01 + 有效 RC | 否 |
| 3 | 定稿出口 IP 与模型服务商适配方案 | G-09 口径 | 否 |
| 4 | 规划同主域子域结构（先定方案不实施） | 域名 + 主体 | 否 |
| 5 | 引入同源边缘层（Worker 或 Nginx）；须将 `/api/*`、`/health`、`/ready` 路由到源站，并验证 Cloudflare → Nginx → API 的访客 IP 信任链 | 第 4 步 + SEC-02 设计 | 否 |
| 6 | 建 R2 桶，把媒体发布策略改为「构建产出 → R2」 | **G-05 许可核验** | 否 |
| 7 | 境内服务器 + 宝塔上线，仅 Nginx/TLS/防火墙/计划任务/备份 | **运营主体就位** | 否 |
| 8 | 同一 compose 迁境内，重跑迁移与 smoke | 第 7 步 | 否 |
| 9 | ICP 备案 → 公安联网备案 → 大模型登记（+ 算法备案）→ 等保 | 营业执照 | 否 |
| 10 | 公测期静态资源一并落境内对象存储 | 第 8 步 | 否 |

---

## 9. 风险登记

| ID | 风险 | 触发条件 | 缓解 |
| --- | --- | --- | --- |
| R-01 | Worker 转发使 IP 限流失真 | 引入边缘层但未配 `trustedProxyAddresses` | 部署检查项硬性包含该项；`SEC-02` 回归 |
| R-02 | 出口 IP 二次返工 | 先部署后定 IP，或迁境内时未预留白名单 | IP 定稿前不申请生产模型接入 |
| R-03 | 宝塔面板成为攻击面 | 面板端口暴露公网 | 改端口 + 面板 SSL + IP 白名单 + 最小插件 |
| R-04 | 第二份部署事实源 | 面板配置与仓库 compose 漂移 | 面板仅生成反代；变更须记录；compose 为唯一事实源 |
| R-05 | 边缘层成为第二权威 | Worker 内写缓存或状态 | 边缘层只代理与限流；一切状态回源 |
| R-06 | 价格快照过期 | 2026-12-27 之后未更新 | 计划任务承载更新流程；过期不精算（已有门禁） |
| R-07 | 境外环境收集个人信息 | 问卷 raw 中的真实手机号进入境外环境 | 保持境外环境零个人信息；候补沟通走私聊 |
| R-08 | 媒体许可未核即接 R2 | 绕过 `LICENSE_PENDING` | G-05 未销账前只做只读分发，不接入运行时 |
| R-09 | 内测被误当公测 | 对外宣称「已上线」 | 全部内测入口标注「内测」，不收费不推广 |

---

## 10. 待核清单

| # | 待核项 | 核实方式 |
| --- | --- | --- |
| 1 | 大模型登记在属地网信办的受理口径、材料与周期 | 向属地省级网信办咨询 |
| 2 | 安全评估国标编号（资料出现 GB/T 45654-2025 与 GB/T 45644-2025 两版） | 以官方最新文本为准 |
| 3 | Cloudflare China Network 可申请条件与 ICP 关系 | 官方企业销售确认 |
| 4 | Pages 现网是否已绑定自定义域、是否与 API 同主域 | 检查 Pages 项目设置 |
| 5 | Workers `connect()` 出站 6 连接对「转发到源站」的实际影响 | 小规模 PoC 实测 |
| 6 | 宝塔面板版本与商业授权条款 | 官方当前版本说明 |
| 7 | `PUBLIC_API_BASE_URL_PENDING` 认领方与时间表 | 项目内部决策 |
| 8 | 已备案主体使用境外静态资源（R2）的合规边界 | 属地网信办 + 律所 |
| 9 | 模型服务商是否需要出口 IP 白名单 | 按 G-09 实际接入点逐一确认 |
| 10 | 冷备清除与法定保留的运营责任边界 | EXT-01 责任方书面确认 |

---

## 11. 与既有文档的一致性

| 既有结论 | 本文是否沿用 | 说明 |
| --- | --- | --- |
| 1.0 不含社区与收费 | ✅ 沿用并据此简化合规路径 | ADR-0004 |
| Pages 属独立前端任务 | ✅ 沿用；不新增前端目标 | `deployment/README.md:3` |
| 部署方负责域名/TLS/反代 | ✅ 认定为当前最明确空缺 | `deployment/README.md:10` |
| 计划任务由宿主运行 | ✅ 认定宝塔为宿主候选 | `deployment/README.md:42,52` |
| 不引入 serverless 承载权威状态 | ✅ 升级为硬禁止 DND-1 | 追加 0013 事件哈希链后约束更强 |
| 1.0 面向大陆公测需合规 | ✅ 收敛为四条备案链 | 排除收费后去掉 ICP 许可证与商户 |

---

## 12. 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| 1.0.0 | 2026-10-03 | 初版：宝塔/Vercel/Cloudflare 可行性 |
| 2.0.0 | 2026-10-03 | 全仓复核后重写：纳入 ADR-0004（1.0 无收费）、SEC-02 代理信任、SEC-08 PG 原子限流、0013 事件哈希链、G-08 价格快照时效、PR #35 Cookie 合同、G-09 出口 IP 适配；新增机器可读摘要、术语表、风险登记、一致性表；修正「1.0 需 ICP 许可证」的过度结论 |
| 3.0.0 | 2026-10-03 | 新增成本估算（§8.0）与成本控制原则；新增 Supabase 评估（§5.4，五项否决级冲突）与 CloudBase 评估（§5.5）；机器可读摘要新增 `cost_model_cny_per_month` 与 `cost_do_not`；明确活动价、续费价、备份与运维的估算边界 |

---

## 13. 成本数据来源与估算边界（2026-10-03）

| 项 | 数值 | 来源类别 |
| --- | --- | --- |
| 腾讯云轻量 2核2G4M 上海 | ¥99/年（日常 ¥576） | 云厂商活动页 |
| 腾讯云轻量 2核4G30M 首尔 | ¥199/年 | 云厂商活动页 |
| Cloudflare Pages | 免费 | 官方文档 |
| Workers Free / Paid | 10万次/天 / $5 + $0.30/百万请求 + $0.02/百万 CPU-ms | 官方文档 |
| R2 | 存储 $0.015/GB-月；Class A $4.50/百万；Class B $0.36/百万；出口 $0；免费层 10GB | 官方文档 |
| Hyperdrive | Free 10 配置 / 源库连接 2–20；Paid 25 配置 / 约 100 | 官方文档 |
| Vercel | 默认 300s；Pro/Enterprise 800s；载荷 4.5MB；默认 iad1；无大陆区域 | 官方文档 |
| Supabase | Free $0（500MB/5GB 出口/1GB 存储/1 周不活跃暂停）；Pro $25/月（8GB/250GB 出口/100GB 存储）；PITR 约 $100/月 | 官方定价页 |
| Supabase 连接池 | transaction mode 破坏 advisory lock / prepared statements / SET / 临时表 | 第三方技术分析 |
| 腾讯云 CloudBase | Free 3,000 资源点/月（单次续期 6 个月）；个人版 ¥19.9/月；标准版 ¥199/月；超额出流量 ¥0.8/GB | 官方文档 |
| 阿里云邮件推送 | 免费共 2000 封，日上限 200 封；国内 ¥0.01/封；国际 $0.29/1000 封；独立 IP $128/月 | 官方文档 |

> 上表包含历史活动页报价与公开产品规则，不等于当前可购买报价。VPS、域名、邮件、存储与续费成本须在下单时逐项复核；现阶段成本表是预算估算，不应写作已锁定支出。
