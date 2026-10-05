# Cloudflare 纯免费全家桶：邮箱账号登录与生产化实施计划

> 日期：2026-10-03 · v3（纯 Cloudflare 免费版）· 用户决策：渐进式、有账户无域名、**全套免费、功能落在 Cloudflare 上**

## 一、摘要

**API 与前端全部跑在 Cloudflare Workers 免费计划上**，实现邮箱账号登录与生产化：

- **前端**：Worker 静态资产托管 `apps/web/dist`（SPA fallback）——资产请求免费不限量
- **API**：同一个 Worker 免费计划跑 Hono（`nodejs_compat`），`/api/*` 同源
- **数据库**：Neon 免费层 PostgreSQL 17，`pg` 直连（不走付费 Hyperdrive）——S 轨全部 PG 代码**零重写**
- **邮件**：Resend 免费层（100 封/天）**REST API transport**（约 60 行新代码，`fetch` 实现，避开 Worker 上 SMTP socket 的不确定性）；Brevo 300/天 为备胎；未来升级 Workers Paid（$5/月）后一行切 CF Email Sending（3000 封/月）
- **Turnstile**（免费）：`/api/auth/code` 防滥用
- **密钥库**：wrangler secrets（`wrangler secret put`）
- **收件**：Email Routing 免费——`support@<域名>` 转发你的邮箱

**两个硬事实（不可回避，如实说明）**：
1. **域名是唯一绕不开的成本**（~¥10-60/年）：无自有域名则 Resend/任何服务商都配不了 SPF/DKIM 发件域，验证码邮件发不了。
2. Workers 免费计划限制 = **10ms CPU/请求 + 10 万次/天调用** + 无 Hyperdrive（冷连接 ~0.4-0.7s、Neon autosuspend 首查 ~0.5s）。回合制游戏的请求频度与 CPU 用量（Hono+pg+zod 单请求实测通常 <10ms）大概率够用，但**放行门 = 真实部署实测**；若超限，回退方案见附录（CloudBase 承载 Node API，其余不变）。

## 二、现状（已勘察核实）

| 维度 | 现状 | 位置 |
| --- | --- | --- |
| API | `@hono/node-server` 8787，`DATABASE_URL` 必填；`app` 已是可独立 fetch 的 Hono 实例 | `apps/api/src/index.ts:4,18-26` |
| 邮件 | nodemailer + `SMTP_URL`；`auth-runtime.ts:32-44` 注入 sender | 同左 |
| 部署 | 仅 Docker+compose+CI，无云端配置 | `apps/api/Dockerfile` |
| 前端 | 相对 `/api` + `credentials:'include'` 同源假设 | `apps/web/src/cloud-sync.ts:117-132` |
| Cookie/Origin | https 自动 `Secure`；`/api/*` 全量 Origin 精确匹配 | `apps/api/src/routes/auth.ts:6-42` |
| PG 硬依赖 | advisory lock/FOR UPDATE/JSONB/interval → 必须保留真 PG（Neon），不可 D1 | `postgres-*.ts` 各处 |
| env 注入 | `AUTH_ENABLED`/`AUTH_SECRET` 等已参数化（auth-runtime.ts:14-24）——Worker `env` 可直插 | 同左 |

## 三、免费能力核实（2026-10）

| 能力 | 免费计划 | 用途 |
| --- | --- | --- |
| Workers 静态资产 | 资产请求免费不限量 | 前端托管 |
| Workers 调用 | 10 万次/天、10ms CPU/请求 | API |
| `nodejs_compat` + TCP sockets | ✅ 免费可用（`pg` 官方支持路径） | Neon 连接 |
| Hyperdrive | ❌ 仅付费 | 不用；直连 Neon |
| Email Sending | ❌ 发任意收件人仅付费（Paid 含 3000/月） | 用 Resend 顶替 |
| Email Routing / Turnstile / Web Analytics | ✅ 免费 | 收件/防滥用/统计 |
| Neon 免费层 | ✅ 0.5GB、autosuspend | PG 落点 |
| Resend / Brevo 免费层 | ✅ 100/天、300/天（需域名验证） | 发件 |

## 四、目标架构

```
玩家 ──HTTPS──▶ 一个 Cloudflare Worker（免费，自定义域 jiuxiao.<域名>）
                 ├─ assets: apps/web/dist（SPA fallback，免费不限量）
                 └─ /api/* → Hono app.fetch（worker.ts 入口，nodejs_compat）
                      ├─ pg.Pool(max:2) ──TCP──▶ Neon PG 17（免费层，sslmode=require）
                      ├─ Resend REST API（fetch）发验证码（MAIL_TRANSPORT=resend）
                      ├─ Turnstile siteverify（fetch，可选启用）
                      └─ secrets: AUTH_SECRET / DATABASE_URL / RESEND_API_KEY / TURNSTILE_SECRET
本地开发：docker-compose（mailpit+pg）+ Node 入口 —— 原样保留（SMTP transport 路径不变）
未来升级：Workers Paid 后 SMTP_URL 切 CF Email Sending；或加 Hyperdrive 优化连接
```

## 五、实施步骤（文件级）

