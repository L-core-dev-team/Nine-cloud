-- REVIEW PROPOSAL ONLY. Registered only in an isolated development migration bundle.
-- No production journal/signature changes. Roles must be provisioned by a separate administrator.
DO $$ BEGIN
 IF to_regrole('jiuxiao_narrative_operator') IS NULL OR to_regrole('jiuxiao_narrative_erasure') IS NULL
 OR to_regrole('jiuxiao_narrative_schema_owner') IS NULL THEN RAISE EXCEPTION 'NARRATIVE_SECURITY_ROLES_REQUIRED'; END IF;
END $$;
CREATE TABLE narrative_writer_fence (
 singleton boolean PRIMARY KEY CHECK(singleton), protocol_version integer NOT NULL CHECK(protocol_version=2),
 phase text NOT NULL CHECK(phase IN ('fenced','managed')), fleet_manifest_sha text NOT NULL,
 renderer_version text NOT NULL CHECK(length(renderer_version)>0),
 old_writer_drained boolean NOT NULL DEFAULT false, old_role_revoked boolean NOT NULL DEFAULT false,
 valid_until timestamptz NOT NULL,
 retired_roles text[] NOT NULL DEFAULT '{}', drain_evidence_sha text,
 attested_by text, attested_at timestamptz
);
-- Deliberately no enabled row. The application role must have SELECT only, no gate write rights.
CREATE TABLE narrative_receipt_ownership (
 owner_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 save_id text NOT NULL, request_key text NOT NULL, receipt_sha text NOT NULL CHECK(receipt_sha ~ '^[a-f0-9]{64}$'),
 protocol_version integer NOT NULL CHECK(protocol_version IN (1,2)),
 ownership text NOT NULL CHECK(ownership IN ('managed','suppressed','legacy')),
 request_narrative boolean NOT NULL, renderer_version text NOT NULL, context_version text NOT NULL,
 branch_id text NOT NULL CHECK(branch_id='root'), generation_id uuid REFERENCES narrative_generation_requests(id)
 DEFERRABLE INITIALLY DEFERRED,
 legacy_inventory_sha text, legacy_body bytea, legacy_body_sha text,
 legacy_generator_source text CHECK(legacy_generator_source IN ('model','deterministic')),
 PRIMARY KEY(save_id,request_key), UNIQUE(owner_id,save_id,request_key,receipt_sha),
 FOREIGN KEY(save_id,request_key) REFERENCES turn_requests(save_id,idempotency_key) ON DELETE CASCADE,
 CHECK ((ownership='managed' AND request_narrative AND protocol_version=2)
   OR (ownership='suppressed' AND NOT request_narrative AND protocol_version=2 AND generation_id IS NULL)
   OR (ownership='legacy' AND protocol_version=1 AND generation_id IS NULL AND legacy_inventory_sha IS NOT NULL AND legacy_inventory_sha ~ '^[a-f0-9]{64}$')),
 CHECK(ownership='legacy' OR (legacy_body IS NULL AND legacy_body_sha IS NULL AND legacy_inventory_sha IS NULL AND legacy_generator_source IS NULL)),
 CHECK((legacy_body IS NULL AND legacy_body_sha IS NULL) OR
   (legacy_body IS NOT NULL AND legacy_body_sha IS NOT NULL AND legacy_generator_source IS NOT NULL AND legacy_body_sha=encode(sha256(legacy_body),'hex')))
);
CREATE FUNCTION verify_narrative_ownership_v2() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o narrative_receipt_ownership; BEGIN
 SELECT * INTO o FROM narrative_receipt_ownership WHERE save_id=NEW.save_id AND request_key=NEW.request_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM game_saves s JOIN turn_requests r ON r.save_id=s.id
   WHERE s.id=o.save_id AND s.owner_id=o.owner_id AND r.idempotency_key=o.request_key
   AND o.receipt_sha=encode(sha256(convert_to(r.result::text,'UTF8')),'hex')) THEN
   RAISE EXCEPTION 'NARRATIVE_OWNERSHIP_IDENTITY_INVALID'; END IF;
 IF o.ownership='managed' AND NOT EXISTS(
   SELECT 1 FROM narrative_generation_requests g JOIN narrative_context_snapshots c ON c.id=g.context_id
   WHERE g.id=o.generation_id AND g.save_id=o.save_id AND g.request_key=o.request_key
   AND c.owner_id=o.owner_id AND c.receipt_sha=o.receipt_sha AND c.branch_id=o.branch_id
   AND c.context->>'rendererVersion'=o.renderer_version AND c.context->>'format'=o.context_version) THEN
   RAISE EXCEPTION 'NARRATIVE_MANAGED_INTEGRITY_FAILURE'; END IF;
 IF o.ownership IN ('suppressed','legacy') AND EXISTS(SELECT 1 FROM narrative_generation_requests
   WHERE save_id=o.save_id AND request_key=o.request_key) THEN RAISE EXCEPTION 'NARRATIVE_WRITER_CONFLICT'; END IF;
 RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER narrative_ownership_v2_complete AFTER INSERT OR UPDATE
 ON narrative_receipt_ownership DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_narrative_ownership_v2();
