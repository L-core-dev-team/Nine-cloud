# 九霄 web client dossier (apps/web + apps/scene-studio)

Read-only study of 研究工作区 @ fe171ff (clean worktree). File:line refs are relative to apps/web/src unless stated.

## 1. Coverage

Line counts in parentheses (KB for binaries). Statuses: full / partial / skimmed / inventory / not read. Coordinator asked to finish compactly after usage limits, so ~25 secondary TS/TSX files and all 44 tests were not read line-by-line; their roles are inferred from imports/greps and marked as such.

| Group | Files |
|---|---|
| scene-studio — skimmed [4] | ASSETS.md(25), README.md(54), artifacts/manifest.json(136), src/main.tsx(157) |
| scene-studio — inventory [15] | artifacts/key-000.landscape.png(625 KB), artifacts/key-000.portrait.png(632 KB), artifacts/key-080.landscape.png(628 KB), artifacts/key-080.portrait.png(636 KB), artifacts/key-160.landscape.png(623 KB), artifacts/key-160.portrait.png(635 KB), artifacts/mountain-gate.landscape.contact.png(1099 KB), artifacts/mountain-gate.landscape.mp4(609 KB), artifacts/mountain-gate.landscape.webp(57 KB), artifacts/mountain-gate.portrait.contact.png(3065 KB), artifacts/mountain-gate.portrait.mp4(695 KB), artifacts/mountain-gate.portrait.webp(58 KB), src/assets/gate-environment-landscape.webp(175 KB), src/assets/gate-environment-portrait.webp(193 KB), src/style.css(1 KB) |
| scene-studio — full [4] | index.html(1), package.json(25), tsconfig.json(5), vite.config.ts(4) |
| scene-studio — not read [4] | scripts/device-audit.mjs(268), scripts/export.mjs(191), scripts/local-server.mjs(64), scripts/verify-preview.mjs(129) |
| web root config — full [5] | card-ui-fixture.html(1), index.html(18), package.json(26), tsconfig.json(13), vite.config.ts(67) |
| web/public — inventory [26] | _headers(164 B), _redirects(278 B), _routes.json(110 B), compliance/beian-police.png(1403 B), favicon.svg(407 B), feedback/index.html(4 KB), fonts/OFL-MaShanZheng.txt(4 KB), fonts/OFL-NotoSerifSC.txt(4 KB), fonts/ma-shan-zheng-brand.woff2(9 KB), privacy-rights/index.html(7 KB), privacy/index.html(10 KB), scenes/candidate/asset-manifest.json(207 KB), scenes/candidate/battle-anomaly.desktop.webp(329 KB), scenes/candidate/battle-anomaly.mobile.webp(450 KB), scenes/candidate/mountain-gate.desktop.webp(215 KB), scenes/candidate/mountain-gate.loop.mp4(749 KB), scenes/candidate/mountain-gate.mobile.webp(326 KB), scenes/candidate/sect-town.desktop.webp(221 KB), scenes/candidate/sect-town.mobile.webp(346 KB), scenes/candidate/wilderness.desktop.webp(175 KB), scenes/candidate/wilderness.loop.mp4(722 KB), scenes/candidate/wilderness.mobile.webp(323 KB), scenes/gate-moonlight-mobile.webp(247 KB), scenes/gate-moonlight.webp(224 KB), terms/index.html(6 KB), scenes/candidate/atlas/*.webp (74 files, 11828 KB total) |
| web/src tests — not read; names shown without .test.ts(x) [44] | action-draft(8), ai-call-logs(47), ai-generation-request(16), ai-model-compatibility(22), ai-model-inventory(82), ai-model-list(53), ai-model-pricing(72), ai-protocols(108), ai-provider-errors(32), api-url(19), authoritative-turn-store(360), build-target(19), candidate-atlas(44), card-availability(32), card-import-client(48), cloud-auth-error(10), cloud-game-cache(84), cloud-sync(163), components/GameShell(35), components/ReadableData(18), design-system/contrast(70), export-save(148), game-creation(35), gameplay-brief(54), graphics-settings(77), idb(168), internal-turn-workspace(14), legacy(110), p2-candidate-action-parser(105), p2-candidate-digest-queue(34), p2-candidate-narrative(101), p2-candidate-offline(312), page-narrative(17), receipt-event-view(91), routes/CardProfile(32), routes/WorldbookPanel(19), routes/cloud-game-errors(38), scene-media(26), security-transport-regression(94), storage(146), turn-client(79), ui/Folio(17), ui/RealmSeal(11), ui/realm(36) |
| web/src TS/TSX — not read (imports/usages grepped only) [27] | action-draft.ts(6), ai-call-logs.ts(32), ai-generation-request.ts(21), ai-model-compatibility.ts(56), ai-model-inventory.ts(116), ai-model-list.ts(95), ai-model-pricing.ts(160), ai-protocols.ts(89), ai-provider-catalog.ts(41), ai-provider-errors.ts(27), candidate-atlas.ts(523), card-ui-fixture.tsx(17), character-options.ts(14), components/DesignSpecimen.tsx(109), components/GlassHeader.tsx(49), components/LiquidGlass.tsx(53), components/LiquidGlassDemo.tsx(85), components/ModelPicker.tsx(36), components/ReadableData.tsx(25), components/folio-sample.ts(25), design-system/light-controller.ts(79), gameplay-brief.ts(101), ui/AiTwoModels.tsx(25), ui/CardPortrait.tsx(100), ui/Folio.tsx(134), ui/Ornaments.tsx(61), ui/RealmSeal.tsx(111) |
| web/src TS/TSX — partial [5] | ai-settings.tsx(832; L1-200 read, rest grep), components/GameShell.tsx(177; L1-~140 read), pages/Landing/Landing.tsx(46; grep only), ui/ReadingPrefs.tsx(80; L1-60 read), ui/resume.ts(33; grep only) |
| web/src TS/TSX — full [50] | ambient-audio.ts(77), api-url.ts(8), authoritative-turn-store.ts(965), card-availability.ts(29), card-import-client.ts(117), cloud-game-cache-bridge.ts(78), cloud-game-cache.ts(158), cloud-sync.ts(210), components/RouteModuleBoundary.tsx(15), export-save.ts(118), game-creation.ts(61), graphics-settings.ts(187), idb.ts(285), internal-turn-workspace.ts(13), legacy.ts(118), main.tsx(969), media-compat.ts(14), p2-candidate-action-parser.ts(214), p2-candidate-digest-queue.ts(733), p2-candidate-digest-review.ts(254), p2-candidate-memory-store.ts(272), p2-candidate-narrative.ts(202), p2-candidate-offline-store.ts(175), p2-candidate-offline.ts(637), p2-review-gameplay-runtime.ts(693), page-narrative.ts(26), playtest-channel.ts(2), receipt-event-view.ts(125), routes/AccountLifecyclePanel.tsx(26), routes/CardArea.tsx(44), routes/CardLibrary.tsx(98), routes/CardProfile.tsx(188), routes/CardSession.tsx(135), routes/CloudGame.tsx(460), routes/CloudSettings.tsx(243), routes/GraphicsSettings.tsx(96), routes/P2ReviewGame.tsx(529), routes/TurnWorkspace.tsx(108), routes/WorldbookPanel.tsx(45), routes/cloud-game-errors.ts(33), scene-media.ts(21), scene.tsx(44), scenes/SceneAtmosphere.tsx(531), storage.ts(233), turn-client.ts(88), ui/card-availability-cache.ts(24), ui/folio-flag.ts(2), ui/realm.ts(42), ui/recent.ts(30), use-cloud-game-session.ts(147) |
| web/src CSS — inventory; names without .css; roles: tokens*/fonts = design tokens & @font-face, *-e.css = JX-UI-E-01 layer/page skins, style.css = legacy global (1566 lines), component css beside components [24] | components/design-specimen(42), components/game-shell(87), components/liquid-glass-demo(180), components/liquid-glass(277), components/story-first(101), design-system/fonts(206), design-system/jx-e(176), design-system/story-e(190), design-system/tokens-v2(384), design-system/tokens(125), design-system/tool-e(20), pages/Landing/landing-e(82), pages/Landing/landing(98), pages/archive-e(192), pages/lobby-e(74), pages/world-e(51), routes/card-e(51), routes/card-ui(49), routes/liezhuan-e(153), routes/worldbook-e(48), style(1566), ui/ai-two-e(23), ui/folio-e(92), ui/realm-e(99) |
| web/pages-preview-media — inventory [2] | fallback-manifest.json(678 lines), *.jpg iOS fallbacks (84 files, 19234 KB) |

