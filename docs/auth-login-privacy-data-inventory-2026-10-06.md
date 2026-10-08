# 登录工程隐私数据流盘点（内部草稿）

- 日期：2026-10-06
- 状态：依据当前代码记录；不是对外隐私政策、法律意见或上线批准
- 用途：为真实运营主体补齐隐私告知、数据处理协议、保留期限和删除流程提供字段清单

## 已能从代码确认的数据流

| 数据 | 代码用途 | 当前持有方/落点 | 可确认的最小化措施 | 尚未核实 |
|---|---|---|---|---|
| 邮箱 OTP | 邮箱登录、恢复、账号生命周期验证 | Supabase Auth 接收登录 OTP；Hono SMTP 发送邮箱变更、关闭等操作码；主业务 PostgreSQL 保存账号邮箱 | OTP 不进入应用日志；Hono 账户操作码只保存 HMAC 摘要 | Supabase 与 Hono SMTP 的真实服务主体、实际区域、供应商日志保留、发件域及数据处理合同 |
| 手机号 OTP | 只为已有邮箱账户绑定或登录 | Supabase Auth 保存手机号；Send SMS Hook 将号码和 OTP 交给腾讯云短信 API；业务库只保存 HMAC 摘要映射 | Hook 不输出明文号码或 OTP；无签名、CAPTCHA、地区、限额或预算配置时失败关闭 | Tencent 主体/合同角色、签名模板、允许地区、资质审核、真实单价和运营商留存 |
| Supabase Auth subject | 将邮箱/手机号凭据映射至原 Hono owner；邮箱改动、手机号解绑及账号删除时调用 Auth Admin API | `auth_external_identities.provider_subject`；`SUPABASE_SECRET_KEY` 仅供服务端请求 Admin API | subject 不作为云档 owner；owner 仍是原 `auth_accounts.id`；API 不把 secret key 返回客户端 | Admin API 调用、权限范围、密钥轮换、线上失败补偿和真实远端删除均待配置/验收 |
| Session Cookie | 网站请求认证及撤销 | 浏览器 HttpOnly Cookie；Hono `auth_sessions` 保存 token 哈希和失效时间 | 令牌本身不进数据库；当前 Cookie 为 HttpOnly，生产环境 Secure | 代理/CDN/主机访问日志是否记录 Cookie；必须检查其日志脱敏配置 |
| 来源 IP / 内部账号频控 | 认证请求频控 | Hono `auth_provider_ip_limits` 与 `auth_provider_account_limits` 保存 HMAC 摘要，不保存原始 IP 或原始 owner ID | 服务层只写 HMAC 摘要；新增清理脚本可删除 UTC 日计数早于两日的记录 | 建议保留期需业务方批准；部署方还须安排并核验定期执行清理脚本 |
| Turnstile 验证令牌 | 降低短信发送滥用 | 浏览器发给 Supabase Auth；由 Supabase 配置的 CAPTCHA provider 验证 | 不写入业务数据库；Hono 不记录 token | 生产 widget/secret 配置、Cloudflare 处理条款及网络日志留存 |
| 短信预算与频控 | 阻止超预算发送 | Supabase 项目 PostgreSQL `auth_sms_budget_usage`、`auth_sms_phone_limits` 和短期 Hook 去重表 | 使用按项目独立 HMAC 的号码摘要；额度在发往供应商前原子预留；迁移新增 2 日号码限流摘要及 7 日 Hook 去重记录清理函数 | 业务方须批准拟议期限；Supabase 项目还需安排该函数每日运行；费率配置必须覆盖模板最大计费段数 |

## 当前发布硬门

- 本文没有填入运营主体名称、联系方式、法定处理依据、账号/风控记录保留期限、供应商数据处理协议或冷备清除期限。这些值必须由真实运营主体核实，不能从代码推断。
- 生产认证现在要求 `AUTH_PRIVACY_POLICY_URL` 与 `AUTH_PRIVACY_POLICY_VERSION`；该配置只证明部署者提供了 URL/版本，不能替代政策正文审阅、法律核查或应用内入口验收。
- 登录 API 暴露已配置的隐私政策链接；政策链接须指向真实、公开、与当前收集字段和服务提供方一致的文件。
- Supabase Auth Admin API 的邮箱同步、手机号解绑删除和永久/到期删除逻辑已经接入本地代码；这些跨系统调用尚未远端验收。生产启用前必须只在 API 私有环境设置 `SUPABASE_SECRET_KEY`，完成正确项目授权与密钥保管，并验证远端错误/超时会阻止本地身份变更或删除。远端和业务库不是分布式事务；中途失败可能需要幂等重试。冷备份、主机日志及供应商日志不由删除 Auth 用户自动擦除。
- SMS 代码和 Supabase Hook 迁移已经在仓库，但没有应用到 Supabase 项目；Edge Function、Auth Hook、Tencent 密钥、模板、CAPTCHA 和预算均未配置。所有 SMS 值仍为 0。

## 需要运营主体补齐的字段

1. 数据控制者/运营主体全称及可达联系方式。
2. 登录、找回、账号安全和云档同步分别处理哪些字段、依据是什么。
3. Supabase Auth、主业务 PostgreSQL、SMTP、腾讯云短信、Cloudflare Turnstile、Hono 托管方的合同主体、处理角色、数据地区和分包方。
4. OTP、IP 摘要、Auth Hook 去重记录、关闭账户数据、审计记录、生产日志、在线数据库、冷备份的分项保留期限及删除完成证据。工程草案建议 IP/号码频控摘要保留 2 日、Hook 去重 ID 保留 7 日；该草案不等同于运营批准。
5. 查询、更正、复制、撤回/解绑、关闭、恢复、删除和申诉的可执行入口与支持响应人。
6. 政策版号、审核人、发布日期，以及真实网页和 iOS/鸿蒙等客户端展示位置。
