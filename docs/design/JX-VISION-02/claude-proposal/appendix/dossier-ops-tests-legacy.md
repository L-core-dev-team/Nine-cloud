# Dossier: ops, tests, legacy prototype, assets and research (《九霄》 研究工作区)

Read-only study of worktree 研究工作区 at `fe171ff` (clean; nothing modified, no scripts executed). The scope was narrowed partway through by the coordinator to four points: legacy prototype, survey findings, visual-vs-behaviour test locks, and deployment reality. Paths below are repository-relative. `file:line` refers to that commit. **[inference]** marks my interpretation. Repository text was treated as data.

---

## 1. Coverage table

| Area | Files | Status | Notes |
|---|---|---|---|
| `functions/` (`_lib/api-proxy.mjs`, `_middleware.js`, `api/[[path]].js`, `health.js`, `ready.js`) | 5 | full | |
| `deployment/` (Caddyfile ×2, compose ×3, Dockerfile + ignore, env example, narrative example, playtest front/worker, README, worker-production.md) | 13 | full | |
| `docker-compose.yml`, root `package.json`, `.env.example`, `.dockerignore`, `.gitignore`, `.gitattributes` | 6 | full | |
| `.github/` (`workflows/ci.yml`, `dependabot.yml`, `FUNDING.yml`) | 3 | full | |
| `scripts/build/*`, `scripts/audit/*`, `scripts/dev/*`, `scripts/assets/build-visual-candidates.py`, every root `scripts/*.mjs/.py/.ps1/.cjs/.json` | 59 | full | Worldbook scripts were read only, never executed. |
| Supporting files outside scope: `apps/web/vite.config.ts`, `apps/web/public/_routes.json`, `_headers`, `_redirects`, `scenes/candidate/asset-manifest.json` (summarised), `apps/api/package.json` | 6 | full / summarised | Needed to explain the build targets. |
| `supabase/` (config, 2 edge functions, 5 migrations) | 8 | not read | Known only through `deployment/README.md`. |
| `tests/e2e/`: `auth-login-ui`, `filing-notice`, `foundation` (1,670 lines), `prologue`, `p1-authenticated-candidate`, `p1-action-suggestions-ui`, `p2-authoritative-idb` | 7 | full | |
| `tests/e2e/`: the other 39 files | 39 | skimmed | Classified from headers and signal counts: `getComputedStyle`, colour literals, geometry, class selectors, DB/API use. |
| `tests/integration/` (24) and `tests/fixtures/` (4) | 28 | inventory | Purpose taken from file names, CI step labels and cross-references only. |
| `tests/experiments/` | 3,100 files, about 550 MB tracked | inventory | P6 long-memory experiments: 11 folders, mostly `.gz`, `.json` and `.log` files plus reports. Largest: `p6-longmem-hardening` (231 MB), `p6-longmem-06` (219 MB), `p6-longmem-05c` (44 MB), `p6-longmem-prose` (36 MB). |
| `work/v1.js`, `work/build_v1.py`, `work/README.md` | 3 | full | |
| `work/v1.css`, `work/ai-router.js`, `work/ai-provider.js` | 3 | skimmed | |
| Rest of `work/` (443 tracked, 47.4 MB) | ~437 | inventory | `ocr/` 183 and `ocr-normalized/` 182 files. Large items: two 11.2 MB HTML files in `worldbook-base/`, `glass-before.html` 11.2 MB, `ui-fonts.css` 8.3 MB, `messages.json` 4.0 MB. |
| `outputs/` | 64 | inventory + `README.md` skim | Classified in §5. |
| `九霄素材-水墨古风/` | 125 files, 103 MB | inventory + `README.md` skim | 120 jpg, 2 mp4. |
| `问卷调查分析/` | 8 | `01-总览与关键结论.md` and `04-对开发决策的建议.md` full; rest inventory | |

---

## 2. Deployment reality (short)

**Web build has three targets.** They are resolved by `scripts/build/build-target.mjs:1-13` and consumed by `apps/web/vite.config.ts:25-62`:

- **`test`**: the default off Pages. Copies the whole of `public/`, including candidate scene media. This is the bundle CI e2e runs against.
- **`release`**: the default when `CF_PAGES=1`. A Pages build may not select `test` (`PAGES_TEST_BUILD_FORBIDDEN`, build-target.mjs:10-12). Runs the media gate `requireReleasedMedia` at `buildStart` (vite.config.ts:57-61). The gate requires:
  - manifest `sourceAndLicense:"verified"` and `authorApproval:"approved"` (media-release-check.mjs:8);
  - a per-file SHA-256 match, plus `licenseEvidenceSha256` and approved receipts from both "Bird" and "LYL" (lines 19-23);
  - a walk of the whole `public/` tree that fails on any unlisted `webp|png|jpe?g|svg|mp4|webm|mp3|wav|ogg|m4a` (lines 32-37).
  - `JIUXIAO_RELEASE_CHANNEL=preview-1` forces `release` (vite.config.ts:26-27).
