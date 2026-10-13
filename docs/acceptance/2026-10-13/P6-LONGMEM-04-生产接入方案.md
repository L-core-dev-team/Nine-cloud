# P6-LONGMEM-04 生产接入方案（设计交付，不实施）

## 现状与目标

现状基于只读 main 2647439e0cccc9a136606a81131519f53253f125，已核对本分支 apps/packages/scripts/deployment 与其一致。`packages/db/src/schema.ts` 的 turn_requests 以 saveId/idempotencyKey 唯一，包含 expectedRevision、result、narrativeAttemptId、narrativeStatus；turn_events 保存 beforeRevision/afterRevision、ruleVersion 与事件 hash 链，现有 branch 检查仅允许 root。`apps/api/src/services/postgres-server-turn.ts` 更新叙事尝试/状态，不能把这认定为已有完整正文持久化、生成版本或逐段 visibility snapshot。

目标是：一个已确认回合的规则状态、玩家所见生成版本、原始正文与可授权检索来源可追溯；客户端、NPC 和后续生成器都不能从“正文已保存”推导出“这是真实规则状态”或“NPC 已知全部内容”。本实验 SQLite 只证明本机离线数据路径，不作为正式云存储方案直接搬入生产。

## 原则与身份

服务端从当前会话解析 ownerId 并验证 save 所有权，客户端不能指定 owner、actor、NPC 可见权限或事实确认者。可信 snapshot 绑定 owner/save/branch、读取 revision、asOfTurn、visibility policy version、遗忘策略 revision 与 audience。sourceId 是生成结果身份，receiptId 是规则回合身份，attemptId 是生成尝试身份；三者不混用。

现有 turn request key 保持回合级语义：同一回合重试不能再次推进规则。叙事重新生成使用新的 attemptId/generationVersion/sourceId，关联同一规则回执；不能复用旧 sourceId 覆盖文本，也不能让旧原文 idempotencyKey 约束阻止合法的新尝试。实验每回合一个原文的唯一键只是最小模型，生产应分别定义 turnRequestKey 与 narrativePublicationKey。

建议来源字段：sourceId、owner/save/branch、receiptId、before/afterRevision、attemptId、generationVersion、narrativePublicationKey、UTF-8 正文 byte length/SHA256、format/version、生成时间、policy snapshot reference、规则版本。正文以原始字节存储，CRLF、BOM、空白、emoji 不改写；Unicode 不完整输入明确拒绝。字符偏移约定 UTF-16，与 UTF-8 hash 分开标记。哈希提供完整性检查，不提供对文件管理员的真实性证明；需要真实性时另行设计签名或权限受控审计。

## 推荐存储与提交边界

优先采用已有服务端事务数据库，避免给 1.0 新增文件服务或向量数据库。最初把完整原文（bytea 或明确保持字节的对象）与来源、幂等键、可见段元数据放在同一事务系统。需要大正文对象存储时，再引入内容寻址不可变对象和 publish manifest：对象校验通过后事务发布 manifest；孤立未发布对象不可检索并可按专用生命周期回收，不能对外宣称跨数据库/对象存储原子事务。

规则提交与外部模型调用分开：

1. 规则事务检查所有权和 expectedRevision，记录事件/存档更新、回执及生成 outbox；回执幂等唯一，不在持锁事务内等待模型。
2. outbox worker 领取生成尝试，使用绑定的规则与授权 snapshot，调用模型。超时或取消只影响该尝试，不重复规则动作。
3. 模型返回后，短事务校验 receipt/attempt/snapshot 身份、原文字节 SHA、政策有效性及当前 publication 状态；保存不可变来源与逐段策略，同时发布完成回执。冲突返回既有相同 publication 或明确冲突，不能覆盖不同正文。
4. 正文事务已提交但 HTTP 应答丢失，客户端按 publication key 查询/重试，得到同一来源。提交前失败则无可读来源，outbox 可恢复。索引更新走发布后的另一个幂等 outbox，失败不撤销正文和规则回执。

如果回合没有生成正文，明确保持 not_requested / failed / unavailable 等状态，不能伪造“正文丢失就是没发生回合”。模型生成期间存档已推进时，保存该结果作为绑定旧回执的版本，由服务端发布策略决定是否作为当前玩家视图，不能偷偷绑定最新 revision。

