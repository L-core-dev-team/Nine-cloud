# API core dossier: `apps/api/src` (excluding card-import, narrative/memory/provider/worldbook/thumbnail files and `worker.ts`)

Worktree 研究工作区, branch `docs/vision-02-claude-research` at `fe171ff`. This was a read-only study; nothing in the worktree was modified. All paths are relative to the repository root. `L` means line.

---

## 1. Coverage

**Status key:**
- **full**: read end to end.
- **skimmed**: only test names, signatures or a region were read.
- **not read**: not opened.

### Routes and entry

| File | Lines | Status |
|---|---|---|
| app.ts | 70 | full |
| index.ts | 96 | full |
| app.integration.test.ts | 42 | full |
| routes/auth.ts | 169 | full |
| routes/auth.test.ts | 19 | full |
| routes/supabase-auth.ts | 75 | full |
| routes/supabase-auth.test.ts | 61 | full |
| routes/account.ts | 35 | full |
| routes/account.test.ts | 12 | full |
| routes/saves.ts | 178 | full |
| routes/saves.test.ts | 153 | full |
| routes/games.ts | 183 | full |
| routes/games.test.ts | 41 | full |
| routes/game-recovery.test.ts | 35 | full |
| routes/turns.ts | 38 | full |
| routes/turns.test.ts | 67 | full |
| routes/turn-http.ts | 17 | full |

### Turn pipeline and rules

| File | Lines | Status |
|---|---|---|
| server-turn.ts | 229 | full |
| server-turn.test.ts | 323 | full |
| server-turn.integration.test.ts | 187 | full |
| postgres-server-turn.ts | 39 | full |
| authoritative-game.ts | 68 | full |
| approved-player-actions.ts | 32 | full |
| turn-runtime.ts | 137 | full |
| turn-runtime.test.ts | 72 | full |
| gameplay-runtime.ts | 23 | full |
| preview-release-runtime.ts | 47 | full |
| author-rules-gate.ts | 34 | full |
| rule-resolver.ts | 39 | full |
| rule-resolver.test.ts | 48 | full |
| rule-semantic-fingerprint.ts | 105 | full |
| rule-semantic-fingerprint.test.ts | 197 | full |
| p1-prologue-plugin.ts | 235 | full |
| p1-nlu-runtime.ts | 256 | full |
| p1-nlu-runtime.test.ts | 152 | full |
| p1-review-rule-approval.ts | 62 | full |
| p1-review-rule-approval.test.ts | 85 | full |
| p1-review-semantic-gate.ts | 40 | full |
| p1-rule-semantic-functions.ts | 126 | full |
| p1-writing-gates.test.ts | 67 | full |

### Saves, archive and data policy

| File | Lines | Status |
|---|---|---|
| cloud-save-service.ts | 125 | full |
| cloud-save-service.test.ts | 165 | full |
| postgres-cloud-save-repository.ts | 301 | full |
| policy-cloud-save-repository.ts | 22 | full |
| save-storage-contract.ts | 19 | full |
| cloud-archive-lifecycle.ts | 59 | full |
| cloud-archive-lifecycle.test.ts | 11 | full |
| cloud-archive-lifecycle.integration.test.ts | 59 | full |
| data-policy.ts | 16 | full |
| data-policy-node.ts | 11 | full |
| data-policy.test.ts | 13 | full |
| data-policy.integration.test.ts | 25 | full |
| data-retention.ts | 25 | full |
| story-archive.ts | 44 | full |
| cloud-save-repository.integration.test.ts | 165 | skimmed (test names) |
| story-archive.integration.test.ts | 97 | skimmed (test names) |

### Auth and accounts

| File | Lines | Status |
|---|---|---|
| email-auth.ts | 97 | full |
| postgres-email-auth.ts | 193 | full |
| auth-runtime.ts | 177 | full |
| auth-runtime.test.ts | 23 | full |
| auth-failure.ts | 13 | full |
| auth-failure.test.ts | 35 | full |
| auth-mail.test.ts | 41 | full |
| turnstile.ts | 37 | full |
| account-export.ts | 23 | full |
| account-rate-limit.ts | 26 | full |
| external-erasure.ts | 42 | full |
| runtime-controls.integration.test.ts | 21 | full |
| account-lifecycle.ts | 150 | skimmed (L1–75) |
| supabase-auth.ts | 446 | skimmed (method index only) |
| email-auth.integration.test.ts | 187 | skimmed (test names) |
| account-lifecycle.integration.test.ts | 124 | skimmed (test names) |
| p3-guest-supabase.integration.test.ts | 127 | skimmed (test names) |
| main-integration-lifecycle.integration.test.ts | 182 | skimmed (test names) |
| email-auth.test.ts | 274 | not read |
| supabase-auth.test.ts | 191 | not read |
| supabase-auth.integration.test.ts | 102 | not read |
| tencent-ses-api.ts | 187 | not read |
| tencent-ses-api.test.ts | 34 | not read |
| turnstile.test.ts | 58 | not read |

### Entitlements and generated types

| File | Lines | Status |
|---|---|---|
| entitlement-ledger.ts | 96 | not read (grep shows it is not wired into the app) |
| postgres-entitlement-ledger.ts | 117 | not read (grep shows it is not wired into the app) |
| entitlement-ledger.test.ts | 49 | not read |
| entitlement-ledger.integration.test.ts | 78 | not read |
| worker-configuration.d.ts | 16198 | skimmed (L1–25 `Env`; the rest is generated workerd types) |

### Read outside scope, for cross-reference only

- **`npc-memory-turn-transaction.ts`** (612, full): it holds the accepted-turn commit transaction.
- **`worker.ts`**: only `createApp` wiring at L82 and L175–183.
- **`packages/contracts/src/*`** (~560 lines, all full).
- **`packages/domain/src`**: `event-log.ts`, `rules.ts`, `state-delta.ts`, `projection.ts` and `prologue-v1-time.ts` in full; `prologue-v1-rules.ts` L200–670 only.
- **`packages/content`**:
  - `src/rules/prologue-v1.constants.ts` L1–60
  - `package.json`
  - `p1-review-candidate.ts`
- **`packages/db`**:
  - `src/schema.ts` table list plus the `game_saves`, `turn_*` and `story_narratives` definitions
  - a grep of `drizzle/0013_event_integrity_ownership.sql`
- **`apps/api`**: `Dockerfile`, `wrangler.jsonc`, `package.json`.

---

## 2. Architecture map

### 2.1 Entry points

**Node host: `apps/api/src/index.ts`**

This host runs in the Dockerfile with `NODE_ENV=production` and the command `node apps/api/dist/index.js`.

1. **Environment checks** (L24–30): `API_PORT`/`API_HOST`; `DATABASE_URL` is required. In production, `STORY_ARCHIVE_ENABLED=true` throws (L32).
2. **Database pool and erasure pool** (L33–49):
   - `pg.Pool` with `max: 5` (L33).
   - `configureAccountQuota(pool)` (L34).
   - The optional erasure pool works only in test/dev, on the same local host and database but under a different user (L37–47).
