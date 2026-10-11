# 路线 A 入口封锁规则（边缘层，含批准记录）

生成：2026-10-11。依据：[环境方案手册 §配置冲突](../../九霄1.0环境方案-主索引与执行手册.md)（"若保留 A，先补一份经批准的入口封锁规则和 SMTP 预检方案"）与[部署路线A-B裁决材料](部署路线A-B裁决材料.md)（LYL 已签署"先 A 后 B"）。

## 0. 事实更正（影响路线 A 复杂度）

手册 2026-10-03 记录"compose 固定 `AUTH_ENABLED=true`"。**当前 main 的 [api-production.compose.yml](../../../deployment/api-production.compose.yml) 已改为环境变量插值 `AUTH_ENABLED: ${AUTH_ENABLED:-false}`（默认 false）**——该配置冲突已消解大半：路线 A 部署时 private env 显式 `AUTH_ENABLED=false`，账号路由在 API 层即不挂载（现有 fail-closed 行为）。本规则的边缘封锁保留为**第二道防线**，防 API 层配置失误或未来回归。

## 1. 封锁目标与非目标

**封锁（边缘层显式 404）**——账号与身份端点，路由清单取自 [apps/api/src/routes](../../../apps/api/src/routes)：

- `/api/auth/*`：`/api/auth/providers`、`/api/auth/guest`、`/api/auth/code`、`/api/auth/guest/upgrade`、`/api/auth/session`、`/api/auth/refresh`、`/api/auth/logout`（及 supabase-auth 的 `/api/auth/phone/*`）
- `/api/account/*`：`/api/account/capabilities`、`/api/account/export`、`/api/account/operation/{begin,verify,complete,cancel}`

**不封锁**：`/api/health`、`/api/ready`、`/api/games/*`（云档依赖会话，路线 A 下 API 层恒 `UNAUTHENTICATED` fail-closed；封锁它会在升级 B 时产生解除遗漏风险——升级 B 的解除步骤见 §4）。

**非目标**：不隐藏前端"账号与云档"入口本身（页面可达，显示不可用状态）；不改动 API 代码；不改 compose 语义（仅 private env 显式 `AUTH_ENABLED=false`）。

## 2. Caddy 层封锁（第一边缘）

[Caddyfile](../../../deployment/Caddyfile) 在 `reverse_proxy` 之前追加：

```caddyfile
api.jiuxiaogame.cn {
    encode zstd gzip
    request_body {
        max_size 8MB
    }

    # 路线 A 入口封锁（2026-10-11 裁决）：账号与身份端点显式 404。
    # 升级路线 B 时删除本 @blocked 段并保留本文件历史记录。
    @blocked {
        path /api/auth/* /api/account/*
    }
    respond @blocked 404

    reverse_proxy api:8787 {
        header_up Host {host}
        header_up Origin {header.Origin}
        header_up Cookie {header.Cookie}
        header_down Access-Control-Allow-Origin {header.Origin}
    }
}
```

## 3. Pages Function 中继层封锁（第二边缘）

前端 `/api` 经 Pages Function 中继到 API 源站（auth relay 提交 acc022a 已在链）。中继函数同步加同名单过滤：命中 `/api/auth/*`、`/api/account/*` 直接返回 404，不转发。双层封锁保证"直连 api.jiuxiaogame.cn"与"经 play.jiuxiaogame.cn 中继"两条路径都被覆盖。

## 4. 验收断言（部署后逐条执行并留证据）

| 断言 | 期望 |
| --- | --- |
| `curl -s -o /dev/null -w '%{http_code}' https://api.jiuxiaogame.cn/api/auth/providers` | 404 |
| `curl … https://api.jiuxiaogame.cn/api/account/capabilities` | 404 |
| `curl … https://play.jiuxiaogame.cn/api/auth/providers`（经中继） | 404 |
| `curl … https://api.jiuxiaogame.cn/api/health` 与 `/api/ready` | 200 |
| `curl -X POST … https://api.jiuxiaogame.cn/api/games`（无会话） | 503 `RULES_NOT_READY` 或 401（API 层 fail-closed 正常） |
| 前端"账号与云档"页 | 可达且显示不可用状态（不报 5xx） |

证据归档：`docs/acceptance/[上线日]/路线A封锁验收/`（curl 输出 + 截图）。

## 5. 升级路线 B 的解除步骤（防止遗漏）

1. 路线 B 数据政策批准 + 真实邮件验收完成（[邮件发信预检方案](路线A邮件发信预检方案-SES-API.md)）。
2. 撤销 Caddy `@blocked` 段与 Pages Function 过滤（各自提交留痕）。
3. private env 改 `AUTH_ENABLED=true` + 补 Supabase/SMTP 与隐私政策字段，重启并跑 `scripts/api-production-smoke.mjs`。
4. 本文档追加"已解除 + 日期"记录；两份封锁相关文件保留为历史。

## 6. 批准记录

| 项 | 状态 |
| --- | --- |
| 路线裁决（先 A 后 B） | LYL 已签（2026-10-11 对话裁决，见裁决材料）；Bird 待复核 |
| 本封锁规则文本 | 已按裁决起草；**部署前需 LYL+Bird 批准留痕** |
| 生效时点 | P2 部署时随 Caddyfile/中继函数一并上线 |

——AI 代理执行（LYL 授权）+ Bird 复核代理，2026-10-11。
