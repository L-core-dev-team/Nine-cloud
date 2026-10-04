# Cloudflare Pages 前端预览

本次只发布 `apps/web` 的 Vite 前端。Node API、PostgreSQL、验证码、SMTP、Session 和云档业务没有迁移到 Cloudflare。前端上线不代表登录链路完成。

## 构建与产物

- 根目录：仓库根目录。
- 构建命令：`pnpm build:pages-preview`。
- 输出目录：`apps/web/dist`。
- 构建环境：Node 24；pnpm 版本以根 `packageManager` 为准。
- 该命令只构建 contracts、content、domain 和 web，并检查产物；不构建或启动 API。
- 场景素材仍标记为未完成授权/作者审批。本预览不复制 `public/scenes`，只发布已附 OFL 许可证的字体；界面使用现有程序绘制与颜色层，场景图片、视频和图鉴插图暂不可见。普通本地构建的素材规则保持原样。
- 不创建顶层 `404.html`，使用 Pages 自带的 SPA 路由回退。

## API 地址配置

`VITE_API_BASE_URL` 是构建时变量，包含 `/api` 前缀。修改它后须重新构建和部署。它是公开地址，不得放入密钥。

| 环境 | 配置 | 行为 |
| --- | --- | --- |
| 开发 | `VITE_API_BASE_URL=/api`（开发默认值） | 通过 Vite `/api` 代理到本地后端；代理目标可用 `JIUXIAO_API_TARGET` 设置。 |
| Pages 预览，后端尚未部署 | 不设置 `VITE_API_BASE_URL` | 前端可浏览；API 请求在发送前返回 `API_BASE_URL_NOT_CONFIGURED`，不会请求 localhost 或 Pages 的 SPA 地址。 |
| Pages 预览，后端就绪后 | `VITE_API_BASE_URL=https://<staging-api-host>/api` | 指向独立的公网 staging API。 |
| 生产，另行部署时 | `VITE_API_BASE_URL=https://<production-api-host>/api` | 指向独立的公网 production API。 |

上表尖括号内容须替换为实际公网地址，不能照抄。Pages 预览构建拒绝 HTTP、localhost、回环地址、URL 中的密码/查询参数及缺少 `/api` 前缀的地址。`http://localhost:4173` 是本地前端预览地址，无法充当公网后端。

本任务仅在 `cloud-sync.ts` 的 fetch 地址处接入 `apiRequestUrl`，保留另一任务已提交的错误处理和全部认证/云档逻辑。沿用最新 PR #33 的 `credentials: 'include'`，保留账号隔离、CAS 和上传失败分类。跨域 staging API 须由后端任务配置明确的允许来源、凭据 CORS 及适当的 Session Cookie 策略，并完成邮件与会话验收；本预览不证明这些链路已可用。

未配置后端时停止请求的行为仅用于 Pages 预览构建；普通构建继续保留原有同源 `/api` 行为，避免影响既有部署和另一任务的认证验证。

## Pages 项目接入

优先在 Cloudflare Workers & Pages 创建 Git 集成项目并连接 `L-core-dev-team/Nine-cloud`，按上面的根目录、命令和输出目录配置，只为独立预览分支开启预览构建。生产分支自动部署暂时关闭，避免把尚未配置的 main 发布为生产。

若使用已有 Pages 项目手工上传已验证产物：

```sh
pnpm build:pages-preview
wrangler pages deploy apps/web/dist --project-name <existing-project-name> --branch codex/cloudflare-pages-preview-20261002
```

Cloudflare 会在成功上传后返回实际预览 URL。不能用项目名猜测一个 URL 并当作已部署地址。创建新项目时优先保留 Git 集成路线；Direct Upload 项目不能直接转换成 Git 集成项目。

预览 URL 默认公开。团队预览建议在项目 Settings > General 启用 Access policy；该设置只保护预览部署，不保护项目主 `pages.dev` 域名。

## 外部依赖与验证边界

- 需要 Cloudflare 账号及 Pages 项目访问权限。
- 后端暂未给出公网 staging 地址；当前只允许断开后端的前端预览。
- 后续需要独立的 HTTPS staging API，并由后端任务配置允许的前端来源、会话策略与服务依赖。
- 预览使用独立域名的 IndexedDB/浏览器存储；本地 HTML 的存档不会自动出现在这个域名，需自行导入。
- 本任务不修改 main，不签署登录链路或 1.0 生产发布验收。

参考：[Pages 构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[SPA 回退](https://developers.cloudflare.com/pages/configuration/serving-pages/)、[预览与 Access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)、[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)。

兼容交叉点：账号与云档页面仅为 API_BASE_URL_NOT_CONFIGURED 增加明确的预览提示；原认证、账号隔离、CAS、队列及其他错误处理保持不变。
