# 《九霄》 domain / contracts / content / db: dossier

Worktree studied: 研究工作区 at `fe171ff` (branch `docs/vision-02-claude-research`). I only read files. I modified, built and committed nothing, and ran no repository scripts.
Path shorthand: `contracts/` = `packages/contracts/src/`, `domain/` = `packages/domain/src/`, `content/` = `packages/content/src/`. A citation `file:N` is a line number in that file.

A note on Canon status (per `docs/世界书核验状态更正.md` and `docs/世界书Canon1.0交付说明.md`), so nothing below repeats the obsolete claims:
- **Source material / text preparation:** 179 numbered original images plus 28 supplements have been independently OCR cross-checked. 14 later supplements were checked visually. All 182 legacy numbers have a recorded disposition (3 were excluded by the user).
- **Image review / author adjudication:** 19 decisions are recorded. `imageByImageVisualVerificationComplete` is still `false`, so this is not an author page-by-page sign-off.
- **Canon intake:** 34 confirmed entries are in the runtime package. 5 `author_addition` entries are `deprecated` and kept only for history. `reviewQueue` is empty, and 6 gaps are in `resolvedSourceGaps`.

---

## 1. Coverage table

Status meanings:
- `full`: every line read.
- `skimmed`: structure, test names or the key DDL read, not every line.
- `sampled`: a generated data file inspected by script.
- `not read`: not opened.

