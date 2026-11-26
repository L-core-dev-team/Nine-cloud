# 《九霄》艺术研究：可转化的方法（2026-11-26）

**体例**：每条后标〔来源编号·等级〕，URL 在文末"来源表"。等级：**官方**＝开发商、官方博客、GDC/会议、机构或学术论文；**一手**＝当事人访谈或自述；**二手**＝媒体、评论、综述。"据摘要"表示原页 403 或被截断，内容只来自检索摘要，未读到全文。"推论"是本文对九霄的推断，不是来源的原话。没有复制任何图片。

---

## 一、游戏

### 《黑神话：悟空》
- **取景先于造景**：据山西文旅厅介绍，游戏有 36 个国内取景地，其中 27 个在山西；大部分场景由主创依据古建实景复刻，或由美术人员建模。"亢金龙"彩塑取自晋城玉皇庙〔S2·二手，含官员原话〕。可转化的方法：先建"真实器物参考库"，再做风格化处理。
- **引擎让光照能当场迭代**：冯骥提到，Nanite 降低了场景优化成本；Lumen 省掉了烘焙光照贴图和用点光模拟 GI，可以实时调光〔S1·官方，据摘要〕。
- **克制细节**：技术评论者认为，团队在 Lumen 上"取长补短"，避开了"细节地狱"〔S4·二手〕。
- 推论：九霄是网页文字 RPG，不适合做扫描级写实。更值得借的是"考据参考→风格转译"这条管线，例如用晋南彩塑、宋元壁画的色谱作为色卡来源。
- **不应模仿**：不要拿 3A 写实与动作 Boss 战当网页文字游戏的美术目标，那会耗尽预算，也会冲淡文字。

### 《对马岛之魂》／《羊蹄山之魂》
- **用世界本身引导**：引导之风取代箭头和地图标记，在模拟中把风吹向目的地，影响布料、草和几十万粒子〔S6·官方〕。它的速度场只有一个向量，从主角指向目标；粒子再叠加 curl noise。开发者原话是"没有做任何真正的流体模拟"〔S5·二手，转述 GDC 2021 演讲〕。
- **HUD 极简**：Connell 说目标是"让屏幕尽量干净"，不用常驻小地图〔S7·一手〕。
- **概念阶段先推到极致**：先把主题色推满，成品再收敛；每个生物群系只取关键元素放大，其余弱化；用剪影区分敌人类型，例如弓手用三角形、重甲兵用方形；服装特意加入受风摆动的部件〔S8·官方〕。
- **色彩分区和母题色**：羊蹄山从南到北依次是樱、竹、雪中红枫，每个区域各有调色板和"个性"；黄色（银杏）作为主角创伤的记忆点，会在关键任务点重复出现〔S9·一手〕。
- **导演模式**：黑泽明模式是黑白、颗粒、音频滤波，并加强风；《羊蹄山》增加了三池模式（镜头更近、血泥更多）和渡边模式（Lo-fi 配乐）〔S10·二手，据摘要〕。
- 推论：九霄可以做"灵气流向"作为引导（文字或粒子），用"一域一色＋一个母题色"组织地图，导演模式可对应"水墨／黑白／说书"等滤镜。
- **不应模仿**：不要照搬日本武士的影像符号（黑泽明式构图、和风母题）来代替中国修仙自己的视觉语法。

### 《风之旅人》
- **情绪弧先于剧情**：GDC 2013 演讲讲的是如何打磨出一条"情绪弧"〔S14·官方〕。Chen 说过，可以在没有剧情、角色和对白的情况下构造情绪叙事弧〔S14 关联报道，二手，据摘要〕。
- **沙的渲染是分层合成**：漫反射、法线颗粒、边缘光（菲涅尔，用来区分同色沙丘）、"海洋高光"、闪烁高光，以及按坡度与朝向混合的四张波纹贴图〔S12·官方；S13·二手复刻〕。
- **无文字交流**：没有名字、聊天和大厅，交流只靠一次"鸣响"。鸣得快显得急，鸣得大像在呼唤〔S15·二手，据摘要〕。
- 推论：九霄的同门或道友互动可以用"传音符"这类非文字信号，减少社区毒性；渲染可以借"边缘光区分同色层次"处理山峦叠嶂。
- **不应模仿**：两小时线性旅程的结构不适合长线 RPG，不能套用整条弧。

