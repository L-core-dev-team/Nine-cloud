-- TEST_ONLY: synthetic prototype, not an approved migration or production authorization.
-- Shared runtime DB login cannot independently authenticate the owner parameter.
GRANT USAGE ON SCHEMA public TO jiuxiao_test_lock_owner;
GRANT SELECT ON public.auth_accounts,public.game_saves,public.cloud_archive_trash TO jiuxiao_test_lock_owner;
GRANT UPDATE (id) ON public.auth_accounts,public.game_saves TO jiuxiao_test_lock_owner;
CREATE FUNCTION public.ljx_test_lifecycle_read_lock(owner_arg text,save_arg text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM id FROM public.auth_accounts WHERE id=owner_arg AND closed_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM id FROM public.game_saves s WHERE s.id=save_arg AND s.owner_id=owner_arg
   AND NOT EXISTS (SELECT 1 FROM public.cloud_archive_trash t WHERE t.save_id=s.id) FOR SHARE;
 RETURN FOUND;
END $$;
ALTER FUNCTION public.ljx_test_lifecycle_read_lock(text,text) OWNER TO jiuxiao_test_lock_owner;
REVOKE ALL ON FUNCTION public.ljx_test_lifecycle_read_lock(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ljx_test_lifecycle_read_lock(text,text) TO jiuxiao_narrative_runtime;

