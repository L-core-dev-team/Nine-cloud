# INTEGRATION-HANDOVER-01 恢复断点

状态：PHASE1_A_RESTORE_VERIFIED / B_C_D_IN_PROGRESS。

道主已明确批准阶段1 A–D非签署工程、独立测试数据库、新独立副本修改/测试/证据/本地提交，以及阶段2只审查。未批准T1补丁、摘要更新、正式接线、推送、PR、合并或部署。

基线：dbae068d86e5f9cd188d6196e403ce6dd701a1de。
候选分支：shuilongyin/p3-p6-handover-01-20261014。
独立目录：C:/Users/11954/Desktop/水龙吟专用/项目/Nine-cloud-p3-p6-handover-01-20261014。
原临江仙目录只读，P6-05C/06/06A不动。原PG历史数据目录及数据库不得清理或重置。

圈内依赖缓存复制及离线冻结安装完成，PG18.6官方ZIP完整长度/CRC/SHA已核验。原报告PG18.4，本轮18.6，不能伪装同版本复跑。

临时ASCII路径J:映射仅指向圈内工具INTEGRATION-HANDOVER-01。PG中文路径首次初始化失败，新的J:/pgdata-handover-02初始化成功；实例只监听127.0.0.1:55461，角色handover_tester。不得操作55439/55441旧库。原启动PowerShell会话14963在pg_ctl后未继续完成（子进程句柄现象待收尾），服务器已从端口/日志/SQL核验启动，数据库改用Node pg驱动创建。

当前开发测试库jiuxiao_test_handover-03。首次创建的jiuxiao_test_handover_02保留不重置，其名称不符合旧测试守卫，已换新库而不是放宽标准。

四类迁移及重复迁移migrations-02 PASS；完整typecheck-03和build-01 PASS。Schema声明已补八表，结构校验尚待实施。

备份restore-01 PASS：源handover-03；全新恢复库jiuxiao_test_handover-restore-1791981614070；30表逐表摘要一致，2条正文SHA/默认发布/回执校验，关闭账号仍受限、依法删除账号无残留；快照后的1条发布正确排除。dump263.94ms，restore338.14ms，新库创建+恢复+核验645.25ms，112723字节。此小样本不代表生产RTO，不含WAL/PITR。证据位于backups/restore-01及runs/backup-01，所有先前失败保留。

下一步：八表Drizzle/PG结构校验；缺上下文明确失败修复；新并发/worker崩溃/索引读隔离测试；客户端历史分页与迟到响应；完整回归；T1仅影响审查。收尾停止本集群并解除J:映射。受签署文件不改，P01–P06继续BLOCKED。
