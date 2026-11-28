# 迁移 0030：事件链增量校验检查点（缺陷 4）

> 2026-11-27 在隔离 PostgreSQL 上实测 T1 和 0030 组合。接任修复与证据在[执行台账 §6](../README.md)。

## 内容

- 新表 `turn_event_chain_checkpoints`：每个存档记录最近一次校验通过的链头（`verified_sequence`、`verified_hash`）。只作完整性缓存，不授权任何写入；随 `game_saves` 级联删除。
- 新函数 `verify_turn_event_chain_incremental(text, integer)`：
  - 没有检查点、每第 64 次检查、或调用方强制时，做全链审计（与原 `verify_turn_event_chain` 等价，并额外拒绝“链头被截短”）；
  - 其余情况只重算已记录的链头行和其后新增的行。
  - 失败时检查点不前移，存档持续报 `EVENT_INTEGRITY_FAILED`，直到人工调查。
- 原 `verify_turn_event_chain` 保持不变，仍是无状态的全链审计。
- 权限：表与函数都对 `PUBLIC`、`anon`、`authenticated` 撤销；函数固定 `search_path = pg_catalog, public, pg_temp`（与 0022 一致）。

API 侧：每个 API 进程对每个存档的第一次加载强制全链审计，之后按 64 次一审的间隔增量校验。

## 性质

纯新增（一张表、一个函数、撤权语句），不改已有表、数据或函数。旧 API 镜像在迁移后的库上照常运行（它只调用 `verify_turn_event_chain`）。

## 上线前（生产）

1. 用宿主上的既有方式做一次完整逻辑备份（`pg_dump -Fc`），并在一次性库上 `pg_restore` 验证可恢复。CI 的 `tests/integration/database-restore.mjs` 是同一流程的测试版本。
2. 记录当前 `drizzle.__drizzle_migrations` 的最后一行（应为 0029）。
3. 核对新 API 实际使用的数据库身份。0030 的校验函数按调用者权限执行。迁移所有者与权威回合登录分离时，后者须能执行该函数、读取事件链，并能读取、插入及更新检查点。用该登录验证首次全审、追加事件和增量校验；叙述 worker、operator、erasure 不承担这项职责。隔离 T1 组合测试在测试库中单独模拟这些权限。
4. 先部署迁移，再部署新 API 镜像。

## 回滚

迁移本身可安全保留在库中（旧 API 不使用它）。如需完全撤销：

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.verify_turn_event_chain_incremental(text, integer);
DROP TABLE IF EXISTS public.turn_event_chain_checkpoints;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
COMMIT;
```

执行前确认最后一行确实对应 0030（比对 `created_at` 与 `packages/db/drizzle/meta/_journal.json` 中 0030 的 `when`）。

## 验证记录

见执行台账第 4 节“缺陷 4”一行。
