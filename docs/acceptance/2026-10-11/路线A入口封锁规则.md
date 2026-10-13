# 路线 A 入口封锁规则（边缘层，含批准记录）

生成：2026-10-11。依据：[环境方案手册 §配置冲突](../../九霄1.0环境方案-主索引与执行手册.md)（"若保留 A，先补一份经批准的入口封锁规则和 SMTP 预检方案"）与[部署路线A-B裁决材料](部署路线A-B裁决材料.md)（LYL 已签署"先 A 后 B"）。

## 0. 事实更正（影响路线 A 复杂度）

手册 2026-10-03 记录"compose 固定 `AUTH_ENABLED=true`"。**当前 main 的 [api-production.compose.yml](../../../deployment/api-production.compose.yml) 已改为环境变量插值 `AUTH_ENABLED: ${AUTH_ENABLED:-false}`（默认 false）**——该配置冲突已消解大半：路线 A 部署时 private env 显式 `AUTH_ENABLED=false`，账号路由在 API 层即不挂载（现有 fail-closed 行为）。本规则的边缘封锁保留为**第二道防线**，防 API 层配置失误或未来回归。

## 1. 封锁目标与非目标

**封锁（边缘层显式 404）**——账号**写入与凭据签发**端点（v2 名单，路由清单取自 [apps/api/src/routes](../../../apps/api/src/routes)）：

- `/api/auth/guest`、`/api/auth/code`、`/api/auth/guest/upgrade`、`/api/auth/refresh`、`/api/auth/logout`（游客建档、邮箱验证码、升级、会话轮换/吊销）
- `/api/auth/phone/*`（短信身份端点，全部）
- `/api/account/*`：`/api/account/capabilities`、`/api/account/export`、`/api/account/operation/{begin,verify,complete,cancel}`

**不封锁**：`/api/health`、`/api/ready`、`/api/games/*`（云档依赖会话，路线 A 下 API 层恒 `UNAUTHENTICATED` fail-closed；封锁它会在升级 B 时产生解除遗漏风险——升级 B 的解除步骤见 §4）；**v2 起亦不封锁只读诊断** `/api/auth/session`（auth 未挂载时 API notFound 兜底 404）与 `/api/auth/providers`（200，返回 provider 关闭状态）——保留 `api-production-smoke` 的 fail-closed 契约与运维诊断面。

**非目标**：不隐藏前端"账号与云档"入口本身（页面可达，显示不可用状态）；不改动 API 代码；不改 compose 语义（仅 private env 显式 `AUTH_ENABLED=false`）。

## 2. Caddy 层封锁（第一边缘）

[Caddyfile](../../../deployment/Caddyfile) 在 `reverse_proxy` 之前追加（**v2 名单**，修订原因见 §7）：

