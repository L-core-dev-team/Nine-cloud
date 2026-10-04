# G-04a · Canon 摘要与双作者回执

> 状态：**本交付快照记录 LYL 与 Bird 于 2026-10-03 对签署基线的同一摘要留有回执；该基线摘要与回执一致，运行时发布门禁未通过。**
> 作者签署时绑定的基线 commit：`61ca62e096fe9456f2e46c356a62284bde31f628`
> 数据文件：`canon-digests.json`（文件级）、`canon-entry-digests.csv`（39 条逐条）

---

## 1. 已实算的摘要（勿手抄，以文件为准）

| 对象 | SHA-256 | 字节 |
| --- | --- | --- |
| `packages/content/src/canon.registry.json` | `a22f4d0cd82c3de5a1ffb9c73928482677ddbd5b2e93664431c4c39828ebf19f` | 303,332 |
| `packages/content/src/canon-runtime.json` | `a65fc6e9b3e5c233407d7602180d51d372c5bb3159b0d8f99cc142f70eb4f8f2` | 233,589 |

**逐条 `reviewDigest`**：见 `canon-entry-digests.csv`，共 39 条（`confirmed` 34 / `deprecated` 5），计算方式为对该条目的**键序规范化 JSON** 求 SHA-256。

> ⚠️ 这两个文件级摘要在**任何一次改动后都会变**。若它们与签字时的不一致，说明签字作废，必须重算重签。

---

## 2. 已签回执与仍开放的运行时门禁

`G04a-回执-已签署.md` 已记录 LYL 与 Bird 对同一组摘要、同一 commit 的独立回执。对签署时冻结的基线 commit `61ca62e096fe9456f2e46c356a62284bde31f628` 重新计算后，`canon.registry.json` 与 `canon-runtime.json` 的 SHA-256 均与回执一致，`reviewQueue` 为 0。作者签署事项已关闭，不得要求重签。

**与最新 GitHub main 的边界（2026-10-04）**：已获取 `origin/main=cfa3490625ea822549d89a2c1547a87ae143a371`。该提交的 `canon.registry.json` SHA-256 为 `1651cb8f7e3880337655d7d78ffa55d142625a39f495b110c6cc8212237e64f5`，不同于回执中的 `a22f4d0c…`；差异是增加两条 `authorOriginalIntakes` 登记。main 上 39 条现有 Canon 条目的 ID 集合和逐条 `reviewDigest` 全部与已签 CSV 相同，`canon-runtime.json` 仍为回执中的 `a65fc6e9…`，`reviewQueue` 仍为 0。**因此，39 条内容的作者裁决已签；但按本文件的整文件哈希与 commit 绑定约定，现有回执尚未绑定最新 main 的 registry 文件。**不得把逐条相同推断成整包回执已通过，也不得代作者补签或绕过门禁。需在保持 fail-closed 的前提下，对最新候选完成明确的摘要绑定判定。

运行时状态仍未闭合：签署基线中的 `canon-runtime.json` 的 `receiptsComplete` 为 `false`，registry 的 `approvalMode` 仍为 `author_delegated_adjudication`。这说明签署回执尚未转化为当前发布器认可的运行时授权状态。**保持 fail-closed；不得手工翻转状态或改动 Canon 来凑通过。**剩余工作是让发布器按精确摘要校验已签回执，并对拟发布候选重新验收。改变 Canon 内容或摘要后，才需要重新取得双作者回执。

---

## 3. 关闭步骤

| 步 | 动作 | 判定 |
| --- | --- | --- |
| 1 | 冻结待验收候选的 Canon commit | 原签署对象为 `61ca62e096fe9456f2e46c356a62284bde31f628`；当前候选须单独核对 |
| 2 | 对候选现算文件级与逐条摘要 | 原签署基线摘要与回执一致；当前候选摘要不同，不能外推旧回执 |
| 3 | 核对 `reviewQueue` | 当前为 0 |
| 4 | 让发布器验证回执并计算授权状态 | 当前 `receiptsComplete=false`；未通过前拒绝发布 |
| 5 | 核对 LYL 已有回执 | 已记录于 `G04a-回执-已签署.md`，不重签 |
| 6 | 核对 Bird 对相同摘要的独立回执 | 已记录于 `G04a-回执-已签署.md`，不重签 |
| 7 | 用最新候选验证发布门禁 | 只有精确摘要、回执与候选匹配且校验通过才可放行 |

**回执模板**

```
canonDigest:
  registrySha256: <第 2 步现算>
  runtimeSha256:  <第 2 步现算>
  entryCount: 39
  confirmedCount: 34
  gitCommit: <第 1 步冻结>
reviewer: <LYL | Bird>
conclusion: <采纳 | 部分采纳 | 否决>
scope: <覆盖的条目范围>
signedAt: <ISO8601>
```

两份回执必须由**两个不同的人**在同一摘要上留下；当前两份已在案。任何内容或摘要变化都会使现有回执不再覆盖新对象，届时才需重新签署。

---

## 4. 建议的加固（超出最低要求）

把 Canon 摘要也纳入存档契约——与 `policyArtifactHash` 同样的思路。存档里记下它对应哪个 Canon 摘要，日后才可核对「这局玩的是哪一版设定」。这一条会在 P2 的 `SaveEnvelope` 扩展时顺带完成。

---

## 5. 不要做的事

- 不要用旧表格里的 SHA 值对（`canon-runtime.json` 本轮新增了回执状态字段，摘要已变）。
- 不要把 `confirmed` 状态当作「已双签」——那是内容状态，不是审批状态。
- 不要用 AI 代理签字。代理签字在本项目的门禁里明确无效。
