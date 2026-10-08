# S/UI 基础回归修复

日期：2026-10-06  
归属：S/UI 轨，与 P 轨玩法缺口分开记录。  
触发：PR #64 的 GitHub Actions run `37465827464` 在 `tests/e2e/foundation.cjs:753` 失败。

## 查明的问题

回归在专业 AI 设置页对 540 个 DOM 元素、258,120 个 computed-style 属性作严格比较。断言没有坏掉；参照 stylesheet 已过期。

PR 基线中的 `apps/web/src/style.css` Git blob 为 `1c1e53bba195aa8ff57097ad57e52529820d6fff`，与已在 `origin/main` 中的 commit `c776de91fef24d608547bac1442f9905bffe3933:apps/web/src/style.css` 完全相同。原参照 `69471c749a1624ba13109352abaf8b76577e6d3d` 早于该主线样式。修复将参照指向已合并的样式快照；比较元素数、属性数、归一化和严格相等断言均保持不变。另有一条单独的世界书状态文本颜色修正，不影响专业 AI 页面冻结比较。

第一次参照核验通过后，foundation E2E 还揭示游戏页滚动恢复问题：路由切换清理时会以顶部位置覆盖先前记录；同一保存键还重复注册了两份相同恢复 effect。导航现在先记录滚动位置，清理只在仍处于对应游戏页时写回，并只保留一份恢复 effect。

完整页面对比度审计随后找到一个具体缺陷：夜间主题的世界书搜索状态文本对比度只有 `3.94:1`，未达到本项目普通文本 `4.5:1` 门槛。该状态文字现在使用更亮的前景色；日间主题原有颜色覆盖保留，世界书控件边界审计不变。

## 验收证据

- `pnpm install --frozen-lockfile`：退出码 0。
- `pnpm typecheck`：退出码 0。
- `pnpm build`：退出码 0；既有 500 kB 主 chunk 提示仍在。
- `node tests/e2e/foundation.cjs`：退出码 0。日志报告 20 个五页基线、3,836 个非专业 AI 文本样本与 304 个控件边界样本通过；390 px / 1366 px 两视口交互、渲染器回退、音频同意和 API smoke 均通过。已约定排除的专业 AI 与世界书控件对比度样本仍单独报告为 629 / 35，不被宣称通过。
- GitHub Actions exact-head 结果：提交推送后待更新。
- 此记录不表示真机或生产验收，不改写 P 轨阶段缺口状态。
