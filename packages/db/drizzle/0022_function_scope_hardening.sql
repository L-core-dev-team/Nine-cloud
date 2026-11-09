-- Pin only application integrity functions; do not change bodies, policies or data.
-- pg_temp is explicit and last so temporary objects cannot precede public tables.
DO $function_scope$
DECLARE target record; role_name text;
BEGIN
  FOR target IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'reject_entitlement_ledger_mutation','reject_turn_event_update','guard_game_saves_update',
      'reject_protected_archive_delete','turn_event_digest','append_turn_event_hash',
      'verify_turn_event_chain','protect_npc_authorized_observation_outbox',
      'protect_game_save_memory_policy','validate_npc_memory_observation_supersession'
    )
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = pg_catalog, public, pg_temp',
      target.nspname, target.proname, target.arguments);
  END LOOP;
  -- Supabase's event trigger is not a public RPC. The function owner retains
  -- its implicit rights and the installed event trigger is left intact.
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $function_scope$;
