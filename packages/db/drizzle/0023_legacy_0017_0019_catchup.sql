-- Repair the legacy 0017-0019 entries whose journal timestamps precede
-- the already-applied 0016 entry. Old migrations remain immutable.
-- Fresh databases skip each already-present artifact; owner IDs and rows are preserved.
DO $catchup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='game_saves' AND column_name='branch_id') THEN
-- P2: add explicit save lineage and versioned, portable authorization grant IDs.
-- Legacy v1/v2 rows retain NULL lineage; no branch or migration metadata is inferred.
ALTER TABLE game_saves ADD COLUMN branch_id text;

ALTER TABLE game_saves ADD COLUMN parent_branch_id text;

ALTER TABLE game_saves ADD COLUMN fork_revision integer;

ALTER TABLE game_saves ADD COLUMN created_policy_version text;

ALTER TABLE game_saves ADD COLUMN source_migration_id text;

ALTER TABLE game_saves DROP CONSTRAINT game_saves_memory_policy_check;

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

CREATE OR REPLACE FUNCTION protect_game_save_memory_policy() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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

DROP TRIGGER game_saves_memory_policy_immutable ON game_saves;

CREATE TRIGGER game_saves_memory_policy_immutable
  BEFORE UPDATE OF schema_version, memory_mode, memory_policy, memory_policy_version,
    branch_id, parent_branch_id, fork_revision, created_policy_version, source_migration_id ON game_saves
  FOR EACH ROW EXECUTE FUNCTION protect_game_save_memory_policy();

ALTER TABLE npc_authorized_observation_outbox
  ADD COLUMN grant_id_version smallint NOT NULL DEFAULT 1;

ALTER TABLE npc_authorized_observation_outbox
  ADD CONSTRAINT npc_authorized_observation_grant_id_version_check CHECK (grant_id_version IN (1, 2));

  END IF;
END
$catchup$;
--> statement-breakpoint
DO $catchup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='game_saves' AND column_name='canon_artifact_hash') THEN
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

ALTER TABLE game_saves ADD COLUMN canon_artifact_hash text;

ALTER TABLE game_saves ADD CONSTRAINT game_saves_canon_artifact_hash_check CHECK (
  (
    (schema_version IN (1, 2) AND canon_artifact_hash IS NULL)
    OR (schema_version = 3 AND canon_artifact_hash IS NOT NULL
      AND canon_artifact_hash ~ '^sha256:[0-9A-Fa-f]{64}$')
  ) IS TRUE
);

CREATE OR REPLACE FUNCTION protect_game_save_memory_policy() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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

DROP TRIGGER game_saves_memory_policy_immutable ON game_saves;

CREATE TRIGGER game_saves_memory_policy_immutable
  BEFORE UPDATE OF schema_version, memory_mode, memory_policy, memory_policy_version,
    branch_id, parent_branch_id, fork_revision, created_policy_version, source_migration_id,
    canon_artifact_hash ON game_saves
  FOR EACH ROW EXECUTE FUNCTION protect_game_save_memory_policy();

  END IF;
END
$catchup$;
--> statement-breakpoint
DO $catchup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_accounts' AND column_name='is_guest') THEN
-- P1: represent guests honestly without email credentials or OTP challenge rows.
-- Existing email accounts remain email accounts; the new columns are backfilled
-- by defaults and do not rewrite their identifiers or owned saves.
ALTER TABLE auth_accounts ALTER COLUMN email DROP NOT NULL;

ALTER TABLE auth_accounts ADD COLUMN is_guest boolean NOT NULL DEFAULT false;

ALTER TABLE auth_accounts ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE auth_accounts ADD CONSTRAINT auth_accounts_identity_check
  CHECK ((is_guest = (email IS NULL)) IS TRUE);

CREATE INDEX auth_accounts_guest_retention_idx ON auth_accounts(last_seen_at, id)
  WHERE is_guest AND closed_at IS NULL;

  END IF;
END
$catchup$;
--> statement-breakpoint
DO $catchup$
BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='game_saves' AND column_name IN ('branch_id','parent_branch_id','fork_revision','created_policy_version','source_migration_id','canon_artifact_hash')) <> 6
 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_accounts' AND column_name IN ('is_guest','last_seen_at')) <> 2
 OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='npc_authorized_observation_outbox' AND column_name='grant_id_version') THEN
 RAISE EXCEPTION 'LEGACY_MIGRATION_PARTIAL_STATE_REQUIRES_RECONCILIATION';
 END IF;
END
$catchup$;
