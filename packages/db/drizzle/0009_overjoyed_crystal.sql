-- Old rows predate event provenance columns. Preserve their payload verbatim and
-- mark their provenance explicitly, rather than pretending they were rules turns.
-- 0008 already installed the append-only guard. Migration owns an exclusive
-- upgrade window; remove the guard only around this one-time provenance fill.
DROP TRIGGER "turn_events_append_only" ON "turn_events";
--> statement-breakpoint
UPDATE "turn_events" e SET "source" = 'MIGRATION' WHERE e."source" IS NULL;
--> statement-breakpoint
UPDATE "turn_events" e SET "rule_version" = COALESCE(
  (SELECT NULLIF(s."rule_version", '') FROM "game_saves" s WHERE s."id" = e."save_id"),
  'legacy-pre-signing'
) WHERE e."rule_version" IS NULL OR e."rule_version" = '';
--> statement-breakpoint
CREATE TRIGGER "turn_events_append_only" BEFORE UPDATE ON "turn_events"
FOR EACH ROW EXECUTE FUNCTION "reject_turn_event_update"();
--> statement-breakpoint
ALTER TABLE "turn_events" ALTER COLUMN "source" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "turn_events" ALTER COLUMN "rule_version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_source_check" CHECK ("source" IN ('RULES', 'MIGRATION'));
--> statement-breakpoint
-- 0008 may already have run in a developer test database. Replace its delete
-- guard with the verified operation check for every migrated installation.
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
  RAISE EXCEPTION '% rows can only be deleted during a verified account erasure', TG_TABLE_NAME;
END;
$$;
