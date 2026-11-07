# 交接

> 以下原段落是早期历史断点；与本文件末尾 CARD-CORE-CLOSE-02 记录不一致时，以后者为准。
本轮为局部候选，任务未完成。已接入角色上下文和限定世界书选择；模型采用注入式接口，没有真实传输适配，开场选择、正式 Provider、真实 PG 及三种素材端到端仍未完成。主要变更 apps/api/src/card-import/service.ts、context.ts、worldbook.ts 与对应测试。下一步先审阅 Provider 独立 transport 抽取的精确补丁及授权，之后在隔离 PG 和合法测试素材上验证；不可启用生产路由或改签名。查看本地 HEAD、git status 与测试矩阵确定精确断点。模型安全优先级依赖 provider 消息角色与模型行为，尚不能视为已证明。

## 后续增量（2026-11-03）
独立测试加入域名白名单、DNS 公网验证和固定 IP 连接，以及真实隔离 PG、真实 Cookie/Session 与模拟 Provider 组合。DNS/连接的本机实际 TLS、外部 Provider 和生产安全验收仍未验证；默认 IPv6 及任何含 IPv6 的 DNS 响应拒绝。出站策略不自动启用生产路由。


## CARD-CORE-CLOSE-02 当前断点（2026-11-03）
角色卡 session 建立支持 greetingIndex=-1 默认开场或 >=0 备用开场。已有相同会话ID如传不同选项返回 IDEMPOTENCY_CONFLICT；GET session 返回已选文本。新增请求列表 GET /sessions/:id/requests，仅返回该 owner、该会话最近20条，不会自动重新提交；超出窗口、无请求数据或多条不确定情形仍需用户识别，不能断言未知请求未到达。act 接入 Request.signal：生成前取消/超时标失败，迟到文本不写入；已进入或完成提交时结果仍以服务端请求查询为准，不能声称取消一定回滚已提交结果。框架的真实网络断线信号传播尚未验证。

本地 schema.sql 增加 greeting_index；正式迁移未实施。旧本地数据库不含该列时需隔离升级方案，部署必须先审查新旧版本兼容、备份与回滚；正式迁移及生产启用均待独立批准。详见 CARD-CORE-CLOSE-02.md。TLS 测试使用临时测试专用副本（仅增加回环地址和测试端口放行）及独立测试CA，证书校验没有关闭；真实外部模型、生产DNS策略与真实网络断线仍未验证。

## CARD-FEATURE-COMPLETE-03 增量（2026-11-05）
本轮基线 054daa016fa4b6004139898aeccd466c6214194a。当前为部分成果，不是完整验收：POST /cards/:id/versions 创建新卡版本、原导入不变，旧会话继续指向原卡；PUT /cards/:id/library 与 GET /library 提供基本文件夹、标签、收藏、名称搜索（最多100条）；GET /cards/:id/export?format=v2|v3|png 和 GET /imports/:id/worldbook-export；POST /imports/:id/worldbook-versions 创建独立世界书内容副本。导出V2/V3结构经本机 parser 验证，SillyTavern 互操作未验证；PNG 使用透明度为不透明的中性1像素占位图，不保留原封面。导入相同文件仍只提示 duplicate；编辑生成内容重复则返回 CARD_VERSION_EXISTS，跳过/更新/另存策略未完成。部分更新版本失败时可能留下可见的导入记录，不是全事务。

缺口：世界书关联替换/解绑、共享及全局启用、卡库分页、重复导入三种策略、完整标准字段校验、PNG封面与资产、独立世界书版本关系及变更后已有会话策略。现有 cards 对 owner/import 唯一，针对仅改变关联但内容完全相同的多个独立版本，现结构无法表达；新增结构须先设计与验证兼容升级，不能靠篡改原文/空白绕过。没有创建正式迁移，也没有修改原生系统。真实模型、生产出站和内容审核均未验收；生产入口继续关闭。

A线唯一查重总表有别人的未提交修改，本候选未覆盖；以上仅作候选增量交接，待唯一总表负责人合并。继续在本分支补齐剩余能力并复验；不得上传或部署。

