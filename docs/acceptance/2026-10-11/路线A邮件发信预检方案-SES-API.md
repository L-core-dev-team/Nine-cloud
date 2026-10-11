# 路线 A 邮件发信预检方案（腾讯云 SES API 替代 SMTP）

生成：2026-10-11。依据：环境方案手册要求的"SMTP 预检方案"，按现实约束适配为 **SES API 发信预检**。

## 0. 为什么不是 SMTP（现场事实，2026-10-11 控制台核验）

- 腾讯云 SES「发信地址」页明确提示：**个人实名认证用户不支持 SMTP 发信**，替代路径为 API 发信（部署负责人截图为证）。
- SES 侧已全部就绪：发信域名 `mail.jiuxiaogame.cn` **验证通过**（信誉等级 1、单日上限 500 封、共享 IP）；发信地址 `no-reply@mail.jiuxiaogame.cn`（别名"九霄"）；验证码模板 **62795 `jiuxiao-login-code` 审核通过**；投递回调已指向 `ses-callback` Worker（`https://ses-callback.jiuxiaogame.cn/v1/tencent-ses?key=…`，账户级 + 发送地址级双配置）。
- DNS 侧 MX/SPF/DKIM/DMARC 已核验（见 P1 清单 §1）。

## 1. 代码现状（main 已支持，无需新开发）

- [tencent-ses-api.ts](../../../apps/api/src/services/tencent-ses-api.ts)：TC3-HMAC-SHA256 签名调用 SES API；凭据 `TENCENT_SES_SECRET_ID` / `TENCENT_SES_SECRET_KEY` / `TENCENT_SES_REGION`（缺失即抛错，不推到请求期）；默认走 **Simple.Text 分支**（官方 Example3，避免模板 ID 依赖）。
- [auth-runtime.ts](../../../apps/api/src/services/auth-runtime.ts) Node 形态：配置了 SES 凭据即自动走 `sendEmailViaSesApi`，否则回退 `SMTP_URL`。**路线 A 部署 = 配 SES 凭据、不配 SMTP_URL 的生产值。**
- Worker 形态（`AUTH_MAIL_PROVIDER=resend/sendgrid`）与本路线无关，不在本次预检范围。

## 2. 预检方案（替代 SMTP 端口探测的四段式）

SMTP 预检的语义是"启动阻塞做不发信连接检查"（`AUTH_MAIL_PREFLIGHT`）。SES API 无连接概念，预检适配为：

| 段 | 内容 | 通过标准 |
| --- | --- | --- |
| ① 凭据预检 | `normalizeSesCredential` 构造成功（三个 env 齐全、region 合法） | 启动不抛错 |
| ② 连通预检 | 服务器→`ses.tencentcloudapi.com:443` TCP/TLS 可达 | 探测通过（fail-closed：不通则 API 不标记就绪） |
| ③ 签名预检 | TC3 签名构造 dry-run（不发信） | 签名函数无异常 |
| ④ 实收预检（验收阶段） | 向部署负责人邮箱发送一封真实验证码邮件，走 Simple.Text | 收件人实收 + `MessageId` 返回 + ses-callback Worker 收到投递事件 |

**分支预案**：若腾讯云对个人认证账号拒绝 Simple.Text（仅允许模板发送——API 将返回明确错误码），按预案切换 Template 分支使用已审核通过的模板 `62795 jiuxiao-login-code`；该切换需一次小代码改动（sendEmailViaSesApi 增加 Template 分支）+ 测试，作为已知备选登记，不预做。

## 3. P2 部署缺口（本方案暴露的执行项）

1. **compose 未传 SES 变量**：当前 [api-production.compose.yml](../../../deployment/api-production.compose.yml) 无 `TENCENT_SES_SECRET_ID/KEY/REGION` 透传——P2 执行时在 env 段补三行插值（private env 提供值）。
2. `AUTH_MAIL_FROM` 设为 `no-reply@mail.jiuxiaogame.cn`（SES 发信地址一致）。
3. private env 不配生产 `SMTP_URL`（或指向无效值 + 走 SES 分支），凭据仅存 private env（600）。

## 4. 限制与诚实边界

- 单日 500 封上限、共享 IP 信誉等级 1：内测（T1）足够；公测量级前复核配额与独立 IP。
- 备选模板分支未实现（Simple.Text 优先）；若实测被拒，按 §2 预案补一次小改动。
- 预检通过 ≠ 全量邮件验收：真实邮箱 OTP 收发、两账号旅程按唯一缺口清单在 P4 执行。
- 本方案不开启任何短信能力（手机通道保持关闭，依赖与配额另核）。

## 5. 批准记录

| 项 | 状态 |
| --- | --- |
| 方案文本（SES API 替代 SMTP 预检） | **✅ 已批准（2026-10-11，LYL+Bird 对话裁决："我和bird批准，请你执行文件1和文件2"）** |
| ①–③ 段 | P2 部署时随启动执行；compose 透传 `TENCENT_SES_*` 变量已随本批准落地（执行 PR） |
| ④ 实收预检 | P2 部署后、路线 A 上线验收内执行 |

——AI 代理执行（LYL 授权）+ Bird 复核代理，2026-10-11。
