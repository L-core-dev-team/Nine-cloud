# G-05 翻转就绪评估（2026-10-10）

- 性质：顶层翻转（`sourceAndLicense: unverified→verified` + `authorApproval: pending→approved`）是 release 门禁解除的**最后一次人工把关**。本评估把该决策所需的全部事实备齐。
- 签名：AI 代理执行（LYL 授权）+ Bird 复核代理

## 1. 已完成：84/84 逐条登记（批次 1+2）

| 批次 | 条目 | 证据快照（冻结哈希） | CI |
|---|---|---|---|
| 批次 1 | 10 条场景海报/视频 | [G05-batch1-license-evidence.md](./G05-batch1-license-evidence.md) `fa26bb53…` | ✓ |
| 批次 2 | 74 条图鉴类 | [G05-batch2-license-evidence.md](./G05-batch2-license-evidence.md) `0de1aecd…` | ✓（`a9e0d14`） |

每条均含：`licenseStatus: approved` + `licenseEvidenceSha256` + Bird/LYL 双收据（`assetSha256` 与条目哈希绑定，磁盘实算核验通过后附着）。顶层状态**未动**；门禁仍在顶层抛 `LICENSE_PENDING`（`ci.yml` release 断言照常，全绿）。

## 2. 翻转预检：发现 4 个未登记阻断文件（SEC-05 全树扫描将拒绝）

| 文件 | 大小 | 哈希（前 16 位） | 元数据扫描 | 来源判定 |
|---|---|---|---|---|
| `/scenes/gate-moonlight.webp` | 229 KB | — | **零元数据**（无 AIGC/C2PA/EXIF） | **不在素材树、哈希不匹配**——来源无法自证，需作者说明 |
| `/scenes/gate-moonlight-mobile.webp` | 252 KB | — | **零元数据** | 同上 |
| `/favicon.svg` | 407 B | `8b68e4d0c46ca542` | SVG 站点标识 | P1 时期站点身份资产（待作者确认出处） |
| `/compliance/beian-police.png` | 19 KB | `a20583c81805fe64` | 公安备案徽章 | 备案网站依规展示的官方徽章（10-09 ICP 页脚工作引入） |

**注**：这 4 个文件在全部历史批次之前就存在于 public 树（非本次工作引入；favicon 与 gate-moonlight 为更早期资产，beian-police 为 10-09 ICP 功能引入）。此前从未暴露，因为门禁总在顶层先失败。

## 3. 门禁 schema 限制（代码级事实）

`media-release-check.mjs:11` 的条目路径正则要求 `/^\/scenes\/…/`——**`/favicon.svg` 与 `/compliance/beian-police.png` 在现有 schema 下无法登记**（路径前缀不匹配）。两个处置选项：

- **选项 A（编制方推荐）：最小门禁扩展**——路径正则精确放宽为额外允许 `/favicon.svg` 与 `/compliance/*` 两个具体前缀（白名单式，非普遍放宽）；4 个文件全部登记后，顶层翻转可保证转绿。门禁代码改动按仓库纪律须 Bird/LYL 复核。
- **选项 B：文件迁移/改造**——favicon 与徽章改为代码内渲染（SVG 内联/组件化），不作为媒体文件存在；gate-moonlight ×2 迁入 `/scenes/candidate/` 并按既有链登记。改动面更大（涉及页脚与站点代码）。

## 4. 作者需要回答的问题（翻转决策包）

1. **gate-moonlight 两张图的来源**？（此前会话的 AI 生成？哪个工具？或外部来源？）——决定其许可证据链
2. **favicon.svg 出处确认**（自制/委托/AI 生成？）
3. **beian-police.png**：确认使用官方徽章原件即可（备案网站依规展示），AI 侧可代办来源 URL 查证
4. **选项 A 或 B**（门禁扩展 vs 文件改造）
5. **顶层翻转时点**：以上就绪后，翻转动作本身由作者亲自执行或明确授权代执行（这是 release 门禁的最终人工把关）

## 5. 就绪度结论

84/84 候选条目证据齐备；顶层翻转的全部前置只剩 §4 的 4 个问题 + §3 的处置选项。翻转后 release 门禁转绿 ≠ 立即公开发布——`HUMAN_GATE_PENDING`、`RULES_NOT_READY` 等其余门禁与发布流程照常独立把关。

---

*本评估不翻转任何状态、不改动任何运行文件。日期：2026-10-10。*