## 2. Route and screen map

The router is written by hand. `route()` reads `location.pathname` at render time (main.tsx:83). `go()` calls pushState and then dispatches a synthetic popstate (92-112). The App re-renders because its popstate listener calls `setSaves(readSaves())` (729, 738). The page is chosen by one long ternary (854-945), and **any unknown path renders Landing** (945). Layers are `lobby` / `story` / `tool` and are exposed as `data-jx-layer` (85-90).

| Path | Component (file:line) | Reads / writes | API |
|---|---|---|---|
| `/` | Landing (pages/Landing/Landing.tsx; main.tsx:945) with SVG/CSS `MountainGateScene` (scene.tsx) | local saves | — |
| `/lobby` | WorldHub (main.tsx:208): resume card (`pickResumeSave`), recent list, moon-gate tiles, tool row, other saves | `jx_recent_v1`, local saves | `/api/auth/providers` (card flag) |
| `/new` | NewCharacter (339): 3 steps 其人/其道/起行, region select with atlas art, memory mode radio | `jiuxiao_1_character_draft`, IDB meta `characterDraftId` | local branch: none. Server branch (886-905): `GET /api/auth/session`, on 401 `POST /api/auth/guest`, then `POST /api/games` |
| `/intro` | Introduction (422) | — | — |
| `/world` | World (451): Canon text search/categories (lazy `@jiuxiao/content/worldbook`), atlas of 9 collections with `<dialog>`, supplement TXT import | `history.state.returnTo` | — |
| `/saves` | SaveManager (270): rename, delete with typed name, export | local saves | — |
| `/settings/ai` | AiTwoModels + AiSettings (lazy; ai-settings.tsx) | SS `jx10_ai_config_v2`, `jx10_ai_call_log_v1`; legacy `jx_ai_config`, `jx1_config`; keys held in memory only (ai-settings.tsx:244, 507) | direct browser calls to provider URLs (404, 723) and OpenRouter `/models` (301) |
| `/settings/graphics` | GraphicsSettingsPage (routes/GraphicsSettings.tsx) | LS `jx10_graphics_v1` | — |
| `/settings/cloud` | CloudSettings + AccountLifecyclePanel | IDB `jiuxiao-cloud-1` | `/api/auth/*` (session, providers, guest, code, verify, restore, refresh, logout, guest/upgrade, phone/{code,verify,restore,status,link,link/code,unlink}), `/api/save-index`, `/api/saves[/:id]`, `/api/save-trash[/:id/restore]`, `/api/account/{capabilities,export,operation/begin,verify,complete,cancel}`; Turnstile script |
| `/cards`, `/cards/session/:id` | CardArea → CardLibrary / CardSession, with WorldbookPanel and CardProfile (列传) | SS `jx-card-pending:<origin>:<api>:<owner>:<session>` (+`:strict-multi`) | `/api/card-import/*` (~30 endpoints; card-import-client.ts:58-108) |
| `/game/:id`, local save with `p2ReviewCandidate` and `LOCAL_GAMEPLAY_ENABLED` | P2ReviewGame (lazy; main.tsx:557-563) | IDB `jiuxiao-1` authority stores, memory/digest DBs | none |
| `/game/:id`, other local save | LegacyGame (567): read-only history, queue of "pending actions", no rules | `pendingQueue`, SS action draft | none |
| `/game/:id`, no local save | CloudGame (routes/CloudGame.tsx) | IDB `jiuxiao_cloud_game_ui_v1`, SS journal | `GET /api/games/:id`, `/story[?before=]`, `/action-suggestions`, `/receipts/:key`, `POST /api/games/:id/turns`, `POST /api/turns` (structured intent) |
| `/turns` | TurnWorkspace, only if `INTERNAL_TURN_WORKSPACE_ENABLED`; otherwise replaced by `/lobby` (659, 931) | IDB `jiuxiao-turns-1`, LS `jx_game_creation:<owner>` | `GET /api/saves`, `POST /api/games`, `POST /api/turns` |
| `/__liquid-glass`, `/__design` | DEV-only demos (959-967) | — | — |