### 《GRIS》
- **一关一色**：工作室说"每个关卡被编码为一个阶段，所选颜色代表它"〔S16·一手〕；中期还咨询了心理学者，处理"悲伤五阶段"〔S17·二手〕。至于每种颜色对应哪个阶段，各来源说法冲突，未核实。
- **无对白**：工作室说"借助美术、音乐和玩法，对白不再必要"〔S16·一手〕。
- 推论：境界突破可以设计为"解锁一种色相"，例如炼气灰墨、筑基添石绿、金丹添泥金，让色彩成为进度本身。
- **不应模仿**：九霄是文字游戏，不能为了纯视觉叙事而去掉文本。

### 《ABZÛ》
- **鱼群管线**：每个物种是实例化静态网格，一次 draw call；嘴部用 morph target，不用骨骼；鱼按世界位置在内存中空间排序、分块更新，来应对 n² 邻域问题；转向时每条鱼略有差异〔S18·一手，Balamut〕。
- **色彩随距离衰减**：红色随距离消失、水变浑，模仿水对光的吸收；但水比真实更清，以保证可读〔S18〕。
- **镜头禁止"一帧跳变"**：镜头总在缓动，不做硬切〔S18〕。
- 演讲还专门讲了海底光照、大气和巨型海带林模拟〔S19·官方〕。
- 推论：云海、灵鹤群、剑阵可以用"实例化＋按区块更新"在 WebGL 中实现；远山用"冷色＋去饱和"表现距离。
- **不应模仿**：不要用大群动画代替内容，网页端也负担不起。

### 《艾尔登法环》
- **最低限度引导**：宫崎英高说，赐福指引是"最低限度的引导"，偏离它会遇到发现和戏剧〔S20·一手，据摘要〕；也有主线，但随时可以离开〔S21·二手，转述 IGN〕。
- **开放是为了扩大叙事尺度和未知感**，不是为了填满地牢〔S20、S21〕。
- 远景巨物（黄金树）作为全局方位锚点：这一点我没有找到开发者原话，属推论。
- **不应模仿**：高难度惩罚和碎片化叙事门槛高，不适合作为九霄的默认体验。

### 《塞尔达传说：旷野之息／王国之泪》
- **三角法则**：三角地形让玩家选择翻越还是绕行，同时遮挡视线制造惊喜；大三角是地标，中三角挡视线，小三角调节节奏；矩形用来"完全隐藏"〔S22·二手，CEDEC 2017 讲稿翻译〕。
- **引力**：散布可见度与重要度不同的结构，让玩家被不同方向吸引，从而"不断绕路"；热力图显示改动后路径分布更均匀；"山丘→桥→塔"形成兴趣链〔S22〕。Famitsu 报道的关键词是"引力"与"地形"〔S22b·二手，据摘要〕。
- **化学引擎**：物理负责运动，化学负责状态变化（火、水、冰、风、电）；导演藤林秀麿提出"乘法式玩法"〔S23·二手〕。
- 这里没有核实塔与地图揭示的原始设计说明，只有 CEDEC 提到的早期塔布局被测试者认为"太线性"〔S22〕。
- 推论：九霄的地图可以按"峰（大三角）／林（中三角）／石（小三角）"分层揭示；五行相生相克天然适合做"化学规则表"。
- **不应模仿**：不要造需要实时物理的 3D 沙盒。

### 《哈迪斯》
- **按状态挑台词**：系统观察本局状态（例如低血量时遇到某人），从预写事件中选一条合适的；事件可加权，顺序和出现与否因人而异〔S24·二手，含 Kasavin 原话〕。
- **死亡即推进**：目标是"去掉死亡与重开的痛苦"〔S24〕。
- **关系分支**：同一场冥府后续戏，按与 Meg 的关系有三种变体；Kasavin 承认事件关联缺少可视化，内容越多越难管理〔S25·二手〕。
- 推论：九霄的轮回、闭关、回宗门都可以用"条件＋权重＋已读标记"挑台词；需要配套的"事件关联可视化"工具。
- **不应模仿**：全程配音成本不适合九霄当前体量。

