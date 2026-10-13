# P6-ADAPTER-01 模块接入与Reader对接说明

日期：2026-10-13。状态：独立原型／待审Reader契约。道主告知阶段0仍为REVIEW_READY，未正式冻结；本文件不声称已获P3接口批准。旧清单P01–P06六项生产BLOCKED全部保留。

## 模块与依赖

核心入口adapter.cjs的ReadOnlyAdapter只调用五个注入的可信Reader方法，无save/publish、认证实现、授权政策、SQL或模型调用。它复用P6-04 canonical/digest，以及上一轮EvidenceResult和正式TurnReceipt校验器；不修改旧模块，不运行旧42项桥接测试。

reader.ts是本轮Reader提案；adapter.d.cts是消费者声明。原型用已授权证据组装和验证返回，不从正文、在场、事件参与者或全文ACL推断授权。它没有将旧全文索引接进真实服务；retained-recall.ts另作冻结快照性能实验。

开发默认tooling.cjs只读加载原水龙吟工作区已生成的正式函数和旧DTO schema。实际调用者可以直接注入receiptSchema/evidenceSchema；外部工厂CLI也支持导出validators对象或函数，因此联合验证无需开发工具路径。仓库内复用时保留冻结依赖，不搬动旧验收证据。

## 最小调用

```javascript
const {ReadOnlyAdapter}=require('./adapter.cjs');
const adapter=new ReadOnlyAdapter(reader,{
  receiptSchema:TurnReceiptV2Schema,
  evidenceSchema:EvidenceResultSchema,
  timeoutMs:5000
});
const evidence=await adapter.search(serverSession,{
  text:'旧灯',budget:2048,audience:{kind:'npc',npcId:'stable-npc-id'},
  policySurface:'p4-explicit-recall',asOfRevision:4
},{signal:requestAbortSignal});
```

serverSession只能交给真实Reader验证，不能把客户端ownerId或NPC声明作为认证。NPC的最终可读范围仍由服务端授权投影决定；非root分支未获契约支持时拒绝。

## 临江仙需要提供的可信接口

|方法|可信输出与责任|P6检查|
|---|---|---|
|beginRead(session,query,{signal})|真实会话/所有权核验；返回ready+ReadSnapshot或denied/unavailable|契约版本、snapshotId、scope、root、audience、surface、revision/asOf/gameMinute及三个epoch/hash；历史请求须精确回显|
|readAuthorizedEvidence(snapshot,query,{signal})|完整、同一snapshotId的已授权EvidenceResult；在真实P4或P5入口作政策判断|DTO严格校验；complete=false或跨快照拒绝；所有片段与受众、策略、时点一致|
|readPublishedOriginal(snapshot,sourceId,generationVersion,{signal})|可信已发布正文、publicationId、scope、receipt/attempt/version/source、SHA及publishedAtRevision|原文UTF-8 SHA和UTF-16段偏移、正文来源绑定；未发布、历史时点尚未发布不可当证据|
|readConfirmedReceipt(snapshot,key,{signal})|confirmed+正式完整回执，或unknown|正式schema、scope/key/revision、accepted及canonical SHA；RULES字段确切存在且值相同|
|finishRead(session,snapshot,{signal})|再次核验会话及当前授权，确认相同快照仍有效；changed/denied/unavailable均拒绝|只能在unchanged且完整snapshot与起点相同后返回已组装证据；不只看旧epoch|

ReadSnapshot为p6-reader-proposal-v1，含scope、snapshotId、revision、asOfRevision、gameMinute、audience、policySurface、visibilityEpoch、memoryPolicyHash、forgettingEpoch。此版本标识是本轮提案，不是阶段0正式冻结版本；冻结时应由临江仙统一映射／裁定。

所有读取应为不可变JSON DTO。P6复制查询、Reader参数和返回件；各并发请求有独立上下文。Reader负责固定授权快照与实际数据库一致性，P6不实现PostgreSQL事务。AbortSignal和5秒默认总期限只控制P6停止消费、丢弃晚到结果；Reader须自行处理取消和资源清理。

## 证据返回与权威边界

返回沿用EvidenceResult：status/reason/items/generatedAnswer/estimatedTokens/authorityUnknown。items包含原句、UTF-16偏移、source/segment、原文SHA、revision/asOf、receipt key/SHA、attempt/version/generatorSource及authority/authorization。预算按ceil(UTF-8正文bytes/2)估算，完整段预算不足返回insufficient且无items。

原文是original-prose-only，主观说法仍unverified-claim；只有Reader已授权、正式RULES回执实际包含的字段可作为confirmedRuleFacts。模块不推断原文其它句子的规则真值，generatedAnswer固定null。正文只供内部完整性核对，不把未授权全文交给模型或返回客户端。

P4/P5由Reader显式给出policySurface与已裁定结果。P6不重算遗忘曲线、不复制常量、不跨面兜底。同一回执有多个source/attempt/version时，缺乏明确已授权sourceId选择就返回publication-choice-ambiguous；仅generationVersion不证明同一标签下的某次attempt为正式版本。

## fail closed 条件

身份或Reader不可用；缺失／不匹配surface；分支或scope不符；未知契约版本；历史边界不匹配；不完整授权投影；快照或grant epoch/hash不匹配；原文未发布、缺失、损坏或晚于查询时点；来源/attempt/version/回执不符；偏移不符；RULES事实未经实际事件确认；版本歧义；超时/取消；查询结束会话、授权、政策、时点或snapshot变化。这些情况返回空items，不写存储、不生成替代正文、不重试行动。

失败已为空items时可提前终止；任何拟交付的证据及可信空结果都需finishRead复核。复核有效点是服务端finishRead认可的线性化时点；完成后撤权使下一查询拒绝，不能追溯撤回已经交付的字节。长时间后消费证据需要服务端重新验证，不把一次旧快照当永久权限。

## 未来真实Reader运行同一测试包

```powershell
node tests/experiments/p6-adapter-01/run-contracts.cjs fresh-run-name path/to/real-reader-factory.cjs
```

工厂导出createHarness(fixture)，返回reader、opaque session、control(action)、metrics()、close()；可另导出validators。runContractSuite也可在项目测试器中直接导入并注入工厂／校验器。reader-harness.example.ts仅为类型骨架，默认抛出未实现错误；没有假PostgreSQL接口。

工厂负责在独立测试数据库装载catalog中的scope、已确认receipt、已发布原文、多attempt、历史发布时点及显式NPC grants；实现revoke和revoke-without-epoch测试控制，记录Reader调用和写入计数，清理自己安装的数据。测试控制属于测试环境，不是生产授权政策。P6不提供SQL迁移、认证或事务实现。

异常snapshot/receipt/projection等故障由测试包在复制的返回件上注入，无需工厂向数据库写入非法行。R08在原文回调处设置闸门并等待适配器默认5秒期限，晚到结果不得交付；不会要求真实数据库正常读在30ms内完成。后端若不能安装某待审场景，应报告明确BLOCKED／契约差异，不能冒充通过。

## 仍需审阅的边界

真实会话及存档所有权(P01)、逐段映射(P02)、历史/撤权快照(P03)、P4/P5裁定(P04)、发布metadata(P05)、真实事务/竞态(P06)均未解除。本轮Reader提案把政策判断留在可信端，未来接口冻结后再作联合适配和真实并发测试。没有正式合并、部署、推送或对外发送。
