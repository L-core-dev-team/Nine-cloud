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