## CARD-FEATURE-COMPLETE-03B（2026-11-05）当前接续
基线 cfcb3b43ee0966bfd07948a0669d1c534ff58b83。P0 编辑版导入、卡版本和链接在同一 owner 事务、同一个 advisory lock 下执行，回滚不遗留新导入；相同内容只更换 links 复用原 import，不改内容和 SHA；旧 session 继续引用原 card。仅本地 schema 移除 cards(owner_id,import_id) 唯一约束，保留 owner 复合外键；现有 confirm 在相同 owner/import/parent 范围检查既有项。正式迁移未批准或执行。需要审查旧确认幂等语义、迁移期间写入并发、备份；如生成同 import 多卡则不能直接恢复旧唯一约束，须先保全分流重复版本再评估回滚。未改 imports 唯一或原始字节。
关联版本接口 POST /cards/:id/versions 可传 changes={} 与 links 数组；新卡的链接是快照，旧会话不变；链接存在且属于同一账号，必需资产仍需绑定。新增 GET /library/page，游标保存微秒精度时间与 UUID，并支持原搜索/目录/标签/收藏组合；旧 GET /library 保留。PNG 导出沿父链查找同账号原 PNG 并保留非角色元数据图片块，X-Card-Cover 标 original 或 default；JSON来源无原 PNG 时为默认图。原图片数据不重写。回读只验证现有 parser，尚未证明固定 SillyTavern 实际互操作。

未完成：世界书全局启停及更新后会话语义、重复导入明确的跳过/更新/另存三策略及其幂等、共享世界书生命周期与完整删除引用检查、真实固定 ST 互操作、旧数据库升级和并发回滚证明。当前的链接版本可用于关联/替换/解除和同账号多卡引用，但不等同全局世界书管理完成。用户继续授权不应被误认为生产迁移、部署或真实模型授权。历史功能查重总表仍有他人未提交改动，本候选未触碰。

## CARD-FEATURE-COMPLETE-03B-FINAL（2026-11-05）
基线 ae92956989bf71baf411399d43124be21be6696d。新增仅账号范围全局设置 GET /worldbooks/global、PUT /worldbooks/:id/global；会话创建在 owner advisory lock 下将当时启用的世界书 import ID 快照到 session_worldbooks，旧会话不受后续启停及新版本更改；历史会话升级后快照为空，维持旧行为。卡专属链接与全局项同 import ID 只读取一次；同内容的完整书先按 JSON 字面去重，所选条目相同 content/position/order 去重，其余条目不合并。共享只指同账号内多个卡/会话引用，不跨账号。引用中的书删除因外键返回 RESOURCE_IN_USE；停用全局不删除已有会话引用。书更新创建新 import，不会自动切换设置，须显式停用旧 ID 并启用新 ID；设置间的两次调用不是原子替换。

POST /cards/duplicates 接收 idempotencyKey、strategy=skip|update|copy、importId、可选 targetId；owner advisory lock 内查请求并绑定指纹和结果，重试原键返回同 cardId，内容变化冲突。skip 返回已有卡，update 从目标卡建立 parent 版本并复用导入原件，copy 新建独立卡；卡有未绑定附件时失败关闭。请求记录引用 card，删除被引用卡前会拒绝，以保留幂等。跨账号拒绝；同请求并发测试通过。新索引/数据库策略还须正式审核。

本地 schema 增加 global_worldbooks、session_worldbooks、duplicate_requests，保留 owner 复合外键；账户删除挂钩依次清理。旧库在部署新代码前需要单独、经过批准的迁移；旧 session 的 global 快照不得通过当前设置补造。此前放宽 cards(owner_id,import_id) 的唯一约束测试在隔离临时表模拟，旧行保留、重复版本存在时重建旧唯一约束会失败并保留两条；正式回滚不得丢弃重复卡或直接重建约束。实际旧库全量升级、旧版并发及双版本兼容未验证；不能进入生产。固定 SillyTavern 06bde939fb1e9c4c8d8641d810f0a916b5bce127 未在本机发现，实际双向导入导出 NOT VERIFIED，不能以九霄 parser 回读冒充。真实 Provider、生产迁移、部署未执行。

