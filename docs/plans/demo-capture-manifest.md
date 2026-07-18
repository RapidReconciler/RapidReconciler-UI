# Demo Capture Coverage Manifest

Status: planning doc. Read before wiring the capture walk into
`build-demo.ps1`. Companion to the record/replay toolchain in
`RapidReconciler-Demo/`.

This maps what the offline demo bundle must capture to give a presenter
"free-roam": every request the product could fire across the demo DBs,
companies, periods, screens, and the drills a presenter actually uses.
It also defines the chunk order (capture the demo-critical surface first,
expand outward) and tracks capture status per chunk.

Grounding is live as of 2026-07-17: DB names, companies, and period-ends
were read from `localhost,1433` (read-only SELECTs). Endpoint footprints
were read from `RapidReconciler-AI/RRV8/*.html`.

---

## How replay works (the constraint everything below serves)

The bundle records each request/response pair keyed by a **signature**
(`request-signature.js`): `METHOD path [?sortedQuery] [#bodyHash]`.
Replay (`replay-shim.js`) looks up the signature and serves the recorded
body. A signature the walk never visited is a **MISS** (neutral `null`
for reads, `{"ok":true}` for writes) and shows in the dev overlay.

Two facts drive the whole manifest:

1. **The signature drops scheme/host/port on purpose** (portability).
   So two calls that differ only by origin collapse to one signature.
2. **Scope rides in the request for the work endpoints.** The
   company/period-scoped POSTs (`inventory/transactions`,
   `inventory/reconciliation/rows`, `inventory/variance-component`)
   carry `{companies:[...], period:"YYYY-MM-DD"}` in the body, so the
   body hash makes each company×period a distinct signature. Those do
   NOT collide.

