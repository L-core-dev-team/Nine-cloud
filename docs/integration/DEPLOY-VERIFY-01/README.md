# JX-DEPLOY-VERIFY-01 · 正式站版本与人物资料保存核验

2026-11-26，北京时间。正式前端已定位。用正式站实际下发的建角页面连接主线 API 和全新 PostgreSQL，五项资料在重新登录后逐项读回。正式站 API 的镜像及其数据库的迁移记录仍待核对，因此线上玩家资料的跨登录保存为 **UNVERIFIED**。

## 三层版本

| 层 | 核验结果 | 依据 |
| --- | --- | --- |
| 正式前端 | **已核实建角与人物页面对应的发布版本**。Pages 部署 `85adf881`，源码 `c4c672f5d2dd1ff5e08b4e10d82edd8e1c4af833`，Tree `3dc2a2e4dd6d255b392a6e7242eed8ff05ea2a2f`。 | 正式首页、建角地址和独立部署地址均返回入口 `index-CVXN4bqP.js`。两个站点的入口 SHA-256 均为 `571fea6a90d1730e282fa9cc8ec5a47e89f7197c54a82f235002ca1bb91c33d6`；人物页、会话、存储与主样式四个文件也逐字节摘要一致。两份根 HTML 摘要不同，正式响应含边缘注入脚本，核对范围限于上述应用资产。发布记录将部署 ID 与源码对应，记录的构建为 Node 24、pnpm 11.19.0、release／preview-1。 |
| 实际 API | **上游域名已核实；运行镜像 digest、revision、源码提交 UNVERIFIED**。 | 该版 Pages 生产代理只允许 `https://api.jiuxiaogame.cn`。21:14 从玩家域名及 API 域名分别读取 health、ready、auth/providers，均为 200，三对 JSON 相符。认证响应含 email=true、phone=false，缺少主线标准入口输出的 cardImport。由此可确认响应差异，但无法判定人物资料处理代码版本。 |
| 生产数据库 | **UNVERIFIED**。 | 本次执行环境没有已配置、可用于该实例的主机或数据库只读入口。公开 ready 的数据库检查是 SELECT 1；health 中的 3 是存档契约版本。未取得生产库的字段定义、迁移账本或 API 到具体数据库的绑定证明。 |

生产整体 **VERSION_VERIFIED：未达到**。生产组合 **PERSISTENCE_VERIFIED：未达到**。独立分支的远端状态、CI、数据库就绪响应均不能单独补齐上述证据。复核时 main 为 `f1fe6ea561c5ef4d1ec670b7a406625ce5df774c`，#119、#120、任务书 #125 均为开放的 Draft。GitHub deployments 返回 0 条；Pages 的实际发布有独立记录。

