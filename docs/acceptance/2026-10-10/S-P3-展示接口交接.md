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

## S-HANDOFF正式交付与确认回执

本次候选7407cc00ca2c434fb9e9aebb9f4ef7c43eee18b0已完成D8技术修复，既有八项需求与前述最小契约保持原样；以下是确认和消费责任登记，不新增任何接口或存储模型。契约提供者及整合负责人：临江仙；UI消费者及展示适配负责人：水龙吟。当前未收到八项确认、API类型/真实样例或联合候选SHA。

| 既有需求 | 所需权威来源与待确认问题 | 确认后水龙吟责任 | 必要联合回归 | 确认状态 |
| --- | --- | --- | --- | --- |
| readingHistory | P3权威历史源、稳定顺序与持久化/分页契约 | 按可信历史展示和恢复阅读位置，不补写结算 | 迟到分页、缺口、长局、accepted/clarify/rejected与叙述缺失 | BLOCKED / P3 DEPENDENCY |
| draft / onDraftChange | P3草稿归属、作用域、清除与恢复生命周期 | 消费受控草稿及编辑handler，反馈保留/清除事实 | 账号隔离、A/B切档、失败/取消、刷新恢复 | BLOCKED / P3 DEPENDENCY |
| 8000 / 4000 | P3确认云输入/旧本地草稿兼容与无损恢复原则 | 按最终原则提示和限制，不先裁剪或新增存储键 | 边界、超限恢复、长输入、导出和世界书往返 | BLOCKED / P3 DEPENDENCY |
| submit handler | P3权威text/revision/幂等/叙述请求与澄清调用边界 | 使用交付handler，按钮只反映真实可提交状态 | 重复点击、澄清、预期revision、回执/叙述分离 | BLOCKED / P3 DEPENDENCY |
| 失败/重试 | P3网络不确定提交、叙述失败、冲突及恢复语义 | 按真实事实提供恢复入口，不自行换幂等键重试 | 断网、超时、已提交但叙述失败、冲突与迟到响应 | BLOCKED / P3 DEPENDENCY |
| loading / busy | P3各阶段真实状态及取消能力 | 阶段提示与禁用、等待可信历史就绪后阅读恢复 | 载入/历史/建议/回执/叙述阶段与取消 | BLOCKED / P3 DEPENDENCY |
| 切档/离页/刷新 | P3载入卸载、过期请求、会话与恢复handler | 隔离各档展示，按历史/草稿/阅读位置恢复 | A档迟到到B档、退出失效、世界往返、刷新继续 | BLOCKED / P3 DEPENDENCY |
| 授权记忆读取 | P3允许字段、NPC选择、权限/时间边界、缓存隔离及错误映射 | 只展示合法可信字段与真实遗忘/缺失反馈 | 跨账号/NPC拒绝、null/partial、真实遗忘、限流及版本错误 | BLOCKED / P3 DEPENDENCY |

请临江仙逐项提供确认版本/P3 SHA、可信类型或样例、恢复/权限边界和负责handler；未知项保留BLOCKED，不猜schema、草稿键、记忆授权或重试语义。共同文件修改须先明确唯一负责人，水龙吟在独立UI分支交提交SHA，临江仙整合后交联合候选由水龙吟复核。

正式通知见[S-HANDOFF-致临江仙交接通知.md](S-HANDOFF-致临江仙交接通知.md)。本次通过Git文档和圈内副本交付；接收方阅读/确认尚未收到。联合回归见[S-HANDOFF-联合UI验收状态.md](S-HANDOFF-联合UI验收状态.md)，当前NOT RUN。