## CARD-03B-CLOSEOUT（2026-11-05）
基线 01e465ba2225e80be5765020afcaf2bf1b02e2d7。POST /worldbooks/global/replace 在同账号 owner advisory lock 的单个事务中校验新书、删除已启用旧书、启用新书；会话创建使用相同锁。旧会话快照不变；旧未启用、其他账号目标及同 ID 均拒绝。插入故障触发器验证回滚；并发会话只能观察前或后完整状态。与客户端重复请求的特殊结果：第一次成功后重试同请求会返回 GLOBAL_WORLDBOOK_NOT_ENABLED，不会二次更改；此接口没有 idempotencyKey。

固定 SillyTavern 源码 06bde939fb1e9c4c8d8641d810f0a916b5bce127 在独立目录本机 127.0.0.1:57470 实际运行（禁用扩展自动更新和模型自动下载），使用合成素材与真实 /api/characters/import、/api/characters/export、/api/worldinfo/import、/api/worldinfo/get：九霄 V2、V3 JSON 和 PNG 导入成功，ST 分别导出 PNG/JSON 经九霄 parser 读取成功；测试的 unknown_synthetic 和 extensions.synthetic_extra 经 ST PNG 往返保留；世界书导入、读取后由九霄 parser 接受。范围仅该素材和接口，非完整字段兼容或真实账号验收。原 PNG 经 ST 导入再导出后非元数据图片块不相等，不能声称跨酒馆原封面字节保持；九霄本身的 PNG 后代导出保留原图片块由既有测试覆盖。

仍有门禁：正式数据库迁移与真实旧库升级、跨版本并发/回滚未验证；PNG 跨 ST 保留原图字节失败；真实 Provider/生产环境及内容审核未验收。详见 CARD-03B-CLOSEOUT-MIGRATION-PLAN.md。ST 独立测试目录依赖已安装，测试服务与 PG 均已停止，未删除历史材料。

## CARD-PERSONA-GROUP-04 阶段断点（2026-11-05）
本轮仅完成 Persona 本地第一阶段，群聊未实现，任务不能判完成。新增 personas、persona_versions、session_personas 三表仅在本地测试 schema；选中版本在 session 创建时固化，旧 session 不带 persona，缺省选当时默认 persona 的最新版本；Persona 以不可信玩家设定放入 user 内容，不是 system 指令。已引用的 persona 删除返回 RESOURCE_IN_USE。账号删除测试挂钩需按请求、session_personas、sessions、persona_versions、personas顺序清理。
接口：GET/POST /personas；POST /personas/:id/versions；PUT /personas/:id/default；DELETE /personas/:id；POST /sessions 可传 personaVersionId；GET /sessions/:id 返回 persona 快照。正式迁移未设计/执行，历史生产环境不可直接启用。
群聊尚未实现：现有 requests 一次只存一段 narrative，没有参与者/发言归属；下一步必须在现有事务和幂等流程上设计参与者卡片及每角色世界书快照、可信 speaker ID 和多段输出校验，不能把模型自由文本中的角色名作为权威身份或另造 Provider。用户允许隔离结构开发，但实际群聊代码和验收未完成，不能标 PASS。


## CARD-PERSONA-GROUP-04B 本地阶段成果（未完成验收）
基线 b8206217aabb4171a0079127a01aa2ae89866a40。新增本地测试 schema：group_participants、group_participant_worldbooks、group_turns、group_messages；会话创建固定参与卡版本、其世界书引用、现有 Persona 和全局世界书快照。新增 POST /group-sessions、GET /sessions/:id/group、GET /sessions/:id/group-history、POST /sessions/:id/group-actions。手动与轮询选择由服务端验证，multi 仅接收结构化 JSON 且检查参与者及长度；请求复用现有键和状态，段消息与请求完成和 revision 更新共用事务。读取历史使用可信 participant ID。测试用 host 删除挂钩按外键顺序增加新表。
未完成：用户要求的会话级默认策略存储与切换；群聊专属世界书触发与去重的端到端测试、并发同键、真实断线取消与迟到结果的群聊专项验证；多段数量限制、分页边界和预算优先策略尚需深入验证；生产级迁移、真实模型、真实浏览器/网络断开尚未验证。现有上下文超预算时拒绝，并未实现按当前发言者和历史的优先裁剪。不能声明 04B 完整验收。不得启用生产。


