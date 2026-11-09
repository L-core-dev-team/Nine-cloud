# S/P3 八项正式接口契约及 UI 接线任务

日期：2026-10-10。此文是接线合同，不是八项全部完成的声明。

2026-10-11更新：道主已批准“独立缓存，继续完成刷新恢复”。下文原“新存储待授权”记录已解除，实施进度见[S/P3缓存实现断点](S-P3-cache-progress-20261011.md)。数据库、存储能力已单独实现并测试；CloudGame/S展示与登出入口尚待接线，不应将模块测试写成完整玩家验收。

固定核验：main `6790727e57fe9e9085d21c75a4dea7f9493e0b71`；临江仙 P3 `01e3d40ae5aa17ab15034c6ed9b398c0a9113c89`；S `2e804bc5096ef31f3ef7f42372f3ee402cd1e5e7`（D8 未交付最终 SHA）。正式合并前重新核对 SHA。以下路径相对仓库根目录。

状态用语：**现行**=核验版本已有；**待接线**=接口方案、尚未挂载；**待授权**=不可先实现。水龙吟只接展示、输入及事件；临江仙负责数据适配、权限、请求和恢复。任何 proposed 类型不得被误认成现有导出。

## C1 readingHistory

1. **位置**：现行 main `apps/web/src/routes/CloudGame.tsx` 只持有当前 narrative/receipt；`apps/web/src/authoritative-turn-store.ts` 是本地权威回执存储，不是云端阅读历史。S `components/GameShell.tsx` 只有 children/archive/readingReady，尚无 readingHistory 属性。
2. **归属**：规则回执来自服务端；叙事是展示文本，不能反推状态。玩家原文不在当前服务端回执内，不得从 inputFingerprint 伪造还原。
3. **类型（待接线）**：`ReadingEntry={id:string, saveId:string, revision:number|null, kind:'narrative'|'receipt'|'gap', text:string}`；`readingHistory:ReadonlyArray<ReadingEntry>`，`readingReady:boolean`。原始玩家输入是否持久化见下方决策，不默认为已有记录。
4. **生命周期**：选中账号/端点/存档后读取；加载完成才 readingReady；切档先清空可见列表。现行没有云端历史分页入口，不能承诺从服务端还原全局长篇历史。
5. **成功**：按已确认回执版本排序，同版本以稳定 ID 去重；保留明确的缺页标记，不补写剧情。
6. **失败**：显示“历史暂不可读取”，不得用空数组冒充完整历史；当前有效存档继续保留。
7. **并发**：scope+generation 双重核对；上一存档请求晚到必须丢弃。重试相同回执不得追加重复正文。
8. **旧档**：无历史记录的旧档可继续；从当前回执起展示“此前正文未保存在此设备”，不能从快照编造过去事件。
9. **UI**：渲染列表、缺口和阅读位置；只在 readingReady 后恢复滚动，不能替数据层猜历史顺序。
10. **P3**：实现稳定 ID、版本排序、去重、读取状态及账号/存档隔离；新持久层批准前只提供明确标注的会话级数据。
11. **测试**：新增要求：晚响应跨档隔离、重复回执去重、旧档无历史、读取失败、刷新历史恢复。现有 authoritative-turn-store 测试不等于这些云端阅读测试。
12. **决策**：完整刷新阅读历史需要新持久格式/存储，当前未批准；详见“唯一存储决策”。

## C2 draft / onDraftChange

