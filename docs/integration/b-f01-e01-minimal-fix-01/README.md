# NINE-CLOUD-B-F01-E01-MINIMAL-FIX-01

仅从封存B线 d4eda3af 进行F01退出异常和E01元数据修正，不进行A/B整合。

F01复用原IndexedGameCache.clearAccount、scope和epoch。clearCloudGameAccount分别尝试清理与广播，抛出包含各自结果的错误；广播发送成功后关闭失败不冒充发送失败。账号页面独立尝试Logout，成功后清除当前登录视图，失败时不声称已退出。缓存残留与通知失败分别显示。未改认证服务、缓存实现、提交/恢复状态机或其他账号数据。

新增 tests/e2e/cloud-logout-faults.cjs 的8个模拟场景：清理成功/注销成功；清理失败/注销成功；清理失败/注销失败；广播构造失败；广播发送失败且清理失败；广播关闭失败；广播不可用；注销期间旧游戏读取迟到。各场景核对Logout请求、界面、提示和其他owner/apiBase缓存保留。迟到响应复用原abort/isCurrent防护，没有另建状态机。

相关回归复用原 cloud-game-recovery.cjs（390宽度，含正常退出、GET-only恢复、原键显式重试、账号/档隔离）和既有cache/receipt-validation/errors三文件14项单测。不重复编写已有充分覆盖的正常路径。它们不是T1数据库十四项或T1全套验收。

E01更正见 E01-METADATA-CORRECTION.json。原恢复脚本未改，其最终Blob为123fbb7c337a2f27aade43d3df6d93a45de6df79。交接中的更正副本仅改一个finalBlob字段，保留原件及SHA证据。历史PASS不改日期；本次定向实跑单独登记。

最终Commit、Tree、原现场保护、完整日志和校验索引见水龙吟专用/交接/NINE-CLOUD-B-F01-E01-MINIMAL-FIX-01/HANDOFF.md。服务器publication仍阻塞；角色卡仍仅设计。完成本任务即停止，不推送、PR、合并、迁移、部署或联合整合。
