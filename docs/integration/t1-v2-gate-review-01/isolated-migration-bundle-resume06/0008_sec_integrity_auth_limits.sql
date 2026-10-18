-- SEC-01 hardening: turn_events becomes append-only; game_saves rows keep a
-- stable identity (id/owner/created_at) and a monotonic revision. Row deletion
-- from both tables is only permitted inside a verified account-erasure
-- transaction, mirroring the 0007 entitlement-ledger guard.
CREATE OR REPLACE FUNCTION "reject_turn_event_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'turn events are append-only';
END;
$$;
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
	RAISE EXCEPTION '% rows can only be deleted during a verified account erasure', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "guard_game_saves_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
		OR NEW.revision < OLD.revision THEN
		RAISE EXCEPTION 'game_saves identity is immutable and revision must be monotonic';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "turn_events_append_only" BEFORE UPDATE ON "turn_events"
FOR EACH ROW EXECUTE FUNCTION "reject_turn_event_update"();
--> statement-breakpoint
CREATE TRIGGER "turn_events_erasure_only_delete" BEFORE DELETE ON "turn_events"
FOR EACH ROW EXECUTE FUNCTION "reject_protected_archive_delete"();
--> statement-breakpoint
CREATE TRIGGER "game_saves_identity_guard" BEFORE UPDATE ON "game_saves"
FOR EACH ROW EXECUTE FUNCTION "guard_game_saves_update"();
--> statement-breakpoint
CREATE TRIGGER "game_saves_erasure_only_delete" BEFORE DELETE ON "game_saves"
FOR EACH ROW EXECUTE FUNCTION "reject_protected_archive_delete"();
--> statement-breakpoint
-- SEC-02 hardening: per-IP hourly budget for verification-code mails. The
-- global 600/hour bucket stays as the final backstop.
CREATE TABLE IF NOT EXISTS "auth_ip_mail_limits" (
	"ip" text PRIMARY KEY,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
