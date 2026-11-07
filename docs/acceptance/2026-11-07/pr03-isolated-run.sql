\set ON_ERROR_STOP on
SELECT current_database() AS db, current_user AS db_user, current_setting('data_directory') AS data_directory;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE supabase_admin NOLOGIN;
CREATE ROLE app_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT app_owner TO CURRENT_USER;
GRANT CREATE, USAGE ON SCHEMA public TO app_owner;

CREATE TABLE public.synthetic_saves (id integer PRIMARY KEY, note text NOT NULL);
INSERT INTO public.synthetic_saves (id, note) VALUES (1, 'keep-me');
GRANT TRUNCATE ON TABLE public.synthetic_saves TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT TRUNCATE ON TABLES TO anon, authenticated;

\echo '--- before ---'
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'synthetic_saves' AND grantee IN ('anon', 'authenticated')
ORDER BY 1, 2;

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
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;

\echo '--- after schema revoke, before global revoke ---'
CREATE TABLE public.synthetic_after_schema (id integer PRIMARY KEY);
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'synthetic_after_schema' AND grantee = 'anon' AND privilege_type = 'TRUNCATE';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;

\echo '--- after global revoke ---'
CREATE TABLE public.synthetic_after_global (id integer PRIMARY KEY);
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'TRUNCATE'
ORDER BY 1, 2;

\echo '--- repeat ---'
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated, service_role;
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'TRUNCATE'
ORDER BY 1, 2;

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