- **`cloudflare-preview`**: built through `node scripts/build/pages-preview.mjs`.
  - Sets `publicDir:false` (vite.config.ts:56), then copies only two static assets pinned by hash (`favicon.svg`, `compliance/beian-police.png`; pages-preview-assets.mjs:2-11).
  - Copies runtime media only with `--include-user-approved-media`, which also requires `docs/audit/public-demo-media-approval.json` with `attestedBy:"LYL"` and `directBirdSignature:false` (pages-preview.mjs:46-57), plus iOS JPEG fallbacks.
  - `verifyPagesPreview` then demands an exact output file set and digests, and forbids a top-level `404.html` (pages-preview-check.mjs:11-112).
  - An optional `VITE_API_BASE_URL` must be a public HTTPS URL ending in `/api` (vite.config.ts:33-45).
- **Current media manifest:** 88 files, all `licenseStatus:"approved"` with Bird+LYL receipts dated 2026-10-10. The receipt basis text says they were recorded "per LYL authorization + Bird review convention", re-signed by an "AI agent". Producers are `doubao` (scene and atlas art) and `openai` (`gate-moonlight`). Each file carries AIGC labels injected by `scripts/audit/apply-aigc-propagation-labels.mjs`, citing 《人工智能生成合成内容标识办法》 Art. 6.

**Pages Functions relay** (`functions/`):

- `_routes.json` includes only `/api`, `/api/*`, `/health` and `/ready`. Static files never invoke Functions. `_middleware.js:5-11` claims `/api*` before any SPA fallback.
- `api-proxy.mjs` behaviour:
  - **Upstream origin:** the only allowed origin is `https://api.jiuxiaogame.cn` (line 1). Any other `API_UPSTREAM_ORIGIN` is refused, except loopback `http` in `APP_ENV=simulation` (lines 153-179).
  - **Serving hosts:** only `jiuxiaogame.cn`, `play.jiuxiaogame.cn` and `www.jiuxiaogame.cn` (line 2). Any other host returns 503.
  - **Route A denylist:** `/api/auth/guest`, `/code`, `/refresh`, `/logout`, `/api/auth/guest/upgrade`, `/api/auth/phone*` and `/api/account*` return 404 (lines 30-36).
    - The block is applied after paths are normalised, including nested percent-decoding (181-209).
    - Some of those paths reopen when `JIUXIAO_EMAIL_AUTH_ENABLED=true` (216-221).
  - **Auth canonical origin:** `Origin` is rewritten to `API_AUTH_CANONICAL_ORIGIN` only when the request's own `Origin` equals the site origin and that host is in the production set (103-113).
  - **Body and headers:** 8 MiB body cap (line 3). Allowlisted request headers (6-16) and response headers (18-28). `Cache-Control: no-store` on every response (136). `Set-Cookie` headers are preserved individually (139-142). HSTS, nosniff and frame headers are added (38-43).

**API production** (manual, single VPS):

- **Caddy:** `deployment/Caddyfile` serves `api.jiuxiaogame.cn` with automatic HTTPS.
  - 8 MB request body (11-13); `no-store` and security headers (16-22); requests whose path still holds `%` or `\` after one decode get 400 (26-27).
  - Its own Route A block (34-37) covers `/api/auth/guest`, `/code`, `/refresh`, `/logout`, `/phone` and `/api/account` (with subpaths).
  - Forwards `Origin` and `Cookie`; fixed `Access-Control-Allow-Origin: https://play.jiuxiaogame.cn` (45); 180 s response-header timeout for turns (48).
- **Compose:** `deployment/api-production.compose.yml` requires an immutable `API_IMAGE` digest (4).
  - The API binds `127.0.0.1:8787` (12). A one-shot `migrate` service runs first.
  - A private `api.private.env` is used, and `runtime/` is mounted read-only for the host-installed rules module and narrative config (61-62).
  - Auth, SMS and account deletion all default to off.
  - Mail goes through the Tencent SES API, because individual accounts lost SMTP sending on 2026-03-02 (`api.private.env.example:36-39`).
- **Process:** `deployment/README.md:15-24`. Download the CI review bundle, build and push the image by hand, record its digest, then `docker compose up`, then `scripts/api-production-smoke.mjs`. The smoke script makes GET checks only and reports `siteRelay` and CORS (`api-production-smoke.mjs:20-117`).
- **Route policy:** the public site stays on "route A" (auth/account entry points closed) by owner decision of 2026-11-07 (README:5).
- **Local dev:** `docker-compose.yml` runs Postgres 17, Mailpit and the API on loopback.

**Supabase:**

