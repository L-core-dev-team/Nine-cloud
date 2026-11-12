# CARD-INTEGRATION-06A UI 接口交接（本地候选）

所有路径前缀 `/api/card-import`，仅在宿主显式挂载时存在；生产入口未启用。使用既有登录 Cookie，服务器从 Session 确认 owner；所有非 GET/HEAD 请求需匹配宿主配置的 Origin。错误通常为 `{error: CODE}`；勿把 401、404、409、429、503 混为成功。实际形状以 router.ts 与 service.ts 为准；以下 UUID 均为合成占位。

| 能力 | 实际接口与请求 | 响应/注意 |
|---|---|---|
| 预览导入 | POST /imports `{filename,kind:"card"|"worldbook"|"attachment",bytesBase64,rightsConfirmed:true}` | `{id,sha256,filename,kind,parsed,error}`；失败/损坏可能通过 error 报告；GET /imports、GET /imports/:id，原件 GET /imports/:id/original |
| 确认卡片 | POST /cards `{importId,parentId:null,source,notes,links:[{importId,uri}]}` | 返回卡片行；缺附件 MISSING_OR_DUPLICATE_ASSET；重复不一致 CONFIRMATION_CONFLICT |
| 管理 | GET /cards、GET /cards/:id；POST /cards/:id/versions `{changes,links?}`；PUT /cards/:id/library `{folder,tags,favorite}` | 返回卡片版本/元数据；既有 session 固定旧卡版本；删除 DELETE /cards/:id 被引用时 RESOURCE_IN_USE |
| 搜索 | GET /library/page?q=&folder=&tag=&favorite=true&after=游标 | `{items,nextCursor}`，每页至多100，null 表示末页；旧 GET /library 最多100 |
| 重复导入 | POST /cards/duplicates `{idempotencyKey,strategy:"skip"|"update"|"copy",importId,targetId?}` | `{cardId,strategy}`；同 key 异参 IDEMPOTENCY_CONFLICT |
| 导出 | GET /cards/:id/export?format=v2|v3|png；GET /imports/:id/worldbook-export | 文件字节；PNG 响应 X-Card-Cover 是 original 或 default |
| 世界书 | POST /imports/:id/worldbook-versions `{changes}`；GET /worldbooks/global；PUT /worldbooks/:id/global `{enabled}`；POST /worldbooks/global/replace `{oldId,newId}` | 返回新导入/设置；卡版本 links 指定专属书；全局书在会话创建时快照，旧会话不跟随更改 |
| Persona | GET/POST /personas；POST /personas/:id/versions；PUT /personas/:id/default；DELETE /personas/:id | 创建 `{id,name,description,extensions:{}}`；版本请求去掉 id；返回版本字段；被会话引用不能删除 |
| 单人会话 | POST /sessions `{id,cardId,greetingIndex:-1,personaVersionId?,recursiveWorldbook:false}`；GET /sessions、GET /sessions/:id | 返回 session；GET 单项附 greeting、persona；-1 原开场，0 起备用；新会话递归默认 false |
| 群聊 | POST /group-sessions `{id,cardIds:[卡1,卡2],personaVersionId?,recursiveWorldbook:false}`；GET /sessions/:id/group | 返回会话；参与者含 id、card_id、ordinal、display_name；2–3张同账号卡 |
| 发言策略 | GET/PUT /sessions/:id/group-strategy，PUT `{strategy:"manual"|"auto"}` | `{strategy}`；策略是会话默认，既有请求的选择固定 |
| 行动 | POST /sessions/:id/actions `{action,expectedRevision,idempotencyKey}`；群聊 POST /sessions/:id/group-actions 可加 `mode:"manual"|"auto"|"multi"`、`participantIds` | 返回 `{key,status,error,narrative,resulting_revision,expires_at}`；群聊 mode 省略使用保存策略，manual 一人，multi 2–3人；行动最多8000字符 |
| 历史 | GET /sessions/:id/history?after=revision；GET /sessions/:id/group-history?after=revision | 按 revision 升序，单人至多100回合，群聊按至多100完整回合；群聊每段带 participant_id、ordinal、body |
| 请求恢复 | GET /sessions/:id/requests、GET /sessions/:id/requests/:key；POST /sessions/:id/requests/:key/recover | 列表最近20项；status pending/completed/failed/unknown；unknown 不证明未收到；重试复用相同 key、revision 和内容，不自动换 key |

建议展示的错误：AUTH_REQUIRED、ORIGIN_REJECTED、ACCOUNT_MISMATCH、NOT_FOUND、RESOURCE_IN_USE、INVALID_GREETING、INVALID_RECURSION_MODE、INVALID_PARTICIPANTS、REVISION_CONFLICT、REQUEST_PENDING、IDEMPOTENCY_CONFLICT、MODEL_NOT_CONFIGURED、GENERATION_TIMEOUT、GENERATION_CANCELLED、STALE_GENERATION、GROUP_OUTPUT_INVALID、CONTEXT_TOO_LARGE、WORLDBOOK_UNSUPPORTED_KEY / FEATURE / GROUP、WORLDBOOK_RECURSION_LIMIT。部分生成失败以 HTTP 200 的请求记录 `status:failed,error` 返回；不要仅看 HTTP 状态。未知世界书行为要提示，不能静默跳过。

合成示例：创建 `{"id":"11111111-1111-4111-8111-111111111111","cardId":"22222222-2222-4222-8222-222222222222","greetingIndex":-1,"recursiveWorldbook":false}`；行动 `{"action":"你好","expectedRevision":0,"idempotencyKey":"33333333-3333-4333-8333-333333333333"}`。ID 必须由真实创建结果替换；不得把样例作为跨账号数据。模型设置不从卡/请求读取：由服务端宿主注入受授权配置、Provider 和出站策略，当前生产未挂载角色卡路由。
