# S / P3 最终展示接口交接（待临江仙确认）

状态：**BLOCKED / P3 DEPENDENCY**。这是基于现有代码的接口需求，不是已确定的存储或权威契约，不新增 schema、存储键、授权规则或服务端行为。

## 已有边界与接线

S 候选继续使用 CloudGame 的 saveId/onBack/onHome/onLogin/onWorld。GameShell 只提供视口、阅读滚动、资料 dialog 和按 saveId 的既有会话滚动位置键；调用方负责存档、草稿及 handler。CloudGame 的 SaveEnvelope/TurnReceipt 校验、expectedRevision、idempotencyKey、requestNarrative、refresh、submit 与服务端规则写入逻辑保持原样。

当前 narrative/text 是 CloudGame 组件内存状态，离页与刷新会丢失；重新读取存档不等于重新读取剧情历史。当前 readingReady=!!save 只等待存档，不保证历史已挂载。失败时输入留在当前组件内，不意味着跨路由或刷新恢复已完成。

## 请 P 轨确认的最小契约

| 项目 | 所需确认 | S 展示约束与集成验收 |
| --- | --- | --- |
| readingHistory | 权威数据源、稳定 ID、顺序依据、分页/缺口、持久化方式、accepted/clarify/rejected 及叙述失败记录是否入历史 | 按权威顺序显示来源及状态；不按本机时间推导顺序、不补写结算。迟到分页不能覆盖新回合 |
| draft / onDraftChange | 归属、作用域（账号/saveId/branch）、持久化与清除时机、失败后恢复规则 | 展示使用受控草稿；切换档案不得串档；失败/取消不得清掉未确认输入 |
| 8000 / 4000 | 云端当前 textarea/服务端 text 上限8000，与旧本地草稿4000的分流、迁移或统一原则 | 未确认前保持两条现有上限。不裁剪、不扩展、不新增存储键；若输入长于恢复上限，需明确处理及无损导出原则 |
| submit handler | P 轨对 text、expectedRevision、idempotencyKey、requestNarrative 的持有者及调用边界；clarificationOf 的授权流程 | UI 不创建第二套权威提交，不替换既有 schema；同一次提交禁重复点击 |
| 失败/重试 | 网络不确定提交、已提交但叙述失败、冲突及重试各自 handler；核对原请求与幂等键复用原则 | 不把重新生成幂等键的再次点击称为安全重试；明确已提交事实和未确认事实。原请求恢复机制由 P 轨交付 |
| loading / busy | 存档、历史、建议、回执、叙述阶段的状态与取消能力 | 阅读恢复等待 historyReady；提交与输入可达，禁用只反映真实状态，不展示虚构进度 |
| 切档/离页/刷新 | 载入、订阅、卸载、过期请求丢弃、账号退出/失效及恢复 handler | A档迟到响应不得改写B档；世界书往返/刷新恢复顺序为可信历史→草稿→阅读位置；未接契约前不宣称长局恢复PASS |
| 授权记忆读取 | 可展示的字段、NPC来源与选择权限、授权边界、分页/时间限定、缓存隔离、错误映射与真实遗忘模式说明 | 未确认前不展示 raw 观察、grant、跨NPC/账号信息，不将旧记忆当实时状态，不创建新的记忆授权 |

## main 上新增记忆端点的只读核验

2026-10-10 核验 main `3d716279eba08cf0ff1a7db3b0f8ddaca58103b5`：`GET /api/games/:saveId/npcs/:npcId/memory-recall?utterance=...` 已存在，注册取决于 memoryRecall reader。路由先 resolveOwner、账号 recall 配额与当前存档读取，真实遗忘模式返回 RECALL_MODE_UNAVAILABLE。响应为 `{ recall }`，可能 null、deterministic（text/reason）或 evidence（recall 的 complete/partial 数据）。必须由 P 轨确认哪些字段允许直接呈现、NPC选择与时间边界；S 不直接拷贝业务类型或调用新端点。

路由以当前存档 revision 建构读取边界，服务层使用 throughRevision=resultingRevision-1。该边界是否符合玩家主动读取预期由 P 轨确认，S 不擅改。UNAUTHENTICATED、RATE_LIMITED、NOT_FOUND、SAVE_SCHEMA_NOT_READY、RECALL_MODE_UNAVAILABLE、GAME_UNAVAILABLE 均须区分；不能把 null 当“全部记忆已查完”。

## 契约到位后的联合回归清单

1. 游客/邮箱会话、失效与换账号：恢复、拒绝、退出、云档继续，不跨账号显示旧历史或记忆。
2. 长局历史、分页与序号：100回合、多来源、accepted/clarify/rejected、叙述缺失，不伪造事件；真实权威链单独验收。
3. 8000字云输入、4000字旧草稿边界、世界往返、刷新、切档、草稿保留；每种超限原则按最终契约断言。
4. 断网/超时/重复点击/冲突/响应迟到：核对原请求、正确幂等键与权威修订；已提交且叙述失败分开反馈。
5. 320/390/430、横屏短屏、软键盘与安全区：长历史独立滚动、输入/提交和资料可达、阅读位置恢复等待完整展示数据。
6. 记忆读取：跨账号/跨NPC拒绝、null、partial、deterministic、时间限定、真实遗忘、限流、版本不符；不得从旧记录推出现状。
7. 原六组本地、八组模拟云游戏、64项质量与foundation继续回归；模拟服务不代替隔离数据库、真实AI、真实手机或作者签收。

本轮交付此需求与回归清单供道主/临江仙审阅。未通过外部消息工具发送；没有修改 P3、数据库迁移或待审核叙事补丁。