- Used only for Auth OTP (email; phone is gated and off) and an SMS-budget hook. Hono keeps its own opaque session cookie and stable owner ID (`.env.example:9-17`; README:28-43).
- Supabase migrations and Edge Functions are applied by hand with the Supabase CLI. README:45 states that "nothing is done automatically by repository changes".

**Workers candidates:**

- `apps/api/src/worker.ts` + `wrangler.jsonc` are "not deployed and must not take over `/api/*`" (`worker-production.md:3`).
  - The rules runtime is not ported (14). The Hyperdrive ID is a placeholder (15). Business migrations are not applied; Resend mail is not opened.
- `deployment/playtest-worker.mjs` is a separate invited-playtest entry. It proxies `https://ninecloud-invited-playtest.3507103376.workers.dev` to `https://trial.jiuxiaogame.cn` (lines 2-3).
  - That target is an isolated playtest stack: compose with its own Postgres, an `AUTH_ENABLED` guest-only gateway, Basic-auth invite hash, Cloudflare tunnel, and a Caddy fragment.

**Automated vs manual:**

- **Automated:** CI on pull requests and on pushes to `main`. It covers lint-free checks, the licence gate, migrations, the Caddyfile validation, typecheck/test/build, the artifact scan, the release-target build, an API image smoke test, PostgreSQL integration, card/erasure suites, Chromium e2e and backup restore. It then uploads an engineering review bundle marked `releaseApproved:false` (`write-review-bundle.mjs:26`).
- **Not automated:** there is no deploy job of any kind in `.github/`, for Pages, the API image push, the VPS, Supabase or DNS. **[inference]** Pages deploys come from Cloudflare's own Git integration (`CF_PAGES=1` defaults to `release`), so they are not visible in this repo.

---

## 3. CI and tests: what they lock

**CI** is a single `verify` job (`.github/workflows/ci.yml:12-206`) plus a `badge` job that publishes the result to a public gist (208-240). The step order is in §2.

Notable steps:

- `fetch-depth: 0` (line 39) is needed because `foundation.cjs` runs `git show d73e0b7:apps/web/src/style.css`.
- `pnpm scan:artifacts` (87-93, 106-111) **fails if three.js code or the `scene-studio`/`scene-gate` packages reach `apps/web/dist`**. The needles are `THREE.Revision`, `three.module` and `three.core` (`scripts/audit/artifact-scan.mjs:7-10`).
- The e2e chain is `pnpm test:e2e` (`package.json:23`, 13 files) plus `card-availability`, `turns` and `cloud`.

### 3a. Tests that lock visual details (a visual redesign must rebuild or replace these)

| File | In CI? | What it pins |
|---|---|---|
| `tests/e2e/foundation.cjs` (visual parts) | yes | **Frozen-style fingerprint of the professional AI editor.** Hashes the computed styles of the page and compares them with the CSS at baseline commit `d73e0b7` plus an authorised delta (19-22, 726-840; delta rules in `professional-readability-contract.cjs`). <br>**Class names:** `.brand`, `.hero-verse` text, `.scene-picture`, `.portal-enter::after` animation `none`, `.waterfall-traces path` count 3, `.scene-cloud-drift-one` animation, `.jx-shell::before` background containing `/scenes/candidate/mountain-gate.`, day-theme `.role-summary strong` = `rgb(41, 58, 70)` (725). <br>**Font:** "Ma Shan Zheng Brand" (202). <br>**WebGL internals:** POINTS pass for particles; TRIANGLES on a 48-byte full-screen quad (96-166, 1136-1147); canvas classes `.scene-atmosphere-webgl/-2d/-canvas`. <br>**Counts:** gallery collections 7/16/14/4/3/10/10/6/4 (657-660); 4 `.scene-choice`; 25 provider buttons; 12 comparison rows. |
| `tests/e2e/design-acceptance.cjs` (called from `foundation.cjs:1663`, and via `test:e2e:design`) | yes | Full-page screenshots and pixel sampling for contrast and shadows on baseline pages (`home`, `lobby`, `game`, `world`, `ai-mode`, line 426); getComputedStyle- and geometry-heavy. |
| `design-token-audit.cjs`, `design-audit-regression.cjs`, `design-acceptance-runner.cjs` | no (`test:e2e:design`) | Required token values such as `--jx-space-1:4px` across 20 named stylesheets; synthetic contrast audit. |
| `liquid-glass.cjs`, `liquid-glass-production-guard.cjs` | no | `backdrop-filter: blur(20px)`, SVG refraction filter that must change pixels, glass on specific selectors. |
| `game-shell.cjs` | no (`test:e2e:ui`) | Header `backdrop-filter` `blur(12px)`, 38 class selectors, 16 px input floor. |
| `spatial-ui.cjs`, `jx-ui-e-visual.cjs`, `s-final-quality.cjs`, `professional-focus.cjs`, `professional-quality.cjs`, `world-description-contrast.cjs`, `stress-audit.cjs`, `cloud-settings-layout.cjs` | no | Width/theme matrices; overflow; class selectors; sizes such as buttons `size===14`, `height>=44` and helper text ≥12 px; the 225 px action-bar token. |
| `cloud-game-shell.cjs` | yes | "Presentation regression" with synthetic API; geometry and class assertions. |
| `filing-notice.cjs` | yes | Visual part: badge 20×20 px, `object-fit: contain`, centred within 2 px, ≤24 px from footer bottom. The behaviour part is listed in 3b. |
| `acceptance-feedback.cjs` (called by `foundation.cjs`) | yes | 22 class selectors around feedback defects. |
| `favicon-byte-stability.cjs` | no | Byte-identical favicon under Windows checkout, because the release manifest hashes it. |