1. **位置**：`storage.ts` 的 readActionDraft/writeActionDraft 使用 sessionStorage `jiuxiao_1_action_draft_${saveId}`，读写均 slice(0,4000)，供旧本地 Game；云 CloudGame 使用组件 text 状态。
2. **归属**：草稿不是权威状态。只能归当前端点、账号与存档，不能送进世界书或 NPC 记忆。
3. **类型（待接线）**：`draft:string; onDraftChange(value:string):void; draftStatus:'loading'|'ready'|'save-failed'`。超过限制返回验证信息，不静默截断。
4. **生命周期**：切档加载对应草稿；离页/刷新是否保留由持久层实现。现行云草稿卸载即丢失，不得宣称已恢复。
5. **成功**：只在确认本次行动已接受后，且编辑框仍是被提交版本时清空；提交期间玩家的新编辑不清空。
6. **失败**：拒绝、澄清、超时、断网、规则未就绪均保留文字；存储失败必须通知“尚未保存”。
7. **并发**：草稿版本号绑定提交快照；旧响应不得清掉新文字。跨标签页覆盖策略需实现及测试，不能最后响应直接覆盖。
8. **旧档**：旧本地 4000 字草稿读取路径不变；不把云端 8000 字稿写入该键。
9. **UI**：受控输入，展示字数、错误及未保存状态；不自行创建键、不调用 slice 截断。
10. **P3**：提供 owner/save 范围适配和清空规则；负责持久化失败处理。
11. **测试**：拒绝/澄清保留、成功只清提交版本、后续编辑保护、8000 中文不丢尾、A/B 账号及存档隔离、刷新恢复。
12. **决策**：新的云端草稿存储待授权；不能靠复用旧键宣称完成。

## C3 输入长度和载荷

1. **位置**：main CloudGame maxLength=8000；旧 main.tsx/存储为4000；API `routes/games.ts` text.length<=8000，但 readJson 限16384字节。
2. **归属**：服务端最终拒绝判定；UI 限制只作预提示。
3. **现行类型**：text 为字符串，长度按 JS UTF-16 单元；不是 UTF-8 字节也不是中文字数。请求还包含 expectedRevision/idempotencyKey/clarificationOf/requestNarrative。
4. **生命周期**：编辑先提示；提交前检查整份 JSON UTF-8 大小；服务端仍须独立检查。
5. **成功**：仅同时符合字符和整个请求字节限制才发送。8000 ASCII 与8000中文不是等价载荷。
6. **失败**：超字符明确提示；超载荷可返回413。不得让“8000字可输入”成为“必能提交”的虚假承诺。
7. **并发**：长度检查绑定实际提交快照，而不是之后编辑框的新值。
8. **旧档**：保留旧本地4000约束；不改变旧草稿内容/存档 schema。
9. **UI**：显示当前路径实际上限，不只改 maxLength；不替用户截字。
10. **P3**：统一云端服务端限制与客户端校验。当前发现的是兼容缺口，尚未修改；推荐服务端保持8000单元并将JSON字节上限调整到足以容纳合法转义内容的明确上限，配合恶意大载荷测试，不放宽行动规则。
11. **测试**：4000/8000边界、中文/emoji、反斜线与控制字符转义、完整JSON边界、拒绝不结算。
12. **决策**：云端8000是现有行为目标；涉及新增存储仅由C2授权。非另设玩法上限。

## C4 提交 handler

1. **位置**：main `routes/CloudGame.tsx` submit、`cloud-sync.ts` cloudRequest、API `routes/games.ts`、`services/server-turn.ts`。P3 原有 pendingTurn 可复用，但不能覆盖 main P4 memory 接线。
2. **归属**：服务端可信 SaveEnvelope/规则/事件；UI 不直接写属性、时间、背包和关系。
3. **现行请求**：POST `/api/games/:saveId/turns` `{text,expectedRevision,idempotencyKey,clarificationOf?,requestNarrative?}`；返回 TurnReceipt（使用现有 contracts schema 校验）。UI 适配建议 `onSubmit():Promise<void>`，由P3持有真实请求快照。
4. **生命周期**：加载完成→输入校验→锁定请求→服务端判定→回执核验→读取权威快照→展示。解析ready不等于规则接受。
5. **成功**：accepted显示实际事件/变化；clarify显示问题；rejected显示原因。后二者不伪造状态变化。
6. **失败**：409保持稿件并区分版本冲突、幂等冲突和澄清冲突；503门禁未就绪不伪装成功；404不泄露他人存档。
7. **并发**：重复点击复用同一待决请求ID与原始参数；更改内容不能复用旧ID；以revision做CAS，不能本地revision++代替读取。
8. **旧档**：仅适用权威存档入口。旧本地文本档不得包装成可权威结算的档。
9. **UI**：展示提交阶段/判定结果、禁用重复提交入口；不生成规则结果。
10. **P3**：所有权、回执schema、CAS、幂等、请求恢复；保留main API认证及P4memory参数。
11. **测试**：成功、拒绝、澄清、重复点击、响应丢失重放同ID、过期revision、跨账号、晚响应切档。
12. **决策**：规则批准摘要、生产禁用审阅规则保持原状；任何新签名需求单独审核。

