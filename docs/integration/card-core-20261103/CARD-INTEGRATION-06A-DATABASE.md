# CARD-INTEGRATION-06A 数据库隔离演练

当前产品候选 52dee1eec0cd45f521009cfa06ea83165b03872d / tree 5135bda4bb71c64b9043a8e0da747a9c24eb815f。专用 127.0.0.1:57463 测试实例、全新合成库；未访问生产数据。原始结构取 Git 对象 054daa0:apps/api/src/card-import/schema.sql：imports/cards/sessions/links/requests，greeting_index 已存在，cards(owner_id,import_id) 唯一。更早缺少 greeting_index 的旧版未在本轮演练。

TEST_ONLY SQL 由当前 schema 中的定义生成，隔离副本路径见本地交接；不注册 Drizzle journal，不是正式迁移：先撤原 cards 唯一约束，sessions 添加 recursive_worldbook NOT NULL DEFAULT true；按外键依赖创建 personas、persona_versions、session_personas、global_worldbooks、session_worldbooks、duplicate_requests、group_participants、group_participant_worldbooks、group_turns、group_messages、group_settings。旧 session 的 global 与 persona 关联为空，不依据当前默认设置补造；此起点没有旧群聊。此前中间版本已有 group_participants 但无 group_settings 的数据库需要另行回填 manual，本轮未演练。

两次独立合成旧库 PASS：保留原始 bytes、卡与关联、旧会话和已完成请求；关键行 JSON 哈希升级前后一致；中途 CREATE 前除零故障，整体回滚并确认 personas 不存在，数据哈希不变；升级后旧 session recursive=true，实际 CardImportService 读取旧历史；实际新 session recursive=false。添加引用同一原件的第二张卡后，重建旧唯一约束失败且两张卡保全。输出见本地 upgrade-results.json，候选 SQL SHA256 943bbd3171f93f2175e6fe877ef19a9d340c0df0f24edfb44ff6153b9815bf90。该合成旧库不覆盖全部历史版本、真实旧数据、恢复演练或执行角色权限。

混合版本：旧代码可能继续写入旧唯一约束预期及不同会话语义，不能从静态代码推定安全。建议停用旧写入者、备份及验证、一次事务升级、仅启用新版本并验证，再恢复流量；新旧并发实际 NOT VERIFIED。失败前事务回滚可保留旧状态；一旦新版本产生同原件多卡，禁止直接重建旧唯一约束或删除数据以强行回滚。应先冻结写入、保留升级后全量备份、设计经审核的数据保全和向前修复；恢复旧版涉及数据兼容，另行审批。
