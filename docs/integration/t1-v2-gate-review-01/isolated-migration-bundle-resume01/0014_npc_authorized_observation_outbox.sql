-- S4: retain the exact allowlisted facts visible to an NPC at the time of authorization.
-- This record is mode-neutral and deliberately excludes source event payloads.
CREATE UNIQUE INDEX turn_events_save_id_id_idx ON turn_events(save_id, id);
--> statement-breakpoint
CREATE TABLE npc_authorized_observation_outbox (
  grant_id text PRIMARY KEY,
  save_id text NOT NULL REFERENCES game_saves(id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  npc_id text NOT NULL,
  event_id text NOT NULL,
  event_revision integer NOT NULL,
  observed_at_minute bigint NOT NULL,
  channel text NOT NULL,
  authorization_policy_version text NOT NULL,
  authorized_fields jsonb NOT NULL,
  authorized_facts jsonb NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT npc_authorized_observation_event_fk
    FOREIGN KEY (save_id, event_id) REFERENCES turn_events(save_id, id) ON DELETE CASCADE,
  CONSTRAINT npc_authorized_observation_revision_check CHECK (event_revision > 0),
  CONSTRAINT npc_authorized_observation_minute_check CHECK (observed_at_minute >= 0),
  CONSTRAINT npc_authorized_observation_branch_check CHECK (branch_id = 'root'),
  CONSTRAINT npc_authorized_observation_channel_check CHECK (channel IN ('witnessed', 'reported')),
  CONSTRAINT npc_authorized_observation_fields_check CHECK (jsonb_typeof(authorized_fields) = 'array'),
  CONSTRAINT npc_authorized_observation_facts_check CHECK (jsonb_typeof(authorized_facts) = 'object'),
  CONSTRAINT npc_authorized_observation_text_check CHECK (
    length(grant_id) BETWEEN 1 AND 2000 AND length(npc_id) BETWEEN 1 AND 200
    AND length(authorization_policy_version) BETWEEN 1 AND 200 AND length(summary) BETWEEN 1 AND 4000
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX npc_authorized_observation_identity_idx
  ON npc_authorized_observation_outbox(save_id, branch_id, npc_id, event_id);
--> statement-breakpoint
CREATE INDEX npc_authorized_observation_page_idx
  ON npc_authorized_observation_outbox(save_id, npc_id, event_revision, grant_id);
--> statement-breakpoint
CREATE FUNCTION protect_npc_authorized_observation_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE archive_owner text;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'AUTHORIZED_OBSERVATION_IMMUTABLE'; END IF;
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
  RAISE EXCEPTION 'AUTHORIZED_OBSERVATION_ERASURE_REQUIRED';
END $$;
--> statement-breakpoint
CREATE TRIGGER npc_authorized_observation_outbox_protect
  BEFORE UPDATE OR DELETE ON npc_authorized_observation_outbox
  FOR EACH ROW EXECUTE FUNCTION protect_npc_authorized_observation_outbox();
