\set ON_ERROR_STOP on

-- Stop before any role, table, or privilege change. Printing identity is not a guard.
DO $$
DECLARE
  db text := current_database();
  dir text := current_setting('data_directory');
  addr inet := inet_server_addr();
BEGIN
  IF db !~ '^jiuxiao_isolated_' THEN
    RAISE EXCEPTION 'refusing writes: database % does not use the jiuxiao_isolated_ prefix', db;
  END IF;
  IF dir IS DISTINCT FROM '/var/lib/postgresql/data' THEN
    RAISE EXCEPTION 'refusing writes: data directory % is not the controlled local container directory', dir;
  END IF;
  IF addr IS NOT NULL AND NOT (addr << inet '127.0.0.0/8' OR addr = inet '::1') THEN
    RAISE EXCEPTION 'refusing writes: server address % is not loopback', addr;
  END IF;
END $$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE supabase_admin NOLOGIN;
CREATE ROLE app_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT app_owner TO CURRENT_USER;
GRANT CREATE, USAGE ON SCHEMA public TO app_owner;

CREATE TABLE public.synthetic_saves (id integer PRIMARY KEY, note text NOT NULL);
INSERT INTO public.synthetic_saves (id, note) VALUES (1, 'keep-me');
GRANT TRUNCATE ON TABLE public.synthetic_saves TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT TRUNCATE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT TRUNCATE ON TABLES TO anon, authenticated, service_role;

\echo '--- before ---'
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'synthetic_saves'
  AND grantee IN ('anon', 'authenticated', 'service_role') AND privilege_type = 'TRUNCATE'
ORDER BY 1;

SET ROLE app_owner;
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated';
  RAISE EXCEPTION 'supabase_admin change unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'supabase_admin_sqlstate=%', SQLSTATE;
END $$;
RESET ROLE;

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

\echo '--- after schema-only revoke ---'
CREATE TABLE public.synthetic_after_schema (id integer PRIMARY KEY);
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'synthetic_after_schema'
  AND grantee IN ('anon', 'service_role') AND privilege_type = 'TRUNCATE'
ORDER BY 2;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

\echo '--- after anon/authenticated global revoke; service_role remains ---'
CREATE TABLE public.synthetic_after_global (id integer PRIMARY KEY);
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('synthetic_saves', 'synthetic_after_schema', 'synthetic_after_global')
  AND grantee IN ('anon', 'authenticated', 'service_role') AND privilege_type = 'TRUNCATE'
ORDER BY 1, 2;

\echo '--- repeat narrowed statements ---'
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

\echo '--- anon truncate attempt ---'
SET ROLE anon;
DO $$
BEGIN
  EXECUTE 'TRUNCATE TABLE public.synthetic_saves';
  RAISE EXCEPTION 'truncate unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'anon_truncate_sqlstate=%', SQLSTATE;
END $$;
RESET ROLE;

SELECT id, note FROM public.synthetic_saves ORDER BY id;
