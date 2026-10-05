---
document_id: JX-P1-EXEC-SPEC
title: 《九霄》1.0 P1 · 执行规格（GPT 交付版）
version: 3.1.0
date: 2026-10-05
track: P（玩法与双记忆）
signature:
  LYL: 已签署 2026-10-03
  Bird: 已签署 2026-10-03（据 LYL 于 2026-10-03 转述记录）
inputs:
  - docs/九霄1.0-P1-玩法规则与序章交付底稿-2026-10-03.md
  - docs/九霄1.0-P1-玩法规则与序章-交付包-起草稿-2026-10-03.md
  - docs/九霄1.0-P1-八项决定与润色方案-2026-10-03.md
  - docs/九霄1.0玩法与双记忆补充方案-审阅采纳裁决-2026-10-03.md
supersedes: 起草稿与八项决定（作为输入保留，不删除）
status: 已签署基线 · 含 2026-10-05 PR-5 工程勘误
---

# 执行规格（GPT 交付版）

> **给执行模型的三条硬规则**
> 1. 本文件是**唯一执行依据**。与本文件冲突的旧文档一律以本文件为准。
> 2. **不许替规则编数值。** 所有数字在 §4 已定，照抄即可；发现矛盾时**停下并上报**，不得自行折中。
> 3. **不许让模型写状态。** 叙事模型只产出文本；任何写入 `WorldState` 的路径必须经过规则 reducer。

---

## 1. 术语与不变量

### 1.1 术语

| 词 | 含义 | 禁止混淆 |
| --- | --- | --- |
| 世界事实 | 由 `RULES` 事件与状态投影确定、不可变、可回放 | 不等于「NPC 以为的事」 |
| 授权观察 | NPC 因目击/转述/观察授权而获得的、字段白名单冻结的事实片段 | 不等于世界事件本身 |
| 规则 | 决定行动被接受/合法失败/拒绝的纯函数 | 不等于提示词 |
| 叙事 | 对**已提交事实**的文学表达 | 永远不能反写状态 |
| 一刻（Kec） | P1 唯一行动时长单位；1 刻推进 15 `gameMinute`，一游戏日为 96 刻 | 不等同现实时间；规则输入、事件耗时和玩家时长文案统一使用“刻” |
| `gameMinute` | 唯一权威游戏时钟；起始值 300，每刻推进 15 | 用于持久化、结算、昼夜与日课索引；UI 显示刻数，不显示原始整数 |
| 拒绝 | 无事实后果（0 事件、0 耗时） | 与「合法失败」严格区分 |

### 1.2 六条不变量（不可协商）

1. **规则事务是唯一世界事实写入者。** 模型、记忆引擎、摘要器、插件只能提供候选或表达。
2. **NPC 只能检索自己获准知道的观察。** 全局事件不得绕过目击、转述与授权过滤。
3. **Continue / Forgetting 读同一批授权观察**，差别只在检索可访问性；模式在建档时锁定，运行中不可静默切换。
4. **无模型也必须可玩。** 模型只提高叙事质量，不获得额外行动权限。
5. **未知或歧义输入须澄清**，不猜测、不结算。提交前的取消不产生事件；结算后取消只能恢复或重试文字，**不得重掷规则结果**。
6. **1.0 核心闭环不含离线世界演化**；不含社区；不含收费。

### 1.3 作者已定规则边界（2026-10-04）

以下决定由作者 A、B 明确给出并立即生效。与本文件旧表述冲突时，以本节和对应修订条文为准。

1. 时间只用刻；1 刻 = 15 `gameMinute`。不定义时辰、分钟等第二套玩法换算单位。
2. P1 规则不使用随机数。战斗确定性地结算为驱退、险胜或受挫撤退。
3. P1 不引入 HP、伤害数值或死亡。战斗沿用既有体力、`spiritStamina`、伤势标记和三态结果。
4. `cultivate.minutes` 的兼容字段表示请求刻数；每次最多 8 刻，超过时以 `INPUT_CULTIVATION_LIMIT` 硬拒绝，零事件、零耗时、零消耗。
5. 背包满以 `INPUT_INVENTORY_FULL` 硬拒绝，零事件、零耗时、零消耗。
6. 首段不使用好感、信任、亲密度等数值关系字段；关系事实只通过获准的 `clues[]` 和 `npcInteractionLog[]` 表达。
7. 记忆区分可 supersede 的当前状态命题、不可删除的历史事件和主观信念；只有第一类允许 supersession。该分类是记忆层契约，不由叙事模型改写世界事实。
8. 岑九只知道本章作者列出的白名单事实，不知道黑名单事实；不得从全局事件或模型上下文绕过 NPC 知识过滤。
9. 世界地点仅为芦花渡、望气台、折桂坪；新档只认识前两处，折桂坪只在领取任务奖励后解锁。观察不得创建或解锁地点。

此前被拒绝的 `A_decay×(1+C)`、一律拒绝 `free_text`、固定百分比上下文预算仍不得恢复。

---

## 2. 世界与人物（定稿 Canon）

> 全部为**作者原创**。援引仅限体系名词与稳定 ID，不新增设定。

### 2.1 时间与地

| 项 | 值 |
| --- | --- |
| 时间制 | 一游戏日 = 96 刻；每刻 = 15 `gameMinute`；不引入时辰制 |
| 起点 | `gameMinute = 300`，即游戏日第 1 刻 |
| 地域 | `region_zhongzhou_tianshu`（中州天枢域） |

**刻数索引（P1 唯一时间表示）**

```
elapsedKec = (gameMinute - 300) / 15
gameDayIndex = floor(elapsedKec / 96)
kecIndex = elapsedKec mod 96  // 0–95
显示 = 「第 {kecIndex + 1} 刻」
```

合法存档必须满足 `gameMinute ≥ 300` 且 `(gameMinute - 300) mod 15 = 0`。例如 `gameMinute=300` 是第 1 刻，`gameMinute=315` 是第 2 刻，`gameMinute=1740` 是下一游戏日第 1 刻。

### 2.2 三处地点

| ID | 名称 | 性质 | 边 |
| --- | --- | --- | --- |
| `loc_luhuadu` | **芦花渡** | 水口小聚落；渡口分舵外围岗 | → `loc_wangqitai` |
| `loc_wangqitai` | **望气台** | 渡口外三里的旧观测台，木料朽了，踩上去还有声 | → `loc_luhuadu`、`loc_zheguiping` |
| `loc_zheguiping` | **折桂坪** | 望气台北侧缓坡，可俯瞰渡口 | → `loc_wangqitai`（**任务奖励解锁**） |

新档的 `knownLocations` 只能包含芦花渡与望气台。折桂坪在领取任务奖励的同一规则事务中加入已知地点并开放对应边；完成任务但未领取奖励时仍未解锁。观察只能写入已签线索，不能新增地点、道路或地点可见性。