```caddyfile
# 自动 HTTPS（Let's Encrypt），反代 API 并保留认证所需头
api.jiuxiaogame.cn {
    encode zstd gzip

    # 回合请求体较大，放宽上限。
    # 注意：Caddyfile 的块起始 `{` 必须是该行最后一个 token，
    # 单行写法 `request_body { max_size 8MB }` 会被适配器拒绝：
    #   ERROR adapt/caddyfile: Unexpected next token after '{' on same line
    # 那个错误让 Caddy 启动即退出（exit 1）并反复重启，
    # 于是连 ACME 证书申请都不会开始，日志里只看得到 "Using config from file"。
    request_body {
        max_size 8MB
    }

    # Keep edge-generated errors and proxy responses private.
    header {
        >Cache-Control no-store
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options SAMEORIGIN
        Strict-Transport-Security max-age=31536000
    }

    # After one URI decode, a remaining percent or backslash is ambiguous to
    # downstream routers. Reject it rather than permitting nested decoding.
    @ambiguous path_regexp [%\\]
    respond @ambiguous 400

    # 路线 A 入口封锁 v2（2026-10-11 裁决，docs/acceptance/2026-10-11/路线A入口封锁规则.md）：
    # 账号写入/凭据签发端点在边缘显式 404（双防御第二层；第一层是 API 本身 AUTH_ENABLED=false）。
    # v2 修订：只读诊断端点 /api/auth/session（auth 未挂载时 API 自身 404）与 /api/auth/providers
    # 不封锁——保留 api-production-smoke 的 fail-closed 契约与状态诊断。
    # 升级路线 B 时删除本 @blocked 段并按文档 §5 走解除流程。
    @blocked {
        path /api/auth/guest /api/auth/guest/* /api/auth/code /api/auth/code/* /api/auth/refresh /api/auth/refresh/* /api/auth/logout /api/auth/logout/* /api/auth/phone /api/auth/phone/* /api/account /api/account/*
    }
    respond @blocked 404

    reverse_proxy api:8787 {
        header_up Host {host}
        header_up Origin {header.Origin}
        header_up Cookie {header.Cookie}
        # Direct API CORS is restricted to the public frontend origin. The
        # Pages same-origin relay does not depend on a reflected CORS header.
        header_down Access-Control-Allow-Origin https://play.jiuxiaogame.cn
        transport http {
            dial_timeout 5s
            response_header_timeout 180s
        }
    }
    handle_errors {
        header {
            Cache-Control no-store
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            X-Frame-Options SAMEORIGIN
            Strict-Transport-Security max-age=31536000
        }
        respond "" {http.error.status_code}
    }

}
```

## 3. Pages Function 中继层封锁（第二边缘）

前端 `/api` 经 Pages Function 中继到 API 源站（auth relay 提交 acc022a 已在链）。中继函数同步加同名单过滤（v2）：命中封锁名单直接返回 404 `ROUTE_A_BLOCKED`，不转发。双层封锁保证"直连 api.jiuxiaogame.cn"与"经 play.jiuxiaogame.cn 中继"两条路径都被覆盖。

## 4. 验收断言（部署后逐条执行并留证据）

| 断言 | 期望 |
| --- | --- |
| `curl -s -o /dev/null -w '%{http_code}' https://api.jiuxiaogame.cn/api/auth/guest` | 404（封锁） |
| `curl -X POST … https://api.jiuxiaogame.cn/api/auth/code` | 404（封锁） |
| `curl … https://api.jiuxiaogame.cn/api/account/capabilities` | 404（封锁） |
| `curl … https://play.jiuxiaogame.cn/api/auth/guest`（经中继） | 404（封锁） |
| `curl … https://api.jiuxiaogame.cn/api/auth/session` | 404（v2：auth 未挂载时 API notFound 兜底，不封锁但等效关闭） |
| `curl … https://api.jiuxiaogame.cn/api/auth/providers` | 200（v2：只读诊断保留，返回 provider 关闭状态） |
| `curl … https://api.jiuxiaogame.cn/api/health` 与 `/api/ready` | 200 |
| `curl -X POST … https://api.jiuxiaogame.cn/api/games`（无会话） | 503 `RULES_NOT_READY`（API 层 fail-closed 正常） |

验收可用 `SMOKE_ROUTE_A=1 node scripts/api-production-smoke.mjs`（v2 smoke，含封锁与 session 404 断言）+ 上表逐条 curl 留证；另断言：前端"账号与云档"页可达且显示不可用状态（不报 5xx）。

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
| 本封锁规则文本 | **✅ 已批准（2026-10-11，LYL+Bird 对话裁决："我和bird批准，请你执行文件1和文件2"）**；代码变更（Caddyfile + Pages Function 过滤）随执行 PR 落库，P2 部署时随边缘层一并生效 |
| 生效时点 | P2 部署时随 Caddyfile/中继函数一并上线 |

## 7. v2 修订记录（2026-10-11，P2 部署前契约核对）

**修订原因**：v1 名单（全量 `/api/auth/*`）与两份既有契约冲突——① `scripts/api-production-smoke.mjs` 期望 `/api/auth/session` 返回 401（auth 挂载但未认证的 fail-closed 证明）；② 路线 A 下 `AUTH_ENABLED=false` 时 `mountAuth` 不挂载，`/api/auth/session` 实际由 API notFound 兜底返回 404（[app.ts](../../../apps/api/src/app.ts) §58）。边缘封锁 session 只会把"接口不存在"与"被封锁"混在一层，损失诊断面，且与 smoke 契约打架。

**v2 名单**：只封锁**账号写入与凭据签发**端点（guest/code/guest-upgrade/refresh/logout/phone 全部 + account 全部）；只读诊断 `session`/`providers` 不封锁。封锁语义不变：路线 A 下无任何账号创建、邮件发送、会话签发路径可达（API 层第一道防线不挂载 + 边缘第二道防线 404 写端点）。

**配套代码变更**：Caddyfile、Pages Function 名单同步 v2；`api-production-smoke.mjs` 增加 `SMOKE_ROUTE_A=1` 变体（session 期望 404 + 封锁端点 404 断言），默认行为不变（CI 不受影响）。

——AI 代理执行（LYL 授权）+ Bird 复核代理，2026-10-11。

## 2026-10-13 工程加固记录

普通 Route A 被封锁路径继续为 404；存在残余编码或反斜杠的歧义路径可直接 400，两者均不转发。根 Pages middleware 覆盖未匹配到具体函数的 API 路径，_routes.json 同时包含 /api 与 /api/*。Caddy 固定允许 play origin、禁止缓存并覆盖上游故障。实际源码与 42 项本地运行验证见[恢复验收](../2026-10-13/环境方案恢复与模拟验收.md)。本记录不新增批准、不代表生产已应用修复。