Keep the principles, not the selectors: no horizontal overflow at 320/360/390 px, WCAG AA contrast, reduced-motion and data-saver must stop animation, WebGL → WebGL1 → Canvas2D → static fallback, 16 px input floor, and skip links.

### 3b. Tests that lock real behaviour or data (keep; port their assertions to a new UI)

Most call a real built API, PostgreSQL or IndexedDB, or locate elements by role and accessible name rather than by class.

- **`foundation.cjs` (behaviour parts):**
  - **Character creation:** 3-step wizard; draft survives refresh; ≤3 talents; idempotent double submit; a failed IndexedDB write creates no save.
  - **Saves:** missing-save links; pending-action queue; localStorage-quota → IndexedDB durability; two-tab stale save → "另存为分支"; save manager rename/delete with name confirmation and concurrency checks.
  - **Import/export:** supplement import ≤100,000 B; JSON/HTML/TXT import ≤20 MiB with exact original-byte backup before parsing; HTML never executed; credential redaction in preview and export; ID-collision replace/copy; `jiuxiao_v1_library` migration with duplicate IDs; damaged mirror recovered from IndexedDB.
  - **AI key hygiene:** keys only in memory or sessionStorage config; never in saves, logs or exports; probe needs explicit permission; no auto-retry; timeout aborts.
  - **Worldbook:** exactly 34 public Canon entries; author source IDs and pending OCR never exposed.
  - **Graphics:** preference persistence (`jx10_graphics_v1`); audio only after a user gesture.
- **`prologue.cjs`:** an invalid `TURN_RULES_MODULE` must stop the API from listening (`INVALID_TURN_PLUGIN`). With no module, every create or turn returns 503 `RULES_NOT_READY` and nothing is written.
- **`p1-authenticated-candidate.cjs`:** real API + Postgres P1 prologue. Covers `forgetting` and `continue` memory modes, deterministic NPC 岑九 lines, clues, item 避水符, combat 灰羽鸦, quest `quest_first_clearance`, idempotent duplicate turn, revisions = 6, NPC journal and observation counts (190-291).
  - *Weakness:* the test passes as "fail-closed" when the API refuses to start with `P1_REVIEW_RULE_BUNDLE_MISMATCH` (116-132). A green CI run therefore does not prove that gameplay ran.
- **`p1-action-suggestions-ui.cjs`:** the first suggestion appears within 3 s; the receipt binds to event ID and state revision.
- **`p2-authoritative-idb.cjs`:** IndexedDB `jiuxiao-1` upgrade v2→v3 keeps old rows. Cross-tab compare-and-swap lets exactly one commit through. A retry after reload returns the original receipt. A unique-key abort rolls back atomically. 100-turn replay and hash-chain checks. Page-close recovery. Archive export/restore round trip (stores: `authoritativeSaves`, `turnEvents`, `turnReceipts`, `authorizedObservationOutbox`, `turnIntegrity`, `turnCheckpoints`).
- **Real API/PG gameplay journeys:** `p2-gameplay.cjs`, `story-first-golden.cjs`, `p2-local-gameplay.cjs` (dual memory, T80, idempotency).
- **Recovery and cloud flows:** `cloud-game-cache.cjs`, `cloud-game-recovery*.cjs`, `turns.cjs`, `creation-race.cjs`, `preview-gameplay-build.cjs`, `p6-candidate-digest.cjs`. `cloud.cjs` uses the real API, ephemeral PG and Mailpit OTP.
- **Auth and cards:** `auth-login-ui.cjs` (Turnstile token → SMS request; provider-off UI fails closed). `card-availability.cjs`, `cards-dev-demo.cjs`, and the `card-ui*` and `local-node-card-host` files.
- **Compliance:** `filing-notice.cjs`, behaviour part: the footer must show ICP filing `蜀ICP备2026059848号-1` and public-security filing `川公网安备51012202002714号`, linking to `beian.miit.gov.cn` / `beian.mps.gov.cn` in a new tab. This is a legal requirement; keep it in any redesign.
- **All of `tests/integration/`:** behaviour and data, none visual. Coverage includes the relay boundary (`pages-api-relay.test.mjs`), production smoke, playtest gateway/worker, fresh and upgrade migrations, backup snapshot/restore, card install/upgrade/real-play/history/strict-multi, M3 reconciliation, environment runtime (which copies `_routes.json` and the Caddyfile), API image smoke and the live Supabase erasure guard.
- **`scripts/**/*.test.mjs`:** licence policy, media gate, artifact scan, CI evidence, test-DB guard.

