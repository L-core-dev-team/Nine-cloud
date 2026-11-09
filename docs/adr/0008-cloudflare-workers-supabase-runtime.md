# ADR 0008: Cloudflare Workers 与 Supabase 运行边界

- 状态：Accepted for implementation; production activation remains gated
- 日期：2026-10-06
- 决策依据：项目负责人明确选择“Cloudflare Workers + Supabase”，由 Worker 运行 Hono API，Supabase 提供 Auth 与 PostgreSQL
- Supersedes：ADR 0007 第 7 条所记的 Node API 运行时选择；ADR 0007 的身份映射、稳定 owner、邮箱/手机号范围、隐私和删除门禁继续有效

## 决策

1. Cloudflare Worker 是网站 Hono API 的目标运行时。网站沿用同源入口 `https://play.jiuxiaogame.cn/api/*`；Worker 只接管 API 与健康路径。根页面和静态资源继续由现有网站托管提供，不创建没有实际源站的 `api.jiuxiaogame.cn`。
2. Supabase Auth 负责邮箱/手机号 OTP 凭据校验；Supabase PostgreSQL 保存现有 Hono 业务表。Worker 使用 Hyperdrive 与数据库直连，驱动沿用 `pg`。浏览器不持有 Supabase secret，也不把 Supabase token 当作游戏 `owner_id`。
3. Hono 继续签发可吊销的 HttpOnly 会话 Cookie；映射到既有 `auth_accounts.id` 的规则不变。Cloudflare Worker 的部署与 Supabase Auth、数据库迁移是三个独立状态，任何一个成功都不能代替另外两个。
4. 认证开关缺省关闭。未提供 Hyperdrive、身份服务凭据、已核准 HTTPS 隐私政策和正式迁移时，Worker 不开放账户路由。短信保持关闭，预算和额度仍须单独签收。
5. 当前 Worker 适配器覆盖认证、账户与云档 API；尚未把经过作者批准的游戏规则运行包编译进 Worker。上线前必须完成规则包与回合路由的兼容实现，并证明 `RULES_NOT_READY` 等 fail-closed 行为一致。当前配置不得切换线上 `/api/*` 流量。

## 邮件发送

- 登录验证码由 Supabase Auth 触发。当前优先邮件供应商为 Resend：Supabase Auth 直接连接其 SMTP（`smtp.resend.com:465`、用户名 `resend`、密码为 Resend API key），不经过 Worker 或 Nodemailer。SendGrid 可替换 Resend，凭据只在 Supabase Auth SMTP 设置中维护。
- Worker 发出的邮箱变更、关闭等业务邮件通过 HTTPS 调用 Resend Email API。`AUTH_MAIL_PROVIDER=sendgrid` 时可切换到 SendGrid Mail Send API。API 凭据作为 Worker secret，永不写入 Wrangler 明文变量或浏览器包。Worker 不用 Nodemailer 建立 SMTP 连接。
- Nodemailer 是 Node.js 邮件客户端/传输组件，不是托管投递服务，也不会单独提供 SMTP 主机、发件信誉或免费额度。现有 Node API 可通过 Nodemailer 连接 Resend、SendGrid 或其他真实 SMTP 服务；它不能替代供应商。Supabase Auth 自己可以直接连接供应商 SMTP。
- 按当前公开价格，Resend Free 为每月 3,000 封、每日 100 封；SendGrid 新直注册账号是 60 天试用，每日最多 100 封，试用结束后若无付费计划将停止发送。免费额度、资格和限制可能变化；选定供应商后仍需核对账号仪表板实际套餐。Resend 因有公开的持续免费配额而作为默认候选。
- 本 ADR 不授权购买/升级计划或开通付费服务。Supabase 默认邮件服务不能作为面向公众的低成本生产发送方案；必须配置自有邮件供应商 SMTP，并验证域名 SPF、DKIM、DMARC 与真实收件箱投递。

## 部署门禁

