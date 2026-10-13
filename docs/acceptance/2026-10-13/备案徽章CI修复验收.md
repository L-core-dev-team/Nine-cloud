# 备案徽章 CI 修复验收（2026-10-13）

本补丁基于 PR #85 的 `64d13f0`。图片原件未改动；修复素材清单中遗留的旧哈希、大小、尺寸，并按本轮双方共同确认建立新的哈希绑定收据和冻结证据快照。旧证据文件未改写。

- 定向 `candidate-atlas.test.ts`：1/1通过。
- `media-release-check.mjs`：完整发布证据结构与逐文件哈希检查通过，不放宽门禁。
- `pnpm test`：Web175、API327等原有单测通过；本机38项PostgreSQL集成跳过。
- `pnpm build`：通过，Canon运行包34条确认，主JS分包提示保留。
- `filing-notice.cjs`：320、390、1366px均通过，备案居中、图像解码及源尺寸检查通过，无横向溢出。
- `git diff --check`：通过。

分支为 `codex/beian-local-ci-repair-20261013`。该分支没有开放PR；当前仓库工作流只监听pull_request及push main，直接同步此修复分支不会触发这套Actions。保持原PR #85不变，避免在已确认的账户启动阻断下制造第二轮检查；待账户恢复后再将该补丁快进到#85并完成精确head复验。当前不将这些本机结果宣称为新提交的远端CI通过或生产部署。
