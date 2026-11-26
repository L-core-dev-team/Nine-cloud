> **2026-11-26 现行方向：** 视觉、玩法与全栈的现行方案是 [JX-VISION-02 最终方案](docs/design/JX-VISION-02/final/README.md)，作者已批准实施；执行进度与恢复入口见 [执行台账](docs/execution/JX-VISION-02/README.md)。方案 E 是初版，旧版的配色、布局、材质与框架限制不约束新方案。Canon、权限、安全、许可与生产发布事实不因本声明改变。

# 九霄 · Nine-cloud

面向中文玩家的 AI 修仙文字 RPG。将自然语言行动、世界规则、人物记忆与叙事连接为持续的游戏世界。

- [进入九霄](https://play.jiuxiaogame.cn/) · [项目 Issues](https://github.com/L-core-dev-team/Nine-cloud/issues) · [CI](https://github.com/L-core-dev-team/Nine-cloud/actions/workflows/ci.yml)
- 当前仓库是公开开发仓库；版本以 `package.json`、实际构建指纹与发布回执为准。未检测到正式 GitHub Release，不将工程候选当成已上线能力。
- 不同分支的研究、验收与生产是不同状态。本页不替代作者审批。

## 从这里开始

| 我想做什么 | 入口 |
|---|---|
| 阅读项目代码 / AI 接手 | [项目地图与阅读路径](docs/README.md) · [AGENTS.md](AGENTS.md) |
| 本地开发、验证 | [开发指南](docs/README-workspace-guide.md) |
| 了解实际模块与部署链 | [架构地图](docs/项目结构地图.md) · [部署说明](deployment/README.md) |
| 查当前状态、未完成条件 | [状态与权威来源](docs/repository/STATUS.md) |
| 查世界书、规则与内容 | [Canon 交付说明](docs/世界书Canon1.0交付说明.md) |
| 查历史版本、实验、旧原型 | [历史与归档入口](docs/archive/README.md) |
| 查分支、全部文件、重复项和整理方案 | [仓库治理与审计](docs/repository/README.md) |
| 安全、权限和披露 | [SECURITY.md](SECURITY.md) |

## 代码结构

```text
apps/web/       玩家 Web 应用
apps/api/       Node/Hono API 及候选 Worker
packages/       contracts、domain、content、db；scene-gate 为隔离试验
functions/      Pages 同源 API 中继候选
deployment/     Node/Caddy、隔离试玩、部署配置
supabase/       外部身份与相关 SQL/函数
scripts/        构建、迁移辅助、验证与审计
tests/          回归、集成、E2E；experiments 为实验及证据
docs/           当前导航、决策、审批、历史证据
work/           旧 HTML 原型及仍被回归使用的工具
outputs/        旧原型交付、Canon 阅读版及历史输出
```

本地基本环境：Node ≥24、pnpm 11.19.0（以 manifest 为准）。

```sh
pnpm install --frozen-lockfile
pnpm dev:web
```

完整验证：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm license:check`。集成与 E2E 依赖隔离测试环境，先读开发指南与 CI。不要把生产数据库、真实玩家存档或 API 密钥作为测试输入。

## 贡献与许可

提交独立分支及 PR，记录实际证据与适用范围；不要未经协调修改其他人或代理正在使用的分支。正式规则、Canon、素材权利、数据政策和发布仍由指定拥有者批准。公开仓库并不等于获得开源使用许可；当前仓库未见根 LICENSE，第三方资产权利另计。详见 [仓库治理](docs/repository/GOVERNANCE.md)。
