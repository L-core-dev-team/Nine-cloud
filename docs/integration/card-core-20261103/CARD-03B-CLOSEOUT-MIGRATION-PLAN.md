# CARD-03B-CLOSEOUT 数据库升级准备（仅方案）

不运行生产迁移，不修改正式 Drizzle journal。以最终候选的 apps/api/src/card-import/schema.sql 为新库结构参考，真实旧库先通过 PostgreSQL catalog 确认各表、列、约束名和历史版本，不假设约束名或创建状态。迁移前必须停止或协调旧/新写入者、完成可恢复备份和隔离恢复演练。跨版本混跑未经证明。

建议在同一迁移事务：1. 如旧 sessions 缺 greeting_index，添加 integer NOT NULL DEFAULT -1 CHECK >=-1，旧行默认为原开场；核验已存在字段语义，出现不兼容定义则中止。2. 核验并移除 cards(owner_id,import_id) 唯一约束（根据 catalog 获取实际名称）；保留 PK 与 owner 外键。3. 创建 global_worldbooks（owner/import FK）、session_worldbooks（owner/session 和 owner/import FK）、duplicate_requests（owner/key PK、owner/card FK），索引/约束以候选 schema 为准。旧会话的 global 快照保持空集合，不能按迁移时的全局设置补造；新会话与全局设置使用同一 owner advisory lock。4. 核对用户/导入/卡/链接/会话/事件数量与哈希、旧会话行为、两套版本并发；完成后由授权人决定切换应用。迁移 SQL、锁持续时间、上线编排、权限及回滚均未正式审批。

回滚不能直接删除 global/session 快照、duplicate 请求或重建旧唯一约束：可能丢失会话含义、幂等记录及同原件多卡。先备份并导出保全新增数据，停止写入，独立审阅兼容映射；如果已有重复 owner/import，旧约束无法直接恢复。现有仅临时表模拟证明失败不删除数据，不能替代真实旧库升级/并发与灾备演练。