Flags and build targets:
- `LOCAL_GAMEPLAY_ENABLED = DEV || JIUXIAO_PREVIEW_1` (main.tsx:557). `JIUXIAO_PREVIEW_1` is injected when `JIUXIAO_RELEASE_CHANNEL=preview-1`, which requires the `release` target (vite.config.ts:26-27, 52).
- `JIUXIAO_BUILD_TARGET` can be `release` (runs the media licence gate), `cloudflare-preview` (`publicDir:false`, copies only approved fonts, requires `VITE_API_BASE_URL` to be HTTPS and end in `/api`) or `test` (vite.config.ts:25-62).
- `JIUXIAO_PAGES_PREVIEW` forbids same-origin `/api` (api-url.ts:2-8).
- `VITE_ENABLE_INTERNAL_TURN_WORKSPACE` works only in DEV (internal-turn-workspace.ts).
- `VITE_JX_NOVEL_MODE=1` enables Folio 成卷 (ui/folio-flag.ts).
- `VITE_TURNSTILE_SITE_KEY` gates phone login and email captcha. `VITE_IOS_JPEG_FALLBACK` switches WebP to JPEG on Apple touch devices (media-compat.ts).
- An HTML meta `ninecloud-isolated-playtest` changes copy only (playtest-channel.ts).
- Cards appear only when `/api/auth/providers` returns `cardImport:true` (card-availability.ts). This is polled on focus and visibility; the navigation copy is cached (ui/card-availability-cache.ts).

