# JX-UI-E-01 · M0 基线记录

日期：2026-11-22。执行环境：Linux 容器，Node 24（`/opt/node24`），pnpm 11.19.0，Playwright 1.63 自带 Chromium（`PLAYWRIGHT_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`），本机 PostgreSQL 16 一次性测试库 `jiuxiao_test`（已执行 `packages/db` 迁移）。

## 1. 版本核验

| 对象 | SHA | 结论 |
|---|---|---|
| `main` | `f1fe6ea561c5ef4d1ec670b7a406625ce5df774c` | 与任务书记载一致 |
| PR #119 HEAD | `9c0724fb7f3573d7eab97766a8b97bb69c859d74` | 与任务书记载一致 |
| 工作分支底座 | `846c057`（`claude/pensive-ritchie-kef9p0` 合并 `origin/pr-119`） | 含规划文档 + #119 |

分支说明：会话环境只允许推送到 `claude/pensive-ritchie-kef9p0`，因此 UI 工作在该分支上进行（以 #119 为底），没有另建 `codex/jx-ui-e-01`。

## 2. 基线命令结果（未改动任何产品代码）

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过：核心回归 28/28；contracts 17、content 25、domain 133、web 265、api 420（99 跳过） |
| `pnpm build` | 通过（首屏 JS `index-*.js` 522.03 kB / gzip 162.79 kB；CSS 169.8 kB） |
| `pnpm test:e2e:design` | **失败**：`design-token-audit` 报 `landing.css` 第 2–6 行 8 处原始数值 |
| `pnpm test:e2e:ui` | **失败**：`game-shell.cjs` 390 宽度“input must stay in the viewport” |
| `pnpm test:e2e:liquid-glass` | **失败**：`liquid-glass.cjs:139` “hover morphs the clear action into a softly rounded shape” |
| `pnpm test:e2e:liquid-glass-production` | 通过 |
| `pnpm test:e2e:spatial-ui` | 通过 |
| `pnpm test:e2e` | **失败**：`foundation.cjs:1310` 导入失败备份的下载文件名断言（本环境 Chromium 下载命名）。`&&` 链中其后测试未执行，改为逐个运行，见下表 |

## 3. 逐个运行的 e2e 基线

| 测试 | 基线 | 说明 |
|---|---|---|
| design-audit-regression | 通过 | |
| design-acceptance-runner | 通过 | 约 6 分钟 |
| prologue / p1-authenticated-candidate / p2-gameplay / story-first-golden | 通过 | 需 `TEST_DATABASE_URL` 与已迁移的测试库 |
| p1-action-suggestions-ui / p2-authoritative-idb | 通过 | |
| cloud-game-cache / -recovery / -recovery-p3 / -shell | 通过 | |
| card-availability / filing-notice / auth-login-ui / turns | 通过 | |
| professional-focus / s-final-quality / world-description-contrast | 通过 | 需 `PLAYWRIGHT_BROWSER_EXECUTABLE`（脚本默认 Windows Edge 路径） |
| professional-quality | **失败** | `professional-quality.cjs:38`：`.footer-filing` 严格模式匹配到 2 个元素 |
| cloud-settings-layout | **失败** | `cloud-settings-layout.cjs:65` 断言不相等 |
| card-ui | **失败** | 模拟接口未处理 `GET /model` |
| card-ui-s2-pagination | 未运行 | 需要 `jiuxiao_test_card_host_*` 专用卡片库 |
| cloud | 未运行成功 | 本地服务就绪失败（需要邮件服务 Mailpit 等） |
| first-play-ux | 未运行 | 需要外部预先启动的 4178 端口服务 |

以上“失败”在改动前已存在。之后每次回归都与这里比较：同一测试、同一断言位置的失败不计入 UI 改动，也没有被删除或跳过。

## 4. 分层改造的等值验证

把 8 个旧样式文件放入 `@layer jx.legacy` 后，对 10 个路由 × 2 宽度（1440、390）× 2 主题共 40 组整页截图，与基线构建逐像素比较：**差异为 0**。