### 叙事型作品
- **Kentucky Route Zero**：采用剧场"布景学"和"慢电影"〔S26·官方，GDC 演讲简介〕；场景由重叠的平面层构成，灯光被当作布景的一部分〔S26b·二手〕。推论：九霄的场景页可以做"多层平面＋可开合的布景灯"。不应模仿：过度晦涩的留白。
- **Disco Elysium**：PC Gamer 采访标题引语是"可以把整款游戏当作一幅画来设计"（只读到标题）〔S27·一手〕。美术被评论为混合了库尔贝写实与培根式变形肖像〔S27b·二手〕。技能以内心声音的形式参与对话〔S27c·二手，据摘要〕。推论：功法、心魔可以作为"内在声部"插话。不应模仿：海量的政治文本密度。
- **Heaven's Vault**：铭文按词切分，每个词从几个英文候选里选；系统会推近正确的玩家、删去偏离者的选项，没有失败态，"都会回流到故事"；铭文按玩家已掌握的词汇投放，难度随知识自适应〔S28·一手〕。推论：适合用于符箓、古篆和阵法的破译。
- **80 Days**：先锁死地球仪上的航线，再用对话把航线作为奖励解锁；只有钱、健康、时间三项跨城统计，所以作者可以乱序写作；用装饰艺术旅行海报做"过去的人想象的未来"〔S29·一手〕。推论：九霄的"云图"可以只保留寿元、灵石、因果三项全局变量。
- **Return of the Obra Dinn**：1 bit 双色；Bayer 抖动准确、蓝噪声更有机，"用得越少越好"；把抖动与 3D 摄像机统一来减少闪烁；加轮廓线，"可读性高于一切"〔S30·一手〕。推论：九霄的低端设备或省电模式可以用"单色墨抖动＋轮廓"。
- **Outer Wilds**：用物理事件教人（被旋风甩上太空），不用 NPC 警告〔S31·二手，转述 K. Beachum GDC 2021〕；飞船日志被分析为"知识地图"〔S31b·二手〕。推论：九霄的"悟道录"应以知识而非数值为进度。不应模仿：22 分钟循环的时间压力。

### 叙事生成：Dwarf Fortress／RimWorld
- RimWorld 有三位"讲故事者"，各自以不同方式安排事件节奏；Sylvester 用"幻想性错觉（apophenia）"为简陋画面辩护：极简表达让玩家自己脑补故事，但前提是长期相处；远征在画外进行，"时间没有跳过，只是动作不可见"；角色关系在危机时才浮出界面〔S32·二手，含 Sylvester 原话〕。
- 世界开局即带地理、历史与关系；Dwarf Fortress 的 Legends 模式供人阅读生成的历史〔S32；S33·二手，据摘要〕。
- 推论：九霄可设"天道"讲故事者，用张弛曲线投放劫数。
- **不应模仿**：ASCII 级的信息过载和不透明。

---

## 二、影视

### 《绝命毒师》／《风骚律师》
- **广角与长镜**：DGA 报道说，剧组用广角捕捉荒漠，"鼓励导演至少用几个广角"，少拍覆盖镜头，"像电影一样拍"；为车内机位锯掉了后挡风和后备箱盖〔S35·一手〕。
- 四个标志性手法是超广远景、延时、物件视角 POV，以及"前景近物＋远景"的风暴前宁静〔S34·二手〕。Slovis 说："绝命毒师没有任何随意之处，它是形式化的"〔S34，转引 Forbes〕。
- **Marshall Adams 的规则**：对称、简洁、叙事；对称"给场景更多时间在画框内展开"；每个镜头"压缩到它要传达的信息"；运动只用一个轴，"摇、俯仰或推，只能选一个"；第五季起用大画幅，把景深当叙事工具；参考《同流者》、黑色电影和西部片〔S36·一手〕。
- Gene 段落的黑白处理、各角色色彩，这次没有读到 Adams 的原话，未核实。
- 推论：九霄的过场页可以执行"一镜一轴"，地图俯瞰用对称构图，闭关和时间流逝用"延时云影"。
- **不应模仿**：犯罪片的冷硬暴力美学不符合仙侠的气韵。

