# P6-INTEGRATION-READY-01（独立离线待审提案）

基线 P6-04 7ff8247；新分支 shuilongyin/p6-integration-ready-20261013。只新增本目录和当日三份报告，不修改生产、旧 P6 或 Canon，不推送远端。

formal.cjs 从固定 main 2647439 的 Git blob 原样读取正式契约和 P4/P5 源码，使用 Node 内置 TypeScript 类型转换到本目录 .runs/formal，只读使用圈内已有 zod。真实规则函数直接运行，不重写遗忘常量。formal-source-manifest 保存来源哈希；生成的包入口只缩小加载面，不改变函数实现。严格类型检查另用圈内现有编译器。

contracts.ts 是交给临江仙统一审计的 P6 需求草案，不是已批准的正式接口。当前生产并没有完整原文与逐段 source/hash/offset 的授权映射；这个依赖必须 BLOCKED，不能用整条来源 ACL 或“NPC 在场”推导授权。

所有输入均为合成离线夹具。正式生产数据库、会话/所有权认证、逐段 grants、撤权与缓存快照的一致性不由夹具证明。

## 本轮已完成交付（2026-10-13）

入口：[接入准备报告](reports/P6-INTEGRATION-READY-01-接入准备报告.md)、[P6→P3需求](reports/P6-P3-数据契约需求清单.md)、[对抗与性能报告](reports/P6-长期记忆对抗测试与性能评测报告.md)。CHECKPOINT-20261013.md保留暂停历史，不代表当前任务仍暂停。

最终证据：security-04、audit-03、checks-05；旧74项回归在checks-01。完整万回合性能见performance-01，独立核验见performance-verification-02，旧接入缺口在legacy-01。

重跑需选新的名称，原始失败与成功证据不得覆盖：

```powershell
node tests/experiments/p6-integration-ready/security.cjs new-security-name
node tests/experiments/p6-integration-ready/audit.cjs new-audit-name new-security-name
node tests/experiments/p6-integration-ready/checks.cjs new-check-name
node tests/experiments/p6-integration-ready/benchmark.ts new-performance-name
```

verify-performance.cjs用于核验已交付performance-01（输入固定），参数仅改变新证据目录名。runtime-schema.ts通过既有.runs/formal读取zod，不安装依赖；正式环境加载清单不可覆盖。benchmark使用完整两个万回合而非旧六组大benchmark。所有ports仍为合成夹具，生产六项依赖保持BLOCKED。