> **为什么是这三个名字。** 望气台是修仙世界最朴素的观测设施——筑高台、望气机，不涉宗门秘法，配得上「新人第一次看见远处」。折桂坪取「蟾宫折桂」旧意，不宣称与任何 Canon 典故绑定。芦花渡是渡口，与「摆渡人」的生计直接相连。

### 2.3 岑九

| 字段 | 内容 |
| --- | --- |
| ID | `npc_cenjiu` |
| 身份 | 芦花渡摆渡人，工钱按趟算，一天一趟 |
| 派系 | **`unaffiliated`**。受雇于渡口分舵，但**不属于** `faction_sihai_shanghui`（商会 ≠ 雇工） |
| 外貌 | 常年日晒，手背裂口深；左耳缺一角（早年与鸦群抢食留的） |
| 此刻目的 | 等一个要去望气台的人；船堵了三天，趟数不算他的 |
| 关系起点 | 陌生，欠一句「借问」 |
| **能知道** | 渡口落石、水浅船搁、灰羽鸦占了石堆、他自己几点收工、昨天有人来过 |
| **不能知道** | 望气台上有什么、玩家来历与战力、望气台以南那片白是什么 |
| **关系表示** | 不设置好感、信任、亲密度等数字；只写入其有权知道的线索与交互日志 |
| 说话 | 短句。不用敬语。不主动催。不解释自己没被问的事 |
| **否定性设定** | **他记得所有来过渡口的人，但记不住名字。**（与 Forgetting 模式天然呼应；后续 NPC 设计的可复用范式） |

### 2.4 物件

| ID | 名称 | 状态 | 说明 |
| --- | --- | --- | --- |
| `obj_ferry` | 渡船 | `aground` → `clear` | 吃水太深、蹭着淤泥靠不上岸；**船的状态是任务完成最直观的证据** |
| `item_bishuifu` | 避水符（凡品） | 开场持有 ×1 | 岑九给的，原是渡船旧物，符纸已脆。使**一次**落水或涉水行动不受影响。**用掉就没** |
| `item_jiuyifu` | 旧驿符（凡品） | 任务奖励 | 折桂坪旧驿站的信物，早已无用；解锁 `loc_zheguiping` 的边 |

### 2.5 阻碍

| ID | 名称 | 三条解法 |
| --- | --- | --- |
| `obstacle_rockslide` | 落石堵渡 | ① 交谈（岑九不白给，要你自己掂量）② 绕行（礁石小径，多 1 刻，肩擦伤）③ 战斗（驱退灰羽鸦） |

**三条都不封死任务。** 落石清除后，受阻边自动由 `blocked` 转 `open`。

---

## 3. 序章文本（定稿）

> 全部作者原创。**无模型路径亦完全成立**——这批文本不依赖任何模型措辞。

### 3.1 节点六 · 入世

> 船底擦过沙洲，芦花没到膝。
> 渡口那边本该有船。
> 岸上一行新脚印，进去就没了。
>
> 篙在身后一点。「喏，到了。」

**这个开场做了四件事**（拆解给执行模型看，勿改写其功能）：

| 作用 | 载体 |
| --- | --- |
| 触觉落地，不先讲设定 | 「船底擦过沙洲，芦花没到膝」 |
| 5 秒内建立疑问 | 「本该有船」——船去哪了 |
| 暗示世界不围着玩家转 | 「一行新脚印，进去就没了」 |
| 引路者立刻在场 | 「篙在身后一点」——先给声音，再给身份 |

**不许**在首屏出现任何解释性句子（不必说「渡船被石头堵住了」——那是玩家要自己发现的事）。

### 3.2 观察文本

> **原则：场景只呈现，解释交给 NPC。** 观察文本里不出现任何「说明这句意味着什么」的破折号句式。

**芦花渡 · 环视（scan）**
> 渡槽淤了半尺，水发黄。
> 船吃水太深，蹭着淤泥靠不上岸。
> 岸边踩倒的芦花没人扶。
>
> `→ clue_ferry_stuck`

**芦花渡 · 细察船底（study）**
> 船底板缝里嵌着芦籽，一颗一颗排得很匀。
> 刷子是新的，鬃还没散。
>
> `→ clue_ferry_scrubbed`

**芦花渡 · 细察舟具（study）**
> 舟具捆反了。出港得先解缆，再撑篙。
> 缆是新换的麻。旧的烂成絮。
>
> `→ clue_wrong_way`

**望气台 · 环视（scan）**
> 台上没有人。木头朽了，踩上去还有声。
> 渡口一览无余。石从上游下来，堆在渡槽口，最大的那块有门板高。
> 灰羽鸦在石上落着，几十只，一动不动。
>
> `→ clue_rockslide`

**望气台 · 细察落石（study）**
> 石头缝里铺着干草。软的，是新铺的。
> 干草边上压着一圈浅痕，密密的。
>
> `→ clue_crow_nest`

**望气台 · 细察落石（再次）**
> 石头还是那些石头。
> 风从南边来，带一点铁锈味。
>
> `→ observationLog{result:'none'}`

### 3.3 岑九台词

| 主题 | 台词 |
| --- | --- |
| 问船 | 「船没坏。水浅了。」 |
| 问石头 | 「上游冲下来的。前夜响了一宿。」 |
| 问鸦 | 「灰羽鸦。不咬人，抢食。石头缝里那窝，别掏。」 |
| 问望气台 | 「旧台子。没人管了。你要去看，随你。」 |
| 问南边那片白 | 「我没上去过。」 |
| 拒绝帮忙 | 「我这把骨头，搬不动那些石头。你自己掂量。」 |
| 通渡之后 | 「通了。明早第一趟。」 |

**闲聊兜底**（未命中任何主题时，按玩家问法在岑九的所知边界内搪塞）：

| 问法类型 | 回应 |
| --- | --- |
| 问渡口人数 | 「看渡口的人，比看我的少。」 |
| 问将来 | 「我一天只撑一趟。以后的以后，不归我管。」 |
| 问私事 | 「你问这个，我答不上来。」 |
| 纯闲聊 | 「嗯。芦花今年开得晚。」 |

**闲聊三连有回报**：`idleCount` 到 3 时，岑九主动多说一句——「你要是走南边那条路，替我看一眼。什么也没有最好。」此句**不揭示任何 Canon 事实**，只投放钩子。

### 3.4 战斗与结果文本

| 情形 | 文本 |
| --- | --- |
| 驱退 | 鸦群炸开，又落回石头上。<br>石堆松了一层。 |
| 险胜 | 鸦群散开。有一只擦着你肩膀，落回石头。<br>石堆松了。 |
| 受挫撤退 | 鸦群炸起来，绕着你转了两圈。<br>你退到石堆背后。胸口发闷，站不住了。 |
| 绕行 | 礁石小径硌脚，绕远了一刻。<br>落石从左边压过来，你侧身过去，肩上蹭掉一层皮。 |
| 体力耗尽 | 天色暗下来，你的手在抖。 |
| 通渡 | 石堆散了。渡槽口露出一段黑黢黢的水面。<br>远处有桨声。一下，又一下。 |

