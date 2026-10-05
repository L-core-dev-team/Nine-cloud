# P1 作者可执行映射（P1-MAP-01 … P1-MAP-06 + NPC presence 来源）

> **来源与效力**：作者侧口径，由 AI 档案员代 LYL 起草；工程侧字段已对照 `packages/contracts/src/world.ts`、`packages/domain/src/nlu/action-parser.ts` 核验。
> 日期：2026-10-04 ｜ 执行依据：`docs/九霄1.0-P1-执行规格-GPT交付版-2026-10-03.md`（SHA-256 `64d576e8…`）
> **约束：不得新增第四个地点；不得引入随机、HP、伤害或死亡。**

---

## P1-MAP-01 · 路线拓扑

### 有向边

| from | to | 初始 state | 说明 |
| --- | --- | --- | --- |
| `loc_luhuadu` | `loc_wangqitai` | `open` | 渡口到旧观测台，正常可走 |
| `loc_wangqitai` | `loc_luhuadu` | **`blocked`** | **落石封住的是这条**：从台子下来要经过石堆 |
| `loc_wangqitai` | `loc_zheguiping` | `locked` | 任务 `quest_first_clearance` 完成后转 `open` |
| `loc_zheguiping` | `loc_wangqitai` | `locked` | 同上 |

### 落石封住的边

**`loc_wangqitai → loc_luhuadu`（单向下行）**。理由：落石堆在渡槽口，望气台能俯瞰它，但**从台子下到渡口必须绕过石堆**；反向上台可走另一侧，不受影响。

### 绕行

```
routeId : 'route_reef_ledge'
from    : 'loc_wangqitai'
to      : 'loc_luhuadu'
via     : 'subloc_reef_ledge'      // 礁石小径
```

**`subloc_reef_ledge` 是 `loc_wangqitai` 的子区域标识，不是第四个 `locationId`。**

| 走法 | 事件 | 耗时 | stamina | 附加 |
| --- | --- | --- | --- | --- |
| 受阻 | `move.blocked{toward:'loc_luhuadu', reason:'rockslide'}` | 1 刻 | −10 | `locationId` 不变 |
| 绕行 | `move.bypassed{from,to,via,extraMinutes:15}` | 2 刻 | −15 | `injuryFlags += 'shoulder_scrape'` |
| 清障后 | `move.arrived` | 1 刻 | −5 | 边 state 转 `open` |

> **硬要求**：受阻边必须**可恢复**。战斗或绕行清障后，同一条边必须能正常通过，否则任务完成后玩家回不去渡口。

---

## P1-MAP-02 · 岑九交谈清障

| 字段 | 值 |
| --- | --- |
| `topicTag` | `'obstacle_rockslide'`（与阻碍 ID 同名，便于规则匹配） |
| 可触发原句（示例） | 「这石头怎么办」「怎么过去」「有别的路吗」「能动吗」 |
| 规则 outcome | **`'refuse'`** |
| 是否产出玩家线索 | **否** |

**回应文本**：`我这把骨头，搬不动那些石头。你自己掂量。`

**为什么不给线索**：线索的唯一来源是**观察**。若交谈也发线索，玩家就能跳过望气台直接问出答案，「观察 → 线索 → 任务选项」这条链会断。`clue_rockslide`、`clue_crow_nest` 必须靠 `observe` 获得。

**「交谈」不是独立的第三条解法**，它是信息性的：玩家确认「这确实过不去、而且他帮不上」，然后自选战斗或绕行。

---

## P1-MAP-03 · 拾取来源

| sourceId | 地点 | itemId | 数量 | 一次性 |
| --- | --- | --- | --- | --- |
| `src_ferry_shore` | `loc_luhuadu`（渡口滩涂，搁浅的旧缆桩旁） | `item_bishuifu` | 1 | ✅ |
| `src_quest_clearance` | 任务奖励（非拾取） | `item_jiuyifu` | 1 | ✅ |

**⚠️ 本条修正了执行规格的一处写法。** 执行规格 §2.4 写「避水符：岑九给的」+「新档持有 ×1」。**本映射改为：**

1. **新档 `inventory` 为空**
2. 避水符**必须拾取**，来源 `src_ferry_shore`——渡口滩涂上搁浅的旧缆桩旁，是岑九早前用过留下的

**理由**：
- 骨架节点 4 要求玩家「通过一次可验证的**取得**行动」获得首件物品；开场即持有等于跳过这一步
- 交接清单明确「开局持有和任务奖励**不能替代拾取来源**」
- 拾取让「观察 → 拾取 → 使用」成为完整链条，且不依赖 NPC 善意

---

## P1-MAP-04 · 修炼法门

| 字段 | 值 |
| --- | --- |
| `techniqueId` | `'tech_breath_basic'`（呼吸法） |
| 新档是否拥有 | **是** |
| 取得方式 | 无须取得。炼体期基础，人人都会 |

**与「新档不持有物品」不冲突**：功法是**能力**不是物品，不走 `inventory`。

**语义依据**：Canon 炼体期（`原073`）记载「呼吸法、药浴与体能锤炼」。首段只开放呼吸法一项。

---

## P1-MAP-05 · 避水符使用

| 字段 | 值 |
| --- | --- |
| 可执行 `targetId` | `'subloc_reef_ledge'`（礁石小径，涉水）<br>`'subloc_ferry_berm'`（渡口作业位，驱鸦） |
| effect flag | `'effect_ward_water'` |
| 对应 ActionIntent | `use_item{itemId:'item_bishuifu', targetId: <上述之一>}` |
| 何时消耗 | **仅当目标合法且结算成功时**数量 −1 |

