-- Executable only by the role that owns the tables and granted the defaults.
-- Do not run this against Supabase or any non-local database.
-- Do not register it in packages/db/drizzle/meta/_journal.json.
--
-- The previous draft also contained:
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...
-- Supabase documents that the project postgres role cannot change default
-- privileges owned by the internal supabase_admin role (SQLSTATE 42501).
-- That statement is intentionally absent. It is not an optional extra step.
--
-- Schema-level default privileges and global default privileges are separate
-- rows in pg_default_acl. Revoking one does not revoke the other.

REVOKE TRUNCATE ON TABLE
  public.account_lifecycle_audit,
  public.account_operations,
  public.account_rate_limits,
  public.archive_retention_purge_receipts,
  public.auth_accounts,
  public.auth_challenges,
  public.auth_ip_mail_limits,
  public.auth_mail_limits,
  public.auth_sessions,
  public.cloud_archive_trash,
  public.entitlement_balances,
  public.entitlement_ledger_entries,
  public.game_saves,
  public.npc_authorized_observation_outbox,
  public.npc_memory_journals,
  public.npc_memory_observation_supersessions,
  public.turn_events,
  public.turn_requests
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;
