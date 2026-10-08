# ADR 0007：在线账号与 Supabase 身份源

- 状态：Accepted for implementation; production activation remains gated
- 日期：2026-10-06
- 决策依据：项目负责人要求完成登录体系工程，并明确 Supabase 是后端

## 背景

ADR 0005 默认关闭在线账号。网站现有 Hono API 已实现邮箱 OTP、不透明会话 Cookie、账户生命周期和云档 owner 隔离。Supabase 项目已创建，但 Auth、应用表和网站接入此前尚未完成。Supabase 项目 API URL 不会托管现有 Hono 进程。

## 决策

1. 1.0 在线账号与云档进入工程实现。Supabase Auth 是邮箱/手机 OTP 的凭据验证源；现有 Hono 是网站 API 和短期可撤销会话的边界。Supabase Auth access/refresh token 只用于一次性服务端校验，不返回浏览器持久化，不写入本地存储。
2. Hono 继续为每个登录账户签发现有 `HttpOnly; Secure; SameSite=Strict` 会话 Cookie。Supabase 身份必须映射到现有 `auth_accounts.id`；不得以 Supabase UUID 重建 owner 或迁移存档。
3. 首期只做邮箱 OTP 和已绑定手机号 OTP。新账户先用已验证邮箱建立可恢复账户；手机号只能绑定到当前已认证账户后作为替代登录方式。短信用户不得绕过邮箱恢复身份要求。
4. Passkey 延后至独立阶段。Supabase 当前将 Passkey API 标为 experimental，必须等依赖版本、设备兼容、恢复和注销流程验证后再开放。密码、微信及其他 OAuth 不在此 ADR 范围内。
5. Supabase 使用项目默认 `*.supabase.co` API URL；不购买自定义域，不创建没有实际 Hono 源站的 `api.jiuxiaogame.cn` 记录。
6. SMS 的默认月度现金预算和发送额度均为 0。只有在国家/地区、短信签名/模板、供应商密钥、月预算、月发送上限及 Turnstile/提供方滥用限制均配置并核验后，才允许设置为非零。不得自动购买或续购套餐。
7. Hono API 仍需独立 Node 运行环境，并连接已迁移的 PostgreSQL。Supabase Auth 与数据库本身不等于 Hono 运行时或已上线 API。

## 身份映射与冲突规则

- 邮箱必须由 Supabase Auth 标记为已验证后，才能映射到相同规范化邮箱的既有账户；没有匹配账户时，保留旧账户模型，以该邮箱创建新的稳定 owner ID。
- 手机号必须完成新鲜 OTP 验证，并在已有 Hono 会话中显式绑定。手机号首次登录不自动创建 owner，也不按相同号码自动合并账户。
- Supabase subject 与已验证身份摘要写入独立映射表。身份冲突返回通用错误，不自动合并两个 owner。
- 修改或删除账户继续受现有 Hono 生命周期、数据政策和删除门禁约束。Supabase 用户记录和本地 owner 数据必须由同一受控操作保持一致；在同步流程完成前，不开放直接解绑最后一个恢复身份的路径。

## 安全与运行边界

- 浏览器只使用 Supabase publishable key。service-role/secret key、SMTP 凭据、Tencent Cloud 凭据和 SMS Hook 签名密钥只放在服务端密钥库。
- Supabase Send SMS Hook 在 Tencent Cloud 发送前执行来源签名验证、地区 allowlist、按号码和全站频率限制、月度额度/预算原子预留；任何配置缺失、预算为 0 或 RPC/供应商失败均 fail closed。
- Hook 不记录验证码、完整手机号、Cookie 或 provider token。
- 不将 Supabase Auth、Hono 和前端状态三者中的任意一个未经验证直接当作 `owner_id`。

## 验收条件

- 现有邮箱账户映射后 owner ID 和云档归属不变；未知/冲突身份不串档。
- OTP、一次性验证、Hono Cookie、刷新、退出吊销、关闭账户恢复和导出流程完成端到端验收。
- 手机号仅能在现有账户中绑定；短信 Hook 的签名错误、重复请求、限额、预算耗尽、地区不支持和供应商故障均不发信。
- 生产 SMTP、Supabase Auth 提供方配置、数据库迁移、Hono 运行环境和公开隐私政策均经实际验证后，才可启用真实用户。

## 后续事项

本 ADR 不批准短信付费额度，不证明 SMTP、腾讯云签名/模板、Turnstile 或生产 Hono 已配置，也不授权本次修改自动部署或推送 GitHub。

## 参考资料（MLA）

1. Supabase. “Send SMS Hook.” *Supabase Docs*, [supabase.com/docs/guides/auth/auth-hooks/send-sms-hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook). Accessed 6 Oct. 2026.
2. Supabase. “Auth Hooks.” *Supabase Docs*, [supabase.com/docs/guides/auth/auth-hooks](https://supabase.com/docs/guides/auth/auth-hooks). Accessed 6 Oct. 2026.
3. Supabase. “Passkey Authentication.” *Supabase Docs*, [supabase.com/docs/guides/auth/passkeys](https://supabase.com/docs/guides/auth/passkeys). Accessed 6 Oct. 2026.
4. Supabase. “Send Emails with Custom SMTP.” *Supabase Docs*, [supabase.com/docs/guides/auth/auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp). Accessed 6 Oct. 2026.
