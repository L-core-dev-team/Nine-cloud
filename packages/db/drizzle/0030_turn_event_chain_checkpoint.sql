-- Incremental event-chain verification (defect 4). verify_turn_event_chain stays as the full audit.
-- The checkpoint records the last head (sequence, event_hash) proven by a verification pass.
-- Hot path: re-hash the recorded head row plus only the rows appended after it.
-- A full audit runs when no checkpoint exists, every full_audit_every-th check, or when
-- the caller forces it (full_audit_every=1). turn_events stays append-only and its
-- insert trigger still enforces continuity; this table never authorizes any write.
CREATE TABLE turn_event_chain_checkpoints (
 save_id text PRIMARY KEY REFERENCES game_saves(id) ON DELETE CASCADE,
 verified_sequence integer NOT NULL CHECK (verified_sequence >= -1),
 verified_hash text NOT NULL CHECK (verified_hash ~ '^[0-9a-f]{64}$'),
 incremental_checks integer NOT NULL DEFAULT 0 CHECK (incremental_checks >= 0),
 full_audit_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Same runtime access model as turn_events (owner role); never exposed to Supabase API roles.
REVOKE ALL ON TABLE turn_event_chain_checkpoints FROM PUBLIC;
--> statement-breakpoint
DO $revoke$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON TABLE public.turn_event_chain_checkpoints FROM %I', role_name);
  END IF;
 END LOOP;
END $revoke$;
--> statement-breakpoint
-- Returns ok=false on any break: sequence gap, previous_hash/event_hash mismatch, a recorded
-- head that vanished or changed, or a chain now shorter than the recorded head. A failure
-- never moves the checkpoint, so the save keeps failing until an operator investigates.
-- hashed_events counts turn_event_digest computations for observability and tests.
CREATE FUNCTION verify_turn_event_chain_incremental(target text, full_audit_every integer)
RETURNS TABLE(ok boolean, full_audit boolean, hashed_events integer, head_sequence integer)
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE cp turn_event_chain_checkpoints; has_cp boolean; e turn_events; anchor turn_events;
 prev text; seq integer; n integer := 0; head_hash text;
BEGIN
 IF full_audit_every IS NULL OR full_audit_every < 1 THEN RAISE EXCEPTION 'EVENT_AUDIT_INTERVAL_INVALID'; END IF;
 SELECT * INTO cp FROM turn_event_chain_checkpoints c WHERE c.save_id=target;
 has_cp := FOUND;
 IF NOT has_cp OR cp.incremental_checks + 1 >= full_audit_every THEN
  prev := repeat('0',64); seq := 0;
  FOR e IN SELECT * FROM turn_events t WHERE t.save_id=target ORDER BY t.sequence LOOP
   n := n + 1;
   IF e.sequence<>seq OR e.previous_hash<>prev OR e.event_hash<>turn_event_digest(e,prev) THEN
    RETURN QUERY SELECT false, true, n, seq - 1; RETURN;
   END IF;
   prev := e.event_hash; seq := seq + 1;
  END LOOP;
  -- Truncating events at or below the recorded head leaves a valid shorter chain; reject it.
  IF has_cp AND (cp.verified_sequence > seq - 1 OR (cp.verified_sequence >= 0 AND
     (SELECT t.event_hash FROM turn_events t WHERE t.save_id=target AND t.sequence=cp.verified_sequence) IS DISTINCT FROM cp.verified_hash)) THEN
   RETURN QUERY SELECT false, true, n, seq - 1; RETURN;
  END IF;
  INSERT INTO turn_event_chain_checkpoints AS c(save_id, verified_sequence, verified_hash, incremental_checks, full_audit_at, updated_at)
   VALUES(target, seq - 1, prev, 0, now(), now())
   ON CONFLICT (save_id) DO UPDATE SET verified_sequence=EXCLUDED.verified_sequence, verified_hash=EXCLUDED.verified_hash,
    incremental_checks=0, full_audit_at=now(), updated_at=now()
   WHERE c.verified_sequence <= EXCLUDED.verified_sequence;
  RETURN QUERY SELECT true, true, n, seq - 1; RETURN;
 END IF;
 -- Incremental: the recorded head must still be present, unchanged and self-consistent.
 IF cp.verified_sequence >= 0 THEN
  SELECT * INTO anchor FROM turn_events t WHERE t.save_id=target AND t.sequence=cp.verified_sequence;
  IF NOT FOUND THEN RETURN QUERY SELECT false, false, n, cp.verified_sequence; RETURN; END IF;
  n := n + 1;
  IF anchor.event_hash<>cp.verified_hash OR anchor.event_hash<>turn_event_digest(anchor, anchor.previous_hash) THEN
   RETURN QUERY SELECT false, false, n, cp.verified_sequence; RETURN;
  END IF;
 ELSIF cp.verified_hash<>repeat('0',64) THEN
  RETURN QUERY SELECT false, false, n, cp.verified_sequence; RETURN;
 END IF;
 prev := cp.verified_hash; seq := cp.verified_sequence + 1;
 FOR e IN SELECT * FROM turn_events t WHERE t.save_id=target AND t.sequence>cp.verified_sequence ORDER BY t.sequence LOOP
  n := n + 1;
  IF e.sequence<>seq OR e.previous_hash<>prev OR e.event_hash<>turn_event_digest(e,prev) THEN
   RETURN QUERY SELECT false, false, n, seq - 1; RETURN;
  END IF;
  prev := e.event_hash; seq := seq + 1;
 END LOOP;
 head_hash := prev;
 UPDATE turn_event_chain_checkpoints c SET verified_sequence=seq - 1, verified_hash=head_hash,
  incremental_checks=c.incremental_checks + 1, updated_at=now()
  WHERE c.save_id=target AND c.verified_sequence <= seq - 1;
 RETURN QUERY SELECT true, false, n, seq - 1;
END $$;
--> statement-breakpoint
-- The function writes the checkpoint, so only the owning API role may call it (0022 model).
REVOKE EXECUTE ON FUNCTION verify_turn_event_chain_incremental(text, integer) FROM PUBLIC;
--> statement-breakpoint
DO $revoke_fn$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE EXECUTE ON FUNCTION public.verify_turn_event_chain_incremental(text, integer) FROM %I', role_name);
  END IF;
 END LOOP;
END $revoke_fn$;
