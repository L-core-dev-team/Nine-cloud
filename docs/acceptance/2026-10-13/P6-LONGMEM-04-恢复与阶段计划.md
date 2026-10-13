# P6-LONGMEM-04 恢复与阶段计划

2026-10-13。工作区：水龙吟专用/项目/Nine-cloud-P6-longmem-04-reliability-20261013。
分支：shuilongyin/p6-longmem-04-reliability-20261013；恢复 HEAD：ffd0e90e1f2d9e1bb08380678b374496708d5257。

## 恢复事实

已检查 git worktree list --porcelain、status --short --untracked-files=all、branch -avv、log、reflog、remote，以及所有圈内 P6 worktree 的状态和最近提交。所有 P6 worktree 均干净。目标 worktree 已存在，不另建、不 reset、不 clean、不 checkout、不覆盖已有成果。

目标 reflog 只有 12:01:41 建立 HEAD 和 12:01:47 的既有 reset: moving to HEAD；这是恢复前的历史记录，不是本轮执行的操作。P6-04 没有后继阶段提交、未跟踪文件、专属测试日志或任务计划。交接目录最新 P6 回执为 PRE；圈内输出目录也未发现 P6-04 任务文件。结论是本轮可靠性工作尚无落盘证据，不能把 PRE 8 项通过当成 A/B 已完成。

远端 git ls-remote 核对 main 为 2647439e0cccc9a136606a81131519f53253f125；本地 origin/main 一致。目标独立分支还未发布。main 本地分支较旧，不切换或修改。

历史成果：01 67e4692；02 d6c2f15；main-sync 1c7abe2；03 5e08cad；03.1 e3e6caf；PRE ffd0e90。PRE 源码 103d1fa，8 PASS/0 FAIL，但明确不具备 fsync、原子发布、多记录事务和崩溃保证。03/03.1 检索器与旧冻结证据仅只读复用。

已读取根 AGENTS.md；其 Canon/世界书专项要求不涉及本实验，没有修改原设。实验目录没有更深层 AGENTS.md。读取 PRE 回执和存储源码、03 README、03.1 源码/测试及现有数据与评测契约，仅阅读此次接续需要的信息，不重跑历史大评测。

## 恢复时阶段状态

| 阶段 | 状态 | 证据及接续计划 |
|---|---|---|
| A 可靠原文存储与原子提交 | NOT STARTED | PRE writeFile wx 明确不是原子持久提交。新独立目录采用 Node 内置 SQLite，单事务保存原文字节、来源、模拟权限快照与幂等身份。 |
| B 故障注入、多进程并发和幂等 | NOT STARTED | PRE 仅正常进程退出；新增真实子进程中断、事务边界故障、竞争、冲突、损坏和重启测试。 |
| C 落盘原文与检索/权限模拟整合 | NOT STARTED | 旧 LexicalIndex 读取内存 Dataset；新适配器必须从磁盘完整校验与恢复，先过滤权限和时点，再构建旧检索器。 |
| D 1000/3000/10000 回合 | NOT STARTED | 旧复杂千回合数据只读复用；新可复现扩展将剧情节点分布到整个时轴；独立进程写入与恢复，记录旧公开题和新增场景。 |
| E 性能、成本、恢复 | NOT STARTED | 新日志单列写入、恢复、索引构建、查询、字节/内存与 token 估算，不调用真实 AI 或声称真实账单。 |
| F 生产接入设计 | NOT STARTED | 最终提出服务端事务、鉴权、快照、逐段权限、备份、迁移和部署门槛，不修改生产系统。 |

阶段完成证据和最终状态另写完整报告，不回改这份恢复时快照。只修改新实验 tests/experiments/p6-longmem-reliability、当日验收文档及圈内交接。禁止修改 main、P3、生产数据库、Canon、P4/P5 和旧 P6 冻结证据；不自动合并或部署。
