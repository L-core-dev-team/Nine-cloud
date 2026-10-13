# P6-LONGMEM-04：原文可靠性与万回合离线闭环

独立实验，基线 ffd0e90；只读复用 P6-03.1 LexicalIndex，不被任何生产模块引用。使用 Node 24 内置 node:sqlite，无新增依赖，无真实 AI 调用。

`store.cjs` 用 SQLite WAL、synchronous=FULL、BEGIN IMMEDIATE 和唯一键实现正文 UTF-8 BLOB、来源/权限模拟快照、SHA、scope/source 与 scope/idempotency 的单行事务提交。SQL 更新/删除触发器辅助保持 API 不可变语义；具有文件管理权限的人仍可绕过，摘要不是签名。仅在这台本地 Windows 文件系统测试，不宣称断电或所有文件系统安全。

`adapter.ts` 从磁盘校验正文和元数据，绑定账号/存档/分支与 revision，以整条来源的冻结 ACL 和 as-of 模拟 NPC 读取。缺失或矛盾快照拒绝恢复；先过滤再索引，全文读取再次核对磁盘。索引为空缺回合建立占位槽以适配旧引擎的连续时轴验证；占位槽不含隐藏来源正文或身份。这不是生产身份认证、P4/P5 遗忘策略或逐段语义授权。

`workload.ts` 只读两份已解封旧千回合语料与公开答案。1000 回合原样复用；3000/10000 将旧 1000 节点单调分布到完整时轴，空缺回合填入独立合成巡检事件。旧 sourceId、事实值、历史链接、NPC ACL 和问答真值保持，时点/有效期同比映射。扩展剧情事件有独立批次，但数值模板重复，不能等同真人万回合或独立盲测。离线真值元数据含预先标注的未来失效期，查询投影必须去除尚未可知的元数据；不能冒充真实增量服务端授权。

在独立工作区根目录运行，每次换一个未使用的输出名称：

```powershell
node tests/experiments/p6-longmem-reliability/checks.cjs review-01
node tests/experiments/p6-longmem-reliability/benchmark.ts review-01
```

检查器只跑本轮新增存储/整合测试和相关 TypeScript 检查，编译器只读使用圈内 main-sync 的现有依赖。缺失时应明确报告，不自动安装或修改依赖。

benchmark 输出按新名称独占创建，拒绝覆盖。写入、读取在不同新进程完成；读取进程不加载原始剧情文件，核对恢复全文/来源根摘要后运行 512/1024/2048/4096 四预算公开兼容题。complex-10000 在第 5000 回合提交后硬杀写进程，再从头幂等恢复，必须恰好保留 5000 个重复和补齐 5000 个新提交。所有查询/偏移核验和失败无损保存于 evidence。性能区分事务写入、磁盘恢复、首次索引和查询；Token 仅 ceil(UTF-8 context bytes/2) 估算，不是实际账单。

数据库、WAL/SHM、运行配置位于本实验 `.runs/`，忽略不提交；测试只清理经过真实路径校验的本轮 `.scratch-*`，旧证据不改写、不删除。完整状态、缺陷和生产接入设计见 2026-10-13 验收报告。