**Orphans:** `card-ui*.cjs`, `local-node-card-host.mjs`, `first-play-ux.cjs`, `legacy-preview-upgrade.cjs`, `run-local-card-pg.mjs` and `supabase-erasure-live*.mjs` are not referenced by CI or by any `package.json` script. `card-ui-s2-real.cjs:2` hard-codes `C:/Program Files/Google/Chrome/Application/chrome.exe`.

---

## 4. Legacy prototype (`work/`): what it did and what to recover

**What it was.**

- A single self-contained HTML game built by `work/build_v1.py`. The script strips the v2.8 template's scripts and inlines CSS, fonts (`ui-fonts.css` 8.3 MB), base64 images, an OCR corpus, embedded "legacy authority" text and the scripts (`ai-provider`, `ai-router`, `ai-settings`, `v1`, anime.js, `jx-atmo`, `jx-motion`).
- Output is about 11.9 MB per copy in `outputs/九霄WEB-1.0/` (build_v1.py:41-55).
- It reads a template from an absolute local Windows path (`build_v1.py:3`).

**Features** (`work/v1.js`):

- **Save library:** stored in localStorage key `jiuxiao_v1_library`, version 1 (v1.js:10).
  - Optimistic concurrency by comparing raw text before each write, so other tabs' progress is never overwritten (30-42, 56-62).
  - A damaged library is backed up under `_recovery_*` keys and exportable (32-36, 43-50).
- **Save format** (`blank()`, v1.js:63): `{id, name, created, updated, turn, messages[], player{中文键}, npcs[], world{elapsedMinutes, location}, items[], events[], stm[], ltm[], facts[], actions[], legacy{}, supplements[], pending}`.
  - Export envelope: `{format:"JIUXIAO_SAVE", version:1, save}`, never containing API keys (252).
  - Strict validator, including prototype-pollution key checks (199-221).
- **Turn loop:**
  - A turn becomes `pending` before the AI is called (229).
  - The narrative draft and raw model reply are retained on `pending`, so a failed state settlement can be retried without regenerating text (235-239, 136-138).
  - Only the validated `apply()` commits state (227-228). Cancel uses `AbortController`.
- **Rules prompt and output contract** (`RULES`, 147-152): the GM prompt covers Canon vs this-run facts, OCR-unreviewed materials as data, the realm order 炼体→…→渡劫, and a GM-override flag "指定结果 · 本局 GM 覆盖" (150, 301). The model must return one JSON object containing story, player delta, npcs, items, world, elapsedMinutes, summary, longSummary, facts and 3-6 actions.
- **Short-term and long-term memory (STM/LTM):**
  - STM holds at most 5 events. On the 6th, the model's `longSummary` folds those events into one LTM entry carrying their `eventIds` (228, 209).
  - Context assembly, capped at 60,000 characters (155-176): the top 5 LTM entries by Chinese-bigram overlap with the action, the last ≤12 messages, and up to 14 OCR source snippets tagged `OCR_UNREVIEWED` (153).
- **NPCs and items:**
  - NPCs carry `visibility: PLAYER_KNOWN | GM_ONLY`; GM-only NPCs are hidden from panels (97, 197).
  - Items carry `quantity: null` for unknown and a `unit`, so "bottles" are never counted as "pills" (178-194).
- **Multi-AI roles** (`ai-provider.js:4`, `ai-router.js:5-9, 103-128`): `story` 主剧情, `director` 剧情导演, `premiumDirector` 高级剧情, `stateManager` 状态与记忆, `archive` 世界档案.
  - A complexity score routes heavy turns to the director roles; the directors return plot beats, forbidden events, foreshadowing and hidden information.
  - `stateManager` extracts only what the narrative states happened, plus `worldEvents` and foreshadowing with `importance 0-100`.
  - The `archive` reviewer audits contradictions every 25 turns (`archiveInterval:25`), advice only.
  - Keys live in sessionStorage; the browser calls providers directly (BYOK).
- **Other player features:** A-F quick choices that can be combined (229); per-save input drafts (116-129); supplements ≤100 KB (309); import ≤20 MB of JSON/HTML/TXT, with migration that parses the old `<details>` panels 角色状态 / 综合情报 / 星记忆回廊 and STM/LTM tables (254-297); a bundled 161-turn "临江仙" snapshot (302); a world view that searched 182 OCR screenshots (298).

