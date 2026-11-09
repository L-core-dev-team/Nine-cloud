# P6-LONGMEM-04-PRE 原文保存与恢复验证回执

日期：2026-10-12。执行：水龙吟。范围：独立离线文件原型，不接入正式游戏。

## 基线与交付

- 工作区：`C:\Users\11954\Desktop\水龙吟专用\项目\Nine-cloud-P6-longmem-04-pre-durability-20261012`。
- 分支：`shuilongyin/p6-longmem-04-pre-durability-20261012`。
- 实验基线：`e3e6caf502c88632678ce6e6710caa3e1bdee625`，fetch 后已核对远端一致。
- 最新 main：`2647439e0cccc9a136606a81131519f53253f125`，未重新合并。
- 受测原型源码：`103d1fa496f2959167b4254a6c811c7ddf3fe03e`。
- 最终 SHA 和推送核验记录追加在水龙吟交接目录同名回执；完成后停止施工待审。

main 的 TurnReceipt 已有存档 ID、请求幂等键、结果 revision、规则事件及规则版本；服务端事务关联事件 before/afterRevision 与存档更新。叙事表目前记录尝试/状态，不保存完整生成正文。原文 sourceId、生成版本和未来 visibilitySnapshotId 属于本轮实验提案，不能认定正式服务端已有这些字段。未使用尚未合并的 PR #83 能力。

## 数据结构与三个功能

每条记录包含 sourceId、saveId、branchId、ownerId、revision、idempotencyKey、narrativeText、sha256、generationVersion、visibilitySnapshotId。正文 SHA 根据原始文本 UTF-8 字节计算；visibilitySnapshotId 显式为 null 或字符串，只作关联，不授予权限。

每条来源一个 UTF-8 JSON 文件，按 owner/save/branch 数组的 SHA256 分目录、sourceId 的 SHA256 命名。封套为 `{format:'p6-original-narrative-v1',record,recordSha256}`，额外记录摘要用于校验来源和 revision 等元数据。

- 保存：原文完整写入，不裁剪、不摘要、不转换换行、不改写句子。
- 加载：从磁盘重新读取，验证格式、scope/source、正文与元数据摘要，再恢复记录；文件缺失返回 undefined，损坏明确报错。
- 重复：同一 scope/source 完全相同记录返回 duplicate，不新增、不改写；正文或元数据不一致报 SOURCE_CONFLICT，原记录保持不变。

## 8 项测试

| 测试 | PASS / FAIL |
|---|---|
| 长中文正文、CRLF、空白、emoji 保存/恢复字节一致 | PASS |
| 独立写入进程退出，再由独立新进程恢复正文及全部来源 | PASS |
| 正文 SHA 正确，拒绝调用方提供伪 SHA 与非完整 Unicode | PASS |
| 相同来源重复保存仅一条记录，文件字节不变 | PASS |
| 同标识正文、revision、生成版本或快照变化拒绝覆盖 | PASS |
| 账号、存档、分支分区不交叉读取，同标识各域独立 | PASS |
| 截断、无效 UTF-8、正文/元数据/身份损坏明确拒绝恢复 | PASS |
| 同一存档不同 revision 保留各自原文、来源请求及生成版本 | PASS |

结果 8 PASS / 0 FAIL，Node 语法检查通过。正文恢复后的 UTF-8 Buffer 与输入逐字节一致；独立子进程测试验证不是依靠同进程内存恢复。损坏测试也验证重复写入不会悄悄覆盖坏文件。仅保存一份测试日志和简短 JSON 摘要，没有提交大型剧情库或成百份重复日志。

## 缺陷与正式接入缺口

最小测试未发现未预期功能失败，但以下能力明确未实现：文件写入不是多记录事务，没有 fsync 或原子发布，写到一半失败可能留下不完整文件；读取/重提会明确报错，不能据正常退出恢复宣称崩溃、并发或断电安全。

「不可变」只覆盖本 API 拒绝覆盖来源的语义，不是操作系统防篡改。拥有文件写权限的人可修改正文并重算 SHA；摘要不是签名。分区 scope 是可信调用方输入，不等于真实身份认证与所有权授权。

正式接入仍需服务端会话/存档所有权校验、稳定 sourceId 与生成尝试设计、回执/revision 一致性校验、NPC 逐段/字段授权及快照解析、合适的原子持久化和错误恢复、并发策略、备份/迁移/生命周期规则。这些均未施工。玩家能够恢复正文不代表 NPC 获得任何知情权；本原型没有 NPC 读取接口，null 或非空快照都不授权。存储成功也不把正文中的说法提升为权威世界事实。

未运行旧 P6 检索大评测、整仓构建、生产数据库、浏览器或线上测试：本轮只增加独立标准库文件原型，旧代码无改动。未调用真实模型，使用合成正文模拟生成结果，未引入第三方或付费服务。

## 文件与操作边界

新增共 8 个仓库文件：实验 store.cjs、store.test.cjs、README.md、.gitattributes、.gitignore、evidence/tests.log、evidence/summary.json 和本回执。另在圈内交接目录提供同名副本。

旧 P6-01/02/03/03.1 代码、冻结答案与证据保持不变；生产 apps/packages/scripts/deployment/根依赖及锁文件与 main 无差异。未修改 main、临江仙 P3/PR #83、正式 P4/P5/P6、数据库、迁移、Canon 或世界书，未合并 main 或部署。

测试临时记录在本独立实验目录下生成，结束时检查真实绝对路径后清理；无旧文件删除。全部实际写入位于水龙吟专用项目/交接目录，未写入圈地外目录。约 30 分钟预算内收口，停止扩大存储架构。

复现：`node --test --test-reporter=tap tests/experiments/p6-longmem-durability/store.test.cjs`。原始日志及 JSON 摘要在实验 evidence 目录。
