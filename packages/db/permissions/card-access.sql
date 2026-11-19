-- Explicit card-role installation. Run by the trusted schema installer after 0025.
-- Pre-provision these NOLOGIN group roles and their separate logins. This script
-- only adds object permissions; it never creates identities or grants membership.
DO $acl$
DECLARE
  target regrole;
  login_role record;
  name text;
  eraser constant text := 'jiuxiao_card_erasure';
  runtime constant text := 'jiuxiao_card_runtime';
  companion text;
  prior_path text := current_setting('search_path');
  owner_id oid := (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='card_import');
BEGIN
  PERFORM set_config('search_path','pg_catalog,pg_temp',true);
  IF owner_id IS NULL OR owner_id<>current_user::regrole::oid THEN RAISE EXCEPTION 'CARD_SCHEMA_INSTALLER_REQUIRED'; END IF;
  FOREACH name IN ARRAY ARRAY[runtime,eraser] LOOP
    target:=to_regrole(name);
    IF target IS NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE oid=target AND rolcanlogin) THEN
      RAISE EXCEPTION 'CARD_DEDICATED_NOLOGIN_GROUP_REQUIRED';
    END IF;
    -- A real account deletion login may additionally inherit the approved
    -- narrative erasure group; the ordinary application may inherit narrative
    -- runtime. No other inherited privilege groups are accepted.
    companion:=CASE WHEN name=runtime THEN 'jiuxiao_narrative_runtime' ELSE 'jiuxiao_narrative_erasure' END;
    FOR login_role IN WITH RECURSIVE members(id) AS (
      SELECT target::oid UNION SELECT m.member FROM pg_auth_members m JOIN members p ON m.roleid=p.id
    ) SELECT r.* FROM members JOIN pg_roles r ON r.oid=members.id LOOP
      IF login_role.rolsuper OR login_role.rolcreaterole OR login_role.rolbypassrls OR login_role.rolreplication OR login_role.rolcreatedb OR
         pg_has_role(login_role.oid,owner_id,'MEMBER') OR
         EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname IN ('card_import','public') AND pg_has_role(login_role.oid,c.relowner,'MEMBER')) OR
         EXISTS (SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
           WHERE n.nspname IN ('card_import','public') AND f.prosecdef AND pg_has_role(login_role.oid,f.proowner,'MEMBER')) OR
         has_database_privilege(login_role.oid,current_database(),'CREATE') OR
         has_schema_privilege(login_role.oid,'card_import','CREATE') OR
         has_schema_privilege(login_role.oid,'public','CREATE') OR
         EXISTS (SELECT 1 FROM pg_roles high WHERE high.oid<>login_role.oid AND high.oid<>target
           AND pg_has_role(login_role.oid,high.oid,'MEMBER')
           AND (high.rolname<>companion OR high.rolcanlogin OR high.rolsuper OR high.rolcreatedb
                OR high.rolcreaterole OR high.rolreplication OR high.rolbypassrls)) OR
         EXISTS (SELECT 1 FROM pg_auth_members WHERE member=login_role.oid AND admin_option) THEN
        RAISE EXCEPTION 'CARD_ROLE_INHERITS_UNEXPECTED_AUTHORITY';
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE oid=target AND rolsuper) OR
       EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE m.roleid=target AND r.rolsuper) THEN
      RAISE EXCEPTION 'CARD_ROLE_MUST_BE_UNPRIVILEGED';
    END IF;
  END LOOP;
  GRANT USAGE ON SCHEMA card_import TO jiuxiao_card_runtime,jiuxiao_card_erasure;
  GRANT SELECT ON card_import.cards,card_import.imports,card_import.links,card_import.sessions,card_import.personas,
    card_import.persona_versions,card_import.session_personas,card_import.global_worldbooks,card_import.session_worldbooks,
    card_import.duplicate_requests,card_import.requests,card_import.group_participants,card_import.group_participant_worldbooks,
    card_import.group_turns,card_import.group_messages,card_import.group_settings,card_import.model_allowances TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,id,sha256,kind,filename,original,parsed,error) ON card_import.imports TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,id,import_id,parent_id,metadata),UPDATE(metadata) ON card_import.cards TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,card_id,import_id,uri) ON card_import.links TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,id,card_id,greeting_index,recursive_worldbook),UPDATE(revision) ON card_import.sessions TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,id),UPDATE(is_default) ON card_import.personas TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,id,persona_id,name,description,extensions) ON card_import.persona_versions TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,version_id) ON card_import.session_personas TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,import_id) ON card_import.global_worldbooks TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,import_id) ON card_import.session_worldbooks TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,key,fingerprint,card_id) ON card_import.duplicate_requests TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,key,fingerprint,expected_revision,action,status,expires_at,model_snapshot),
    UPDATE(status,narrative,error,resulting_revision) ON card_import.requests TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,id,card_id,ordinal,display_name) ON card_import.group_participants TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,participant_id,import_id) ON card_import.group_participant_worldbooks TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,key,mode,selected) ON card_import.group_turns TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,key,ordinal,participant_id,body) ON card_import.group_messages TO jiuxiao_card_runtime;
  GRANT INSERT(owner_id,session_id,strategy),UPDATE(strategy) ON card_import.group_settings TO jiuxiao_card_runtime;
  GRANT INSERT(approval_id,binding,used),UPDATE(used) ON card_import.model_allowances TO jiuxiao_card_runtime;
  GRANT INSERT(approval_id,owner_id,session_id,key) ON card_import.model_calls TO jiuxiao_card_runtime;
  GRANT DELETE ON card_import.cards,card_import.imports,card_import.sessions,card_import.personas,
    card_import.persona_versions,card_import.global_worldbooks TO jiuxiao_card_runtime;
  FOREACH name IN ARRAY ARRAY['group_settings','group_messages','group_turns','group_participant_worldbooks','group_participants',
    'requests','session_worldbooks','session_personas','sessions','persona_versions','personas','global_worldbooks',
    'duplicate_requests','links','cards','imports','model_calls'] LOOP
    EXECUTE format('GRANT DELETE,SELECT(owner_id) ON card_import.%I TO jiuxiao_card_erasure',name);
  END LOOP;
  -- These columns exist only once the M3 outcome migration has been installed.
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='card_import.model_calls'::regclass AND attname='outcome' AND NOT attisdropped) THEN
    GRANT UPDATE(outcome),SELECT(approval_id,owner_id,session_id,key,outcome) ON card_import.model_calls TO jiuxiao_card_runtime;
  END IF;
  -- An inherited or earlier direct grant must not silently turn column-limited
  -- grants into authority to reset consumption or overwrite immutable originals.
  FOR login_role IN SELECT * FROM pg_roles r WHERE NOT r.rolsuper AND pg_has_role(r.oid,runtime,'MEMBER') LOOP
    IF has_table_privilege(login_role.oid,'card_import.model_calls','DELETE,TRUNCATE')
      OR has_table_privilege(login_role.oid,'card_import.model_allowances','DELETE,TRUNCATE')
      OR has_column_privilege(login_role.oid,'card_import.imports','original','UPDATE')
      OR has_column_privilege(login_role.oid,'card_import.model_allowances','binding','UPDATE') THEN
      RAISE EXCEPTION 'CARD_EXISTING_EXCESS_PRIVILEGES';
    END IF;
  END LOOP;
  PERFORM set_config('search_path',prior_path,true);
END $acl$;
