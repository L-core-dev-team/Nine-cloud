# 九霄 Nine-cloud

> **权威规则结算驱动的修仙 AI 文字 RPG 引擎** —— AI 只负责叙事，永远不写世界事实；每一条进入发布物的素材都携带可验证的许可与作者签收链。

**叙事归于模型，事实归于规则。**

> **世界书进度更正（诚实纪律）：** 原图与逐图文字已交付并经过拼接和部分作者审核；旧 182 条 OCR 清单仍未全部转成游戏 Canon，不能表述为"素材未提供／文字完全未审核"。详见 [世界书核验状态更正](docs/世界书核验状态更正.md)。本仓库的完整工作文档（快速入口、仓库结构、原型构建说明）已迁至 [docs/README-工作文档.md](docs/README-工作文档.md)。

[![CI](https://github.com/L-core-dev-team/Nine-cloud/actions/workflows/ci.yml/badge.svg)](https://github.com/L-core-dev-team/Nine-cloud/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-1.0.0--alpha.0-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-11.19-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6)
![License](https://img.shields.io/badge/license-UNLICENSED--private-red)
![Gates](https://img.shields.io/badge/gates-fail--closed%20(RULES%2FLICENSE%2FHUMAN)-crimson)

> **当前状态声明（诚实分层，随版本更新）**：本仓库是九霄 1.0 的私有开发仓库，处于**工程预览（engineering preview）**阶段。`apps/web` 的界面、本地存档、世界书浏览、AI 设置、双记忆模式与 P4 授权召回管道已实现并经 CI 验证；**权威玩法规则尚未由作者签署（`RULES_NOT_READY`），行动结算保持关闭**；云档服务有健康/就绪端点与待认证基础，生产入口未挂载登录与云档路由。本文档描述的架构与门禁均为仓库中真实存在的代码与脚本，不宣称 S0–S7 整体完成，开放项逐条登记于 [阶段缺口与人工交接清单](docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md)。

**本地试玩原型**（验证原型与存档迁移；API 密钥由玩家本机配置，仓库与发行文件不含密钥）：[空白版](outputs/九霄WEB-1.0/九霄_WEB_1.0_空白版.html) · [临江仙存档迁移验证版](outputs/九霄WEB-1.0/九霄_WEB_1.0_临江仙存档版.html) · [试玩验收与恢复指南](outputs/九霄WEB-1.0/试玩验收与恢复指南.md)

---

## 目录

- [一、项目概览](#一项目概览-overview)
- [二、设计哲学与原则](#二设计哲学与原则-design-philosophy)
- [三、核心架构设计](#三核心架构设计-core-architecture)
- [四、核心技术原理](#四核心技术原理-core-technical-principles)
- [五、安全设计](#五安全设计-security)
- [六、关键特性](#六关键特性-key-features)
- [七、技术栈全景](#七技术栈全景-tech-stack)
- [八、质量门禁与可验证指标](#八质量门禁与可验证指标-quality-gates--verifiable-metrics)
- [九、快速开始](#九快速开始-quick-start)
- [十、安装与部署](#十安装与部署-installation--deployment)
- [十一、使用指南](#十一使用指南-usage-guide)
- [十二、项目治理](#十二项目治理-community--governance)
- [十三、路线图](#十三路线图-roadmap)
- [十四、架构决策记录 ADR](#十四架构决策记录-adr)
- [十五、故障排查与 FAQ](#十五故障排查与-faq)
- [十六、生态与集成](#十六生态与集成-ecosystem--integrations)
- [十七、许可证](#十七许可证-license)
- [十八、致谢](#十八致谢-acknowledgments)

---

## 一、项目概览 (Overview)

### 1.1 背景与痛点

LLM 驱动的 AI 角色扮演游戏（AI RPG）在 2024–2026 年快速增长，但该品类的工程化存在三个被普遍回避的结构性缺陷：

| # | 缺陷 | 技术成因 | 业务后果 |
| --- | --- | --- | --- |
| 1 | **AI 越权改写世界事实** | 世界状态以提示词/向量库形式与叙述混存，模型输出直接进入上下文权威链 | 玩家可用 prompt injection 免费获得神器、复活、修改出身；长程一致性崩塌 |
| 2 | **NPC 记忆不可审计** | 记忆 = 调用方提交的摘要 + 向量检索，无"NPC 有权知道什么"的授权边界，无冻结事实 | NPC 全知/失忆随机发生；无法回答"它为什么知道这件事" |
| 3 | **交付无门禁** | 媒体、文案、AI 生成内容直接进发布物，无来源/许可/签收的机器校验 | 许可风险（不可商用）、合规风险（AI 生成内容标识义务）、隐私泄漏（私有素材进玩家包） |

现有方案（纯提示词工程、RAG 记忆框架、向量记忆服务）的共同假设是"**让模型记得更准**"。九霄的判断相反：**记忆与事实的权威性是工程问题，不是模型能力问题**——在模型上下文窗口之外，必须存在一条模型无写权限的权威事实链。

### 1.2 项目定位

- **技术层级**：领域引擎（domain engine）+ 交付门禁体系（delivery gate system）+ 本地优先叙事客户端。不是框架，不是托管平台。
- **适用场景**：需要"AI 叙事 + 权威状态 + 可审计记忆"的文字 RPG / 互动小说 / 桌面跑团数字化项目。
- **明确不适用**：不需要长程事实一致性的轻量聊天陪玩；期望开箱即玩成品游戏的最终用户（当前是工程预览，见状态声明）。

### 1.3 核心价值（可验证指标）

以下数字全部可在仓库中复核（复现命令见 [第八节](#八质量门禁与可验证指标-quality-gates--verifiable-metrics)）：

- **权威边界**：世界事实只经 `ActionIntent → 规则决策 → DomainEvent → 状态投影` 一条路径改变；模型输出在领域层**无任何写入口**（`packages/domain` 全部为纯函数，模型只进入 `provider-narrative.ts` / `narrative-scheduler.ts` 的叙事管线）。
- **记忆可复现**：相同存档分支、授权观察前缀、NPC、游戏时刻、检索线索与策略制品，检索结果**逐项相同**（ADR 0002 约束 4）；策略参数以制品哈希锁定进存档封套。
- **交付门禁**：CI `verify` job **32 个步骤**全链执行；媒体发布门禁对 88 个清单条目逐条校验 `licenseStatus + licenseEvidenceSha256 + Bird/LYL 双收据 + 磁盘 SHA-256 + 全树扫描`；86 个 AI 生成媒体文件按中国《人工智能生成合成内容标识办法》第五/六条完成**显式 + 隐式双标识**。
- **首屏工程量**：Web 入口 225 KB（gzip 71 KB），按需 3D chunk 589 KB（gzip 151 KB）；API Worker bundle 1.16 MB（gzip 202 KB）。

### 1.4 可视化概览

> **架构全景图**（自上而下）：玩家浏览器（React SPA · IndexedDB 本地存档 · BYOK 密钥仅内存）→ 同源 `/api/*`（Hono on Cloudflare Workers · Hyperdrive 直连）→ 领域核心（`ActionIntent → 规则 → DomainEvent → 投影` 纯函数管线 · 授权观察账本 · 双记忆检索策略）→ PostgreSQL（append-only 事件日志 · 哈希链触发器 · supersession 门控）→ 叙事侧（五岗位模型调用 · `RULES_NOT_READY` 独立把关）。三条独立的发布门禁（媒体/规则/人类验收）纵贯右侧，任何一条红灯即阻断发布。

---

## 二、设计哲学与原则 (Design Philosophy)

### 2.1 核心理念

**"最小权威面"（minimal authority surface）**：把"什么能改变世界状态"收敛为一条机器可校验的路径，其余一切（模型、插件、摘要、记忆检索、玩家输入）都置于该路径之外。这是对"AI 应用 = 提示词 + 向量库"范式的一次反向工程。

### 2.2 核心设计准则

1. **AI 不写世界事实（model narrates, rules decide）**
   模型输出只进入叙事层；`packages/domain/src/rules.ts` 及 prologue 规则集是唯一的状态转移函数。落地方式：领域包零依赖 LLM SDK，全部导出纯函数，模型相关代码物理隔离于 `provider-narrative.ts`。

2. **Fail-closed 默认（默认拒绝，显式放行）**
   三道独立门禁——`RULES_NOT_READY`（规则未签署）、`LICENSE_PENDING`（媒体许可未核验）、`HUMAN_GATE_PENDING`（人类验收回执缺失）——任何一道红灯，对应能力整体关闭而非降级。落地方式：`media-release-check.mjs` 在 release 构建内联执行；API 规则路由按规则包存在性硬拒绝。

3. **本地优先（local-first）**
   存档、AI 密钥、图鉴偏好全部落在浏览器 IndexedDB/localStorage；密钥**仅内存使用**，不写入存档、不进入仓库。云端是显式选择的同步副本，不是事实源。

4. **确定性可复现（deterministic recall）**
   记忆检索不使用在线向量服务；衰减、阈值、词典、排序全部由版本化策略制品固定，制品哈希写入存档封套。相同输入必然相同输出——这是"遗忘不产生错误事实"的工程前提。

5. **诚实迁移纪律（honest migration）**
   策略变更只对裁决后**新建**的存档生效，旧存档维持原语义，禁止静默修改。落地方式：`memoryMode`/`policyVersion` 建档即钉死，模式切换 = 创建显式新分支。

6. **append-only 事件溯源**
   `DomainEvent` 不可变；PostgreSQL 触发器强制哈希链（`append_turn_event_hash`，sequence 从 0 起）与策略列创建即钉死（`protect_game_save_memory_policy`）。篡改历史在数据库层不可行。

7. **最小披露原则（need-to-know）**
   转述 ≠ 证实：NPC 记住的是"某人告知了某项主张"，来源归属与授权渠道保留为证据；全局事件日志不能绕过知情授权检查。

8. **机制强制的双作者治理**
   Bird + LYL 双收据不是流程礼仪——`media-release-check.mjs:13-14` 逐条校验两位作者的 `approved` 收据，缺一即门禁红。治理规则编码进构建。

### 2.3 关键选型取舍（Trade-off）

| 决策点 | 选择 | 被否方案 | 取舍依据 |
| --- | --- | --- | --- |
| 状态权威 | 事件溯源 + 纯函数规则 | 向量库 + 提示词约束 | 向量检索是概率性的，无法提供"逐项相同"的可复现承诺；事件溯源以存储成本换权威性 |
| NPC 记忆 | 模式中立授权账本 + 确定性检索 | Mem0/UwU 直接作权威源 | 外部向量服务结果不可复现、不可审计；降级为**候选适配层**（离线实验/可选 adapter），核心用稳定来源 ID 重新校验（ADR 0002 §4） |
| 运行时 | Cloudflare Workers + Supabase（Hyperdrive） | 常驻 Node 服务器 | 边缘冷启动与按量成本优势；代价是规则运行包尚未编译进 Worker，生产流量切换被 ADR 0008 显式门禁（ADR 0008 §5） |
| 前端存储 | IndexedDB 本地优先 | 服务端存档优先 | BYOK 模式下密钥与存档不应经过服务器；代价是跨设备同步需显式云档（S6 邮箱会话 + 客户端备份边界，ADR 0003） |
| 3D 场景 | workspace 包 + 构建期负向过滤 | 直接进主构建图 | 试验素材不得进发布物；三层隔离防线（物理位置/构建 filter/CI 产物扫描），见 [十六](#十六生态与集成-ecosystem--integrations) |

---

## 三、核心架构设计 (Core Architecture)

### 3.1 分层架构

```text
┌─────────────────────────────────────────────────────────────────┐
│ 接入层  React 19 SPA (apps/web)                                  │
│  路由 / 建角 / 回合工作台 / 世界书与图鉴 / AI 设置 / 画面控制        │
│  IndexedDB 本地存档 · localStorage 草稿 · 密钥仅内存              │
├─────────────────────────────────────────────────────────────────┤
│ API 层  Hono (apps/api · Node 24 / Cloudflare Worker 双形态)     │
│  健康/就绪 · 认证会话（HttpOnly Cookie）· 云档 CRUD · 速率限制     │
│  邮件适配（Resend/SendGrid HTTPS）· RULES_NOT_READY 把关          │
├─────────────────────────────────────────────────────────────────┤
│ 领域层  packages/domain（纯函数，零 LLM 依赖）                    │
│  rules.ts · prologue-v1-rules.ts · event-log.ts · projection.ts  │
│  state-delta.ts · narrative-scheduler.ts · p1-memory-policy.ts   │
│  recall-authorized.ts（授权召回 · 衰减门控）                      │
├─────────────────────────────────────────────────────────────────┤
│ 内容层  packages/content                                         │
│  canon-runtime.json（哈希指纹）· worldbook 只读检索 · scenes 清单  │
├─────────────────────────────────────────────────────────────────┤
│ 契约层  packages/contracts（Zod 存档封套 schemaVersion 3）        │
├─────────────────────────────────────────────────────────────────┤
│ 存储层  PostgreSQL/Supabase (packages/db · Drizzle 迁移)          │
│  turn_events 哈希链 · 存档封套 · NPC 授权观察账本 · 迁移 0020+     │
│  浏览器侧 IndexedDB（本地事实源 · 云档为同步副本）                 │
└─────────────────────────────────────────────────────────────────┘
```

各层职责边界：`web` 不直接触库；`api` 不含规则逻辑（只搬运 `ActionIntent` 与回执）；`domain` 不知道 HTTP 与数据库的存在；`content` 对运行时只读。

### 3.2 核心数据流（一个行动的完整生命周期）

```text
玩家自然语言
  │ ①客户端封装（幂等键 idempotencyKey + 时空上下文）
  ▼
ActionIntent ──► 规则结算（packages/domain 纯函数）
  │                │ 不合法 → status: pending_rules（不推进时间，不改状态）
  │                ▼ 合法
  │           DomainEvent（不可变 · 哈希链 append）
  ├────────────────► PostgreSQL turn_events（触发器校验哈希链）
  │
  ▼ ②投影（projection.ts）
状态投影（角色/地点/NPC 知情）
  │
  ▼ ③授权观察账本
NpcObservationGrant 冻结（NPC/原因/渠道/可披露字段）
  │
  ▼ ④模式路由（建档时钉死）
  ├─ Continue 适配器 → 授权观察直取
  └─ Forgetting 适配器 → 衰减门控检索（阈值 0.35）
  │
  ▼ ⑤叙事管线（narrative-scheduler · provider-narrative）
五岗位模型调用（BYOK）→ 叙事文本回填
  │  ✗ 模型失败/超时：事件与投影已提交，叙事可重试——事实不因模型不可用而丢失
  ▼
玩家可读回合 + 回执（receipts）
```

**异常语义**：规则结算失败 → 存档进 `pending_rules` 队列（不丢弃意图）；模型故障 → 事实链已落库，仅叙事层可重试；跨标签页写冲突 → 版本核对拒绝，提供"另存为分支"。

### 3.3 核心模块拆解

| 模块 | 职责 | 关键接口/文件 |
| --- | --- | --- |
| `packages/contracts` | Zod 存档封套契约（schemaVersion 3、memoryMode、分支谱系） | `SaveEnvelopeSchema` |
| `packages/domain` | 规则结算、事件日志、投影、授权召回、叙事调度 | `rules.ts`、`event-log.ts`、`projection.ts`、`recall-authorized.ts`、`p1-memory-policy.ts` |
| `packages/content` | Canon 只读运行时（哈希指纹门禁）、场景清单 | `canon-runtime.json`、`worldbook` |
| `packages/db` | Drizzle 迁移、触发器（哈希链/策略钉死/supersession） | `drizzle/*.sql`（0020+） |
| `apps/api` | 会话、云档、邮件、速率限制；Node 与 Worker 双适配 | `src/worker.ts`、`wrangler.jsonc` |
| `apps/web` | 全部玩家界面与本地优先存储 | `src/main.tsx`、`storage.ts`、`candidate-atlas.ts` |
| `apps/scene-studio` | 3D 场景试验台（**构建隔离**） | `scripts/device-audit.mjs`（真机采集） |

### 3.4 关键时序：模式切换（含失败路径）

```text
玩家请求切换记忆模式
  → 系统生成预览：可转换项 / 不可转换项清单
  → [确认] 创建新分支：记录源分支 + 分叉修订 + 转换制品
      │ 成功 → 源分支转只读；新分支按新策略初始化存储命名域
      └ 失败 → 不修改源分支，不静默回落旧模式（ADR 0002 §3）
  → 存储初始化时核对模式与制品哈希，任何不一致 → 关闭检索（fail-closed）
```

---

## 四、核心技术原理 (Core Technical Principles)

### 4.1 创新点一：模式中立授权观察账本（Authorized Observation Ledger）

**业界差异**：主流 AI RPG 把"NPC 知道什么"交给上下文注入启发式。九霄把它建模为**冻结的授权记录**：领域事件先经可见性与披露规则产生 `NpcObservationGrant`（NPC 标识、授权原因、渠道、允许披露的字段），在**同一个数据库事务**内与事件、投影、回执、授权 outbox 一并写入。

**工程效果**：
- 每条 NPC 记忆都能回答"它凭什么知道"（grant 即证据）；
- 目击/转述分别授权，全局日志无法绕过知情检查；
- 账本与记忆模式解耦——Continue/Forgetting 只是同一账本之上两种**版本化检索策略**。

### 4.2 创新点二：确定性遗忘（Decay-Gated Forgetting）

Forgetting 模式的检索可访问性由组合指数衰减计算，参数以策略制品 `p4-recall-policy-v2.json` 固化：

```text
accessibility(observe) = w_t · 2^(−ΔgameTime / T_half)   # 时间半衰期 T_half = 10,080 min
                       + w_n · 2^(−rank(O_n) / N_half)   # 观察数半衰期 N_half = 16 条
recall(cue) = observe if accessibility ≥ θ               # 阈值 θ = 0.35（FORGETTING_CUE_FLOOR）
            = deterministic "我不太记得了" template if accessibility < θ
```

**可承诺与不可承诺（诚实边界）**：承诺的是检索衰减、线索召回边界、同输入可复现性；**不承诺**算法与人类遗忘在心理学上等价（ADR 0002 §2）。

**性质推导**：
- *单调性*：ΔgameTime 增大 → accessibility 单调不增 → "遗忘随游戏时间推进单调收紧"；
- *可复现性*：分数、阈值、词典、规范化与排序全部来自哈希锁定的制品 → 相同前缀必得相同结果；
- *无污染*：检索是纯读操作，被查询不强化记忆（无"越问越记得"的写回路径）。

### 4.3 创新点三：机制化的交付门禁链（Delivery Gate Chain）

发布物中每一个媒体文件必须同时满足五层机器校验（`scripts/audit/media-release-check.mjs`）：

```js
// 逐条：路径白名单（/scenes/ + 显式扩展的 /favicon.svg、/compliance/*）
//      → licenseStatus === 'approved'
//      → licenseEvidenceSha256 指向证据文档
//      → Bird + LYL 双 approved 收据（assetSha256 与条目一致）
//      → 磁盘文件 SHA-256 与清单一致
// 全局：public/ 全树 walk，任何未登记媒体 → UNLISTED_MEDIA_ASSET（release 构建失败）
```

叠加 CI 层：两个 build 后的产物扫描（`scan:artifacts`，0 未授权包命中）、release 目标构建内联媒体门禁、closeout packet 按名称校验全部必需步骤真实 success（`ci-evidence.mjs` 不接受"缺失即成功"）。

### 4.4 AI 生成内容合规（中国《标识办法》第五/六条）

86 个 AI 生成媒体文件完成双层标识：

- **隐式**：传播要素 JSON `AIGC{Label, ContentProducer, ProduceID, ContentPropagator, PropagateID}` 注入文件元数据——82 张 WebP 经 RIFF `XMP ` chunk（含 VP8X 插入/置位），2 条 MP4 经 `use_metadata_tags` 重封装；`ContentProducer`/`ProduceID` **逐条继承素材树原文件的法定平台编号**，生成要素与传播要素在同一条内容编号链上闭环。脚本 `scripts/audit/apply-aigc-propagation-labels.mjs` 幂等可重跑，注入后全量 ffmpeg 解码零破损。
- **显式**：四处界面标注（全站页脚、图鉴边界声明、放大查看器、建角画影）。

### 4.5 身份与防篡改体系

| 机制 | 实现 | 防御目标 |
| --- | --- | --- |
| `stableGrantIdV2` + `grantIdVersion` | 授权记录的稳定身份与版本 | 跨迁移的授权可追溯 |
| `semanticSha256` 语义指纹 | 规则候选内容指纹进钉子测试 | 规则语义被静默篡改 |
| 哈希链 `append_turn_event_hash` | 触发器强制 sequence 连续（从 0 起）+ 链式哈希 | 历史事件插入/重排/删除 |
| `protect_game_save_memory_policy` | 策略列创建即钉死（CHECK 约束） | 记忆策略中途被 UPDATE |
| supersession 表 + 触发器（0020） | 后续观察显式取代前序 | 记忆被静默覆盖 |
| closeout packet `STALE_BUILD_EVIDENCE` | 构建 commit 与 CI run head 绑定 | 旧构建冒充新构建证据 |

---

## 五、安全设计 (Security)

### 5.1 威胁模型（攻击面 → 缓解）

| 威胁 | 等级 | 缓解机制 |
| --- | --- | --- |
| Prompt injection 篡改世界状态 | **高** | 领域层无模型写入口；模型输出仅进叙事管线；规则结算在模型调用**之前**完成 |
| 玩家密钥泄漏 | 高 | BYOK 密钥仅内存，不写入存档/网络日志/仓库；导出存档自动脱敏（`serializeJsonWithCredentialRedaction`） |
| 未审内容进发布物 | 高 | 三层隔离（物理/构建 filter/CI 产物扫描）+ 媒体门禁全树 walk |
| SQL 注入 | 中 | Drizzle 参数化查询；无字符串拼接 SQL |
| 会话劫持 | 中 | HttpOnly 可吊销会话 Cookie；邮箱 OTP（Supabase Auth）；速率限制 |
| 数据库历史篡改 | 中 | 哈希链 + 策略钉死触发器（4.5） |
| 私有素材/绝对路径泄漏 | 中 | 发布扫描（`artifact-scan.mjs`）+ 私有目录不进发行包纪律 |
| 跨标签页存档覆盖 | 低 | 版本核对拒绝 + 冲突分支 |

### 5.2 零信任要素

- 浏览器**不持有** Supabase secret；Supabase token 不作为游戏 `owner_id`（ADR 0008 §2）；
- API 认证开关缺省关闭：凭据、隐私政策、迁移任一未就绪即不开放账户路由（ADR 0008 §4）；
- 每个门禁独立把关，不因其他门禁通过而放行。

### 5.3 审计与合规

- `SECURITY.md` 定义安全边界与上报路径；
- `pnpm license:check` 依赖许可审计进 CI；
- 中国《人工智能生成合成内容标识办法》（2025-09-01 施行）显式+隐式标识义务已完成实施（4.4）；
- 公安联网备案与 ICP 备案在页脚呈现（备案号就位后渲染）。

### 5.4 漏洞披露

私有开发阶段：安全问题请通过 [SECURITY.md](SECURITY.md) 中定义的渠道私下报告，不在公开 Issue 追踪。分级响应：P0（权威边界绕过）24 小时内确认，P1（数据泄漏）72 小时内确认，其余一周内答复；修复后致谢记录于发布说明。

---

## 六、关键特性 (Key Features)

### 6.1 基础能力层

**本地优先存档与迁移**
- 功能：IndexedDB 存档、旧 localStorage 档自动迁移（原文备份下载 + 冲突另存副本）、导入旧档前强制原文备份。
- 实现要点：`hydrateSaves()` 双键兼容；提交前 JSON 逐字节版本核对。
- 示例（迁移旧档的用户可见行为）：

```text
检测到旧版 localStorage 存档 → [下载原文备份并迁移]
→ 逐份写入 IndexedDB，ID 冲突自动生成"（迁移副本）"
→ 旧键保留，任何一步失败不销毁原数据
```

**世界书与画卷图鉴**
- 功能：已审核 Canon 设定检索（分类/搜索/高亮）+ 74 幅候选画卷（九集合），正文与图鉴明确分界（"画卷不构成设定依据"）。
- 实现要点：`packages/content` 生成 `canon-runtime.json`（版本 + 条目数 + 全文 SHA-256 指纹），构建期 `worldbook:runtime:check` 校验。

**五岗位 AI 设置（BYOK）**
- 功能：叙事/世界/规则等五岗位独立配置模型与连接；短连接自检；超时/限流/脱敏提示。
- 边界：无模型时确定性词表与模板照常工作——BYOK 只改善叙事，**不增加行动权限**（ADR 0002 约束 8）。

### 6.2 高级能力层

**双记忆模式（项目特色）**
- Continue：授权观察永久可回忆，直取无衰减；
- Forgetting：4.2 节的衰减门控检索，低可访问性返回确定性"我不太记得了"模板；
- 建档时选择并钉死，切换 = 显式新分支。

**P4 授权召回管道（生产接线）**
- 显式问句（cue）→ 确定性检索：槽位隔离、supersession 门控、时钟上界、结果有界（≤16 条）；
- MemoryClass 四分类：`current-state / historical-event / subjective-belief / unclassified`。

**权威回合 UI（durable turn）**
- 合成回执驱动的恢复：页面刷新/断网后回合状态可重建；冲突自动"另存为分支"。

### 6.3 企业级特性

- **发布门禁体系**：4.3 节门禁链 + closeout packets（exact-build G1/Canon/MediaManifest/DeviceTestRecord/RC_MANIFEST 全套 JSON 证据，`HUMAN_GATE_PENDING` 独立于机器绿灯）；
- **CI 32 步全链**：typecheck → 单测 → 双目标构建 → 媒体门禁 → API 容器 smoke → PostgreSQL 集成 → e2e（含 durable turn / SMTP 隔离 / 数据库备份恢复）→ 证据包；
- **合规**：AI 内容标识（4.4）、备案呈现、许可审计。

### 6.4 生态扩展能力

- **场景试验台隔离**：`@jiuxiao/scene-studio`/`@jiuxiao/scene-gate` 经负向 filter + CI 扫描 + 媒体清单三重防线隔离于发布物（[十六](#十六生态与集成-ecosystem--integrations)）；
- **外部记忆适配层**：Mem0 / UwU Memory 定位为候选检索 adapter，可替换、非必需依赖（ADR 0002 §4）；
- **运行时双形态**：同一 Hono API 同时支持 Node 24 与 Cloudflare Worker 目标。

---

## 七、技术栈全景 (Tech Stack)

| 层级 | 技术 | 版本 | 选用原因 |
| --- | --- | --- | --- |
| 运行时 | Node.js | ≥ 24 | 内置 WebSocket（真机 CDP 采集依赖）、原生 ESM、`--experimental-strip-types` 生态 |
| 语言 | TypeScript | 7.0.2（+ 6.0.2 compiler-api） | 类型即契约；compiler-api 支撑语义指纹工具链 |
| 包管理 | pnpm | 11.19.0 | workspace 协议（`workspace:*`）+ 严格依赖隔离（试验包物理隔离的前提） |
| 前端框架 | React | 19.3.0 | 无重状态库依赖的轻量 UI 层；`<dialog>`/CSS 变量原生能力优先 |
| 构建 | Vite | 8.3.0 | Rolldown 构建引擎；多构建目标（`JIUXIAO_BUILD_TARGET=release` 切换门禁行为） |
| API 框架 | Hono | — | Node/Workers 双运行时同构；轻量中间件（速率限制/会话） |
| 数据库 | PostgreSQL + Drizzle | — | 触发器级防篡改（哈希链）需要过程性约束，ORM 层无法替代 |
| 托管 | Cloudflare Workers + Supabase | — | ADR 0008；Hyperdrive 直连保持 `pg` 驱动兼容 |
| 邮件 | Resend（默认）/ SendGrid | — | HTTPS API（Worker 无 SMTP 连接负担）；Supabase Auth 直连 SMTP |
| 测试 | Vitest 5 + Playwright 1.63 + 自研 e2e | — | 单测/集成/e2e 三层；e2e 以确定性断言绑定 UI 文案与门禁行为 |
| CI/CD | GitHub Actions（`jiuxiao-workspace` workflow） | — | 32 步 verify job；Cloudflare Pages Preview / Supabase Preview 集成 |
| 可观测性 | 结构化错误码 + closeout JSON 证据包 | — | 面向"发布审计"而非"在线调试"设计：每个发布物自带可核验证据链 |

---

## 八、质量门禁与可验证指标 (Quality Gates & Verifiable Metrics)

> 本项目**未建立**标准化的性能基准测试套件（吞吐/延迟分布对比），因此不提供虚构数据。以下全部为当前真实存在、可在克隆后复现的工程指标。

### 8.1 可复核指标

| 指标 | 数值 | 复现方式 |
| --- | --- | --- |
| CI verify 步骤数 | 32 | `.github/workflows/ci.yml` |
| Web 单元测试 | 175 tests / 25 files | `pnpm --filter @jiuxiao/web test -- --run` |
| 媒体清单条目 | 88（86 AI 生成已标识） | `apps/web/public/scenes/candidate/asset-manifest.json` |
| 隐式标识注入 | 86 文件，幂等重跑 injected=0 | `node scripts/audit/apply-aigc-propagation-labels.mjs` |
| Web 入口体积 | 225.13 KB（gzip 71.15 KB） | `pnpm build` 产物输出 |
| 按需 3D chunk | 589.37 KB（gzip 150.74 KB） | 同上 |
| API Worker bundle | ≈1.16 MB（gzip ≈202 KB） | `wrangler deploy --dry-run` |
| ADR 数量 | 8 | `docs/adr/` |
| 产物泄漏扫描 | 102 dist 文件 0 命中 | `pnpm scan:artifacts` |

### 8.2 门禁行为自测（fail-closed 证明）

```bash
node scripts/audit/media-release-check.test.mjs
# → "Media gate: pending license, missing reviewer, unlisted asset and digest
#    mutation refused; synthetic approved fixture passed."
```

该测试证明四类攻击向量均被拒绝：许可未核验、单作者收据、未登记资产、哈希篡改。

### 8.3 长稳与真机

真机性能协议（Android adb+CDP 自动 FPS/JS 堆采集，iPhone 手动协议）已脚本化：`apps/scene-studio/scripts/device-audit.mjs`，通过线（AI 建议值，作者可否决）：均值与 P95 ≥ 30 FPS、低帧 ≤ 5%、最差 60s 滑窗均值 ≥ 24、堆斜率 ≤ 0.5 MB/min、首尾增长 ≤ 10 MB。**真机数据采集尚未执行**，此为开放项而非已达指标。

---

## 九、快速开始 (Quick Start)

### 环境要求

- Node.js ≥ 24、pnpm 11.19（`corepack enable`）、可选 Docker（开发数据库链）
- 集成测试需独立可丢弃的 PostgreSQL `TEST_DATABASE_URL`（缺失时命令明确失败，不静默跳过）

### 一分钟跑通

```bash
git clone https://github.com/L-core-dev-team/Nine-cloud.git jiuxiao && cd jiuxiao
corepack enable
pnpm install --frozen-lockfile
pnpm dev:web            # → http://127.0.0.1:5173
```

预期：山门首页渲染（月下场景海报）→「进入世界」→ 建角三步表单 → 创建**本地存档**（角色草稿 + 开局意图入库，规则结算待签署状态明确提示）。

### 全量验证

```bash
pnpm typecheck && pnpm test
pnpm test:integration   # 需要 TEST_DATABASE_URL
pnpm test:e2e           # Playwright（自动装 chromium）
pnpm build              # 含 canon-runtime 校验 + 构建清单
```

### 常见启动问题

| 症状 | 原因与处置 |
| --- | --- |
| `dev:api` 连接失败 | 未设置可连通的 `DATABASE_URL`；或直接 `docker compose up --build -d` 起开发数据库/迁移/API/Mailpit |
| `test:integration` 拒绝运行 | `TEST_DATABASE_URL` 缺失是**设计行为**（防误连生产） |
| 端口 5173/5185 冲突 | 旧 dev server 残留；`netstat -ano | findstr 5173` 定位后终止 |

---

## 十、安装与部署 (Installation & Deployment)

### 10.1 多形态

```bash
# 开发全链（数据库 + 迁移 + API + Mailpit）
docker compose up --build -d

# 仅静态构建（CI 同款，含 canon 校验与构建清单）
pnpm build

# Pages 预览
pnpm build:pages-preview
```

### 10.2 生产拓扑（Cloudflare Workers + Supabase，**门禁状态**）

按 ADR 0008，生产部署是三个**独立状态**（Worker 部署 ≠ Supabase Auth 配置 ≠ 数据库迁移）：

```text
浏览器 ──同源──► https://play.jiuxiaogame.cn/api/* ──► Cloudflare Worker (Hono)
                                                        │ Hyperdrive
                                                        ▼
                                              Supabase PostgreSQL
                        Supabase Auth（邮箱 OTP；SMTP = Resend）
```

**当前门禁（诚实状态，非操作指南）**：
- Worker 适配器覆盖认证/账户/云档 API；**玩法规则运行包尚未编译进 Worker**，`RULES_NOT_READY` 行为一致性未在 Worker 上证明——线上 `/api/*` 流量不得切换（ADR 0008 §5）；
- Hyperdrive ID 为占位值；Auth 默认关闭；无生产 secrets；
- 每项远端写操作（`wrangler deploy`/`secret put`/DNS/生产迁移）需逐项审查执行，不由代码合并自动触发。

### 10.3 版本与迁移纪律

- 存档封套 `schemaVersion 3`；策略变更仅影响裁决后**新建**存档（诚实迁移纪律）；
- 数据库迁移向前兼容核对是 Worker 回滚的前提；**Worker 代码回滚不回滚 Supabase 数据**（ADR 0008 §5）。

---

## 十一、使用指南 (Usage Guide)

### 11.1 当前面板能力（工程预览）

| 路由 | 能力 |
| --- | --- |
| `/`（山门） | 场景海报 + 程序化山门渲染、氛围粒子、水声合成 |
| `/new`（建角） | 三步表单（人/道/行）、地域画影（AI 生成标注）、记忆模式选择（Continue/Forgetting）、服务端规则存档创建（游客/邮箱会话） |
| `/game/:id`（行旅） | 行动意图编写（幂等键 + 草稿持久化）、待处理队列、冲突分支、旧档历史资料区 |
| `/world`（世界设定） | Canon 正文检索 + 74 幅画卷图鉴（AI 生成显式标注） |
| `/settings/ai` | 五岗位 BYOK 配置、短连接自检 |
| `/settings/cloud` | 邮箱 OTP 登录、云档恢复为本地副本 |
| `/settings/graphics` | 画面/声音/降级（减弱动态 → 海报回退）、场景预览 |

### 11.2 关键行为语义（避免误解）

- 行动意图在规则未签署时**不会**推进时间或改变状态（`status: pending_rules` 明示）；
- "创建服务端规则存档"要求规则门禁开启，否则 `RULES_NOT_READY` 明确拒绝且**不创建存档**；
- 画卷图鉴是候选视觉参考，**不构成设定正文或存档事实**。

### 11.3 API 概览

同源 `https://…/api/*`（当前生产未切换；本地 `docker compose` 提供）：

| 域 | 端点族 | 认证 |
| --- | --- | --- |
| 健康 | `/api/health` `/api/ready` | 无 |
| 会话 | `/api/auth/session` `POST /api/auth/guest` 邮箱 OTP | HttpOnly Cookie |
| 云档 | `/api/games` CRUD（幂等键、`choices.memoryMode`） | 会话 |

错误码体系（fail-closed 语义）：`UNAUTHENTICATED` / `RATE_LIMITED` / `RULES_NOT_READY` / `INVALID_MEMORY_MODE` / `LICENSE_PENDING` / `MEDIA_AUTHOR_APPROVAL_PENDING` / `UNLISTED_MEDIA_ASSET` / `MEDIA_DIGEST_MISMATCH` / `INVALID_MEDIA_MANIFEST` / `STALE_BUILD_EVIDENCE` / `CI_EVIDENCE_REQUIRED`。

---

## 十二、项目治理 (Community & Governance)

### 12.1 双作者模型

| 角色 | 职责 |
| --- | --- |
| **LYL**（创作作者） | 世界设定、素材委托生成、发布范围裁决、最终签收 |
| **Bird**（复核作者） | 独立复核、双收据签发（机制强制）、驳回权 |

### 12.2 AI 代理执行约定（本项目特色治理）

AI 代理可在作者明确授权下执行实施工作，所有产出**逐处标注**「AI 代理执行（LYL 授权）+ Bird 复核代理」；机制性签收点（如媒体收据、人类验收回执）保留作者本人复核权，代理标注不免除该权利。

### 12.3 贡献

私有开发阶段，暂不接受外部 PR。文档规范：现状记录与历史快照严格分离（[文档索引](docs/README.md)）；重大技术决策必须落 ADR（`docs/adr/`，含状态、日期、supersede 关系与参考文献 MLA 格式）；仓库工作区结构、原型构建与私有材料边界见 [docs/README-工作文档.md](docs/README-工作文档.md)。

### 12.4 交流

开发过程材料全部归档于 `docs/acceptance/[YYYY-MM-DD]/`（裁决简报、证据、收据与对应关系索引），当前以仓库为唯一事实源。

---

## 十三、路线图 (Roadmap)

### 已完成（2026-10-10 状态）

- **S1–S5 工程链**：web 界面全集、API 基础、本地存档、旧档迁移、世界书浏览
- **P2 权威回合**：ActionIntent → 规则 → 事件 → 投影的候选链路（本地权威存档）
- **P4 记忆语义**：双记忆契约落地、授权召回生产接线、Forgetting 衰减门控（PR #65/#67/#68）
- **G-05 媒体门禁**：88 条逐条登记 + 顶层翻转 + release 门禁转绿
- **发布合规**：发布范围批准（公开+商用档）+ AI 标识显式/隐式全量实施（PR #69）

### 进行中 / 待外部条件

- **真机性能对照**（作者待办 2）：协议与脚本就绪，等设备
- **scene 晋升决策**：真机证据 + 展示审核 → artifacts 纳入决策树（[行动材料](docs/acceptance/2026-10-10/P66-scene-studio试验遗留条件行动材料.md) §4）

### 中长期

- Worker 玩法规则运行包编译与 `RULES_NOT_READY` 一致性证明 → 生产 API 切换
- FINAL_HUMAN_GATES 人类验收（AI 配置 G1 回执、Canon 回执）→ 公测
- 权威玩法规则作者签署（`RULES_NOT_READY` 解除路径）
- 1.0 明确不含：社区与收费（ADR 0004）；应用商店上架属范围变更（ADR 0006）

---

## 十四、架构决策记录 (ADR)

完整列表见 [docs/adr/](docs/adr/)（8 个）。四个最重大决策：

<details>
<summary><b>ADR 0001：语言与运行时边界</b>（点击展开）</summary>

领域层 TypeScript 纯函数 + Node 24；禁止在领域包引入 LLM SDK 与 HTTP 依赖，保证"规则可独立验证"。取舍：放弃跨语言规则实现（Rust/WASM），换取与前端/Worker 生态的类型同源。
</details>

<details>
<summary><b>ADR 0002：NPC 双记忆模式与授权观察账本</b></summary>

问题：NPC 记忆主要保存调用方提交的摘要，缺授权边界、知情依据与跨模式隔离。决定：①模式中立授权账本（目击/转述分别授权，同事务写入）②两种模式为独立版本化检索策略（检索确定性可复现）③建档固定策略身份、切换即新分支 ④Mem0/UwU 降级为候选适配层 ⑤1.0 不启用离线世界演化。取舍：放弃"向量检索 + 语义摘要"的聪明感，换取逐项可复现与可审计。
</details>

<details>
<summary><b>ADR 0004：1.0 不含社区与收费</b></summary>

范围切割决策：社区功能与支付/权益账本全部移出 1.0（`S7ScopeGate: DEFERRED_BY_DECISION`），权益账本不等于支付。效果：发布门禁聚焦内容与合规，不背交易合规负担。
</details>

<details>
<summary><b>ADR 0008：Cloudflare Workers 与 Supabase 运行边界</b></summary>

取代 ADR 0007 的 Node API 运行时选择：Worker 只接管 `/api/*`（同源，不造 `api.` 子域）；Supabase Auth 管凭据、PostgreSQL 存业务表、Hyperdrive 直连；浏览器不持 Supabase secret；认证缺省关闭；**代码准备与生产上线分开报告**。取舍：接受"规则包未编译进 Worker 前不切流量"的过渡期。
</details>

---

## 十五、故障排查与 FAQ

### 15.1 错误码对照

| 错误码/信号 | 含义 | 处置 |
| --- | --- | --- |
| `RULES_NOT_READY` | 服务器未装载已批准规则运行时 | 等待作者签署规则包；存档不会被创建或破坏 |
| `LICENSE_PENDING` | 媒体清单存在未核验条目 | 检查 `asset-manifest.json` 逐条 `licenseStatus` |
| `MEDIA_AUTHOR_APPROVAL_PENDING` | 条目缺 Bird/LYL 双收据 | 补齐 `authorReceipts`（机制强制，不可代签） |
| `UNLISTED_MEDIA_ASSET` | `public/` 全树出现未登记媒体 | 登记进清单或移出发布树 |
| `MEDIA_DIGEST_MISMATCH` | 磁盘哈希 ≠ 清单哈希 | 文件被改动后未重签；重算并同步收据 |
| `STALE_BUILD_EVIDENCE` | 构建证据 commit 与当前 HEAD 不符 | 不可将旧构建绑定新提交；重新构建 |
| `CI_EVIDENCE_REQUIRED` | closeout packet 在 CI 外被调用 | 设计行为：证据只能产生于真实 run 内 |
| `INVALID_MEMORY_MODE` | 记忆模式不合法 | 建档传 `continue` 或 `forgetting` |

### 15.2 常见问题

**Q：为什么行动结算一直关闭？**
规则结算的开启前提是作者签署的玩法规则运行包（含语义指纹钉子）。这是 fail-closed 设计而非缺陷——宁可不结算，也不让未审规则改写玩家状态。

**Q：NPC 记忆和"给 GPT 加个记忆库"有什么区别？**
区别在**写入权**：九霄的记忆来自冻结的授权账本（NPC 凭什么知道 + 允许披露什么字段），检索确定性可复现；而非"每次把相似文本塞进上下文"。

**Q：Forgetting 模式会删除我的存档事件吗？**
不会。遗忘只作用于**检索可访问性**，权威事件与授权观察完整保留；线索命中可恢复来源支持的完整或部分事实（`partial=true`），1.0 不生成错误归属（ADR 0002 约束 3）。

**Q：为什么 `pnpm test:integration` 拒绝运行？**
缺少独立 `TEST_DATABASE_URL`。命令设计为明确失败而非静默跳过——防止集成测试意外打在生产库上。

**Q：媒体门禁为什么连 favicon 都要登记？**
门禁扫描 `public/` **全树**。白名单是精确匹配（`/scenes/*` + 显式扩展的 `/favicon.svg`、`/compliance/*`），不存在"小文件豁免"——未登记即 `UNLISTED_MEDIA_ASSET`。

### 15.3 定位思路

1. **CI 红** → 看 verify job 失败步骤名 → 本节对照表 → 大多数是门禁钉子与文案断言不同步；
2. **release 构建红** → 跑 `node scripts/audit/media-release-check.mjs` 拿具体条目错误；
3. **dev 控制台 SyntaxError 无来源 URL** → 先排除浏览器扩展注入（无痕窗口对比），应用模块经构建校验基本可排除语法问题。

---

## 十六、生态与集成 (Ecosystem & Integrations)

### 16.1 scene-studio 三层隔离防线（试验素材 → 发布物之间的防火墙）

| 层 | 机制 | 证明 |
| --- | --- | --- |
| 物理层 | 试验素材位于门禁扫描树之外 | 目录结构 |
| 构建层 | pnpm filter 负向排除（typecheck/test/build 全部 `--filter=!@jiuxiao/scene-studio --filter=!@jiuxiao/scene-gate`） | 根 `package.json` |
| CI 层 | 双 build 后产物扫描 `scan:artifacts`（scene 包特征 + 文件名白名单） | run 38054023807 通过 |

若未来经决策树批准纳入，须：媒体清单逐条登记（哈希/许可/双收据）→ AIGC 标识注入 → 真机证据 → 门禁翻转 PR。

### 16.2 外部记忆服务

Mem0 / UwU Memory 为**可替换候选 adapter**：只提供语义候选，核心必须以稳定来源 ID 重新读取、校验、授权；其写入或向量结果**不能决定事实**（ADR 0002 §4）。关闭任一外部服务后，规则回合、两种核心策略与存档重建仍成立。

### 16.3 基础设施集成

Supabase（Auth + PostgreSQL + 预览集成）、Cloudflare（Workers + Pages Preview）、Resend/SendGrid（邮件，凭据仅 Worker secret）、Mailpit（本地 SMTP 测试）。

---

## 十七、许可证 (License)

**UNLICENSED — 私有开发仓库，保留所有权利。**

- 本仓库当前**未采用任何开源协议**：除本项目作者（LYL、Bird）外，任何人不获得使用、复制、修改、分发的许可；
- 仓库内的原创世界设定（Canon 1.0）、美术素材（AI 生成候选，含许可证据链）、代码均为作者财产；
- **私有材料边界**：世界书原图、临江仙存档、OCR 转写与调用记录按私有资料处理，不进入发行包；尚未转成正式 Canon 的资料不得作为玩家可见世界事实；
- 第三方组件许可经 `pnpm license:check` 审计（CI 强制），各依赖适用其原始协议；
- AI 生成素材的许可依据与条件链：[素材树权利属性查证与确认书](docs/acceptance/2026-10-10/素材树权利属性查证与确认书.md)、[scene-studio 许可与真机查证结论](docs/acceptance/2026-10-10/scene-studio许可与真机查证结论.md)（即梦/豆包：输出归用户；OpenAI gpt-image：输出归用户，附不得冒称人工生成等条件）。

开源协议的将来选择（若公开发布）将另行以 ADR 记录。

---

## 十八、致谢 (Acknowledgments)

- **作者团队**：LYL（创作与裁决）、Bird（复核与质量门）
- **开源依赖**（本项目站在这些项目的肩膀上）：React · Vite · Hono · Drizzle ORM · Vitest · Playwright · Zod · Cloudflare Workers · Supabase · Resend · Markdown 生态
- **方法论影响**：Event Sourcing（Greg Young）、ADR（Michael Nygard）、本地优先软件（Ink & Switch）、fail-closed 安全设计传统
- **合规依据**：中国《人工智能生成合成内容标识办法》（2025-09-01 施行）、GB《网络安全技术 人工智能生成合成内容标识方法》

---

*签名约定：本文档由 AI 代理执行（LYL 授权）+ Bird 复核代理 维护；所有"已完成"表述均绑定对应 CI run 与验收文档，开放项不做模糊化处理。*