> **失败文本不做解释。** 「不是被击倒，是站不住了」这类句子在 v2 被删去——**让状态自己说话**。玩家看到「胸口发闷，站不住了」已经明白发生了什么，UI 会另外显示「未完成：通渡」。

### 3.5 结尾钩子

> 从望气台往南看。
> 压在山脊上的那片白，不是云。

只引用**已提交状态**（玩家确在望气台）与**已授权知识**（无 NPC 告知）。**不得在钩子里出现未在 `clues[]` 或 Canon 登记的名词。**

### 3.6 天色变体

同一观察按当前游戏日刻数换文本：

| 时段 | 望气台 · 环视 |
| --- | --- |
| 第 1–48 刻（`kecIndex < 48`） | 见 §3.2 |
| 第 49 刻起（`kecIndex ≥ 48`） | 天光收尽了。渡口只剩水声。石堆成了一片黑。 |

### 3.7 观察改写可点选项（本规格的核心交互创新）

> **原则：玩家能点的东西，由他看到的决定，不由关卡设计者预先摆好。**

| 获得 | 解锁的可点选项 | 触发 |
| --- | --- | --- |
| 初始 | 移动（望气台）、观察、交谈（岑九） | 建档 |
| `clue_ferry_stuck` | 「问问岑九这船怎么回事」 | talk topic=渡船 |
| `clue_rockslide` | 「从礁石那边绕过去」 | `move.bypassed` |
| `clue_crow_nest` | 「赶走石头上那些鸟」 | `combat` |
| `clue_ferry_scrubbed` | 「有人昨天动过这船」 | talk 钩子 |
| `obstacle_cleared` | 「回望气台」「去看折桂坪」 | quest 完成 |

**UI 因此不是按钮列表，而是玩家认知的镜像。** 玩家先看见，才会去做——这既是吸引力问题，也是「选择有后果」的真正落点。

**实现约束**：可点选项由 `clues[]` + `questState` + `knownLocations` **纯函数推导**，不得硬编码在前端；推导函数必须有单测证明「无对应线索时不出现该选项」。

### 3.8 写作纪律（后续所有文案的验收标准）

> 这一节给**所有写《九霄》文案的人或模型**。它不是风格偏好，是可检查的禁则。

| # | 禁止 | 为什么 | 正确写法 |
| --- | --- | --- | --- |
| W1 | 替玩家解释含义 | 「是昨天有人来过」把玩家刚形成的推断说破，剥夺发现的乐趣 | 「岸边踩倒的芦花没人扶。」——让玩家自己推 |
| W2 | 三行一段的固定节奏 | 每段都「环境 + 结论」会读出模板感 | 变化行长：允许单行、允许三行、允许一句独立成段 |
| W3 | **游戏内文本**每段都以破折号起手 | 破折号用多了就是作者在替读者换气 | 破折号全篇 ≤ 每节 2 次；优先用句号断 |
| W3b | **游戏内文本不得用破折号引出结论** | 这是 AI 文案最明显的指纹 | 场景只呈现物；解释交给 NPC 在对话里说 |
| W4 | 抽象形容词堆叠（苍茫、浩渺、幽深） | 修仙文最常见的 AI 味来源 | 换成具体名词：一颗一颗排得很匀的芦籽、烂成絮的旧麻 |
| W5 | 完整句解释失败 | 「不是被击倒，是站不住了」是解释 | 「胸口发闷，站不住了。」——状态自己会说话 |
| W6 | 让 NPC 说出他不该知道的事 | 破坏授权边界 | 岑九只说船、水、石头、鸦、收工时间 |
| W7 | 用「你」做道德预设（「你不该贪」） | 替玩家判断 | 只描述后果，不描述对错 |
| W8 | 在文本里出现未登记的名词 | 会把未审 Canon 写进存档 | 文本词汇只能来自 `clues[]` / 已签 Canon / 通用物理名词 |
| W9 | 修辞密度均匀 | 每句都带一个比喻会互相抵消 | 只在关键处用一次比喻，其余写实 |
| W10 | 「沉默了片刻」式的时间填充 | 无信息量 | 省略，或改成一个可观察的动作 |

**自检三问**（写完每段问一遍）：
1. 这句话是在**呈现**，还是在**解释**？→ 解释就删后半句。
2. 删掉最后一个分句，玩家会不会更想往下看？→ 会，就删。
3. 这个人／这个地方**此刻**有没有理由说这句？→ 没有就换人。

---

## 4. 行动规则（定稿）

### 4.1 数值总表

| 常量 | 值 |
| --- | --- |
| `GAME_MINUTES_PER_KEC` | 15（仅用于把规则刻数投影到权威 `gameMinute`） |
| `DAY_KEC_COUNT` | 96 |
| `SAVE_START_GAME_MINUTE` | 300 |
| `DUSK_START_KEC` | 48（游戏日第 49 刻起为夜间） |
| `STAMINA_MAX` | 100 |
| `SPIRIT_MAX` | 100 |
| `CULTIVATION_MAX` / `CULTIVATION_PER_KE` | 10000 / 800 |
| `CULTIVATION_FATIGUE` | 200 |
| `FATIGUE_THRESHOLD` | 20 |
| `SLOT_MAX` | 8 |
| `MOVE_COST` / `MOVE_BLOCKED_COST` / `MOVE_BYPASS_COST` | 5 / 10 / 15 |
| `OBSERVE_SCAN_COST` / `OBSERVE_STUDY_COST` | 3 / 6 |
| `CULTIVATE_COST_PER_KE` | 20 |
| `TALK_COST` / `USE_ITEM_COST` | 0 |
| `COMBAT_COST` | 25 |
| `CLEAR_THRESHOLD` | 25 |
| `RETREAT_SPIRIT` | 5 |
| `FREE_ACTION_TICK_KEC_COUNT` | 1 |

**余量校验**：最短通关 = 3+5+3+6+25 = **42**；100 ÷ 42 ≈ **2.38 倍**。低于 1.5 会让「一次失误等一天」成为常态；高于 3 倍体力沦为装饰。**改动任一消耗值后必须重算此比值。**

**消耗频率纪律**：所有消耗取 5 的倍数，便于玩家心算与测试口算。

### 4.2 八类行动

