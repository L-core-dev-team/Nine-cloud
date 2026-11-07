# PR 03：TRUNCATE 授权的只读评估

日期：2026-11-07。只读查询生产目录，没有执行 `TRUNCATE`、`REVOKE` 或任何写入。下面的 SQL 是隔离库草案，没有放进 `packages/db/drizzle`，因此不会被现有迁移器自动应用到生产。

## 已证实

本次只读连接的角色是 `postgres`：不是超级用户，但 `rolbypassrls = true`。24 张 `public` 业务表的所有者都是 `postgres`，RLS 开启，强制 RLS 关闭。表所有者在未强制 RLS 时不受行级策略限制；`BYPASSRLS` 是另一条独立原因。这不能写成「任何 Node 直连都绕过 RLS」。

本机生产配置里的数据库用户名是 Supabase 池化账号 `postgres.deyzirwnzjxsmyvfrsdb`。没有打印连接串或口令，也没有用这条连接在运行中的 API 进程里执行 `current_user`。Hono 的 `apps/api/src/index.ts` 只用 `DATABASE_URL` 创建 `pg.Pool`，代码里没有 `SET ROLE`。要确认容器里的实际角色，应在隔离或只读会话中执行 `select current_user, rolbypassrls from pg_roles where rolname = current_user`。

`public` 的默认授权来自两类：

| 授权者 | 对象 | 默认结果 |
| --- | --- | --- |
| `postgres` | 表 | `postgres` 拥有完整权限；`anon`、`authenticated`、`service_role` 得到 `Dxtm`，即 `TRUNCATE`、`REFERENCES`、`TRIGGER`、`MAINTAIN`，没有增删改查 |
| `supabase_admin` | 表 | 新建表会把 `arwdDxtm` 授给 `anon`、`authenticated` 和 `service_role`。现有业务表的所有者是 `postgres`，所以没有落到这组更宽的默认值 |
| `supabase_admin` | 函数 | 新建函数默认可由 `anon` 和 `authenticated` 执行 |

现有 `anon` 与 `authenticated` 的 `TRUNCATE` 覆盖 18 张表，包括 `game_saves`、`turn_events`、`turn_requests`、`auth_accounts`、`auth_sessions`、`npc_authorized_observation_outbox` 和 `npc_memory_journals`。同一目录查询没有列出这两个角色对上述表的 `SELECT`、`INSERT`、`UPDATE`、`DELETE`。

`public` 里 `SECURITY DEFINER` 函数只有 `purge_auth_sms_ephemeral_data` 和 `rls_auto_enable`。前者只允许 `postgres` 和 `service_role` 执行。后者只允许 `postgres` 执行。`private` 架构下没有查到其他 `SECURITY DEFINER` 函数。它们不是 `anon` 清空业务表的路径。

API 代码对存档、回合和 NPC 观察使用 `owner_id` 条件，例如 `apps/api/src/services/postgres-server-turn.ts` 和 `npc-memory-turn-transaction.ts`。这是应用层检查，不代替数据库授权。

## 尚未证明

- 没有用 `anon` 密钥或公网接口发起 `TRUNCATE`。PostgREST 的公开方法是读取、插入、更新和删除，不提供 `TRUNCATE`。因此目前没有一条已经证实的公网清空路径。
- Data API 是否向浏览器暴露这些表，本轮没有用密钥拉取 OpenAPI。
- `anon` 若能直接登录数据库，`TRUNCATE` 授权才可能被使用。公开的 API key 不是数据库口令。
- 没有证据表明已经发生清空或泄露。
- Hono 容器内的 `current_user` 仍未目击。

PostgreSQL 中 `TRUNCATE` 不受普通 RLS 行策略约束。权限过宽是事实。公网可利用性没有被证实，也不在生产上试。

## SQL 修订

已从可执行草案中删除 `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`。Supabase 的普通 `postgres` 角色不能修改内部角色 `supabase_admin` 的默认授权。隔离测试让非超级用户 `app_owner` 执行这句，结果是 `42501`。

`pg_default_acl` 把全局默认授权和 schema 默认授权分成不同记录。只撤销 schema 级记录，不会取消全局记录。隔离测试先只做 schema 级撤销，随后新建的表仍然从全局默认授权得到 `TRUNCATE`。再撤销全局默认授权后，另一张新建表没有这项权限。因此不能把语句退出码当成权限已经全部消失。

先前读到的生产默认授权都标在 `public`。这次补查全局记录时目录连接失败，没有重跑。可执行草案仍对 `postgres` 同时撤销 schema 级和全局默认授权；若生产没有全局记录，后一句是空操作。它不修改 `supabase_admin` 名下的默认授权。

现有表上的 `TRUNCATE` 也不会随默认授权撤销而消失。草案改为点名已经核对的 18 张表，不对整个 `public` 做未点名的范围变更。该文件仍不在 Drizzle 迁移目录里。

## 隔离库测试

容器 `jiuxiao-isolated-pr03`，镜像 `postgres:17`，没有发布主机端口。执行前在容器内读到数据库 `jiuxiao_isolated_pr03`、用户 `postgres`、数据目录 `/var/lib/postgresql/data`。没有使用 Supabase 连接串。

| 检查 | 结果 |
| --- | --- |
| 撤销前 `anon`、`authenticated` 对合成表有 `TRUNCATE` | PASS |
| 非超级用户修改 `supabase_admin` 默认授权 | PASS，拒绝，`42501` |
| 只撤销 schema 级默认授权后新建表 | PASS，仍有来自全局默认授权的 `TRUNCATE` |
| 再撤销全局默认授权后新建另一张表 | PASS，没有 `anon` 的 `TRUNCATE` |
| 重复执行撤销 | PASS，第二次后目录里不再列出这两个角色的 `TRUNCATE` |
| `anon` 清空仍保留一行的合成表 | PASS，拒绝，`42501` |
| 拒绝后读取该行 | PASS，`id=1`，内容仍是 `keep-me` |

这只证明本地 PostgreSQL 17。它不表示 Supabase 生产权限已经整改。

## 回滚与批准

这份文件不改变生产权限。若将来在隔离库验证后要上生产，回滚是重新授予被撤销的 `TRUNCATE`，并恢复对应的默认授权。那一步现在不批准。
