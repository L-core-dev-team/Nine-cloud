# P6-LONGMEM-04-PRE：原始剧情文件保存原型

独立离线接口提案，只使用 Node.js 标准库。未接入正式游戏、数据库、生成服务或 NPC 记忆；测试使用合成文本模拟生成结果，不调用模型。

在仓库根目录运行：

```powershell
node --test --test-reporter=tap tests/experiments/p6-longmem-durability/store.test.cjs
```

8 个测试覆盖长中文/换行/空白/emoji 的 UTF-8 字节一致性、两个独立进程保存与恢复、正文 SHA、幂等重复、正文/元数据冲突、owner/save/branch 分区、损坏拒绝和不同 revision 关联。临时文件仅在本独立目录的 `.scratch-*` 下生成，完成后校验真实路径并清理；没有提交大型正文库。

## 接口与格式

`require('./store.cjs')` 导出 `NarrativeFileStore`、`NarrativeStoreError` 和 `sha256`。

- `new NarrativeFileStore(directory)`：使用指定本地目录，没有内存索引或隐藏恢复状态。
- `save(input)`：完整保存，返回 `{status:'saved'|'duplicate', record}`。
- `load({ownerId,saveId,branchId}, sourceId)`：重新读取，缺失返回 undefined；损坏明确抛出 `CORRUPT_RECORD`。

输入必需 sourceId、ownerId、saveId、branchId、revision、idempotencyKey、narrativeText、generationVersion、visibilitySnapshotId。后者为字符串或 null；sha256 由存储器根据正文 UTF-8 字节计算，拒绝调用方伪造该字段。不接受未知字段、空正文或未配对 UTF-16 代理项，不做裁剪、换行转换或摘要。

每条来源一个 UTF-8 JSON 文件，目录为 `SHA256(JSON.stringify([ownerId,saveId,branchId]))`，文件名为 `SHA256(sourceId).json`；身份字符串不会直接进入路径。文件封套：

```text
{
  format: "p6-original-narrative-v1",
  record: { sourceId, saveId, branchId, ownerId, revision, idempotencyKey,
            narrativeText, generationVersion, visibilitySnapshotId, sha256 },
  recordSha256: SHA256(固定字段顺序的 record JSON)
}
```

`sha256` 校验正文，`recordSha256` 额外覆盖来源、修订等元数据。读取时严格验证格式、字段、预期身份/来源和两份 SHA。相同 scope/source 的正文与全部元数据相同为 duplicate；不同正文、revision、生成版本或可见快照均为 SOURCE_CONFLICT，拒绝覆盖。

错误代码：INVALID_INPUT、SOURCE_CONFLICT、CORRUPT_RECORD、WRITE_FAILED、READ_FAILED。重复保存遇到已损坏文件同样明确失败，保留现场，不自动修复或覆盖。

## 实验限制

不可变仅指本接口不覆盖已存在来源，使用文件独占创建 `wx`；本地有写权限的人仍可改文件并重算摘要，摘要不是签名或认证。scope 必须由可信调用方提供：文件分区不是正式账号认证、存档所有权检查或操作系统权限隔离。

visibilitySnapshotId 只保存未来关联信息，无论 null 还是非空都不授予 NPC 权限；原型没有 NPC 读取/授权接口。正文也不因为保存成功就成为规则权威事实。

未实现 fsync、原子发布、并发事务、崩溃/断电保证、索引、备份、迁移或正式 revision 校验。部分写入失败可能留下不完整文件，下次读取/重复写入会报错，需人工检查。这次只证明正常进程退出后的文件恢复语义，不证明磁盘物理持久性。

唯一日志和验收摘要在 `evidence/tests.log`、`evidence/summary.json`；完整回执在 `docs/acceptance/2026-10-12/P6-LONGMEM-04-PRE-原文保存与恢复验证回执.md`。
