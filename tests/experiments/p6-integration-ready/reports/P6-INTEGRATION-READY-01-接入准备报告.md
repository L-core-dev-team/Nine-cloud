# P6-INTEGRATION-READY-01 接入准备报告

日期：2026-10-13。结论：本轮独立离线实验、只读审计、契约提案、性能基准及本地交付已完成；正式接入仍有 6 项 BLOCKED。本报告不批准生产修改或远端发送。

## 范围与固定输入

唯一工作区：水龙吟专用/项目/Nine-cloud-P6-integration-ready-20261013；分支 shuilongyin/p6-integration-ready-20261013；研发基线 7ff824791c3dfc0a544728b29c7ddc24b7857b26。所有新增研发位于 tests/experiments/p6-integration-ready/，报告另复制到圈内交接目录。没有修改生产、旧 P6、P4/P5、Canon、main、P3/PR #83、数据库迁移或其他工作位。

本轮正式函数审计固定于 main 快照 2647439e0cccc9a136606a81131519f53253f125；P3 审计固定于道主指定候选 f159b5468966fb95f91cc9ab7bbcdf6cd665c3bd。它们是冻结输入，不能据此声称当前远端状态或候选已合并。恢复时20份暂停文件哈希全部匹配；23份正式源哈希匹配，21份实际转换加载的JavaScript与对应Git源码转换结果逐字节一致。无需重建worktree或重跑旧研发。

## A–E交付

|任务|本轮交付|生产限制|
|---|---|---|
|A 入口契约|补齐policy、ruleFactRefs、publication/lifecycle/search DTO；静态消费者兼容检查＋严格运行时schema核验|仅待审草案，未绑定真实服务端ports|
|B NPC对抗|42项桥接用例；20个稳定NPC身份的隔离、授权、撤权缓存测试；旧关键安全回归74项|合成会话及授权，不能证明真实认证|
|C 来源/防幻觉|独立核验原文UTF-16偏移、SHA、回执、attempt、版本、grant；严格证据DTO；万回合独立核验|叙事只作为原文证据，不成为规则状态|
|D 性能|完整两套10000回合／同300题／四预算基准、原因定位及安全缓存A/B|只交基准与下一步方案，未实现增量索引或按需正文生产方案|
|E 交接|本报告、P6→P3需求清单、对抗与性能报告及最终回执|未发送给临江仙，未创建整合PR或部署|

## 六种状态必须分别判断

1. 行动结算：只能由通过正式TurnReceiptV2Schema校验、scope和requestKey匹配的权威回执确认。accepted且outcome为legal_failure仍是已结算；叙事失败不撤销行动。
2. 叙事生成中：只返回generating，不保存不存在的正文。
3. 叙事失败：保留failed，不生成替代原句，不换新幂等key重做行动。
4. 正文保存：绑定receiptKey、receiptSha256、sourceId、attemptId、generationVersion及generatorSource，不可覆盖；同回执多个版本另存，未指定版本遇歧义拒绝猜测。
5. NPC可读：由真实逐段grant和版本化授权快照确认；正文保存成功仍返回npcMayRead=unknown。在场、参与事件、全文ACL都不能代替听见某段原文的授权。
6. 规则确认：只引用已确认RULES事件中的字段。原文修辞、角色自述、总结或未授权规则字段均不得自动变成世界状态；generatedAnswer固定null。

生命周期查询新增校验正文所属回执及回执摘要，避免把另一行动已保存正文报告成当前行动正文。检索新增精确audience形状、合法来源/版本ID及安全整数observedAtRevision校验；畸形片段证据在缓存序列化前拒绝。

## 类型与运行时兼容的实际证明范围

contracts.ts引用真实SaveMemoryPolicy与AuthorizedRecallObservation类型；contract-check.ts检查调用者和必需字段；runtime-schema.ts用ZodType静态对齐EvidenceResult、PublishResult及LifecycleResult，并严格校验真实测试返回。bridge.d.cts是消费者声明，不是CJS实现逐行静态类型化。最终TypeScript及Node语法检查通过；这些结果证明草案DTO和已覆盖的运行路径兼容，不证明P3生产端或所有未知故障路径兼容。

## 生产阻塞与P4/P5裁定

P01真实会话/存档所有权，P02逐段正文→grant映射，P03历史/撤权快照一致性，P04 P4/P5策略入口及计数裁定，P05 P3叙事发布元数据，P06 PostgreSQL发布/读取事务竞态保证均为BLOCKED。fixtures中的WeakSet不是认证；合成授权oracle不是生产授权。

固定输入elapsed=20160、later=0、query=旧灯：真实P4 explicit recall可访问度0.25、forgotten；真实P5 narrative托底0.35、保留1条。P4统计严格更大的eventRevision，P5统计稳定观察序列中后续条目，包含同revision。原型明确只允许p4-explicit-recall；未指定或要求P5统一语义时BLOCKED。

待临江仙／道主决定：方案一保留调用面各自语义，接口明确surface、计数及策略hash；方案二审议统一语义后修改权威契约与回归。前者少改动但行为必须清楚解释，后者一致性更强但会改变既有遗忘行为与历史策略身份。水龙吟没有擅自选择或修改P4/P5。

## 验收证据

- evidence/resume-01与formal-runtime-01：暂停现场及固定正式源码核验。
- evidence/security-04：42 PASS、0 FAIL、6 BLOCKED；security-01原始42 FAIL完整保留。
- evidence/audit-03：20 NPC、25 PASS、0 FAIL；包括严格返回契约与独立来源审计。
- evidence/checks-01：旧存储/整合21 PASS，旧Lexical/Prose/Hardening53 PASS；仅本轮临时scratch由旧测试自身清理。
- evidence/checks-05：最终严格TypeScript与全部新CJS语法检查通过。
- evidence/legacy-01：旧独立P6接入缺口5 PASS、8 FAIL；不宣称生产漏洞或已经修复旧代码。
- evidence/performance-01、performance-verification-02：完整新基准与独立核验；3道既有原文题仍失败，无新增回归。

下一步先由临江仙审阅P6→P3需求、裁定P4/P5入口并落实真实认证与逐段快照；随后在获批范围实现服务端适配器与真实数据库竞态测试。禁止用夹具通过结果解除这些门槛。本轮不推送、合并、部署或调用付费服务。
