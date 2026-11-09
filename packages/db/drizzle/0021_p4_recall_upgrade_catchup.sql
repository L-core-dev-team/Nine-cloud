-- 0020's frozen journal timestamp predates 0019, so an existing 0019 database skips it.
-- Keep the historical migration immutable. Apply its exact approved schema only when absent.
DO $p4_catchup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.npc_authorized_observation_outbox'::regclass
    AND attname='memory_class' AND NOT attisdropped) THEN
    IF to_regclass('public.npc_memory_observation_supersessions') IS NULL
      OR to_regclass('public.npc_authorized_observation_recall_idx') IS NULL
      OR to_regprocedure('public.validate_npc_memory_observation_supersession()') IS NULL THEN
      RAISE EXCEPTION 'P4_RECALL_SCHEMA_PARTIAL_REQUIRES_REVIEW';
    END IF;
  ELSE
    IF to_regclass('public.npc_memory_observation_supersessions') IS NOT NULL THEN
      RAISE EXCEPTION 'P4_RECALL_SCHEMA_PARTIAL_REQUIRES_REVIEW';
    END IF;
-- P4: preserve the signed semantic distinction between current state, history,
-- subjective belief and unclassified legacy observations. Legacy rows stay
-- unclassified; they are never guessed into a category.
--
-- Numbering note: 0017-0019 are reserved by the P3 branch (codex/p3-zero-config-loop,
-- PR #64), which renumbers its migrations 0017_p2_authority_lineage,
-- 0018_p2_canon_artifact_identity and 0019_p1_guest_accounts. This migration is
-- therefore numbered 0020 and depends on P3 being merged first. Applying it out
-- of order would break the drizzle journal index chain.
ALTER TABLE npc_authorized_observation_outbox
  ADD COLUMN memory_class text NOT NULL DEFAULT 'unclassified';
ALTER TABLE npc_authorized_observation_outbox
  ADD CONSTRAINT npc_authorized_observation_memory_class_check
  CHECK (memory_class IN ('current-state', 'historical-event', 'subjective-belief', 'unclassified'));
CREATE INDEX npc_authorized_observation_recall_idx
  ON npc_authorized_observation_outbox(save_id, branch_id, npc_id, memory_class, event_revision, grant_id);
CREATE TABLE npc_memory_observation_supersessions (
  save_id text NOT NULL REFERENCES game_saves(id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  npc_id text NOT NULL,
  observation_grant_id text NOT NULL REFERENCES npc_authorized_observation_outbox(grant_id) ON DELETE CASCADE,
  superseded_by_event_id text NOT NULL,
  superseded_at_revision integer NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT npc_memory_supersession_pk PRIMARY KEY (observation_grant_id),
  CONSTRAINT npc_memory_supersession_event_fk
    FOREIGN KEY (save_id, superseded_by_event_id) REFERENCES turn_events(save_id, id) ON DELETE CASCADE,
  CONSTRAINT npc_memory_supersession_branch_check CHECK (branch_id = 'root'),
  CONSTRAINT npc_memory_supersession_revision_check CHECK (superseded_at_revision > 1),
  CONSTRAINT npc_memory_supersession_kind_check
    CHECK (kind IN ('premise-revised', 'relation-changed', 'entity-dead', 'item-moved', 'clue-invalid')),
  CONSTRAINT npc_memory_supersession_text_check
    CHECK (length(npc_id) BETWEEN 1 AND 200 AND length(reason) BETWEEN 1 AND 500 AND length(policy_version) BETWEEN 1 AND 200)
);
CREATE INDEX npc_memory_supersession_save_npc_idx
  ON npc_memory_observation_supersessions(save_id, branch_id, npc_id, superseded_by_event_id);
CREATE FUNCTION validate_npc_memory_observation_supersession() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  archive_owner text;
  source_observation npc_authorized_observation_outbox%ROWTYPE;
  superseding_event turn_events%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'AUTHORIZED_MEMORY_SUPERSESSION_IMMUTABLE'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_database() ~* '^jiuxiao_test(_[a-z0-9-]+)?$'
      AND current_setting('jiuxiao.account_erasure_operation', true) = 'test-cleanup' THEN
      RETURN OLD;
    END IF;
    SELECT owner_id INTO archive_owner FROM game_saves WHERE id = OLD.save_id;
    IF EXISTS (
      SELECT 1 FROM account_operations o
      WHERE o.id = current_setting('jiuxiao.account_erasure_operation', true)
        AND o.owner_id = archive_owner AND o.operation = 'delete'
        AND o.phase = 'ready' AND o.expires_at > now()
    ) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'AUTHORIZED_MEMORY_ERASURE_REQUIRED';
  END IF;

  SELECT * INTO source_observation FROM npc_authorized_observation_outbox
    WHERE grant_id = NEW.observation_grant_id;
  SELECT * INTO superseding_event FROM turn_events
    WHERE save_id = NEW.save_id AND id = NEW.superseded_by_event_id;
  IF source_observation.grant_id IS NULL OR superseding_event.id IS NULL
    OR source_observation.save_id <> NEW.save_id
    OR source_observation.branch_id <> NEW.branch_id
    OR source_observation.npc_id <> NEW.npc_id
    OR source_observation.memory_class <> 'current-state'
    OR superseding_event.branch_id <> NEW.branch_id
    OR superseding_event.source <> 'RULES'
    OR superseding_event.after_revision <> NEW.superseded_at_revision
    OR superseding_event.after_revision <= source_observation.event_revision THEN
    RAISE EXCEPTION 'AUTHORIZED_MEMORY_SUPERSESSION_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER npc_memory_observation_supersessions_protect
  BEFORE INSERT OR UPDATE OR DELETE ON npc_memory_observation_supersessions
  FOR EACH ROW EXECUTE FUNCTION validate_npc_memory_observation_supersession();

  END IF;
END $p4_catchup$;
