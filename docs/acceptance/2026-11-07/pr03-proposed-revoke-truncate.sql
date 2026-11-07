-- Candidate for a later, separately approved production change.
-- This file is not registered in packages/db/drizzle/meta/_journal.json.
-- Do not apply it to Supabase. The production catalog of global default
-- privileges was not re-read successfully, so these statements are not a
-- finished production migration.
--
-- Scope is anon and authenticated only. service_role is intentionally absent.
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin is also absent: the
-- ordinary postgres role cannot change that internal role (SQLSTATE 42501).
--
-- Schema-level and global default privileges are separate pg_default_acl rows.
-- Revoking one does not revoke the other. Existing table grants are a third
-- record and need their own REVOKE.

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
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