| 行动 | 输入 | 前置 | 耗时 | 消耗 | 成功 | 合法失败 | 拒绝 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `move` | `destinationId` | 已知目标须有当前位置边；未探索目标须有规则目录标记的相邻未知边 | 1 刻 | 5 | `move.arrived` | **路断** `move.blocked`（1 刻 / 10）<br>**绕行** `move.bypassed`（2 刻 / 15，记 `injuryFlags['shoulder_scrape']`）<br>**未探索** `move.blocked{reason:'unexplored'}`（1 刻 / 5） | 目标不存在 / 已知目标无边 |
| `cultivate` | `techniqueId, minutes(兼容字段，语义为请求刻数 1–8)` | 功法可用；`stamina>0` | 实际尝试刻数 × 1 刻 | 每次常规刻 20 | 每次常规刻进度 +800 | 先执行可付费常规刻；尚有 1–19 体力时最多再强练一刻（+200、剩余体力归 0、`fatigueCount+1`），随后停止 | 请求超过 8 刻 → `INPUT_CULTIVATION_LIMIT` 零副作用拒绝；无可用功法 / `stamina=0` |
| `acquire_item` | `itemId, quantity` | 槽位未满且当前地点有可取得来源 | 1 刻 | 0 | `item.acquired`（规则从位置与物品解析 `sourceId`，不接受客户端指定来源） | — | 来源不存在 → `INPUT_NO_SUCH_TARGET`；来源已领取 → `ENV_SOURCE_ALREADY_CLAIMED`；固定数量不符 → `ENV_SOURCE_QUANTITY_INVALID`；背包满 → `INPUT_INVENTORY_FULL`。均零事件、零耗时、零消耗 |
| `use_item` | `itemId, targetId?` | 持有该物 | 1 刻 | 0 | `item.consumed` + `effectFlags` | — | 未持有 / 目标不匹配（拒绝；不消耗、无事件） |
| `talk` | `npcId, utterance` | NPC 在场 | 1 刻 | 0 | `talk.occurred` + 可选 `talk.topic_learned`；命中已签清障主题时同步打开受阻边并完成通渡 | 未命中主题 → `outcome='idle'`，`idleCount+1` | NPC 不在场 |
| `combat` | `targetId, techniqueId?` | 目标在场；`spiritStamina>0` | 2 刻 | 25 | 三态裁决（§4.3） | 受挫撤退 | 心力不足 |
| `observe` | `targetId, method` | 目标在场可及 | scan 1 刻 / study 2 刻 | 3 / 6 | 产出 `clueId` | **无新发现**（已 study 过同一目标）<br>**受阻**（不可及、雾深、视距外） | 目标不在场 |
| `quest` | `questId, choiceId='claim_reward'` | `status='completed'` 且未领 | 1 刻 | 0 | `quest.reward_claimed` | — | 未完成 / 已领取 |

除拒绝外，所有已接受的 ActionIntent 至少推进 1 刻。表中耗时为 0 的旧草稿值已纠正；无体力成本的行动仍推进游戏时钟。

### 4.3 战斗三态（无随机）

| 态 | 条件 | 结果 |
| --- | --- | --- |
| 驱退 | `stamina≥25` 且（在渡口作业位 或 持 `item_bishuifu`） | `obstacleState='cleared'`，`stamina−25`，`spiritStamina−25` |
| 险胜 | `stamina≥25` 但无上述条件 | `obstacleState='cleared'`，`stamina−25`，`spiritStamina−25`，`injuryFlags+='crow_scratch'` |
| 受挫撤退 | `stamina<25` 或 `spiritStamina<25` | `stamina` 最多扣 `COMBAT_COST`，`spiritStamina=5`，退回 `loc_luhuadu`，`injuryFlags+='retreated'`，**任务未完成**，次日可再来 |

驱退或险胜清除阻碍时，同一 `combat.resolved` 事件还会将对应的受阻地点边从 `blocked` 改为 `open`；受挫撤退不改变该边。交谈清障沿用同一地点边转移。

**战斗限制**：此阶段不抽随机数，不建立 HP、伤害数值或死亡状态。规则根据当前体力、`spiritStamina`、昼夜、位置和已签物品确定性地选取三态之一。事件只记录裁决、资源投影及适用的伤势/阻碍变化；模型不得更改结果。

### 4.4 任务

| 项 | 值 |
| --- | --- |
| ID | `quest_first_clearance`（**通渡**） |
| 完成条件 | `obstacleState==='cleared'` —— **三条解法任一，顺序任意** |
| 失败 | 无硬失败。`spiritStamina` 耗尽 → 当日不推进，次日可再来 |
| 奖励 | `item_jiuyifu` ×1；领取奖励时将 `loc_zheguiping` 加入 `knownLocations` 并解锁对应边 |
| 重复领奖 | `rewardClaimed===true` 后二次 claim → **拒绝** |

P1 不持久化独立的 `active` 任务状态。`questState.status` 仅为 `unavailable` 或 `completed`；可见进度由线索与 `obstacleState` 派生。任一签署解法清除阻碍时，同一事务写入 `quest.completed`。领奖是唯一 `quest` ActionIntent 选项，`choiceId` 固定为 `claim_reward`。

### 4.5 观察的层次设计

```
第一次 scan  目标  → clueLevel1（一层信息）
第一次 study 目标  → clueLevel2（深化，如「干草是新的」）
再次 study  同一目标 → observationLog{result:'none'}，无新发现
```

**这让观察可深挖、但不能刷。** 「无新发现」因此是**有意义的失败**而非敷衍。
若本次 `scan` 或 `study` 对应的 `clueId` 已存在于 `clues[]`，结果也为 `none`；`found` 只表示本次首次写入一条新线索。

### 4.6 体力是日课

```
读取 stamina 时：
  elapsedKec = (gameMinute - SAVE_START_GAME_MINUTE) / 15
  dayIndex = floor(elapsedKec / DAY_KEC_COUNT)
  若 dayIndex > staminaDayIndex → stamina = STAMINA_MAX, spiritStamina = SPIRIT_MAX, staminaDayIndex = dayIndex
若 stamina < actionCost → 本次行动可结算，扣至 0，不生成负体力；`exhausted` 由 0 推导
```

`staminaDayIndex` 记录最近一次恢复对应的游戏日；P1 初值为 `0`。`exhausted` 由结算后的 `stamina === 0` 推导，不持久化为额外 WorldState 字段。
存档的 `staminaDayIndex` 不得大于当前 `gameMinute` 推导出的游戏日；超前索引无法由合法规则事件产生，必须 fail closed。

跨日时 `stamina` 与 `spiritStamina` 一同恢复到各自上限。共享 `staminaDayIndex` 作为恢复日索引，使 §4.4“次日可再来”可执行；恢复只依据游戏日，不依据现实离线时长。

`stamina < actionCost` 时，各 ActionIntent 仍按自己的表项裁决，体力消耗钳制为 0：移动和观察没有 `stamina>0` 前置条件，仍可结算；修炼明确要求 `stamina>0`，归零时硬拒绝；战斗按 §4.3 进入受挫撤退。该规则不产生负体力。