3. **Auth runtime** (L50): `createEmailAuthRuntime(pool, env)` returns `undefined` unless `AUTH_ENABLED` or `SUPABASE_AUTH_ENABLED` is set (auth-runtime.ts L18–21). With no auth runtime, no business routes are mounted.
4. **Rules runtime** (L58–60), only when auth exists:
   - `loadConfiguredTurnPlugin(env)` loads the plugin.
   - `prepareTurnRuntime(plugin, narrativeSlots, budget)` sets up rules and narration.
   - `connectActionTextRuntime` wraps the result with the deterministic natural-language parser.
5. **Repositories** (L61–64):
   - In production: `PolicyCloudSaveRepository(pool, dataPolicy)` and the data policy from `ACCOUNT_DATA_POLICY_PATH`.
   - Otherwise: `PostgresCloudSaveRepository(pool, true)`.
   - The turn repository is `createPostgresServerTurnRepository(pool, true, policy)`.
6. **`createApp(...)`** (L70–82):
   - `CloudSaveService(repo, archiveOnly=true, scopedIds=true)`
   - `CloudArchiveLifecycle`
   - `ServerTurnService(turnRepo, runtime?.rules, narrator, 120_000 ms, fallback)`
   - `AuthoritativeGameService(cloudRepository, runtime)`
   - `readReceipt`, and `memoryRecall` when the repository provides it.
   - `publication` is **not** passed, so `/api/narrative-publications` is never mounted by this host.

**Cloudflare host (`worker.ts`, out of scope, peeked):**
- When `SUPABASE_AUTH_ENABLED !== 'true'` it returns `createApp(database)`, which serves only `/health` and `/ready` (worker.ts L82).
- Otherwise it calls `createApp(database, {cloud saves}, emailAuth)` with **no `turns` argument** (L179–183). So `/api/turns` and `/api/games*` do not exist on the Worker.
- `wrangler.jsonc` routes `play.jiuxiaogame.cn/api/*` to this Worker (see Q1 in section 6).

### 2.2 Middleware order (Hono, registration order in `createApp`, app.ts L33–66)

1. **`app.use('/api/*')`** from `mountAuth` (auth.ts L33–53), only when `emailAuth` exists. It:
   - sets `Cache-Control: no-store` and `Vary: Origin`;
   - adds CORS credentials only for the one exact `AUTH_PUBLIC_ORIGIN`;
   - answers OPTIONS preflight only for GET/POST/PUT/DELETE and the headers `content-type` and `x-jiuxiao-account`;
   - **rejects any non-GET/HEAD/OPTIONS request whose `Origin` is not exactly `AUTH_PUBLIC_ORIGIN`** with 403 `ORIGIN_REJECTED`. This is the CSRF control, alongside the `SameSite=Strict` HttpOnly cookie `jx_session` (auth.ts L7–11).
2. **`app.onError`** returns 503 `INTERNAL_ERROR` for any uncaught error (auth.ts L54). It is registered only inside `mountAuth`.
3. **Routes**, in this order:
   - auth
   - phone auth
   - account
   - card-import (out of scope)
   - `/health` and `/ready`
   - saves
   - `/api/turns`
   - publications (not wired)
   - games
4. **`notFound`** returns 404 `{code: 'NOT_FOUND'}` (app.ts L66).

**Authentication:**
- Owner identity always comes from `resolveOwnerId(request)`, which looks up the `jx_session` cookie on the server (index.ts L73, L80).
- An optional `X-Jiuxiao-Account` header must equal the resolved owner, so a tab queued under account A cannot write into account B (saves.ts L15–25, games.ts L179–183, turns.ts L13–18).
- Body fields that would select an owner are rejected by allow-lists.

### 2.3 Route table

#### Infrastructure (app.ts)

| Method and path | Handler | Auth | Returns |
|---|---|---|---|
| GET `/health` | app.ts:44 | none | `{status, service, saveSchemaVersion: 3}` |
| GET `/ready` | app.ts:47 | none | 200 when `SELECT 1` succeeds, otherwise 503 `not_ready` |

#### Email auth and guests (routes/auth.ts)

| Method and path | Handler | Auth | Returns |
|---|---|---|---|
| GET `/api/auth/providers` | auth.ts:55 | none | `{email, phone, emailCaptcha, cardImport, privacyPolicyUrl, privacyPolicyVersion}` |
| POST `/api/auth/guest` | auth.ts:56 | anonymous, rate-limited 3/h/IP | 201 `{account: {id, kind: 'guest'}, expiresAt}` and sets the cookie. 409 if an email session is active; 429 when limited |
| POST `/api/auth/code` | auth.ts:73 | Turnstile only when there is **no** session | 202 `{status: 'sent', resendAfterSeconds: 60}` or 429 |
| POST `/api/auth/verify` and `/api/auth/restore` | auth.ts:88 | none | `{account, expiresAt}` and sets the cookie; 401 `INVALID_OR_EXPIRED_CODE` |
| POST `/api/auth/guest/upgrade` | auth.ts:98 | guest session | `{account, expiresAt}`; the cookie is not rotated |
| GET `/api/auth/session` | auth.ts:117 | session | `{account, expiresAt}` or 401 |
| POST `/api/auth/refresh` | auth.ts:121 | session | rotates the token and sets the cookie |
| POST `/api/auth/logout` | auth.ts:129 | session | `{status: 'signed_out'}` |

#### Phone auth (routes/supabase-auth.ts, only when Supabase auth is on)

| Method and path | Handler | Auth | Returns |
|---|---|---|---|
| GET `/api/auth/phone/status` | supabase-auth.ts:8 | session | phone link status |
| POST `/api/auth/phone/code` | supabase-auth.ts:38 | none | 202 or 429 |
| POST `/api/auth/phone/link/code` | supabase-auth.ts:39 | session | 202 or 429 |
| POST `/api/auth/phone/verify` and `/restore` | supabase-auth.ts:51 | none | `{account, expiresAt}` and sets the cookie |
| POST `/api/auth/phone/link` and `/unlink` | supabase-auth.ts:54, :65 | session | `phone_linked` / `phone_unlinked`, or 409 |

#### Account lifecycle (routes/account.ts, email sessions only)

| Method and path | Handler | Auth | Returns |
|---|---|---|---|
| GET `/api/account/capabilities` | account.ts:15 | email session | `{emailChange, close, permanentDelete, policyVersion}` |
| GET `/api/account/export` | account.ts:16 | email session, quota 6/h | full account JSON export (account-export.ts) |
| POST `/api/account/operation/{begin, verify, complete, cancel}` | account.ts:21 | email session, bound to the session hash | operation phase; `complete` clears the cookie |

#### Cloud saves (routes/saves.ts, client archives only)

