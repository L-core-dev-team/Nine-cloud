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
