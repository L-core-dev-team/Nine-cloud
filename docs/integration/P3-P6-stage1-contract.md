# P3–P6 stage 1 implementation contract

Status: FROZEN_STAGE1_ONLY, 2026-10-13, INTEGRATION-P3-P6-03.

User approval: D1 A (authority-only context, no original player text), D2 immutable published body with authorized erasure/export, D3 first publication remains default, D4 isolated measurement only. NPC paragraph authorization, production quotas and backup erasure remain unapproved.

Baseline main: 2647439e0cccc9a136606a81131519f53253f125.
Candidate parent: f159b5468966fb95f91cc9ab7bbcdf6cd665c3bd (7 ahead / 0 behind).
PR 83 remains draft/open at ef6430be778136d6501d9707fdc9a0d3c5bfd3d9.
Remote fetched 2026-10-13. No changes to original worktrees.

Implementation uses receipt → sealed minimal context → generation request → leased attempt → immutable source/publication. Eight tables, one PostgreSQL authority. T1 seeds context/request/outbox inside the existing accepted transaction; T3 publishes body/source/segments/outbox atomically. Four identities are distinct. Default source never changes; no standalone retry endpoint. Old receipts remain legacy-body-unavailable.

Stage 1 deterministic context has no NPC natural-language retrieval. policySurface is p5-narrative, but no memory evidence is persisted or granted. P4/P5 existing semantics remain unchanged. Generated prose is presentation, not a RULES event. Source/event links are provenance only, not grants.

Test-only body limits: 100000 UTF-16 code units AND 200000 UTF-8 bytes, validated after existing hint completion. Neither value is an approved production quota. Invalid surrogate sequences are rejected, BOM/CRLF are preserved. Final raw UTF-8 bytes and SHA256 are authoritative.

Signed source integration must remain a review patch if its semantic digest changes. No digest exclusions or signatures will be changed. Independent PG tests do not establish approved game-rule integration.
