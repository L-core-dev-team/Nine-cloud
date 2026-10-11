# 部署路线 A/B 裁决材料（含拓扑取舍）

生成：2026-10-11。目的：为环境方案手册第 251 行登记的"默认路线 A 与生产 Compose 不一致"配置冲突提供裁决材料；由 LYL 与 Bird 签署后进入 P2/P3。本文只陈述仓库与控制台可核验事实，不预设立场。

## 1. 待裁决的问题

手册明文（[环境方案手册 §配置冲突表](../../九霄1.0环境方案-主索引与执行手册.md)）：

> 默认路线 A 与生产 Compose 不一致：`deployment/api-production.compose.yml` 固定 `AUTH_ENABLED=true`、`AUTH_MAIL_PREFLIGHT=true`，并要求 SMTP 与前端 Origin。服务因此挂载邮箱账号接口；这不等于"不开在线账号"。
> **由两位作者签署路线选择。** 若保留 A，先补一份经批准的入口封锁规则和 SMTP 预检方案；若改走 B，先完成人工数据政策、真实邮件资源与 G-06。不得只隐藏前端登录按钮。

- **路线 A（受限）**：部署 API 但不开在线账号，验收范围限定为「本地玩法 + UI + 媒体 + 真机」（D-I-07 已由 LYL 签署）。需要：经批准的入口封锁规则 + SMTP 预检方案。
- **路线 B（完整）**：完整账号 + 云档。需要：人工数据政策（`ACCOUNT_DATA_POLICY`，P4-8 任何生产云档写入前必须）+ 真实邮件资源（生产 SMTP 实收验收）+ G-06。

## 2. 拓扑事实（与路线裁决正交但相关）

| 拓扑 | 仓库事实 | 与现场条件的匹配 |
| --- | --- | --- |
| ① Workers 主线（ADR 0008） | [deployment/README.md](../../../deployment/README.md)：当前目标 Workers + Supabase；**Worker 尚未覆盖完整玩法 API，不得部署为全量 `/api/*` 生产处理器**；`RULES_NOT_READY` 一致性未在 Worker 上证明（ADR 0008 §5） | 前端 Pages 已在 DNS（主域/play/www）；但 Pages/Worker 为境外接入，与"境内服务器 + ICP"组合的合规形态需明确 |
| ② 境内 Node 源站 | `api-production.compose.yml` + [Caddyfile](../../../deployment/Caddyfile)（`api.jiuxiaogame.cn` → `api:8787`，Auto HTTPS，CI 校验在链）；"旧 Node API 生产部署回滚材料"现为回滚参考 | 轻量服务器已购、ICP 云资源绑定其 IP、`api` 记录已指向——境内合规形态完整；对应手册 T2 境内公测成本线（¥13/月起） |
| ③ 混合 | 前端 Pages（境外 CDN）+ API 境内源站 | `api` 记录已如此；跨域 Cookie/CORS 需另验（README §前端 cloud-sync 说明） |

注意：ICP 备案的云资源绑定的是轻量服务器 IP。若正式服务入口全部落在境外接入（Pages/Worker），备案与接入形态的一致性需由部署负责人确认。

## 3. 当前已具备/仍缺（按路线分列）

| 条件 | 现状 |
| --- | --- |
| 主机 / ICP / 域名 / DNS | ✅ 已具备（见 [P1-服务器初始化执行清单](P1-服务器初始化执行清单.md) §0） |
| Supabase Auth + 业务库 | ✅ 项目 Healthy、迁移在链；⚠️ 备份未开启（开写前必须） |
| 邮件链路 | DNS 层已配（MX/SPF/DKIM/`ses-callback` Worker）；**生产 SMTP 实收验收未做** |
| 数据政策 | ❌ 无已批准的 `ACCOUNT_DATA_POLICY` JSON（路线 B 硬前提） |
| 规则 runtime / G-03 | ❌ `RULES_NOT_READY` fail-closed 保持；生产 `TURN_RULES_MODULE` 未提供——两路线下行动结算均先关闭，这是诚实状态不是故障 |
| 入口封锁规则（仅路线 A） | ❌ 未起草 |
| FINAL_HUMAN_GATES | ❌ 公测前人类验收（两路线共同的最终门） |

## 4. 裁决请求

请 LYL（作者 A）与 Bird（作者 B）就以下两项分别签署：

1. **拓扑**：① Workers 主线 / ② 境内 Node 源站 / ③ 混合（前端 Pages + API 境内）。
2. **路线**：A（受限，先不开账号）/ B（完整账号云档）。

签署后对应行动：选 B → 先落数据政策批准与 SMTP 实收验收；选 A → 先起草入口封锁规则与 SMTP 预检方案。无论 A/B，[P1-服务器初始化执行清单](P1-服务器初始化执行清单.md) §1–§3 可立即执行。

| 签署 | 拓扑 | 路线 | 日期 | 备注 |
| --- | --- | --- | --- | --- |
| LYL（作者 A） | | | | |
| Bird（作者 B） | | | | |

——AI 代理执行（LYL 授权）+ Bird 复核代理，2026-10-11。