| Method and path | Handler | Auth | Returns |
|---|---|---|---|
| GET `/api/save-trash?offset` | saves.ts:98 | session | `{saves: [{saveId, revision, name, deletedAt}], hasMore}` |
| DELETE `/api/saves/:saveId` body `{expectedRevision}` | saves.ts:107 | session + Origin | `{kind: 'deleted', revision}`; works only on v1 client archives |
| POST `/api/save-trash/:saveId/restore` | saves.ts:107 | session + Origin | `{kind: 'restored', revision}` |
| GET `/api/save-index?offset&limit` | saves.ts:122 | session | `{saves: [{saveId, name, revision}], hasMore}` (archives only) |
| GET `/api/saves` | saves.ts:130 | session | `{saves: SaveEnvelope[]}`, **including authoritative v3 games** |
| POST `/api/saves` `{save}` | saves.ts:137 | session + Origin | 201 `{save}`. In production, only `local-untrusted-v1` archives with an owner-scoped ID |
| GET `/api/saves/:saveId` | saves.ts:150 | session | `{save}` |
| PUT `/api/saves/:saveId` `{expectedRevision, save}` | saves.ts:159 | session + Origin | `{save}`, or 409 for a revision conflict or a pinned field |

#### Turns and games (routes/turns.ts, routes/games.ts)

| Method and path | Handler | Auth | Returns |
|---|---|---|---|
| POST `/api/turns` `{intent: ActionIntent, requestNarrative?}` | turns.ts:12 | session + Origin, quota `turn` 30/min | `ServerTurnResult`, mapped by turn-http.ts |
| POST `/api/games` `{idempotencyKey, choices}` | games.ts:151 | session + Origin, **no quota** | 201 or 200 (duplicate) `{status: 'created', save, characterProfile?, duplicate}` |
| GET `/api/games/:saveId` | games.ts:37 | session | `{save, characterProfile, latestReceipt, opening, scene}` |
| GET `/api/games/:saveId/receipts/:key` | games.ts:24 | session | `{status: 'confirmed' \| 'unknown', receipt, revision}` |
| GET `/api/games/:saveId/story?before` | games.ts:50 | session | `{items: [{receipt, text, source}], nextBefore}`, or 503 `STORY_HISTORY_DISABLED` (always in production) |
| GET `/api/games/:saveId/action-suggestions` | games.ts:64 | session | `{status: 'ready', revision, actions: [{id, kind, label, text, intent?}]}` |
| GET `/api/games/:saveId/npcs/:npcId/memory-recall?utterance` | games.ts:78 | session, quota 60/h | `{recall}` (memory subsystem, covered by another agent) |
| POST `/api/games/:saveId/turns` `{text, expectedRevision, idempotencyKey, clarificationOf?, requestNarrative?}` | games.ts:111 | session + Origin, quota `turn` 30/min | `ServerTurnResult` |

### 2.4 Error mapping

- **Turn results** (turn-http.ts L6–17):

  | Result | HTTP | Code |
  |---|---|---|
  | `not_found` | 404 | `NOT_FOUND` |
  | `client_archive` | 400 | `CLIENT_ARCHIVE_NOT_AUTHORITATIVE` |
  | `rules_not_ready` | 503 | `RULES_NOT_READY` |
  | `version_mismatch` | 409 | `VERSION_MISMATCH` |
  | `idempotency_conflict` | 409 | `IDEMPOTENCY_CONFLICT` |
  | `clarification_conflict` | 409 | `CLARIFICATION_CONFLICT` |
  | `revision_conflict` | 409 | `REVISION_CONFLICT` with `currentRevision` |
  | anything else | 200 | the full result |

  Any thrown error becomes 503 `TURN_UNAVAILABLE`, or `SAVE_SCHEMA_NOT_READY` (games.ts L145–148, turns.ts L33–36).
- **Save errors** (saves.ts L80–94):

  | Error | HTTP | Code |
  |---|---|---|
  | `SaveSchemaNotReadyError` | 503 | `SAVE_SCHEMA_NOT_READY` |
  | `CloudCapacityError` | 413 | `CAPACITY_EXCEEDED` |
  | `DATA_POLICY_NOT_READY` | 503 | `DATA_POLICY_NOT_READY` |
  | `TypeError` | 400 | `INVALID_SAVE` |
  | anything else | 500 | `INTERNAL_ERROR` |
- **Bodies:**
  - `readJson` streams the body with a byte cap: 1 MB for saves, 64 KB for game turns, 16 KB for `/api/turns` and game creation, 4 KB for auth and account (saves.ts L29–68, auth.ts L139–150).
  - Unknown keys are rejected by explicit allow-lists.

### 2.5 Configuration (environment variables read by the in-scope files)

| Group | Variables | Read at |
|---|---|---|
| Host | `API_PORT`, `API_HOST`, `DATABASE_URL`, `NODE_ENV` | index.ts |
| Host | `STORY_ARCHIVE_ENABLED`, `ACCOUNT_ERASURE_DATABASE_URL`, `AUTH_MAIL_PREFLIGHT` | index.ts |
| Rules | `JIUXIAO_RELEASE_CHANNEL` (`preview-1`), `TURN_RULES_MODULE`, `TURN_RULES_APPROVAL_PATH` | preview-release-runtime.ts L16–20 |
| Narration | `NARRATIVE_CONFIG_PATH`, `NARRATIVE_OUTPUT_BUDGET` (default 32768) | index.ts L59 |
| Auth | `AUTH_ENABLED` xor `SUPABASE_AUTH_ENABLED`, `AUTH_PUBLIC_ORIGIN` (exact HTTPS) | auth-runtime.ts L18–166 |
| Auth | `AUTH_SECRET` (≥32 B), `AUTH_COOKIE_SAME_SITE`, `AUTH_TRUSTED_PROXY_ADDRESSES` (≤8 IPs) | auth-runtime.ts |
| Auth | `AUTH_PRIVACY_POLICY_URL` and `AUTH_PRIVACY_POLICY_VERSION` (required in production) | auth-runtime.ts |
| Mail | `AUTH_MAIL_FROM`, `AUTH_MAILER` (`ses-api` or `smtp`), `SMTP_URL`, `AUTH_SES_TEMPLATE_*` | auth-runtime.ts |
| Captcha | `TURNSTILE_SECRET_KEY` | auth-runtime.ts |
| Accounts | `ACCOUNT_DELETE_ENABLED`, `ACCOUNT_DATA_POLICY_PATH` / `_VERSION` | auth-runtime.ts |
| Supabase and SMS | `SUPABASE_*`, `SMS_*` hard limits, `AUTH_IDENTITY_HMAC_SECRET` | auth-runtime.ts |

---

## 3. Gameplay data flow

### 3.1 Create a game: `POST /api/games`

**Route** (games.ts L151–176):
- Body `{idempotencyKey: /^\w[\w-]{7,199}$/, choices: object}`, at most 16 KB.
- Result mapping:

  | Service result | HTTP | Code |
  |---|---|---|
  | `rules_not_ready` | 503 | `RULES_NOT_READY` |
  | `invalid_character_profile` | 400 | `INVALID_CHARACTER_PROFILE` |
  | `invalid_memory_mode` | 400 | `INVALID_MEMORY_MODE` |
  | `conflict` | 409 | `IDEMPOTENCY_CONFLICT` |
  | `CloudCapacityError` | 413 | `CAPACITY_EXCEEDED` |

