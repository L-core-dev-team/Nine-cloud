-- PREPARATION ONLY. Use only after formal T1 authorization on the isolated test database.
-- psql parameters owner, save, request are required. No action, generation, claim or migration is performed.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database(),current_user,inet_server_addr(),inet_server_port(),current_setting('data_directory');
-- Runner must validate 127.0.0.1:55461 / handover_tester / isolated test name before continuing.
SELECT id,owner_id,revision,branch_id,snapshot FROM game_saves WHERE id=:'save' AND owner_id=:'owner';
SELECT r.* FROM turn_requests r JOIN game_saves s ON s.id=r.save_id
 WHERE s.owner_id=:'owner' AND r.save_id=:'save' AND r.idempotency_key=:'request';
SELECT e.* FROM turn_events e JOIN game_saves s ON s.id=e.save_id
 WHERE s.owner_id=:'owner' AND e.save_id=:'save' AND e.idempotency_key=:'request';
SELECT * FROM npc_memory_journals WHERE save_id=:'save'
 AND EXISTS(SELECT 1 FROM game_saves WHERE id=:'save' AND owner_id=:'owner');
SELECT * FROM npc_authorized_observation_outbox WHERE save_id=:'save'
 AND EXISTS(SELECT 1 FROM game_saves WHERE id=:'save' AND owner_id=:'owner');
SELECT * FROM npc_memory_observation_supersessions WHERE save_id=:'save'
 AND EXISTS(SELECT 1 FROM game_saves WHERE id=:'save' AND owner_id=:'owner');
-- New schema must exist. Missing relation is BLOCKED, never silently treated as legacy or PASS.
SELECT * FROM narrative_receipt_ownership WHERE owner_id=:'owner' AND save_id=:'save' AND request_key=:'request';
SELECT c.* FROM narrative_context_snapshots c WHERE c.owner_id=:'owner' AND c.save_id=:'save' AND c.request_key=:'request';
SELECT g.*,a.id AS attempt_id,a.state AS attempt_state,a.lease_epoch,a.lease_until
 FROM narrative_generation_requests g LEFT JOIN narrative_attempts a ON a.generation_id=g.id
 JOIN game_saves s ON s.id=g.save_id WHERE s.owner_id=:'owner' AND g.save_id=:'save' AND g.request_key=:'request';
SELECT p.*,s.body_sha,encode(sha256(s.body),'hex') AS actual_sha,s.utf8_length,s.utf16_length
 FROM narrative_publications p JOIN narrative_sources s ON s.id=p.source_id JOIN game_saves v ON v.id=p.save_id
 WHERE v.owner_id=:'owner' AND p.save_id=:'save' AND p.request_key=:'request';
SELECT o.* FROM narrative_outbox o JOIN narrative_generation_requests g ON g.id=o.generation_id
 JOIN game_saves s ON s.id=g.save_id WHERE s.owner_id=:'owner' AND g.save_id=:'save' AND g.request_key=:'request';
COMMIT;
