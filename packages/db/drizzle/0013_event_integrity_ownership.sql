ALTER TABLE game_saves ADD CONSTRAINT game_saves_account_fk FOREIGN KEY(owner_id) REFERENCES auth_accounts(id) NOT VALID;
--> statement-breakpoint
ALTER TABLE cloud_archive_trash ADD CONSTRAINT trash_owner_save_fk FOREIGN KEY(owner_id,save_id) REFERENCES game_saves(owner_id,id) NOT VALID;
--> statement-breakpoint
ALTER TABLE turn_events ADD COLUMN previous_hash text;
--> statement-breakpoint
ALTER TABLE turn_events ADD COLUMN event_hash text;
--> statement-breakpoint
CREATE FUNCTION turn_event_digest(e turn_events, previous text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT encode(sha256(convert_to(previous || jsonb_build_object('id',e.id,'save_id',e.save_id,'idempotency_key',e.idempotency_key,'sequence',e.sequence,'event_type',e.event_type,'source',e.source,'rule_version',e.rule_version,'before_revision',e.before_revision,'after_revision',e.after_revision,'payload',e.payload,'occurred_at',to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'))::text,'UTF8')),'hex');
$$;
--> statement-breakpoint
DROP TRIGGER turn_events_append_only ON turn_events;
--> statement-breakpoint
DO $$ DECLARE e turn_events; prev text; last_save text; BEGIN
 FOR e IN SELECT * FROM turn_events ORDER BY save_id,sequence LOOP
 IF last_save IS DISTINCT FROM e.save_id THEN prev:=repeat('0',64);last_save:=e.save_id; END IF;
 UPDATE turn_events SET previous_hash=prev,event_hash=turn_event_digest(e,prev) WHERE id=e.id;
 prev:=turn_event_digest(e,prev);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER turn_events_append_only BEFORE UPDATE ON turn_events FOR EACH ROW EXECUTE FUNCTION reject_turn_event_update();
--> statement-breakpoint
ALTER TABLE turn_events ALTER COLUMN previous_hash SET NOT NULL;
--> statement-breakpoint
ALTER TABLE turn_events ALTER COLUMN event_hash SET NOT NULL;
--> statement-breakpoint
CREATE FUNCTION append_turn_event_hash() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_sequence integer; prev text;
BEGIN
 PERFORM id FROM game_saves WHERE id=NEW.save_id FOR UPDATE;
 SELECT sequence,event_hash INTO last_sequence,prev FROM turn_events WHERE save_id=NEW.save_id ORDER BY sequence DESC LIMIT 1;
 IF NEW.sequence<>coalesce(last_sequence,-1)+1 THEN RAISE EXCEPTION 'EVENT_SEQUENCE_INVALID';END IF;
 NEW.previous_hash:=coalesce(prev,repeat('0',64));NEW.event_hash:=turn_event_digest(NEW,NEW.previous_hash);RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER turn_events_chain BEFORE INSERT ON turn_events FOR EACH ROW EXECUTE FUNCTION append_turn_event_hash();
--> statement-breakpoint
CREATE FUNCTION verify_turn_event_chain(target text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE e turn_events;prev text:=repeat('0',64);seq integer:=0;
BEGIN
 FOR e IN SELECT * FROM turn_events WHERE save_id=target ORDER BY sequence LOOP
 IF e.sequence<>seq OR e.previous_hash<>prev OR e.event_hash<>turn_event_digest(e,prev) THEN RETURN false;END IF;
 prev:=e.event_hash;seq:=seq+1;
 END LOOP;RETURN true;
END $$;
--> statement-breakpoint
-- Stop safely on legacy orphans; do not invent accounts or delete their data.
ALTER TABLE game_saves VALIDATE CONSTRAINT game_saves_account_fk;
--> statement-breakpoint
ALTER TABLE cloud_archive_trash VALIDATE CONSTRAINT trash_owner_save_fk;