The collision risk is narrow but real — see
[Cross-DB collision](#cross-db-collision-the-one-real-gotcha) below. It
shapes the chunk strategy.

---

## Coverage universe (live)

### Demo databases

| DB | Lineage | Companies (with data) | Period-ends with data | Range |
|---|---|---|---|---|
| `RapidReconciler_Demo1` | Demo1 (seeder/Dev) | `80002`, `80008` | 7 | 2025-02 .. 2025-08 |
| `RapidReconciler_Demo2` | Demo2 (NA) | `80003`, `80004`, `80010`, `80013`, `80023`, `80041` | 15 | 2024-12 .. 2026-02 |
| `RapidReconciler_Demo3` | Demo3 = **Golden Harvest** (TR) | `30001`, `30002` | 16 | 2022-02 .. 2023-05 |

`RapidReconciler_Prod_V8` and `RapidReconciler_QA_V8` also exist on the
box; they are NOT demo DBs and are out of scope.

Companies are the RItems / RInvAccountList working set per DB (the
reconciliation-bearing companies), not the full F0006 company constants
(Demo1 alone has 828 F0006 rows). The pickers only surface the working
set, so those are the walkable companies.

**Company numbers are disjoint across the three DBs** (8xxxx vs 3xxxx).
This matters: any request that carries a company in its body implicitly
identifies its DB, so company-scoped calls never collide across DBs.

### Scope-state count (DB × company × period)

| DB | companies × periods | scope-states |
|---|---|---|
| Demo1 | 2 × 7 | 14 |
| Demo2 | 6 × 15 | 90 |
| Demo3 | 2 × 16 | 32 |
| **Total** | | **136** |

### Is it combinatorially large? Yes — chunking is essential.

- 136 scope-states × ~10 screen-surfaces ≈ **1,360 screen-states**,
  and with ~2 presenter drills each the naive ceiling is **~2,700+
  captured signatures**.
- The practical number is much lower because most DB-global reads
  (`available-periods`, `inventory/status`, `service-health`, `poll`)
  are period- and company-independent — captured once per DB, not per
  state — and a real demo works the recent 1-2 periods, not all 15.
- **Demo-critical surface (chunk 1): Demo3 only, 2 companies, recent 1-2
  periods, all screens + drills ≈ under 100 signatures.** Small,
  shippable, single-DB (no collision). The rest is expansion.

The gap between ~100 (chunk 1) and ~2,700 (full free-roam) is exactly why
this is chunked. Do not attempt a single "capture everything" walk.

---

## Screen request footprint

Endpoints each screen fires against the LIVE backend during a capture
walk (record/replay mode runs the product normally; the `data/*.json`
`demoFile` static-demo path is a separate mechanism and is NOT what gets
recorded). Writes (POST that mutate) are flagged — they produce
before/after states that must NOT be de-duped on merge.

Legend: R = read (GET or read-only POST), W = write (mutating POST).
Status per chunk: `pending` / `captured`.

### home.html — three tabs + AI rail (the landing surface, all roles)

| Tab / surface | Requests | R/W |
|---|---|---|
| Data Health | `admin/service-health`, `inventory/integrity` (`v6ui_raccountsummary`, `v6ui_itemrollintegritydialog`), `inventory/cardex-tolerance`, `inventory/reload-cardex/eod-check`, `inventory/reload-gl/preview`, `inventory/integrity/model-approval`, `inventory/integrity/purge-info`, `inventory/fiscal-period-end-detect`, `api/v1/ai/health`, `admin/acks`, `admin/activity`, `poll` | R |
| (VALC-side health) | `api/v1/admin/users`, `api/v1/admin/clients/current/access-reviews`, `api/v1/admin/clients/license-usage?database=` | R |
| Transaction Variance | roll-forward brief (`_briefData` from `inventory/integrity`), `available-periods` | R |
| Cardex Variance | cardex tolerance + roll-forward (shared with Data Health) | R |
| AI briefing / Ask | `api/v1/ai/explain` (POST body `{prompt}`) | R |
| Service restart (admin) | `api/v1/admin/services/restart` | W |

Key interactions: switch DB (Set Context dropdown → reloads all of the
above for the new DB), switch company scope, switch period, expand the
period chart, click through to a work page, ask the AI.

### Work pages

| Screen | Requests | R/W |
|---|---|---|
| `inventory-transactions.html` | `available-periods`; `inventory/status`; `inventory/transactions` (POST `{companies,period}`); `inventory/reconciliation/rows` (POST `{companies,period}`); `inventory/variance-component`; `inventory/transactions/details` (POST `{doc}`); `inventory/integrity` (`v_integrity_jde_aais`, `v_integrity10_duplicate_sales`, `v_integrity11_crossperiods`, `v8ui_dmaai_routes`); `inventory/integrity/aai-analysis-latest`; `inventory/integrity/dmaai-resolve` (W); `inventory/transactions/save-notes` (W); `inventory/work-notes`; `api/v1/ai/explain`; `poll`; `system-status` | R + W |
| `inventory-cardex-variance.html` | `inventory/integrity` (`v8ui_item_rollforward`, `v8ui_last_load_asof`, `v6ui_itemrollintegritydialog`); `inventory/as-of/details`; `inventory/as-of/item-position`; `inventory/adjustment-ledger`; `inventory/set-beginning-balance` (W); `inventory/undo-adjustment` (W) | R + W |
| `inventory-asof.html` | `inventory/as-of` (POST); `inventory/integrity` (`v-integrity4-uom-conv`, `v-integrity5-gl-class`, `v-integrity7-frozen-cost`); `inventory/reconciliation/history`; `api/v1/ai/explain` | R |
| `inventory-account-rollforward.html` | `inventory/integrity` (`v6ui_raccountsummary`); `admin/activity` | R |
| `accounting-model-review.html` | `inventory/status`; `inventory/integrity`; `inventory/integrity/model-baseline`; `inventory/integrity/model-approval` (W on approve); `api/v1/ai/explain` | R + W |
| `accounting-dmaais.html` | `inventory/integrity` (`v_integrity1_aai_base`, `v_integrity3_exc_glc`); `inventory/integrity/aai-analysis-latest`; `inventory/integrity/aai-responses`; `inventory/integrity/aai-save-responses` (W); `inventory/integrity/model-approval` | R + W |
| `inventory-variance-source.html` | `inventory/status`; `inventory/integrity`; `inventory/variance-component`; `inventory/reconciliation/history`; `reconciliation` | R |

### Key presenter drills (the interactions coverage must include)

| Drill | Screen | Request(s) it fires |
|---|---|---|
| Card → transaction details | inventory-transactions | `inventory/transactions/details` (POST `{doc}`) |
| GL-Class "View" modal | inventory-transactions / accounting-model-review | `inventory/variance-component`, `v8ui_dmaai_routes` / `model-baseline` |
| Roll-forward drill | inventory-account-rollforward | `inventory/integrity` (`v6ui_raccountsummary`) |
| Cardex adjust / align | inventory-cardex-variance | `set-beginning-balance` (W), `undo-adjustment` (W), `adjustment-ledger` |
| As-of item position | inventory-asof / cardex-variance | `inventory/as-of/item-position`, `as-of/details` |
| DMAAI resolve | inventory-transactions / accounting-dmaais | `dmaai-resolve` (W), `aai-save-responses` (W) |
| AI Ask (free-form) | home + work pages | `api/v1/ai/explain` (POST `{prompt}`) — see AI note below |

### AI surfaces — capture the scripted prompts, not free-form

`api/v1/ai/explain` keys on the body hash of `{prompt}` (and `{system,
level}` where sent). Every distinct prompt string is a distinct
signature. Free-form typing in the demo will MISS. Coverage for AI means
capturing the **scripted prompts** the tour uses (the auto-generated
briefing prompts fire on load and are captured for free; the presenter's
"Ask" prompts must be a fixed, walked list). This is a tour-definition
dependency, not just a screen visit.

---

## Cross-DB collision (the one real gotcha)

The signature drops origin. Most work endpoints carry company in the body
and companies are disjoint across DBs, so they self-namespace. **The
exception is DB-global reads that route to the per-DB agent and carry no
company/period discriminator:**

- `available-periods` (GET)
- `inventory/status` (GET)
- `inventory/cardex-tolerance` (GET)
- `inventory/reload-cardex/eod-check`, `inventory/reload-gl/preview` (GET)
- `poll`, `system-status`, `admin/service-health` (GET)

Each returns DB-specific data but produces an identical signature across
Demo1/Demo2/Demo3. In one merged `recording.json`, replay's `pick()`
serves them in recorded order then sticks on the LAST captured DB — so
only one DB's global state replays correctly. **This breaks multi-DB
free-roam if all three DBs share one recording.**

Two ways out (decide before the expansion chunks; chunk 1 is single-DB so
it is unaffected):

- **A — Partition by DB (recommended).** One recording per DB
  (`recording-demo3.json`, ...); `replay-shim.js` selects the active
  DB's recording on DB switch. Naturally chunkable (one DB = one chunk),
  sidesteps the collision entirely, matches the mental model (Golden
  Harvest is its own dataset). Cost: a small shim enhancement + the
  bundle ships N recordings.
- **B — Make the global GETs scope-bearing.** Add the DB name to those
  requests (query param) so the signature distinguishes them. Cost: a
  product change touching agent-route callers; wider blast radius.

Recommendation: **A**. It is also why the chunk unit below is the DB.

---

## Recommended chunk order

A chunk = (DB, company-set, period-set) walked across the full screen
footprint + drills. Capture demo-critical first; each later chunk unions
into the master (or its per-DB recording under option A).

| # | Chunk | Scope | Why first / when |
|---|---|---|---|
| **1** | **Golden Harvest core** | Demo3, `30001` + `30002`, most-recent 2 periods, ALL screens + all drills + scripted AI prompts | The tour's spine: analyst on Golden Harvest for transfer/cardex variance, plus the accountant-actionable company. Single DB = no collision. Ship this and the demo runs. |
| 2 | Golden Harvest depth | Demo3, both companies, remaining 14 periods (read surfaces + AI briefings) | Lets the presenter roam Demo3 history freely without MISS. Still single DB. |
| 3 | Accountant company (2nd DB) | The accountant-tour company on Demo1 or Demo2 (pick the one with a live roll-forward break to demo the accountant hand-off), recent 2 periods, accountant + reconciliation screens | Second-DB coverage → forces the partition decision (option A). Adds the accountant narrative. |
| 4 | Demo1 breadth | Demo1, both companies, all periods, all screens | Rounds out the seeder/Dev dataset (variance demos, cardex injection). |
| 5 | Demo2 breadth | Demo2, all 6 companies, all periods, all screens | Largest scope-state count (90); capture last. Multi-company stress. |
| — | Admin pages | `admin-*` pages | **Deferred** unless a specific admin screen is in the tour script. Most are config/write surfaces (purge, reload, users, passwords) not shown in a data demo. Add per screen only when the tour calls for it. |

Explicitly IN scope: home (3 tabs + AI), the 7 work pages, the 7 drills,
scripted AI prompts, all three demo DBs.

Explicitly DEFERRED: admin pages, `inventory-reroll.html` (operational,
no read footprint of demo interest), Prod/QA DBs, free-form AI.

No silent truncation: chunks 2-5 are real coverage, just sequenced after
the demo-critical chunk.

---

## Status tracker

Stamp per chunk as walks complete. One row per (chunk, screen); flip
`pending` → `captured` when the screen's full footprint + drills are in
the recording with zero MISS in the overlay.

| Chunk | Screen | Drills incl. | Status |
|---|---|---|---|
| 1 Golden Harvest core | home (3 tabs + AI) | DB/company/period switch, AI Ask | pending |
| 1 Golden Harvest core | inventory-transactions | card→details, GL-Class View, DMAAI resolve, AI | pending |
| 1 Golden Harvest core | inventory-cardex-variance | adjust, undo, as-of position | pending |
| 1 Golden Harvest core | inventory-asof | as-of, item roll-forward, AI | pending |
| 1 Golden Harvest core | inventory-account-rollforward | roll-forward drill | pending |
| 1 Golden Harvest core | accounting-model-review | GL-Class View, approve, AI | pending |
| 1 Golden Harvest core | accounting-dmaais | aai-responses, save-responses | pending |
| 1 Golden Harvest core | inventory-variance-source | variance-component, history | pending |
| 2 Golden Harvest depth | all read surfaces, periods 3-16 | period switch, AI briefings | pending |
| 3 Accountant company | home + accountant/reconciliation screens | accountant hand-off | pending |
| 4 Demo1 breadth | all screens | all drills | pending |
| 5 Demo2 breadth | all screens (6 companies) | all drills | pending |

---

## Open dependencies

- **Tour definition = walk list.** The scripted AI prompts and the drill
  sequence must live as one source with the tour so a new screen is
  always visited. `build-demo.ps1` step 3 already notes this.
- **Which company is the accountant-tour company** (chunk 3) needs the
  owner's call — pick the DB/company that has a live roll-forward break
  to demo the analyst → accountant hand-off.
- **Partition-vs-scope-bearing decision** (option A vs B) before chunk 3.

## Driver proof — findings & prerequisites (2026-07-17)

Automated MCP browser driver **mechanics PROVEN** on the live :8765 app
(reachability, token sourcing, CORS preflights, a patched-`fetch` recorder, and
per-screen loads with correct request bodies all validated — real authed POSTs
to `/inventory/transactions`, `/inventory/integrity`, etc. returned 200). Before
a trustworthy chunk/full walk, four prerequisites:

1. **Run the walk THROUGH VALC `capture/start`, not by self-serving :8765.**
   VALC (LocalSystem) has the privilege to stop the RR App; a user-context serve
   hits "cannot bind — port held by the live app" (the proof hit exactly this —
   :8765 was occupied by the running RR App and the agent correctly refused to
   kill it). `capture/start` also serves the shim from t=0 — **post-load shim
   injection misses the first-load request burst and cannot substitute.**
2. **Resolve the `POST /api/v1/ai/explain` 403.** Under the current :8765 token,
   ai/explain returned 403 while `ai/health` (same origin) returned 200 — so a
   walk would record 403s where Opus (`claude-opus-4-8`) answers belong. **AI is the demo
   centerpiece → this is a blocker for AI-screen capture.** Likely token
   permission/scope or the 403-masks-error gotcha ([[reference_agent_403_masks_errors]]);
   diagnose before capturing AI surfaces.
3. **Wait strategy (make-or-break):** between screens, poll `read_network_requests`
   filtered to the expected endpoint(s) until a **terminal status** (not pending);
   a fixed sleep captures half-loaded screens = silent gaps. Open the network
   tracker BEFORE navigating (it only tracks from its first call), pass
   `clear:true` between screens (it accumulates across same-domain nav), and note
   `urlPattern` is literal-substring, not regex.
4. **Vendor external CDN assets** — the roll-forward page pulls `pdf.js` from
   Cloudflare; anything captured has a live external dependency unless vendored,
   which breaks true-offline replay.

## Capture UNBLOCK — resolved to a fresh login (2026-07-17, verified in VALC Postgres)

The driver build could not validate chunk-1 because the owner's browser token
(minted 2026-07-02) predates the 2026-07-10 demo rename: it scopes the Demo3
agent to companies `00001/00002` and the now-inactive db name `RapidReconciler_TR`,
while Golden Harvest's data was renumbered to `30001/30002` in `RapidReconciler_Demo3`
(agent :37384). The Services agent filters every row against the token's company
list, so Demo3 queries returned `total:0` — a walk would have recorded empty
screens. (Implication: the earlier "driver proof 200s" were against Demo1, whose
token scope still matched; **Demo3 was never actually reachable with that token**.)

**Verified the registration is NOT the problem:** `client_licensed_companies`
for Demo3 (`client_database_id 23`, client 1 "RR Test Server", tier `full`)
already lists **`30001` and `30002`** (licensed 2026-07-11). So the fix is simply
a **fresh login** at `localhost:8765/login.html` — the new token picks up Demo3 +
`30001/30002` and the runbook executes as written. NO DB change required.
- Harmless cruft: the pre-rename `00001/00002` still linger on Demo3's license
  (`client_database_id 23`, licensed 2026-06-20) — optional cleanup, not a blocker.
- Correcting the local dev token directly was intentionally NOT done (auth edit;
  belongs to the owner). Fresh login is the clean path.

---

# ADMIN capture manifest (recording-admin.json + the next pass)

Status: active. Grounded 2026-07-18 against the live code
(`RRV8/home.html`, `RRV8/config.js`, `RRV8/admin-*.html`,
`Tools/help-sidebar.js`) and the existing recording
(`RapidReconciler-Demo/publish/capture/recording-admin.json`, 19 distinct
paths, 1.8 MB).

The admin chunk was walked once already. That first pass has two known
holes the owner flagged: it fired the admin AI pills only at the **Full**
tier, and it opened **no** help panels. This section is the turnkey plan
for the next pass so those holes close in one walk.

## What recording-admin.json already covers

Pages walked: the admin `home.html` view, `admin-companies.html`,
`admin-users.html`, `admin-claude-assistant.html`,
`admin-activity-log.html`.

The admin surface is almost entirely **DB-global**: the reads scope to the
active database and the signed-in user, not to a company or a period. So
one pass per DB is enough. There is nothing to re-walk per company or per
period the way the analyst work pages need (those carry
`{companies,period}` in the body). Captured reads, each recorded once:

| Path | Count | Scope |
|---|---|---|
| `/api/v1/ai/explain` | 7 | prompt-keyed (see below) |
| `/admin/acks` | 5 | DB-global |
| `/api/v1/admin/clients/license-usage` | 4 | DB-global |
| `/inventory/status` | 3 | DB-global |
| `/inventory/integrity` | 3 | DB-global |
| `/api/v1/ai/health` | 2 | DB-global |
| `/api/v1/admin/users` | 2 | DB-global |
| `/api/v1/admin/clients/current/access-reviews` | 2 | DB-global |
| `/admin/service-health` | 2 | DB-global |
| `/admin/activity` | 2 | DB-global |
| `/poll`, `/inventory/integrity/purge-info`, `/inventory/fiscal-period-end-detect`, `/inventory/cardex-tolerance`, `/home/status-summary`, `/available-periods`, `/api/v1/messages`, `/api/v1/admin/clients/current`, `/admin/companies` | 1 each | DB-global |

The 7 `ai/explain` entries are the 6 admin pills fired at Full, plus one
extra (a re-fire, or the pill re-run the tier-change handler triggers).
None of the `ai/explain` entries carry a 403, so the AI path was healthy
for this walk.

Do not re-walk these reads. They are done for this DB.

## Mechanism 1: the AI tier control (why each tier is a separate capture)

The tier switcher lives in `RRV8/config.js` as `window.RRAI` and renders
on `home.html` via `_renderAiTierSwitch()` into `#haiTierSeg`.

Confirmed tier keys and labels (from `config.js`):

| Internal key | UI label | ai/explain fires? |
|---|---|---|
| `off` | Off | **No** (short-circuits) |
| `grounded` | Basic | Yes |
| `scrubbed` | Enhanced | Yes |
| `full` | Full | Yes |

`RRAI.set(t)` persists to `localStorage.rrv8.aiTier` and dispatches the
`rrv8:aitierchange` window event. Default when unset is `full`.

Why the tier multiplies the captures: `askAdmin()` in `home.html` reads
the live tier through `_recsummaryLevel()` (which returns `RRAI.get()`)
and bakes it straight into the prompt it POSTs. Three parts of the prompt
body change with the tier:

- the `expNote` "DATA ACCESS" line (a distinct sentence for `grounded`
  / `scrubbed` / `full`),
- the team-inactivity line (count only at `grounded`, role-masked at
  `scrubbed`, named at `full`),
- the tagged task lines drawn from the cards.

The record shim signs each POST as `signature(method, url, body)` with the
body hashed in. Different tier means a different prompt means a different
signature. **A pill answer captured at Full is a MISS if the presenter
flips to Basic at replay.** So every pill the tour uses has to be fired
once at every tier the tour lets the presenter reach.

`off` is the exception. `askAdmin()` returns before any POST when the tier
is `off`, painting a static client-side line ("The AI assistant is off for
this database..."). Nothing hits the network, so `off` needs no capture
and replays for free.

### Tier set to walk

Fire all **6 admin pills** at each of **`grounded` (Basic)**,
**`scrubbed` (Enhanced)**, and **`full` (Full)**. Full is already in
recording-admin.json, so the next pass strictly needs Basic and Enhanced:
2 tiers x 6 pills = **12 new `ai/explain` captures**. Skip `off`.

The 6 pills (each pill's `data-q` is the exact capture key; they are
verbatim in `#adminAskBar`):

1. What needs my attention right now?
2. When does our license expire, and what is the renewal step?
3. Who has not signed in lately, and should I remove them?
4. How do I add a new team member?
5. Is the instance healthy, or is anything starting to degrade?
6. What does the activity log tell me?

Per-tier walk step: set the tier, then click all 6 pills in turn, gating
each on a terminal `api/v1/ai/explain` status before the next. Set the
tier either by clicking `#haiTierSeg` on the admin home or, for a
deterministic driver, by calling `window.RRAI.set('grounded')` /
`window.RRAI.set('scrubbed')` in the walk tab before the pill loop. Both
routes fire `rrv8:aitierchange` and repoint `_recsummaryLevel()`.

Note the same tier-keying applies to every other `ai/explain` surface
(the analyst and accountant AI on `inventory-transactions.html`,
`inventory-asof.html`, `accounting-model-review.html`, and the home
briefing all read `RRAI`). If the tour lets the presenter flip tiers on
those pages too, the same "fire per tier" rule extends there. This
section scopes only the admin pills.

## Mechanism 2: the "?" help panels (fetched, but the shim never sees them)

`Tools/help-sidebar.js` reads `<body data-help-src>`, injects the dark "?"
circle next to the header Home link, and on click opens a right-docked
companion panel whose body is an **iframe**. It sets the iframe `src` to
the doc URL with `?embed=1` inserted before any `#hash`, lazy-loading the
doc as a full-document navigation on first open.

That load is a native browser navigation, not `fetch` or `XHR`. The record
shim patches only the top window's `fetch` and `XMLHttpRequest`, and its
XHR branch explicitly drops `document`/`blob` responses. The iframe has its
own window the shim never touches. **So help content is never written to
recording.json, at any tier, by any walk.** The fetch-vs-inline question
resolves to: fetched into an iframe, but out of the shim's reach, and the
underlying doc is a static HTML file.

Consequence: the help panels are not a capture task at all. They are a
**static-bundling** task. For a panel to render, both the capture-staging
serve (so it renders during the walk) and the replay bundle (so it renders
in the demo) must carry the help docs and their chrome as real files.

### Bundle gap to fix before this matters

Both `build-capture-staging.ps1` and `build-demo.ps1` copy only
`RRV8/*`. The help docs live in `RRUniversity/` and their chrome in
`Tools/` (`help-sidebar.js`, `help-sidebar.css`, `doc-chrome.js`,
`doc-header.css`, plus the logo images `doc-chrome.js` derives from its own
`src`). Neither folder is staged today. In the flattened layout the admin
pages reference `../Tools/...` and `../RRUniversity/...`, which resolve
above the bundle root once `RRV8/` is flattened to the root. Result as it
stands: `help-sidebar.js` 404s, so the "?" circle never even appears, and
if it did the iframe doc would 404 too.

To make help panels work, the build needs to also stage `Tools/` and the
relevant `RRUniversity/administrator-*.html` docs at paths the flattened
pages can reach (either preserve the `Tools/` + `RRUniversity/` subtrees
one level up from the flattened root, or rewrite the `../` prefixes at
stage time). This is a `RapidReconciler-Demo` build change, tracked here
because it is the real blocker, not a walk step.

### Help panels to open during the walk (verification only)

Opening them records nothing, but the walk should open each once to
confirm the panel renders (proof the bundling fix landed). The network
request drops the `#hash`, so each distinct doc is one static asset no
matter which anchor the page requests.

| Admin page | data-help-src (as authored) | Static asset fetched | Panel title |
|---|---|---|---|
| `admin-companies.html` | `../RRUniversity/administrator-managing-companies.html` | `administrator-managing-companies.html?embed=1` | Licensing & company seats |
| `admin-users.html` | `../RRUniversity/administrator-managing-users.html` | `administrator-managing-users.html?embed=1` | RR Team |
| `admin-claude-assistant.html` | `../RRUniversity/administrator-start-here.html#ai-assistant` | `administrator-start-here.html?embed=1` | **AI Assistant & Your Data** |
| `admin-activity-log.html` | `../RRUniversity/administrator-start-here.html#system-health` | `administrator-start-here.html?embed=1` | Activity Log |

`home.html` has no `data-help-src`, so the admin home shows no "?" panel.

**The AI Assistant help panel** (`admin-claude-assistant.html`) is the one
the owner called out: the data-exposure and policy content. It is the
inline `<section id="topic-ai-assistant">` inside
`administrator-start-here.html`, shown by that doc's own `showView()` SPA
and deep-linked by `#ai-assistant`. All of it is static HTML in one file.
Nothing about it goes over `ai/explain`, so no AI capture covers it. It
rides entirely on the bundling fix above. The same file backs the Activity
Log panel via `#system-health`, so staging `administrator-start-here.html`
once serves both.

## The next admin pass, end to end

What recording-admin.json already covers:

- Every admin DB-global read (the whole table above), once for this DB.
- The 6 admin pills at the **Full** tier.

What the next pass adds:

- The 6 admin pills at **Basic** (`grounded`) and **Enhanced**
  (`scrubbed`): 12 new `ai/explain` captures. No `off` capture.
- Nothing new on the network for help panels. Instead: land the
  `Tools/` + `RRUniversity/` bundling fix, then open the 4 help panels
  during the walk to verify they render (the AI Assistant one especially).

Do not re-walk the DB-global admin reads or the Full-tier pills; they are
already in the recording. If this admin chunk is later captured against a
second demo DB, the DB-global reads collide on signature the same way the
analyst globals do (see the Cross-DB collision section above), so the same
partition-by-DB recording applies.