CREATE FUNCTION protect_narrative_ownership_v2() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'generation_id') IS DISTINCT FROM (to_jsonb(OLD)-'generation_id')
   OR OLD.generation_id IS NOT NULL OR NEW.generation_id IS NULL OR OLD.ownership<>'managed') THEN
   RAISE EXCEPTION 'NARRATIVE_OWNERSHIP_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' AND NOT narrative_erasure_allowed(to_jsonb(OLD)) THEN
   RAISE EXCEPTION 'NARRATIVE_AUTHORIZED_ERASURE_REQUIRED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER narrative_ownership_v2_immutable BEFORE UPDATE OR DELETE ON narrative_receipt_ownership
 FOR EACH ROW EXECUTE FUNCTION protect_narrative_ownership_v2();
-- Deployment role plan: application may SELECT/INSERT ownership, UPDATE(generation_id) only;
-- no legacy import, gate writes, DDL, replication-role or trigger disable privileges.
-- Legacy inventory importer must be a separate offline role, revoked before traffic opens.
-- Gate updates require an operator role after externally verifying full fleet and draining ingress.
-- No backfill based on missing G or timestamps. Legacy inventory import is an offline, separately reviewed step.

CREATE FUNCTION seal_narrative_receipt_v2() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; owner_value text; revision_value integer; BEGIN
 -- A physical no-op version write serializes receipt changes against ownership admission.
 -- It does not change result, revision, timestamps, fingerprint or other logical data.
 -- Under REPEATABLE READ a stale concurrent writer receives serialization failure.
 UPDATE public.turn_requests SET narrative_updated_at=narrative_updated_at
 WHERE save_id=NEW.save_id AND idempotency_key=NEW.request_key RETURNING result INTO r;
 SELECT owner_id,revision INTO owner_value,revision_value FROM public.game_saves WHERE id=NEW.save_id;
 IF r IS NULL OR r->'decision'->>'status' IS DISTINCT FROM 'accepted'
  OR owner_value IS DISTINCT FROM NEW.owner_id OR r->>'saveId' IS DISTINCT FROM NEW.save_id
  OR r->>'idempotencyKey' IS DISTINCT FROM NEW.request_key
  OR (r->>'resultingRevision')::integer>revision_value
  OR NEW.receipt_sha IS DISTINCT FROM encode(sha256(convert_to(r::text,'UTF8')),'hex')
 THEN RAISE EXCEPTION 'NARRATIVE_OWNERSHIP_IDENTITY_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_ownership_receipt_seal_v2 BEFORE INSERT ON narrative_receipt_ownership
 FOR EACH ROW EXECUTE FUNCTION seal_narrative_receipt_v2();

