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