### 《星际穿越》
- **IMAX 手持**：Hoytema 想用大画幅拍"更亲密、更灵活"的画面，改造摄影机后加肩托，多数 IMAX 镜头是手持〔S37·一手〕。
- **实拍投影**：飞船窗外影像用前投在片场播放，演员看得到，同时为布景提供照明；有报道称有 180 多个机内投影镜头〔S38·二手，据摘要〕。
- **科学可视化里的取舍**：DNGR 追踪的是光束束（ray bundle）而不是单条光线，配合时空滤波，避免 IMAX 银幕上闪烁；为了让大众看懂，把自旋降到 a/M=0.6；盘面亮度调暗；按 Nolan 和 Franklin 的要求加上镜头光晕，让 CG 和实拍连续；影片省略了多普勒频移，论文称会讨论原因，但我没有读到具体理由〔S39·官方论文〕。
- 推论：九霄的"天象、雷劫"可以先做物理或数学原型，再为可读性做有记录的删改。
- **不应模仿**：不要追求胶片和 IMAX 的物质规格，网页上没有意义。

### 《英雄》
- **色彩分章**：Doyle 在日志中写道，每段叙述各有一套色彩系统，定为白、红、蓝、绿，"色彩是片中一个角色"〔S40b·一手，据摘要〕。
- **起点是色彩**：在中国文化里红意味着喜庆；绿用于宫中回忆，选用富士胶片的绿；"按地点改剧本，而不是给地点强加颜色"，因为"湖的颜色改不了"〔S40·一手〕。
- 推论：九霄的"同一事件多方转述"可以每个版本配一套色，但颜色要从场景本身的物料（湖、林、殿）出发。
- **不应模仿**：不要照抄红蓝白绿这套已被符号化的配色。

---

## 三、网页／数字艺术

- **Bruno Simon（2019 与 2026 版作品集）**：物体命名直接决定物理体类型，空物体定义碰撞、重生点和区域；界面元素都是 3D 模型，尽量不用 HTML UI；7.84 万片单三角草；天气和昼夜对所有访客同步；空间化音频，UI 只用一个点击音并改变播放速率；实例化、视锥剔除、调色板贴图代替顶点色；ETC1S/UASTC＋DRACO 压缩；有 WebGPU 时自动启用（TSL）；移动端自动降档，关闭景深并降低阴影分辨率〔S41·一手，2026-03〕。
- **Lusion**：用 Houdini 预算布料，4 个拖拽方向存进约 220KB 的缓冲，运行时混合；顶点动画存成 PNG，11 个关键帧插值出 66 帧；用 16 位整数存坐标；两张 matcap 实现半透明物体的两态；光点跟随光标；镜头只允许约 1.72° 的微转〔S42·一手〕。
- **Immersive Garden《David Whyte Experience》（2025-01）**：画作按光标掠过做水彩流体，每张纸单独模拟；用"水滴状噪声层"逐步揭示画面；用模板缓冲的模拟图集只激活可见区域；噪声预烘焙〔S44·一手〕。这一案例和"水墨晕染揭示"最接近。
- **Abeto《Igloo Inc》**：程序化生成冰晶；自制 VDB 体积导出器，压到比普通图片还小；粒子按速度变色，音效与粒子同步；UI 也在 WebGL 里，乱码字效靠改 SDF 偏移，不触发 CSS 重排〔S45·一手〕。
- **Active Theory《Secret Sky》**：基于自研 Dreamwave 平台，四个场景；用视锥剔除、距离剔除，并按设备能力调整实例数量；把直播流嵌进 3D 场景〔S43·一手〕。
- 推论：九霄的网页美术应采用"预计算＋运行时混合"和"分档降级"，水墨揭示可以直接借鉴 S44。
- **不应模仿**：不要搞"炫技首页"式的长加载、强制滚动劫持，它们和长线游玩冲突。

---

## 四、东方