**耗尽 = 局部软限制**，不是硬失败或存档失败。零体力时修炼暂不可用；移动、观察和无体力成本行动仍按各自规则结算；战斗依规则撤退。跨游戏日恢复后再恢复修炼能力。不得把 `stamina=0` 扩成所有行动的统一硬拒绝。

---

### 4.7 时机分支：让「等一等」成为战术（创新点）

> **设计意图**：在没有开放世界的 P1 阶段，时间必须成为唯一的战术资源。否则「等」只是浪费体力，玩家的最优解永远是立刻做完所有事。

**灰羽鸦的习性**（与岑九台词「不咬人，抢食」一致）：

> 白天散在石上晒，入夜后回巢，挤作一团。

| 时段 | 细察落石 | 战斗 |
| --- | --- | --- |
| 白天（`kecIndex < 48`） | `clue_crow_nest`（看得清） | 需 `stamina≥25` **且**（在渡口作业位 或 持 `item_bishuifu`）→ 否则**险胜** |
| 入夜后（`kecIndex ≥ 48`） | `observe.result{result:'blocked', blockedReason:'too_dark'}` | 鸦挤在石缝里，一赶就开 → **驱退**；`injuryFlags+='crowding_bite'` |

**战术取舍因此成立**：

| 玩家想要 | 必须在 | 代价 |
| --- | --- | --- |
| 拿到 `clue_crow_nest`（后续需要） | 白天细察 | 战斗变难，得先备避水符 |
| 更容易驱退鸦（仍会被挤咬） | 黄昏/夜间 | 拿不到线索 |

**体力自然衔接**：`staminaMax=100`；跨两个时段行动即推进两刻，等一趟约 1 刻。**等一趟的体力消耗（移动 5）与战斗节约的风险相当**——玩家要算的不是「划不划算」，而是「我现在更缺线索，还是更缺把握」。

**实现约束**：时段判定必须是 `pure(gameMinute)` 的纯函数，禁止在规则外用现实时间或 UI 状态推断；两个时段的战斗结果**都要进夹具**。

### 4.8 错误码约定（严谨性）

规则结算结果须区分已提交的合法失败与无副作用硬拒绝。合法失败仍是一次已提交行动；硬拒绝不改变世界状态。

| 前缀 | 含义 | 事件 | 耗时 | 消耗 |
| --- | --- | --- | --- | --- |
| `RULE_` | `Decision.status='accepted'` 且 `outcome='legal_failure'`；有事实后果 | ≥1 | 可能有 | 可能有 |
| `INPUT_` | `Decision.status='rejected'`；输入层不成立 | 0 | 0 | 0 |
| `AUTH_` | `Decision.status='rejected'`；授权或可见性不成立 | 0 | 0 | 0 |
| `ENV_` | `Decision.status='rejected'`；环境不满足 | 0 | 0 | 0 |

`RULE_*` 必须携带规则事件、推进 revision，并在 `Decision` 中标记 `outcome='legal_failure'`。`rejected` 只用于 0 事件、0 耗时、0 消耗的硬拒绝。这样可避免把已结算结果误当成未提交回合。

**本阶段全部错误码**

```
RULE_ROAD_BLOCKED        路断           （1 刻 / 10）
RULE_LOCATION_UNEXPLORED 未探索         （1 刻 / 5）
RULE_STAMINA_LOW         体力不足，强练后疲惫加重
RULE_TALK_IDLE           交谈未命中主题 （1 刻 / 0）
RULE_COMBAT_RETREAT      受挫撤退       （2 刻 / 25）
RULE_NO_NEW_DISCOVERY    观察无新发现   （按观察方式耗时/消耗）
RULE_OBSERVE_BLOCKED     观察受阻       （按观察方式耗时/消耗）

INPUT_UNKNOWN_ACTION     词表无法可靠映射
INPUT_AMBIGUOUS          命中多个合法动作或目标
INPUT_MISSING_SLOT       缺必要槽位
INPUT_NO_SUCH_TARGET     目标不存在
INPUT_CULTIVATION_LIMIT 修炼请求超过 8 刻（硬拒绝，无事件）
INPUT_INVENTORY_FULL     物品栏已满（硬拒绝，无事件）

AUTH_NPC_ABSENT          NPC 不在场
AUTH_ACTOR_MISMATCH       ActionIntent.actorId 与存档 playerId 不一致
AUTH_UNAUTHORIZED_TARGET 目标在可见范围外

ENV_RULES_NOT_READY      规则未签署（fail closed）
ENV_REVISION_STALE       revision 过时
ENV_IDEMPOTENCY_CONFLICT 同键异载荷
ENV_PAYLOAD_INVALID      事件 payload 不合 schema
ENV_ITEM_NOT_OWNED       物品未持有（硬拒绝，无事件）
ENV_TARGET_MISMATCH      物品目标不匹配（硬拒绝，无事件）
ENV_ROUTE_NOT_CONNECTED  已知目标没有当前位置道路（硬拒绝，无事件）
ENV_ROUTE_LOCKED         道路尚未解锁（硬拒绝，无事件）
ENV_SOURCE_ALREADY_CLAIMED 一次性来源已经领取（硬拒绝，无事件）
ENV_SOURCE_QUANTITY_INVALID 来源固定数量与请求不符（硬拒绝，无事件）
ENV_TECHNIQUE_LOCKED     功法当前不可用（硬拒绝，无事件）
ENV_STAMINA_EMPTY        体力为零，不能修炼（硬拒绝，无事件）
ENV_SPIRIT_STAMINA_EMPTY 心力为零，不能战斗（硬拒绝，无事件）
ENV_QUEST_NOT_READY      任务条件尚未满足（硬拒绝，无事件）
ENV_QUEST_ALREADY_CLAIMED 奖励已领取（硬拒绝，无事件）
```

**每条 `RULE_*` 与 `ENV_*` 必须配一句玩家可读的话**（见 §9 禁止事项第 7 条）。

---

## 5. 事件目录与状态投影

### 5.1 事件