[正式建角页](https://play.jiuxiaogame.cn/new) · [固定部署地址](https://85adf881.jiuxiaogame-public-demo.pages.dev) · [发布记录第 11 节](https://github.com/L-core-dev-team/Nine-cloud/blob/767ad5d4743178778549bd0a44b5add3e718cb54/docs/acceptance/2026-11-23/JX-UI-E-01-最终报告.md) · [发布版代理](https://github.com/L-core-dev-team/Nine-cloud/blob/c4c672f5d2dd1ff5e08b4e10d82edd8e1c4af833/functions/_lib/api-proxy.mjs)

## 玩家入口与实际保存路径

建角最后一步提供两个不同的按钮。“保存角色并进入”保存到本机；“创建服务端规则存档”会将 `choices.memoryMode` 与可选的 `choices.characterProfile` 发送给 `POST /api/games`。本次实际走后者。主线 API 按账号和存档编号读写 `game_saves.character_profile`，与权威规则快照分开；通过原有 `GET /api/games/:saveId` 返回给“人物 · 行囊”。

[前端建角与两个按钮](https://github.com/L-core-dev-team/Nine-cloud/blob/c4c672f5d2dd1ff5e08b4e10d82edd8e1c4af833/apps/web/src/main.tsx#L383) · [主线创建与读取](https://github.com/L-core-dev-team/Nine-cloud/blob/f1fe6ea561c5ef4d1ec670b7a406625ce5df774c/apps/api/src/services/authoritative-game.ts#L29) · [按 owner 读取和写入](https://github.com/L-core-dev-team/Nine-cloud/blob/f1fe6ea561c5ef4d1ec670b7a406625ce5df774c/apps/api/src/services/postgres-cloud-save-repository.ts#L178)

## 本次隔离实测

**候选组合 PERSISTENCE_VERIFIED。** Edge 加载从正式站下载的 HTML 与应用资源。建档、认证、存档请求只发往回环地址上的真实 Node API；邮件只投递到本地测试收件箱。API 工作副本 `86927174dd4aff2139f69d4097a48c56f40b7a2e` 和合并后 main 的 Tree 同为 `e1751a3318577673028eb98a87528ccec9275194`。重新编译的 73 个 API JavaScript 文件与运行的构建结果逐一匹配。独立数据库账本共 28 项，按插入顺序逐项匹配 SQL 摘要及登记时间。最新为 0029，列为可空 JSONB。

| 实际检查 | 结果 |
| --- | --- |
| 建档和独立重读 | 201，修订 0，默认记忆模式 continue。姓名、性格、出身、外貌、目标五项在页面发出的请求、独立 API GET 和数据库列内逐项一致。 |
| 刷新 | 原浏览器刷新后打开“人物 · 行囊”，五项内容均与输入相同。 |
| 重启 API | 停止原进程并启动新进程，独立 GET 返回同一 saveId、修订和五项资料。 |
| 退出、无缓存重登 | 同账号退出、关闭原浏览器会话；使用无 Cookie 和站点存储的新会话，重新收取本地验证码完成登录，owner 相同；独立 GET 和人物面板均读回五项。 |
| 幂等与冲突 | 原请求重放返回 200、相同 saveId，当时该账号仅 1 份存档；同键改姓名返回 409／IDEMPOTENCY_CONFLICT。 |
| 账号隔离 | 第二个独立邮箱账号读取原 saveId 返回 404，响应未含人物姓名。 |
| 无人物资料的存档 | 隔离对照档省略可选字段，列为 NULL，读取 200，响应省略 characterProfile。本轮验证此数据形态；历史升级路径另有仓库用例。 |

[脱敏证据索引与本次实测值](./evidence.json) · [字段迁移](https://github.com/L-core-dev-team/Nine-cloud/blob/f1fe6ea561c5ef4d1ec670b7a406625ce5df774c/packages/db/drizzle/0029_game_character_profile.sql) · [既有旧行升级用例](https://github.com/L-core-dev-team/Nine-cloud/blob/f1fe6ea561c5ef4d1ec670b7a406625ce5df774c/tests/integration/migration-upgrade.mjs#L56)

## 剩余核对与处置顺序

1. 在现有源站运维通道取得正在提供服务的容器所用镜像 ID、仓库 digest 与 revision 标签或构建记录。仓库中的 compose 使用 API_IMAGE 占位，不能给出运行值。若规则插件独立挂载，同时核对该挂载的制品标识。
2. 通过同一服务实际连接的数据库，用只读事务核对迁移表位置、已应用条目、字段类型、可空性和默认值。仅需元数据。下列查询针对主线约定；第一条先确认位置，再按实际 schema 读取。将记录与实际镜像的迁移目录逐项对照。0029 在本次主线检出的 SQL SHA-256 为 `7e6f12ca205fa0ae8634d1a5110f3d5ab63c9561835d6dc8f692e5a9549cd66c`。

```sql
BEGIN READ ONLY;
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_name IN ('__drizzle_migrations', 'game_saves');
SELECT table_schema, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'game_saves' AND column_name = 'character_profile';
-- 在第一条查询确认该位置后执行
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
ROLLBACK;
```

3. 拿到三层身份后，用对应 API 制品、结构及规则插件在隔离环境复跑本页的验收。若确认 API 过旧，修复范围限建档与重读的版本配套；若确认缺迁移，先演练升级并独立批准，再切换依赖新列的 API。回退保留已写入的人物资料，先验证原镜像对可空新列的兼容性，不删列。当前没有证据表明真实玩家资料已经丢失，也没有支持额外修改产品代码的复现。

本轮生产只读。真实模型、生图、模型连通性预检及生产写入均为 0，隔离测试服务已停止。