- **园林**：UNESCO 把苏州园林描述为在宅旁有限地块里，以水、石、植物构成的"世界缩影"，并利用地形营造曲折布局〔S46·官方〕。《园冶》讲"巧于因借"，借景有远借、邻借、仰借、俯借、应时而借〔S47·机构教材，据摘要〕。障景造成抑扬掩映；框景用门洞、窗框框取远景〔S49c·二手科普〕。拙政园的视线补偿形成由核心向外的环形空间序列，造成"景无尽"之感〔S48·学术〕。留园研究认为节奏感取决于游览状态的变化速率，与行进速度无关〔S49·学术，据摘要〕。推论：九霄的界面切换可以按"抑（障）→框→放（借）"三拍设计；"节奏取决于状态变化率"可以直接变成动效规范。
- **敦煌**：北凉、北魏壁画以棕红打底，再用孔雀石、青金石的冷色点缀，冷暖对比强烈；洞窟昏暗，画工借补色提高明度〔S50·二手，观复博物馆〕。颜料已大幅劣化，原色需要靠理化分析推断〔S50c·学术〕。第 257 窟九色鹿横卷长约 3.85 米，按开端、发展、高潮、结束展开，结局落在画面中部国王与鹿相遇处〔S50b·一手学者文本，段文杰〕。推论：长事件可以"从两端向中间收束"；今天看到的"敦煌旧色"是褪色结果，九霄不应把褪色当原色。
- **长卷**：《千里江山图》长近 12 米，是石青（蓝铜矿）、石绿（孔雀石）的青绿山水，靠胶矾固色、反复渲染出层次〔S51·二手〕。《富春山居图·无用师卷》由六纸拼接，长 6 米多；先淡墨布局，再逐层加深、加干的笔墨；从右向左依次是山峦、江渚、再到峰峦，以水上远山收尾〔S52·官方机构页〕。推论：九霄的世界地图适合用横向长卷，按"开、合、开"的节律展开，绘制管线也照"淡墨布局→逐层加密"走。
- **书法节奏（谨慎，推论）**：已有研究测量书写速度、笔压和"节奏"，例如 CalliSense 的节奏分析模块，以及动作捕捉显示熟练者书写更快、垂直波动更小〔S53·学术〕。可以把"提按（压力）↔ 缓动曲线振幅""疾涩（速度变化）↔ 时长分布"映射到动效，但没有研究证明玩家能感知这种映射，需要 A/B 验证。

---

## 五、对九霄艺术身份的 10 条结论

1. **【事实→推论】用世界引导，不用箭头。** 依据是引导之风的单向量加噪声实现〔S5、S6〕和 HUD 极简〔S7〕。九霄应以"灵气流向"文字或粒子作为主引导。
2. **【事实→推论】一域一色，再加一个贯穿母题色。** 依据是羊蹄山的分区调色和银杏黄〔S9〕，以及对马"只放大关键元素"〔S8〕。
3. **【事实→推论】色彩就是境界进度。** 依据是 GRIS 一关一色〔S16〕。各境界解锁对应矿物色，例如石绿、石青、泥金，色源参照敦煌和青绿山水〔S50、S51〕。
4. **【事实】矿物色要做"原色"而非"褪色"。** 敦煌原色需要理化推断〔S50c〕。九霄的色卡应注明是"复原色"还是"现状色"。
5. **【事实→推论】空间揭示用"障—框—借"三拍。** 依据是园林手法〔S46–S49〕和 BotW 三角法则与兴趣链〔S22〕。这两套来源在"遮挡制造发现"上相互印证。
6. **【事实→推论】地图采用长卷式横向展开。** 依据是富春山居的"淡墨布局→逐层加密"与开合节律〔S52〕，以及九色鹿"结局居中"〔S50b〕。
7. **【事实→推论】知识即修为。** 依据是 Heaven's Vault 无失败态、按掌握量投放〔S28〕，以及 Outer Wilds 用事件教学〔S31〕。功法和阵法的破译应以理解推进，而不是刷数值。
8. **【事实→推论】叙事由"天道讲故事者"加条件台词生成。** 依据是 RimWorld 的节奏曲线和留白脑补〔S32〕、Hades 的状态加权选择〔S24、S25〕。必须同时建设事件关联可视化工具〔S25〕。
9. **【事实→推论】镜头纪律是"一镜一轴、不准一帧跳变"。** 依据是 Adams 的单轴运动和对称〔S36〕、ABZÛ 的缓动镜头〔S18〕。
10. **【事实→推论】网页管线优先"预计算＋运行时混合＋分档降级"。** 依据是 Lusion〔S42〕、Bruno Simon〔S41〕、David Whyte 的水彩揭示〔S44〕和 Secret Sky〔S43〕。科学或玄学奇观要像 DNGR 那样，为可读性做有记录的删改〔S39〕。

