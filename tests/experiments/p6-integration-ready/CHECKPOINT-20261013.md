# P6-INTEGRATION-READY-01 暂停恢复断点｜2026-10-13

**状态：PAUSED。道主明确要求“保存断点”；已停止研发，只保存现场。恢复前不得自行继续施工、推送、合并或部署。**

## 唯一续做现场

- 工作区：`C:\Users\11954\Desktop\水龙吟专用\项目\Nine-cloud-P6-integration-ready-20261013`。
- 分支：`shuilongyin/p6-integration-ready-20261013`。
- HEAD：`7ff824791c3dfc0a544728b29c7ddc24b7857b26`，仍为 P6-04 基线。
- **本轮成果尚未提交或暂存，全部在新实验目录内，不能把 HEAD 没有新提交误判为没有施工。**
- 暂停前有 19 个未跟踪文件；加本断点为 20 个。完整路径/字节摘要和安全备份另保存在圈内交接目录。
- 新目录：`tests/experiments/p6-integration-ready/`。该目录以外基线跟踪文件无修改；生产与旧 P6 路径的 Git diff 为空。
- `.runs/` 已有正式函数加载环境及合成测试数据库，忽略不提交；不清理，恢复时可直接复用。

## 当前授权与最高边界

执行《九霄 WEB》P6-INTEGRATION-READY-01：独立实验研发、只读生产审计、离线对抗测试、接口提案与性能预研。先安全与接口审计，再开展有收益的实验。

任务 A：生产入口契约，区分行动结算、叙事生成中、叙事失败、正文保存、NPC 可读、规则确认六种状态。任务 B：至少 20 个 NPC 对抗测试（最高优先级）。任务 C：统一来源/偏移/hash/权威/授权/版本证据契约及防幻觉审计。任务 D：万回合性能原因定位、授权快照安全缓存/增量/按需读取预研，不能降数据量、弱权限或牺牲准确率。任务 E：交给临江仙的 P6→P3 需求，跨系统权威契约由临江仙统一审计。

只允许新独立实验、报告、圈内交接与本地阶段提交。禁止修改 main、P3/PR #83、正式 API/数据库/迁移、P4/P5、Canon/世界书及旧冻结材料；禁止付费模型/服务、正式整合 PR、合并或部署。**本轮没有新分支远端推送授权；P6-04 的旧推送许可不延续到本分支。**

## 已完成只读准备，不要重做

已核对 worktree、P6-04/接入方案、根 AGENTS.md、main 和 P3，确认新路径和分支不存在后才新建。

- origin/main：`2647439e0cccc9a136606a81131519f53253f125`（本轮快照）。
- P6-04 最终：`7ff824791c3dfc0a544728b29c7ddc24b7857b26`，已在远端；其工作区未改。
- 道主指定 P3 候选：`f159b5468966fb95f91cc9ab7bbcdf6cd665c3bd`，已用 `git fetch --no-tags origin <SHA>` 取到，仅写圈内 Git 对象/FETCH_HEAD，没有修改 P3 分支。
- P3 远端分支当前：`ef6430be778136d6501d9707fdc9a0d3c5bfd3d9`，与指定候选不同。候选审计以 f159b54 为准，不能说已合并 main。
- 指定 P3 的 memory/TurnReceipt 契约相对 main 无变更；候选增加只读 receipt recovery，status unknown 不能证明行动未执行，不能自动换新 key 重做行动。
- P3 内部有 attemptId、generating/received/unavailable/timeout/cancelled 状态，但现有 NarrativeResult 的 received 输出只有 text/source，没有完整 publication 元数据。
- main 正式回执有 idempotencyKey/saveId/requestFingerprint/branchId/rulesVersion/clockMinute/decision/events/resultingRevision；根分支限制仍为 root。
- 正式观察 outbox 有稳定 grantId、save/branch/NPC、eventId/eventRevision、observedAtMinute、channel、memoryClass、授权策略版本、精确 authorizedFields/Facts、summary 和 supersession。**没有现成的任意原文 source SHA/UTF-16 段偏移与 grant 的映射。**