**`AuthoritativeGameService.create`** (authoritative-game.ts L42–67):
1. No runtime → `rules_not_ready`.
2. `choices.characterProfile` is split off. It must pass `isCharacterProfile`: at most 5 fields from `name/personality/origin/appearance/goal`, within length limits, at most 4 KB (contracts `character-profile.ts` L2–15).
3. `memoryMode` comes from `choices.memoryMode ?? 'continue'` and must parse as `MemoryModeSchema` (`continue` or `forgetting`).
4. **Idempotency:**
   - `hash = sha256(canonicalJson(choices))`
   - `saveId = 'game-' + sha256(owner \0 key)`: deterministic per owner and key (L50–51).
   - If the save already exists, the call is a replay only when `facts.creationRequestHash === hash`; otherwise `conflict` (L53–58).
5. **Canon identity:** `canonArtifactHash` is the SHA-256 of the bytes of `packages/content/src/canon-runtime.json`, re-read on every create (L14–17).
6. **Initial state:** `runtime.initialState({ownerId, saveId, choices})`. The P1 plugin ignores `choices` and builds:
   - `createP1InitialState` (p1-rule-semantic-functions.ts L19–52) produces `playerId = 'player-' + sha256(owner \0 saveId)[0:24]`, `locationId = rulebook.initialKnownLocationIds[0]`, `elapsedMinutes = 0`, and the full P1 facts, with `gameMinute = 300`.
7. **Envelope:** `SaveEnvelopeV3`:
   - `schemaVersion: 3`, `revision: 0`
   - `ruleVersion`/`canonVersion` from the rules, plus `canonArtifactHash`
   - `memoryMode` and the pinned `memoryPolicy` (from `createP1SaveMemoryPolicy`)
   - `branchId: 'root'`, `parentBranchId: null`, `forkRevision: 0`
   - `facts.creationRequestHash` (L63)
8. **Persist:** `repository.createForOwner(owner, save, profile)` (postgres-cloud-save-repository.ts L189–217):
   1. per-owner `pg_advisory_xact_lock`
   2. duplicate check
   3. account usage and quota (20 saves, 1 MB per save, 10 MB total, or the data-policy values)
   4. `INSERT INTO game_saves ... SELECT ... FROM live_account (auth_accounts closed_at IS NULL FOR KEY SHARE) ON CONFLICT (id) DO NOTHING`
   5. If the insert loses a race, the winner is re-read and replayed (L64–66).

The character profile is stored in `game_saves.character_profile` and is never read by the rules.

### 3.2 Submit a turn: HTTP request → rules → commit → narration

**Route** `POST /api/games/:saveId/turns` (games.ts L111–149):
1. Resolve the owner.
2. `consumeAccountQuota(owner, 'turn', 30, 60s)`. This uses the PostgreSQL table `account_rate_limits` and fails closed (account-rate-limit.ts L18–26).
3. `readJson(64 KB)` and the allow-list `text, expectedRevision, idempotencyKey, clarificationOf, requestNarrative`; `text` is 1–8000 chars.
4. `service.read(owner, saveId)` checks ownership and that the save is not a client archive.
5. The intent is built **on the server** as `ActionIntent {kind: 'free_text', saveId, actorId: save.state.playerId, branchId: 'root', expectedRevision, idempotencyKey (z.uuid), clarificationOf?, payload: {text}}`.
6. `turns.execute(owner, intent, requestNarrative !== false, req.signal)`.

The alternative route, `POST /api/turns` (turns.ts L12–37), takes a client-built `ActionIntent` of any kind (`move`, `cultivate`, `acquire_item`, `use_item`, `talk`, `observe`, `combat`, `quest`, `free_text`; contracts action.ts L16–28). Its narration flag defaults to **false**.

**`ServerTurnService.execute`** (server-turn.ts L67–139):

1. **Parse and gate.** `ActionIntentSchema.parse`; no rules → `rules_not_ready` before anything is read (L69–71).
2. **Load the save** with `loadSave`. This is `PostgresCloudSaveRepository.getForOwner`, which excludes trashed saves, followed by **`SELECT verify_turn_event_chain(saveId)`**. A broken chain throws `EVENT_INTEGRITY_FAILED` (postgres-server-turn.ts L25).
3. **Fail-closed checks.**
   - A client archive (`facts.archiveKind === 'local-untrusted-v1'`) → `client_archive`.
   - `playerId !== actorId` → `not_found` (L76–77).
4. **Prior receipt** for this key: `getReceiptForOwner` reads `turn_requests` joined to `game_saves.owner_id`, excluding trash (npc-memory-turn-transaction.ts L129–140).
5. **Version and revision checks.**
   - The rules' `ruleVersion`, `canonVersion` and `memoryPolicyVersion` must equal the save's, else `version_mismatch` (L79–80).
   - With no prior receipt and `expectedRevision ≠ save.revision` → `revision_conflict {currentRevision}` (L81–83).
