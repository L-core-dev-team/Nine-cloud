# CARD-CORE-CLOSE-02 隔离升级与 TLS 回执

## 已授权的本地结构
仅修改非正式 `apps/api/src/card-import/schema.sql`：sessions 加 `greeting_index integer NOT NULL DEFAULT -1 CHECK (greeting_index >= -1)`。-1 表示 card 的 first_mes；>=0 为 alternate_greetings 下标。服务端校验索引对应非空字符串及长度；同一 session id 的 card 或选择不一致时拒绝。GET session 根据该会话和同 owner 的卡片恢复文字。该字段被视为创建时不变，恢复不从客户端自填决定。

## 旧库升级草案（未实施正式迁移）
经单独批准后，在备份和停止/协调旧写入者前提下对 card_import.sessions 事务性新增该列和约束，旧行默认 -1。现有本地测试仅在隔离 PostgreSQL 临时表对合成旧行执行 ALTER、验证 owner/id/revision 与 -1 保留，尚未证明真实旧库、并发写入、索引、失败回滚及版本交替兼容。正式迁移文件、journal、上线顺序和回滚策略仍需审查和批准。旧二进制未传字段依靠默认值，删除列会丢失非默认选择，因此正式回滚不得直接丢列；必须预先明确保全与停机方案。

## 客户端丢 key 恢复
新增只读 GET /api/card-import/sessions/:id/requests，按当前 session owner 限定，最多最近20条，含 key、status、action、expected/resulting revision、时间；供用户判断，并继续调用原 GET /requests/:key 或现有 recover，绝不自动重 POST 或生成新 key。无法恢复列表范围外、未记录或已经清理的 key；pending/unknown 不表示服务端从未收到。UI 接线未做。

## 实际 TLS 证据与范围
测试目录 本机独立测试目录（未上传）；本地合成证书、tls-check.mjs、untrusted-test.mjs 和 egress-test-only.ts。该副本与产品实现差异仅为允许 127.0.0.1 及端口57464，NODE_EXTRA_CA_CERTS 指定测试证书；证书校验保持开启。真实 TCP/TLS 服务观察 SNI=provider.test、Host=provider.test:57464、远端回环地址；错误域名及没有受信测试CA均拒绝；重定向未跟随且适配器拒绝；产品原实现拒绝回环、未批准 host、IPv6及私网 DNS。HTTP 代理环境设置为不存在的本机端口仍成功，符合测试时无代理；真实企业代理、生产 DNS 和公网链路尚未验证。每次请求创建 keepAlive=false 的独立 Agent 并重新解析，模拟 DNS 改变为私网会拒绝，不存在自动 fallback；此结论限当前实现和测试。

未执行真实外部模型请求、真实生产迁移、生产启用、内容审核、UI或部署。
