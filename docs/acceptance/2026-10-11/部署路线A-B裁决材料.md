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

## 4. 裁决结果（2026-10-11，对话裁决记录）

**LYL（作者 A）已于本日对话中明确签署**：**拓扑 ③ 混合（前端 Cloudflare Pages + API 境内腾讯云源站）+ 路线"先 A 后 B"（先不开在线账号快速上线，满足公安联网备案"网站先上线后审查"的前置要求；B 的数据政策与真实邮件验收并行准备，备案通过后另行裁决是否升级 B）**。Bird（作者 B）复核签署保持开放，本记录如实标注、不代签；按项目纪律，LYL 签署授权执行，Bird 复核可后续补充。

**裁决落地含义**：
1. **拓扑 ③**：前端维持 Cloudflare Pages（`play.jiuxiaogame.cn` 生产入口，/api 经 Pages Function 中继——仓库已有 auth relay 提交）；API 以 Docker Compose + Caddy 部署于 `jiuxiao-api`（182.254.211.228），`api.jiuxiaogame.cn` 已指向。跨域 Cookie/CORS 验证列入 P2 清单。
2. **路线 A 首步（P2 前置件）**：起草**入口封锁规则**（Caddy/边缘层显式阻断账号端点，非"隐藏前端按钮"）+ **SMTP 预检方案**，两份按手册要求留批准记录后再启动 P2 部署。
3. **并行件**：数据政策（`ACCOUNT_DATA_POLICY`）与真实邮件验收按路线 B 需求准备，不阻塞路线 A 上线。
4. **公安联网备案依赖（2026-10-11 部署负责人澄清）**：备案审查以**网站已部署上线、内容可访问**为前提——部署顺序由此确定为"合规上线 → 提交公安备案"，与"先 A 后 B"天然一致。
5. `RULES_NOT_READY` 保持 fail-closed：路线 A 上线的网站中行动结算仍关闭，这是诚实状态。

| 签署 | 拓扑 | 路线 | 日期 | 备注 |
| --- | --- | --- | --- | --- |
| LYL（作者 A） | ③ 混合 | 先 A 后 B | 2026-10-11 | 对话裁决，本记录为准 |
| Bird（作者 B） | —（待复核） | —（待复核） | — | 不代签；复核后补签 |

——AI 代理执行（LYL 授权）+ Bird 复核代理，2026-10-11。