| 事件 | payload 必备 | 投影 |
| --- | --- | --- |
| `move.arrived` | `from, to, kecCount` | `locationId, gameMinute, stamina, staminaDayIndex, knownLocations` |
| `move.blocked` | `toward, reason('rockslide'\|'unexplored'), kecCount` | `gameMinute, stamina, staminaDayIndex, travelLog[]` |
| `move.bypassed` | `toward, via, kecCount, extraKecCount` | `locationId, gameMinute, stamina, staminaDayIndex, obstacleState, locationGraph, injuryFlags[]` |
| `cultivate.attempted` | `techniqueId, kecCount(实际尝试刻数), requestedKecCount, attemptedKecCount, result('progress'\|'fatigue')` | `cultivationProgress, gameMinute, stamina, staminaDayIndex, fatigueCount` |
| `item.acquired` | `itemId, quantity(来源固定数量), source, sourceId, kecCount` | `inventory[], collectedSources[], gameMinute` |
| `item.consumed` | `itemId, quantity, effect(string[]), kecCount` | `inventory[], effectFlags[], gameMinute` |
| `item.depleted` | `itemId` | `inventory[]` |
| `talk.occurred` | `npcId, topicTag, outcome('on_topic'\|'idle'\|'refuse'), kecCount` | `npcInteractionLog[], idleCount, gameMinute`；清障主题另投影 `obstacleState, locationGraph` |
| `talk.topic_learned` | `npcId, clueId` | `clues[]` |
| `combat.resolved` | `targetId, outcome('clear'\|'clear_wounded'\|'retreat'), ruleVersion, kecCount` | `gameMinute, stamina, staminaDayIndex, spiritStamina, locationId, obstacleState, locationGraph, injuryFlags[]`；撤退不清除阻碍或开放受阻边 |
| `observe.result` | `targetId, method, result('found'\|'none'\|'blocked'), kecCount, clueId?, blockedReason?, clueLevel?` | `observationLog[], clues[], gameMinute, stamina, staminaDayIndex` |
| `quest.completed` | `questId` | `questState{status:'completed'}, ferryState:'clear'` |
| `quest.reward_claimed` | `questId, rewardItemId, kecCount` | `inventory[], questState{rewardClaimed:true}, knownLocations[], locationGraph 解锁边, gameMinute` |

### 5.2 状态投影字段

| 字段 | 类型 | 读写 | 缺省 | 可见范围 |
| --- | --- | --- | --- | --- |
| `locationId` | ID | move | `loc_luhuadu` | 玩家 + 同场 NPC |
| `gameMinute` | 整数 | 八类已接受行动 | 300 | 玩家（NPC 不感知绝对时间） |
| `stamina` | 0–100 | move/cultivate/observe/combat（日课恢复时） | 100 | 玩家 |
| `staminaDayIndex` | 非负整数 | move/cultivate/observe/combat（读取时触发日课恢复） | 0 | 系统；不单独展示 |
| `spiritStamina` | 0–100 | combat/日课恢复 | 100 | 玩家 |
| `cultivationProgress` | 定点 0–10000 | cultivate | 0 | 玩家 |
| `fatigueCount` | 整数 | cultivate | 0 | 玩家 |
| `inventory[]` | ≤8 格 | 取得/使用/放弃 | `[避水符×1]` | 玩家 |
| `collectedSources[]` | `sourceId[]` | acquire_item | 空 | 系统；记录一次性拾取源，避免消费后重复领取 |
| `effectFlags[]` | 枚举 | use_item | 空 | 玩家 |
| `clues[]` | `clueId[]` | observe/talk | 空 | 玩家；是否告知 NPC 另由 talk 决定 |
| `observationLog[]` | 结构化 | observe | 空 | 玩家 |
| `npcInteractionLog[]` | 结构化 | talk | 空 | 玩家 |
| `travelLog[]` | 结构化 | move.blocked | 空 | 玩家 |
| `injuryFlags[]` | 枚举 | 绕行/受挫 | 空 | 玩家 + **同场 NPC 可见** |
| `questState{status, rewardClaimed}` | `status: unavailable/completed`; `rewardClaimed: boolean` | `quest` / 清障 | `{status:'unavailable', rewardClaimed:false}` | 玩家 |
| `knownLocations[]` | ID[] | 新档初始化/`quest.reward_claimed` | `[loc_luhuadu, loc_wangqitai]`；领奖后增加 `loc_zheguiping` | 玩家 |
| `locationGraph` | 边 + `state(open/blocked/locked)` | quest/move/talk/combat | 见 §2.2；运行时只接受规则目录中的初始边，以及已签清障/领奖所能导出的状态变化，不接受存档自行增加的地点连边 | 玩家 |
| `idleCount` | 整数 | talk | 0 | 玩家 |
| `obstacleState` | `blocked/cleared` | move.bypassed/talk.occurred/combat.resolved | `blocked` | 玩家 |
| `ferryState` | `aground/clear` | quest.completed | `aground` | 玩家 |

**三条硬规则**：① `facts` 不是自由空间，新增键必须先进本目录；② 玩家状态与 NPC 认知投影分开，模式库不得改写权威 `WorldState`；③ 事件 `source` 恒为 `RULES`，`ruleVersion` 恒等于 `save.ruleVersion`。

所有行动事件用 `kecCount` 记录实际推进的刻数；绕行的额外时长用 `extraKecCount`。投影只由规则把刻数乘以 15 推进权威 `gameMinute`。为兼容通用旧投影而保留的 `elapsedMinutes` 若存在，只能由同一增量派生；P1 规则、时段、日课和记忆衰减不得读取它。`cultivate` ActionIntent 的旧字段名 `minutes` 保留以兼容契约，但其语义是请求刻数，合法范围为 1–8；事件记录请求值和实际尝试值，超出上限则在解析结算前硬拒绝。

---

## 6. 解析与澄清契约

### 6.1 四态

| 解析结果 | 条件 | 行为 |
| --- | --- | --- |
| 唯一且完整 | 命中已签词表/模板，槽位齐全 | 构造 `ActionIntent` 交规则层 |
| 缺槽 | 动作可识别，缺必要槽位 | 返回结构化 `missingSlots` + 一句短问；**0 事件** |
| 多义 | 命中多个合法动作或目标 | 返回 ≤4 条固定顺序候选；选择前**0 事件** |
| 未知 | 否定/条件/指代未解析，或词表无法可靠映射 | **原文安全回引**请求确认；**0 事件** |

### 6.2 `clarify` 扩展

```ts
clarify: {
  question: string;                  // 给玩家看的短问
  missingSlots: string[];             // ≤8
  candidates: Array<{                 // ≤4
    kind: 'move'|'cultivate'|'acquire_item'|'use_item'|'talk'|'observe'|'combat'|'quest';
    label: string;                    // 人类可读，可回显为可编辑文本
    slots: Record<string, unknown>;   // 已确定的部分
  }>;
  interactionId: string;
  revision: number;
}
```

**候选顺序固定**为 `move → cultivate → acquire_item → use_item → talk → observe → combat → quest`，保证跨设备确定性。候选 ID **只从调用方提供的当前授权可见目录生成**（`knownLocations` / `npcPresence` / `observationTargets` / `clues` / `inventory` / `obstacleState`）。其中 `observationTargets` 是规则目录中按玩家当前位置与可见性筛出的观察对象；它与对象所属的 `locationId`、观察结果写入的 `clueId` 是不同字段。解析器不得用地点 ID 或已发现的线索 ID 冒充 `observe.targetId`；规则层仍须独立校验目标在场与可及性。

### 6.3 `free_text` 的出口

**不设「一律拒绝」**（遵采纳裁决第 86 行）：

