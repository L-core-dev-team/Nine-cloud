-- Presentation archive only. No rule event, receipt or NPC grant is changed.
CREATE TABLE story_narratives (
 save_id text NOT NULL,
 idempotency_key text NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 narrative_text text NOT NULL CHECK (char_length(narrative_text) > 0 AND octet_length(narrative_text) <= 400000),
 source text NOT NULL CHECK (source IN ('model','deterministic')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (save_id,idempotency_key),
 FOREIGN KEY (save_id,idempotency_key) REFERENCES turn_requests(save_id,idempotency_key) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX story_narratives_revision_idx ON story_narratives(save_id,revision);
--> statement-breakpoint
CREATE FUNCTION reject_story_narrative_update() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'STORY_NARRATIVE_IMMUTABLE'; END;
$$;
--> statement-breakpoint
CREATE TRIGGER story_narrative_no_update BEFORE UPDATE ON story_narratives FOR EACH ROW EXECUTE FUNCTION reject_story_narrative_update();
