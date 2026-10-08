# CI 主分支迁移阻塞修复记录（2026-10-08）

## 背景

`main` 分支 CI（workflow `jiuxiao-workspace`，`.github/workflows/ci.yml`）自提交 `c8fcb4c`
（`feat(mail): switch verification delivery to Tencent Cloud SES API`）起持续为 `failure`，
且失败发生在流水线早期，导致其后所有校验步骤（typecheck / test / build / API 容器冒烟 /
PostgreSQL integration / e2e / 备份恢复）从未执行。

- 触发 run：`37727268041`（HEAD `c1c934a`），耗时 45s，`failure`。
- 失败步骤：`Migrate ephemeral test database`（`ci.yml` 第 48–53 行）。

## 根因

`packages/db/drizzle/0016_supabase_external_identity.sql` 原有三处语句：

```sql
REVOKE ALL ON "<table>" FROM PUBLIC, anon, authenticated;
```

`anon` 与 `authenticated` 是 **Supabase 托管 PostgreSQL 专有角色**。CI 使用的是纯净
`postgres:17-alpine`（`ci.yml` 第 22–31 行），不存在这两个角色，因此迁移在 `0016` 报错：
`ERROR: role "anon" does not exist`，`drizzle-kit migrate` 退出码 1。

经全仓检索确认：`0016` 是**唯一**引用 `anon`/`authenticated` 或执行 RLS/REVOKE 的迁移文件，
仓库内不存在同类先例约定，也没有任何文件引用该迁移的内容哈希（仅引用文件名）。

## 修复

在保留 Supabase 侧安全语义的前提下，把角色级 `REVOKE` 改为**存在性守卫**：

```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "<table>" FROM PUBLIC;
DO $$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "<table>" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "<table>" FROM authenticated';
  END IF;
END $$;
```

对三张表 `auth_external_identities`、`auth_provider_ip_limits`、`auth_provider_account_limits`
分别应用。`FROM PUBLIC` 的撤销保留在守卫之外，因此即使目标库没有 Supabase 角色，
匿名访问也已被关闭。

## 验证证据

在纯净 `postgres:17-alpine` 容器（与 CI 完全一致）上以 **仓库原生命令** 复放：

```
docker run -d --name jx-verify-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=jiuxiao_test -p 55433:5432 postgres:17-alpine
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55433/jiuxiao_test \
  pnpm --filter @jiuxiao/db db:migrate
```

| 场景 | 结果 |
| --- | --- |
| 纯净 PG（无 `anon`/`authenticated`，= CI 环境） | `[✓] migrations applied successfully!` |
| 表数量 | 20 张 |
| 迁移记录 | 17 条（`0000`–`0016`） |
| 三张新表 RLS | 全部 `relrowsecurity = t` |
| 模拟 Supabase（预先 `CREATE ROLE anon/authenticated`） | `[✓] migrations applied successfully!` |
| Supabase 形态下两角色对新表权限 | **0 条**（`REVOKE` 生效） |

两次运行均 `exit 0`。

## 影响范围

- 不改变任何表结构、约束、索引或迁移顺序。
- 不改变 Supabase 生产库上的最终权限状态（角色存在时行为与原语句一致）。
- 仅恢复 CI 在纯净 PostgreSQL 上的可执行性。

## 待办

- 推送后需核验 `main` 的 exact-head CI 通过，并确认此前被跳过的
  typecheck / test / build / integration / e2e 步骤实际执行且结果被记录。
- 本条修复属于工程修复，**不代表任何 S 轨或 P 轨阶段签收**。
