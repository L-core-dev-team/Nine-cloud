# G-05 顶层翻转记录（2026-10-10，release 媒体门禁最终人工把关）

- **动作**：`asset-manifest.json` 顶层状态翻转——`sourceAndLicense: "unverified" → "verified"`、`authorApproval: "pending" → "approved"`
- **授权**：LYL 2026-10-10 会话指令"执行翻转"（此前已完成 88/88 逐条登记与翻转就绪预检，见 [G05-flip-readiness-assessment.md](./G05-flip-readiness-assessment.md)）
- **签名**：AI 代理执行（LYL 授权）+ Bird 复核代理

## 翻转前的证据状态（全部就绪）

| 层 | 状态 |
|---|---|
| 逐条登记 | 88/88（批次 1：10 场景海报/视频 `fa26bb53…`；批次 2：74 图鉴 `0de1aecd…`；批次 3：4 站点资产 `99b858a2…`）——每条 licenseStatus + 证据哈希 + Bird/LYL 双收据 + 磁盘实算核验 |
| 权利声明 | 已生效（[P66 §2](./P66-scene-studio内部使用批准与权利声明.md)，覆盖素材树 122 文件）+ gate-moonlight ×2 作者口径 GPT 生成 + favicon 站点标识 + 备案徽章依规展示 |
| 门禁扩展 | 选项 A 已实施（作者裁定）：路径检查精确追加 `/favicon.svg` 与 `/compliance/`，测试锁定三个边界 |
| 预检 | 真检查器在翻转克隆上全绿（88 条 + 全树扫描） |

## 同步翻转的配套（本提交内）

1. `asset-manifest.json` 顶层两字段（本记录的主体）
2. `.github/workflows/ci.yml`：release 步骤按其原注释的指引翻转——从"断言失败于 LICENSE_PENDING"改为"release 构建必须成功 + 独立门禁检查必须报告证据链通过"
3. `apps/web/src/candidate-atlas.test.ts`：状态钉子同步为 `verified/approved`

## 翻转不改变的事项（边界）

1. **不是公开发布**：`HUMAN_GATE_PENDING`、`RULES_NOT_READY`、`releaseApproved` 等其余门禁照常独立把关；公开发布仍须走发布流程
2. **AI 标识义务**：公开发布含 AI 生成素材时，显式标识（界面声明）+ 隐式标识（元数据保留）仍是发布前置条件（ASSETS.md 备忘）
3. **门禁本身继续存在**：`media-release-check.mjs` 现在从"拒绝待审内容"变为"校验已批内容"——未来任何未登记媒体进入 public 树仍会被 SEC-05 全树扫描拒绝

## 本地验证记录

- 真检查器：翻转后 `requireReleasedMedia` 全绿（88 条 + 全树扫描）
- release 目标构建：本地 `pnpm --filter @jiuxiao/web build`（`JIUXIAO_BUILD_TARGET=release`）成功通过媒体门禁
- candidate-atlas 测试：翻转钉子下通过

---

*日期：2026-10-10。本记录与翻转提交同 push；CI 的 release 步骤自本次提交起要求 release 构建成功。*