## CARD-PERSONA-GROUP-04B-CLOSEOUT（2026-11-05）
基线 f3f703b887ee170798eb68546e69aa69cb4e39ac。新增本地 group_settings，GET/PUT /sessions/:id/group-strategy 分别读取/设置 manual 或 auto；group-actions 省略 mode 时由事务内读取当前策略并固定到本次 group_turns，已存在 key 先校验并返回原状态，不随策略变化重新选人。手动、自动、multi 可显式指定；重复参与者输出允许并保留顺序，未知字段忽略、身份及文字严校验。group-history 先按回合分页，避免多段响应被截断。
群聊选择已固定在会话的全局书和选中发言者的专属书，复用既有选择器及内容去重；旧会话不跟随卡新版本或全局开关。群聊上下文最多 100000 字节（含模型输入结构），先移除最早完整对话，再移除选择器末尾世界书条目，不裁剪系统约束、Persona、参与者身份和当前输入，仍超限则拒绝。选择器本身仍有 50000 字节条目上限，超过即拒绝；此字节预算并非针对真实模型 tokenizer 的保证。单人路径不启用群聊裁剪。
本地测试 schema 增加 group_settings，正式迁移未设计或执行。升级旧 04B 数据时需在独立审查后的同一事务为既有群聊补默认 manual，核对旧新应用并发和回滚；缺失设置时请求失败关闭。未执行真实网络断开、真实付费模型或生产验证，仍不得启用生产。取消检查仅能保证观察到的取消在提交前触发回滚；提交后及 COMMIT 与取消竞争结果以服务端请求记录为准。


## CARD-WORLDBOOK-ADVANCED-05（2026-11-07，部分完成）
基线 55976a30edf55b61ad87be5365bbca1a76562a71。对照本地 SillyTavern 06bde939fb1e9c4c8d8641d810f0a916b5bce127 的 public/scripts/world-info.js（matchKeys、selectiveLogic、verifyProbability 及 originalWIDataKeyMap）。增量支持条目 probability、useProbability 和 extensions.probability / use_probability，百分比0–100，开启时按随机抽样、关闭及100时不抽样；同一服务端请求键沿用原请求结果，重试不重新生成。概率结果未单独持久化，未知提交或真实模型流程不视为已验证。
兼容矩阵：次级 AND_ANY/NOT_ALL/NOT_ANY/AND_ALL、大小写、单词匹配与基础前后位置和排序已有基础实现；其整词 Unicode、多词及优先级/预算细节不宣称与 ST 完全一致。概率仅覆盖基本抽样，sticky/cooldown等未支持。正则、递归和互斥分组仍失败关闭（未实现）；常规 JS 正则不能保证限时，禁止不受限执行。复杂位置、组权重和递归延迟等亦未实现。现有选择器至多遍历1000条、选100条及50000字节，群聊另有100000字节预算。此轮未完成用户所列全部高级能力，不得标记完整兼容。


## CARD-WORLDBOOK-ADVANCED-05B（2026-11-07，本地有限兼容）
基线 25e0c6a99ffbd45c0ce4fe763c5690a63d2c25ff。现有选择器增加 group/groupOverride/groupWeight（及对应 extensions 字段）；同组优先 override 按 order 降序、相同顺序按输入稳定排序，否则按权重随机选一，再进行该条目的概率判断。已成功组在后续递归中不能再产生其他条目；失败概率的非优胜候选在后续轮次的处理不保证与 ST 相同。组名含逗号拒绝，group scoring、sticky、延迟触发等复杂策略未支持。
增加有限递归：新选择正文进入后续扫描，记录条目标识防止重复，preventRecursion 不传播，excludeRecursion 不在递归轮中匹配；最多4轮激活、5000次条目扫描、1000个原始条目、100条选中、50000字节正文，发现第五轮仍有候选失败关闭。默认自动递归，与 ST 的用户全局递归开关存在差异。多次扫描及组处理有硬上限，不能宣称与 ST 在预算、排序和概率上完整一致。正则仍拒绝，未找到并验证非回溯引擎或强制终止隔离，不能以普通 JavaScript 正则执行不可信表达式。
固定 ST 06bde939fb1e9c4c8d8641d810f0a916b5bce127 仅对 public/scripts/world-info.js 的组选择及概率源码作对照；本轮 ST 触发运行时对照 NOT VERIFIED，不应与此前格式互操作测试混淆。九霄侧综合测试见测试矩阵。前端需呈现不支持语法/超限错误；Provider 必须继续独立执行地址授权与真实模型 token 预算，不得把字节上限视为 token 上限。正式迁移、真实外部模型及生产仍未授权。


