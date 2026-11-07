-- Proposal only. This file is not registered in packages/db/drizzle/meta/_journal.json.
-- Run it only on a new local database whose host is 127.0.0.1 and whose name
-- starts with jiuxiao_isolated_. Do not point it at Supabase or production.

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
