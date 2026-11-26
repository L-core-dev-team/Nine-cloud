> **2026-11-26 现行方向：** 视觉、玩法与全栈的现行方案是 [JX-VISION-02 最终方案](design/JX-VISION-02/final/README.md)，作者已批准实施；执行进度与恢复入口见 [执行台账](execution/JX-VISION-02/README.md)。方案 E 是初版，旧版的配色、布局、材质与框架限制不约束新方案。Canon、权限、安全、许可与生产发布事实不因本声明改变。

# 九霄本地开发指南

适用本分支的工作区；运行前核对 `package.json`、`pnpm-workspace.yaml` 和 [CI](../.github/workflows/ci.yml)，不要照搬历史指令。

## 最小启动

- Node ≥24；pnpm 11.19.0（manifest 固定）。
- 独立 checkout/worktree，`git status --short`；不要在正在被其他代理修改的目录工作。
- `pnpm install --frozen-lockfile`，`pnpm dev:web`（Vite 本地入口，通常 127.0.0.1:5173）。
- API 入口 `pnpm dev:api`；本地全链使用根 `docker-compose.yml` 与 [.env.example](../.env.example)，详见[本地服务链说明](本地服务链配置与验收.md)。先确认数据库是专用测试实例，勿使用生产凭据。

## 验证

| 命令 | 用途 |
|---|---|
| pnpm typecheck | 共享包构建及工作区类型检查 |
| pnpm test | 领域包构建、旧原型 core-regression、工作区测试 |
| pnpm build | Canon 校验、工作区构建及 build manifest |
| pnpm license:check | 依赖许可审查 |
| pnpm test:integration | 独立 PostgreSQL 集成验证 |
| pnpm test:e2e | 浏览器流程 |
| pnpm test:pages-relay / pnpm test:playtest-gateway | 边缘与隔离试玩 |
| pnpm dev:cards --check | 角色卡开发环境检查；[近期收口](integration/remaining-closeout-20261119/CLOSEOUT.md) |

需要真实 API、账户、生产访问时单独确认授权；本地 stub 不等于供应商实测。构建输出及 test-results 不当作源码。scene-studio/scene-gate 使用专门 pilot 命令，不由常规生产递归构建加入发布物。

历史单 HTML 原型从 [work](../work/) 和 [outputs](../outputs/) 进入；旧版仍可能是回归/迁移依赖，勿删除。旧指南的完整原貌见[固定提交](https://github.com/L-core-dev-team/Nine-cloud/blob/f1fe6ea561c5ef4d1ec670b7a406625ce5df774c/docs/README-workspace-guide.md)。
