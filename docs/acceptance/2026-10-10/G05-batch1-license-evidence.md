# G-05 第一批登记许可证据（冻结快照，2026-10-10）

本文件是 `apps/web/public/scenes/candidate/asset-manifest.json` 第一批 10 条候选媒体登记 `licenseStatus: "approved"` 所引用的许可证据快照。**写后冻结**：任何后续修订须另立新快照并更新登记条目的 `licenseEvidenceSha256`。

## 许可依据链

1. **权利声明（已生效）**：《素材树权利属性声明》（[P66-scene-studio内部使用批准与权利声明.md](./P66-scene-studio内部使用批准与权利声明.md) §2，2026-10-10 生效）——`九霄素材-水墨古风` 素材树全部 122 个媒体文件（含本批 10 条的源文件）为作者 LYL 委托生成的自有素材，无未授权第三方版权内容。
2. **元数据证据**：[素材树权利属性查证与确认书](./素材树权利属性查证与确认书.md)——84/84 已引用候选携带中国《AI 生成合成内容标识办法》隐式标识（APP11 AIGC，`ContentProducer: doubao`，ProduceID 逐条唯一）；本批 10 条（8 张场景海报 WebP + 2 条循环 MP4）的源文件哈希与候选清单 `sourceSha256` 84/84 闭环核对一致。
3. **平台条款（联网核验）**：即梦免责声明 1.1 / 豆包协议 9.1——输出归属用户，内部/公开/商用均可用（原文与 URL 见查证结论文档）；作者口径：图片 Seedream 5.0 Pro / 视频 Seedance 2.5。
4. **作者确认**：LYL 2026-10-10 会话确认（生成归属 + 条款认可 + 38 张未引用图并入）。

## 本批覆盖条目（10 条）

| 条目 path | sha256（前 16 位） |
|---|---|
| /scenes/candidate/mountain-gate.desktop.webp | 53e5df04cef3 |
| /scenes/candidate/mountain-gate.mobile.webp | e89f5c2e2d96 |
| /scenes/candidate/wilderness.desktop.webp | 5caa0f24db1e |
| /scenes/candidate/wilderness.mobile.webp | 875fb60f3490 |
| /scenes/candidate/sect-town.desktop.webp | 8657b4d72576 |
| /scenes/candidate/sect-town.mobile.webp | bd49b32d2cb1 |
| /scenes/candidate/battle-anomaly.desktop.webp | e02598934b30 |
| /scenes/candidate/battle-anomaly.mobile.webp | 40b087b58f66 |
| /scenes/candidate/mountain-gate.loop.mp4 | d70c0124b699 |
| /scenes/candidate/wilderness.loop.mp4 | 0e3fcb5b694c |

## 批准范围与边界

- **批准**：上述 10 条的 `licenseStatus: "approved"`（逐条登记）。
- **不改变**：清单顶层 `sourceAndLicense: "unverified"` / `authorApproval: "pending"` 维持原状——release 门禁继续在顶层抛出 `LICENSE_PENDING`（`media-release-check.mjs:8`），CI 继续断言该失败；逐条 approved 不构成任何 release 放行。
- **剩余 74 条**（74 图鉴类）：待后续批次登记（声明已覆盖其源文件，登记是机械工作，分批执行）。

## 收据依据

逐条 `authorReceipts`（Bird + LYL，`assetSha256` = 条目 `sha256`，`status: "approved"`）依据：LYL 2026-10-10 会话授权与确认记录（本文件 §许可依据链 1/4），按「AI 代理执行（LYL 授权）+ Bird 复核代理」约定代录；发布档位的批准仍须作者亲自完成（P66 §1 边界不变）。

---

*签名：AI 代理执行（LYL 授权）+ Bird 复核代理。日期：2026-10-10。*
