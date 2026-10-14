# P6-LONGMEM-06 最终融合候选与交接清单

日期：2026-10-14；执行：水龙吟。状态：离线REVIEW_READY，正式P01–P06继续BLOCKED。没有付费Embedding、外部模型或向量服务调用，没有访问生产数据库、真实玩家私人数据或临江仙工作区。

基线：6ed7e0f8cfbd21307db768b98a1cda1830ec5739。首轮冻结：d202db322a5a5b8f2d7f97aa30fde64c46ad28c5。最终稳定候选：5326682fdd343394f984ff24dc29f31514509b3d。最终保留批次在2249c17274f91f02db58bb7eac3b4a604a1fea8d冻结后首次评测，代码SHA由blind-v2-manifest.json固定，之后未按保留答案调参。归档提交SHA在最终交接回执另列。

工作区：C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-P6-longmem-06-20261014；独立克隆分支：shuilongyin/p6-longmem-06-20261014。只新增tests/experiments/p6-longmem-06及圈内交接成果。05C冻结资料、结果、日志、SHA原样继承；原05C和05B工作区不写入。

## 可复用测试工具

- scenario-world.ts、make-fixtures.ts、fixtures各批次：独立合成作者、事实账本、原文位置、已冻结题目和预算下界。未写Canon。
- adversarial.test.ts及原样旧测试副本：完整引号、多说话者、传闻、原子承诺、错误映射和原文完整性；safety/continuity复制在06验证。
- evaluate/new-evaluate/curated：四实现对照、分层公开与保留回归、实际完整返回及失败理由。
- verify.cjs、proof-ledger.cjs：独立评分/hash/UTF-16/知情窗口/事实来源核验与轨迹导出。
- performance.cjs：同数据/题目/预算、AB/BA新进程性能与非计时结果一致性检查。

## 可以评审的最小算法修改

evidence.ts提供引号栈、完整原文单元、说话者消歧和作者范围绑定验证；typed.ts是冻结HardenedIndex的独立副本，修改主体过滤、真正支持选源、原子预算、未绑定world-event过滤和充分性；retrieval.ts是05C独立副本，仅对白新建按需边界并保留非对白。可按review/两份差异审阅，不能直接改共享文件。

推荐先审查最小typed证据抽取及选源，再评审可信范围接口。boundary对照仍有错误来源和未绑定权威字段，只是消融，不推荐使用。最终候选公开保留仍有12失败与4新增误拒，不能称完全生产验收。

## 仍不允许生产启用

policy.ts的整体来源知情窗口、snapshot.ts的离线缓存/epoch替身、直接消费合成fact provenance、完整Source DTO给NPC、把unverified标签当真实世界状态、由猜测生成正式任务、无签署回执的world-event，以及宣称解除P01–P06的任何结果。旧缓存与正式P4/P5没有被修改。当前算法没有解决任意文学转述、无限指代和坏原文归属。

## 正式Reader必须提供的可信字段

会话/所有权与owner/save/branch/revision、授权受众及asOf、已发布原文sourceId/hash与UTF-16范围、publication/attempt/generation/receipt绑定；人物说法的实际speaker及reporter、发生与知情时点、关系/承诺事件主体对象及范围；真实RULES事件/版本/签署回执与确认来源；逐段grant、visibility/policy/forgetting epoch和P4/P5裁定；最后finishRead复核同一来源/发布/授权快照的事务保证。

可信字段只允许由权威服务提供，不由模型补造。说过/听说过某句话与内容为真分列；旧历史当前状态只在NPC可知的后继上更新。Reader接线前不得开放NPC正文自然语言读取。

P01真实会话/存档所有权；P02逐段正文→grant；P03历史/撤权快照一致性；P04 P4/P5策略入口及计数裁定；P05 P3发布元数据；P06 PostgreSQL发布/读取事务竞态保证，全部BLOCKED。未改main、PR83、临江仙整合分支、生产数据库/迁移、P3发布结算、P4/P5或Canon。

## 交付与复现

五份报告、独立代码、所有开发/保留批次、运行配置、实际结果gzip、失败JSON、原始日志、SHA与断点位于候选tests/experiments/p6-longmem-06。圈内交接目录C:/Users/11954/Desktop/水龙吟专用/交接/P6-LONGMEM-06提供报告副本、最终清单及回执。未通过工具给临江仙发送消息，未推送、PR、合并或部署。

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

Node v24.19.0；TypeScript复用圈内main-sync已有依赖，不安装外部服务。run名不可重复；make-fixtures禁止覆盖已有manifest。verify针对已归档指定运行，新名只改变输出目录。保留样本的作者可信范围依赖、有限模板重复及窗口替身局限见新保留报告，不将合成万回合冒称真人万回合。

## 文件边界及停工

新建：独立克隆中的06实验代码、测试、所有批次、日志、失败、报告、SHA及圈内交接副本。修改仅限这些本轮新建文件与候选自己的Git配置；删除无。所有任务写入在水龙吟专用/项目/Nine-cloud-P6-longmem-06-20261014与水龙吟专用/交接/P6-LONGMEM-06，圈外无文件写入。原05C干净、原05B未跟踪文件及备份未动，原始结论未覆盖。

本轮授权的离线研发及验证完成后停止，等待道主与道童审核；剩余语义缺陷和全部生产阻塞保留。