## C5 失败、重试和恢复

1. **位置**：main CloudGame一次提交请求叙事；P3 `gameplay-turn-presentation.ts` 与独立narrative路径；TurnClient恢复机制另在其模块，不应误称已接入云端CloudGame。
2. **归属**：结算由服务端回执确定，叙事失败与结算失败分别展示。
3. **接口分类**：`retryPendingTurn():Promise<void>` 只重发相同未知结果请求；`refreshAuthoritativeSave():Promise<void>` 只读；独立 `retryNarrative` 新接口仍待审核，不可冒充现行已启用接口。
4. **生命周期**：超时/断网→结果未知→核对或同ID恢复；已知接受且叙事失败→保留回执/快照，禁止重走行动结算。
5. **成功**：恢复既有回执；不会新增扣费/时间/资源事件。叙事呈现与权威结果分栏。
6. **失败**：仍不确定就保持待恢复；不能把失败回执变成功，不能抛弃原请求。
7. **并发**：恢复同一次行动绑定同ID、revision、内容；只允许一条恢复请求在飞行。
8. **旧档**：没有持久待决记录就不能假称能识别刷新前那次请求；新存储批准前此路径标为缺口。
9. **UI**：显示可恢复动作；未批准的叙事重试按钮不启用，不用“重新行动”替代。
10. **P3**：精确错误分类、幂等恢复、回执对账；不应用 pending 叙事补丁。
11. **测试**：服务端接受但响应丢失、恢复不二次扣资源、取消后核对、叙事失败不重复推进、刷新未决请求。
12. **决策**：叙事补丁 SHA256 `f22c7a00e30999b22e2643ee85692ea5defa1df4e489174889072dd491433492` 保持待审核；本任务没有重新签署授权。

## C6 loading / busy

1. **位置**：main CloudGame busy布尔值；P3已用 idle/submitting/narrating/retryable，尚无完整跨档加载状态。
2. **归属**：P3请求状态机；UI不通过动画时长判断服务端已完成。
3. **类型（待接线）**：`phase:'loading-save'|'idle'|'submitting'|'loading-receipt'|'narrating'|'recoverable-error'|'unavailable'`；`canSubmit:boolean; canRecover:boolean; notice:string|null`。上述为显示协议，不新增规则状态。
4. **生命周期**：scope改变立即loading-save；快照就绪才能idle；提交与恢复互斥。
5. **成功**：收到可信结果再退出相应阶段；没有AI叙事不显示“生成完成”。
6. **失败**：错误有明确终态与可用恢复动作，finally不能把旧档响应变成新档idle。
7. **并发**：每个scope生成号检查；Abort仅取消等待，不证明服务端未结算。
8. **旧档**：无法权威结算的档进入unavailable并保留读取能力，不转为空白新档。
9. **UI**：文案/禁用/焦点由S实现；不改结算状态。
10. **P3**：阶段变化、允许动作及错误模型；水龙吟无需自行判断异常代码。
11. **测试**：加载失败、请求超时、切档旧finally、拒绝/澄清恢复可编辑、取消后不假装未结算。
12. **决策**：无新增玩法决策；S接线须等D8交付避免并行修改CloudGame。

## C7 切档、离页和刷新