### 阶段 0：资源准备（控制台手动）
1. 注册/转入域名 → Cloudflare DNS（免费）。
2. Neon 建库（区域建议 Singapore；数据地区由运营主体确认）→ 连接串 `?sslmode=require`。
3. Resend 注册 + 域名验证（CF DNS 加 SPF/DKIM 记录）→ API Key；Brevo 备胎同理。
4. Turnstile 站点 → site key + secret。
5. Email Routing：`support@<域名>` 转发邮箱。

### 阶段 1：邮件 transport（新增代码，~60 行）
- 新增 `apps/api/src/services/resend-email-transport.ts`：`sendMail({to,subject,text})` → `POST https://api.resend.com/emails`（fetch，`Authorization: Bearer RESEND_API_KEY`，`from=九霄 <noreply@域名>`）。
- `auth-runtime.ts:32-36`：按 `MAIL_TRANSPORT=resend|smtp` 选择 transport（默认 smtp 不变——本地 Docker 行为零变化）。
- Brevo 备胎同一接口换 host/key（~10 行差异）。

### 阶段 2：Workers 化 API
1. 新增 `apps/api/wrangler.jsonc`：`main: src/worker.ts`、`compatibility_date: "2026-10-01"`（自动 nodejs_compat）、`assets: { directory: "../web/dist", not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`、自定义域路由、`vars`（NODE_ENV/AUTH_COOKIE_SAME_SITE=strict/MAIL_TRANSPORT=resend 等非敏感项）。
2. 新增 `apps/api/src/worker.ts`（~40 行）：装配函数复用——把 `index.ts` 的「读 env + 建 Pool + createApp」抽成 `createApi(config)`；`worker.ts` 传 `env`（`DATABASE_URL` 从 secret 读，Pool `max: 2`、`connectionTimeoutMillis: 5000`）。**不改任何业务逻辑与 SQL。**
3. `apps/api/package.json`：`"deploy": "wrangler deploy"`、`"dev:cf": "wrangler dev --remote"`。
4. 迁移：本地 `DATABASE_URL=<Neon串> pnpm --filter @jiuxiao/db db:migrate`。
5. **放行门（关键）**：`wrangler dev --remote` 实测——登录全链路（发码/验证/会话/云档/注销）每步 CPU 用量与 P95 延迟；若 10ms CPU 超限 → 执行附录回退。

### 阶段 3：验证与演练（EXT-01 留证）
1. `pnpm typecheck && pnpm test` 全绿（SEC-01~10 基线）。
2. Resend 真发验证码 → 登录 → 会话 7 天 → 双账号云档 → 注销擦除 → Neon 上 SEC-01 触发器生效确认。
3. Turnstile：未配置行为不变；配置后无 token 4xx。
4. HTTPS/Origin 演练、迁移重放幂等、`AUTH_SECRET` 轮换演练（未用验证码失效，记录影响）、`wrangler rollback` 回滚。
5. 部署 SHA/迁移版本/策略版本记录 → 回填 S 轨清单 EXT-01 行与全缺口验收表。

### 阶段 4：Turnstile 前端（可选增强）
- 前端登录面板按 `VITE_TURNSTILE_SITE_KEY` 渲染 widget；`POST /api/auth/code` 附 `cf-turnstile-response`。约 80 行 + 测试。

### 附录：回退方案（若免费 Workers 实测超限）
- API 回 CloudBase 云托管（现有 Dockerfile 直接用，Node 原生跑 pg/SMTP 全兼容），前端仍留 CF 静态资产，`/api` 跨子域 `SameSite=None`（auth.ts:20 已支持）或加一个 30 行免费 Worker 反代实现同源。其余步骤（Neon/Resend/Turnstile/secrets）完全不变。

## 六、成本与风险

| 项 | 费用 | 说明 |
| --- | --- | --- |
| 域名 | ¥10~60/年 | **唯一硬成本**（无域名无法配发件域） |
| Workers/资产/Turnstile/Email Routing | 0 | 10 万次调用/天、资产不限 |
| Neon | 0 | 0.5GB、autosuspend 冷启动 ~0.5s（首轮登录慢，属预期） |
| Resend | 0（100/天） | 验证码量（≤6/h/邮箱、60/h/IP 限流后）远够 |
| **Workers 免费三风险** | — | ①10ms CPU/请求（放行门实测）②无连接池托管（Pool max:2 + Neon pooled 端口缓解）③冷启动隔离桶；超限即走附录回退，所有其他投入不浪费 |
| 数据出境合规 | — | Neon 区域 + 大陆访问 CF 延迟：运营主体决定项（EXT-01） |

## 七、假设与决策记录

- 纯 Cloudflare 免费计划承载全部运行时；CloudBase 仅作回退附录（v2 混合方案废弃）。
- 域名为唯一硬成本，名称属运营决定（EXT-01），计划不含代选。
- 保留 Node 入口与 Docker 本地开发（SMTP transport 默认路径不变）；业务逻辑与 S 轨已签代码零改动。
- 慢回合（`requestNarrative`）为 IO 等待不计 CPU；若 wall 时间体验差，后续可用 Queues/Durable Objects（免费额度）异步化——不在本期。