建议约束至少包括来源身份唯一、publication key 唯一、attempt/receipt FK、owner/save FK、revision/branch 与回执匹配、正文长度与摘要校验、publication 只在完整来源/段策略同时存在时可读。当前 root branch 约束需在未来分支需求获批后另外迁移；本轮不增加该能力。

## NPC 与事实状态

先执行账号、存档、快照、时点与 P4/P5 现行授权/遗忘策略，再把允许的段或字段送给检索器。生产不向索引进程或模型传整条玩家正文再做结果过滤。段权限应具备稳定 segmentId、原始偏移、hash、允许 audience、知识获得回执和策略版本。跨段指代、作者说明、目录标题、人物别名、历史链接和失效时间都可能透露未知事件，需要同样投影。

实验只有整条来源 ACL：没有段内授权、动态撤权、遗忘衰减或全局一致 snapshot。模拟快照字符串是关联凭据，不是认证签名。NPC 最新获准知识不能替代世界当前状态；未知后继不能通过 validUntil/supersedes/来源链接泄漏。正式接口必须复用 P4/P5，而不是接受实验的调用方自报 authorizedNpcIds。

事实域保持独立：world-event 只能由确认的规则事件提供；character-claim 保持 unverified；原文细节保持 original-prose-only。原文可证明“生成文本说了什么”，不能证明“现实/世界事实是什么”。旧实验中的缺凭据 world-event 标签仍可作为原始来源存储，但不得进入权威事实视图。模型抽取的新关系、角色认知或世界状态进入候选区，经规则/作者批准后才建立事实，不能直接写 Canon。

## 索引与性能

正文存储是恢复源，索引是可丢弃派生物。索引版本绑定 source SHA、tokenizer/normalizer 版本、权限/遗忘 snapshot 与数据 revision；旧策略缓存不能复用于新 audience。发现 source hash 不符、索引落后或关键来源缺失时，明确 insufficient/unavailable，不以最新摘要补造原文。

实验全量恢复及线性扫描适合离线验证；每个权限/as-of 构建视图、多次分词、最多四个视图缓存在万回合会占时间和内存。生产建议先做增量词法倒排、实体/时间桶和受授权检索批次，按查询按需读取证据来源，保留完整正文端点。是否引入 embedding、重排或摘要应依据新盲题和真实成本证据另行决定；不因规模数字自动增加 AI 服务。

固定预算只能限制送入模型的上下文，不能保证语义召回。生产采用目标 tokenizer、模型 ID/version 和真实调用 usage；保留关键来源缺失、预算省略、原句完整性和当前/历史/未证实状态。模型不接受“来源很多所以证据足够”的自证。

## 恢复、备份、生命周期

区分可安全重试的锁/超时/应答丢失、不可覆盖的幂等冲突、权限失败、正文损坏和索引故障。任何重试都沿用已绑定的 request/publication key。损坏记录隔离报警，不能静默删除重建，也不能直接调用模型产生不同正文假装恢复。

备份要覆盖正文、回执、事件、snapshot 和版本索引；采用数据库一致备份或受支持的快照/日志恢复，禁止只复制一个运行中的 SQLite 主文件遗漏 WAL。用离线恢复演练校验引用、hash 与权限；演练在独立环境，不能用生产回滚替代测试。本轮未执行生产备份或恢复。

“不可变”指保留期内不覆盖叙事版本，不等同永久保存。账号删除、存档删除、备份期限和合法清除由已有生命周期流程另行定义，包括副本、派生索引、对象存储和审计去识别化；本轮不执行任何删除或迁移。不得在玩家包放内部 ownerId、本机路径、授权快照详情或合成测试库。

## 生产实施前验收门槛

后续获批的独立生产任务必须完成：真实 PostgreSQL 事务/锁/隔离及唯一键测试；真实所有权/跨账号/跨分支拒绝；P4/P5 逐段授权、撤权与遗忘兼容；turn/attempt/revision 与异步 outbox 一致性；worker 重启、真实存储 I/O 失败和重复投递；数据库一致备份恢复；目标部署环境运行依赖与负载测量；真实 tokenizer/usage、未知问题和混合权限故事；作者/产品审批。

本轮提供接口草案和证据，不发布生产 migration、不修改服务端 schema、不合并 main、不接管 P3、不部署。真实断电、ENOSPC/硬盘 I/O 错误、跨主机竞争、损坏备份修复、真实模型语义和真实玩家万回合旅程仍无验收证据。
