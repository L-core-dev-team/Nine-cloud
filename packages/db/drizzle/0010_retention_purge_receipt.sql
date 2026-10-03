-- A scheduled trash purge is distinct from verified account erasure. A
-- transaction-local receipt permits only the selected local archive row.
CREATE TABLE "archive_retention_purge_receipts" (
  "save_id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "policy_version" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_protected_archive_delete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE archive_owner text;
BEGIN
  IF TG_TABLE_NAME = 'game_saves' THEN
    archive_owner := OLD.owner_id;
  ELSE
    SELECT owner_id INTO archive_owner FROM game_saves WHERE id = OLD.save_id;
  END IF;
  IF current_database() = 'jiuxiao_test'
    AND current_setting('jiuxiao.account_erasure_operation', true) = 'test-cleanup' THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1 FROM account_operations o
    WHERE o.id = current_setting('jiuxiao.account_erasure_operation', true)
      AND o.owner_id = archive_owner AND o.operation = 'delete'
      AND o.phase = 'ready' AND o.expires_at > now()
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'game_saves' THEN
    IF OLD.snapshot #>> '{facts,archiveKind}' = 'local-untrusted-v1'
      AND EXISTS (
        SELECT 1 FROM archive_retention_purge_receipts r
        WHERE r.save_id = OLD.id AND r.owner_id = OLD.owner_id
          AND r.expires_at > now()
      )
      AND NOT EXISTS (SELECT 1 FROM turn_requests r WHERE r.save_id = OLD.id)
      AND NOT EXISTS (SELECT 1 FROM turn_events e WHERE e.save_id = OLD.id)
      AND NOT EXISTS (SELECT 1 FROM npc_memory_journals n WHERE n.save_id = OLD.id) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION '% rows can only be deleted during a verified account erasure or archive retention purge', TG_TABLE_NAME;
END;
$$;
