-- P2: bind each branch-aware v3 save to the exact public Canon runtime bytes.
-- This is the same unreleased schema-version increase from v2 to v3; v1/v2
-- rows remain NULL and are never assigned an inferred artifact identity.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM game_saves WHERE schema_version = 3) THEN
    RAISE EXCEPTION 'SAVE_CANON_ARTIFACT_MIGRATION_REQUIRES_EXPLICIT_RECONCILIATION';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE game_saves ADD COLUMN canon_artifact_hash text;
--> statement-breakpoint
ALTER TABLE game_saves ADD CONSTRAINT game_saves_canon_artifact_hash_check CHECK (
  (
    (schema_version IN (1, 2) AND canon_artifact_hash IS NULL)
    OR (schema_version = 3 AND canon_artifact_hash IS NOT NULL
      AND canon_artifact_hash ~ '^sha256:[0-9A-Fa-f]{64}$')
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
  IF OLD.schema_version = 3 AND OLD.canon_artifact_hash IS DISTINCT FROM NEW.canon_artifact_hash THEN
    RAISE EXCEPTION 'SAVE_CANON_ARTIFACT_PINNED';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER game_saves_memory_policy_immutable ON game_saves;
--> statement-breakpoint
CREATE TRIGGER game_saves_memory_policy_immutable
  BEFORE UPDATE OF schema_version, memory_mode, memory_policy, memory_policy_version,
    branch_id, parent_branch_id, fork_revision, created_policy_version, source_migration_id,
    canon_artifact_hash ON game_saves
  FOR EACH ROW EXECUTE FUNCTION protect_game_save_memory_policy();
