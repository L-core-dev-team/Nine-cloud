# Cloudflare Workers + Supabase 部署准备

**当前状态：未部署，不能接管线上 `/api/*`。** 本文对应 ADR 0008。它记录的是目标运行方案和待办顺序，不是部署回执。

## 仓库已准备的部分

- Hono Worker 入口：`apps/api/src/worker.ts`。
- Wrangler 配置：`apps/api/wrangler.jsonc`，包括 `play.jiuxiaogame.cn/api/*`、`/health`、`/ready` 路由。
- Hono 已有 Supabase Auth、账户生命周期与云档服务适配代码。
- Worker 的 Auth 默认关闭；Hyperdrive ID 是占位值；没有写入 Cloudflare 或 Supabase 生产配置。

## 上线前阻塞项

1. **规则运行时尚未移植。** Worker 目前没有完整玩法回合/游戏路由。不得接管全量 `/api/*`，否则现有玩法 API 会缺失。将经过授权的规则模块打包进 Worker，并完成完整 API 路由预览验收后再切换。
2. **Hyperdrive 尚未创建。** 在 Supabase 项目中准备最小权限数据库角色，确认直连数据库地址与访问策略，再创建 Hyperdrive 并将真实 ID 写入 Wrangler 配置。不得把数据库 URI、密码或 Supabase secret 写入 Git。
3. **业务表迁移未应用。** 先确认项目 ref 与数据库备份，再运行只读身份冲突预检；按项目迁移流程应用 `packages/db/drizzle/0016_supabase_external_identity.sql` 及前置迁移。另有 Supabase SMS 预算迁移，它不应在短信仍关闭时被误认为已部署。
4. **邮件服务仍未开通。** 当前默认候选是 Resend。先验证 `jiuxiaogame.cn` 发件域名，完成 SPF/DKIM/DMARC，再在 Supabase Auth 中配置 Resend SMTP：`smtp.resend.com`、端口 `465`、TLS、用户名 `resend`、密码为 API key。随后向多个真实邮箱验证 OTP。SendGrid 是可替代供应商，但新账号免费发送仅为 60 天试用，之后需付费套餐。
5. **Worker 邮件密钥仍缺失。** Worker 通过 HTTPS Email API 发邮箱变更、账号关闭等业务邮件。默认 `AUTH_MAIL_PROVIDER=resend`，需在 Cloudflare secret store 中配置 `RESEND_API_KEY`；切换 SendGrid 时设 `AUTH_MAIL_PROVIDER=sendgrid` 并配置 `SENDGRID_API_KEY`。密钥不能放 `wrangler.jsonc` 明文变量、Supabase 前端配置或 Git。邮件被 API 接受不等于送达。
6. **生产密钥和法律文本缺失。** 在 Cloudflare secret store 中设置 `AUTH_SECRET`、`AUTH_IDENTITY_HMAC_SECRET`、`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`AUTH_PUBLIC_ORIGIN`、已核准的隐私政策 URL/版号和数据政策 JSON。确认生产环境没有开启 SMS 或账号删除开关。
7. **路由切换尚未验收。** 预览验证 API 路径、Cookie、错误码、同源静态页面、移动 Safari、数据库失败、邮件失败和回滚。只有检查成功后才可通过 Wrangler 将路由绑定至生产 Worker。

## 邮件服务与客户端

Resend 和 SendGrid 提供托管 SMTP/API。当前 Worker 支持通过 HTTPS API 调用这两家，默认选 Resend。Supabase Auth 直接使用邮件供应商的 SMTP，不经过 Worker。Resend 公布的 Free 额度为每月 3,000 封且每天最多 100 封；SendGrid 新账号是 60 天、每天最多 100 封的试用，试用过后不升级就停止发送。额度和资格应以实际供应商账户为准。

Nodemailer 是 Node.js 邮件客户端库，不是邮件服务。Node API 可用它连接 Resend、SendGrid 或自建 SMTP；Worker 版不运行 Nodemailer，而是用 `fetch` 调邮件服务的 HTTPS API。若要把 Nodemailer 用作完整自托管方案，还需另行运营 SMTP 发信基础设施、域名信誉、退信和滥用处理，这不是仓库当前的部署方式。

登录 OTP 与账户生命周期邮件是两个投递路径：Supabase Auth SMTP 负责登录/恢复；Worker API 负责已登录后的邮箱变更和账户生命周期验证。两条路径都要实收验收。

## 明确禁止的状态混淆

- `wrangler types` 或本地 dry-run 成功，不代表资源已创建或已上线。
- Supabase 项目健康，不代表业务表迁移、SMTP 或 Auth 发送已完成。
- 邮件被服务商接受，不代表用户收件箱收到；需要真实 OTP 收件与验证记录。
- Worker 代码部署，不代表现有玩法 API、移动浏览器和回滚流程已验收。