**Worth recovering conceptually:**

1. The two-phase turn: narrative draft first, then state settlement, with retained drafts and raw replies, so text is never lost on failure. The current product's receipt and idempotency model already generalises this.
2. Role separation: narrator vs director vs state extractor vs periodic archivist. This maps directly onto a "director/camera" layer for a staged or 3D scene. The current AI settings still expose the same five roles.
3. STM→LTM folding with event-ID provenance, and the visibility split (`GM_ONLY`), as concepts for an NPC knowledge boundary.
4. Foreshadowing and world-event ledgers with importance scores, which a UI can drive as quest threads or map markers.
5. Item quantities that may be unknown, with units.
6. A-F affordances plus free text; the GM-override toggle as an explicit "author mode".
7. Lossless legacy import: original-byte backup and `legacy` archive panels kept inspectable.

**Obsolete:**

- localStorage-only library; single-HTML inlining with base64 media.
- The model deciding state. Replaced by server-authoritative rules: `TURN_RULES_MODULE` and the P1 plugin.
- OCR-unreviewed text fed to prompts. Replaced by the 34-entry Canon 1.0 runtime.
- Bigram retrieval; the `jx-glass`/`jx-motion`/anime.js experiments; the 182-OCR world search.
- The many `work/*.py` one-off fix scripts. `.gitignore:37` ignores `work/*.py`, yet about 30 are tracked.

---

## 5. Assets and research folders

**`问卷调查分析/` (player survey).**

- **Sample:** N=8, a convenience sample, with zero SillyTavern-style ("酒馆") users. Recomputable from `raw/answers-28047242.json` via `aggregate.py`. The authors label all conclusions "direction only".
- **Devices and sessions:** 75% play on phone (only or mostly); 50% have "irregular" session lengths. → Mobile is a hard requirement, and resume-anywhere must be safe.
- **What players want from the AI:**
  - Q18: "understand what I say and turn it into actions" and "generate random quests/events/world changes" tie at 62.5%. "Write plot and dialogue" gets 12.5%.
  - Q19: "writes fluent stories" gets 0 votes. → Players want an action interpreter plus world engine, not an AI novelist.
- **Consistency is a baseline, not a selling point:** Q21 items all average ≥3.88; "long-save consistency" averages 4.50, the highest in the survey. Yet Q34 "keep only one feature" gives consistency 0 votes.
- **Gameplay interest (Q11, 5-point):** multiple endings 4.38, free combat 4.12, random events 4.12, dynamic world 3.88. Cultivation/breakthrough 2.75, gear collection 2.75, sect management 2.88, NPC socialising 2.88. Only 25% prefer the xianxia theme. Q12 (pick 3): multiple endings 50% first.
- **Freedom and failure:** Q14: 62.5% accept instability for freedom, 37.5% want a stable overall direction, 0% refuse. Q16: 62.5% want "penalty but recoverable"; 12.5% permadeath; 0% "no failure".
- **NPCs:**
  - Q10: OOC characters ("崩人设") are the top pain point at 75%.
  - Q24: NPC independent motives 100% accepted, half of those only with set-up.
  - Q23: 50% accept "forgets but never misremembers"; 37.5% accept misremembering.
- **Interface (Q25), the point most relevant to a visual redesign:** "portrait + scene illustration + collapsible status bar" 50% / 37.5%; pure text chat 0%. Q27: 62.5% want a tutorial; Q26: 50% want mixed input.
- **Pricing:**
  - Q28: one-time purchase 75%, subscription 12.5%. Q29: willing to bring their own key 12.5%.
  - Q31: price 1–30 CNY 50%, 31–68 CNY 37.5%, above 69 CNY 0%.
  - Q35 fears: monetisation or "being harvested" 3 of 8, kitchen-sink scope 1, "cheap AI flavour" 1, no goal 1, the developer disappearing 1.
- **Platform:** Q32 75% want card creation/import, but Q33 50% say finish the base game first.
- **Recommendation score:** 6.4/10, bimodal.
- Recommendations doc: P0 = natural language → action settlement, long-save consistency, mobile + resume (no overflow at 360×800), character credibility. P1 = endings, events, free combat, illustrated UI, guided setup. P2 = no permadeath, no subscription-first.

**`九霄素材-水墨古风/`:**

- **Contents:** 125 files, 103 MB, the source pack. Scene posters 8, brand 4, textures 3, video 2, world/regions 13, factions 32, systems 20, artefacts 20, characters 10, weather 6, battle 4.
- **Format:** JPEGs carrying AIGC APP11 metadata (the README says they were renamed from mis-labelled `.png`).
- **Licence status, contradictory:** the README says "candidate; not in the web build; source/licence/LYL-Bird per-file confirmation not registered". The runtime derivatives' manifest says `verified/approved` as of 2026-10-10 (see §2 and §6.5).