-- Reverse writes must already have a managed declaration. An absent/uncommitted declaration is
-- rejected, never guessed legacy. Existing 0022 rows remain untouched and read-only until reviewed.
-- This ordering prevents write skew even under REPEATABLE READ: a suppressed/legacy row cannot
-- ever be the declaration required by a new context/G, and the unique request key prevents replacement.
CREATE FUNCTION require_narrative_managed_declaration_v2() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public AS $$
DECLARE o public.narrative_receipt_ownership; BEGIN
 SELECT * INTO o FROM public.narrative_receipt_ownership
 WHERE save_id=NEW.save_id AND request_key=NEW.request_key FOR KEY SHARE;
 IF NOT FOUND OR o.ownership<>'managed' OR o.protocol_version<>2 OR NOT o.request_narrative THEN
   RAISE EXCEPTION 'NARRATIVE_MANAGED_DECLARATION_REQUIRED'; END IF;
 IF TG_TABLE_NAME='narrative_context_snapshots' THEN
  IF NEW.owner_id IS DISTINCT FROM o.owner_id OR NEW.receipt_sha IS DISTINCT FROM o.receipt_sha
   OR NEW.branch_id IS DISTINCT FROM o.branch_id OR NEW.context->>'rendererVersion' IS DISTINCT FROM o.renderer_version
   OR NEW.context->>'format' IS DISTINCT FROM o.context_version THEN RAISE EXCEPTION 'NARRATIVE_OWNERSHIP_IDENTITY_INVALID'; END IF;
 ELSE
  IF o.generation_id IS NOT NULL AND o.generation_id<>NEW.id THEN RAISE EXCEPTION 'NARRATIVE_MANAGED_INTEGRITY_FAILURE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.narrative_context_snapshots c WHERE c.id=NEW.context_id
   AND c.save_id=o.save_id AND c.request_key=o.request_key AND c.owner_id=o.owner_id AND c.receipt_sha=o.receipt_sha
   AND c.branch_id=o.branch_id AND c.context->>'rendererVersion'=o.renderer_version AND c.context->>'format'=o.context_version)
   THEN RAISE EXCEPTION 'NARRATIVE_MANAGED_INTEGRITY_FAILURE'; END IF;
  IF TG_OP='UPDATE' AND OLD.state='failed' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)
   THEN RAISE EXCEPTION 'NARRATIVE_FAILED_TERMINAL'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_context_managed_v2 BEFORE INSERT ON narrative_context_snapshots
 FOR EACH ROW EXECUTE FUNCTION require_narrative_managed_declaration_v2();
CREATE TRIGGER narrative_generation_managed_v2 BEFORE INSERT OR UPDATE ON narrative_generation_requests
 FOR EACH ROW EXECUTE FUNCTION require_narrative_managed_declaration_v2();

CREATE FUNCTION protect_owned_receipt_v2() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF NEW.result IS DISTINCT FROM OLD.result AND EXISTS(SELECT 1 FROM public.narrative_receipt_ownership
   WHERE save_id=OLD.save_id AND request_key=OLD.idempotency_key) THEN RAISE EXCEPTION 'NARRATIVE_OWNED_RECEIPT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_owned_receipt_immutable_v2 BEFORE UPDATE ON turn_requests
 FOR EACH ROW EXECUTE FUNCTION protect_owned_receipt_v2();

-- A custom GUC is an operation selector, never an authorization capability. In particular,
-- the old test-cleanup exception is unavailable after this migration, even on a test-named DB.
CREATE OR REPLACE FUNCTION narrative_erasure_allowed(row_data jsonb) RETURNS boolean LANGUAGE plpgsql
 SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner_value text; BEGIN
 IF NOT pg_has_role(session_user,'jiuxiao_narrative_erasure','MEMBER') THEN RETURN false; END IF;
 IF row_data ? 'owner_id' THEN owner_value=row_data->>'owner_id';
 ELSIF row_data ? 'save_id' THEN SELECT owner_id INTO owner_value FROM public.game_saves WHERE id=row_data->>'save_id';
 ELSIF row_data ? 'generation_id' THEN SELECT s.owner_id INTO owner_value FROM public.game_saves s
  JOIN public.narrative_generation_requests g ON g.save_id=s.id WHERE g.id::text=row_data->>'generation_id';
 ELSE SELECT v.owner_id INTO owner_value FROM public.narrative_sources s JOIN public.narrative_generation_requests g ON g.id=s.generation_id
  JOIN public.game_saves v ON v.id=g.save_id WHERE s.id::text=row_data->>'source_id'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.account_operations o WHERE o.id=current_setting('jiuxiao.account_erasure_operation',true)
   AND o.owner_id=owner_value AND o.operation='delete' AND o.phase='ready' AND o.expires_at>clock_timestamp());