## 实现与阶段状态

| 任务 | 暂停状态 | 已有证据/剩余 |
|---|---|---|
| A 接口契约 | IN PROGRESS | contracts.ts 待审草案、bridge.cjs 最小原型；真实服务端 ports 尚未接入，不能称生产可用。类型/兼容性检查未做。 |
| B NPC 安全对抗 | IN PROGRESS | 新原型 42 PASS/0 FAIL，另有 6 个真实接入 BLOCKED；旧 P6 13 项审计 5 PASS/8 FAIL。尚未跑既有关键安全回归，正式阻塞不能由夹具清除。 |
| C 来源/防幻觉 | IN PROGRESS | 42 用例含偏移/hash、未确认事实、版本、预算限定条件、缓存；尚需统一返回契约兼容性与独立来源审计。 |
| D 万回合性能 | NOT STARTED | 尚无新 benchmark、性能缓存封装、增量索引或按需正文实现；不要把分析中的想法当成文件成果。 |
| E 接口交接/三份报告 | NOT STARTED | 尚未写三份正式报告；基础审计结论在此断点及 JSON 证据中。 |

### 现有新文件职责

- `formal.cjs`：从固定 main Git blob 读取 23 份真实契约、P4/P5 函数与策略身份，Node `stripTypeScriptTypes(mode:'transform')` 原样转换到 `.runs/formal`。只读复用圈内 main-sync 工作区的 zod；不重写策略/常量。生成包入口只缩小加载面。
- `evidence/formal-source-manifest.json`：真实源文件 SHA256。正式函数已成功加载，恢复时直接 `load()`，不要重复 `prepare()` 覆盖现有 manifest。
- `contracts.ts`：P6 待审 ports/证据/版本/状态草案，不是临江仙已批准的正式契约。
- `bridge.cjs`：复用 P6-04 ReliableStore。发布前从可信 port 获取已确认回执并用实际 TurnReceiptV2Schema 校验；同回执多个 attempt/source 可不可变保存。NPC 检索必须有原文段→正式 grant 字段绑定，使用实际 P4 recall 计算遗忘/失效；不接受全文 ACL 推导片段。
- `fixtures.cjs`：合成会话 WeakSet 和授权片段 ports，不是真实认证/授权。缺失真实映射必须 BLOCKED。
- `security.cjs`：42 个 S01–S42 用例，保存完整观察结果/失败；另列真实生产依赖 P01–P06 BLOCKED。
- `legacy-audit.cjs`：只读调用现有 P6-04 对抗审计，保留其缺口并实测真实 P4/P5 差异。
- `README.md`、`.gitignore`、`.gitattributes`：实验说明与只在新目录生效的配置。

原型每次缓存命中仍重新读取当前授权、策略、回执和正文完整性，按结束快照检查读取竞态；返回对象 clone；预算不足整段拒绝，不截断关键限制条件；generatedAnswer 固定 null。它只验证注入 ports 的边界，不证明真实 PostgreSQL/鉴权/逐段授权事务。

**已知待核项：** contracts.ts 和 bridge.cjs 尚未做完整类型一致性验收；bridge 当前实际要求 boundary.policy 等正式策略字段，契约草案需对齐，不能因 Node 测试通过就称类型/生产兼容通过。

## 已执行测试与必须保留的失败

1. `node tests/experiments/p6-integration-ready/formal.cjs`：首次试图加载 TypeScript JS API 失败，原因是现有编译器为无该 API 的原生版本；改用 Node 内置类型转换后成功，23 份真实源文件哈希已保存。未安装依赖或修改原生编译器。
2. `node tests/experiments/p6-integration-ready/security.cjs security-01`：0 PASS/42 FAIL/6 BLOCKED，统一失败源为原型错把 8 个 publication 字段计为 9 个，导致夹具发布入口拒绝。记录保持原样。
3. 修正桥接字段计数为 8，**未改测试期望或弱化授权**。
4. `... security.cjs security-02`：**42 PASS/0 FAIL/6 BLOCKED**；已保存 summary/cases/failures（空）JSON。无需原样重跑；后续代码变更时才按影响复验，必须使用新输出名。
5. `... legacy-audit.cjs legacy-01`：**旧 P6 5 PASS/8 FAIL**，这是实际缺口审计，不是假装测试全绿。没有改旧源码，证据完整保存。

