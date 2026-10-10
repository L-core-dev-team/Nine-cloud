# G-05 第三批登记许可证据（冻结快照，2026-10-10）

本文件是 `apps/web/public/scenes/candidate/asset-manifest.json` 第三批 **4 个站点资产**登记 `licenseStatus: "approved"` 所引用的许可证据快照。**写后冻结**：任何后续修订须另立新快照并更新登记条目的 `licenseEvidenceSha256`。

## 背景

G-05 翻转就绪预检（[G05-flip-readiness-assessment.md](./G05-flip-readiness-assessment.md)）发现 4 个未登记阻断文件。作者 2026-10-10 逐项裁定：①gate-moonlight 两图为 GPT 生成 ②favicon.svg 为站点标识 ③beian-police.png 为公安备案徽章 ④采纳选项 A（门禁路径扩展）。本批依据该裁定与门禁扩展（`media-release-check.mjs` 路径白名单精确放宽）完成登记。

## 逐文件证据链

| 文件 | 作者裁定（2026-10-10 会话） | 许可依据 | 元数据说明 |
|---|---|---|---|
| `/scenes/gate-moonlight.webp` | "GPT 生成的" | OpenAI gpt-image 委托生成；OpenAI 服务条款输出归属用户（条款核验先例：[查证结论](./scene-studio许可与真机查证结论.md)） | 零元数据（无 C2PA/EXIF）——以作者口头确认为证据基础，诚实记录 |
| `/scenes/gate-moonlight-mobile.webp` | 同上 | 同上 | 同上 |
| `/favicon.svg` | "站点标识" | 站点自有身份资产，作者确认归本项目所有 | SVG 源文件在库，可随时复核 |
| `/compliance/beian-police.png` | "公安备案徽章" | 公安备案官方徽章，备案网站依规展示（10-09 ICP 页脚功能引入） | 官方徽章原件，非创作素材 |

## 门禁扩展记录（选项 A）

`media-release-check.mjs` 条目路径检查在 `/scenes/` 前缀外**精确追加**：`/favicon.svg`（全等匹配）与 `/compliance/`（字面前缀）。非普遍放宽；其余非 `/scenes/` 路径（如 `/js/*`）仍被拒绝并有测试锁定。改动经作者批准（本文件 §背景 ④），测试覆盖三个新边界。

## 批准范围与边界

- **批准**：上述 4 条的 `licenseStatus: "approved"`（逐条登记）。
- **不改变**：清单顶层 `sourceAndLicense: "unverified"` / `authorApproval: "pending"` 维持原状——release 门禁继续在顶层抛出 `LICENSE_PENDING`。
- **顶层翻转**：88/88 逐条齐备后，翻转动作是 release 门禁的最后一次人工把关（作者决策点）。

## 收据依据

逐条 `authorReceipts`（Bird + LYL，`assetSha256` = 条目 `sha256`，`status: "approved"`）依据：LYL 2026-10-10 会话授权与逐项裁定（本文件 §背景），按「AI 代理执行（LYL 授权）+ Bird 复核代理」约定代录。

---

*签名：AI 代理执行（LYL 授权）+ Bird 复核代理。日期：2026-10-10。*
