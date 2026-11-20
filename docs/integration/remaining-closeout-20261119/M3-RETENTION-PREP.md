# M3 数据留存、消费对账与过期备份恢复审核回执

任务 NINE-CLOUD-M3-RETENTION-PREP-01。审核对象为 PR #113 合并后的 main `3c2305286acf8956eeba140dccc02bd2497bebe8`，Tree `2695598b7865a3276e43792356dacd86fd4212d0`。

**结论：过期快照隔离已有固定主线实测，向玩家重新开放仍为 BLOCKED。** 隔离实例里的旧行可能仍含已删除账号及较低消费计数。当前保护靠 PostgreSQL 拒绝应用连接。现有生产接线中未找到能独立于同一次数据库回滚、并完整覆盖消费与删除的对账记录。本轮未发现须立即修复的隔离工具业务缺陷。未来若需开放恢复库，须先补足下述证据和功能。

## 删除后实际留下什么

下表指已提交的本地永久删除。远端投递分阶段完成；快照、提供方后台和托管日志有各自的生命周期。

| 数据与字段 | 删除后状态及用途 | 身份关联边界 |
|---|---|---|
| `card_import.model_allowances(approval_id, binding, used)` | 保留累计占用次数。`binding` 为宿主批准配置的 SHA-256。出站前先在同一事务插入逐次记录并把计数加一，提交后才调用模型。取消、失败或用量未知仍占用次数。 | 运行必需；表内没有 owner。授权 ID 和绑定可与私有配置中的获准账号对应。此处不保存金额、Token 或最终账单。 |
| `card_import.model_calls(approval_id, owner_id, session_id, key, outcome)`、卡片及原件、Persona、世界书、会话历史与请求 | 按 owner 清除；逐次占用的 `unknown/acknowledged` 明细也一并清除。已保留的总数不能重建个人对话或逐次结果。 | 玩家数据及定位信息。原生 `entitlement_ledger_entries` 和 `entitlement_balances` 亦按 owner 删除，不能用作后备模型账本。 |
| `account_erasure_delivery` | 保留 `operation_id, subject_digest, state, attempts, policy_version`。在 `pending/retry/unknown` 时还保留 `pending_subject` UUID 供按原操作重试。确认完成后清空 UUID，登记 `completed_at`。行继续阻止同一 subject 重新绑定。 | 未完成时有直接外部标识；完成后仍可按已知 UUID 算出相同摘要。操作号可关联日志。受限角色、RLS 与摘要均不能替代留存政策。 |
| `account_lifecycle_audit(id, owner_digest, operation, policy_version, occurred_at)` | 保留删除或到期删除事件。这里的删除事件对 owner ID 做 SHA-256；审计行 id 单独生成，不等于投递 operation_id。 | 可通过已知 owner 回查。仅凭此表不能证明供应商已删除，也不能与每次远端投递精确配对。 |
| 认证、存档和归档 | 本地账号、认证会话、该账号的操作记录和外部身份映射删除或级联删除；生命周期代码清除相应验证码、存档、回执及记忆，0024 正文随回执级联删除。归档清理的 `archive_retention_purge_receipts` 在同一事务用完即删。 | 玩家数据；临时归档凭据不构成永久删除证明。本次范围为已登记主线结构。 |
| 防滥用统计 | `auth_mail_limits(bucket,sent)` 是公共发送桶；`account_rate_limits(key,expires_at,hits)`、`auth_provider_{account,ip}_limits` 保存摘要、窗口和计数。邮箱认证的 `auth_ip_mail_limits(ip,window_started_at,count)` 可保存直接 IP。它们各有计数/清理路径，账号删除不逐条清空这些表。 | 公共桶为运行统计；摘要可关联，直接 IP 更敏感。发送窗口、过期时间和维护脚本的筛选条件，不等于已批准的统一数据留存期。 |

字段和行为依据：[0025 卡结构](../../../packages/db/drizzle/0025_card_install_upgrade.sql)、[0026 消费触发器、投递表和重绑保护](../../../packages/db/drizzle/0026_account_recovery_governance.sql)、[生命周期 complete/expireClosed](../../../apps/api/src/services/account-lifecycle.ts)、[卡数据清理](../../../apps/api/src/card-import/host.ts)、[本地模型扣次](../../../apps/api/src/card-import/local-provider.ts)、[远端投递](../../../apps/api/src/services/external-erasure.ts)、[认证与限流表](../../../packages/db/drizzle/0016_supabase_external_identity.sql)、[邮箱认证 PG 实现](../../../apps/api/src/services/postgres-email-auth.ts)。

`finish_erasure_retention` 是调用人权限函数，PUBLIC 无默认执行权。它检查非空政策及非未来截止点，只删除匹配政策、已完成且不晚于截止点的投递行。函数不查询独立账本，不验证备份清单或审批人；清掉该行也会移除它提供的重绑屏障。它不清理消费总表和生命周期审计。本轮未调用该函数。

## 独立对账与拒绝恢复的边界