旧 P6 的 8 个未覆盖点：部分片段可知不应扩大到全文；在场不等于听见；后来转述不能关联旧来源；撤权无动态 epoch；原文路径不受实际遗忘约束；可信调用方 scope 不等于真实 session 认证；全局同名实体会影响未授权查询诊断；同一 revision 多原文版本被 DiskRecall 拒绝。这些是独立原型的接入缺口，不能宣称已部署的生产漏洞。

旧 P6 已覆盖的 5 点：稳定 NPC ID 隔离、存档分区、分支分区、未来原文拒读、主观说法保持未证实。

## 最高优先级真实 P4/P5 差异：不得自行统一

`evidence/legacy-01/policy-surface-difference.json` 使用同一实际函数输入：elapsed=20160 game minutes、later=0、query=旧灯。

- P4 `recallAuthorizedObservations(...forgetting:true)`：accessibility=0.25，status=forgotten。
- P5 `retrieveNpcMemories(...forgetting-v1, query=旧灯, minAccessibility=0.35)`：线索命中托底到 0.35，保留 1 条。
- P4 laterCounts 按严格更大的 eventRevision；P5 按稳定观察序列后续数量，同 revision 多观察也计入。

这是实际代码证据。新桥接仅允许明确 `p4-explicit-recall` 策略入口；未指定或请求 P5 统一语义时 BLOCKED，不偷偷选一种规则。需要临江仙/道主统一裁定不同调用面应该保持各自语义还是调整契约；水龙吟只记录两种方案与影响。

6 个真实生产阻塞：会话/所有权 ports；逐段原文/source/hash/offset→grant 映射；历史/撤权/授权快照一致性；P4/P5 入口与观察计数；P3 attempt/version/publication 回调字段；真实 PostgreSQL 发布/读取竞态事务。接口需求必须标出责任方及审批，不单方面改 P3 数据库。

## 恢复后的最短接续路径

1. 先读本断点和保存 manifest，核对分支/HEAD/新文件摘要，确认未被其他工作位修改；不要重新扫描旧报告或重建 worktree。
2. 继续 A/C：对齐草案与 bridge 实际字段，补兼容性和独立证据核验；保存未被测试覆盖的接口缺口。
3. 完成要求的旧 P6 关键安全回归：优先将旧 CJS 存储回归按原字节复制到新 `.runs/regression` 执行（避免在旧实验目录创建 scratch）；旧 Lexical/Prose 无写入的关键测试可只读复用，不跑旧大 benchmark。
4. D 先做可复现基线与原因定位。可能验证相同完整万回合/同题集下缓存优化，但必须每次重新授权/校验来源和按 epoch/时点失效；任何方案不能少数据、降准确率或把 fixture oracle 当生产授权。实现成本过高时只交基准与下一步方案即可。
5. E 产出三个完整文件：《P6-INTEGRATION-READY-01 接入准备报告》《P6 → P3 数据契约需求清单》《P6 长期记忆对抗测试与性能评测报告》。合成场景、旧缺口、原型通过与真实 BLOCKED 分开报告。
6. 运行实验 TypeScript/Node 检查，确认生产与旧材料零 diff，按既有授权作本地阶段/最终提交并保存文件清单。**不得推送新分支；完成后停止，等道主确认目的地和发送内容。**

## 保存边界

本次暂停仅新增本断点、圈内交接副本、未跟踪成果的圈内安全备份和哈希/状态清单。不提交，不推送，不清理运行数据，不删除或覆盖现有失败日志，不修改桌面旧聊天交接（本任务没有新的圈外写授权）。已有任务未完，不标记完成。
