-- P1 PR-5: extend the existing event and save projections without rewriting history.
ALTER TABLE turn_events ADD COLUMN branch_id text NOT NULL DEFAULT 'root';
--> statement-breakpoint
ALTER TABLE turn_events ADD CONSTRAINT turn_events_branch_id_check CHECK (branch_id = 'root');
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN memory_mode text;
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN memory_policy jsonb;
--> statement-breakpoint
-- Existing v1 rows have no memory-mode selection. Never infer it from old metadata.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM game_saves WHERE schema_version <> 1) THEN
    RAISE EXCEPTION 'GAME_SAVE_MEMORY_POLICY_BACKFILL_REQUIRED';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE game_saves ADD CONSTRAINT game_saves_memory_policy_check CHECK (
  (
    (schema_version = 1 AND memory_mode IS NULL AND memory_policy IS NULL)
    OR (
      schema_version = 2
      AND memory_mode IN ('continue', 'forgetting')
      AND jsonb_typeof(memory_policy) = 'object'
      AND (memory_policy - ARRAY[
        'mode', 'policyVersion', 'schemaVersion', 'clockBasis', 'policyArtifactHash',
        'cueDictionaryHash', 'normalizerVersion', 'retrievalVersion',
        'visibilityPolicyVersion', 'visibilityPolicyHash', 'createdAtRevision'
      ]) = '{}'::jsonb
      AND memory_policy ?& ARRAY[
        'mode', 'policyVersion', 'schemaVersion', 'clockBasis', 'policyArtifactHash',
        'cueDictionaryHash', 'normalizerVersion', 'retrievalVersion',
        'visibilityPolicyVersion', 'visibilityPolicyHash', 'createdAtRevision'
      ]
      AND memory_policy->>'mode' = memory_mode
      AND memory_policy->>'policyVersion' = memory_policy_version
      AND memory_policy->>'clockBasis' = 'game-minute+npc-grant-sequence-v1'
      AND memory_policy->>'policyArtifactHash' ~ '^sha256:[0-9A-Fa-f]{64}$'
      AND memory_policy->>'cueDictionaryHash' ~ '^sha256:[0-9A-Fa-f]{64}$'
      AND memory_policy->>'visibilityPolicyHash' ~ '^sha256:[0-9A-Fa-f]{64}$'
      AND jsonb_typeof(memory_policy->'schemaVersion') = 'number'
      AND memory_policy->>'schemaVersion' ~ '^[1-9][0-9]{0,15}$'
      AND (memory_policy->>'schemaVersion')::numeric <= 9007199254740991
      AND jsonb_typeof(memory_policy->'createdAtRevision') = 'number'
      AND memory_policy->>'createdAtRevision' ~ '^(0|[1-9][0-9]{0,15})$'
      AND (memory_policy->>'createdAtRevision')::numeric <= 9007199254740991
      AND jsonb_typeof(memory_policy->'policyVersion') = 'string'
      AND length(memory_policy->>'policyVersion') BETWEEN 1 AND 200
      AND jsonb_typeof(memory_policy->'normalizerVersion') = 'string'
      AND length(memory_policy->>'normalizerVersion') BETWEEN 1 AND 200
      AND jsonb_typeof(memory_policy->'retrievalVersion') = 'string'
      AND length(memory_policy->>'retrievalVersion') BETWEEN 1 AND 200
      AND jsonb_typeof(memory_policy->'visibilityPolicyVersion') = 'string'
      AND length(memory_policy->>'visibilityPolicyVersion') BETWEEN 1 AND 200
    )
  ) IS TRUE
);
--> statement-breakpoint
-- A memory policy is pinned when a v2 save is created. V1 stays V1 and keeps its
-- legacy policy-version string without receiving an inferred memory mode.
CREATE FUNCTION protect_game_save_memory_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'SAVE_SCHEMA_VERSION_IMMUTABLE';
  END IF;
  IF OLD.schema_version = 2 AND (
    OLD.memory_mode IS DISTINCT FROM NEW.memory_mode
    OR OLD.memory_policy IS DISTINCT FROM NEW.memory_policy
    OR OLD.memory_policy_version IS DISTINCT FROM NEW.memory_policy_version
  ) THEN
    RAISE EXCEPTION 'SAVE_MEMORY_POLICY_PINNED';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER game_saves_memory_policy_immutable
  BEFORE UPDATE OF schema_version, memory_mode, memory_policy, memory_policy_version ON game_saves
  FOR EACH ROW EXECUTE FUNCTION protect_game_save_memory_policy();