**`outputs/` classification:**

- **(a) Historical single-HTML playtest builds:** `九霄WEB-1.0/`, with 5 near-identical 11.9 MB HTML copies, a source mirror, test pages and Chinese how-to/recovery notes. Generated; do not edit.
- **(b) Current Canon reading material:** `九霄世界书/` README, Canon 1.0 reading edition and source audit table (written by `scripts/build-worldbook-reading-edition.mjs:42-43`). The other files there are historical snapshots per AGENTS.md.
- **(c) Legacy OCR data:** `设定OCR数据.json` (182 records, still read by `scripts/audit-worldbook-sources.mjs:15`), `设定截图OCR汇编.md`, `游玩回合索引.txt`.
- **(d) Acceptance spreadsheet:** a 2026-10-03 workbook plus a 538 KB inspect dump.
- **(e) Cloudflare onboarding notes:** `cf-check.sh`, `操作手册.md`.
- **(f) Runtime analysis:** `九霄运行结构分析.md`.

---

## 6. Problems found

1. **The relay and the origin disagree on email login.** `functions/_lib/api-proxy.mjs:216-221` reopens `/api/auth/code`, `/verify`, `/restore`, `/refresh` and `/logout` when `JIUXIAO_EMAIL_AUTH_ENABLED=true`. `deployment/Caddyfile:35` always returns 404 for `/api/auth/code`, `/refresh` and `/logout`. The relay's only upstream is that Caddy host (api-proxy.mjs:1, 175-177), so flipping the Pages variable alone cannot open email login. **Question:** is the intended order "edit Caddy first", and is that documented?
2. **CI evidence depends on step names.** `scripts/build/write-closeout-packets.mjs:27` requires GitHub's default names for unnamed steps ("Run pnpm typecheck", "Run pnpm test", and so on). Renaming any CI step breaks the closeout packet. Only ci.yml:148 warns about this.
3. **A stale hard-coded licence state in an evidence file.** `write-closeout-packets.mjs:54` writes `license:'LICENSE_PENDING'` for every asset in `MediaManifest.json`. The source manifest says `approved` for all 88, and the release build in CI (ci.yml:94-105) passes on that basis.
4. **The T1 CI step depends on a pending patch applying cleanly.** `scripts/build/t1-authority-ci.mjs:89` applies `docs/integration/remaining-closeout-20261119/t1-authority.PENDING.patch` to a temp copy of `apps/api/src`. Any API refactor that conflicts with the patch turns CI red, independent of product correctness.
5. **The rule-approval digest is sensitive to the toolchain.**
   - `scripts/p1-rule-semantic-source-digest.mjs:194` mixes `ts.version` (the `typescript-compiler-api` alias pinned at 6.0.2, `package.json:44`) into the approved P1 rule digest, across 33 source files (10-44).
   - Dependabot groups dev-dependency minor/patch bumps (`.github/dependabot.yml:37-41`). A routine bump would change the digest, and the plugin then fails closed in production. `p1-authenticated-candidate.cjs:116-132` turns that state into a passing test.
   - Any semantic edit to rules, NLU or contract code also needs re-approval, which constrains a full-stack redesign.
6. **Media receipts are rewritten by machine, and the documentation disagrees.**
   - `scripts/audit/apply-aigc-propagation-labels.mjs:255-258` updates `authorReceipts[].assetSha256` to the new bytes after injecting metadata, and appends "re-signed … AI agent per LYL authorization". Human approvals end up bound to bytes a script produced.
   - `pages-preview.mjs:55` requires `directBirdSignature:false`.
   - `九霄素材-水墨古风/README.md` still says licences are unregistered, and cites `pnpm assets:manifest:check`, which does not exist in root `package.json`. **Question:** what is the actual legal licence for Doubao/OpenAI outputs used commercially?
7. **Regenerating the assets wipes approvals and AIGC labels.** `scripts/assets/build-visual-candidates.py:166-168, 252-256` writes metadata-free WebP files and resets the manifest to `unverified/pending` with no receipts or AIGC labels. Re-running it silently undoes the approvals and the Art. 6 labels until the AIGC script runs again.
8. **The media gate ignores 3D and binary formats.** `media-release-check.mjs:32` checks only image, audio and video extensions. `.glb`, `.gltf`, `.bin`, `.ktx2`, `.basis`, `.hdr`, `.exr` and `.wasm` would ship under `public/` with no licence, AIGC or hash gate. The playtest front's MIME map (`deployment/playtest-front.mjs:8`) also lacks them.
9. **Infrastructure details sit in tracked files.**
   - `deployment/playtest-worker.mjs:2` exposes the workers.dev account subdomain.
   - `.env.example:14` and the compose files carry the Supabase project ref `deyzirwnzjxsmyvfrsdb`.
   - `ci.yml:221` holds the public gist ID.
   - Local absolute paths: `work/build_v1.py:3` (`C:\Users\11954\…`) and `问卷调查分析/04-对开发决策的建议.md` §5 (`C:\Users\Lenovo\…`, `D:\九霄 WEB\…`).
   None of these is a secret, but they conflict with AGENTS.md's "no local absolute paths" hygiene.