END $$;
GRANT SELECT ON game_saves,narrative_generation_requests,narrative_sources,account_operations TO jiuxiao_narrative_schema_owner;
ALTER FUNCTION narrative_erasure_allowed(jsonb) OWNER TO jiuxiao_narrative_schema_owner;

CREATE FUNCTION protect_narrative_writer_fence_v2() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,public AS $$
DECLARE retired text; tbl text; BEGIN
 IF NOT pg_has_role(session_user,'jiuxiao_narrative_operator','MEMBER') THEN RAISE EXCEPTION 'NARRATIVE_OPERATOR_REQUIRED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.phase='managed' THEN
  IF NOT NEW.old_writer_drained OR NOT NEW.old_role_revoked OR NEW.fleet_manifest_sha !~ '^[a-f0-9]{64}$'
    OR NEW.drain_evidence_sha IS NULL OR NEW.drain_evidence_sha !~ '^[a-f0-9]{64}$'
    OR cardinality(NEW.retired_roles)=0 OR NEW.valid_until<=clock_timestamp() THEN RAISE EXCEPTION 'NARRATIVE_CUTOVER_PROOF_REQUIRED'; END IF;
  FOREACH retired IN ARRAY NEW.retired_roles LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=retired AND NOT rolcanlogin AND NOT rolsuper
    AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=retired)
    OR has_schema_privilege(retired,'public','CREATE') THEN RAISE EXCEPTION 'NARRATIVE_OLD_ROLE_NOT_DRAINED'; END IF;
   FOREACH tbl IN ARRAY ARRAY['game_saves','turn_requests','turn_events','narrative_context_snapshots',
     'narrative_generation_requests','narrative_attempts','narrative_sources','narrative_publications',
     'narrative_segments','source_event_links','narrative_outbox','narrative_receipt_ownership','narrative_writer_fence'] LOOP
    IF has_table_privilege(retired,'public.'||tbl,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
     THEN RAISE EXCEPTION 'NARRATIVE_OLD_ROLE_STILL_PRIVILEGED'; END IF;
   END LOOP;
  END LOOP;
 END IF;
 NEW.attested_by=session_user;NEW.attested_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER narrative_fence_operator_v2 BEFORE INSERT OR UPDATE OR DELETE ON narrative_writer_fence
 FOR EACH ROW EXECUTE FUNCTION protect_narrative_writer_fence_v2();
ALTER TABLE narrative_writer_fence OWNER TO jiuxiao_narrative_schema_owner;
ALTER TABLE narrative_receipt_ownership OWNER TO jiuxiao_narrative_schema_owner;
REVOKE ALL ON narrative_writer_fence,narrative_receipt_ownership FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO jiuxiao_narrative_schema_owner,jiuxiao_narrative_operator,jiuxiao_narrative_erasure;
GRANT SELECT,INSERT,UPDATE,DELETE ON narrative_writer_fence TO jiuxiao_narrative_operator;

-- PostgreSQL row locks require UPDATE privileges. Expose only a fixed read/lock operation,
-- so runtime connections retain SELECT-only table privileges and cannot attest a cutover.
CREATE FUNCTION public.lock_narrative_writer_fence_v2(expected_renderer text)
 RETURNS TABLE(protocol_version integer) LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $$ BEGIN
 RETURN QUERY SELECT f.protocol_version FROM public.narrative_writer_fence f
 WHERE f.singleton AND f.phase='managed' AND f.protocol_version=2
 AND f.old_writer_drained AND f.old_role_revoked AND f.fleet_manifest_sha ~ '^[a-f0-9]{64}$'
 AND f.renderer_version=expected_renderer AND f.valid_until>clock_timestamp() FOR SHARE;
END $$;
ALTER FUNCTION public.lock_narrative_writer_fence_v2(text) OWNER TO jiuxiao_narrative_schema_owner;