| File | Lines | Status |
|---|---:|---|
| docs/世界书核验状态更正.md | 13 | full |
| docs/世界书作者侧交付验收索引.md | 26 | full |
| docs/世界书Canon1.0交付说明.md | 61 | full |
| canon-content-digests.json | 143 | sampled (header, algorithm, count = 34) |
| **packages/contracts** package.json | 17 | full |
| contracts/index.ts | 10 | full |
| contracts/action.ts | 31 | full |
| contracts/character-profile.ts | 15 | full |
| contracts/decision.ts | 107 | full |
| contracts/errors.ts | 14 | full |
| contracts/event.ts | 28 | full |
| contracts/json-bounds.ts | 20 | full |
| contracts/legacy-save.ts | 42 | full |
| contracts/prologue.ts | 89 | full |
| contracts/save.ts | 100 | full |
| contracts/state-delta.ts | 15 | full |
| contracts/turn.ts | 79 | full |
| contracts/world.ts | 12 | full |
| contracts/contracts.test.ts | 218 | full |
| contracts/prologue.test.ts | 84 | full |
| **packages/domain** package.json, tsconfig.json | 38/6 | full |
| domain/index.ts | 12 | full |
| domain/rules.ts | 157 | full |
| domain/prologue-v1-rules.ts | 1106 | full |
| domain/prologue-v1-time.ts | 98 | full |
| domain/event-log.ts | 265 | full |
| domain/projection.ts | 8 | full |
| domain/state-delta.ts | 17 | full |
| domain/narrative-scheduler.ts | 111 | full |
| domain/provider-http.ts | 11 | full |
| domain/provider-narrative.ts | 13 | full |
| domain/provider-protocol.ts | 61 | full |
| domain/memory/belief.ts | 42 | full |
| domain/memory/policy.ts | 110 | full |
| domain/memory/retrieve.ts | 50 | full |
| domain/memory/recall-authorized.ts | 242 | full |
| domain/memory/turn-journal.ts | 426 | full |
| domain/memory/p4-recall-cues-v1.json | 10 | full |
| domain/memory/p4-recall-policy-v1.json | 15 | full |
| domain/memory/p4-recall-policy-v2.json | 21 | full |
| domain/nlu/index.ts | 1 | full |
| domain/nlu/action-parser.ts | 346 | full |
| domain/nlu/prologue-v1-nlu-fixtures.ts | 48 | full |
| domain/prologue-v1-candidate.test.ts | 333 | full |
| domain/prologue-v1-rules.test.ts | 571 | skimmed (all test names, plus lines 240–300 and 505–520) |
| domain/prologue-v1-time.test.ts | 85 | skimmed (test names) |
| domain/rules.test.ts | 123 | skimmed (test names) |
| domain/event-log.test.ts | 261 | skimmed (test names) |
| domain/memory/memory.test.ts | 66 | skimmed |
| domain/memory/recall-authorized.test.ts | 174 | skimmed |
| domain/memory/retrieve-modes.test.ts | 51 | skimmed |
| domain/memory/turn-journal.test.ts | 259 | skimmed |
| domain/nlu/action-parser.test.ts | 211 | skimmed |
| domain/nlu/prologue-v1-nlu-fixtures.test.ts | 73 | skimmed |
| **packages/content** package.json, tsconfig.json | 46/5 | full |
| content/index.ts | 5 | full |
| content/realm-order.ts | 4 | full |
| content/p1-review-candidate.ts | 3 | full |
| content/canon-artifact.ts | 10 | full |
| content/source-register.ts | 25 | full |
| content/worldbook.ts | 107 | full |
| content/worldbook-publisher.ts | 79 | full |
| content/worldbook.test.ts | 79 | full |
| content/worldbook-publisher.test.ts | 46 | full |
| content/canon-receipts.test.mjs | 81 | full |
| content/canon-runtime.json | 1269 | full for content: all 34 entries' `content` text printed by script and read; JSON scaffolding sampled |
| content/canon.registry.json | 3656 | sampled: top-level keys, entry statuses, the 5 deprecated entries, 19 decision subjects, sourceRegistry counts, reviewSummary, intakes |
| content/canon-receipts.json | 617 | sampled (structure, first entry, review timestamps) |
| content/prologue/prologue-v1.ts | 378 | full |
| content/prologue/prologue-v1.rulebook-candidate.ts | 131 | full |
| content/prologue/prologue-v1.test.ts | 122 | full |
| content/rules/prologue-v1.constants.ts | 129 | full |
| content/rules/prologue-v1.constants.test.ts | 44 | full |
| content/scenes/manifest.ts | 61 | full |
| content/scenes/manifest.test.ts | 21 | full |
| **packages/db** package.json, drizzle.config.ts | 17/8 | full |
| packages/db/tsconfig.json | 5 | not read |
| packages/db/src/schema.ts | 294 | full |
| packages/db/drizzle/0000…0026, 0029 (*.sql, 28 files) | 2–240 each | skimmed (DDL object names by grep). Heads of 0013, 0015 and 0029 read. |
| packages/db/drizzle/meta/_journal.json | 202 | sampled (tags list) |
| packages/db/drizzle/meta/*_snapshot.json (11) | 285–956 | not read (generated) |
| packages/db/pending/0027_narrative_publication.sql | 160 | skimmed (head + DDL names) |
| packages/db/pending/0028_narrative_ownership.sql | 335 | skimmed (DDL names) |
| packages/db/permissions/*.sql (3) | 97/10/23 | skimmed (grep only) |
| **packages/scene-gate** package.json | 17 | full |
| packages/scene-gate/tsconfig.json | 5 | not read |
| packages/scene-gate/src/index.ts | 561 | skimmed (lines 1–140 read; rest outlined by grep of Three.js objects and functions) |
| **supabase** config.toml | 11 | full |
| supabase/functions/send-sms-hook/index.ts | 211 | skimmed (first 30 lines) |
| supabase/functions/ses-callback-ingest/index.ts | 77 | skimmed (first 20 lines) |
| supabase/migrations/*.sql (5) | 8–158 | skimmed (heads + DDL names) |

Out of scope, but read briefly to verify integration claims: `apps/web/src/ui/realm.ts:1-40`, `apps/api/src/services/approved-player-actions.ts:1-30`, plus greps over `apps/` for consumers.

---

## 2. Rules as a player experiences them (P1 prologue, ruleset `prologue-v1*`)

### 2.1 Time, resources and the turn

The persisted clock is `facts.gameMinute` (`domain/event-log.ts:214-220`). The action unit is the **刻 (Kec)**.

All constants are in `content/rules/prologue-v1.constants.ts`. Values marked "must be" are locked by `domain/prologue-v1-rules.ts:976-984`.

| Constant | Value | Line | Meaning |
|---|---:|---|---|
| GAME_MINUTES_PER_KEC | 15 | :8 | 1 刻 = 15 game minutes (must be 15) |
| DAY_KEC_COUNT | 96 | :9 | a day is 96 刻 = 24 h (must be 96) |
| SAVE_START_GAME_MINUTE | 300 | :10 | new game starts at 05:00, day 0 (must be 300) |
| DUSK_START_KEC | 48 | :11 | dark from 刻 48 = gameMinute 1020 (17:00) until 05:00 (must be 48) |
| STAMINA_MAX | 100 | :12 | 体力 (stamina) |
| SPIRIT_MAX | 100 | :13 | 心力 (`spiritStamina`) |
| CULTIVATION_MAX | 10 000 | :14 | progress cap (= 100.00 %) |
| CULTIVATION_PER_KE | 800 | :15 | progress per normal 刻 |
| CULTIVATION_FATIGUE | 200 | :16 | progress for the single fatigued 刻 |
| FATIGUE_THRESHOLD | 20 | :17 | must equal CULTIVATE_COST_PER_KE |
| SLOT_MAX | 8 | :18 | inventory stacks (also `contracts/prologue.ts:55`) |
| MOVE_COST | 5 | :19 | |
| MOVE_BLOCKED_COST | 10 | :20 | |
| MOVE_BYPASS_COST | 15 | :21 | |
| OBSERVE_SCAN_COST | 3 | :22 | |
| OBSERVE_STUDY_COST | 6 | :23 | |
| CULTIVATE_COST_PER_KE | 20 | :24 | |
| TALK_COST / USE_ITEM_COST | 0 / 0 | :25-26 | declarative only; not read by the reducer |
| COMBAT_COST | 25 | :27 | charged to both stamina and spirit |
| CLEAR_THRESHOLD | 25 | :28 | minimum stamina and spirit needed to avoid retreat |
| RETREAT_SPIRIT | 5 | :29 | spirit is *set* to 5 after a retreat |
| FREE_ACTION_TICK_KEC_COUNT | 1 | :33 | zero-cost actions still take 1 刻 |
| MAX_CULTIVATION_KES_PER_ACTION | 8 | `contracts/action.ts:3` | |
| PROLOGUE_V1_LOCATION_LIMIT | 3 | `contracts/prologue.ts:5` | exactly 3 locations; 2 known at start (`prologue-v1-rules.ts:771-775`) |

**Clearance margin.** `minimumClearanceCost()` = 3×2 + 5 + 6 + 25 = 42, and the margin is 100 / 42 ≈ 2.38. The rulebook is rejected unless the margin is between 1.5 and 3 (`constants.ts:120-129`, `prologue-v1-rules.ts:970-972`).

**Daily reset** (`prologue-v1-rules.ts:662-678` and `prologue-v1-time.ts:52-72`):
- Stamina returns to 100 only when an action reads resources after the game day index has advanced (a new day starts at 05:00).
- Spirit returns to 100 at the same boundary.
- No reset happens within a day.
- **There is no rest, wait or sleep action.** Time advances only when an action is committed.

**Clock display.** `readKecClock` produces `第N刻` (`prologue-v1-time.ts:87-94`).

**Dark.** `isDaylight` is false when the 刻 index within the day is ≥ 48 (`prologue-v1-time.ts:75-84`).

**Pipeline for one turn** (`domain/rules.ts:60-110`):
1. Hard rejections, all zero side effects:
   - schema failure → `ENV_PAYLOAD_INVALID`
   - stale revision → `ENV_REVISION_STALE` (:76)
   - wrong save → `AUTH_UNAUTHORIZED_TARGET` (:79)
   - actor is not the save's player → `AUTH_ACTOR_MISMATCH` (:82)
   - no module matching the save's exact `ruleVersion` + `canonVersion` → `ENV_RULES_NOT_READY` (:87)
2. The pinned module `decide()`s on deep-frozen copies of the intent and save.
3. The result is re-validated (`:122-133`).

There are three kinds of result:
- **accepted / success**: events are committed and the revision goes up by 1.
- **accepted / legal_failure + `RULE_*` code**: time and resources are spent and events are committed, but the goal is not achieved.
- **rejected (`INPUT_|AUTH_|ENV_*` or `RULE_TARGET_MISMATCH`) or clarify**: nothing is committed (`contracts/decision.ts:39-68`).

All events from one turn share the same before/after revision pair. Each event carries `payload.stateDelta`, a compare-and-set diff of the facts (`prologue-v1-rules.ts:224-231`, `:701-718`). There is no randomness: receipts always record `rng: {seed:null, draws:0}` (`event-log.ts:129,154`).

### 2.2 Every action kind

Event type allow-list: `move.arrived`, `move.blocked`, `move.bypassed`, `cultivate.attempted`, `item.acquired`, `item.consumed`, `item.depleted`, `talk.occurred`, `talk.topic_learned`, `combat.resolved`, `observe.result`, `quest.completed`, `quest.reward_claimed` (`prologue-v1-rules.ts:267-272`).

#### `move` {destinationId} (`prologue-v1-rules.ts:298-386`)

| Situation | Cost | Result |
|---|---|---|
| Enter a sublocation of the current location | 1 刻, stamina −5 | `move.arrived` with from/toSublocationId (:301-315) |
| Destination is a sublocation of another location | – | `AUTH_UNAUTHORIZED_TARGET` |
| Already in that sublocation | – | `ENV_ROUTE_NOT_CONNECTED` |
| Return from a sublocation to the parent location | 1 刻, −5 | `move.arrived` (:317-329) |
| Destination is the current location and you are not in a sublocation | – | `ENV_ROUTE_NOT_CONNECTED` |
| Unknown id | – | `INPUT_NO_SUCH_TARGET` (:316) |
| Location not yet known, but listed in `unexploredEdges` | 1 刻, −5 | legal_failure `RULE_LOCATION_UNEXPLORED`, travelLog entry `unexplored` (:334-343). In the candidate content `unexploredEdges=[]`, so this never happens. |
| Location not known, not unexplored | – | `ENV_ROUTE_NOT_CONNECTED` |
| No edge | – | `ENV_ROUTE_NOT_CONNECTED` |
| Edge `locked` | – | `ENV_ROUTE_LOCKED` (:345) |
| Edge `blocked` and a bypass route's required item/clue is satisfied | **2 刻, −15** | Edge becomes `open` (with `via`), injury `shoulder_scrape`, leaves the sublocation. If `clearsObstacle`, the obstacle is `cleared` and `quest.completed` is emitted in the same turn. Event `move.bypassed` {routeId, via, kecCount 2, extraKecCount 1} (:347-369). |
| Edge `blocked`, no bypass available | 1 刻, −10 | legal_failure `RULE_ROAD_BLOCKED`, travelLog `rockslide` (:370-376) |
| Edge `open` | 1 刻, −5 | `move.arrived`, location changes (:379-385) |

Stamina is clamped at 0 (`debit`, :738-740). **Moving at 0 stamina is allowed** (test `prologue-v1-rules.test.ts:247`).

#### `cultivate` {techniqueId, minutes} (`:388-422`)

`minutes` is actually a number of **刻**, not minutes (see §7).

Hard rejections:
- technique not in the allow-list or not in `knownTechniques` → `ENV_TECHNIQUE_LOCKED`
- progress ≥ 10 000 → `ENV_CULTIVATION_COMPLETE` ("修为已至当前上限")
- stamina 0 → `ENV_STAMINA_EMPTY`
- more than 8 刻 → `INPUT_CULTIVATION_LIMIT` (checked even before parsing, :184-187)

Settlement:
- Normal 刻 = min(requested, ⌊stamina/20⌋). Each costs 20 stamina and gives +800 progress.
- If you asked for more 刻 than you could afford and some stamina is left over, you get one extra **fatigued 刻**: +200 progress, stamina → 0, `fatigueCount`+1, outcome legal_failure `RULE_STAMINA_LOW`.
- If the leftover stamina is exactly 0, the result is a "success" with fewer 刻 than requested.
- Event `cultivate.attempted` {requestedKecCount, attemptedKecCount, result: progress|fatigue}.

What a full day of cultivation gives: 5 刻 → 4 000 progress. Reaching 10 000 takes three game days.

Only technique: `tech_breath_basic` 呼吸法 (innate).

#### `acquire_item` {itemId, quantity} (`:424-443`)

The source must be at the current location (`INPUT_NO_SUCH_TARGET` otherwise).

Rejections:
- source already taken → `ENV_SOURCE_ALREADY_CLAIMED`
- quantity must exactly equal the source quantity → `ENV_SOURCE_QUANTITY_INVALID`
- inventory full → `INPUT_INVENTORY_FULL` (8 stacks)

Cost: 1 刻, 0 stamina. Event `item.acquired` {itemId, quantity, source: field|npc|quest, sourceId}.

#### `use_item` {itemId, targetId?} (`:445-472`)

Rejections:
- item not owned → `ENV_ITEM_NOT_OWNED`
- wrong or missing target → `RULE_TARGET_MISMATCH` (a hard rejection, zero side effects)
- target is a sublocation you are not standing in → `AUTH_UNAUTHORIZED_TARGET`

Effect: consumes 1 and appends the item's `effectFlags`. Cost: 1 刻, 0 stamina. Events `item.consumed`, then `item.depleted` if that was the last one.

#### `talk` {npcId, utterance} (`:474-510`)

Rejections:
- unknown npc → `INPUT_NO_SUCH_TARGET`
- npc not in `npcPresence` or not at this location → `AUTH_NPC_ABSENT`

Matching: the utterance is NFKC-normalised, lower-cased and stripped of whitespace, punctuation and symbols, then compared for **exact equality** with authored topic phrases (:746-748). More than one match → `INPUT_AMBIGUOUS`.

Outcomes:
- No match: `idle`. `idleCount`+1, legal_failure `RULE_TALK_IDLE`.
- Match: `on_topic` or `refuse`.
- A topic can also grant a clue (`talk.topic_learned`) or clear the obstacle (which completes the quest).

Cost: 1 刻, 0 stamina. Event `talk.occurred` {npcId, topicTag, outcome}. The raw utterance is never stored in events (test `prologue-v1-candidate.test.ts:215`).

#### `observe` {targetId, method: scan|study} (`:512-557`)

The target must be at this location, and in one of the listed sublocations if the target lists any (`AUTH_UNAUTHORIZED_TARGET`).

| Method | Cost |
|---|---|
| scan | 1 刻, stamina −3 |
| study | 2 刻, stamina −6 |

The result is one of:
- `blocked`, if the target is blocked `always`, or `dark` while it is night → legal_failure `RULE_OBSERVE_BLOCKED`, reason recorded.
- `none`, if the clue is already known, it is a repeat study, or there is no clue → legal_failure `RULE_NO_NEW_DISCOVERY`.
- `found`, which adds the clue with `clueLevel` 1 (scan) or 2 (study).

Event `observe.result`. **Observation works at 0 stamina** (test `prologue-v1-rules.test.ts:419`).

#### `combat` {targetId, techniqueId?} (`:559-613`)

Hard rejections:
- technique not in the allow-list (the candidate list is empty) → `ENV_TECHNIQUE_LOCKED`
- unknown target → `INPUT_NO_SUCH_TARGET`
- target not in `npcPresence` → `AUTH_NPC_ABSENT`
- not reachable: you must be in the target's location or in a listed `accessibleFromSublocationIds` → `AUTH_UNAUTHORIZED_TARGET`
- obstacle already cleared → `ENV_TARGET_ALREADY_RESOLVED`

Deterministic three-way result, with no HP and no dice:

| Condition | Outcome | Injury flag |
|---|---|---|
| stamina < 25 **or** spirit < 25 | **retreat** (legal_failure `RULE_COMBAT_RETREAT`); moved to `retreatLocationId`; spirit set to 5; sublocation cleared | `retreatInjuryFlag` |
| dark (night) | **clear** | `darkInjuryFlag` |
| "prepared": stamina ≥ 25 and (standing in the work-site sublocation, or in the work-site location, or **owning** the protection item) | **clear** | none |
| otherwise | **clear_wounded** | `daytimeInjuryFlag` |

Cost: 2 刻, stamina −25 and spirit −25 (spirit is set to 5 instead on a retreat). A clear that resolves the obstacle opens the obstacle route and emits `quest.completed`. Event `combat.resolved` {targetId, outcome}.

#### `quest` {questId, choiceId} (`:615-641`)

Only `choiceId: 'claim_reward'` is accepted (otherwise `INPUT_UNKNOWN_ACTION`).

Rejections: `ENV_QUEST_NOT_READY`, `ENV_QUEST_ALREADY_CLAIMED`, `INPUT_INVENTORY_FULL`.

Effect: reward item +1, `rewardClaimed`, the unlocked location is added to `knownLocations`, and all unlock edges become `open` atomically. Cost: 1 刻. Event `quest.reward_claimed`.

Quest *completion* is derived, not chosen: it happens the moment the obstacle goes from blocked to cleared, and it also sets `ferryState: clear` (:651-660).

#### `free_text` {text} (`:291-294`)

Always returns `clarify`, with the `INPUT_UNKNOWN_ACTION` message and `missingSlots ['action']`.

### 2.3 Clarification and NLU (deterministic, no model)

`parseActionText` (`domain/nlu/action-parser.ts:97-169`) matches templates only against the caller's *visible* catalog: known locations, present NPCs, observation targets, clues and inventory.

The P1 templates (`nlu/prologue-v1-nlu-fixtures.ts:8-16`):

| Template | Action |
|---|---|
| 去X / 走到X | move |
| 观察X / 我看看X | scan |
| 细察X | study |
| 对X说：… | talk |
| 使用X | use_item |

There are **no text templates for cultivate, combat, acquire or quest.** These come from server-built buttons (`apps/api/src/services/approved-player-actions.ts`).

The parser routes some inputs to a clarification instead of an action:
- Negation or conditions (不要, 如果, 等…再) → unknown, unless it is quoted speech (:89).
- Unresolved references (那边, 这个, 他, 刚才…) → unknown (:90).
- Missing slot → question.
- Ambiguous → at most 4 candidates in canonical action order (`contracts/decision.ts:5-31`).

The player's raw text is never stored in the decision. Only an ephemeral `presentationQuestion` echoes it.

The corpus has 14 accepted samples (NLU-01…14). Examples: `去望气台` gives a move; `找岑九` gives unknown; `对岑九说：不要去望气台` gives a talk.

### 2.4 Rejection and failure codes and their player messages

Messages are in `constants.ts:83-118`. Examples:
- `RULE_ROAD_BLOCKED` 落石堵住了路…
- `RULE_COMBAT_RETREAT` 力气支撑不住，你退回了渡口。
- `RULE_NO_NEW_DISCOVERY` 石头还是那些石头…
- `RULE_OBSERVE_BLOCKED` 雾色或距离挡住了视线…
- `ENV_STAMINA_EMPTY` 体力已耗尽，今天不能继续修炼。

Codes that the reducer requires messages for but never emits: `ENV_SPIRIT_STAMINA_EMPTY` and `ENV_TARGET_MISMATCH` (`prologue-v1-rules.ts:922-932`). `INPUT_MISSING_SLOT` and `ENV_IDEMPOTENCY_CONFLICT` are likewise defined but not emitted by the domain code.

### 2.5 The prologue (序章) loop, candidate content

**Status.** The content is in `content/prologue/prologue-v1.ts` and the rule binding is `prologue-v1.rulebook-candidate.ts`. Both are `candidate-only`, `runtimeEligible:false`, are not Canon, and are not exported from the package entry. They *are* imported through `@jiuxiao/content/p1-review-candidate` by `apps/api` (p1-prologue-plugin, approved-player-actions) and `apps/web` (p2-review-gameplay-runtime).

Versions: `ruleVersion prologue-v1-candidate-20261005`, `canonVersion prologue-canon-candidate-20261005` (`rulebook-candidate.ts:10-11`).

**Locations and graph** (`rulebook-candidate.ts:12-57`, text in `prologue-v1.ts:172-200`):
- **芦花渡** `loc_luhuadu`: a riverside hamlet, the outer post of the ferry branch. Start location; the game begins at 05:00.
  - Sublocation **渡口作业位** `subloc_ferry_berm`: the combat preparation site.
- **望气台** `loc_wangqitai`: an old observation platform three li outside the ferry. Its timbers are rotten and creak.
  - Sublocation **礁石小径** `subloc_reef_ledge`: the bypass route past the rockslide.
- **折桂坪** `loc_zheguiping`: a gentle slope north of 望气台 that overlooks the ferry; site of an old post station. Hidden until the quest reward is claimed.

| Edge | Start state | How it changes |
|---|---|---|
| 芦花渡→望气台 | open | – |
| 望气台→芦花渡 | blocked by the rockslide | opened by the bypass (needs `clue_rockslide`) or by combat |
| 望气台↔折桂坪 | locked (both directions) | both opened by the quest reward |

**NPCs and presence.** Presence is static; no rule ever changes `npcPresence`.
- **岑九** `npc_cenjiu`, at 芦花渡. A ferryman paid per trip, one trip a day, employed by the ferry branch and *not* by 四海商会. Weathered, with deep cracks on the backs of his hands and a notch missing from his left ear.
  - Speaking style: short sentences, no honorifics.
  - Knows: the rockslide, the shallow water, the crows, yesterday's visitor.
  - Cannot know: what is on 望气台, the player's background, "the white to the south".
  - Rule topics: `obstacle_rockslide` (这石头怎么办 / 怎么过去 / 有别的路吗 / 能动吗) and `player_warning` (不要去望气台). **Both are `refuse`**: no clue, no clearing. Any other utterance is idle.
  - Other dialogue lines exist only for narration (问船 "船没坏。水浅了。", 问鸦, 问望气台, 南边那片白, after the crossing "通了。明早第一趟。"), plus small-talk fallbacks and a third-idle hook ("你要是走南边那条路，替我看一眼。") (`prologue-v1.ts:321-348`).
- **灰羽鸦** `npc_shuiyuya`: dozens of crows on the rock pile. A combat target present at 芦花渡, reachable from the work site **or** from the reef ledge on 望气台. They have no talk topics.

**Items** (both 凡品, quality "ordinary"):

| Item | Where it comes from | Use |
|---|---|---|
| **避水符** `item_bishuifu` | one-time pickup `src_ferry_shore` on the 芦花渡 shore, by an old mooring post | use on the work site or reef ledge → `effect_ward_water` (a flag with no rule effect, §7). Owning it is the combat protection. |
| **旧驿符** `item_jiuyifu` | quest reward | no use in the rules |

**Clues** (`prologue-v1.ts:281-310`):

| Target | Scan → clue (level 1) | Study → clue (level 2) |
|---|---|---|
| 渡船 `obj_ferry` | `clue_ferry_stuck` | `clue_ferry_scrubbed` |
| 舟具 `obj_ferry_gear` | – | `clue_wrong_way` |
| 落石 `obstacle_rockslide` (望气台; blocked at night) | `clue_rockslide` (**key to the bypass**) | `clue_crow_nest` |

**Quest 通渡** `quest_first_clearance`. It is completed when the obstacle is cleared by either the bypass or combat. There is no hard failure; if spirit runs out, the player comes back the next day. Completion sets `ferryState:clear` (text: 石堆散了…远处有桨声). The reward is 旧驿符 and the unlock of 折桂坪.

**Typical routes** (numbers verified by `prologue-v1-candidate.test.ts:155-188, 264-308`):

*Route A, bypass:*
1. Move 芦花渡→望气台: 1 刻, stamina 95.
2. Scan the rockslide: 1 刻, 92, gets `clue_rockslide`.
3. Move back toward 芦花渡: the bypass takes 2 刻, stamina 77, adds `shoulder_scrape`, and completes the quest.
4. Claim the reward.

*Route B, combat:*
1. At 芦花渡, step into the work site: 1 刻, −5.
2. Fight the crows: clear with no injury (prepared by the work site), stamina and spirit −25, quest completes.

Combat variants:
- From the reef ledge in daylight without the charm: `clear_wounded` with `crow_scratch`.
- At night: `clear` with `crowding_bite`.
- With stamina or spirit below 25: retreat to 芦花渡 with the `retreated` flag.

A bare move toward 芦花渡 without the clue gives `RULE_ROAD_BLOCKED`: 1 刻, −10.

**Day and dusk.**
- Dusk at gameMinute 1020 blocks observation of the rockslide and changes combat outcomes.
- The narration text `text_wangqitai_night` applies when the time of day is ≥ 1020.
- `text_south_white_hook` ("压在山脊上的那片白，不是云") is shown only while the player is on 望气台.

**After the reward.** 折桂坪 has no NPCs, observations or sources. The playable prologue ends there.

---

## 3. World state model

**WorldState** (`contracts/world.ts:4-9`) is `{playerId, locationId, elapsedMinutes, facts: record}`.
- The size bound on facts is 256 KB, or 1 MB when `facts.archiveKind==='local-untrusted-v1'` (local archive).
- `elapsedMinutes` increases in step with `gameMinute` in prologue rules (`prologue-v1-rules.ts:680-691`), but it is *not* the clock (`event-log.ts:213`).

**PrologueV1Facts** is a closed, strict schema; unknown keys are rejected (`contracts/prologue.ts:44-83`):
- `gameMinute`
- `currentSublocationId`
- `npcPresence[≤128]`
- `stamina 0-100`, `staminaDayIndex`, `spiritStamina 0-100`
- `cultivationProgress 0-10 000`, `fatigueCount`
- `inventory[≤8] {itemId, quantity}`
- `collectedSources[≤512]`
- `effectFlags`, `clues`, `injuryFlags` (set-valued)
- `observationLog`, `npcInteractionLog`, `travelLog` (each ≤2048)
- `questState {status: unavailable|completed, rewardClaimed}`. There is deliberately no `active` status (`prologue.test.ts:78`).
- `knownLocations[≤3]`, `knownTechniques`
- `locationGraph[≤512] {from, to, state: open|blocked|locked, via?}`
- `idleCount`
- `obstacleState: blocked|cleared`, `ferryState: aground|clear`

**There is no realm, HP, money, reputation, relationship, weather or faction field.**

**Invariants** checked before and after every event (`prologue-v1-rules.ts:987-1075`):
- The clock is on the 15-minute grid and not before 300.
- The stamina day index is not ahead of the clock.
- `knownLocations` equals the initial locations, plus the unlocked one only if the reward is claimed.
- The current sublocation belongs to the current location.
- Every id is in the rulebook's allow-lists.
- Graph edges differ from the initial graph only through the allowed bypass or quest openings.
- `completed` requires `cleared` and `ferry clear`.
- `rewardClaimed` requires `completed`.

**Events, replay and projection.**
- `DomainEvent` (`contracts/event.ts:4-26`): id, saveId, branchId `'root'`, type, before/after revision, occurredAt, source RULES|MIGRATION, ruleVersion, bounded payload.
- `replayEvents` (`event-log.ts:33-71`) groups events by revision batch and applies a signed reducer. The prologue reducer re-applies `payload.stateDelta` with compare-and-set (`domain/state-delta.ts:3-17`, `prologue-v1-rules.ts:248-265`).
- `project()` refuses to run without a reducer (`projection.ts`).
- `prepareTurn` (`event-log.ts:86-167`):
  - computes a request fingerprint (`sha256:v1:` over canonical JSON; `branchId` is omitted for root for compatibility);
  - checks idempotency, returning `duplicate` or `idempotency-conflict`;
  - checks the revision, returning `revision-conflict`;
  - returns the receipt and the new snapshot. The caller persists them atomically.

**Persistence** (`packages/db/src/schema.ts`):
- `game_saves`: snapshot jsonb, revision and pinned versions. A CHECK enforces v1/v2/v3 column shapes (:66-142).
- `turn_requests`: idempotency, the result receipt, narrative status (:150-159).
- `turn_events`:
  - append-only, with a per-save `sequence`;
  - a SHA-256 hash chain (`previous_hash`/`event_hash`, migration 0013);
  - `branch_id='root'` CHECK (:161-179).
- `story_narratives`: presentation text, source model|deterministic, no updates (:285-294).

**Revisions.** One accepted turn equals exactly one revision. Rejections and clarifications keep the revision (`contracts/turn.ts:41-52`).

**Branches and forks.**
- v3 saves carry `branchId`, `parentBranchId`, `forkRevision`, `createdPolicyVersion` and `sourceMigrationId`, with consistency rules (`contracts/save.ts:56-90`; DB CHECK `schema.ts:128-137`).
- Every gameplay surface is literal `'root'`: ActionIntent (`action.ts:8`), events (`event.ts:22`), receipts (`turn.ts:33`), `turn_events` CHECK (:178), the memory outbox (:250) and supersessions (:275).
- So a fork can be *described* but not *played*.

**Memory policy versions.**
- A save pins `SaveMemoryPolicy`: mode continue|forgetting, policyVersion, artifact hashes, `clockBasis 'game-minute+npc-grant-sequence-v1'` (`save.ts:11-23`). The DB trigger makes it immutable (migrations 0015/0017/0018).
- NPC memory is a separate projection from rules:
  - a journal (`npc_memory_journals`, ≤64 KB, oldest entries evicted, `turn-journal.ts:337-353`);
  - an authorized-observation outbox (`grantId` v2, `memoryClass` current-state/historical-event/subjective-belief/unclassified);
  - supersessions (premise-revised, relation-changed, entity-dead, item-moved, clue-invalid).
- Recall answers only explicit cues such as 你觉得 / 当前 / 还记得 (`recall-authorized.ts:51-65`). It returns complete, partial, abstain or forgotten ("我不太记得了。").
- The forgetting decay is 2^-(elapsed/10 080 + later/16) with a 0.35 floor (`retrieve.ts:6-8`; `p4-recall-policy-v2.json`).
- Memory policy can never change rules state (`policy.ts:1`).

**Narration.**
- `NarrativeScheduler` roles are director, premiumDirector, story, stateManager and archive; only `story` is required (`narrative-scheduler.ts:3,55-57`).
- The prompt contains only the committed receipt, filtered NPC memories, at most 4 player-condition lines and at most 8 NPC utterances (`provider-narrative.ts:9`; limits `narrative-scheduler.ts:63-99`).
- **No Canon text is passed to the model.**

---

## 4. Contracts: what a client sends and receives

**Client sends an `ActionIntent`** (`contracts/action.ts:5-27`):
- Common fields: `{saveId, actorId, branchId='root', expectedRevision, idempotencyKey: uuid, clarificationOf?}`.
- `kind` and payload, one of:
  - `move {destinationId}`
  - `cultivate {techniqueId, minutes:int>0}`
  - `acquire_item {itemId, quantity}`
  - `use_item {itemId, targetId?}`
  - `talk {npcId, utterance}`
  - `observe {targetId, method scan|study}`
  - `combat {targetId, techniqueId?}`
  - `quest {questId, choiceId}`
  - `free_text {text}`
- Payloads are strict objects.

**Client receives a `Decision`, inside a `TurnReceipt`.**

Decision V2 (`decision.ts:39-95`):
- `accepted {outcome success|legal_failure, code? RULE_*, events[≥1], nextRevision}`
- `rejected {code INPUT_|AUTH_|ENV_* or RULE_TARGET_MISMATCH, message, revision}`
- `clarify {question ≤500, missingSlots ≤8, candidates ≤4 in action order, interactionId, clarificationOf?, revision}`
- V1 shapes remain readable for stored receipts.

TurnReceipt V2 (`turn.ts:31-39`): `{idempotencyKey, saveId, requestFingerprint, clarificationOf?, branchId 'root', rulesVersion, clockMinute, rng {seed, draws}, decision, resultingRevision}`. It has strict consistency checks (:41-68). Legacy receipts are readable.

API errors (`errors.ts:3-6`): INVALID_REQUEST, UNSUPPORTED_VERSION, NOT_FOUND, FORBIDDEN, REVISION_CONFLICT, RULES_NOT_READY, TEMPORARY_UNAVAILABLE.

**SaveEnvelope** (`save.ts`; current version is `SAVE_SCHEMA_VERSION = 3`):

| Version | Fields | Notes |
|---|---|---|
| v1 | `{schemaVersion 1, saveId, canonVersion, ruleVersion, memoryPolicyVersion, revision, state}` | |
| v2 | v1 + `memoryMode` + pinned `memoryPolicy` | mode and version must match |
| v3 | v2 + `canonArtifactHash` (sha256 of the exact public `canon-runtime.json` bytes) + branch lineage | |

Union order is v3 | v2 | v1. Legacy files are never backfilled; this is fail-closed in migration 0015.

**Other contracts:**
- `LegacySaveFileSchema`: permissive, for importing old `JIUXIAO_SAVE` files (`legacy-save.ts`).
- `StateDelta`: timeChange, locationChange, factChanges with present/absent compare-and-set; protected keys are rejected (`state-delta.ts`).
- `CharacterProfile`: name 80, personality 320, origin 500, appearance 500, goal 500, total ≤4 KB. Display-only (`character-profile.ts:2-14`), stored in `game_saves.character_profile` (migration 0029). It is not exported from `contracts/index.ts`.

---

## 5. Content and Canon

### 5.1 What Canon 1.0 contains

- `canon-runtime.json`: `schemaVersion 1`, `activeVersion "1.0"`, `receiptsComplete true`, **34 entries**:

  | Category | Count |
  |---|---:|
  | world_overview | 1 |
  | region | 6 |
  | faction | 16 |
  | cultivation_system | 1 |
  | system | 10 |

- Each public entry has these fields only: id, title, category, `status:'confirmed'`, canonVersion, content, sections, aliases, tags, publicSourceNote, sortOrder, parentId (`worldbook.ts:30-33`).
- Exposed API: `canonRuntimeEntries`, `searchCanonRuntime` (NFKC fold, substring) and `getCanonRuntimeEntry` (`worldbook.ts:85-107`).
- Consumers: the web Canon search and the realm seal (`apps/web/src/main.tsx:468`, `ui/RealmSeal.tsx:81`).

**Signed vs candidate.**
- All 34 confirmed entries are dual-signed. `canon-receipts.json` holds `LYL` and `Bird` approvals, all dated 2026-10-06, each bound to sha256(content). `canon-content-digests.json` lists the same 34 digests. The gate is in `scripts/build/canon-receipts.mjs` (tested by `canon-receipts.test.mjs`).
- `canon.registry.json` (author side) holds:
  - 39 entries: 34 confirmed + 5 deprecated `author_addition`;
  - 235 `sourceRegistry` items;
  - 19 decisions (`author_20260925_001` … `author_20260927_019`);
  - 6 `resolvedSourceGaps`;
  - an empty `reviewQueue`;
  - 3 `authorOriginalIntakes` for the P1 prologue, all `pending_separate_s_track_review` with no effect on active Canon.
- **Candidate (not Canon):** everything in `content/prologue/*`, i.e. 芦花渡, 岑九, 灰羽鸦, the clues and the 通渡 quest.

**Must not ship publicly:** private original images, per-image transcriptions, local paths, OCR and review records, `sourceRefs`, review fields, and the author-only draft index. The runtime validator rejects extra fields (`worldbook.ts:48-50`). The author-only `worldbook-publisher.ts` and `source-register.ts` must never enter the web bundle.

**Scene manifest** (`content/scenes/manifest.ts:8-48`): 4 fixed scenes.

| Scene id | Name | Atmosphere | Video loop |
|---|---|---|---|
| `mountain-gate` | 山门 | mist-water | yes |
| `wilderness` | 野外 | wind-pollen | yes |
| `sect-town` | 宗门与城镇 | lantern-mist | no |
| `battle-anomaly` | 战斗与异变 | embers | no |

All assets are `candidate-internal`; source licensing and two-author release approval are pending.

**scene-gate** (`packages/scene-gate/src/index.ts`): a procedural Three.js 山门 loop (8 s at 30 fps). It contains:
- a canvas-painted ink landscape: moon and halo, cloud strokes, 3 ridge layers, two waterfalls;
- `FogExp2`, a moon directional light and a warm point light;
- stone foundations and extruded upturned roofs;
- piers, lanterns, mist bands and drifting petals;
- an optional photo backdrop (landscape or portrait);
- a gently swaying camera.

**It takes no game state as input.**

### 5.2 Realms, grades and systems (Canon, with entry ids)

**Realm order.**
- Playable order, `REALM_ORDER` (`content/realm-order.ts:2-4`, the author's 2026-10-03 correction): 炼体 → 炼气 → 筑基 → 结丹 → 元婴 → **化神 → 合体** → 大乘 → 渡劫.
- Canon text order (`system_foundations`, `system_cultivation_realm`, `system_realm_faction_tiers`): 合体 before 化神. The Canon also requires "合体期大圆满" for 化神, which conflicts with the playable order (§7).

**Stages and breakthroughs** (`system_foundations`):
- 炼气 has 10 层. Every other realm has 初/中/后期 (to 大圆满).
- Reaching 100 % moves you up a minor stage. A major breakthrough needs conditions.

**Realm descriptions and lifespans** (`system_cultivation_realm`):

| Realm | Description | Lifespan |
|---|---|---|
| 炼体 | "炼凡骨，化尘身": breathing technique, medicinal baths | ≤ 120 years |
| 炼气 | 引气入体; 火弹术, 水箭术, 辟谷术 | 200–250 |
| 筑基 | needs 炼气十层大圆满 and 筑基丹; gas compressed to liquid; enables 御剑, 神识 | ~500 |
| 结丹 | needs 凝元丹, 清心露 and a 炉鼎; 金丹 graded 下/中/上/极品; 心魔入侵 | ~1000 |
| 元婴 | "碎丹成婴" through a heavenly-thunder tribulation; 破障丹, 育婴果; 夺舍, 瞬移 | – |
| 合体 | "炼神还虚"; 空间晶石, 通天灵宝 | ~10 000 |
| 化神 | 天人合一; a "法域" | 与天同寿 |
| 大乘 | – | – |
| 渡劫 | 雷/火/风/心魔 tribulations, 破碎虚空, 羽化飞升 | – |

**Other systems:**
- **Grades** (`system_resource_grade`, `system_technique_grade`): 凡 / 黄 / 玄 / 地 / 天 / 至宝, each 上中下品.
- **Spirit stones** (`system_economy`): 下 / 中 / 上 / 极品 灵石. Silver is mundane currency only.
- **Price table** (`system_prices`): prices in 下品灵石 for 9 grade rows × 4 columns (consumables, 法器, 功法, special pills). For example, 黄阶下品 120 / 150 / 200 / 300. 天阶 has a price but no market.
- **Spiritual roots** (`system_spiritual_root`): 异 / 天 / 真 / 伪灵根.
- **Beasts** (`system_spirit_beasts`): levels 1–7, mapping 炼气 to 化神. Named tiers: 三级 妖王, 四级 化形大妖, 五级 妖尊, 六级 妖圣, 七级 神兽. Also 异种 and 上古遗种.
- **Schools** (`system_cultivation_schools`): 剑 / 体 / 神 / 器 / 丹 / 阵 / 驭兽 (truncated in source) / 音 / 蛊 / 符 / 佛 / 儒修.
- **Heterodox** (`system_heterodox_cultivation`): 血剑修, 尸修, 夺魂师, 血丹师, 尸傀师, 欲修, 咒修, 瘟修.
- **Sect tiers** (`system_realm_faction_tiers`):
  - 三流: led at 筑基. Examples 青竹剑派, 清水河谷, 小寒山.
  - 二流: led at 金丹. Examples 东瀚 惊涛门, 西荒 流沙堡.
  - 顶尖: 元婴 leader plus a hidden 合体 太上老祖.

### 5.3 Places, factions and lore names (raw material for art direction)

**World** (`world_jiuxiao`): 九霄大陆, divided east–west by the **万兽山脉**. Deep within it lies **洪荒妖林**, a beast forest with qi so dense it hangs as fog. The forest has three rings:
- 外围: 1–2级 beasts; the training ground for 炼气/筑基.
- 内围: 妖王 and 化形大妖.
- 核心禁区: 妖尊 and 妖圣 sleep there; space itself is unstable.

**中州天枢域** (`region_zhongzhou_tianshu`): fertile centre with balanced qi. The mortal 大夏皇朝 and its 钦天监; Confucian and Daoist culture.

| Faction | Settings and place names | Other visual material |
|---|---|---|
| **昊天剑宗** | 99 floating immortal mountains; the main peak **天枢峰** is shaped like an inverted giant sword; 虹桥 and chains between peaks; 问剑石, 问心路, 剑冢, 万仞崖, 试剑崖, 传功阁, 戒律堂 with its 罪剑石, 任务殿, 铸剑池 | cranes, cloud sea |
| **玉清阁** (alchemy) | 百草谷, a "洞天碎片"; 地肺心火; the 百草清神瘴 mist; 丹心殿, 地母苑, 神农阁, 百味楼, 天宝坊 | |
| **衍天宗** (arrays, talismans, divination) | the floating city-state **天衍城** is itself the 周天星斗无极大阵, with 9 main islands and 3000 auxiliary islands; 光桥; 观星台, 万法楼, 司律台 with its 善恶镜, 神工坊 | floating runes, star-orbit models, the 衍天盘 |
| **四海商会** | the floating giant city **万宝城**, a spatial treasure with a teleport network; 财源司 (abacus treasure), 鉴天阁, 听风楼, 执法堂 with its 金钱卫, 客卿院, **金鳞卫** | 金鳞甲 armour, 破法弩 crossbows |
| **天工阁** (forging) | 天陨山脉; 造化神石; 巨构院 (巡天四象), 器灵院, 神机院; 神工殿, 问道堂, 万宝楼, 试炼场 | gears, qi-steam pipes, colossal unfinished constructs, the starlight of meteoric ore against forge fire |
| **大光明寺** | **菩提山**, 朝圣之路, 山门殿 / 天王殿 / 大雄宝殿 / 万佛顶; 达摩院 with its 十八罗汉阵, 药师殿, 七层藏经阁, 九十九层镇魔塔 | gold tiles, red walls, sandalwood, a 佛光结界 |
| **稷下学宫** (Confucian) | 问圣山, a bluestone 问心路; 问圣殿 (万世简), 九层文渊阁, 讲经堂, 戒律院 (春秋笔, 惊堂木), 入世府, 论道台 | 养气墨 ink, 定心纸 paper |

**东瀚龙吟域** (`region_donghan_longyin`): continental shelf and islands with water-aligned qi. Coastal kingdoms, worship of sea and wind gods, sea-offering festivals, timber and seashell architecture.

| Faction | Settings and place names |
|---|---|
| **听潮阁** (music) | 静音岛 inside the sound-swallowing **无声雾**; 归墟海眼, 听潮崖, 共鸣石阵 (stones that glow by pitch), 藏乐阁, 留音贝 and memory crystals, 静默狱, 驭波殿, 百乐坊; tower-ships; the 琴/箫/笛 three schools |
| **覆海宗** (war fleet) | the basalt sea-fortress **镇海城**; 龙王骨; 覆海殿 in a giant conch-shaped hall; 战堂, 商舵, 刑堂 with its 万妖坑, 船坞司, 夺舰台; tower-ship warships and a 海兽军团 |

**西荒焚天域** (`region_xihuang_fentian`): red desert and gobi with violent fire-poisoned qi. Nomads who worship sun and fire, mud-brick oasis city-states; "water is dearer than gold".

| Faction | Settings and place names | Other visual material |
|---|---|---|
| **圣火教** (alias 拜火圣教) | the active volcano **圣焰山**, obsidian sheen; a lava cave crossed by the 圣焰之河; an underground capital; 神火石; a lava lake at the core; 炼狱堂, 传火司, 熔铸坊 | grey-robed followers, 焰卫 in red-black lava armour, 红衣祭司, 圣子/圣女; the 心灯神照诀 burns white |
| **金刚不坏谷** (body-tempering) | the red canyon **万丈渊** under 九天罡风 and 烈阳火毒; cliff caves; 不坏石壁, 地火之心, 刑罚崖 with its 风眼, 药浴池, 试炼窟, 无畏台 | ranks 谷奴 → 铜皮 → 铁骨 → 金身行者 → 不坏尊者 |

**北境霜寒域** (`region_beijing_shuanghan`): glaciers and snowfields, extreme yin cold. Clan tribes in hide and timber tents or pit-dwellings; totems of snow wolf, mammoth and ice bear; shamans.

| Faction | Settings and place names |
|---|---|
| **冰神宫** | 永寂冰原; **无垢冰城** carved from ancient 玄冰, refracting aurora light like seven-coloured glass; 太古寒源, 神眠之渊, 寒晶阁; ranks 冰侍, 神官, 圣女/圣子 and 大祭司 |
| **北境联盟** | migrating tribes riding giant snow beasts like moving city-states; **狼神山** under aurora; 可汗王帐, itself a war treasure; 狼祖; the 狂战部 (wolf-form berserkers), 幽影部 (冰原潜行术, ice-crystal 影狼) and 魂祭部 (shamans); ranks 幼狼 → 战狼勇士 → 大可汗; 荣耀猎场 |

**南疆万蛊域** (`region_nanjiang_wangu`): primeval jungle and miasma swamps; stilt houses (吊脚楼); 十万大山.

| Faction | Settings and place names |
|---|---|
| **五毒神教** | 万毒沼泽; nests of fungus and vines grown from the skeletons of ancient poison beasts; coloured miasma; 万蛊神殿 on a dragon-shaped skeleton; 毒经阁, 百毒死园, 万蛊坑; five lineages 天蝎, 地龙, 百足 (千魂蜈蚣), 蛛神 (人面魔蛛) and 金蟾 (三足金蟾); senior disciples are half-human, half-insect |
| **万兽山庄** | 兽神殿 with an ancient beast bone; 驭兽堂, 育兽圃, 万商阁, 刑兽崖; thunder hawks (雷鹰) and 巨鲲 |
| **偃师府** | the underground mechanical city **千机城**, cut down into the walls of a sinkhole; 万机图, 工造坊; mechanical bees, war beasts, 巨灵 giant puppets, 画皮 lifelike humanoid puppets |

**Heterodox sites** (`system_heterodox_cultivation`):
- **万魂殿**: under an ancient battlefield, beneath a mass grave; a palace of bone; it holds 猎魂祭 soul hunts.
- **血屠剑门**: inside the volcano **血狱山**, which flows with blood-sha.
- **合欢宗**: front is the 醉梦阁 brothel chain.
- **疫祖圣坛**: in the swamp called **腐烂之心**, worshipping a 瘟神.
- An unnamed wandering alliance of 尸修 and 血丹师 (the name is truncated in the source).

**Prologue (candidate only, not Canon):** 芦花渡 (reeds knee-deep), 望气台, 折桂坪 and its old post station, 渡口作业位, 礁石小径, 渡船, 舟具, the 落石 pile topped by dozens of 灰羽鸦, 岑九, 避水符, 旧驿符, 呼吸法, and the "南边那片白" on the ridge.

---

## 6. Implemented vs NOT implemented

**Implemented** (code plus tests):
- the 8 action kinds plus free_text clarification, for exactly 3 locations and their sublocations;
- the 刻 clock, day/dusk and the daily stamina/spirit reset;
- deterministic three-outcome combat;
- one obstacle and one quest;
- clues at levels 1/2;
- an 8-slot inventory;
- the deterministic NLU parser;
- an event-sourced revisioned save (v1–v3) with idempotent receipts and a hash-chained append-only event table;
- NPC memory journal, outbox, decay and recall;
- a narration scheduler where only the AI's `story` role is required;
- Canon 1.0 public runtime and search (34 signed entries);
- 4 candidate scene ids, and a procedural 山门 WebGL scene;
- a display-only character profile.

**Not implemented.** Do not present these as existing.

| Feature | Evidence |
|---|---|
| Realm progression / breakthrough | No realm field in facts (`contracts/prologue.ts:44-83`). Hitting 10 000 gives `ENV_CULTIVATION_COMPLETE` (`prologue-v1-rules.ts:392`). The UI hard-codes realm index 0 = 炼体 (`apps/web/src/ui/realm.ts:31`). No 炼气 层, no 筑基丹, no tribulation. |
| Any realm beyond 炼体 | Same evidence. `REALM_ORDER` is display only. |
| A world map or more than 3 locations | `PROLOGUE_V1_LOCATION_LIMIT=3` and `knownLocations.max(3)` (`contracts/prologue.ts:5,73`). No coordinates, regions or 域 ids in state. |
| Regions and factions as game objects (reputation, membership, sect ranks) | Canon text only. Nothing in facts or rules. |
| Economy (灵石, prices, trade, shops) | Only Canon text (`system_economy`, `system_prices`). No currency fact. |
| Item effects | `effectFlags` are recorded but read by no rule. 避水符's `effect_ward_water` does nothing. 旧驿符 has no use. |
| Combat techniques, HP, damage, randomness | `combatTechniqueIds: []`. The rng seed is always null. |
| NPC presence changes, schedules, relationships, affinity | No rule mutates `npcPresence`. Relationship exists only as a memory supersession kind. |
| Rest, wait or sleep; travel time by distance; weather; seasons | Not in the action union (`contracts/action.ts:16-27`). |
| Playable branches or forks | Every surface is `'root'` (§3). |
| Canon → AI context (`retrieveCanon`, `buildCanonPromptContext`) | Referenced only in docs (`docs/世界书Canon1.0交付说明.md:61`, `docs/世界书作者侧交付验收索引.md:22`). No code exists. The prompt has no Canon (`provider-narrative.ts:9`). |
| Scene art tied to prologue locations | The aliases don't include 芦花渡, 望气台 or 折桂坪, so everything falls back to `mountain-gate` (`scenes/manifest.ts:57-60`). Assets are pending licensing. scene-gate ignores state. |
| Prologue content as published Canon | `runtimeEligible:false`; intakes `pending_separate_s_track_review`. |
| Text input for cultivate, combat, acquire, quest | No NLU templates (`prologue-v1-nlu-fixtures.ts:8-16`). Button-only. |

---

## 7. Problems found (with evidence) and open questions

1. **Misnamed unit.** `cultivate.payload.minutes` is a count of 刻 (`contracts/action.ts:20`; `prologue-v1-rules.ts:396`). A client sending real minutes (for example 60) gets `INPUT_CULTIVATION_LIMIT`.
2. **The 避水符 effect is inert and using it can backfire.**
   - Using it only adds `effect_ward_water` (`prologue-v1-rules.ts:465`), which no rule reads.
   - Combat "prepared" checks *owning* the protection item (`:585`). Using the charm removes it.
   - So from the reef ledge, using the charm first turns a clean clear into `clear_wounded`.
   - The content promises it "对渡口作业位驱鸦，或通过礁石小径涉水" (`prologue-v1.ts:250`), but the bypass needs only the clue (`rulebook-candidate.ts:55`).
3. **Required messages are never emitted.** `ENV_SPIRIT_STAMINA_EMPTY` and `ENV_TARGET_MISMATCH` (`prologue-v1-rules.ts:927,930`). Zero spirit produces a committed retreat, yet a test name says "rejects combat at zero spirit" (`prologue-v1-rules.test.ts:508`).
4. **Exhaustion has little bite.** Move and observe are allowed at 0 stamina (tests `:247`, `:419`). Only cultivation and combat check stamina.
5. **No way to pass time.** There is no wait or rest action; night is 48 刻 and resets happen only at 05:00. A player stuck at night must spam actions; idle talk is 0 stamina but increments `idleCount`. **Question:** is this intended?
6. **Dusk paradox.** At night, unprepared combat is labelled `clear` (with `crowding_bite`), while by day it is `clear_wounded` (`prologue-v1-rules.ts:586-589`; the comment says this is signed). Night looks "better" in outcome labels. **Question:** is that the intended framing?
7. **Retreat crosses a blocked edge.** A retreat from the reef ledge on 望气台 moves the player to 芦花渡 even though 望气台→芦花渡 is blocked (`:599-600`, `retreatLocationId`). **Question:** is that intended?
8. **Server suggestions miss a legal route.** The suggestions list shows combat only when `target.locationId === save.state.locationId` (`apps/api/.../approved-player-actions.ts`, out of scope). That hides the legal reef-ledge attack.
9. **Talk is mechanically empty in P1.**
   - Matching is exact, and 岑九's only rule topics are `refuse` (`rulebook-candidate.ts:76-87`).
   - No talk can yield a clue or progress.
   - Rich dialogue exists only as narration hints (`prologue-v1.ts:321-348`).
10. **Shortfall shown as success.** Cultivation that runs out of stamina exactly reports `success` with fewer 刻 than asked (`:398-402,420`). The UI must show `attemptedKecCount`.
11. **Event payloads grow with play.**
    - `stateDeltaBetween` stores full before and after values of every changed fact (`prologue-v1-rules.ts:701-718`).
    - The logs grow to 2048 entries each (`contracts/prologue.ts:65-67`).
    - Each event payload is capped at 256 KB (`contracts/event.ts:13`, `json-bounds.ts:2`).
    - Long sessions will approach that cap. A richer game needs append-style deltas.
12. **Branch lineage vs playability.** v3 saves and the DB accept non-root branches (`save.ts:85-89`, `schema.ts:134-136`). Intents, events, receipts and every table CHECK are root-only. Forks can be stored but not played.
13. **Realm order conflict.** `REALM_ORDER` puts 化神 before 合体 (`realm-order.ts:2-4`). Canon puts 合体 before 化神 and makes 化神 require 合体大圆满 (`system_cultivation_realm`, `system_foundations`, `system_realm_faction_tiers`). Breakthrough rules need an author ruling. **Question.**
14. **Canon internal inconsistencies.**
    - 金丹 and 结丹 are used interchangeably.
    - 地阶 and 天阶 both map to 元婴/合体 (`system_resource_grade`).
    - Several lists are truncated with "…".
    - 东瀚 and 北境 have empty "顶尖势力：" lists.
    These are not to be "fixed" without the author.
15. **Editorial notes leak into player-facing runtime text.**
    - `faction_yuqing_ge`: "（标题跨图折行，012 小标题…与 011…衔接）"
    - `faction_yantian_zong`: "（中州顶尖势力清单内同名条目）", plus a duplicated sentence
    - `faction_daguangming_si`: "，章名与 028…一致）"
    - `faction_jingang_buhai_gu`: "（章名以补020…原【待归属】151/150 残片经补010–019…已归位）"

    `【待归属】` is exactly a marker that the publisher gate rejects (`worldbook-publisher.ts:26`). These texts are signed; fixing them changes `contentSha256` and needs re-signing by both reviewers.
16. **Docs promise APIs that don't exist.** `retrieveCanon` and `buildCanonPromptContext` (see §6).
17. **Stale comment.** `worldbook-publisher.ts:44` "Existing seven geography records…" reflects a superseded stage (per AGENTS).
18. **Tag inconsistency.** The `system_economy` runtime tags are `["经济体系补充","作者补充"]`, while its note says it comes from the original screenshot. It could be mistaken for a deprecated author addition. **Question.**
19. **No prologue scene mapping.** `sceneForLocation` matches Chinese aliases, while the prologue uses `loc_*` ids and names not in the alias lists. The reed-ferry prologue would render as 山门 (`manifest.ts:57-60`).
20. **DB drift.**
    - `schema.ts` lacks tables created by migrations: `card_import.*` (0025), `archive_retention_purge_receipts` (0010) and `account_erasure_delivery` (0026).
    - Drizzle meta snapshots exist only for 0000–0009 and 0023.
    - Two migrations are numbered 0021.
    - 0027 and 0028 sit in `pending/`, and the journal jumps to 0029.

    Running `drizzle-kit generate` could propose wrong diffs. **Question:** is drizzle generation still used?
21. **Migration 0015 assumption.** It aborts if any non-v1 save exists (`0015_p1_gameplay_persistence.sql:11-17`). Future migrations need equally explicit backfill policies.
22. **One constant, two meanings.** `FORGETTING_CUE_FLOOR` (0.35) *raises* cue-matched accessibility in narrative recall (`retrieve.ts:49`), but is a *cut-off* in authorized recall (`recall-authorized.ts:29,137`). **Question:** is the dual meaning intentional?
23. `character-profile.ts` is not exported from `contracts/index.ts`; consumers deep-import it. This is minor.

---

## 8. Design hooks

### 8.1 Real state changes that can drive visuals or ceremony

Everything below is derivable from the committed receipt and `stateDelta`. Narration is never the source of truth.

| Signal | Source | Visual or ceremony idea |
|---|---|---|
| Location change | `move.arrived` with `stateDelta.locationChange` | scene transition between 芦花渡, 望气台 and 折桂坪; fly-through or ink wash |
| Sublocation change | `fromSublocationId` / `toSublocationId` | in-scene camera move: down to the work site, along the reef path |
| Road blocked | `move.blocked` reason rockslide; travelLog | rock wall in close-up, dust |
| Bypass | `move.bypassed` (2 刻) + `shoulder_scrape` | reef-path vignette, shoulder graze mark on the character UI |
| Time of day | gameMinute crossing 1020 (dusk) or 300 + 1440n (dawn) | day/dusk/night grading; lanterns; the moon (scene-gate already has a moon); "天光收尽了" moment |
| Day boundary | stamina/spirit reset when `staminaDayIndex` advances | dawn ritual, stamina and spirit refill |
| 刻 clock | `readKecClock` → 第N刻 | incense-stick or water-clock indicator; 8 刻 = one 时辰 (this mapping is not in code, only the 刻 grid) |
| Low stamina | stamina < 20 (server hint), stamina 0, `fatigueCount`+1, `RULE_STAMINA_LOW` | trembling hands ("你的手在抖"), desaturation |
| Cultivation | +800 per 刻, 10 000 = 炼体圆满 (`perfected`) | breath-cycle rings filling; seal ceremony at 100 %. It is **not** a breakthrough. |
| Clue found | `observe.result` found with clueLevel 1/2 | clue card or ink reveal; level 2 = deeper "细察" plate |
| Observation blocked by dark | `blockedReason too_dark` | fog or darkness veil |
| Talk outcome | refuse / idle / on_topic; `idleCount` hitting 3 | NPC reaction pose; the third-idle hook line |
| Combat | `combat.resolved` clear / clear_wounded / retreat + injury flag | three crow-burst choreographies; scratch, bite or retreat marks |
| Quest complete | `quest.completed`, `ferryState aground→clear` | ferry floats free, oar sound ("远处有桨声") |
| Reward | `quest.reward_claimed` + new `knownLocations` + opened edges | map unveiling of 折桂坪; 旧驿符 token presentation |
| Items | `item.acquired`, `item.consumed`, `item.depleted` | pickup glint, charm burn-away |
| NPC presence | `npcPresence` (static in P1) | portraits present per location |

### 8.2 Additions a richer game would need

**Map and regions.**
- Lift `PROLOGUE_V1_LOCATION_LIMIT` and the 3-location assertions (`contracts/prologue.ts:5,73`; `prologue-v1-rules.ts:771-775`) in a *new* facts schema and ruleset rather than editing v1.
- Add region and 域 ids, edge travel costs in 刻, and discovery state.
- Coordinates and art belong in content and presentation, not in facts.

**Rest and time.**
- Add a `rest`/`wait {kecCount}` action kind (a contract union change, plus `CLARIFICATION_ACTION_ORDER`, NLU templates and messages).

**Weather.**
- Either a deterministic schedule derived from gameMinute (no state needed), or seeded randomness. The receipt `rng {seed, draws}` already exists (`turn.ts:16-23`) but is unused.

**Breakthroughs.**
- Facts: `realm`, `stage` (炼气 层 1–10; 初/中/后/大圆满), `breakthroughAttempts`.
- A `breakthrough` action with item requirements (筑基丹…) and outcomes (success, regression, injury).
- Resolve the 化神/合体 order first (§7.13).
- Lifespan and age only if the author wants them.

**Relationships, NPC agency.**
- Facts: per-NPC disposition or trust, presence schedules, and topics that grant clues.
- The memory layer already supports `relation-changed` supersessions and witnessed/reported channels.

**Economy and factions.**
- Facts: `灵石` by grade (下/中/上/极), shop and source tables from `system_prices`, faction reputation and membership rank (sect rank names are in Canon).

**Combat depth.**
- Combat techniques (currently an empty allow-list), equipment, a seeded random element with replay.

### 8.3 Migration considerations

- Saves pin an exact `ruleVersion` and `canonVersion` (`rules.ts:87`), and v3 saves pin `canonArtifactHash`. Two options:
  - keep the old module and Canon artifact loadable forever, or
  - write explicit `source:'MIGRATION'` events (allowed by `event.ts:11`) into a new version.
- Facts are strict. Add a `PrologueV2Facts` or chapter-facts schema instead of loosening v1.
- Every new Canon entry needs both reviewers' receipts bound to the content hash. A new Canon version changes the artifact hash, so existing v3 saves need multi-artifact support or a migration.
- DB snapshot jsonb absorbs new facts without DDL. But:
  - enabling forks requires dropping the `branch_id='root'` CHECKs in four places and widening the contracts;
  - longer play needs the event-payload growth fixed (§7.11);
  - the drizzle snapshot drift (§7.20) should be resolved before generating new migrations.