6. **Clarification follow-up.** When `clarificationOf` is set, the referenced receipt must be a `clarify` decision for the same save, rules version and current revision (L84–90, L212–229).
7. **`prepareTurn`** (domain event-log.ts L86–167):
   - `requestFingerprint` = `'sha256:v1:' + sha256(canonical intent without branchId: 'root')`.
   - Same key with the same fingerprint → `duplicate`; with a different fingerprint → `idempotency-conflict`.
   - Otherwise `decide(intent, save)`:
     - For `free_text`: `resolveFreeText` (p1-nlu-runtime.ts L178–249) maps exact phrases, or runs `parseActionText` against the **visible** target catalog, to a structured intent. Text it cannot parse becomes a generic `clarify` that does not echo the utterance.
     - Then the P1 rule module runs: `evaluate` in domain rules.ts L60–110, via p1-prologue-plugin.ts L67–76. It receives deterministic event IDs derived from `(saveId, key, index)` and `occurredAt = now`.
   - An accepted decision is replayed through `reduce` (`createPrologueV1EventReducer`, which applies each event's `payload.stateDelta` as compare-and-set) to produce the next save. The receipt is `TurnReceiptV2` with `clockMinute = facts.gameMinute` and `rng {seed: null, draws: 0}`.
8. **Rejected or clarify → receipt only.** `recordNonAcceptedDecision` takes a transaction with the `auth_accounts` live check and `game_saves FOR UPDATE`, re-checks prior receipt and revision, then **`INSERT INTO turn_requests(save_id, idempotency_key, expected_revision, result)`** (npc-memory-turn-transaction.ts L170–233). HTTP 200 `{status: 'decision', receipt}`; revision unchanged.
9. **Accepted → one atomic commit.**
   - Read the NPC journal. If `journal.revision ≠ save.revision`, re-check for a winning receipt, otherwise `revision_conflict` (L107–120).
   - `prepareNpcMemoryTurn` computes the next journal and the authorized observations.
   - `commitAcceptedTurn` (npc-memory-turn-transaction.ts L271–448) does, in one transaction:
     1. `BEGIN`
     2. `auth_accounts ... FOR UPDATE` (or `FOR KEY SHARE`) live check
     3. `game_saves FOR UPDATE`
     4. prior receipt check, **before** the revision check, so a lost reply can be retried safely
     5. revision check
     6. pinned-field checks (schema version, memory policy, lineage, canon artifact hash, `branchId = root`)
     7. data-policy quota guard (postgres-server-turn.ts L10–23)
     8. journal `FOR UPDATE` and compare
     9. `INSERT turn_requests`
     10. `INSERT turn_events` with `sequence = max + 1`; a trigger fills `previous_hash` and `event_hash` (drizzle 0013 L29–38)
     11. `INSERT npc_authorized_observation_outbox` and `npc_memory_observation_supersessions`
     12. `UPDATE game_saves SET revision, snapshot, ... WHERE id AND owner_id AND revision = expected`
     13. `UPSERT npc_memory_journals`
     14. `COMMIT`
10. **`completed()` — narration only after the commit** (server-turn.ts L141–209):
    - If narration was requested: log `narrative_status = 'generating'` on `turn_requests` (postgres-server-turn.ts L32–37).
    - Build the context from the receipt and authorized NPC recall.
    - Call the narrator with `structuredClone(receipt)`, a timeout (**120 s in production**, index.ts L76) and the HTTP request's abort signal. On failure, fall back to the deterministic text (p1-prologue-plugin.ts L103–185).
    - Log `received`, `timeout`, `cancelled` or `unavailable`.
    - Narration failure never rolls back the turn.
    - Return 200 `{status: 'accepted', duplicate, receipt, narrative: {status: 'not_requested'} | {status: 'received', text, source: 'model' | 'deterministic'} | {status: 'failed', code}}`.

**Tables touched by one accepted turn:**
- `turn_requests` (primary key `(save_id, idempotency_key)`, `result` jsonb, `narrative_*`) (schema.ts L150–159)
- `turn_events` (`id`, `save_id`, `idempotency_key`, `sequence`, `event_type`, `payload`, `previous_hash`, `event_hash`, ...; `branch_id = 'root'` check) (schema.ts L161–180)
- `game_saves` (`revision` and `snapshot` jsonb)
- `npc_memory_journals`
- `npc_authorized_observation_outbox`
- `npc_memory_observation_supersessions`
- `story_narratives`, only when the story archive is enabled, which is never in production

### 3.3 Idempotency, recovery and conflicts

- **Turn key:** a UUID per submission (contracts action.ts L10).
  - Receipts are unique per `(save_id, idempotency_key)`.
  - A resend with an identical body returns the stored receipt with `duplicate: true` and regenerates narration if requested (server-turn.ts L105).
  - A changed body under the same key returns 409 `IDEMPOTENCY_CONFLICT`.
  - Receipts store only the fingerprint, never the raw utterance (contracts turn.ts L5–8).
- **Lost response:**
  - Option 1: resend the same request.
  - Option 2: `GET /api/games/:saveId/receipts/:key` returns `confirmed` with the receipt, or `unknown`. The code comment warns that `unknown` does not prove the turn was never executed (games.ts L23).
  - The 120-turn integration test with injected lost replies passes replay checks (server-turn.integration.test.ts L165–186).
- **Revision conflicts:** 409 `REVISION_CONFLICT {currentRevision}`. The client must re-read `GET /api/games/:id` and resubmit with a new key.
- **Concurrency:** 10 racing identical requests produce exactly one commit (server-turn.integration.test.ts L48–65).
- **Game creation:** the key maps deterministically to `saveId`, so a replay returns 200 `duplicate: true`.
- **Client archive saves:** classic compare-and-swap, `PUT` with `expectedRevision` and `next.revision = expected + 1` (cloud-save-service.ts L116–123).

---

## 4. State the client can observe

### 4.1 `GET /api/games/:saveId` (games.ts L43, authoritative-game.ts L21–31)

```ts
{ save: SaveEnvelopeV3,                         // full authoritative snapshot, unfiltered
  characterProfile?: {name?, personality?, origin?, appearance?, goal?},   // contracts character-profile.ts:2-4
  latestReceipt: TurnReceipt | null,            // latest ACCEPTED receipt only (postgres-cloud-save-repository.ts:289-299)
  opening: string[],                            // prologue paragraphs, only when rule/canon match P1 approval (authoritative-game.ts:27-28)
  scene: { location: string /* label or '当前场景' */, inventory: {name: string, quantity: number}[] } }  // :30
```

**`SaveEnvelopeV3`** (contracts save.ts L64–90):
- `schemaVersion: 3`, `saveId`
- `canonVersion`, `canonArtifactHash`, `ruleVersion`
- `memoryPolicyVersion`, `memoryMode` (`continue` | `forgetting`), `memoryPolicy` (save.ts L11–23)
- `branchId`, `parentBranchId`, `forkRevision`, `createdPolicyVersion`, `sourceMigrationId`
- `revision`
- `state: WorldState`

**`WorldState`** (contracts world.ts L4–10): `{playerId, locationId, elapsedMinutes, facts: Record<string, unknown>}`. Facts are bounded at 256 KB.

**P1 facts** (`PrologueV1FactsSchema`, contracts prologue.ts L44–83), grouped by what a UI could show:

| UI concern | Fields |
|---|---|
| Time | `gameMinute` (the only authoritative clock; `readGameMinute`, event-log.ts L214–220) |
| Position | `locationId` (on `state`), `currentSublocationId` (child spot or null) |
| NPC presence | `npcPresence: id[]` (global presence list, not filtered to the current location) |
| Vitals | `stamina` 0–100, `staminaDayIndex`, `spiritStamina` 0–100, `fatigueCount`, `injuryFlags: id[]` |
| Cultivation | `cultivationProgress` 0–10000, `knownTechniques` |
| Inventory | `inventory: {itemId, quantity}[]` (≤8 stacks), `collectedSources`, `effectFlags` |
| Knowledge | `clues: id[]`, `observationLog: {targetId, method: scan\|study, result: found\|none\|blocked, clueId?, blockedReason?, clueLevel?}[]` |
| Social | `npcInteractionLog: {npcId, topicTag, outcome: on_topic\|idle\|refuse}[]`, `idleCount` |
| Map | `knownLocations` (≤3), `locationGraph: {from, to, state: open\|blocked\|locked, via?}[]`, `travelLog: {toward, reason: rockslide\|unexplored}[]` |
| World flags | `questState {status: unavailable\|completed, rewardClaimed}`, `obstacleState: blocked\|cleared`, `ferryState: aground\|clear` |
| Storage metadata | `creationRequestHash` (not gameplay) |

**Mechanics constants a UI can derive meters and clocks from** (content `rules/prologue-v1.constants.ts` L7–29):

| Constant | Value |
|---|---|
| 1 刻 (kec) | 15 game minutes |
| Day | 96 刻 |
| Start time | game minute 300 |
| Dusk | 刻 index 48 |
| `STAMINA_MAX` / `SPIRIT_MAX` | 100 / 100 |
| `CULTIVATION_MAX` | 10 000 |
| Cultivation gain | +800 per 刻 |
| Move cost | 5 stamina |
| Combat cost | 25 stamina |

Domain helpers:
- `readKecClock` → `{gameDayIndex, kecIndex, label: '第N刻'}` (prologue-v1-time.ts L87–94)
- `isDaylight` (L75–85)
- `projectDailyStamina` (L52–72)

### 4.2 Receipts and events (every turn response, `latestReceipt`, `/receipts/:key`)

**`TurnReceipt` v2** (contracts turn.ts L31–39): `{idempotencyKey, saveId, requestFingerprint, clarificationOf?, branchId: 'root', rulesVersion, clockMinute, rng: {seed, draws}, decision, resultingRevision}`.

**`decision`** (contracts decision.ts L39–95) is one of:
- `accepted`: `{outcome: success | legal_failure, code?: RULE_*, events: DomainEvent[], nextRevision}`
- `rejected`: `{code: INPUT_* | AUTH_* | ENV_* | RULE_TARGET_MISMATCH, message, revision}`
- `clarify`: `{question, missingSlots, candidates [{kind, label, slots}] (≤4), interactionId, revision}`

**`DomainEvent`** (contracts event.ts L4–24): `{id, saveId, type, beforeRevision, afterRevision, occurredAt, source: 'RULES', ruleVersion, payload, branchId: 'root'}`.

**Every P1 event payload also carries `stateDelta`** (domain prologue-v1-rules.ts L229): `{timeChange, locationChange: {before, after} | null, factChanges: [{key, before: {present, value?}, after}]}` (contracts state-delta.ts L4–14). These are machine-readable diffs a client can animate.

**P1 event types and payloads** (prologue-v1-rules.ts):

| Event | Payload | Lines |
|---|---|---|
| `move.arrived` | `{from, to, destinationId?, fromSublocationId?, toSublocationId?, kecCount}` | L311–314, L325–327, L383–385 |
| `move.blocked` | `{toward, reason: unexplored \| rockslide, kecCount}` | L340, L374 |
| `move.bypassed` | `{from, to, via, routeId?, kecCount: 2, extraKecCount: 1}` | L363–367 |
| `cultivate.attempted` | `{techniqueId, kecCount, requestedKecCount, attemptedKecCount, result: progress \| fatigue}` | L413–421 |
| `item.acquired` | `{itemId, quantity, source, sourceId, kecCount}` | L439 |
| `item.consumed` | `{itemId, quantity: 1, effect[], kecCount}` | L467 |
| `item.depleted` | `{itemId}` | L470 |
| `talk.occurred` | `{npcId, topicTag, outcome, kecCount}` | L494 |
| `talk.topic_learned` | `{npcId, clueId}` | L502 |
| `observe.result` | `{targetId, method, result, kecCount, clueId?, clueLevel?, blockedReason?}` | L548–553 |
| `combat.resolved` | `{targetId, outcome: retreat \| clear \| clear_wounded, ruleVersion, kecCount: 2}` | L601 |
| `quest.completed` | `{questId}` | L607, L647 |
| `quest.reward_claimed` | `{questId, rewardItemId, sourceId, quantity, kecCount}` | L638 |

### 4.3 Other read surfaces

- **Action suggestions:** `{revision, actions: [{id, kind, label, text, intent?}]}` (approved-player-actions.ts L14–31, p1-nlu-runtime.ts L31–37, L134–175).
  - Covers present NPCs and their topics, reachable combat targets, uncollected item sources, return-to-location, quest claim, known-location moves, sublocations, scan/study observation targets, and item uses.
  - At most 32 rows from the parser, plus approved additions.
- **Story history:** `{items: [{receipt, text | null, source}], nextBefore}` (story-archive.ts L21–42). Disabled in production.
- **Cloud saves:** `/api/saves` returns full envelopes. The index and trash return `{saveId, name, revision, deletedAt?}`.

### 4.4 What is NOT available to a client today

- No event or receipt history in production: only `latestReceipt`, and `/story` is disabled (index.ts L32).
- No label catalog: only `scene.location` and inventory names are labelled on the server (`approvedLabel`, approved-player-actions.ts L5–8). Clue, NPC, location and sublocation IDs arrive raw.
- No server-side visibility projection: the full `facts`, including the global `npcPresence` and the whole `locationGraph`, is returned.
- No push or stream channel: narration blocks the POST for up to 120 s.

---

## 5. Boundaries and invariants the redesign must keep

1. **Identity is server-derived only.**
   - The session token is a 32-byte random value; only its SHA-256 is stored (email-auth.ts L49, L96–97).
   - Owner IDs are never taken from body, query or envelope (saves.ts L9–10, cloud-save-service.ts L58–61). Tests exist for owner injection (turns.test.ts L31–37, account.test.ts L10).
   - Writes need the exact `Origin` (auth.ts L49–51).
   - Account lifecycle routes refuse guest sessions (account.ts L10–14).
2. **The client submits only intents or text.**
   - Decisions, events, state and visibility are produced on the server (turns.ts L10).
   - `actorId` is taken from the save on the games route (games.ts L133).
   - Requests containing `state` or `events` are rejected (turns.test.ts L33).
3. **Client saves can never become authoritative.**
   - In production the cloud-save service is `archiveOnly`: it accepts only v1 envelopes with `facts.archiveKind = 'local-untrusted-v1'` and an owner-hash-scoped ID (cloud-save-service.ts L86–91, L110–115; index.ts L71).
   - Turn and game paths refuse archives (server-turn.ts L75–76, authoritative-game.ts L23, L37).
   - Trash and restore apply only to v1 archives (cloud-archive-lifecycle.ts L32–33).
4. **Facts are written only by signed rules.**
   - The plugin must match pinned digests or an approval file; anything else fails closed to `RULES_NOT_READY` (turn-runtime.ts L49–92, preview-release-runtime.ts L16–47, author-rules-gate.ts L28–34, p1-review-rule-approval.ts L48–60).
   - Deltas are compare-and-set, with protected keys `archiveKind`, `localArchive`, `creationRequestHash` and the prototype keys (contracts state-delta.ts L11; domain state-delta.ts L3–12).
   - The reducer verifies before/after hashes (rule-resolver.ts L32–37).
5. **The AI never decides or writes facts.**
   - Natural-language parsing is deterministic template matching (p1-nlu-runtime.ts, gameplay-runtime.ts L6–22).
   - The narrator runs only after the commit, gets a cloned receipt and a filtered context, and returns text only (at most 100 000 chars). Its failure, timeout or cancellation cannot roll back the turn (server-turn.ts L141–209).
   - Deterministic fallback text is drawn only from the receipt and authored content (p1-prologue-plugin.ts L182–184).
   - The rules use no randomness (`rng {seed: null, draws: 0}`, event-log.ts L129).
6. **Pinned save identity.** Schema version, memory policy, branch lineage and `canonArtifactHash` are immutable after creation, and only `branchId = 'root'` exists (postgres-cloud-save-repository.ts L241–256, npc-memory-turn-transaction.ts L317–333).
7. **An append-only, hash-chained event log.**
   - `turn_events` cannot be updated; the chain is verified before each turn (drizzle 0013 L23–45, postgres-server-turn.ts L25).
   - Deletes are refused unless the session runs under the erasure setting (data-policy.integration.test.ts L19).
8. **Live account.** Writes require `auth_accounts.closed_at IS NULL` under `FOR KEY SHARE` or `FOR UPDATE` (postgres-cloud-save-repository.ts L200, npc-memory-turn-transaction.ts L185–189).
9. **Quotas, all shared in PostgreSQL and failing closed.**
   - **Turns:** 30/min per owner, one bucket shared by both turn routes (games.ts L114, turns.ts L20).
   - **Requests:** recall 60/h (games.ts L81); account export 6/h (account.ts L18).
   - **Auth:**
     - guest creation 3/h per IP-HMAC (postgres-email-auth.ts L99–107)
     - mail 600/h global (L15–16), 60/h per IP (L37–40), 6/h and 1/min per email (L21–25)
     - five attempts per code (L68)
     - account operations 6/h (account-lifecycle.ts L41–42)
   - **Storage:** cloud capacity 20 saves, 1 MB per save, 10 MB total, or the data-policy values (postgres-cloud-save-repository.ts L90–92, L107–119), also enforced on turn commits (postgres-server-turn.ts L10–23).
10. **Data protection.**
    - Production writes require an approved, unexpired data policy co-signed by two named approvers (data-policy.ts L5, L10–12; policy-cloud-save-repository.ts L13–21).
    - Receipts carry a fingerprint, not the utterance (contracts turn.ts L5–8); unparseable text is not echoed (p1-nlu-runtime.test.ts L143–151).
    - Error bodies never include provider or database details (app.integration.test.ts L34–41, server-turn.test.ts L120–122).
    - The export omits OTP digests and token hashes (account-export.ts L2, L12).
    - Retention purge touches only expired client archives with no turns (data-retention.ts L3–12).
    - Production refuses a story archive (index.ts L32).

---

## 6. Problems found

### Bugs and risks with direct evidence

| # | Issue | Evidence |
|---|---|---|
| B1 | **A non-UUID `clarificationOf` returns 503 instead of 4xx.** The contract allows any 1–128-char string (contracts action.ts L12). `execute` calls `getReceiptForOwner(owner, saveId, intent.clarificationOf)` **before** the UUID check in `isCurrentPriorClarification` (server-turn.ts L84–86 vs L220). The PostgreSQL repository throws `TypeError('Invalid turn identity')` for non-UUID keys (npc-memory-turn-transaction.ts L131), and the route maps that to 503 `TURN_UNAVAILABLE` (games.ts L145–147). The in-memory unit tests do not throw, so this is missed. **Repro:** `POST /api/games/:id/turns {text, expectedRevision, idempotencyKey: <uuid>, clarificationOf: "x"}` against PostgreSQL. | listed |
| B2 | **The Turnstile captcha can be bypassed.** `/api/auth/code` skips the captcha whenever *any* session resolves, including guest sessions (auth.ts L80–82). Guest sessions need no captcha (auth.ts L56–72) and allow 3/h per IP (postgres-email-auth.ts L105). About 10 IPs (60 codes per IP per hour, L40) can exhaust the **global 600 mails/h** budget (L15–16), denying email login to real users. | listed |
| B3 | **Rate-limit identity collapses behind a proxy.** If the Node host sits behind a reverse proxy and `AUTH_TRUSTED_PROXY_ADDRESSES` is unset, every client gets the proxy's address (auth.ts L161–168). Guest creation then becomes 3/h *globally*. Only phone auth requires the trusted-proxy setting (auth-runtime.ts L131). | listed |
| B4 | **Narration timeout does not match its comment.** The SEC-08 comment says requests are held up to 20 s (turns.ts L19); production passes 120 000 ms, the allowed maximum (index.ts L76, server-turn.ts L62). Thirty turns/min per owner can each hold a request for 2 minutes. | listed |
| B5 | **`GET /api/games/:id` spuriously returns 503.** The save and the latest receipt are read in two separate statements, not one snapshot. A commit in between throws `GAME_CHANGED_DURING_READ` → 503 (authoritative-game.ts L22–26, games.ts L44–47). It is not retried. | listed |
| B6 | **Turn cost grows as O(n²) over a game.** `verify_turn_event_chain` walks every event of the save on every turn (postgres-server-turn.ts L25, drizzle 0013 L40–45). The games route also reads the save twice per turn, plus the receipt and profile (games.ts L128, then server-turn.ts L72). | listed |
| B7 | **Retries regenerate narration.** Duplicate retries call the narrator again (server-turn.ts L101, L105, L116), so the same receipt costs model tokens again and gets different prose. No narration persists in production (index.ts L32). | listed |
| B8 | **Quota is spent before validation.** It is consumed before body parsing (games.ts L114 before L115; turns.ts L20), so malformed requests burn the 30/min budget. | listed |
| B9 | **Unthrottled endpoints.** `POST /api/games`, `GET /api/games/*` and `/api/saves*` have no per-owner quota. Every request from a guest also writes `last_seen_at` (postgres-email-auth.ts L162–164). | listed |
| B10 | **Guest upgrade keeps the session token.** It changes privilege without rotating the token and sends no `Set-Cookie` (postgres-email-auth.ts L142–150, auth.ts L107–110). Low risk. | listed |
| B11 | **Preview plugin integrity check has a gap.** It hashes the plugin file bytes, then `import()`s the same path (preview-release-runtime.ts L30–32), so there is a TOCTOU window and transitive imports are not byte-hashed (the semantic digest partly covers them). Low risk because the file is local to the host. | listed |

### Inconsistencies and dead code

| # | Issue | Evidence |
|---|---|---|
| I1 | **The two turn endpoints have different contracts.** | body cap 16 KB vs 64 KB (turns.ts L21 vs games.ts L115); text ≤8000 chars only on games (games.ts L120), the schema has no maximum (action.ts L27); `requestNarrative` defaults to false vs true (turns.ts L30 vs games.ts L142) |
| I2 | **Runtime imports reach into other packages' files by relative path.** Reason: the contracts index does not export `character-profile` (contracts src/index.ts L1–10; `exports` has only `"."`). This ties the runtime to the monorepo layout and build order. | `'../../../../packages/contracts/dist/character-profile.js'` (postgres-cloud-save-repository.ts L1, policy-cloud-save-repository.ts L2, authoritative-game.ts L10); `packages/content/dist/` (p1-prologue-plugin.ts L23, p1-nlu-runtime.ts L60); `packages/content/src/canon-runtime.json` (authoritative-game.ts L15); `scripts/*.mjs` spawned (turn-runtime.ts L95, L107) |
| I3 | **Production code uses the "non-production" content surface.** `@jiuxiao/content/p1-review-candidate` is labelled an "explicit, non-production import surface" (content p1-review-candidate.ts L1). | authoritative-game.ts L8, approved-player-actions.ts L2 |
| I4 | **The shared error contract is unused.** `ErrorCodeSchema` / `ApiErrorSchema` (7 codes, message required; contracts errors.ts L3–12) are used nowhere. The API emits about 40 ad-hoc codes, mostly without a message. `onError` maps every uncaught error, bugs included, to 503 (retryable) (auth.ts L54); without the auth layer, Hono's default 500 applies. | listed |
| I5 | **Entitlement ledger is dead in HTTP.** `EntitlementLedgerService` and `PostgresEntitlementLedgerRepository` are not referenced by index.ts, app.ts or the routes (grep). `purgeExpiredArchives` runs only from `scripts/api-retention.mjs`. | grep |
| I6 | **`/api/saves` mixes record kinds.** It lists authoritative v3 game saves with full snapshots (no `archiveKind` filter, postgres-cloud-save-repository.ts L162–168), while `/api/save-index` lists archives only (L153–160). | listed |
| I7 | **The `cultivate.payload.minutes` field actually counts 刻.** | action.ts L20 vs prologue-v1-rules.ts L396–397: `minutes: 9` → "每次修炼最多八刻" |
| I8 | **Two "action rules version" identities.** | `AUTHOR_RULES_GATE` uses `'prologue-v1-candidate-20261005'` (author-rules-gate.ts L29–30); P1 approval uses `'p1-actions-a4b8fbf7e6120840'` (p1-review-rule-approval.ts L57). The preview path checks only `gate.status` (preview-release-runtime.ts L29). |
| I9 | **Stale docstring.** | "Production never calls this loader while AUTHOR_RULES_GATE is closed" (p1-nlu-runtime.ts L54–58), but the gate is `APPROVED_BY_OWNER` (author-rules-gate.ts L31) and `connectActionTextRuntime` loads the parser for every plugin (gameplay-runtime.ts L10–11) |
| I10 | **Test fixture drift.** | the `forgetting` `memoryPolicy` in games.test.ts L29 does not satisfy the strict `SaveMemoryPolicySchema` (save.ts L11–23); it passes only because the service is mocked |
| I11 | **Pending clarifications are not recoverable from the game read.** `latestReceipt` is the last *accepted* receipt (postgres-cloud-save-repository.ts L292), so after a reject or clarify, `GET /api/games/:id` shows an older receipt. The client must remember the key and use `/receipts/:key`. | listed |

### Open questions

- **Q1. Which host serves gameplay in production?** `wrangler.jsonc` routes `play.jiuxiaogame.cn/api/*` to the Worker, which never mounts turns or games (worker.ts L179–183). Either Node serves `/api/games*` on another route, or gameplay 404s on the Worker. Not verified.
- **Q2. Do the suggestion texts parse?** Approved suggestions are sent back as free text: `拾取X`, `领取任务奖励`, `返回X` (approved-player-actions.ts L25–30). I did not verify that the parser templates accept them; they may come back as `clarify`. The structured `intent` on a suggestion can only be sent through `/api/turns`.
- **Q3. Which canon artifact is the hash of?** `canonArtifactHash` hashes the file bytes on each create (authoritative-game.ts L14–17), independently of whatever Canon the loaded rules actually used. The two are not cross-checked.

---

## 7. Extension points for a richer client

All new routes should follow the `mountGames` pattern:
- `resolveOwner` with the `X-Jiuxiao-Account` check
- `consumeAccountQuota`
- `readJson` byte caps
- `serverTurnHttpResponse` mapping

They should only read committed rows. Nothing below needs a rules change unless it is marked **[rules]**.

1. **A view projection: `GET /api/games/:id/view`.**
   - Return a labelled, visibility-filtered projection instead of raw facts:
     - location, sublocation and their labels, resolved through `approvedLabel` / `labelFor` (approved-player-actions.ts L5–8, p1-nlu-runtime.ts L88–99)
     - the clock and daylight (`readKecClock` / `isDaylight`)
     - stamina and spirit against their maximums
     - cultivation against `CULTIVATION_MAX`
     - NPCs present *here* (`npcPresence ∩ rulebook.npcs[locationId]`, as in p1-nlu-runtime.ts L113–117)
     - exits from `locationGraph` limited to `knownLocations`
     - labelled clues
     - quest, obstacle and ferry state
   - This also fixes the spoiler exposure noted in 4.4.
   - Alternative: a static `GET /api/content/labels?canonArtifactHash=` catalog.
2. **Event and receipt history: `GET /api/games/:id/events?afterRevision&limit`.**
   - Page through `turn_events`, or `turn_requests.result` for accepted and rejected receipts. The rows are owner-scoped and hash-chained, and this works even with the story archive disabled.
   - It lets the client replay, rebuild a timeline and draw the travel map from `travelLog` and `move.*` events.
   - The repository needs a read method; `StoryArchive.read` (story-archive.ts L21–42) is a template.
3. **Event stream: SSE on `/api/games/:id/stream`, or split the POST.**
   - Return the committed receipt immediately (`requestNarrative: false`).
   - Stream `turn.committed` → `narrative.status` → `narrative.text` separately.
   - Hook points already exist: `recordNarrativeStatus` calls (server-turn.ts L150–151, L206) and the `turn_requests.narrative_*` columns.
   - Durable narration text needs `story_narratives` (schema.ts L285–294), which production currently refuses (index.ts L32); enabling it needs a separate approval.
   - The POST would stop blocking for 120 s, and B7 would be fixed if text is cached per receipt.
4. **3D scene and animation.**
   - Drive the scene from `receipt.decision.events[].type` plus `payload.stateDelta` (4.2): `locationChange` for camera moves, `factChanges` for stamina, cultivation, inventory and clues, and `kecCount` for time-lapse.
   - Use `locationId` and `currentSublocationId` as asset keys. A scene manifest exists in `packages/content/src/scenes/manifest.ts` (not read).
   - Presentation must not invent outcomes; it only plays back committed events.
5. **Maps.**
   - Use `locationGraph` (edge states `open`/`blocked`/`locked`, `via`), `knownLocations`, `travelLog`, and the `move.blocked` / `move.bypassed` payloads.
   - Unexplored edges live only in the rulebook (prologue-v1-rules.ts L332), so fog of war needs a view endpoint that withholds unknown nodes.
6. **Breakthrough ceremonies.**
   - P1 has no breakthrough event. `cultivate.attempted` plus the `cultivationProgress` factChange, ending at 10 000 with `ENV_CULTIVATION_COMPLETE` (prologue-v1-rules.ts L392), is the only signal.
   - A client may stage a ceremony when it sees that threshold crossed in a committed delta.
   - A real realm advance needs a new signed event type **[rules]**. That means a new rulebook entry and a re-signed `semanticSha256` (p1-review-rule-approval.ts L54), because `PROLOGUE_EVENT_TYPES` is a closed set (prologue-v1-rules.ts L267–272).
7. **Structured action UI.**
   - Use `/action-suggestions` IDs and labels.
   - Show the `clarify` candidates, `missingSlots` and `interactionId`, and send the follow-up with `clarificationOf`. B1 should be fixed first.
   - A unified turn endpoint that accepts either `{text}` or `{intent}` would remove I1.
8. **Recovery UX.**
   - Persist `{saveId, idempotencyKey, body}` on the client before sending.
   - On restart, call `GET /receipts/:key` and resend while the status is `unknown`.
   - A "pending clarification" field on `GET /api/games/:id` would close I11.
