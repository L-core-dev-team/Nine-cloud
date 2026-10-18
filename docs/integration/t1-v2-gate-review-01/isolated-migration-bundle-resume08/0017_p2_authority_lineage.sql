-- P2: add explicit save lineage and versioned, portable authorization grant IDs.
-- Legacy v1/v2 rows retain NULL lineage; no branch or migration metadata is inferred.
ALTER TABLE game_saves ADD COLUMN branch_id text;
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN parent_branch_id text;
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN fork_revision integer;
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN created_policy_version text;
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN source_migration_id text;
--> statement-breakpoint
ALTER TABLE game_saves DROP CONSTRAINT game_saves_memory_policy_check;
--> statement-breakpoint
ALTER TABLE game_saves ADD CONSTRAINT game_saves_memory_policy_check CHECK (
  (
    (
      schema_version = 1 AND memory_mode IS NULL AND memory_policy IS NULL
      AND branch_id IS NULL AND parent_branch_id IS NULL AND fork_revision IS NULL
      AND created_policy_version IS NULL AND source_migration_id IS NULL
    )
    OR (
      schema_version IN (2, 3)
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
      AND (
        (schema_version = 2 AND branch_id IS NULL AND parent_branch_id IS NULL AND fork_revision IS NULL
          AND created_policy_version IS NULL AND source_migration_id IS NULL)
        OR (
          schema_version = 3
          AND branch_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
          AND fork_revision BETWEEN 0 AND revision
          AND created_policy_version = memory_policy->>'policyVersion'
          AND (source_migration_id IS NULL OR length(source_migration_id) BETWEEN 1 AND 200)
          AND (
            (parent_branch_id IS NULL AND branch_id = 'root' AND fork_revision = 0)
            OR (parent_branch_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
              AND parent_branch_id <> branch_id AND branch_id <> 'root')
          )
        )
      )
    )
  ) IS TRUE
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_game_save_memory_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.schema_version IS DISTINCT FROM NEW.schema_version THEN
    RAISE EXCEPTION 'SAVE_SCHEMA_VERSION_IMMUTABLE';
  END IF;
  IF OLD.schema_version IN (2, 3) AND (
    OLD.memory_mode IS DISTINCT FROM NEW.memory_mode
    OR OLD.memory_policy IS DISTINCT FROM NEW.memory_policy
    OR OLD.memory_policy_version IS DISTINCT FROM NEW.memory_policy_version
  ) THEN
    RAISE EXCEPTION 'SAVE_MEMORY_POLICY_PINNED';
  END IF;
  IF OLD.schema_version = 3 AND (
    OLD.branch_id IS DISTINCT FROM NEW.branch_id
    OR OLD.parent_branch_id IS DISTINCT FROM NEW.parent_branch_id
    OR OLD.fork_revision IS DISTINCT FROM NEW.fork_revision
    OR OLD.created_policy_version IS DISTINCT FROM NEW.created_policy_version
    OR OLD.source_migration_id IS DISTINCT FROM NEW.source_migration_id
  ) THEN
    RAISE EXCEPTION 'SAVE_LINEAGE_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER game_saves_memory_policy_immutable ON game_saves;
--> statement-breakpoint
CREATE TRIGGER game_saves_memory_policy_immutable
  BEFORE UPDATE OF schema_version, memory_mode, memory_policy, memory_policy_version,
    branch_id, parent_branch_id, fork_revision, created_policy_version, source_migration_id ON game_saves
  FOR EACH ROW EXECUTE FUNCTION protect_game_save_memory_policy();
--> statement-breakpoint
ALTER TABLE npc_authorized_observation_outbox
  ADD COLUMN grant_id_version smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE npc_authorized_observation_outbox
  ADD CONSTRAINT npc_authorized_observation_grant_id_version_check CHECK (grant_id_version IN (1, 2));