| 可用证据 | 能证明什么 | 缺少什么 |
|---|---|---|
| 在线库消费计数、逐次预留、删除审计和投递行 | 当前库内的计数单调性、本地事务、投递进度及重绑保护 | 它们在同一恢复域。恢复较早快照也会回退这些证据。库内触发器无法发现整个库回到旧时点。 |
| 宿主私有批准文件、限定 LIVE 收据、CI、供应商用量或账单 | 分别可旁证授权范围、某次测试或已知费用 | 未证明覆盖每次预留、未知请求、本地删除和所有目标身份。授权上限不说明实际已用；账单不足以还原请求归属。 |
| 应用日志、Supabase 逐目标确认 | 日志含操作号与政策版本；已确认的目标可以支持个案核对 | 没有核实到覆盖全部事件、在备份外独立保管并可验证连续性的生产记录。本轮没有访问托管平台或私有日志。网关 404 仍为 unknown。 |

现有恢复入口校验回环维护连接与目标数据目录，在模板空库以连接限额 0 建库，撤销 PUBLIC CONNECT，单事务恢复，最后封闭连接。没有通过对账自动解封的路径。返回的 `modelCallsEnabled:false` 是隔离结果；实际强制措施是数据库拒绝连接。具备管理员权限者仍可更改设置。常规备份完整性测试和手工导入路径不能替代此入口。恢复使用 `--no-owner --no-acl`，将来如允许开放，还须独立核验对象归属和应用最小权限。[恢复工具](../../../scripts/dev/cards-restore-quarantine.mjs)

## 可复用验收与本轮检查

| 项目 | 判定及实际观察 |
|---|---|
| 正常合成快照恢复 | **PASS（复用）**。两个独立 PG 数据目录。正常对照复制完整记录及 `used=1`，两个合成账号经 TCP/Cookie 验证续聊与跨账号历史拒绝。这一步发生在快照变旧之前。 |
| 删除、扣次后的旧快照 | **PASS（复用）**。源库夹具将占用从 1 加至 2，提交删除 A，确认只剩 B，再将旧 dump 恢复至隔离库。断言 `datallowconn=false`，真实受限登录得到 SQLSTATE `55000`。两个实例均停止，真实模型调用 0。此例通过封库同时阻止玩家访问及额度使用；没有修复快照旧值或在解封后重做扣次。 |
| 删除事务及对账明细 | **PASS（复用）**。已有生命周期测试验证提交前失败不投递；删后逐次行消失但累计占用为 1；对照账号仍在；确认完成后原 subject 置空；再次恢复已完成操作不重复投递。DELETE 404 只有明确 Auth 错误码 `user_not_found` 才确认，其他 404 保留待核对。 |
| 本轮执行 | 只读核对固定提交的 SQL、写入/清理路径、测试断言和主线 CI 原始日志。本轮仅做文档一致性检查，不重复建库或执行清理。真实过期备份恢复、对账后开放、真实 Supabase 删除均 **NOT RUN**；后两项仍 **BLOCKED**。 |

固定主线 verify 作业中，双实例恢复步骤实际输出两条 PASS，收尾为 `clustersStopped=2`、`realProviderRequests=0`。[主线 CI 原始作业](https://github.com/L-core-dev-team/Nine-cloud/actions/runs/44723732931/job/136245779393) · [过期快照断言](../../../tests/integration/card-install-upgrade.mjs) · [删除事务断言](../../../apps/api/src/services/main-integration-lifecycle.integration.test.ts) · [DELETE 404 分支测试](../../../apps/api/src/services/supabase-auth.test.ts) · [历史结果](RESULTS.json)

## 请道主裁定的最少事项

以下三项均为 **PROPOSED**，没有写入配置或获批期限。

1. **字段与用途。** 建议独立消费证据只保留授权 ID、绑定、累计占用高水位与事件序号；删除证据保留可匹配的最小标识、操作号、本地提交与远端确认状态、政策版本及时间。未决投递的原 subject 仅在受限队列中用于恢复。请裁定是否需要费用级对账，以及直接 IP、日志和各类摘要的允许用途与访问主体。正文、邮箱、Cookie 和密钥无需进入新账本。
2. **按类确定起算点、期限及例外。** 建议分别从授权结清、远端确认、审计事件或限流窗口起算；未确认删除不能按已完成处理。请指定各类的具体期限、备份最长可恢复窗口，以及保留争议时的处置。允许仍含旧身份的备份重新上线之前，须先证明删除与消费可以重放；否则持续封存或按获批政策退役。
3. **谁能清理、谁能批准解封。** 建议由独立复核人核验证据、道主指定的政策负责人批准、受限维护身份执行。清理单需绑定政策、截止点、相关备份和核对结果。解封单需证明从备份时点到切换时点记录连续，已扣额度无回退，已删除身份及旧会话不可用，未决远端投递已确定或安全隔离，旧批准不会重新生效。证据缺失、冲突或落后时维持隔离。现有数据政策解析器检查的 `approvedBy` 名单及 `backupPolicy` 文本，不能单独证明这批数据已核对。[现有政策解析器](../../../apps/api/src/services/data-policy.ts)

**建议实施顺序。** 先裁定上述字段、期限和责任人；再单独授权建立备份之外的消费与删除记录，验证存储独立、顺序连续及写入故障可检测；随后用合成数据演练记录缺失、未确认删除、额度回退、ACL 重建与恢复放行。上述条件满足后，才能逐份审查解封。真实 Supabase 三合成账号验收仍按原有独立项目与授权办理。[原联测边界](M3-SUPABASE-LIVE.md)