## 3. State and persistence

**localStorage**
- `jiuxiao_1_local_saves_v2`: atomic mirror `{revision, saves}`.
- `jiuxiao_1_local_saves`: legacy array, still written.
- `jiuxiao_1_local_saves_revision`.
- `<key>_damaged_backup` (storage.ts:3-7; idb.ts:266-281).
- `jiuxiao_v1_library`: pre-1.0 library, migrated on request (main.tsx:742-757).
- `jiuxiao_1_character_draft`.
- `jx10_appearance` (night/day), `jx10_graphics_v1`, `jx_reading_prefs_v1` (6 axes), `jx_recent_v1` (8 entries), `jx_folio_v1`.
- `jx_game_creation:<owner>`.

**sessionStorage**
- `jiuxiao_active_save_id`.
- `jiuxiao_1_game_scroll_<saveId>`: pixel scroll for local games.
- `jiuxiao_1_action_draft_<id>`: ids are `<saveId>`, `review-<id>` or `cloud-<id>`, capped at 4000 chars.
- `jiuxiao_cloud_pending_<saveId>`: legacy; migrated into the IDB cache.
- `jiuxiao_cloud_draft_journal_v1:<key>`.
- `jx_character_game:<owner>`: server-create recovery.
- AI config and call log.
- Card pending keys.

**IndexedDB** (each module opens and closes the database on every operation)
- `jiuxiao-1` v3 (idb.ts:26-50) has `saves`, `meta` (`revision`, `characterDraftId`) and the authority ledger: `authoritativeSaves`, `turnEvents`, `turnReceipts`, `authorizedObservationOutbox`, `turnIntegrity`, `turnCheckpoints`.
- Other databases: `jiuxiao-cloud-1/queue`, `jiuxiao_cloud_game_ui_v1/{scopes,epochs}`, `jiuxiao-turns-1/turns`, `jiuxiao-memory-{continue,forgetting}`, `jiuxiao-plot-digest-{mode}-candidate`, `jiuxiao-plot-digest-review-{mode}-v1-candidate` and `jiuxiao-offline-{mode}-v4-candidate`. The last one is never opened by the app.

