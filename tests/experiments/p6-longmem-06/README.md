# P6-LONGMEM-06 独立融合候选

基线：6ed7e0f8cfbd21307db768b98a1cda1830ec5739。算法稳定提交：5326682fdd343394f984ff24dc29f31514509b3d。最终保留集冻结：2249c17274f91f02db58bb7eac3b4a604a1fea8d。

原05C所有文件、冻结题目、结果、日志及SHA清单原样继承，未改。原05B工作区与备份只读。只新增本目录，不接生产Reader/PostgreSQL、P3/P4/P5或Canon。

核心修改：evidence.ts的引号栈与原子证据、typed.ts的来源/主体/事实绑定与充分性、retrieval.ts的对白专用边界及说话者过滤。非对白沿用05C句子表示。policy.ts是所有比较实现使用的相同离线整体来源知情窗口替身，不是正式授权服务。snapshot.ts复制冻结缓存替身做回归，没有升级生产缓存。

原版、05C、boundary、sufficient分别表示：原词法、05C候选、只修边界的对照、最终保守充分性候选。boundary刻意保留较弱的选源和权威过滤作为消融，不能生产启用。

fixtures/development-*为首次公开生成资料，限定别称存在跨场景重复风险；development-v2-*为修正后的公开开发资料；blind-*及blind-01成绩因后来收窄公开回归误拒而转公开回归。最终未用于调参的是blind-v2-*，冻结后不按答案修改候选。每批保留seed、源文、账本、题目、元数据及SHA，禁止覆盖已存在的manifest。

新世界明确提供独立作者生成的、绑定原文hash与完整区间的fact provenance；它不含问题ID映射，不由检索器产生，但降低了复杂跨句绑定难度。100%合成保留分数不等于自由真人叙事或缺失可信出处字段下的泛化能力。原05C没有这些绑定，公开回归保留真实误拒。

在仓库根目录使用Node v24.19.0执行，所有run名必须为新名称：

```powershell
node tests/experiments/p6-longmem-06/checks.cjs review-checks-01
node --test tests/experiments/p6-longmem-06/adversarial.test.ts
node --test tests/experiments/p6-longmem-06/safety.test.ts tests/experiments/p6-longmem-06/continuity.test.ts
node tests/experiments/p6-longmem-06/curated.cjs review-old-01 old
node tests/experiments/p6-longmem-06/curated.cjs review-public-01 public
node tests/experiments/p6-longmem-06/new-evaluate.cjs review-new-dev-01 development-v2
node tests/experiments/p6-longmem-06/new-evaluate.cjs review-blind-01 blind-v2
node tests/experiments/p6-longmem-06/verify.cjs review-verification-01
node tests/experiments/p6-longmem-06/performance.cjs review-performance-01
node tests/experiments/p6-longmem-06/proof-ledger.cjs review-trace-01
```

verify/proof-ledger针对已经归档的指定运行验证，新run名只改变核验输出目录。TypeScript使用圈内main-sync工作区现有依赖，未安装新服务或调用付费API。make-fixtures只供新批次首次生成，不允许覆盖现有fixture。

性能在质量任务结束后单独顺序执行AB/BA新进程，记录相同数据、题目和四预算的P50/P95、RSS、heap、序列化索引估算及准确率。未固定整机背景负载、CPU/GC；不是生产SLO，索引估算不包括全部Map/Set和运行时开销。

P01–P06全部生产BLOCKED。特别是角色/存档真实性、逐段grant、发布原文hash、规则回执、历史/撤权/遗忘快照及finishRead事务复核均须真实Reader提供。当前ranked/evidence带整条原始Source用于离线审计，不可直接作为生产NPC正文DTO。