```
命中已签词表且槽位唯一完整  → 转为签署过的 ActionIntent
否则                        → 原文回引 + 请求确认
拒绝示例（规则层，非解析层）：
  「你对着一棵树说『离开』。它听不懂，也没有走。」
```

### 6.4 幂等键

| 情形 | 键 | 关联 |
| --- | --- | --- |
| 网络重试（同键同正文） | **复用** | 同一 `interactionId` |
| 澄清后修改正文 | **新键** | `clarificationOf` 指向上一轮 |
| 重复点击同一建议按钮 | 复用 | 同一 `interactionId` |

### 6.5 冻结语料分层

已知动作 / 缺槽 / 多义专名（青芜、岑九）/ 否定 / 条件句 / 跨轮指代 / 未知 / 超范围目标 / 过时 revision / 重复提交 / 澄清后改写。

**门槛写法**：「冻结测试集上**未发现误接受**」，报告样本量、分层与标注一致性。**不写「总体误解析率为 0」。**

---

## 7. 玩家自由度设计

> 目标：**看起来自由，底层确定。** 以下五条都只影响「玩家能尝试什么」，不影响「规则能结算什么」。

| # | 设计 | 实现 |
| --- | --- | --- |
| F1 | **可以走向没去过的地方** | 对规则内容目录中登记的“当前位置相邻未知边”发起 `move` → `move.blocked{reason:'unexplored'}`，推进 1 刻、−5 stamina；该未知边不由客户端提供。世界因此「有形状」，地图仍由规则控制 |
| F2 | **闲聊有回报** | 未命中主题的 `talk` 记 `idle`；`idleCount` 到 3 时岑九主动多说一句钩子。**不引入连续好感度数值**——那是内容解锁，不是养成 |
| F3 | **可以尝试没列出的事** | `free_text` 走 §6.3。**拒绝要具体**：「你对着一棵树说『离开』」优于「无法解析」 |
| F4 | **观察可深挖** | scan → 一层线索；study → 深化；再 study → 无新发现 |
| F5 | **顺序自由** | `quest_first_clearance` 只看 `obstacleState==='cleared'`。先战斗、先绕行、先问话、先观察都成立 |
| F6 | **可以点的东西由他看到的决定** | 见 §3.7。可点选项从 `clues[]` 纯函数推导，不是关卡预设 |
| F7 | **等一等也是策略** | 见 §4.7。白天看得清、打得难；黄昏打容易、看不细。**时间成为唯一的战术资源** |

**反面清单**：不引入开放世界随机遭遇；不引入「好感度 +5」；不让模型决定玩家能不能做某事；不因玩家尝试未列行动而惩罚；**不让「等待」成为无代价的空转**。

---

## 8. 真实感设计

| # | 设计 | 落点 |
| --- | --- | --- |
| S1 | **低体力用身体状态描写，不用数字** | `stamina<20` 时叙事层输出「手在抖」「肩颈发僵」。**规则层不感知，叙事层感知** |
| S2 | **痕迹会留下** | `injuryFlags` 影响后续 NPC 台词（岑九会问「肩上怎么了」）。痕迹**不衰减**——它是已提交事件 |
| S3 | **物品是旧的** | 避水符来自旧船，符纸已脆。生效，但用掉就没。来历写进描述 |
| S4 | **天色与耗时挂钩** | 同一观察在白天/入夜后换文本（§3.6）。让行动推进的刻数有叙事后果 |
| S5 | **失败不羞辱** | 只呈现受挫后的身体状态与可见处境；不写「不是被击倒，是站不住了」这类完整句解释。把失败定义为**状态**而非**判决** |
| S6 | **有人先来过** | 芦花渡的脚印、被换的缆、铺过的干草——都指向「昨天有人试过」。世界不只围着玩家转 |

---

## 9. 禁止事项与常见实现错误

| # | 禁止 / 错误 | 正确做法 |
| --- | --- | --- |
| 1 | 改 `deployment/*.compose.yml` | 只读部署文件；改动须另开 ADR |
| 2 | 修改既有迁移历史 | 追加新迁移，不改旧文件 |
| 3 | 用 `Date.now()` 参与任何衰减或结算 | 只用 `gameMinute` |
| 4 | 叙事模型写任何投影字段 | 模型只产出正文；状态回执是唯一凭证 |
| 5 | `free_text` 直接结算 | 必须经确定性解析器 |
| 6 | 只写事件不写投影 | 无投影变化的行动不满足「有后果」门槛 |
| 7 | 拒绝只回错误码 | 每条拒绝配一句玩家可读的话 |
| 8 | 体力耗尽写成硬失败 | 软失败：当天不推进，次日可继续 |
| 9 | 观察只返回描写 | 必须产出 `clueId` 或明确的 `none` |
| 10 | 用 mock 数据冒充 Canon | 夹具只在 `test`，不进 UI/导出/提示上下文 |
| 11 | 候选顺序依赖遍历顺序 | 顺序固定，见 §6.2 |
| 12 | 在 P1 引入分支/回滚 UI | `branchId` 仅预留，不做产品入口 |
| 13 | 硬编码可点选项 | 必须由 `clues[]` 纯函数推导，见 §3.7 |
| 14 | 用 UI 状态或现实时间推断时段分支 | 时段判定只能是 `pure(gameMinute)`，见 §4.7 |
| 15 | 违反 §3.8 写作纪律 | 破折号计数与词表越界须有 CI 断言 |

---

## 10. 任务分解（逐 PR 可执行）

> 每个 PR 独立可提交、可回滚。**必须按序**，前者是后者的前置。

### PR-1 · 契约扩展

| 项 | 内容 |
| --- | --- |
| 文件 | `packages/contracts/src/{action,decision,turn,save,event}.ts` |
| 改动 | ① `ActionIntent` 增 `observe` kind；`common` 增 `branchId`（默认 `'root'`）<br>② `clarify` 增 `missingSlots` / `candidates` / `interactionId`<br>③ `TurnReceipt` 增 `branchId` / `rulesVersion` / `clockMinute` / `rng{seed,draws}`<br>④ `SaveEnvelope` 增 `memoryMode`、`memoryPolicy`<br>**保留** `memoryPolicyVersion`（`strictObject` 删字段会破坏旧导出包）<br>⑤ `DomainEvent` 增 `branchId` |
| 验收 | `pnpm --filter @jiuxiao/contracts test`；`pnpm typecheck` |
| 退出 | 全部 schema 测试通过；旧导出包仍可解析 |

### PR-2 · 规则表 v1