**两个用途的语义**：岑九台词「灰羽鸦……不咬人，抢食」——避水符是水滨人家用来驱水禽的常物，在渡口作业位驱鸦同样成立。

**负例夹具**：对 `loc_wangqitai` 使用避水符 → `RULE_TARGET_MISMATCH`，符仍在身上，**0 事件**。

---

## P1-MAP-06 · 作业位与战斗目标

### 作业位

```
subloc_ferry_berm     // 渡口作业位，loc_luhuadu 的子区域
```

**不是第四个地点**，是 `loc_luhuadu` 内的子区域。战斗时玩家需「在作业位」。

### 战斗目标

| 字段 | 值 |
| --- | --- |
| `targetId` | `'npc_shuiyuya'`（灰羽鸦） |
| 可及条件 | `obstacleState !== 'cleared'` 且玩家在 `subloc_ferry_berm` 或 `subloc_reef_ledge` |
| 出现位置 | 渡口落石堆（`loc_luhuadu`） |

### 确定性战斗三态所需的字段

**结果必须在结算前由规则依据下列字段判定，不得由模型输出或随机数决定。**

| 态 | 判定条件（结算前求值） | 结果 |
| --- | --- | --- |
| **驱退** `clear` | `stamina ≥ 25` **且**（在 `subloc_ferry_berm` **或** 持有 `item_bishuifu`）**且** `spiritStamina ≥ 25` | `obstacleState='cleared'`；`spiritStamina −25`；`combat.resolved{outcome:'clear'}` |
| **险胜** `clear_wounded` | `stamina ≥ 25` 且无上述加成，且 `spiritStamina ≥ 25` | `obstacleState='cleared'`；`spiritStamina −25`；`injuryFlags += 'crow_scratch'` |
| **受挫撤退** `retreat` | `stamina < 25` **或** `spiritStamina < 25` | `spiritStamina = 5`；退回 `loc_luhuadu`；`injuryFlags += 'retreated'`；**任务未完成**，次日可再来 |

**时机分支**：白天 `300 ≤ gameMinute < 1020` 按上表；黄昏 `gameMinute ≥ 1020` 鸦回巢 → 稳定 `clear`，`injuryFlags += 'crowding_bite'`。判定**只依赖 `gameMinute`**。

**明确禁止**：`combat.resolved` 的 payload 中**不得**包含任何叙事文本或模型建议的伤害值。

---

## 补充 · NPC 在场状态的权威来源

### 核验结论：**目前不存在**

| 事实 | 出处 |
| --- | --- |
| `WorldStateSchema` 字段仅 `playerId` / `locationId` / `elapsedMinutes` / `facts` | `packages/contracts/src/world.ts` |
| `parseActionText` 接收 `VisibleTargetCatalog`，其中含 `npcPresence: readonly VisibleTarget[]` | `packages/domain/src/nlu/action-parser.ts:22` |
| `ENTITY_SLOT_POLICY` 中 `talk` 的 `npcId` 来源是 `npcPresence` | 同上 `:84` |
| **`parseActionText` 只在测试中被调用**（`action-parser.test.ts`、`prologue-v1-rules.test.ts`），**无任何生产代码调用** | 全仓检索 |

**结论**：解析器需要 `npcPresence` 目录，但没有任何地方生产它，权威状态也没有对应字段。**这是真实的架构缺口，不是配置问题。**

### 落地要求

1. **在场必须由权威状态承载**，不得由叙事模型输出决定。
2. **落点二选一，由 Bird 定**：
   - 在 `WorldStateSchema` 增 `npcPresence`；或
   - 增一个同修订的伴随结构
3. **必须满足**：
   - 由**规则事务**在回合提交时一并写入（与事件同 revision）
   - 内容为可见实体 ID 列表（首段仅 `npc_cenjiu`、`npc_shuiyuya`）
   - **不承载**「是否可见」「是否可交谈」——那些由 `knownLocations`、任务状态与 `obstacleState` 推导
4. **剧情语义确认（A 侧）**：该来源**只表达「谁在场」这一事实**，不改变任何人物身份、动机或 Canon 事实。岑九仍只知道白名单内的内容。
5. **禁止**：把模型叙事里的「XX 出现在门口」当作在场依据。

---

## 工程侧待 Bird 确认

- [ ] `locationGraph` 能否表达 `open` / `blocked` / `locked` 三态
- [ ] `subloc_*` 子区域如何在 `VisibleTargetCatalog.observationTargets` 中表达，还是需要独立字段
- [ ] `npcPresence` 落 `WorldState` 还是伴随结构，如何保证与事件同事务写入
- [ ] `combat` 的 `targetId` 是否走 `npcPresence` 目录（当前 `ENTITY_SLOT_POLICY` 只含 `move` / `use_item` / `talk` / `observe`，**不含 `combat`**）
- [ ] `move.bypassed` 的 `via` 字段类型
- [ ] `obj_ferry` 作为 `observe` 目标的可见性判定规则
- [ ] 上述字段缺失时应补哪个迁移（**只能追加，不得改历史迁移**）

---

## 变更说明

| 项 | 变更 |
| --- | --- |
| 新档物品 | 修正为**空**；避水符改由 `src_ferry_shore` 拾取 |
| 避水符来历 | 修正为「渡口滩涂搁浅的旧缆桩旁」，非「岑九给」 |
| 落石封住的边 | 明确为 `loc_wangqitai → loc_luhuadu`（单向下行） |
| 礁石小径 | 明确为 `subloc_reef_ledge`，**不是第四个地点** |
| 交谈解法 | 明确为信息性（`refuse`），**不发线索**，不构成独立解法 |
| NPC presence | 核验为**不存在**，给出落地要求 |