1. 以 `apps/api/wrangler.jsonc` 为配置源；Hyperdrive ID 目前是不可部署的占位值。先创建专用数据库角色和 Hyperdrive 配置，再通过密钥管理配置连接信息，不把 DSN 或密码写入仓库。
2. 备份并核对 Supabase 项目 ref 后，按数据库迁移清单应用 Hono 业务表迁移；Supabase Auth 邮箱设置与 Hono 业务表迁移不是同一操作。
3. 在 Resend 或经负责人选择的 SendGrid 完成 `jiuxiaogame.cn` 发件域名验证及 SPF/DKIM/DMARC 检查；分别配置 Supabase Auth SMTP 和 Worker 邮件 API secret。验证真实收件箱投递后才允许打开邮箱 OTP。
4. 生产 secrets、隐私政策正文、数据保留期限、短信预算、规则包和 Worker 路由须逐项审查。`wrangler deploy`、`wrangler secret put`、DNS/路由更改和 Supabase 生产迁移均属于远端写操作，不由本 ADR 自动执行。
5. 新 Worker 完成 API 路由与网站资源路径的预览验收后，才可把线上路由从现有实现切换到 Worker。若回滚，须核对数据库迁移向前兼容性；Worker 代码回滚不回滚 Supabase 数据。

## 当前实现状态

- 新增 `apps/api/src/worker.ts`、`apps/api/wrangler.jsonc`、Worker 类型生成入口和部署说明。
- Worker 生命周期邮件适配已接 Resend 与 SendGrid HTTPS API，默认 Resend；Supabase 登录 OTP 的 SMTP 仍须在 Supabase Auth 设置中配置。Node API 的 Nodemailer 只用于连接 SMTP 服务。
- Hyperdrive ID 保持占位值；Auth 默认关闭；没有创建 Hyperdrive、邮件域、secret、生产路由或数据库迁移。
- `apps/api` TypeScript 检查通过；Wrangler 本地 dry-run 成功打包约 1.16 MB（gzip 约 202 KB）。没有运行测试或执行远端写操作。
- Worker 尚未实现玩法规则运行时。因此，代码准备与生产 API 上线必须分开报告。

## 参考资料（MLA）

1. Resend. “Pricing.” *Resend*, [resend.com/pricing](https://www.resend.com/pricing?product=transactional). Accessed 6 Oct. 2026.
2. Resend. “SMTP Service.” *Resend*, [resend.com/docs/send-with-smtp](https://resend.com/docs/send-with-smtp). Accessed 6 Oct. 2026.
3. Resend. “Send an Email.” *Resend API Reference*, [resend.com/docs/api-reference/emails/send-email](https://resend.com/docs/api-reference/emails/send-email). Accessed 6 Oct. 2026.
4. Twilio SendGrid. “Trial Account Plan.” *SendGrid Support*, [support.sendgrid.com/hc/en-us/articles/35270136965403](https://support.sendgrid.com/hc/en-us/articles/35270136965403-Twilio-SendGrid-Trial-Account-Plan). Accessed 6 Oct. 2026.
5. Supabase. “Send Emails with Custom SMTP.” *Supabase Docs*, [supabase.com/docs/guides/auth/auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp). Accessed 6 Oct. 2026.
6. Nodemailer. “SMTP Transport.” *Nodemailer*, [nodemailer.com/smtp](https://nodemailer.com/smtp). Accessed 6 Oct. 2026.
7. Cloudflare. “Supabase.” *Cloudflare Workers Docs*, [developers.cloudflare.com/workers/databases/third-party-integrations/supabase](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/). Accessed 6 Oct. 2026.

## 2026-10-13 后续运行路线说明

本 ADR 保留 2026-10-06 的实现决策与身份安全边界。后续 [2026-10-11 现场裁决](../acceptance/2026-10-11/部署路线A-B裁决材料.md)记录 LYL 选择 Pages + 境内 Node API，先 A 后 B；Bird 总路线复核仍待记录。当前部署执行说明以该后续裁决及 deployment/README.md 为准，Worker 仍是未接管完整玩法的候选实现。本文不新增批准、不代签、不代表任何生产切换已执行。
