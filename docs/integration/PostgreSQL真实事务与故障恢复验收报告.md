# PostgreSQL真实事务与故障恢复验收报告

日期：2026-10-14。结果仅适用于当前独立候选；受测提交及文件指纹在本地证据记录中绑定，不引用旧P3测试代替本轮验证。

证据目录：`C:/Users/11954/Documents/Codex/p3-test-tools/p3-p6-stage1`。数据库 PostgreSQL 18.4、专用127.0.0.1:55441、schema 0022。数据库名由 migrations.json 记录；未连接生产服务。

| 命令/证据 | 实际结果 |
| --- | --- |
| pnpm typecheck / typecheck-3.log | exit 0 |
| pnpm build / build-3.log | exit 0；仍有既有包体积警告，不扩展优化 |
| pnpm test / unit-3.log | exit 0；705项Vitest + 7项Node测试；普通单测52项PG依赖跳过，另行真实库验证 |
| pnpm test:integration / integration-final.log | exit 0；13文件62项真实PG测试，其中新正文专项15项，包含outbox身份保护 |
| node scripts/narrative-publication-migration-check.cjs / migrations-final.json | 最后SQL版本4场景PASS：空库、0021升级、中断回滚、冲突拒绝；每场景重复迁移；旧v1/v3逐字段保留 |
| node tests/e2e/cloud-game-publication.cjs / browser-2.log | exit 0；真实PG、会话、HTTP、构建后的390px页面；清空缓存、新登录上下文仍返回同一source；生成次数1、行动提交次数0 |
| pnpm test:e2e / e2e-full.log | 首3个脚本及20组视觉基线PASS；随后因命令漏传TEST_DATABASE_URL退出1，保留日志 |
| 补齐数据库后逐个运行剩余8脚本及新正文专项 / e2e-*.log | 每项exit 0；完整脚本清单分段完成，不宣称原单条命令exit 0 |
| GitHub Actions | 未运行；本轮未授权推送，不借用历史CI |

浏览器专项和新正文SQL专项使用**合成规则回执**。认证、数据库和HTTP不是模拟，但此证据不证明正式权威规则接线完成。旧玩家回归与新原文专项是两组不同链路。

## 故障矩阵实测边界

| 项 | 结果及缺口 |
| --- | --- |
| I01 行动/结算幂等 | 旧P3路径有回归；新增正文T1实际玩法接线BLOCKED |
| I02 生成尝试；I03 原文发布 | 12连接只获一个有效租约；重复同文同source、异文拒绝，PASS |
| I04 尝试版本 | 过期尝试隔离、epoch递增、迟到worker拒绝，PASS |
| F01 T1回滚 | 合成事务回滚回执/事件/正文任务，PASS；真实游戏注入BLOCKED |
| F02 提交后恢复 | 独立worker与持久读取已测；生产进程重启调度未接线，PARTIAL |
| F03 未接受请求 | seed拒绝且零生成任务，PASS |
| F04 上下文缺失 | 未配置对应renderer拒绝；上下文缺失专门故障注入尚未执行，PARTIAL |
| F05 生成失败；F06 外部未知 | 失败保留已结算状态，PASS；无外部模型调用，F06本阶段不适用 |
| F07 发布事务失败 | index outbox触发器故障注入，正文/发布一起回滚，PASS |
| F08 索引失败仍可读取 | 发布读取不依赖P6索引；真实索引worker故障尚未执行，PARTIAL |
| F09 身份；F10 哈希 | 错误关联SQL拒绝、只读API所有权、前端正文损坏拒绝，PASS；磁盘/恢复损坏实测未做 |
| F11 两标签不同key冲突 | 既有玩法回归；新增T1真实链路BLOCKED |
| F12 越权 | 真实token异账号404、预期账号不符401、过期会话401，PASS |
| F13 登出迟到 | 沿用客户端isCurrent检查；正文专用延迟响应退出竞态尚未独立注入，PARTIAL |
| F14 关闭/删除 | 关闭后迟到publish拒绝；恢复可读；真实到期删除依赖清除，PASS；同步竞争窗口需追加测试 |
| F15 长度 | UTF16/UTF8双限、中文/emoji/BOM/CRLF、非法代理对、最终正文超限失败，PASS |
| F16 旧记录 | legacy-body-unavailable、不会自动重生成，PASS |
| F17 备份恢复 | BLOCKED：当前内置PG不含pg_dump/pg_restore；未生成备份，未以JSON导出冒充恢复验收 |
| F18 新旧writer隔离 | 只存在待审补丁，BLOCKED |

X01–X12中NPC段授权、授权快照及P4/P5生产适配未启用。当前身份/发布/来源边界只覆盖玩家正文子集，不宣称整组通过。

## 容量样本与失败记录

capacity.json记录32条合成短正文，共613 UTF8字节，source表含索引65536字节；整个测试库约12MB（含其他回归数据和历史残留）。这个样本不能预测万回合生产成本，也不是生产限额批准；没有完成WAL/冷备容量和恢复测量。

保留历史失败日志：前端夹具空事件/非法UUID已修复（unit.log、unit-2.log），未降低Schema；browser-first为缺浏览器执行文件，后使用本机Edge通过；早期SQL/夹具错误修复后迁移和真实集成已通过。原失败不删除、不冒充最终PASS。

分段后续命令为 `node tests/e2e/<name>.cjs`，name依次为prologue、p1-authenticated-candidate、p1-action-suggestions-ui、p2-authoritative-idb、p2-gameplay、cloud-game-cache、cloud-game-recovery、cloud-game-shell、cloud-game-publication。全部退出0。视觉基线4508文字/572边界样本通过；没有修改视觉验收阈值。