## CARD-WORLDBOOK-05B-VERIFY-FREEZE（2026-11-07，未完成）
输入 e4d55205de3f9657ae464214b138269591963b1b / tree db64192c2ad19b04818f4496b5941651c7ae3376，固定 ST 对象 06bde939fb1e9c4c8d8641d810f0a916b5bce127。ST public/scripts/world-info.js 明确 world_info_recursive 默认 false，九霄选择器固定启用最多四轮递归；玩家未选择递归时九霄可能额外注入正文，存在影响剧情语义的风险。未执行 ST 浏览器实际触发对照，不可视为已冻结。直接 Node import 固定版本 world-info.js 失败（浏览器根路径依赖 /scripts/i18n.js 无法解析），没有将抽取代码、导入世界书或阅读源码当运行时对照；需在真正加载 ST Web 应用的隔离浏览器会话中执行八项指定场景，并固定随机数。是否为九霄增加会话级显式递归开关，应在取得运行时证据和确定设置的持久化契约后处理；不擅自改现有会话语义。
现状：基础关键词/次级条件、概率、有限互斥与递归为 PARTIAL（九霄本地测试，ST 运行时 NOT VERIFIED）；复杂位置、组评分、sticky、递归延迟和安全正则为 UNSUPPORTED/拒绝；跨模型 token 上限 NOT VERIFIED。未经运行时对照不宣布有限兼容冻结。
整体联调清单：1) 真实 Provider 须先批准外部请求并完成服务端出站授权/SSRF 和真实供应商联测；2) token 限额不能用100000字节替代，需按真实模型 tokenizer 计量；3) card-import schema、Persona、群聊、世界书及旧数据回填的正式迁移和回滚须单独批准；4) 真实 TCP/代理断线与提交未知状态恢复未验证；5) UI 需消费 cards/imports、sessions、group-actions、group-strategy、group-history 和 requests/recover 的现有契约与错误；6) 对 WORLDBOOK_UNSUPPORTED_KEY/FEATURE/GROUP、RECURSION_LIMIT 等明确展示拒绝原因，不应静默丢条目；7) 内容审核与生产入口另设门禁，不因本地测试或本文释放。


## CARD-WORLDBOOK-05B-RUNTIME-VERIFY（2026-11-07）
固定 ST 完整应用 + 真实 Chromium 的 checkWorldInfo 运行时对照已执行，合成条目经公开事件注入并固定随机源；详见 CARD-WORLDBOOK-05B-RUNTIME-VERIFY.md。递归关闭时 ST 只触发首条，九霄仍触发递归链；开启时两者入选集合一致但顺序不同。新会话显式配置、旧会话保留 legacy_on 的方案仅为建议，需单独审查迁移与授权，未修改产品代码；正式生产仍未批准。


## CARD-WORLDBOOK-05C（2026-11-07）
基线 b7d7844ea62a5b3746859843234ad0dc9bd509ef。单人 POST /sessions 与 POST /group-sessions 均接受可选布尔 recursiveWorldbook；省略默认 false，新会话创建时写入 sessions.recursive_worldbook，恢复时读取固定值，重复会话 ID 的开关不一致返回 IDEMPOTENCY_CONFLICT。测试 schema 的列 DEFAULT true 仅用于兼容原有直接插入与旧数据回填，新服务显式写 false/所选值。旧会话应保留 true，正式迁移未创建：须独立审查 ALTER 表、旧行回填 true、旧新版本并发插入及回滚，避免在新旧应用滚动部署时改变行为；本轮仅隔离 TEMP TABLE 模拟默认值，并非真实旧库升级。
世界书最终排序为 order 升序，同 order 按激活顺序逆序；由现有上下文构造器分别按 before_char/after_char 过滤，保留各位置内顺序。支持显式递归开关；开启时保留4轮/5000扫描限制。此前固定 ST 运行时样本的链顺序 gamma/beta/alpha 现由单测重现，其他 ST 高级边界并非完全兼容。正则继续拒绝，复杂组评分/sticky 等未实现；不修改 Canon/Provider/UI，不代表生产开放。
