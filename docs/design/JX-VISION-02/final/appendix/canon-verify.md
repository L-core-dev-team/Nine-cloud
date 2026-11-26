# 《九霄》规则与世界书核验报告（只读）

- 仓库：`仓库`，分支 `docs/vision-02-claude-research`，HEAD `0aeebfb`。
- 本报告只读核验，未修改、提交或推送任何仓库文件；未运行 `scripts/prepare-worldbook-final.mjs`、`scripts/write-worldbook-author-handoff.mjs`。
- 现行 Canon 1.0 正式阅读版按 `outputs/九霄世界书/README.md` 进入：`outputs/九霄世界书/九霄世界书_Canon1.0_正式阅读版.md`（下称“阅读版”，982 行，由 `canon-runtime.json` 生成，34 条运行条目）。同目录的 `01_地理与区域_*`、`世界书入库数据.json`、`世界书原图索引.json`、`原设恢复与待核对记录.md` 是历史快照，本报告不把它们当作现行数据。
- 阅读版的二级标题对应运行包条目 ID。对应关系按 `packages/content/src/canon-runtime.json` 的 `title` 逐一匹配，下文写作“〔条目 ID〕行号”。
- 进度三层状态：素材/文字整理已完成（179+28 张，外加 14 张后补图）；图像复核/作者裁定是委托裁定，`confirmed` 不等于作者本人逐页签收（`九霄世界书_Canon1.0_来源审核表.md` 第 3 行）；Canon 入库为 34 条运行条目，5 条 `deprecated`，`reviewQueue` 为空。

---

## 1. 境界顺序核验

### 1.1 结论（先读）

| 层 | 顺序 | 位置 |
|---|---|---|
| Canon 1.0 正文（运行包、阅读版、登记册） | 炼体→炼气→筑基→结丹→元婴→**合体→化神**→大乘→渡劫 | 阅读版 745、861–881、960–961 行；`canon.registry.json` 条目 `system_cultivation_realm`（1363 行起） |
| 作者 LYL 2026-10-03 更正（只写在文档中，未登记进 Canon） | 炼体→炼气→筑基→结丹→元婴→**化神→合体**→大乘→渡劫 | `docs/FINAL_HUMAN_GATES.md:20`、`docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md:208`、`docs/九境五域世界书依据表.md:7`、`docs/acceptance/README.md:12`、`docs/世界书剧情禁则与NPC认知验收样例.md:9,28` |
| 运行代码 `REALM_ORDER` | 化神→合体（采用作者更正） | `packages/content/src/realm-order.ts:1-4` |

**关键判断：** 代码不是“误写”。`REALM_ORDER` 的注释写明“Author's 2026-10-03 correction to the playable realm sequence. The older source transcript remains unchanged.”（`realm-order.ts:1`），它照搬了作者的更正。真正的问题是**两套顺序同时处于“已签”状态**：

1. 作者更正只写进说明文档和验收表。`canon.registry.json` 的 `decisions`（author_20260925_001…012）里没有任何关于境界顺序的裁定，`system_cultivation_realm` 的正文仍是“合体期 … 条件: 元婴后期大圆满”“化神期 … 条件: 合体期大圆满”。
2. `packages/content/src/canon-receipts.json` 在 2026-10-06 由 LYL 与 Bird 对 34 条内容的 SHA-256 双签。被签的是**含“合体→化神”正文**的版本，包括 `system_foundations`、`system_cultivation_realm`、`system_resource_grade`、`system_realm_faction_tiers`。这些回执比 10-03 的更正晚三天。
3. 因此 `docs/design/JX-VISION-02/claude-proposal/01-基线与实测.md:66` 与 `09-未决决策.md:8` 把它表述成“运行代码与 Canon 冲突”，只说对了一半。它们没有提到作者 10-03 的更正，其中给出的选项“以 Canon 为准修改代码”会直接推翻作者裁定。应改写为“作者更正尚未登记进 Canon，已签 Canon 正文与更正相反”。`appendix/dossier-domain-content.md:599` 的写法是对的，它注明了“the author's 2026-10-03 correction”。

**需要作者做的事：** 二选一。
- (a) 维持更正（化神→合体）：在 `canon.registry.json` 的 `decisions` 中登记顺序裁定，并决定是否以及如何改写 4 条正文的前置条件。改正文会改变 contentSha256，必须重新双签回执。
- (b) 撤回更正（合体→化神）：改 `realm-order.ts` 和下方清单中的派生文件与文档。

在作者裁定之前，不得设计突破规则，`docs/九境五域世界书依据表.md:7` 已写“突破门槛仍须另行签署”。

### 1.2 Canon 正式阅读版原文（逐字）

- 〔system_foundations〕745 行：“• 境界： 修士通过吐纳灵气，不断提升的生命层次。每一个大境界的突破都伴随着实力与寿元的巨大飞跃。主要境界分为：[炼体期（不入门）]、[炼气期]、[筑基期]、[结丹期]、[元婴期]、[合体期]、[化神期]、[大乘期]、[渡劫期]。除炼气期分为1至10层之外，其余境界均分为初期、中期、后期（至大圆满）三个小境界。修炼进度增加到100%即可突破当前境界步入下一个小境界，但是大境界如练气后期突破筑基初期，则需要满足突破条件。”
- 〔system_cultivation_realm〕804 行起，“灵力物态”链：
  - 炼体 806–812 行：“纯粹的物理力量，一拳可碎巨石”“寿元: 最高120年”“突破方式: "炼凡骨，化尘身"。此境不求引气，先求炼体。修士通过特殊的呼吸法、药浴、以及高强度的体能锤炼……”
  - 炼气 814–821 行：“突破方式: 引气入体，周天循环，吸纳天地灵气，将一缕灵气纳入自身，则正式进入炼气期。”（821）
  - 筑基 823–834 行，**气→液**：“○ 条件: 炼气期十层大圆满。”（832）“○ 过程: 在灵气充裕之地闭关，借助丹药之力，将全身气态灵气强行压缩为液态灵力。”（834）
  - 结丹 836–847 行，**液→固丹**：“…通过九死一生的过程，凝练成一颗固态的金丹。”（837）“○ 条件: 筑基后期顶峰，灵力液化精纯至极。”（845）“需将丹田内所有液态灵力压缩凝结成一颗固态金丹。期间会引发[心魔入侵]”（847）
  - 元婴 849–859 行，**碎丹成婴**：“如蛋壳般破碎，从中诞生出一个与修士容貌一般无二的迷你"元婴"。元婴是修士精神与能量的结合体，是第二条性命。”（850）“修士需引发天雷之劫，淬炼金丹，从金丹本源中孕育出元婴。”（859）
  - 合体 861–870 行，**元婴与神魂融合**：“"炼神还虚，神游太虚"。元婴与自身神魂彻底融合，不分彼此”（862）“可引动星辰之力，操控一方天象。”（864）“寿元:寿命上限提升至万年，…”（866）“○ 条件: 元婴后期大圆满，神识与天地交感，触摸到一丝空间法则。”（868）
  - 化神 872–881 行，**法域**：“将自己与一方天地进行深度融合，达到"天人合一"的境界。修士自身仿佛就是一片行走的领域。”（873）“能够初步调动一方天地的法则之力为己用，形成"法域"，在自己的领域内言出法随。”（876）“• 寿元:与天同寿。”（878）“○ 条件: 合体期大圆满。”（880）
  - 大乘 883–884 行：“当化神期修士对自己所修行的那一条"大道"……其"道"便会自然圆满。”
  - 渡劫 886–887 行：“引来九天之上的"飞升大劫"。此境的唯一条件，就是在雷劫、火劫、风劫、心魔劫等万般劫难下存活下来。”