**Local saves (LocalSave, storage.ts:11-32)**
- `status` is always `pending_rules`.
- Writes go through `commitSaves(expected, proposed)`. This is a per-saveId compare-and-swap on canonical JSON inside one IDB transaction; it bumps the global revision and then mirrors to localStorage (idb.ts:192-264).
- `hydrateSaves` seeds IDB from the mirror once. It refuses to continue if the mirror revision is higher than IDB, and it restores the mirror (storage.ts:149-177).
- Cross-tab changes arrive through the `storage` event and trigger a re-hydrate (main.tsx:730-737).
- When a commit conflicts, LegacyGame offers three choices: reload, save as branch, or download the conflicting copy (main.tsx:649).
- Import accepts `JIUXIAO_SAVE` v1 (the app's own export), legacy JSON (`LegacySaveFileSchema`), or HTML/TXT stripped to plain text. The limit is 20 MiB. Save ids are sanitised (legacy.ts:4-52). The original payload is kept verbatim in `legacyArchive`.
- Export is `{format:'JIUXIAO_SAVE',version:1,save}` with heuristic credential redaction (export-save.ts:91-118).

**Cloud backup** (cloud-sync.ts)
- Only LocalSave archives are backed up, as `archiveKind:'local-untrusted-v1'` with a `cloudMutationId`.
- New backups use `POST /api/saves`; updates use `PUT` with `expectedRevision`.
- On 409 the client reads the remote save. If the mutation id matches, it treats the response as lost and accepts it; otherwise it records a conflict, and the user picks "keep local" (CAS) or "restore remote as a copy".
- On 404 after a 409 the client mints a new transport id (114-194).

**Cloud games** (CloudGame.tsx + cloud-game-cache*.ts)
- The cache is presentation-only. It is keyed by `[apiBase, ownerId, saveId]` and holds an epoch, a CAS-versioned draft, a pending action, up to 1000 history rows (4 MB) and a reading anchor `{entryId, fraction}`.
- The pending action is persisted (`prepared` → `sent`) **before** the POST.
- On mount the client only GETs `/receipts/:key` and never resubmits automatically (use-cloud-game-session.ts:85; CloudGame.tsx:173).
- "核对本次提交" resends the same key with `requestNarrative:false` (CloudGame.tsx:340-345).
- Receipts are checked against saveId, key and resultingRevision (cloud-game-cache.ts:126-147).
- An account switch is detected through the BroadcastChannel `jiuxiao-cloud-game-session` and a focus/visibility session re-check, and wipes the view (CloudGame.tsx:70-78).

**Card sessions**
- The client writes a pending key to sessionStorage before POSTing.
- If the response is unknown, it offers "query" or "recover". `beforeunload` warns while a request is pending (CardSession.tsx:53-79).
- Session and group creation reuse one client-generated id until the outcome is confirmed (CardLibrary.tsx:56, 85).

**Server game creation** stores `{idempotencyKey, choices}` before the POST. A retry replays exactly the stored choices; the record is acknowledged after navigation (game-creation.ts:20-43; main.tsx:828-836).

**P2 local preview runtime** (p2-review-gameplay-runtime.ts)
- What it loads: the candidate rulebook, `PROLOGUE_V1` mechanics and the content pack. It builds `createPrologueV1RuleModule` and an event reducer, and fetches `canon-runtime.json?url` to SHA-256 it as `canonArtifactHash` (33, 67-79, 231-235).
- Save creation: `createSave` builds a root `SaveEnvelopeV3` with a pinned memory policy. `continue` never decays; `forgetting` uses a half-life of 7 game-days or 16 observed events (153-177, 237-272).
- Each turn:
  - Text goes through a P1 parser plus candidate templates; negation and unresolved pronouns are refused.
  - If nothing matches, the input becomes a `free_text` intent.
  - `commitLocalAuthoritativeTurn` verifies the hash chain, replays **every** revision from per-revision checkpoints, and calls domain `prepareTurn`/`evaluate`.
  - Only `talk.occurred` events produce NPC observation grants.
  - One readwrite transaction commits the receipt, events, checkpoint, outbox and chain head. Concurrency is controlled with revision CAS, idempotency and integrity checks (authoritative-turn-store.ts:162-224, 593-694).
- Narration is deterministic text taken from the content pack (runtime 595-657). Memory questions are read-only recalls (P2ReviewGame.tsx:259-283).
- The world is limited to the prologue: 芦花渡 / 望气台 / 折桂坪 and the ferry/rockslide quest (receipt-event-view.ts:52-56).

## 4. Rendering and atmosphere

- **Background poster.** Shell sets CSS variables from the `SCENE_MANIFEST` desktop and mobile posters, a gate poster, and a paper texture chosen by theme (main.tsx:169-179). These are mounted with `SceneAtmosphere` (180).
- **Backend tiers.** WebGL2, then WebGL1 (the same GLSL rewritten for each), then Canvas 2D on a separate canvas, then a static class (SceneAtmosphere.tsx:256-289, 370). The fullscreen fBm fog shader adds a water glimmer for scene 0 (24-70). There is also a point-particle pass with 96 deterministic particles (72-164).
- **Context loss** is handled by dropping to Canvas 2D (451-465).
- **Status reporting.** The status goes out through the window event `jx:scene-render-status`, which feeds the graphics page readout (166-168; main.tsx:713-717).
- **Quality presets.** Seven presets, from `standard` to `extreme`, set the render-scale cap, particle count and fog level. `auto` picks a preset from hardware threads, device memory and WebGL availability (graphics-settings.ts:50-57, 130-149).
- **Render budget.** Pixel budgets per quality range from 0.9 MP to 4.2 MP (SceneAtmosphere.tsx:303-307). Frame-rate caps are 30 / 60 / 90 / 120, and data-saver forces 30. Dynamic resolution steps the scale between 0.55 and the cap every 2.4 s (440-444).
- **Live setting changes.** Settings propagate through `jx:graphics-settings-changed` without remounting (graphics-settings.ts:110; SceneAtmosphere.tsx:480-496). A theme change only updates a uniform and repaints (177-181, 524-528).
- **Motion and data saving.**
  - `reducedMotion` (the setting, or the OS `prefers-reduced-motion`) stops the rAF loop and draws one frame (250-252, 470-479).
  - `dataSaver` turns off particles and video.
  - The `<html>` element gets `data-jx-atmosphere/particles/reduced-motion/data-saver` (main.tsx:706-712).
  - Reduced-transparency, contrast and forced-colors appear only in CSS (10 files, not inspected).
  - Card-session entry skips the seal animation under reduced motion (CardLibrary.tsx:58-63).
- **Video.** It is opt-in and muted. Only `mountain-gate` (desktop width) and `wilderness` (narrow width) have loops (scene-media.ts:14-16).
- **Audio.** Ambient sound is synthetic pink noise through Web Audio, starts only on a click, volume 0-80, and is not persisted across reloads (ambient-audio.ts; main.tsx:680-693).
- **Which state drives the scene.** `activeScene = scenePreview ?? (local game ? sceneForLocation(save.location) : 'mountain-gate')` (main.tsx:948).
  - `sceneForLocation` matches exact aliases: 山门/临江仙/中州天枢域 → mountain-gate, 野外/荒野/秘境/山林 → wilderness, 宗门/城镇/坊市 → sect-town, 战斗/异变/战场 → battle-anomaly. Anything else falls back to mountain-gate (packages/content/src/scenes/manifest.ts:11-60).
  - A LocalSave's `location` is the region picked at creation and is never updated (main.tsx:373). The P2 runtime's `locationId` (`loc_*`) is never mapped, and a cloud game's `scene.location` only sets the `<h1>` (CloudGame.tsx:128-130, 384).
  - **So in practice every game shows mountain-gate.** The other three scenes appear only in the graphics-page preview. This contradicts the page copy "游戏内只按已结算地点切换" (GraphicsSettings.tsx:54).
  - **Not reflected anywhere:** game time (`gameMinute` is shown only as a number), weather, day/night (the theme is a manual toggle), combat, and NPC presence.
  - The atlas explicitly says its weather and battle art does not represent game state (main.tsx:506). `uScene` takes only 4 discrete values.

## 5. Gameplay UI as it exists

- **Local preview (P2ReviewGame).** This is what 1.0 preview players actually get.
  - One page of stacked cards:
    - World brief (opening, location, previous stop, hook, plus the evidence behind the hook)
    - Free-text action / memory question
    - A stats row: revision, game minute, event count, memory mode
    - Stamina, spirit, quest, clues and items, with a RealmPlaque that is always 炼体 progress (ui/realm.ts:23-32)
    - Five groups of suggestion buttons plus structured actions, which only prefill the text box
    - NPC memory Q&A
    - "最近一次结算" narrative (deterministic)
    - Narrative-source catalog
    - P6 digest drafting/approval
    - A raw receipt (status, event types, delta strings)
    - An integrity line
  - `JIUXIAO_PREVIEW_1` changes only the eyebrow and lede (P2ReviewGame.tsx:355-359). Everything else is review jargon such as 修订, 事件链 and hashes.
  - There is no history log of prior turns, only the latest result. The world is the prologue only.
- **Cloud game.** This is the most "story-first" surface (GameShell immersive).
  - Opening prose and a paged story history, with a content-anchored reading position and a "有新回复" notice.
  - Feedback on clarify or reject.
  - 3 suggestions plus a "更多行动" dialog.
  - "人物 · 行囊" dialog: profile fields, realm, stamina, inventory, and a raw JSON dump of the save.
  - Recovery buttons for a pending turn.
  - Revision, receipt deltas and request id sit inside the collapsed "玩法范围" details.
  - Narrative comes from the server. If narration fails, the UI says so and keeps the receipt.
- **Legacy local game.** You can read imported history (the last 80 readable messages), queue up to 50 "pending actions" that never resolve, and open three archive panels. The copy openly says nothing is settled (main.tsx:644).
- **Card session / group chat.**
  - SillyTavern-style cards (PNG/JSON v2/v3), worldbooks with global enable/replace, personas, alternate greetings, versioned edits and export.
  - Group play with 2-3 cards: manual / auto / multi speakers, with "strict all reply" (CardSession.tsx:113-131).
  - A model status line shows synthetic vs provider, the token budget and remaining calls.
  - History renders as cards; Folio typesetting sits behind a flag.
- **Thin spots:**
  - There is no player-facing turn log in P2.
  - Visuals and audio never react to play.
  - The realm display is static.
  - Suggestions only fill the text box.
  - A cloud game cannot be found again from the lobby (see §7).
  - Lobby and creation copy still says server turns are closed (main.tsx:219, 396).
  - LegacyGame queues actions that nothing will ever process.

## 6. Assets

- **`public/scenes/candidate/`:**
  - 4 scenes × desktop/mobile WebP (180-461 KB each)
  - `mountain-gate.loop.mp4` (767 KB) and `wilderness.loop.mp4` (740 KB)
  - 74 atlas WebPs (11.8 MB) in collections world / faction / system / brand / texture / character / artifact / atmosphere / battle (candidate-atlas.ts)
- **`public/scenes/`:** `gate-moonlight{,-mobile}.webp`.
- **`asset-manifest.json`** (213 KB, 88 files):
  - Top level: `status:'internal-candidate'`, `sourceAndLicense:'verified'`, `authorApproval:'approved'`, `runtimeIntegrated:true`, plus `aigcPropagation` (implicit metadata labels and explicit footer/atlas labels).
  - Every file has `licenseStatus:'approved'`, a `licenseEvidenceSha256`, and `authorReceipts` (LYL, 2026-10-10, batch G-05).
  - The `release` build enforces it (vite.config.ts:57-61).
  - **Stale copy:** the UI still says licences are pending (GraphicsSettings.tsx:51, 54), and so does the vite comment (15-19).
- **iOS JPEG fallbacks.** `apps/web/pages-preview-media/` holds 84 JPEGs (19.2 MB) and a `fallback-manifest.json` with SHA pairs.
- **Fonts.**
  - `ma-shan-zheng-brand.woff2`: a 9 KB brand subset, OFL licensed.
  - Noto Serif SC via `@fontsource`. Its 195 KB `fonts.css` of `@font-face` rules is lazy-imported after idle (main.tsx:955-957). OFL texts are shipped.
- **Other public files:** favicon SVG (霄 seal), `beian-police.png`, static legal pages (`privacy`, `privacy-rights`, `terms`, `feedback`), and Cloudflare `_headers`, `_routes.json` and `_redirects` (no SPA rewrite).
- **Audio:** none is shipped; the only sound is synthesized.
- **scene-studio.**
  - An isolated Three.js pilot of the moonlit mountain gate. It must never be imported by `apps/web` (README).
  - Its environment WebPs (180-200 KB) were generated with Codex `image_gen` and verified on 2026-10-10. The procedural geometry is not approved for release (ASSETS.md).
  - Artifacts total about 8 MB of keyframe PNGs, MP4/WebP loops and contact sheets, with a manifest.

## 7. Problems found

1. **Oversized modules.** main.tsx (969 lines, 89 KB) holds the router, five pages, import/export/migration, audio and theme. Single lines run up to about 4 KB (180, 950). ai-settings.tsx is 93 KB. The routes are dense one-liners (CloudGame, CardLibrary, CardSession).
2. **Fragile routing.** Re-rendering depends on `setSaves(readSaves())` getting a new array (main.tsx:729). There is no 404 (945). `history.state.returnTo` is used for back navigation (113-125).
3. **Question / bug: popstate can load stale saves.** `readSaves()` is a synchronous read of the localStorage mirror and runs on every popstate. When a mirror write failed (`compatibility-mirror-unavailable`, idb.ts:246-248), navigating swaps the IDB-hydrated state for the stale mirror, and the next CAS then reports a false conflict. On top of that, the mirror writes the whole save array twice (idb.ts:276-277) even though imports can be 20 MiB (legacy.ts:4), so localStorage quota failures are likely.
4. **P2 cost grows quadratically.** Each revision stores a full checkpoint (authoritative-turn-store.ts:661). Each action triggers about 5 full-history replays: refresh does verify plus export, and commit verifies again (P2ReviewGame.tsx:93-97, 257, 313-315; authoritative-turn-store.ts:175, 409-498).
5. **The scene is effectively always mountain-gate** (§4), even though four scenes, two videos and an atlas ship.
6. **Cloud games cannot be rediscovered.** `recordRecent` runs only for local saves (main.tsx:840-843). The lobby resume is local-only. CloudSettings lists only archive backups. Unless the URL is kept, the player has no path back. Question: is a server game index planned? TurnWorkspace uses `GET /api/saves`, but that page is internal.
7. **Stale or contradictory copy.** Lobby and creation say server turns are closed (main.tsx:219, 396). The graphics page says licences are pending (§6). The graphics page claims scenes switch by location.
8. **Coupling.**
   - Deep relative imports reach into other packages: `packages/contracts/dist/character-profile.js` needs a prebuilt `dist` (CloudGame.tsx:1, game-creation.ts:2), and `packages/content/src/canon-runtime.json?url` (p2-review-gameplay-runtime.ts:33).
   - Hard-coded prologue IDs and labels live in the UI (receipt-event-view.ts:51-77; runtime hook text 540-555).
9. **Duplication.**
   - The `useCloudGameSession` hook is unused; CloudGame reimplements it with the bridge, and only `gameCacheScope`/`clearCloudGameAccount` are imported.
   - Three `canonical()` copies exist (idb.ts:166, turn-client.ts:77, authoritative-turn-store.ts:956) alongside domain `canonicalJson`.
   - Eight IndexedDB openers handle blocking inconsistently: digest-review has no `onblocked` or `onversionchange` (p2-candidate-digest-review.ts:212-226); `claimJob` closes the database only in transaction callbacks (p2-candidate-digest-queue.ts:576-617).
   - The session re-check / BroadcastChannel logic is copied three times (CloudGame, the hook, CardArea).
10. **Dead or unreachable code in the bundle graph.**
    - `p2-candidate-offline(.ts, -store.ts)`: P7 with an empty allowlist and no importer.
    - `ai-generation-request.ts` has no importer.
    - `validateNarrativeSourceCandidates` and `restoreLocalAuthorityArchive` have no UI.
    - The narrative context is only listed, never consumed.
    - TurnWorkspace / turn-client are DEV-flagged.
11. **Card transport.** Every request is followed by an extra `GET /api/auth/session` (card-import-client.ts:41-43). That doubles traffic, has no timeout, and detects an account mismatch only after a mutating request was already sent. Uploads are base64 inside JSON (61-66).
12. **Per-keystroke writes.** Each keystroke in the CloudGame draft triggers a sessionStorage journal write plus an IDB transaction (CloudGame.tsx:85; bridge 37-48).
13. **Import side effect.** Choosing a file auto-downloads a backup of it before parsing (main.tsx:765).
14. **Fragile equality checks.** Rename and delete compare saves with `JSON.stringify` (key-order sensitive) (main.tsx:914, 922).
15. **Small UX bugs.**
    - "更多行动" appears when there is more than one suggestion, even though only three are inlined (CloudGame.tsx:410).
    - The guest button is duplicated (CloudSettings.tsx:150, 241).
    - The CloudGame dialog shows the raw save JSON (CloudGame.tsx:440).
    - A server-create retry silently reuses the first-submitted choices (game-creation.ts:24-29; acknowledged in copy at main.tsx:392).
16. **Privacy surface.** The AI config, including base URLs, sits in sessionStorage. Account export bundles it after redaction (AccountLifecyclePanel.tsx:13). Keys stay in memory only, which is good.

## 8. What a rebuilt client must preserve / can drop

**Preserve**

*Stored data and formats*
- All storage keys and DB names/schemas from §3, especially `jiuxiao-1` v3 with the authority ledger, the mirror rules, and `characterDraftId`.
- The legacy keys `jiuxiao_1_local_saves` and `jiuxiao_v1_library`, kept readable until migration is complete.
- The `JIUXIAO_SAVE` v1 export with credential redaction, the three legacy import formats, `SAVE_ID_PATTERN`, and the 20 MiB / 100 KB / 256 KB limits.
- The `LocalAuthorityArchiveV1` format.

*Concurrency and idempotency*
- Per-save CAS with explicit conflict choices (reload / branch / download).
- The turn idempotency rules: persist the pending request before sending, never auto-resubmit, look up receipts by key, retry with the same key, validate receipts (saveId, key, resultingRevision, fingerprint `sha256:v1:`), and reconcile with `requestNarrative:false`.
- Cloud-sync `cloudMutationId` lost-response dedupe and keep-local/restore-copy.
- Card and game creation reusing one id per pending request, plus `beforeunload` while a request is pending.

*Transport and session*
- The `x-jiuxiao-account` header.
- `cloudRequest` bounds: 20 s timeout, response caps, `redirect:'error'`, and error-code whitelisting.
- BroadcastChannel and focus re-checks for account changes.
- The API surface in §2.

*Accessibility*
- Skip link and focusable `<main>`.
- `<dialog>` with focus trap and focus restore.
- `role=status` / `aria-live` notices.
- `aria-pressed` toggles.
- OS and in-app reduced motion, plus data-saver.
- Reading prefs as data attributes.
- visualViewport keyboard compensation that does not block pinch zoom (GameShell).
- Content-anchored reading positions.

*Compliance*
- ICP and police filing links, the AI-generated-content label, the legal pages, and the release media gate.
- Scenes must come from fixed asset IDs; a model must never supply an image URL.

**Can drop or redo**
- The hand-written router and main.tsx monolith.
- The P2 review chrome in player builds: digest panel, integrity line, source catalog, raw receipts.
- LegacyGame's never-processed action queue. Keep a read-only archive viewer instead.
- The P7 offline module, `ai-generation-request`, and the unused hook.
- The duplicated canonical/IDB/session-check helpers.
- The raw JSON dumps.
- The DEV demos.
- The double localStorage mirror, after a migration plan.
- The atmosphere's 4-value `uScene`, which a new client can replace with real state mapping (location, game time, weather) driven by settled facts.
