-- Optional installer step, after 0026, only for the dedicated erasure login's NOLOGIN role.
-- Do not assign this role or SELECT on the delivery queue to ordinary players/runtime.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jiuxiao_narrative_erasure'
       AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'ERASURE_ROLE_REQUIRED';
  END IF;
END $$;
DROP POLICY IF EXISTS erasure_delivery_worker ON public.account_erasure_delivery;
CREATE POLICY erasure_delivery_worker ON public.account_erasure_delivery TO jiuxiao_narrative_erasure
 USING (true) WITH CHECK (true);
GRANT SELECT, INSERT(operation_id,subject_digest,pending_subject,state,policy_version),
 UPDATE(state,attempts,pending_subject,completed_at) ON public.account_erasure_delivery TO jiuxiao_narrative_erasure;

-- The real Supabase adapter reads identity mappings before their cascading
-- deletion, including other owners to reject a shared provider subject.
-- A table GRANT alone cannot expose rows when 0016's RLS is enabled.
DROP POLICY IF EXISTS erasure_external_identity_read ON public.auth_external_identities;
CREATE POLICY erasure_external_identity_read ON public.auth_external_identities
 FOR SELECT TO jiuxiao_narrative_erasure USING (true);
GRANT SELECT(provider_subject,owner_id) ON public.auth_external_identities
 TO jiuxiao_narrative_erasure;