1. **位置**：CloudGame useEffect按saveId刷新；当前refresh内部setSave/setSuggestions未全量generation保护；S GameShell按saveId存滚动位置，但不是所有权隔离或数据恢复层。
2. **归属**：P3拥有session/owner/save/API端点的数据scope；S只拥有阅读视图和滚动。
3. **类型（待接线）**：内部 `GameScope={apiOrigin:string,ownerId:string,saveId:string}` 与generation；UI只获当前数据及readingReady，不能从URL决定owner。
4. **生命周期**：切scope先失效旧请求→清可见敏感数据→加载→验证→允许操作；刷新从服务端读取权威状态。
5. **成功**：恢复同一账号同一存档已确认状态；展示当前恢复范围限制。
6. **失败**：401清当前可见账号数据并提示重登；404保持不可用；不创建替代新档覆盖原档。
7. **并发**：切档前请求结果可能已提交到A；不能显示在B，返回A后再核对；保存/恢复要保持CAS和幂等。
8. **旧档**：旧v3和记忆隔离不改；没有新增历史/草稿时使用兼容空记录，不重写存档schema。
9. **UI**：离页提示及阅读位置恢复；不使用缓存A内容填充B加载期。
10. **P3**：scope取消、响应验证、会话清理、持久恢复；登出清理策略与新store一并实现测试。
11. **测试**：A/B档快速切换、两账号同saveId、端点切换、取消晚响应、刷新、旧v3保留、登出不残留敏感文本。
12. **决策**：持久恢复依赖新私有store授权；禁止复用仅saveId的旧草稿键扩展云端。

## C8 授权记忆读取与展示

1. **位置**：main `routes/games.ts` GET `/api/games/:saveId/npcs/:npcId/memory-recall?utterance=...`；`services/npc-memory-recall.ts`；`npc-memory-turn-transaction.ts`；domain `memory/recall-authorized.ts`。不是“接口不存在”。
2. **归属**：所有权检查+冻结的NPC授权观察+批准召回/遗忘策略；AI与UI不得读全部事件后自行筛选。
3. **现行类型**：`{recall:null | {kind:'deterministic',text,reason} | {kind:'evidence',recall:AuthorizedRecallResult完整/部分结果}}`。直接复用现有类型，不另造全知NPC数据接口。展示适配只输出允许事实和“历史/主观认知”等标签，不显示grantId等工程字段。
4. **生命周期**：当前owner/save/已知NPC确定后，显式查询；响应按scope失效。throughRevision为当前save.revision-1，不宣称包含最新未纳入观察的回合。
5. **成功**：确定性回答原样作为提示；授权事实按其记忆类别显示。当前状态、历史事件、主观信念不能混成客观真相。
6. **失败**：null表示无匹配，不补记忆；policy-unavailable/incomplete/forgotten等显示准确状态。reader未配置则该路由不存在；不越权回退到原始事件。
7. **并发**：账号每小时60请求限额；scope过期丢弃；同查询可取消显示，不写任何世界状态。
8. **旧档**：旧retrievalVersion v1的forgetting模式可503 RECALL_MODE_UNAVAILABLE；v2有对应遗忘路径。不得笼统说所有遗忘模式都不可用。
9. **UI**：仅从已授权当前游戏目标发起，显示来源类别/空态/错误，不能把内部候选ID做新的世界设定。
10. **P3**：owner与观察分页边界、策略校验、过滤和响应适配；现有路由并未额外证明NPC在当前场景可对话，因此不能扩大成任意NPC远程对话入口。
11. **测试**：本次main两个召回测试文件13项通过；仍需统一候选的跨账号/跨档/切换晚响应、UI空态/遗忘/不泄露工程字段验证。
12. **决策**：新增NPC范围/记忆权限需作者批准；当前合同不扩权。迁移0020升级缺陷见整合准备报告，数据库路径必须修复验证后才算实际可用。

## 唯一存储决策（尚未实施）

推荐批准：建立独立的本机云游戏展示数据库 `jiuxiao_cloud_game_ui_v1`，保存按 API端点+ownerId+saveId 隔离的阅读条目、8000输入草稿和未决请求快照。不修改 SaveEnvelope v3、旧4000草稿键、权威回执/事件/记忆权限；展示库不能成为权威数据源。必须有容量/读取失败提示、账号退出敏感缓存清理及跨档/刷新测试。

替代：保持当前存储，八项接口只提供会话级历史/草稿，并将刷新后完整阅读和未决输入恢复明确列为未完成。不得宣称完整联合试玩链已完成。

## 给水龙吟的接线顺序

先交付D8最终提交SHA与测试；临江仙再锁定统一候选。S随后按本合同接受控输入、history/readingReady、phase/notice和回调；不实现请求/数据库/规则、不移动S布局样式。本文件未发送到未确认身份的旧聊天，也未改S工作区；可由道主转交。