| 项 | 内容 |
| --- | --- |
| 文件 | 新建 `packages/content/src/rules/prologue-v1.constants.ts`、`.ts`；`packages/domain/src/rules.ts` 改用 `decide(intent, save, ctx)` |
| 改动 | 按 §4 实现八类 reducer；`evaluate` 从 fail-closed 改为调用已签规则集（**无模块时仍 fail closed**） |
| 验收 | 八类行动均有纯函数单测，覆盖各自定义的接受结果与拒绝条件；§4 声明的每个合法失败分支至少 1 例。不得为签署表没有定义合法失败的行动虚构此分支；§4.1 余量比值断言 `1.5 ≤ 100/42 ≤ 3` |
| 退出 | reducer 纯函数、无 IO、无 `Date.now()` |

### PR-3 · Canon 内容包

| 项 | 内容 |
| --- | --- |
| 文件 | 新建 `packages/content/src/prologue/`（locations / npc / items / clues / text） |
| 改动 | 按 §2、§3 落内容；接入既有 `canon.registry.json` 门禁 |
| 验收 | `pnpm worldbook:runtime:check`；公开字段隔离测试通过 |
| 退出 | 每条内容带 `sourceType: 'author-original'`；**无未审内容进入运行包** |

### PR-4 · 解析器与冻结语料

| 项 | 内容 |
| --- | --- |
| 文件 | 新建 `packages/domain/src/nlu/`（lexicon / parser / fixtures） |
| 改动 | 按 §6 实现四态；候选顺序固定；`free_text` 按 §6.3 |
| 验收 | 冻结语料全通过；双人盲标一致 |
| 退出 | **未发现误接受**；样本量与分层已记录 |

### PR-5 · 事件与投影落库

| 项 | 内容 |
| --- | --- |
| 文件 | 新增 `packages/db/drizzle/0015_p1_gameplay_persistence.sql`；更新 `packages/db/src/schema.ts` 与 Postgres save/turn adapter |
| 改动 | 复用既有 `turn_events`、`turn_requests` 与 `game_saves.snapshot`，不重复建 prologue 专表；为 `turn_events` 追加 `branch_id='root'`；为 `game_saves` 追加 Save V2 的 `memory_mode` 与完整 `memory_policy`。V1 列保持 NULL，绝不从 `memory_policy_version` 推断模式；V1 继续以 V1 读写，版本固定，不自动升级。V2 从创建时固定模式、policyVersion 与完整策略制品，应用层和数据库均拒绝改写或降级。 |
| 验收 | 隔离库迁移两次；验证 V1/V2 round-trip、事件/回执/投影/记忆同事务提交、owner 隔离、模式策略不可变及 `pnpm test:integration` |
| 退出 | 事件哈希链与 owner 约束仍成立；旧 V1 可读写且不获推断模式；V2 policy 完整往返且不可变；branch 仍被约束为 `'root'` |

**PR-5 工程勘误（2026-10-05）**：原表指定 `0014_prologue_state.sql`。仓库现有迁移 `0014_npc_authorized_observation_outbox.sql` 已被应用并登记在 Drizzle journal，复用 `0014` 会破坏追加式历史。另有现成 `turn_events`、`turn_requests` 与 `game_saves.snapshot`，再建独立“序章状态”表会产生两份投影权威。实施只追加 `0015_p1_gameplay_persistence.sql`，扩展既有存储；不修改任何旧迁移。迁移遇到现存非 V1 行时中止，要求先提供可信 pinned metadata，绝不推断模式。V1 存档继续保持 V1；目前没有隐式或自动的 V1→V2 升级路径。

### PR-6 · 序章闭环 E2E

| 项 | 内容 |
| --- | --- |
| 文件 | 新建 `tests/e2e/prologue.cjs` |
| 改动 | 覆盖：五类行动 + 三条解法 + 无模型路径 + 失败恢复 + 幂等 |
| 验收 | `pnpm build && pnpm test:e2e` |
| 退出 | 游客零配置完成首个任务 ≤ 3 分钟；首个可点行动 ≤ 3 秒可见 |

### PR-7 · 真实感与文字层

| 项 | 内容 |
| --- | --- |
| 文件 | `packages/content/src/prologue/text/`、`apps/web/src/` 展示层 |
| 改动 | 低体力描写、`injuryFlags` 对话分支、天色文本变体、闲聊兜底与三连钩子、**可点选项纯函数推导**（§3.7） |
| 验收 | 真机 15 分钟连玩；关闭动效/媒体失败仍可完成 |
| 文案验收 | 逐段过 §3.8 写作纪律十条 + 自检三问；`W3` 破折号计数、`W8` 词表越界检查必须有自动化断言 |
| 退出 | `DeviceTestRecord.json` 填实机数据；文案门禁在 CI 中 fail-closed |

### PR-8 · 时机分支（可与 PR-4/5 合并）

| 项 | 内容 |
| --- | --- |
| 文件 | `packages/domain/src/rules/prologue-v1/`（时段纯函数） |
| 改动 | 按 §4.7 实现白天/黄昏两套战斗与观察结果 |
| 验收 | **两个时段各一组夹具**；时段判定为 `pure(gameMinute)` |
| 退出 | 「白天拿线索难打 / 黄昏好打但拿不到」这一取舍在两条测试路径上均可复现 |

---

## 11. 验收命令与总退出条件

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:e2e
pnpm license:check
pnpm worldbook:runtime:check
```

**P1 总退出条件（全部满足才算完成）**

- [ ] 八类行动的成功 / 合法失败 / 拒绝各 ≥1 例，均有结构化样例
- [ ] 游客、零配置、无模型可完成首个任务 ≤ 3 分钟
- [ ] 同一幂等键重复提交不重复结算；叙事重试不改变事件/投影/时间/奖励
- [ ] 观察不产生纯描写：每次成功观察都有 `clueId` 或明确的 `none`
- [ ] 双账号互读被拒，且响应不泄露存在性
- [ ] 冻结语料上**未发现误接受**，样本量与标注一致性已记录
- [ ] `RULES_NOT_READY` 在规则模块缺失时仍 fail closed
- [ ] 同一 commit 的 `RC_MANIFEST.json` 与制品哈希已记录
- [ ] 未把 P 轨事项写入 S / UI 台账

**不构成完成**：CI 绿、容器能起、模拟视口数据、单次跑分。

---

*本规格已可交付 GPT 执行。执行若发现规格内部矛盾或与代码事实冲突，应在用户授权范围内直接修正，并记录原文、理由、替代文本和影响。触及必须停下上报的 C 类事项时，仍须暂停依赖该事项的改动。*

### PR-1 实施勘误

契约审阅发现，原 §4.8 把有事件和耗时的 `RULE_*` 合法失败写成 `Decision.rejected`，与本规格中“拒绝为 0 事件、0 耗时”以及现有 `DecisionSchema` 的事务语义冲突。现已改为 `status='accepted'`、`outcome='legal_failure'`；`INPUT_`、`AUTH_`、`ENV_` 保持 `status='rejected'`。规则事件、revision、资源和游戏时间仍只由规则事务提交。本勘误只修正决策类型，不新增 Canon 或行动后果。