10. **Repository bloat.** `tests/experiments/` holds about 550 MB of tracked gz/json/log files. `work/` and `outputs/` hold about 47 MB and 60+ MB of generated single-HTML copies. Clone and CI cost scales with this. `.gitignore:37` (`work/*.py`) is contradicted by tracked files.
11. **Windows-specific test harnesses.** Many tests fall back to an Edge executable path. `card-ui-s2-real.cjs:2` hard-codes Chrome, and several card/UI tests are not wired into CI (see §3b orphans).
12. **`scripts/build/card-pg-ci.mjs:34-35`** creates roles without `IF NOT EXISTS` or cleanup. This is acceptable only on disposable runners, as the script itself enforces at line 10.

---

## 7. Implications for a redesign

**Infrastructure constraints:**

- The front end is static Cloudflare Pages. Functions run only for `/api*`, `/health` and `/ready` (`_routes.json`), and all API responses are `no-store`.
- The API is a single domestic VPS behind Caddy, with a 180 s turn timeout, an 8 MB body limit and one hard-coded upstream origin. The relay refuses any other upstream or host (api-proxy.mjs:1-2, 153-179).
- The server holds rule authority. A host-installed `TURN_RULES_MODULE` is required, or gameplay returns 503. Rule and contract code is pinned by an approval digest.
- Route A keeps auth and account entry points closed in two layers, relay and Caddy.
- Mainland compliance must survive any redesign: ICP and public-security filing footer (`filing-notice.cjs`), AIGC implicit metadata labels plus explicit labels for AI-generated media, and a privacy policy URL/version.

**For real-time 3D assets:**

1. **Lift the three.js ban.** CI fails on three.js in `dist` (`artifact-scan.mjs:9`; ci.yml:87-93). Lifting it needs an explicit owner decision, a scanner change, and a bundle-size budget.
2. **Gate 3D formats.**
   - Extend `requireReleasedMedia` and the manifest schema to `glb/gltf/bin/ktx2/basis/hdr/wasm`.
   - Decide how AIGC labels are carried in glTF (for example `asset.extras` or XMP) and in KTX2. The current injector handles only WebP and MP4 (apply-aigc…mjs:220-222).
3. **Host heavy media off git.**
   - Put immutable hashed asset URLs on a CDN or object store (Cloudflare R2, or a domestic CDN for mainland latency **[inference]**). Generate the manifest from object hashes.
   - Pages per-file size and file-count limits apply if assets stay in `public/`; verify the current Cloudflare limits.
4. **Add caching headers.** `apps/web/public/_headers` sets only security headers, so add `Cache-Control: public, max-age=31536000, immutable` for hashed `/assets/*` and model/texture paths. Set correct MIME types: `model/gltf-binary`, `image/ktx2`, `application/wasm`. The playtest gateway already applies immutable caching to `/assets/` (playtest-front.mjs:55).
5. **Keep heavy assets on the static path.** Never route assets through Functions; the relay forces `no-store`.
6. **Keep the fallback ladder** (WebGL2 → WebGL1 → Canvas2D → static), the data-saver 30 FPS cap and reduced-motion behaviour, because the survey says 75% of players are on phone. Provide device-tiered LODs. The `DeviceTestRecord` packet (write-closeout-packets.mjs:55) already expects fps, memory, temperature and battery evidence.

**Tests:**

- **Rewrite:**
  - every file in §3a;
  - the visual half of `foundation.cjs` (CSS fingerprint vs `d73e0b7`, WebGL draw-call instrumentation, class and count selectors) and `design-acceptance.cjs`;
  - token, liquid-glass, game-shell, spatial and professional suites; `cloud-game-shell`; `cloud-settings-layout`;
  - the geometry part of `filing-notice`.
  Replace them with invariant checks: no overflow, contrast, focus, reduced motion, fallback ladder, plus new 3D performance budgets.
- **Keep:** every behaviour/data test in §3b and all of `tests/integration/` and `scripts/**/*.test.mjs`. Retarget their selectors to roles and accessible names where they currently rely on classes such as `.game-topline h1`, `.pending-intent` and `.save-manager-list .card`.
- **Fix the false green:** `p1-authenticated-candidate.cjs` should fail on bundle mismatch, at least in a non-gate job, so that gameplay is actually exercised.