---

## 来源表

| 编号 | 等级 | URL |
|---|---|---|
| S1 | 官方（据摘要；原页 403） | https://www.unrealengine.com/zh-CN/developer-interviews/black-myth-wukong-wows-with-ue5-early-access-visuals |
| S2 | 二手 | https://paper.people.com.cn/rmrbwap/html/2024-08/22/nw.D110000renmrb_20240822_1-10.htm |
| S4 | 二手 | https://www.gcores.com/articles/187308 |
| S5 | 二手 | https://www.gamedeveloper.com/design/using-vorticles-to-simulate-wind-in-i-ghost-of-tsushima-i- |
| S6 | 官方 | https://gdconf.com/news/see-how-ghost-tsushima’s-guiding-wind-came-life-gdc-2021 |
| S7 | 一手 | https://www.androidcentral.com/ghost-tsushima-creative-director-interview |
| S8 | 官方 | https://blog.playstation.com/?p=342594 |
| S9 | 一手 | https://mobilesyrup.com/2025/09/25/ghost-of-yotei-sucker-punch-joanna-wang-art-director-interview/ |
| S10 | 二手（据摘要） | https://gameinformer.com/2025/07/10/ghost-of-yotei-has-new-director-modes-inspired-by-miike-and-watanabe-and-lots-lots-more |
| S12 | 官方 | https://gdcvault.com/play/1017742/Sand-Rendering-in |
| S13 | 二手 | https://www.alanzucconi.com/2019/10/08/journey-sand-shader-1/ |
| S14 | 官方 | https://gdcvault.com/play/1017700/Designing |
| S15 | 二手（据摘要） | https://gamedeveloper.com/design/how-i-journey-i-eliminated-online-toxicity-with-a-simple-ping |
| S16 | 一手 | https://blogs.plitch.com/en/blog/interview-with-nomada-studio |
| S17 | 二手 | https://en.wikipedia.org/wiki/Gris |
| S18 | 一手（媒体转述） | https://www.gamedeveloper.com/design/-i-abzu-i-and-the-challenge-of-conveying-emotions-through-game-design |
| S19 | 官方 | https://gdcvault.com/play/1024409/Creating-the-Art-of-ABZ |
| S20 | 一手（据摘要） | https://www.famitsu.com/en/news/202201/27249109.html |
| S21 | 二手 | https://pcgamer.com/elden-rings-open-world-took-a-lot-more-effort-than-previous-souls-games |
| S22 | 二手（CEDEC 讲稿译文） | https://gist.github.com/idbrii/e39fe96279aa1670319bfa521d907399 |
| S22b | 二手（据摘要） | https://www.famitsu.com/news/201708/31140870.html |
| S23 | 二手 | https://www.thumbsticks.com/gdc-17-breath-of-the-wild-science-lies |
| S24 | 二手 | https://www.gamedeveloper.com/design/how-supergiant-weaves-narrative-rewards-into-i-hades-i-cycle-of-perpetual-death |
| S25 | 二手 | https://gamespot.com/articles/hades-writer-explains-script-philosophy-after-player-discovers-incredible-detail/1100-6482650/ |
| S26 | 官方（演讲简介） | https://gamedeveloper.com/design/video-how-theater-influenced-the-design-of-i-kentucky-route-zero-i- |
| S26b | 二手 | https://www.inverse.com/gaming/video-games-drama-final-fantasy-kentucky-route-zero/amp |
| S27 | 一手（仅标题） | https://www.pcgamer.com/games/rpg/why-does-isometric-perspective-suit-disco-elysium-you-can-design-the-entire-game-as-if-it-was-a-painting |
| S27b | 二手 | https://lareviewofbooks.org/article/roleplaying-a-communist-cop-in-the-ruins-of-revolution |
| S27c | 二手（据摘要） | https://pcgamer.com/your-skills-talk-to-you-in-disco-elysium-an-inventive-rpg-that-keeps-impressing |
| S28 | 一手 | https://www.gamedeveloper.com/design/how-inkle-developed-its-own-ancient-language-for-i-heaven-s-vault-i- |
| S29 | 一手 | https://www.gamedeveloper.com/business/postmortem-inkle-s-i-80-days-i- |
| S30 | 一手 | https://blog.playstation.com/archive/2019/10/17/lucas-pope-on-return-of-the-obra-dinns-art-style |
| S31 | 二手 | https://www.gamedeveloper.com/business/explaining-the-value-of-show-don-t-tell-storytelling-in-i-outer-wilds-i- |
| S31b | 二手 | https://rigdern.github.io/a/learning-about-learning/learning-design-insights-from-outer-wilds/ |
| S32 | 二手 | https://www.gamedeveloper.com/design/rimworld-dwarf-fortress-and-procedurally-generated-story-telling |
| S33 | 二手（据摘要） | https://gamasutra.com/design/q-a-dissecting-the-development-of-i-dwarf-fortress-i-with-creator-tarn-adams |
| S34 | 二手 | https://nofilmschool.com/breaking-bad-cinematography |
| S35 | 一手 | https://www.dga.org/craft/dgaq/issues/1203-summer-2012/television-breaking-bad |
| S36 | 一手 | https://www.panavision.com/highlights/highlights-detail/call-and-response |
| S37 | 一手 | https://www.denofgeek.com/movies/interview-interstellar-cinematographer-hoyte-van-hoytema/ |
| S38 | 二手（据摘要） | https://gizmodo.com/the-insane-attention-to-detail-in-interstellars-big-spa-1683856057 |
| S39 | 官方论文 | https://arxiv.org/abs/1502.03808（正文 https://ar5iv.arxiv.org/html/1502.03808 ） |
| S40 | 一手 | https://reverseshot.org/interviews/entry/295/christopher-doyle |
| S40b | 一手（据摘要） | https://www.theasc.com/magazine/sept03/cover/index.html |
| S41 | 一手 | https://www.awwwards.com/brunos-portfolio-case-study.html |
| S42 | 一手 | https://www.awwwards.com/case-study-for-lusion-by-lusion-winner-of-site-of-the-month-may.html |
| S43 | 一手 | https://www.webbyawards.com/crafted-with-code/secret-sky-2021 |
| S44 | 一手 | https://awwwards.com/case-study-david-whyte-experience-by-immersive-garden.html |
| S45 | 一手 | https://awwwards.com/igloo-inc-case-study.html |
| S46 | 官方 | https://whc.unesco.org/en/list/813/ ；https://whc.unesco.org/document/154344 |
| S47 | 官方机构（据摘要） | https://www.edb.gov.hk/attachment/sc/curriculum-development/kla/pshe/references-and-resources/ethics-and-religious-studies/Nan_Lian_Garden/2i_sc.pdf |
| S48 | 官方（学术） | https://link.springer.com/10.1007/s00004-020-00498-w |
| S49 | 官方（学术，据摘要） | https://search.napstic.cn/literature/periodical/010nfjz202408007 |
| S49c | 二手 | https://www.peopleapp.com/rmharticle/30029176194 |
| S50 | 二手 | https://m.thepaper.cn/newsDetail_forward_28061032 |
| S50b | 一手（学者文本转载） | https://m.thepaper.cn/baijiahao_29504456 |
| S50c | 官方（学术，据摘要） | https://www.tobunken.go.jp/ccr/pdf/48/4809.pdf |
| S51 | 二手 | https://www.ourchinastory.com/cn/17110 |
| S52 | 官方机构（据摘要） | https://artsandculture.google.com/asset/FwHKE_kQDplTyw |
| S53 | 官方（学术） | https://arxiv.org/abs/2502.15883 ；https://www.jstage.jst.go.jp/article/jjbse/24/0/24_2020_001/_article/-char/en |

**未核实清单**：
- 黑神话扫描设备与流程；
- 艾尔登法环"远景巨物"的开发者原话；
- 旷野之息塔与地图揭示的原始说明；
- GRIS 颜色与阶段的对应关系；
- 风骚律师 Gene 黑白段与角色色彩；
- 星际穿越省略多普勒的理由；
- 九色鹿的阅读方向；
- 书法节奏映射对玩家的可感知性。
