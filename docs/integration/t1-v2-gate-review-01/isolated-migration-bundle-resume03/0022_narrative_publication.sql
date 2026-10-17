-- Stage 1: presentation only. No NPC grants or changes to RULES events.
CREATE TABLE narrative_context_snapshots (
 id uuid PRIMARY KEY, save_id text NOT NULL, request_key text NOT NULL,
 owner_id text NOT NULL REFERENCES auth_accounts(id), branch_id text NOT NULL CHECK (branch_id='root'),
 receipt_sha text NOT NULL CHECK(receipt_sha ~ '^[a-f0-9]{64}$'),
 context jsonb NOT NULL, context_sha text NOT NULL CHECK(context_sha ~ '^[a-f0-9]{64}$'),
 UNIQUE(save_id,request_key), UNIQUE(id,save_id,request_key),
 FOREIGN KEY(save_id,request_key) REFERENCES turn_requests(save_id,idempotency_key),
 CHECK(context->>'format'='authority-context-v1'),
 CHECK(context->>'policySurface'='p5-narrative'),
 CHECK(context - ARRAY['format','policySurface','receipt','hints','rendererVersion']::text[]='{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE narrative_generation_requests (
 id uuid PRIMARY KEY, context_id uuid NOT NULL, save_id text NOT NULL, request_key text NOT NULL,
 generation_key text NOT NULL CHECK(generation_key='initial-v1'), publication_key text NOT NULL CHECK(publication_key='initial-v1'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','failed','published')),
 lease_epoch integer NOT NULL DEFAULT 0 CHECK(lease_epoch>=0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(save_id,request_key,generation_key), UNIQUE(save_id,request_key,publication_key),
 UNIQUE(id,save_id,request_key), UNIQUE(id,publication_key),
 FOREIGN KEY(context_id,save_id,request_key) REFERENCES narrative_context_snapshots(id,save_id,request_key)
);
--> statement-breakpoint
CREATE TABLE narrative_attempts (
 id uuid PRIMARY KEY, generation_id uuid NOT NULL REFERENCES narrative_generation_requests(id),
 lease_epoch integer NOT NULL CHECK(lease_epoch>0), lease_until timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('running','expired','failed','published')),
 UNIQUE(generation_id,lease_epoch), UNIQUE(id,generation_id)
);
CREATE UNIQUE INDEX narrative_one_running ON narrative_attempts(generation_id) WHERE state='running';
--> statement-breakpoint
CREATE TABLE narrative_sources (
 id uuid PRIMARY KEY, generation_id uuid NOT NULL REFERENCES narrative_generation_requests(id),
 attempt_id uuid NOT NULL UNIQUE, body bytea NOT NULL, body_sha text NOT NULL,
 utf16_length integer NOT NULL CHECK(utf16_length>0), utf8_length integer NOT NULL CHECK(utf8_length>0),
 generator_source text NOT NULL CHECK(generator_source='deterministic'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,generation_id),
 FOREIGN KEY(attempt_id,generation_id) REFERENCES narrative_attempts(id,generation_id),
 CHECK(utf8_length=octet_length(body)), CHECK(body_sha=encode(sha256(body),'hex'))
);
--> statement-breakpoint
CREATE TABLE narrative_publications (
 id uuid PRIMARY KEY, generation_id uuid NOT NULL UNIQUE, source_id uuid NOT NULL UNIQUE,
 save_id text NOT NULL, request_key text NOT NULL, publication_key text NOT NULL,
 version integer NOT NULL CHECK(version=1), is_default boolean NOT NULL CHECK(is_default),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(save_id,request_key,publication_key), UNIQUE(save_id,request_key,version),
 FOREIGN KEY(generation_id,save_id,request_key) REFERENCES narrative_generation_requests(id,save_id,request_key),
 FOREIGN KEY(generation_id,publication_key) REFERENCES narrative_generation_requests(id,publication_key),
 FOREIGN KEY(source_id,generation_id) REFERENCES narrative_sources(id,generation_id)
);
CREATE UNIQUE INDEX narrative_one_default ON narrative_publications(save_id,request_key) WHERE is_default;
--> statement-breakpoint
CREATE TABLE narrative_segments (
 source_id uuid NOT NULL REFERENCES narrative_sources(id), segment_id integer NOT NULL CHECK(segment_id>=0),
 start_utf16 integer NOT NULL CHECK(start_utf16>=0), end_utf16 integer NOT NULL CHECK(end_utf16>start_utf16),
 segment_sha text NOT NULL CHECK(segment_sha ~ '^[a-f0-9]{64}$'),
 audience text NOT NULL CHECK(audience='player_only'), PRIMARY KEY(source_id,segment_id)
);
--> statement-breakpoint
CREATE TABLE source_event_links (
 id uuid PRIMARY KEY, source_id uuid NOT NULL, segment_id integer NOT NULL, save_id text NOT NULL,
 event_id text NOT NULL, kind text NOT NULL CHECK(kind='provenance_only'),
 UNIQUE(source_id,segment_id,event_id),
 FOREIGN KEY(source_id,segment_id) REFERENCES narrative_segments(source_id,segment_id),
 FOREIGN KEY(save_id,event_id) REFERENCES turn_events(save_id,id)
);
--> statement-breakpoint
CREATE TABLE narrative_outbox (
 id uuid PRIMARY KEY, generation_id uuid NOT NULL REFERENCES narrative_generation_requests(id), source_id uuid,
 kind text NOT NULL CHECK(kind IN ('generate','index')), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done')),
 UNIQUE(generation_id,kind), FOREIGN KEY(source_id,generation_id) REFERENCES narrative_sources(id,generation_id),
 CHECK((kind='generate' AND source_id IS NULL) OR (kind='index' AND source_id IS NOT NULL))
);
--> statement-breakpoint
CREATE FUNCTION validate_narrative_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; s record;
BEGIN
 SELECT result INTO r FROM turn_requests WHERE save_id=NEW.save_id AND idempotency_key=NEW.request_key;
 SELECT owner_id,branch_id,revision INTO s FROM game_saves WHERE id=NEW.save_id;
 IF r IS NULL OR r->'decision'->>'status' IS DISTINCT FROM 'accepted'
 OR s.owner_id IS DISTINCT FROM NEW.owner_id OR coalesce(s.branch_id,'root')<>NEW.branch_id
 OR r->>'saveId' IS DISTINCT FROM NEW.save_id OR r->>'idempotencyKey' IS DISTINCT FROM NEW.request_key::text
 OR (r->>'resultingRevision')::integer IS DISTINCT FROM s.revision
 OR NEW.context->'receipt' IS DISTINCT FROM r
 OR NEW.receipt_sha IS DISTINCT FROM encode(sha256(convert_to(r::text,'UTF8')),'hex')
 OR NEW.context_sha IS DISTINCT FROM encode(sha256(convert_to(NEW.context::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'NARRATIVE_RECEIPT_SCOPE_INVALID';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_context_scope BEFORE INSERT ON narrative_context_snapshots FOR EACH ROW EXECUTE FUNCTION validate_narrative_context();
--> statement-breakpoint
CREATE FUNCTION validate_narrative_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM narrative_sources s JOIN narrative_generation_requests g ON g.id=s.generation_id
 JOIN turn_events e ON e.save_id=g.save_id AND e.idempotency_key=g.request_key
 WHERE s.id=NEW.source_id AND g.save_id=NEW.save_id AND e.id=NEW.event_id AND e.source='RULES') THEN
 RAISE EXCEPTION 'NARRATIVE_EVENT_SCOPE_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_link_scope BEFORE INSERT ON source_event_links FOR EACH ROW EXECUTE FUNCTION validate_narrative_link();
--> statement-breakpoint
CREATE FUNCTION narrative_erasure_allowed(row_data jsonb) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE owner_value text;
BEGIN
 IF current_database() ~* '^jiuxiao_test(_[a-z0-9-]+)?$' AND current_setting('jiuxiao.account_erasure_operation',true)='test-cleanup' THEN RETURN true; END IF;
 IF row_data ? 'save_id' THEN SELECT owner_id INTO owner_value FROM game_saves WHERE id=row_data->>'save_id';
 ELSIF row_data ? 'generation_id' THEN SELECT s.owner_id INTO owner_value FROM game_saves s JOIN narrative_generation_requests g ON g.save_id=s.id WHERE g.id::text=row_data->>'generation_id';
 ELSE SELECT v.owner_id INTO owner_value FROM narrative_sources s JOIN narrative_generation_requests g ON g.id=s.generation_id JOIN game_saves v ON v.id=g.save_id WHERE s.id::text=row_data->>'source_id'; END IF;
 RETURN EXISTS(SELECT 1 FROM account_operations o WHERE o.id=current_setting('jiuxiao.account_erasure_operation',true)
  AND o.owner_id=owner_value AND o.operation='delete' AND o.phase='ready' AND o.expires_at>now());
END $$;
--> statement-breakpoint
CREATE FUNCTION protect_narrative_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND narrative_erasure_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'NARRATIVE_IMMUTABLE';
END $$;
CREATE TRIGGER narrative_context_immutable BEFORE UPDATE OR DELETE ON narrative_context_snapshots FOR EACH ROW EXECUTE FUNCTION protect_narrative_immutable();
CREATE TRIGGER narrative_source_immutable BEFORE UPDATE OR DELETE ON narrative_sources FOR EACH ROW EXECUTE FUNCTION protect_narrative_immutable();
CREATE TRIGGER narrative_publication_immutable BEFORE UPDATE OR DELETE ON narrative_publications FOR EACH ROW EXECUTE FUNCTION protect_narrative_immutable();
CREATE TRIGGER narrative_segment_immutable BEFORE UPDATE OR DELETE ON narrative_segments FOR EACH ROW EXECUTE FUNCTION protect_narrative_immutable();
CREATE TRIGGER narrative_link_immutable BEFORE UPDATE OR DELETE ON source_event_links FOR EACH ROW EXECUTE FUNCTION protect_narrative_immutable();
--> statement-breakpoint
CREATE FUNCTION protect_narrative_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT narrative_erasure_allowed(to_jsonb(OLD)) THEN RAISE EXCEPTION 'NARRATIVE_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF TG_TABLE_NAME='narrative_generation_requests' THEN
  IF to_jsonb(NEW)-ARRAY['state','lease_epoch']::text[] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['state','lease_epoch']::text[]
   OR NEW.lease_epoch<OLD.lease_epoch OR OLD.state='published' THEN RAISE EXCEPTION 'NARRATIVE_IMMUTABLE'; END IF;
 ELSIF TG_TABLE_NAME='narrative_outbox' THEN
  IF to_jsonb(NEW)-'state' IS DISTINCT FROM to_jsonb(OLD)-'state' OR OLD.state='done' THEN RAISE EXCEPTION 'NARRATIVE_IMMUTABLE'; END IF;
 ELSE
  IF to_jsonb(NEW)-'state' IS DISTINCT FROM to_jsonb(OLD)-'state' OR OLD.state<>'running' THEN RAISE EXCEPTION 'NARRATIVE_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_generation_identity BEFORE UPDATE OR DELETE ON narrative_generation_requests FOR EACH ROW EXECUTE FUNCTION protect_narrative_identity();
CREATE TRIGGER narrative_attempt_identity BEFORE UPDATE OR DELETE ON narrative_attempts FOR EACH ROW EXECUTE FUNCTION protect_narrative_identity();
CREATE TRIGGER narrative_outbox_identity BEFORE UPDATE OR DELETE ON narrative_outbox FOR EACH ROW EXECUTE FUNCTION protect_narrative_identity();
--> statement-breakpoint
CREATE FUNCTION validate_narrative_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE units bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM narrative_attempts a JOIN narrative_generation_requests g ON g.id=a.generation_id
  WHERE a.id=NEW.attempt_id AND g.id=NEW.generation_id AND a.state='running' AND g.state='running'
  AND a.lease_epoch=g.lease_epoch AND a.lease_until>clock_timestamp()) THEN RAISE EXCEPTION 'NARRATIVE_STALE_ATTEMPT'; END IF;
 SELECT sum(CASE WHEN ascii(ch)>65535 THEN 2 ELSE 1 END) INTO units
 FROM regexp_split_to_table(convert_from(NEW.body,'UTF8'),'') AS ch;
 IF units IS DISTINCT FROM NEW.utf16_length::bigint THEN RAISE EXCEPTION 'NARRATIVE_BODY_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_source_valid BEFORE INSERT ON narrative_sources FOR EACH ROW EXECUTE FUNCTION validate_narrative_source();
--> statement-breakpoint
CREATE FUNCTION validate_narrative_segment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Stage 1 exposes only a full-source player segment. No partial grants implied.
 IF NOT EXISTS(SELECT 1 FROM narrative_sources WHERE id=NEW.source_id
  AND NEW.segment_id=0 AND NEW.start_utf16=0 AND NEW.end_utf16=utf16_length AND NEW.segment_sha=body_sha)
 THEN RAISE EXCEPTION 'NARRATIVE_SEGMENT_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER narrative_segment_valid BEFORE INSERT ON narrative_segments FOR EACH ROW EXECUTE FUNCTION validate_narrative_segment();
