-- REVIEW PROPOSAL ONLY. Not registered in Drizzle journal, never executed by this task.
-- Run only after separately approved migration, lifecycle/export and fleet cutover review.
CREATE TABLE narrative_writer_fence (
 singleton boolean PRIMARY KEY CHECK(singleton), protocol_version integer NOT NULL CHECK(protocol_version=2),
 phase text NOT NULL CHECK(phase IN ('fenced','managed')), fleet_manifest_sha text NOT NULL,
 renderer_version text NOT NULL CHECK(length(renderer_version)>0),
 old_writer_drained boolean NOT NULL DEFAULT false, old_role_revoked boolean NOT NULL DEFAULT false,
 valid_until timestamptz NOT NULL
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
CREATE FUNCTION verify_narrative_ownership_v2() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE FUNCTION protect_narrative_ownership_v2() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'generation_id') IS DISTINCT FROM (to_jsonb(OLD)-'generation_id')
   OR OLD.generation_id IS NOT NULL OR NEW.generation_id IS NULL OR OLD.ownership<>'managed') THEN
   RAISE EXCEPTION 'NARRATIVE_OWNERSHIP_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' AND coalesce(current_setting('jiuxiao.account_erasure_operation',true),'')='' THEN
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