- 〔system_resource_grade〕800–802 行，隐含合体在化神之下：“○ 地阶：对应元婴期与合体期修士。”“○ 天阶：对应元婴期、合体期。”“○ 至宝：超脱品阶的存在，化神期和大乘期的专属法器”。另外 799 行用的是“金丹期”而非“结丹期”，同一份 Canon 内名称不统一。
- 〔system_realm_faction_tiers〕960–962 行：“○ 合体期: …是整个修仙大陆的守护者。”“○ 化神期: 在整个世界漫长的历史中，也可能数万年才诞生一位。”
- 〔system_spirit_beasts〕946 行：“分为一（对应炼气期）至七级（对应化神期）妖兽。”按 Canon 序，炼气=1 时化神是第 6 境；按更正序是第 5 境。两种顺序都对不上“七级”，本行不能作为任何一方的证据。

### 1.3 原始来源

- `docs/sources/世界书_保守补全版.md:1423`：与阅读版 745 行逐字相同（“[元婴期]、[合体期]、[化神期]”）；1612 行起为“### 合体期”小节。
- 旧 OCR `outputs/设定截图OCR汇编.md:4190`：“期]、[元婴期]、[合体期]、[化神期]、[大乘”。
- `docs/九境五域世界书依据表.md:9-21` 列出原 073–086 的九境，第 6 行是合体（原081—082），第 7 行是化神（原083—084）。第 23 行写：“原稿将**合体期排在化神期之前**……这与 2026-10-03 作者明确更正相反。原稿不回写，现行规则以作者更正为准，具体突破条件暂不从原稿逆推。”

### 1.4 运行代码与引用点（全仓 grep `REALM_ORDER`、`realm-order`、`化神`、`合体`）

| 文件:行 | 用途 |
|---|---|
| `packages/content/src/realm-order.ts:1-4` | 唯一定义：`'炼体','炼气','筑基','结丹','元婴','化神','合体','大乘','渡劫'` |
| `packages/content/src/index.ts:3` | `export * from './realm-order.js'` |
| `packages/content/package.json:13-15` | 子路径导出 `./realm-order` |
| `apps/web/src/ui/realm.ts:1,15,31,34-37` | `RealmName` 类型；`realmStatusFromSave` 恒返回 `REALM_ORDER[0]`（炼体）；`realmGlyph` 把“合体”特判为“合” |
| `apps/web/src/ui/RealmSeal.tsx:2,81-82,89-92` | 境界铭牌与“九境”天梯按 `REALM_ORDER` 渲染；按 `${status.realm}期` 去 Canon 小节标题取正文 |
| `apps/web/src/character-options.ts:1,10` | 建角“修为”下拉建议值 = `REALM_ORDER`（自由文本建议，非权威） |
| `apps/web/src/main.tsx:58,408` | 建角表单展示上述选项 |
| `apps/web/src/ui/realm.test.ts:2,31-35` | 只断言 9 个印字互不相同，不断言顺序 |
| `apps/web/src/components/DesignSpecimen.tsx:34,92-98` | 设计样张中的铭牌 |
| `apps/web/src/routes/P2ReviewGame.tsx:352,388,482`；`CloudGame.tsx:381,385,437,440` | 显示铭牌与境界文字 |
| `outputs/九霄WEB-1.0/source/ai-router.js:3,37`、`source/v1.js:149`（及 `work/` 副本） | 旧版 Web 提示词写“合体→化神”，属于历史产物 |

**存档、事件、迁移：** 不存在境界字段。权威存档只保存 `facts.cultivationProgress`（`packages/contracts/src/prologue.ts:53`，`z.int().min(0).max(10_000)`），境界名由界面推导，且只会是炼体。事件回放（`packages/domain/src/event-log.ts`）、数据库迁移（`packages/db/drizzle/*`、`supabase/migrations/*`）、API（`apps/api/src`）里都没有境界枚举。`isCharacterProfile` 不接受 `realm` 键（`packages/contracts/src/character-profile.ts:6-14`；`tests/e2e/story-first-golden.cjs:240` 用 `{realm:'越权'}` 作反例），所以云端存档里没有境界。本机叙事旧档 `LocalSave.character.realm` 保存的是自由文本，例如“化神期”，不随枚举重排。
**P1 规则摘要：** `realm-order.ts` 不在 `scripts/p1-rule-candidate-bundle.files.json` 的哈希清单里，但 `packages/content/src/canon.registry.json` 与 `packages/content/src/index.ts` 在清单里（第 13–14 项）。所以只改 `realm-order.ts` 不会触动 P1 审批摘要；而为境界登记 Canon 裁定、改动 registry，会使 P1 候选包摘要失配，需要重新批准。

### 1.5 修改影响清单（无论最终选哪种顺序）

1. `packages/content/src/realm-order.ts`（若撤回更正）。
2. `apps/web/src/ui/realm.ts`：注释与 `realmGlyph` 不依赖顺序；`RealmName` 类型自动随之变化。
3. `apps/web/src/ui/RealmSeal.tsx`：天梯顺序自动跟随；Canon 小节查找按标题进行，不受影响。
4. `apps/web/src/character-options.ts`：建角建议顺序跟随。
5. 测试：`apps/web/src/ui/realm.test.ts` 不受影响。目前没有任何测试锁定顺序，应新增一条测试，把 `REALM_ORDER` 与“作者裁定登记”绑定。
6. Canon（若维持更正并改正文）：`canon.registry.json` 的 `system_foundations`、`system_cultivation_realm`、`system_resource_grade`、`system_realm_faction_tiers` → `node scripts/build-canon-runtime.mjs` → `canon-runtime.json` → 阅读版与来源审核表（`node scripts/build-worldbook-reading-edition.mjs`）→ `canon-content-digests.json` → `canon-receipts.json` 重新双签 → P1 候选包摘要（`apps/api/src/services/p1-review-rule-approval.ts:54` 的 `semanticSha256`，以及 bundle 文件清单的哈希）重新批准。
7. 文档：`docs/design/JX-VISION-02/claude-proposal/01-基线与实测.md:66`、`09-未决决策.md:8` 需要改写措辞（见 1.1）；`docs/九境五域世界书依据表.md`、`docs/世界书剧情禁则与NPC认知验收样例.md` 需与最终裁定一致。
8. 存档迁移、事件回放：无需改动（没有境界字段）。

### 1.6 是否有已签署文件把“错误顺序”写成事实

“错误”取决于以哪一方为准。目前两个方向都有已签材料：
- 写“化神→合体”的已签或作者材料：`docs/acceptance/2026-10-03/九霄1.0全缺口验收记录表-2026-10-03.xlsx`（`docs/acceptance/README.md:12` 称其为“LYL 在本次对话明确将正式次序改为……”）；更早的 `LYL-02 六类规则签认表!E5`，`docs/acceptance/2026-10-02-LYL-decisions.json:333-336` 记录 `"declared": "炼体→炼气→筑基→金丹→元婴→化神→合体→大乘→渡劫"`、`"canon": "…元婴→合体→化神…"`、`"action": "author must resolve explicitly; do not silently rewrite the signed input"`；`docs/FINAL_HUMAN_GATES.md:20`。另外，`docs/acceptance/README.md:12` 写明“这不是 Bird 的签名”。
- 写“合体→化神”的已签材料：`packages/content/src/canon-receipts.json`，LYL 与 Bird 于 `2026-10-06T00:00:00.000Z` 对上述 4 条正文的 SHA 签 `approved`。
- 结论：截至目前，Canon 双签回执与作者单方更正互相矛盾，必须由作者正式登记裁定，并取得 Bird 的独立复核（`docs/九霄1.0阶段缺口与人工交接清单-2026-09-29.md:208`：“Bird 需独立核对反例及旧来源覆盖说明”）。

---

## 2. 地理与天文素材（Canon 阅读版逐字摘录）

### 2.1 大陆结构、方位、尺度

- 〔world_jiuxiao〕7 行：“九霄大陆，广袤无垠，灵气分布不均，造就了截然不同的人文与地貌。大陆中央被一道横断东西的巨大山脉——万兽山脉所分割，其更深处，便是传说中的洪荒妖林。人族的主要活动区域被这道天然屏障划分为南北两大部分，形成了五大各具特色的修真域。”8–13 行列出五域及“妖之领域：洪荒妖林”。
- 〔region_zhongzhou_tianshu〕17 行：“位于大陆中央腹地，土地肥沃，灵气最为醇厚均衡。”注意：万兽山脉同样位于“大陆中央”，两句的空间关系没有说明（见 2.6）。
- 〔region_donghan_longyin〕317 行：“濒临无尽东海，由大陆架和无数岛屿组成。”
- 〔faction_bingshen_gong〕502 行：“坐落于凡人足迹无法企及的极北"永寂冰原"之上。”
- 〔region_honghuang_yaolin〕735–739 行：“横断大陆的万兽山脉深处，便是这片自太古时代便存在的洪荒妖林。”“○ 外围: 紧邻人族五大域，是一级至二级妖兽的活动范围。这里是炼气期和筑基期修士历练、寻宝的主要区域。”“○ 内围: 深入森林千里之后，三级妖王和四级化形大妖开始出没。此地已是金丹和元婴修士的禁区”“○ 核心禁区: 妖林的最深处，传说中五级妖尊和六级妖圣的沉睡之地。这里的空间都因强大妖力的影响而变得不稳定，合体境大能进入都可能迷失，据…”
- 尺度词：“延绵百里”（〔faction_jixia_xuegong〕276）、“化百里之地为一片火海”（〔faction_shenghuo_jiao〕428）、“方圆百里的一片山头”（〔system_realm_faction_tiers〕967）、“覆盖整个大域”（981）、“掌控着东海百分之八十的航道与贸易”（〔faction_fuhai_zong〕366）、“冰封万里”（〔faction_bingshen_gong〕513）、“千里赤地”（〔faction_wudu_shenjiao〕605）。

### 2.2 交通

- 〔faction_sihai_shanghui〕150 行：“坐落于中州天枢域核心的浮空巨城——万宝城。此城本身即是一件深不可测的空间法宝，内部自成天地，设有大陆最庞大的传送阵网络，是整个修真界的物流与信息中枢。”170–173、182 行：分号遍布大陆；“金鳞卫……专门负责押运贵重货物和镇守重要据点，是商队行遍天下的安全保障。”
- 〔faction_tiangong_ge〕204 行：“专精于炼制战争傀儡、浮空仙城、跨域传送阵等超大型法宝。”
- 〔faction_haotian_jianzong〕32 行：“各山之间以虹桥、锁链和飞行法器相连”。
- 〔faction_tingchao_ge〕324 行：“唯有听潮阁弟子，能以心感应雾中永不停息的潮汐律动，从而辨明航路，进入山门。”
- 〔faction_fuhai_zong〕367 行：“城内港口停泊着遮天蔽日的楼船战舰”。
- 〔faction_beijing_lianmeng〕538 行：“驾驭着巨大的雪原猛兽，如移动的城邦般在冰川与冻土上迁徙。”
- 〔faction_daguangming_si〕234 行：“一条由信众三步一叩首踩出的"朝圣之路"蜿蜒而上”；〔faction_jixia_xuegong〕276 行：“青石铺就的"问心路"是唯一的登山之道”。
- 个人移动能力（〔system_cultivation_realm〕）：筑基“可支撑长时间御剑飞行，一日千里。”（826）；元婴“离体出窍，瞬息千里”（852）、“短距离的"瞬移"”。

### 2.3 各域气候、灵力特性、标志地点与势力

| 域 | 气候/灵力（原文） | 标志地点（原文） | 势力 |
|---|---|---|---|
| 中州天枢域〔region_zhongzhou_tianshu〕 | “土地肥沃，灵气最为醇厚均衡。”（17） | 昊天剑宗“九十九座大小不一的悬浮仙山”“主峰"天枢峰"”（32）、“万仞崖: 终年罡风如刀”（54）；玉清阁“百草谷”“内部气候四季如春，灵气受地脉深处的"地肺心火"温养”“"百草清神瘴"”（79）；衍天宗浮空城邦“天衍城”（113）；万宝城（150）；天工阁“天陨山脉主峰之巅”（220）；大光明寺“中州龙脉之首的"菩提山"”“"佛光结界"”（234）；稷下学宫“"问圣山"”（276） | 七家：昊天剑宗、玉清阁、衍天宗、四海商会、天工阁、大光明寺、稷下学宫（20–26） |
| 东瀚龙吟域〔region_donghan_longyin〕 | “此地水汽充沛，水属性灵气浓郁。”（317）；“他们信奉海神与风神，每年都会举行盛大的祭海仪式。”（318） | 听潮阁所在岛被“"无声雾"终年笼罩，此雾能吞噬一切声音与神识探查”（324）、“静音岛中心的"归墟海眼"”（332）、“听潮崖”（343）；覆海宗“远海的一座巨型玄武岩岛屿"镇海城"”（367） | 听潮阁、覆海宗。区域条目的“顶尖势力：”（319）后为空 |
| 西荒焚天域〔region_xihuang_fentian〕 | “一片无垠的赤色荒漠与戈壁，气候酷热干燥，灵气狂暴且蕴含火毒。”（406）；“信奉原始的太阳与火焰崇拜……在这里，水比黄金更珍贵”（407） | 圣火教“西荒中心最大的活火山——"圣焰山"的内部”“"圣焰之河"”（416）、“直通地心熔岩湖”（444）；金刚不坏谷“"万丈渊"的巨大赤色峡谷。谷中常年被两种天灾笼罩：一是能撕裂金石的"九天罡风"，二是能熔炼骨血的"烈阳火毒"”（453）、“"地火之心"”（481）、“"风眼"”（482）、“引地脉温泉”（483） | 圣火教、金刚不坏谷（409–410） |
| 北境霜寒域〔region_beijing_shuanghan〕 | “高耸的冰川雪原，终年飘雪，寒气彻骨。此地灵气呈现极端的阴寒属性。”（494） | 冰神宫“"永寂冰原"”“"无垢冰城"……宫殿在极光的照耀下，会折射出七彩琉璃般的光华，既是圣景，也是天然的护山大阵。”（502）；北境联盟圣地“"狼神山"，一座深入云霄、终年被极光笼罩的纯白…”（538） | 冰神宫、北境联盟。区域条目的“顶尖势力:”（496）后为空 |
| 南疆万蛊域〔region_nanjiang_wangu〕 | “被茂密的原始丛林和剧毒的瘴气沼泽覆盖……此地灵气驳杂，草木精气与毒煞之气混杂。”（580） | 五毒神教“"万毒沼泽"的最深处……剧毒瘴气”（590），地脉深处的初代蛊神“每一次呼吸，都会吐纳出整个沼泽的毒煞精气”（597）；万兽山庄“坐落于一处被十万大林，……独特"灵气场"”（646，原文残断）；偃师府“"千机城"……沿天坑岩壁向下开凿”（696）；邪修“南疆十万大山最深处"腐烂之心"沼泽”（〔system_heterodox_cultivation〕790） | 五毒神教、万兽山庄、偃师府（583–585） |
| 洪荒妖林〔region_honghuang_yaolin〕 | “林中灵气浓郁到化为实质的雾气，遍地是外界罕见的天材地宝”（735） | 外围、内围、核心禁区（737–739） | 妖兽，不属于人族五域 |

### 2.4 天象、日月星辰、季节、天气、天劫、潮汐、极光、火山、雾

- 天象观测：“朝廷设"钦天监"，由修士担任，负责观测天象、勘探灵脉”（〔region_zhongzhou_tianshu〕18）。
- 星阵与星轨：〔faction_yantian_zong〕113 行：“整座城邦即是一座无上大阵——"周天星斗无极大阵"。九座主岛为阵眼，三千辅岛为节点，于亿万光华构成的阵图之上，按照亘古不变的轨迹缓缓运转。……四处可见悬浮的符文与转动的星轨模型”；114 行：“从星辰运转到人心变化，宇宙万…”；121 行：“弟子需以神魂融入周天星斗大阵，通过观察、计算、感悟那无穷无尽的星轨变化与灵气流转”；133、135 行有“观星学徒”“观星台”；129 行：“因窥探天机，修行者往往气血孱弱，且易遭天道反噬。”
- 夜空：〔faction_tiangong_ge〕194 行：“夜空中，天陨矿石散发的幽幽星芒与熔炉的火光交相辉映”。
- 日月与昼夜：“太阳与火焰崇拜”（407）；“晨钟暮鼓，日诵万卷:每日清晨……”（〔faction_jixia_xuegong〕292）；“日夜不息的潮起潮落”（343）；炼体期“能在黑夜中视物”（810）。Canon 中**没有任何关于月亮、月相的原文**。
- 季节：只有“内部气候四季如春”（79）一处，它是洞天碎片内的局部气候；“终年飘雪”（494）。
- 天气与风：“终年罡风如刀”（54）；“九天罡风”（453、466、481–482）；北境“与风雪融为一体”（553）；“风调雨顺”（289）；东瀚的风神信仰（318）。
- 潮汐、海啸、海洋：“潮汐律动”（324）；“"声音"和"潮汐"的感悟”（332）；“最磅礴的海啸声”（343）；“一念即可掀起千丈海啸”（376）；“借助海兽之力引动潮汐”（385）；“深海漩涡与恐怖水压……"归墟"力场”（383）。
- 极光：502、538 行。
- 火山与地火：圣焰山“活火山”（416）；邪修“血狱山”是“活火山内部……终年被血色雾气笼罩，流淌的不是岩浆，而是……地心血煞”（784）；“引地心之火与九天神雷淬炼”（〔faction_haotian_jianzong〕68）；“引动地火”（428）、“地火淬体”（435）。
- 雾与瘴：“云雾缭绕”（32）；“百草清神瘴”（79）；“无声雾”（324）；“剧毒瘴气”（590）；“毒瘴遍布”（790）；“灵气浓郁到化为实质的雾气”（735）；“血色雾气”（784）。
- 天劫：元婴“修士需引发天雷之劫”（859）；渡劫“"飞升大劫"……雷劫、火劫、风劫、心魔劫”（887）。
- 高境界操控天象：合体“可引动星辰之力，操控一方天象。”（864）；化神“一念便可调动山川湖海之力”（881）。

### 2.5 修炼与环境、天象的关系

- 选址：筑基“在灵气充裕之地闭关”（834）；元婴“需要能诞生"元气"的顶级灵脉”（858）；化神“需选择一处与自身所修大道最为契合的灵脉节点或洞天福地”（881）；渡劫“需选择一处无人之地”（887）。
- 地域灵力决定功法倾向：东瀚擅水系与音波（317）；西荒修火系与炼体（406）；北境擅冰系与淬炼神魂（494）；南疆擅蛊、毒、驭兽、傀儡（580）；中州灵气“醇厚均衡”（17）。
- 环境即修炼场：万仞崖以罡风磨练剑意（54）；万丈渊“越靠近深渊中心，罡风越烈，火毒越浓”（481）；听潮崖感应潮汐（343）；天衍城以星轨参悟（121）；百草谷的丹雾对丹师有“凝神静心之效”（79）。
- 洪荒妖林按修为分圈层历练（737–739）。

### 2.6 Canon 中明确缺失或“待核”的地理信息

1. 五域之间的通行、路程、等级门槛、传送规则：原图未定义。`docs/九境五域世界书依据表.md:33`：“原图未定义五域之间的等级门槛、传送规则或固定路程；这些属于后续玩法设计，应另立规则版本并经作者审查。”
2. 南北划分：7 行只说万兽山脉把人族区域“划分为南北两大部分”，**没有说明哪几个域在北、哪几个在南**；中州“位于大陆中央腹地”与山脉“大陆中央”的关系也没有交代。东、西、南、北的方位只能从域名推断。
3. 东瀚龙吟域（319–320）、北境霜寒域（496–497）的“顶尖势力”清单为空；西荒、中州、南疆的清单存在。
4. 原图截断处（正文“…”）：万兽山庄所在地（646）“坐落于一处被十万大林，……”残缺；洪荒妖林核心禁区末尾“据…”（739）；南疆凡人信仰“信仰…”（581）；圣火教地下城“地下…都，…”（416）；镇海城城墙“城墙由万…打。”（367）；狼神山“纯白…”（538）。省略号不具设定效力（`canon.registry.json` 决定 author_20260925_004）。
5. 没有月、星座、历法、季节循环、昼夜长短、气候带、降水、纬度等原文。`docs/design/JX-VISION-02/claude-proposal/09-未决决策.md:9` 中“日出 05:00、正午 11:00、日落 17:00，春分几何、纬度 30°”是提案，不是 Canon。
6. 序章地点芦花渡、望气台、折桂坪不在 Canon 内，属于 candidate-only 的作者原创内容（见第 3 节），没有挂靠到任何 Canon 域。

---

## 3. 序章内容与时间/体力/修炼机制

来源：`packages/content/src/prologue/prologue-v1.ts`（内容包，`publicationStatus: 'candidate-only'`，`runtimeEligible: false`，163–167 行）、`packages/content/src/prologue/prologue-v1.rulebook-candidate.ts`（可执行绑定，`ruleVersion: 'prologue-v1-candidate-20261005'`）、`packages/content/src/rules/prologue-v1.constants.ts`。

### 3.1 按地点归纳（ID + 摘要）

**芦花渡 `loc_luhuadu`**（172–176）：“水口小聚落；渡口分舵外围岗。”相邻 `loc_wangqitai`。
- 子地点 `subloc_ferry_berm` 渡口作业位（188–192），战斗准备位。
- NPC `npc_cenjiu` 岑九（201–213）：摆渡人，“受雇于渡口分舵；不属于四海商会。”，知道“渡口落石”等 5 项，不知道“望气台上有什么”“玩家来历与战力”“望气台以南那片白是什么”，“记得所有来过渡口的人，但记不住名字。”
- 战斗目标 `npc_shuiyuya` 灰羽鸦（214–219），可从 `subloc_ferry_berm`、`subloc_reef_ledge` 接触。
- 取物源 `src_ferry_shore`（220–227）：滩涂旧缆桩旁，一次性 `item_bishuifu` ×1。
- 物件 `obj_ferry` 渡船（240–244）：`aground`→`clear`；规则另有观察目标 `obj_ferry_gear` 舟具（rulebook 99–102），在内容包里没有条目。
- 线索：`clue_ferry_stuck`（281–286，“芦花渡 · 环视”，scan L1）、`clue_ferry_scrubbed`（287–292，“芦花渡 · 细察船底”，study L2）、`clue_wrong_way`（293–298，“芦花渡 · 细察舟具”，study L2）。
- 文本：`text_prologue_opening`（311–315，节点六“入世”）、`text_dialogue_topics`（321–335，问船、求岑九处理落石（refuse，不给线索）、问鸦、问望气台、问南边那片白、拒绝帮忙、通渡之后）、`text_smalltalk_fallbacks`（336–343）、`text_idle_three_hook`（344–348，idleCount 到 3 时出现）、`text_combat_clear`、`text_combat_clear_wounded`、`text_combat_retreat`（349–357）、`text_crossing_complete`（364–366）、`text_stamina_exhausted`（361–363，“天色暗下来，你的手在抖。”）。
- 规则话题：`obstacle_rockslide`（“这石头怎么办”等，refuse）、`player_warning`（“不要去望气台”，refuse）（rulebook 76–87）。

**望气台 `loc_wangqitai`**（177–181）：“渡口外三里的旧观测台”，相邻芦花渡、折桂坪。
- 子地点 `subloc_reef_ledge` 礁石小径（193–200），绕行路线 `route_reef_ledge`，从望气台到芦花渡。
- 障碍 `obstacle_rockslide` 落石堵渡（263–270）：解法一是绕行，“耗时 2 刻、体力 15，并留下肩擦伤”；解法二是与灰羽鸦战斗。
- 线索：`clue_rockslide`（299–304，“望气台 · 环视”，scan L1，绕行的前置条件，rulebook 55）、`clue_crow_nest`（305–310，“望气台 · 细察落石”，study L2，天黑时受阻，rulebook 108）。
- 文本：`text_observation_none`（316–320）、`text_south_white_hook`（367–370，“压在山脊上的那片白，不是云。”）、`text_wangqitai_night`（371–374，“天光收尽了。”）、`text_bypass`（358–360）。

**折桂坪 `loc_zheguiping`**（182–187）：“望气台北侧缓坡，可俯瞰渡口。”初始边为 `locked`（rulebook 45–46），完成任务领奖后解锁。

**跨地点：** 物品 `item_bishuifu` 避水符（245–255，`effectFlag: 'effect_ward_water'`）、`item_jiuyifu` 旧驿符（256–262，任务奖励）；功法 `tech_breath_basic` 呼吸法（235–239，天生）；任务 `quest_first_clearance` 通渡（271–280）；奖励源 `src_quest_clearance`（228–234）。

### 3.2 时间、天黑、日界、体力、修炼的机制

常量见 `packages/content/src/rules/prologue-v1.constants.ts:7-30`：`GAME_MINUTES_PER_KEC: 15`、`DAY_KEC_COUNT: 96`、`SAVE_START_GAME_MINUTE: 300`、`DUSK_START_KEC: 48`、`STAMINA_MAX: 100`、`SPIRIT_MAX: 100`、`CULTIVATION_MAX: 10_000`、`CULTIVATION_PER_KE: 800`、`CULTIVATION_FATIGUE: 200`、`FATIGUE_THRESHOLD: 20`、`MOVE_COST: 5`、`MOVE_BLOCKED_COST: 10`、`MOVE_BYPASS_COST: 15`、`OBSERVE_SCAN_COST: 3`、`OBSERVE_STUDY_COST: 6`、`CULTIVATE_COST_PER_KE: 20`、`TALK_COST: 0`、`USE_ITEM_COST: 0`、`COMBAT_COST: 25`、`CLEAR_THRESHOLD: 25`、`RETREAT_SPIRIT: 5`；第 33 行 `PROLOGUE_V1_FREE_ACTION_TICK_KEC_COUNT = 1`。

- **时间单位与推进：** 一刻 = 15 游戏分钟，一日 = 96 刻 = 1440 分钟。新档从 `gameMinute = 300`（05:00）开始。时间只随已接受的行动推进：`advance()` 做 `gameMinute += kecCount * 15`（`packages/domain/src/prologue-v1-rules.ts:680-690`）。各行动的刻数：移动 1 刻，绕行 2 刻（357–366），扫视 1 刻、细察 2 刻（`const kes = … 'scan' ? 1 : 2`），战斗 2 刻（`advance(state, nextFacts, 2, …)`），交谈、取物、用物、领奖各 1 刻，修炼 1–8 刻（单次上限 `MAX_CULTIVATION_KES_PER_ACTION = 8`，`packages/contracts/src/action.ts:3`）。没有离线推进，也没有“等待/休息”行动（`PROLOGUE_V1_ACTION_ORDER`，constants 35–44）。
- **日界：** `projectDailyStamina`（`packages/domain/src/prologue-v1-time.ts:52-72`）：`gameDayIndex = floor((gameMinute - 300) / 1440)`，跨过新的一日即“`{ stamina: policy.maxStamina, staminaDayIndex: gameDayIndex }`”，也就是每天 05:00 体力恢复满值。`readDailyResources`（rules 662-678）同时在跨日时把 `spiritStamina` 重置为 `SPIRIT_MAX`（注释：“The signed rule says a retreat is recoverable the following game day.”）。恢复是惰性的，只在读取体力的行动结算时套用。不读日常资源的路径（例如交谈 `resolveTalk` 直接用 `facts`）不会触发恢复。
- **天黑 DUSK：** `isDaylight`（time.ts:75-84）：`kecIndex = floor(((gameMinute - 300) % 1440) / 15)`，`return kecIndex < policy.duskStartKec;`。48 刻 = 12 小时，即每天 17:00 起为“暗”，一直持续到次日 05:00，中间没有“夜→晨”的独立阶段。天黑的效果有两处：(1) 观察目标 `obstacle_rockslide` 设置了 `blocked: { when: 'dark', reason: 'too_dark' }`（rulebook 108），天黑时观察结果为 `blocked`，返回 `RULE_OBSERVE_BLOCKED`（rules 523-532）；(2) 战斗中 `dark` 恒判 `clear`，同时写入 `darkInjuryFlag: 'crowding_bite'`（rules 576-589）。叙述 `text_wangqitai_night` 只在 `blockedReason === 'too_dark'` 时出现（`apps/api/src/services/p1-prologue-plugin.ts:130-131`）。`readKecClock`（time.ts:87-94）产生“第N刻”标签。
- **体力：** 扣减用 `debit = Math.max(0, value - cost)`（rules 738-740），不会因体力不足而拒绝。只有修炼会因体力为 0 被拒（`ENV_STAMINA_EMPTY`，rules 394），也只有修炼有疲劳分支；移动、观察在体力为 0 时照常成功，只是扣到 0。战斗在体力或心力低于 25 时判 `retreat`（rules 575），撤退后 `spiritStamina = RETREAT_SPIRIT(5)`，并退回 `retreatLocationId`。
- **修炼：** `resolveCultivation`（rules 387-422）的流程：
  - 前置：功法必须已知（`ENV_TECHNIQUE_LOCKED`）；进度满 10000 时拒绝（`ENV_CULTIVATION_COMPLETE`）；体力为 0 时拒绝。
  - 结算：`normalKecCount = min(请求刻数, floor(体力/20))`；若体力不够全部刻数且仍有余量，再补 1 个“疲劳刻”，进度 +200、体力清零、`fatigueCount + 1`，结果为 `legal_failure` + `RULE_STAMINA_LOW`；否则每刻 +800。
  - 上限：进度封顶 10000（“炼体期圆满”）。没有突破规则，界面恒显示炼体（`apps/web/src/ui/realm.ts:7-9`）。
- **附加：** 约束 `SAVE_START_GAME_MINUTE !== 300 || DUSK_START_KEC !== 48` 被硬编码在规则自检里（rules 977），改常量会导致规则模块拒绝加载。

---

## 4. 九个已知缺陷核验

| # | 是否复现 | 分类 | 严重度 |
|---|---|---|---|
| 1 | 是 | 数据/UI | 中 |
| 2 | 是 | 规则/API 契约 | 低–中 |
| 3 | 是 | 安全 | 高 |
| 4 | 是（API 与 P2 两处） | 性能 | 中→高（随局长增长） |
| 5 | 是，并且有副作用 | 规则 | 中 |
| 6 | 是（4 条） | 数据 | 中 |
| 7 | 是 | 数据/UI | 中 |
| 8 | 是（`multi` 且未勾“全员”时） | AI 契约 | 高（功能不可用） |
| 9 | 部分（逻辑存在，触发串在现有源码中不存在） | CI | 中（潜伏） |

### (1) “已知线索”显示观察方式“环视”而不是“落石线索”
- **代码位置：** `apps/web/src/p2-review-gameplay-runtime.ts:579-587` 的 `labelFor`：线索条目没有 `name`，于是 `observationLabel.trim().split('·').at(-1)`。`clue_rockslide` 的 `observationLabel` 是“望气台 · 环视”（`prologue-v1.ts:300`），取最后一段得到“环视”。`clue_ferry_stuck` 同样得到“环视”，两条线索重名；`clue_crow_nest` 得到“细察落石”。这个值通过 565 行 `clues: facts.clues.map(id => labelFor(id) ?? id)` 渲染到 `apps/web/src/routes/P2ReviewGame.tsx:390` 的“已知线索：…”。
- **线上同源：** `apps/api/src/services/p1-nlu-runtime.ts:88-99`（同一套 `labelFor`，124-126 行把线索放进可见目标目录，供自由文本解析使用）以及 `apps/api/src/services/p1-rule-semantic-functions.ts:117-126`（`resolveLabel` 写入语义指纹 `visibleTargetLabels`）。在 `CloudGame.tsx` 里找不到“已知线索”字样，线上的表现是可见目录、解析候选中的线索名错误。
- **对照：** `apps/web/src/gameplay-brief.ts:75-82`、`apps/web/src/receipt-event-view.ts:57-61` 各自硬编码了正确名称“落石线索”等，形成三份互不一致的名称表。另外 `receipt-event-view.ts:56` 写“礁石崖沿”，与内容名“礁石小径”不一致；`clue_ferry_scrubbed` 被称为“缆绳磨损线索”，但正文写的是船底芦籽与新刷子；`scan` 被译为“扫视”，内容里是“环视”；`spiritStamina` 被标为“灵力”，错误文案里是“心力”。
- **根因：** 内容包的线索条目缺少显示名字段，三处标签逻辑各自取不同的退路。
- **建议修复：** 在 `PrologueContentByKind.clue` 中增加 `name`（由作者给出），所有端统一用一个 `labelForContentId()`，删除硬编码表。注意：内容包文件在 P1 bundle 清单内，改动需要重新批准。
- **测试：** 为 5 条线索做标签快照，断言标签唯一且等于作者命名；P2 场景断言“已知线索：落石线索”；API 可见目录断言。

### (2) 非 UUID 的 `clarificationOf` 得到 503
- **代码位置：** `apps/api/src/routes/games.ts:123` 只校验 `clarificationOf` 是字符串；契约 `packages/contracts/src/action.ts:12` 是 `z.string().min(1).max(128)`，不要求 UUID。随后 `apps/api/src/services/server-turn.ts:84-85` 调用 `getReceiptForOwner(..., intent.clarificationOf)`，Postgres 实现 `apps/api/src/services/npc-memory-turn-transaction.ts:131` 遇到 `!/^[0-9a-f-]{36}$/i.test(requestId)` 就 `throw new TypeError('Invalid turn identity')`，异常落到 `games.ts:146-147` 的 catch，返回 `{ code: 'TURN_UNAVAILABLE' }, 503`。
- **根因：** 契约层与存储层对 ID 格式的要求不一致；路由把所有异常都映射成 503。
- **建议修复：** 契约中 `clarificationOf: z.uuid().optional()`（`turn.ts:13`、`decision.ts:82` 同步修改），让 `ActionIntentSchema.safeParse` 失败时返回 400 `INVALID_TURN`。也可以在 server-turn 中对格式不符直接返回 `clarification_conflict`（409）。`action.ts`、`decision.ts`、`turn.ts` 都在 P1 bundle 清单内，改动需要重新批准。
- **测试：** API 集成测试分别发送 `clarificationOf: "abc"`、128 字符的非 UUID、合法但不存在的 UUID，断言 400、400、409，且不写入任何数据。

### (3) 先建游客会话即可绕过 Turnstile，进而耗尽全局邮件额度
- **代码位置：** `apps/api/src/routes/auth.ts:56-71`，`/api/auth/guest` 没有验证码，只受 `createGuest` 每 IP 每小时 3 次限制（`apps/api/src/services/postgres-email-auth.ts:95-105`，`hits < 3`）。`auth.ts:73-82`，`/api/auth/code` 中写着“`if (!await service.resolve(sessionToken(c.req.raw))) { if (emailCaptchaVerifier) await emailCaptchaVerifier(...) }`”：任何会话（包括游客）都会跳过 Turnstile，而且 `email` 可以是任意第三方地址。额度方面：每 IP 每小时 60 封（`postgres-email-auth.ts:40`，`count < 60`），每邮箱每小时 6 封（25 行），全局每小时 600 封（16 行，`sent < 600`）。
- **攻击面：** 约 10 个 IP，每个 IP 先建 1 个游客会话，再请求 60 封，即可在一小时内耗尽全局 600 封，阻断全站登录；同时可以对任意邮箱发送验证码骚扰邮件。
- **根因：** 注释（77-79 行）只为“游客升级、解绑确认”放行验证码，但实现按“有会话即放行”判断，且没有把收件地址限定为该会话将要绑定的邮箱。
- **建议修复：** 对游客会话也要求 Turnstile，或另设一个仅供升级流程使用的端点，只允许向即将绑定的邮箱发送，并对游客会话单独限额（例如每会话每小时 3 封）。全局额度按会话类型分池，游客池不得挤占登录池。
- **测试：** 带游客 cookie、不带 `captchaToken` 时，断言 403 `CAPTCHA_*`；游客会话向第二个邮箱请求时断言被拒；压测断言游客路径无法让 `auth_mail_limits.sent` 超过其子额度。

### (4) 事件链校验每回合遍历全部事件（总开销随局长平方增长）
- **API：** `apps/api/src/services/postgres-server-turn.ts:25`，`loadSave` 每次都执行 `SELECT verify_turn_event_chain($1)`。函数定义在 `packages/db/drizzle/0013_event_integrity_ownership.sql:40-47`：`FOR e IN SELECT * FROM turn_events WHERE save_id=target ORDER BY sequence LOOP … e.event_hash<>turn_event_digest(e,prev)`，对每条事件重新计算 SHA-256。`server-turn.ts:72` 在每回合开头调用 `loadSave`，所以第 n 回合是 O(n)，整局是 O(n²)。其实插入触发器 `append_turn_event_hash`（同文件 28-35 行）已经在写入时保证了链的连续。
- **API 次要：** `apps/api/src/services/narrative-memory-context.ts:17-19,55` 每回合按每页 100 条翻页，最多读取 10000 条已授权观察；`npc-memory-recall.ts:17-18` 同理。
- **P2 本机：** `apps/web/src/authoritative-turn-store.ts:175`，`commitLocalAuthoritativeTurn` 每次提交都执行 `readAndVerifyHistory`（全量重放）。提交后 `P2ReviewGame.tsx:313-315` 先调用 `refresh()`，即 94-96 行的 `verifyLocalEventChain` + `verifyLocalReplay`（再次全量重放）+ `exportLocalAuthorityArchive`（第三次全量校验），然后再调用一次 `verifyLocalEventChain`。每回合大约 4–5 次全量遍历，其中至少 2–3 次是全量 reducer 重放。
- **根因：** 把“加载时完整性审计”放在热路径上，而且没有增量头部校验。
- **建议修复：** 存一个“已验证头 `(sequence, event_hash)`”检查点，热路径只校验新增尾部，并比对头哈希与 `game_saves` 上记录的头。完整审计改为后台或抽样任务（例如每 N 回合一次，或在导出、恢复时）。P2 每回合只做增量校验，完整重放只在加载和导出时执行。
- **测试：** 基准测试（1、100、1000 回合），断言每回合校验的行数不超过新增事件数加常数；篡改历史行后，断言完整审计和下一次增量校验（头哈希不符）都能检出。

### (5) 避水符的效果标记从未被读取
- **代码位置：** 写入点 `packages/domain/src/prologue-v1-rules.ts:465`，`effectFlags: use.effectFlags.reduce(...)`；只在 1015 行做合法性校验（`facts.effectFlags.some(id => !effects.has(id))`）。全仓 grep `effectFlags`、`effect_ward_water`，除 UI 标签 `receipt-event-view.ts:21` 和初始空数组外，没有任何读取点。
- **副作用（比“不生效”更糟）：** 战斗“准备充分”的判定使用 `owns(facts, target.protectionItemId)`（rules 582-585，`protectionItemId: 'item_bishuifu'`，rulebook 115）。玩家按内容描述“对渡口作业位驱鸦”**使用**避水符后，物品被消耗，`owns` 变为 false，反而失去战斗保护。绕行路线只要求 `requiredClueId: 'clue_rockslide'`（rulebook 55），与避水符无关，“通过礁石小径涉水”的效果（`prologue-v1.ts:250`）在规则里同样没有实现。
- **根因：** 内容中写了效果（`statedEffect`、`effectFlag`），规则映射只完成了“消耗”这半边。
- **分类与严重度：** 规则，中（玩家可见的逻辑反转，任务仍可完成）。
- **建议修复：** 由作者裁定避水符的语义，可选：(a) 战斗 `prepared` 改为“持有或 `effectFlags` 含 `effect_ward_water`”；(b) 礁石绕行在有 `effect_ward_water` 时免除 `shoulder_scrape` 或减少耗时。规则与 rulebook 都在 P1 bundle 内，需要重新批准。
- **测试：** 用符后在作业位战斗应判 `clear`、无伤；持符不用的结果与之相同；绕行时有、无效果标记的差异断言。

### (6) 4 条已签 Canon 条目的公开正文混入编辑批注
- **位置（阅读版行号；同一字串在 `canon.registry.json` 与 `canon-runtime.json` 中都存在）：**
  1. 〔faction_yuqing_ge〕77 行：“**玉清阁:九霄大陆公认的丹道源流，所有炼丹师心中的朝圣之地**（标题跨图折行，012 小标题"中的朝圣之地"与 011 末尾句级衔接）”（registry 176/180，runtime 111/115）
  2. 〔faction_yantian_zong〕112 行：“……宗门以阵、符、卜三道冠绝天下（中州顶尖势力清单内同名条目），正道联盟的首席智囊。……”，同时有句子重复（registry 229/233，runtime 153/157）
  3. 〔faction_daguangming_si〕232 行：“**大光明寺:九霄大陆最富盛名的佛法圣地**，章名与 028 中州顶尖势力清单条目一致）”，缺左括号（registry 418/422，runtime 295/299）
  4. 〔faction_jingang_buhai_gu〕451 行：“（章名以补020 西荒顶尖势力清单条目为全；补010 页首被裁标题残句……一致。原【待归属】151/150 残片经补010–019 全章文字确认为本章门内风气内容，已归位）”（registry 776/780，runtime 573/577）
- **已签状态：** 4 条都在 `packages/content/src/canon-receipts.json`（59、77、131、257 行）中有 LYL 与 Bird 于 2026-10-06 的 `approved` 回执，签的正是包含批注的 SHA。
- **根因：** `packages/content/src/worldbook-publisher.ts:26` 定义了 `unresolvedMarker = /⟦(?:疑似缺失|待确认)：|\[看不清|【待归属】/u`，但这个闸门只作用于 `publishApprovedWorldbook`。现行运行包由 `scripts/build-canon-runtime.mjs` 生成，那里只检查 `sourceRef` 是否解析（23 行），不检查正文中的编辑标记；也没有针对“（…页首/补0xx/原0xx/跨图…）”这类批注的规则。
- **影响：** 运行包会被前端读取（例如 `RealmSeal.tsx:81` 读取 `canonRuntimeEntries`），NPC 或叙述的 Canon 上下文也可能注入这些文字，内部图号由此泄露到公开玩家包，违反 AGENTS.md 中“不将……逐图草稿打进公开玩家包”的要求。
- **建议修复：** 把批注移到 `sourceRefs`、`decisions` 或私有缺口记录，修正衍天宗的重复句与大光明寺的括号。在 `build-canon-runtime.mjs` 中加入与 `unresolvedMarker` 同源、并扩展到“补\d{3}|原\d{3}|页首|跨图|【”的拒绝规则。按 README 流程重建运行包和阅读版，4 条重新双签；registry 在 P1 bundle 内，还需要重新批准 P1。
- **测试：** 对 runtime 全部条目做正则扫描（构建失败即阻断）；回执 SHA 与 `canon-content-digests.json` 一致性测试。

### (7) 每次导航都从 localStorage 镜像重载存档，镜像写失败时显示旧数据并误报冲突
- **代码位置：** `apps/web/src/main.tsx:100-108`，`navigate()` 在 `history.pushState` 后 `dispatchEvent(new PopStateEvent('popstate'))`；`main.tsx:729,738` 中 `const refresh = () => setSaves(readSaves());` 绑定在 `popstate` 上；`apps/web/src/storage.ts:122-124`，`readSaves()` 只读 localStorage 镜像（`inspectLocalSaves`，75-110 行）。镜像写入：`apps/web/src/idb.ts:266-280` 的 `mirrorSaves` 遇到配额满等异常时 `return false`；`idb.ts:246-249` 只附带 `warning: 'compatibility-mirror-unavailable'`，IndexedDB 已提交新版本。
- **后果：** 镜像写失败后，下一次导航会用镜像中的旧数据覆盖界面状态 `saves`。下一次写入 `commitSaves(saves, …)`（`main.tsx:883,916,923,936,943`）或 `commitSaves(readSaves(), …)`（908 行）时，`expected` 是旧数据，`commitIndexedSaves` 的比较（`idb.ts:215-217`）判定为 `conflict`，界面误报“另一个标签页修改了存档”之类的冲突。
- **根因：** 把“兼容镜像”当成导航时的读源，权威源 IndexedDB 只在首次进入和 `storage` 事件时读取。
- **建议修复：** `popstate` 不再重读存储，只切换路由；必须刷新时调用 `hydrateSaves()`（读 IndexedDB）。镜像写失败时在内存中记录“镜像过期”，`readSaves()` 在过期时不得作为 `expected`。
- **测试：** e2e：模拟 `localStorage.setItem` 抛 `QuotaExceededError`，提交一次后导航再提交，断言没有冲突提示，且界面显示 IndexedDB 中的新修订。

### (8) 群聊“默认模式”的系统提示要求只返回故事文本，契约却要求 JSON
- **代码位置：** `apps/api/src/card-import/service.ts:331-333`，系统指令按 `group?.requireAllSelected` 二选一：true 时“仅返回 JSON 对象，messages 数组……”，否则“仅返回剧情文字”。原文是“仅返回剧情文字”，不是“只返回故事文本”。第 342 行把 `output_contract` 放进**不可信**的 user 消息，按 `group.mode==='multi'` 给出“JSON object with messages array of {participantId,text}”。第 365-367 行在 `group.mode==='multi'` 时 `JSON.parse(text)`，失败则 `GROUP_OUTPUT_INVALID`。
- **触发条件：** `mode: 'multi'` 且未勾选“全员各一次”。前端默认 `requireAllSelected` 为 false（`apps/web/src/routes/CardSession.tsx:23,71`），路由也允许缺省（`router.ts:101-108`）。这时可信的系统消息要求纯文本，不可信的上下文要求 JSON。模型通常遵从系统消息，结果是解析失败、整回合标为 failed。`manual`、`auto`、`default` 模式期望纯文本，二者一致，不受影响。
- **根因：** 指令按 `requireAllSelected` 分支，解析按 `mode` 分支，两个判断条件不一致。
- **建议修复：** 指令改为按 `group?.mode === 'multi'` 选择 JSON 版本，`requireAllSelected` 只追加“每人恰好一次”的约束；把输出契约放进系统消息，不放在不可信上下文里。
- **测试：** 单元测试断言 `mode:'multi'`、未设 `requireAllSelected` 时 instructions 含“仅返回 JSON”；用本地合成模型（`apps/api/src/card-import/local-runtime.ts:36`）跑 multi 与 multi+strict 两条路径都成功。

### (9) CI 在规则包不匹配、API 拒绝启动时仍可能显示绿色
- **代码位置：** `tests/e2e/p1-authenticated-candidate.cjs:116-132`：`waitFor(/health)` 失败后，`if (!childStderr.includes('P1_REVIEW_RULE_BUNDLE_MISMATCH')) throw error;`；若包含该字串，则断言数据库零写入、打印“stayed closed… This is not positive gameplay acceptance.”，然后 `return`，整个 e2e 不报错退出。该测试在 `package.json:23` 的 `test:e2e` 链中，由 `.github/workflows/ci.yml:149-154` 执行。
- **核验结果：** 全仓（不含 node_modules、.git）只有这个测试文件和 `docs/design/.../dossier-ops-tests-legacy.md:134` 出现 `P1_REVIEW_RULE_BUNDLE_MISMATCH`，`apps/api/src` 中没有任何代码输出它。现行 API 的插件加载错误码是 `INVALID_TURN_PLUGIN`、`INVALID_TURN_PLUGIN_RULES`、`PREVIEW_RULE_APPROVAL_INVALID` 等（`apps/api/src/services/turn-runtime.ts:30-60`、`preview-release-runtime.ts:20-40`）。所以按当前源码，这个分支是死代码，API 启动失败会走 `throw`，CI 变红。缺陷属于**潜伏**：只要任何依赖、日志或未来代码在 stderr 中打出这个子串（例如回显环境或错误链），全部玩法断言就会被跳过而 CI 仍为绿色。而且“规则包失配”本身就是应当阻断的回归，不应被当作通过。
- **分类与严重度：** CI，中。
- **建议修复：** 删除早退分支。如果确实需要“失配时关闭”的证明，单独建一个用例，故意给错摘要并断言启动失败；正向用例必须启动成功。CI 中增加“玩法断言计数大于 0”的守护（例如输出 `revisions = 6` 的标记并由 workflow 校验）。
- **测试：** 用例 A：正确插件，断言 201、修订数等；用例 B：篡改摘要，断言进程非零退出、`/health` 不可达、数据库零写入。两者都必须执行，任何 `return` 都视为失败。

---

## 5. NPC 记忆体系现状（简要）

- **数据结构：** `packages/domain/src/memory/policy.ts`
  - 第 2 行：`MemoryPolicyVersion = 'exact-recall-v1' | 'accessibility-v1' | 'continue-v1' | 'forgetting-v1'`。第 1 行注释：“These policies affect recall only. Neither can amend rules events or state.”
  - 第 9 行记忆类别：`'current-state' | 'historical-event' | 'subjective-belief' | 'unclassified'`，旧行一律记为 `unclassified`。
  - 12–19 行 `NpcObservation`：`npcId, eventId, eventRevision, observedAtMinute, channel ('witnessed'|'reported'), summary`。
  - 21–25 行 `NpcMemory`：`npcId, policyVersion, observations`。
  - 27–39 行 `ObservationGrant`：字段白名单 `authorizedFields` 与 `authorizedFacts`，注释“raw event payloads are forbidden”。
- **日志与外发箱：** `packages/domain/src/memory/turn-journal.ts`
  - 11–17 行 `NpcMemoryJournal`：`schemaVersion 1, saveId, revision, memories, lastTurn`，是有界日志，不作为检索的真相源（`narrative-memory-context.ts:24-25`）。
  - 24–39 行 `AuthorizedObservationOutboxRecord`：不可变授权记录，带 `grantId`、`memoryClass`、`authorizedFacts`、`summary`。
  - 41–54 行 `AuthorizedObservationSupersessionRecord`：作废类型 `premise-revised|relation-changed|entity-dead|item-moved|clue-invalid`，只追加作废元数据，不删改旧观察。
  - 数据库表 `npc_memory_journals`（`packages/db/drizzle/0002_s4_npc_memory_atomic.sql:5`）与 `npc_authorized_observation_outbox`。
- **检索与遗忘：** `packages/domain/src/memory/retrieve.ts:6-8` 设定半衰期 `10_080` 游戏分钟、`16` 条后续观察，下限 `0.35`；检索是 NFKC 小写后的**字面子串**匹配（26–29 行），低于下限只隐藏、不删除。`recall-authorized.ts:26-49` 的 `observationAccessibility = 2^-(elapsed/10080 + later/16)`；`recognizeAuthorizedMemoryCue`（51 行）只在显式回忆问句时触发，`MAX_RESULTS = 16`（44 行）。
- **可见性（局部知识）：** `apps/api/src/services/p1-memory-policy.ts:15-21`，`visibilityArtifact`：`eligibleEventTypes: ['talk.occurred']`，“Only the NPC named as a direct participant receives a witnessed observation.”，`authorizedProjection: ['topicTag', 'outcome']`，禁止 `infer-global-event-visibility`、`model-authored-grant`。授权入口是 `grantsForEvent: event => grantP1DirectNpcInteraction(event, allowedNpcIds)`（`p1-prologue-plugin.ts:84`）。
- **主要限制：**
  1. 只有**直接交谈**会产生记忆。移动、观察、战斗、绕行、任务等事件都不授予任何 NPC，岑九“记得所有来过渡口的人”（`prologue-v1.ts:212`）在规则里无法成立。
  2. 授权投影只有 `topicTag` 与 `outcome`，没有说话内容、地点或时间语义。
  3. 内容层的 `canKnow`、`cannotKnow`、`speakingStyle`、`memoryBoundary`（`prologue-v1.ts:209-212`）在全仓**没有任何代码读取**，局部知识边界只存在于文本中。
  4. 检索是字面子串匹配，没有同义词或语义检索。
  5. 每回合叙述上下文最多读取 10000 条观察，按每页 100 条翻页（`narrative-memory-context.ts:17-19`），与缺陷 (4) 一样随局长线性增长。
  6. 没有 NPC 之间的转述（虽然有 `reported` 通道，但没有授予路径），没有关系或好感状态。
  7. 存档 `memoryPolicy` 的哈希被钉住（`p1-memory-policy.ts:40-55,92-110`）；任何策略改动都会产生新版本，旧档按旧身份保留或拒绝。
  8. 叙述可见性方面，`docs/design/JX-VISION-02/claude-proposal/01-基线与实测.md:68` 已指出“完整的 facts 会泄露剧透，需要一个按可见性过滤的视图接口”。在当前代码里，`text_south_white_hook` 的约束“仅在玩家确在望气台且没有依赖岑九告知时展示”（`prologue-v1.ts:369`）没有实现，`p1-prologue-plugin.ts:116` 到达望气台就无条件展示。
