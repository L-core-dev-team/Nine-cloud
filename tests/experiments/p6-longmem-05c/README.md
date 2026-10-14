# P6-LONGMEM-05C 独立研发候选

基线 cb4fb64bd82ae13e892df35c24cacb6a53bf2536。05B 字节保护提交 ddf0637c39948bea022244a0787c986fe7425eeb。

仅离线实验，未接生产 Reader、PostgreSQL、P3/P4/P5、NPC 正文或 Canon。P01–P06 生产 BLOCKED 保留。代码不读取题号、金标准、来源 ID 或特定角色名称作检索决策。world.ts 仅作为合成语料作者和独立账本生成器。

用 Node v24.19.0 在候选仓库根目录运行，每次使用未存在的新 run 名。失败日志不覆盖。

```powershell
node tests/experiments/p6-longmem-05c/checks.cjs review-checks-01
node --test tests/experiments/p6-longmem-05c/safety.test.ts tests/experiments/p6-longmem-05c/continuity.test.ts
node tests/experiments/p6-longmem-05c/quality.cjs review-old-01 old
node tests/experiments/p6-longmem-05c/quality.cjs review-dev-01 all development
node tests/experiments/p6-longmem-05c/quality.cjs review-holdout-01 all holdout
node tests/experiments/p6-longmem-05c/old-performance.cjs review-old-perf-01
node tests/experiments/p6-longmem-05c/performance.cjs review-long-perf-01
node tests/experiments/p6-longmem-05c/export-evidence.ts review-export-01
node tests/experiments/p6-longmem-05c/verify.cjs review-verify-01
```

fixtures/ 已冻结，勿重跑 freeze.ts 覆盖；该生成器仅供新的独立目录首次建集。quality 从脚本生成数据，核验器对照已经冻结的数据 SHA，检测漂移。TypeScript 检查使用圈内 main-sync 工作区既有依赖；旧性能运行器读取圈内 integration-ready 历史离线输入并先复制 SQLite 到自己的 .runs，再测量；不写原 SQLite。归档快照在 evidence/old-perf-01/*-snapshot.sqlite.gz，可恢复到圈内新路径复测。

baseline 是旧原版词法；fixed 是有限位置/天气/物理事件修复；conditions 加入有限条件识别和未知逻辑拒绝；event-time 加入绑定物理事件加分，并保持既有历史/当前排序；evidence 尝试预算不足时选择最强完整句。实验没有证明后两者额外提升，应优先审查最小修复及条件机制。

SnapshotRecall 是版本化整体来源授权模拟，仅用于缓存边界研究；策略参数不是正式 P4/P5 授权裁定。序列化缓存尺寸不是 heap 硬上限，Promise 调度不是并行 CPU 吞吐，partial incremental 只复用句子匹配表示，未实现增量 RULES/数据库视图。所有真实接线需要正式 Reader。
