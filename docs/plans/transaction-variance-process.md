# Transaction Variance Process — design (analyst) + Audit Support Center (accountant)

**Status:** DESIGN, co-developed with the owner 2026-07-07 (he teaches the process; Claude
designs + builds). Living doc — append as the teaching continues. Feeds worklist UI-24
(analyst knowledge base), UI-25 (live-DMAAI injection), UI-26 (closed-card + convergence),
UI-27 (Audit Support Center). Build latitude is Claude's; the *process* below is the owner's.

## End goal (owner-confirmed — "lands perfectly")

The transaction variance process is a **remediation loop**, not a reporting one. Its goal is to
**drive the recurring residual to zero at the source** — so inventory-to-GL ties on its own,
period after period, without anyone posting a correcting entry.

1. The residual (`recstatus=1` items where F4111 ≠ F0911 after auto-netting) is **classified**
   into root-cause categories (the DAC-16 10-card taxonomy).
2. **Prioritized by return-on-effort** — biggest *recurring* dollars first.
3. Each category points to a **source fix** (misconfigured DMAAI, broken MTO/intercompany order
   linkage, process gap) the analyst corrects so it *stops generating variance*.
4. Success is measured by its **own shrinking** — fewer residual items each period, → zero.

It sits **upstream of reconciliation**: the accountant trues up *this* period with a JE; the
analyst makes that JE *unnecessary next* period by removing the cause. Demo "wow" = the AI turns
a pile of variances into a prioritized, root-cause-attributed plan ("fix these 3 DMAAI configs and
~75% of the recurring residual stops coming back").

## Roles (do NOT conflate — [[project_analyst_accountant_role_split]])

- **Analyst** — investigates transaction + cardex variance, finds the root cause, fixes it at the
  SOURCE (DMAAI/config, order-process setup, re-roll → reload cardex). **Never posts journal entries.**
- **Accountant** — owns journal entries: the balancing/adjusting entry, reconciliation, period-end
  JE-Complete. A residual the analyst can't fix at the source is the accountant's to reconcile.

## Card lifecycle

`open` (residual in this category) → `worked` (analyst applied a source fix) → `closed`
(worked + a resolution recorded) → next period: `confirmed` (category → 0, archive) or
**auto-`reopen`** (recurred → the fix didn't hold / was wrong).

## Closed-card face — a *resolution record*, not the problem

**Voice / audience (owner 2026-07-07): the card-face TEXT is an AUDITOR-facing problem → recommendation
narrative.** Not analyst shorthand — an auditor reading the reconciliation wants (1) the **problem**
stated clearly (what's out, how much, why it matters / materiality) and (2) the **recommendation** (the
corrective action). Open card = problem + recommended fix; worked/closed card = problem + what was done
(the resolution). Same two-beat shape throughout. This is a deliberate departure from the analyst
"assume JDE fluency, terse bullets" mantra *for this surface* — the card face feeds the audit trail
(Audit Support Center / audit report), so it reads for an auditor, not the JDE-fluent analyst working
it. *(Open: how much JDE artifact naming an auditor tolerates — see the question logged for the owner.)*

Once worked, the face flips from "here's the variance" to "here's what I did," compact enough to
collapse out of the active list (fold into a "Resolved this cycle: N" line, like reconciled
companies fold into a green line; extends the existing UI-15 "✓ Worked" dim):

- **What it was** — category + the $ (and recurrence) it represented.
- **The source fix applied** — the specific action ("AAI 3120 remapped to acct X" / "MTO SO→WO
  linkage corrected" / "re-rolled + reloaded cardex"), ideally chosen from the KB corrective-action
  ladder (UI-24) so it's structured, not free text.
- **Who / when** — audit stamp.
- **Expected effect** — "should stop recurring next period" OR, if not fixable at source, a
  **"real residual"** flag (→ accountant reconciles it).
- **Verify-next-period hook** — the field that makes closure mean anything: *did it not come back?*

**Storage (owner-agreed 2026-07-07 — replaces the legacy per-row work-note table for tx-variance):**
a **card-keyed store** — ONE record per **`(database, company, card_code, period_end)`** (~10 rows per
company per period, vs. thousands of row-notes). Columns: card_code · period_end · company · db ·
**status** (open/worked/complete/reopened) · **note** · source-fix-applied · who · when. **Musts:**
(a) key on the **stable classifier code** (`_txvClassifyCode`), NOT the 1–10 display order — a taxonomy
reorder must not corrupt history; (b) company + db IN the key (the tab is single-company); (c) this IS
the closed-card record AND the remediation-log/audit spine — build it ONCE as the shared store feeding
UI-15 (rewrite: Findings writes here, not per-row), UI-26 (this lifecycle), UI-27 (Audit Support Center).
It survives B→C row churn (row-notes orphan when the residual set changes; a card-keyed note doesn't)
and enables the period-N-vs-N+1 auto-reopen. **Manual reopen/edit:** the analyst can mark a card
complete then reopen it to edit the note/fix and re-complete — edits the SAME period's record (distinct
from auto-reopen, which opens a NEW period's record on recurrence). A reopen+edit **overwrites the
note + stamps last-edited who/when — no note-versioning** (owner-decided 2026-07-07: RR is a tool, not
a system of record; JDE is the SoR — see [[project_rr_tool_not_system_of_record]]). **Tradeoff:** loses per-row annotation — a note is about
the whole card; a one-off row exception goes in the card-note text. Net-new v8 backend (`v8_`/`usp8_`
table + endpoints + owner VALC/agent rebuild); spec the endpoint first.

## Flow-outs (closure is data, not a dead-end) — priority order

1. **Forward into next period's classification (the convergence loop).** A closure is a prediction
   ("this category → 0"). The next B→C tests it: gone = confirmed (archive), recurs = **auto-reopen**.
   Build this FIRST — without it, "closed" is just a dim button; with it, closed cards are the
   scoreboard for the whole process.
2. **Remediation log — audit + institutional memory.** What was fixed, when, by whom. Given the
   owner is the sole knower, retiring ([[user_role_exit_strategy]]), this captures the JDE config
   changes analysts make = durable knowledge the next person inherits. Surfaced in the **Audit
   Support Center** (below).
3. **Feeds the KB (UI-24).** A real closed case ("3120 misrouted → remapped, residual dropped $X")
   is evidence that validates/enriches the root-cause→fix taxonomy.
4. **Convergence trend.** Closed-vs-open $ across periods = the shrinking-residual metric (the
   demo's proof the process works).
5. **Disposition to the accountant.** Closed "not fixable at source" → real residual → accountant
   reconciles (JE candidate). Closed "fixed at source" → no JE, just watch. Keeps the role split clean.

## Audit Support Center — accountant tab (owner idea 2026-07-07: "this all fits right in")

A new **accountant** tab (alongside Overview / Accounts / On Hand) — the auditor-facing "everything
that touched the numbers this period" trail. Aggregates:

- **Remediation log** — analyst source-fixes (flow #2): what was fixed, when, by whom, effect.
- **Reconciliation actions** — JE-Complete markers, adjusting entries recorded, sign-offs (UI-18).
- **System activity** — loads / B→C / deploys (the shipped activity-log feed; UI-13 surfaces the
  recent slice on Home).
- **Audit Report** — the full-period Excel/PDF export (now accountant-only) is its companion / lives here.
- **Worknotes / findings** — UI-14/UI-15.

Purpose: one browsable place for the accountant/auditor to see the full story of the period's data
— remediation + reconciliation + system events — with the Audit Report as the exportable snapshot.
**It is a convenience / backup VIEW, not an audit-of-record** — RR is a tool, not a system of record
([[project_rr_tool_not_system_of_record]]; JDE is the SoR). Build it as a readable trail, not a
compliance system with immutability / legal-hold obligations.

## Architecture note — ONE audit-activity spine, not three logs

Remediation entries, JE-Complete/sign-offs, and system events should be **typed entries in one
server-persisted audit-activity store**, not separate logs. Producers = analyst closures, accountant
reconciliation actions, system loads/deploys. Consumers = Home activity strip (UI-13, recent slice),
Audit Support Center (accountant, full/filtered), Audit Report export. Builds on the existing
`RRV8.logActivity` + the shipped activity-log feed + the reminders-ack server pattern
([[project_reminders_server_acks]]: `/admin/activity/ack` + `/admin/acks`). New VALC endpoint(s) —
**spec first** ([[feedback_always_spec_new_endpoints]]), UI wired with graceful localStorage fallback,
owner builds the VALC side on rebuild.

## Cardex variance — KB module (⚠ IN PROGRESS — owner still teaching; NOT complete, do not scaffold until owner says so) [2026-07-07]

> Captured so far, but the owner has more to add. Treat every conclusion below as partial. Do NOT
> declare this module done or start building it — the owner sets the pace and says when it's complete.

**⚑ MODULE PURPOSE — REFRAME (owner, cardex teaching):** this module is NOT a root-cause diagnostic
engine — it's a **guided SYNCHRONIZATION tool.** The analyst does the JDE validation and decides whether
RR matches JDE or not. **The *reason* (glitch vs. revaluation) is almost moot — there is no reliable way
to tell whether JDE glitched, which is exactly why this is one of the biggest headaches in JDE inventory
management.** RR's job is to **sync RR to the validated JDE position**, not to diagnose the cause. Therefore:
- The cause taxonomy below (timing / glitch / revaluation) is **BACKGROUND ONLY** — the tool does NOT
  branch on it. The earlier "diagnostic (two splits)", "analyst decision tree", and cause-based "dispose"
  content is **SUPERSEDED as the tool's logic** (kept below only as background on why variances arise).
- Instead, RR asks the analyst a **FIXED set of input questions** (e.g., *"Is the beginning balance OK —
  quantity and amount?"*) whose answers **drive which Re-Roll option + parameters execute.**
- **Q1 (glitch-vs-revaluation discriminator) = RESOLVED → moot; do not build it.**
- **NEXT (wraps the design):** define the Re-Roll options + the fixed question set that maps to them (the
  workflow). Owner-led.

**⚑ DIVISION OF LABOR — REVISED (owner, cardex teaching): sync ≠ variance.** An analyst sometimes needs to
sync an item with NO current variance, so the *find-variance* surface and the *do-the-sync* surface split:
- **Home cards = variance surfacing (browse).** Each card FACE shows **totals** (count + $); an expandable
  **drawer** holds the **item grid** (item/branch/loc/method/QtyVar/AmtVar/QOH), from the warmed data. A
  drawer row → opens the sync page **for that item**. (Grid lives on Home — NOT on the page.)
- **Cardex page = the SYNC ENGINE only.** Item-focused: arrive with an item (drawer drill) or **type any
  item in** (start simple: item # + branch — no catalog picker yet), then validate-JDE → question workflow
  → Adjust Beginning Balance → Adjustment Ledger. Works on items with **no** variance too.
- **Formally diverges from the tx-variance wiring** (owner-confirmed) — there the action is bound to the
  card; here sync is not variance-bound, so the action surface (page) is decoupled from the browse surface
  (cards/drawer). Principled divergence, not inconsistency.
- The "3 cards → filtered worklist" description below is **superseded** by this (cards now carry drawers on
  Home; the page is sync-only). Card taxonomy + quantity-first precedence are unchanged.

**⚑ ITEM SELECTION MOVES TO THE FULL PERPETUAL DETAILS PAGE (owner 2026-07-09).** The sync tool
needs **no item search of its own** — drop the typed "enter any item" box. Instead, add a **launch
affordance on a ROW of the full perpetual details page** (the As Of perpetual grid,
`inventory-asof.html`) → opens `inventory-cardex-variance.html?company&item&branch&…` focused on that
item. So there are two launch sources, both param-only: (a) Home Cardex Variance drawer (variance items);
(b) a perpetual-details row (ANY item). This is the clean answer to "sync an item with no variance" — the
perpetual page already lists every on-hand item, so it's the natural picker; the sync page stays a pure
param-driven engine. **Build implication (still real):** for a NO-variance item the sync page can't get
its `ItemID`/position from the warmed variance cache (the view only carries variance rows) — the launch
must pass the item's `ItemID` (the perpetual row has it) and the Adjust flow must fetch that item's
`rperpetualinv` row on demand (a per-item lookup / small endpoint), rather than reading it from the cache.
**Caveat to confirm:** does the perpetual details page list depleted (QOH=0) items? If not, a
depleted-but-variance item wouldn't be launchable from there (Home drawer still covers variance ones).
Sequencing: keep the typed box until the perpetual-row launch replaces it (don't regress arbitrary-item
access in between); build both together.

**⚑ QUANTITY VARIANCE = A DIFFERENT CORRECTIVE ACTION → ITS OWN CARD + WORKFLOW (owner 2026-07-09).**
Confirmed by the authoritative RRU flow: **amount** variance → a **dollars-only Inventory Adjustment
(P4114)** the sync tool drives (validate JDE → dollars-only IA → Re-Roll → reload). **Quantity** variance
is explicitly **NOT** that path — the RRU guide says a quantity mismatch is "not covered — investigate
separately, may require IT." So its corrective action diverges: either **Re-Roll** (if RR-only artifact,
JDE qty is right) or **escalate to a JDE data fix / re-post** (the F4111↔F41021 "system glitch" — a
movement hit one table not the other; a re-roll only helps after JDE is corrected). The 3-card split
already isolates Quantity as card 1 — the NEW requirement is that the Quantity card **routes to its own
question-set + action path**, NOT the amount cards' dollars-only IA. This is a primary input to the
Re-Roll↔question-set workflow (still owner-led): the fixed questions and the resulting action **branch on
variance type** (quantity vs amount·std vs amount·avg). **RESOLVED (owner 2026-07-09) — the corrective
action is gated on noise-vs-real, not a fixed ladder:** **noise → sync** (the analyst syncs RR to the
validated JDE position — this is the mechanic formerly called "Re-Roll"); **real → escalate** (a genuine
JDE-side problem the analyst hands off, since RR shouldn't launder it). So the **noise-vs-real rules are
the linchpin** — they no longer just decide *what shows on a card*, they **decide the corrective action
itself** (sync vs escalate). The whole quantity workflow is therefore blocked on those rules (owner to
develop). Applies to quantity first; whether amount's "real" case is the same escalate — or the RRU
dollars-only P4114 IA, which posts to GL and reads more like an accountant action — is the muddier
role-split question still open.

**⚑ TERMINOLOGY (owner 2026-07-09): drop "Re-Roll" → say "SYNC"** in all V8 tool + design language. The
user-facing verb is "sync (RR to JDE)". Backend proc names (`usp6_roll_item_from_baseline`, etc.) and the
customer RRU doc (which describes JDE's actual Re-Roll buttons) keep their names — this is the V8 sync
tool's vocabulary only.

**⚑ HOME LAYOUT — 2 COST-METHOD CONTAINERS, 2 cards each (owner 2026-07-09).** Supersedes the flat 3-card
stack. Two OUTER containers split by cost method; each holds two detail cards (the two variance dimensions):

```
┌─ Standard cost (07) ────────────┐   ┌─ Weighted Average cost (02) ────┐
│  [ Quantity ]    [ Amount ]     │   │  [ Quantity ]    [ Amount ]     │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

Every item lands in exactly one (container × card) cell = (its cost method) × (Quantity if qty-var else
Amount), preserving quantity-first precedence WITHIN each cost-method container. Rationale: standard and
average items are handled differently (the average amount fix needs the UDC `40/AV` dance; standard
doesn't) and — per the next thread — their **grid columns + row sequence differ**, so cost method is the
right outer partition. *(Reconciles the earlier "quantity is cost-method-agnostic": the quantity FIX
doesn't depend on std-vs-avg mechanics, but each ITEM still carries a cost method, and grouping by it keeps
the grid + handling consistent per container.)*

**⚑ NEXT THREAD (owner to teach): grid columns + row sequence, standard vs average.** The drawer/grid
inside each card differs by cost method (e.g., the `Method` column is redundant inside a single-method
container; column set + sort order differ std vs avg). Owner-led — do NOT design it yet.

**Build sequencing:** hold the Home restructure (2×2) until the grid columns/sequence are defined — build
the containers + drawers together in one pass rather than shelling the containers now and reworking the
grids next.

**⚑ NOISE-VS-REAL RULES — RESOLVED (owner 2026-07-09), the linchpin is now concrete:**
- **Materiality (per-row):** a row is **immaterial** when its variance is **under the company's
  `rcompanies.Threshold`** (int, =1 today → under $1). Authoritative single source — the SAME threshold
  `usp6_006b` netting + the `usp8_txv` classifier already use. **SUPERSEDES** the separate
  `dbo.RCardexTolerance` table + the sync-page tolerance editor (`/inventory/cardex-tolerance`) — **retire
  both** in the rebuild; if the threshold needs editing it lives on `admin-companies.html` (a company
  attribute). *(Open: for the QUANTITY card, does materiality test the row's $ impact (`AmtVar` = qty×cost,
  natural since one $ threshold covers both dimensions) or units? — confirm. Threshold is int → no
  sub-dollar; fine at $1.)*
- **Persistence:** a variance that **survives a reset unchanged is REAL**; one that clears was noise
  (timing). *(Open: "reset" = the SYNC / re-baseline op (my read), or the nightly refresh, or a full data
  reset? confirm the mechanic.)*
- **The operating loop this implies (confirm):** under threshold → **immaterial → leave**; at/over
  threshold → **material → SYNC** (RR→JDE re-baseline; the mechanic formerly "Re-Roll"); **survives the
  sync unchanged → REAL → ESCALATE**. So we DON'T pre-label noise vs real — the analyst **syncs everything
  material, and whatever survives the sync is real**. Matches "noise we can sync; real needs escalation."
  **Consequence:** "real" can't be known from one snapshot — it needs the **per-item history store**
  (records the pre-sync variance to compare post-reset), so the cardex-storage thread is confirmed on the
  critical path.

**⚑ GRID COLUMNS — SET (owner 2026-07-09), SAME grid for every one of the 4 cards:** Item · Branch ·
Location · Lot · Method · Level (CostLevel) · QOH · UOM · UnitCost · AOH (amountonhand) · QtyVar · AmtVar ·
Last Activity · TX Count. (All 14 exist in `rperpetualinv`+`ritems`+the view — nothing new to source.
`Method` is uniform even inside a single-method container, by design — uniform grid over de-duped columns.)
**Rows are SUMMARIZED by cost level + method** — the grain rules are the NEXT thread (owner to teach).
Note the grain interacts with the columns: when a grain nets above branch/loc/lot (e.g., 02 level-1 =
item-wide), those columns show `(multi)`/blank and QOH/AOH sum while UnitCost needs a weighted read — to
be defined in the grid-rules discussion.

**Concept mock (owner 2026-07-09):** "Cost Variance Framework" — 2 navy outer containers (Standard Cost /
Weighted Average Cost), each with Quantity Variance + Amount Variance detail cards. Concept only, not to be
mirrored pixel-for-pixel; the Home cards keep their totals-face + expandable-drawer, wrapped in the 2
containers.

**⚑ CONFIRMED (owner 2026-07-09):** materiality tests **DOLLARS for BOTH cards** (a row is immaterial when
`|AmtVar| < rcompanies.Threshold`; on the Quantity card that's still the row's $ impact, since AmtVar =
qty×cost). **"Reset" = the SYNC itself** — a variance that survives the sync unchanged is REAL. Note
`Threshold` = 1 (int) today, so the bar is $1 — strict; most current NA rows ($2–$178, −$4) stay material.
Per-company, editable on `admin-companies.html`.

**⚑ GRID SUMMARIZATION GRAIN (owner image 2026-07-09) — rows group by (method, cost level):**

| Method | Cost Level | Group-by grain (X = kept) | Collapsed → blank/`(multi)` |
|---|---|---|---|
| 02 WAC | 1 | Item · Branch | Location, Lot |
| 02 WAC | 2 | Item · Branch | Location, Lot |
| 02 WAC | 3 | Item · Branch · Location · Lot | — (full) |
| 07 Std | 1 | Item · Branch · Location · Lot | — (full) |
| 07 Std | 2 | Item · Branch · Location · Lot | — (full) |
| 07 Std | 3 | Item · Branch · Location · Lot | — (full) |

So: **07 (standard) always shows full lot-level detail; 02 (WAC) collapses Location+Lot except at level 3.**
Aggregation on a collapsed row: QOH/AOH/QtyVar/AmtVar **sum**; UnitCost = **weighted (AOH÷QOH)** not a
plain value; TX Count sums; Last Activity = max.

**⚑ ONE DIVERGENCE TO CONFIRM:** this grid grain differs from the shipped `usp6_006b` **netting** grain at
**02 Level 1** — the proc nets 02-L1 **item-wide (across branches)**, but the image keeps **Branch** at
02-L1 (Item · Branch). Likely moot in practice (anything the proc netted to 0 drops out by the $1
materiality gate before display), but confirm the intent: the grid **displays** finer (per-branch) than the
proc **nets** — OK? (09 Actual isn't in the image — treat as full grain like 07 until told otherwise.)

**BUILDABLE NOW (Home side):** with the 02-L1 confirm, the Home 2×2 + drawers are fully specified —
client-side from the warmed cache: filter rows to `|AmtVar| ≥ Threshold`, group by the grain table, render
the 14-col grid. The **sync-page corrective flow** (sync button, survives-sync detection, escalate, the
per-item history store) needs backend (endpoints + `v8_` store → owner VALC/agent rebuild) and comes after.

**⚑ 02-L1 GRAIN — RESOLVED (owner 2026-07-09): leave it.** WAC level-1 is rare (NA: 3 items), and
item-level netting on WAC is harmless. The grid displays per-branch at 02-L1 while the engine nets
item-wide — accepted, no reconciliation needed.

**⚑ COST METHODS — CORRECTED + CONTAINER MODEL REFRAMED (owner 2026-07-09).** The `usp6_006b` comment
mislabels method **09 as "Actual" — it is NOT.** Method **09 = Manufacturing Last Cost** (JDE): for
engineered / made-to-order items; **revalues inventory on each work-order completion** (owner-provided
definition). So 09 is an **average-type (revaluing) method, not standard.**
- **The two containers are really FIXED vs REVALUING, not literally Standard vs WAC.** The distinguishing
  feature is the corrective mechanic: the dollars-only IA on a revaluing method needs the **UDC `40/AV`
  disable→restore dance**; standard (fixed) skips it. So:
  - **Standard / fixed container** = `07`.
  - **Average / revaluing container** = `02` + **`09`** (+ likely `01` Last-In, also revalues). Container
    label TBD — keep "Weighted Average" or broaden to **"Average / Revaluing Cost"** (owner to pick; the
    label should signal which sync mechanic applies).
- **Method coverage rule (owner to confirm):** NA is 100% `02` + **55 `XX`** rows (uncosted/placeholder),
  levels 1 (3 items) & 2 only — **no 07, 09, or level-3 in NA**, so the Standard container + the level-3
  lot grain + any 09 path **cannot be demoed on NA**. Proposed leftover rule: `XX`/zero-cost methods
  **excluded** (nothing to value-adjust); other methods bucketed by "does it revalue?".
- **`[VERIFY]` (not in the `jdesource` extract — F0005/UDC absent; needs live JDE or v359):** (1) does
  method **09 need the `40/AV` dance** like 02 (confirms it shares the average corrective path)? (2) the
  customer's actual `40/CM` descriptions.
- **09 = the MTO items** → cross-links the cardex "revaluing" population to the **DAC-16 make-to-stock /
  MTO work-order** thread (same items, two angles).

**⚑ RESOLVED (owner 2026-07-09/10):**
- **Container label = "Average / Revaluing Cost"** (broadened from "Weighted Average" to honestly hold 02 + 09).
- **Method 09 = "Manufacturing Last Cost" — WEB-VERIFIED against Oracle 9.2 docs** (not CoPilot): manufacturing
  accounting R31802A uses only methods **02, 07, 09**; for 09/actual the system computes cost from actual WO
  hours + parts and "updates the cost based on the most current information" (revalues on WO completion). So
  09 is revaluing/average-like → the Average/Revaluing container. (The `usp6_006b` "Actual" comment and
  CoPilot's "Manufacturing Last Cost" describe the SAME method — both right.)
- **`40/AV` — WEB-VERIFIED**: it's the UDC listing which programs update the unit cost for **average-cost**
  items; toggling **P4114**'s second description `Y`→`N` suppresses the auto-update (that's the dollars-only-IA
  dance; GSI's own blog documents the exact P4114 procedure). **STILL OPEN (unverifiable from public docs,
  MOOT for NA — zero 09 items):** whether **09** is subject to 40/AV. Inference: 09 revalues via WO completion
  (manufacturing accounting), not the average-cost workfile, so it likely does NOT use the 40/AV P4114 dance —
  meaning a 09 item's amount corrective may differ from 02's. Resolve against a customer's live `40/AV` when a
  09-carrying customer appears; don't block the demo on it.

**⚑ XX-METHOD STUDY — RESOLVED (owner asked 2026-07-10): NOT a load bug.** All 55 `XX` rows are
**zero-QOH, zero-variance** (inert — can't surface on a card). 53/55 have F4105 cost rows in `jdesource`, and
**every source cost method is `02`** (155 F4105 rows, all `coledg='02'`). The `XX` arises because at the
**specific branch** RR carries the item there is **no F4105 cost record** (e.g., item 70060 is costed at
branches 2 & 22, not branch 3 where RR lists it). Cost level 2 = cost per item-branch, so an item-branch with
no F4105 row is uncosted → RR faithfully defaults to `XX`. **The item IS a 02 item; the data isn't lost — it's
a JDE branch-level cost gap (stocked/listed at a branch it was never costed at).** **Rule:** exclude `XX`
(uncosted) rows from the containers — treating them as 02 gives the same result (zero cost → zero variance →
never material). Latent data-quality note (owner's domain): these are stocked-but-uncosted item-branch combos —
harmless while zero-QOH, a gap only if one ever gets stock.

**⚑ ANALYST FIRST ACTION = SEE THE CARDEX ROWS (owner 2026-07-10).** From a card-drawer row, the analyst's
first move is to look at the **F4111 cardex movement rows** to trace *where the cost/qty came from* —
especially the tell-tale **zero-unit-cost amount variance** (unit cost 0, AOH $0, qty var 0, yet a non-zero
AmtVar: the cardex rolled value the on-hand valuation doesn't reflect — a stray cost posting / revaluation
/ rounding that only the movement rows explain). The evidence source already exists: the sync page's
cardex-detail drill (`/inventory/as-of/details` = `usp6ItemRollForward` → transactions with
qty/cost/value/running totals). **DESIGN: the drill should LEAD with the cardex rows, not bury them behind
an eye icon.** Open fork (owner to pick): (A) drawer row → sync page that **auto-shows** the cardex
transaction rows on arrival (respects Home=browse / page=investigate; endpoint already wired there);
(B) **inline on Home** — the drawer row expands a second level showing the cardex rows (fastest, zero
navigation, but duplicates the detail fetch on Home); (C) both. Recommend (A).

**⚑ CORRECTION + STAGING APPROACH (owner 2026-07-10): a full reset+reload ZEROES all cardex variance —
pre-staged source edits do NOT survive as variance.** Cardex variance is divergence SINCE the baseline
(`estunits = (qic − baselineqic) − (qoh − baselineqoh)`); a reset re-establishes the baseline = the current
position, so every item ties to zero at reload (my `jdesource` F41021 QOH bumps just bake into
`baselineqoh` → zero variance — cf. item 700500: qoh 60 / qic 9 yet `estunits` 0, because that spread
predates its baseline). **Therefore staging cardex variance belongs POST-LOAD, through the SYNC PAGE:**
Adjust Beginning Balance sets a beginning balance that diverges from the rolled position, creating the
variance in **any** db, after the fact, with no source dependency — and it dogfoods the sync flow we're
building. This **supersedes** the jdesource F41021 pre-staging (now moot; the reload zeroes it). Sequence
for the demo: sanitize + reset + reload → clean Demo2 (zero cardex variance) → stage the demo variances via
the sync page once it's working.

**PAGE DESIGN (owner, cardex teaching) — 3 cards → filtered worklist → per-item Adjust Beginning Balance.**
The cardex page (`RRV8/inventory-cardex-variance.html`) gets a **3-card summary** with the SAME drill wiring
as tx-variance (card → params → filtered worklist below), but a different work grain:
1. **Quantity variance** — cost-method-agnostic (a quantity fix doesn't depend on standard vs. average).
2. **Amount variance — Standard cost (07)** — dollars-only IA, no UDC dance.
3. **Amount variance — Average cost (02)** — dollars-only IA WITH the UDC `40/AV` disable→restore.
- **Quantity-first precedence:** a quantity discrepancy forces an amount discrepancy too (qty off ⇒ amount
  off, unless zero cost), so any row with QtyVar lands in card 1; only quantity-clean rows populate cards
  2/3. Every row in exactly one card (tie-out partition, like tx-variance).
- Each card feeds the existing worklist (Item/Branch/Loc/Method/LVL/QtyVar/AmtVar/QOH/…) scoped by
  (dimension, cost method, company, period); the per-item action is the existing **Adjust Beginning Balance**
  (logged + reversible in the Adjustment Ledger) — the Re-Roll options collapsed behind a **fixed question
  set** (e.g., "Is the beginning balance OK — qty and amount?") the analyst answers after validating JDE.
- **Work grain = per ITEM** (the Adjustment Ledger), NOT per card → cardex needs its **own storage strategy**,
  not the UI-26 card-note store.

**Two open sub-threads (owner to lead):**
- **Noise-vs-real rules** — separate noise (rounding / timing) from real discrepancies, richer than the single
  tolerance floor; decides what even shows on a card. Owner to define.
- **Cardex storage strategy** — the per-item Adjust-Beginning-Balance record (item + branch/loc/lot + dimension
  + cost method + adjust params + who/when + reversible/undo). TBD.
- **Still pending (wraps it):** the Re-Roll-option ↔ question-set mapping (the workflow).

**What it compares:** an item's **position in JDE vs. in RR**. RR is built from JDE, so they
should match. Sources: **F4111** (item ledger / cardex — movement detail) and **F41021**
(item-location — on-hand position).

**Dominant root cause = extract-timing desync (a FALSE variance):**
1. RR extracts F4111 + F41021; if the extract runs **while a transaction is still processing**,
   the two tables are momentarily **out of sync**.
2. RR computes the item's **baseline position** from that inconsistent snapshot → **the discrepancy
   is baked into the baseline.**
3. The **next refresh** syncs JDE's tables; RR's now-current position no longer matches its baked-in
   baseline → a **false cardex variance surfaces.** Timing artifact, not real inventory drift.

**Corrective action (for the false/timing case): RR-INTERNAL — re-roll → reload cardex** (rebuild
the baseline on synced data). NOT a JDE config fix. This is why cardex variance is a **roll-integrity
module**, unlike the JDE order-process modules (MTO / Intercompany).

**Why the tolerance exists:** this timing noise is ever-present → cardex drift is never exactly zero
in steady state → a per-company materiality **tolerance** (the `cxDot` logic), not "flag any variance."

**Real cardex variance persists after a clean re-roll — and has TWO distinct causes (owner 2026-07-07):**
- **Cost changes / revaluations** — quantities tie, VALUE differs (same qty, different cost).
- **System glitch** — a transaction that should update BOTH F4111 and F41021 updates only ONE. This is
  **NOT timing** and does **not self-heal** — JDE's own two tables are permanently inconsistent, so the
  next refresh doesn't sync them and a re-roll doesn't clear it (RR faithfully reflects JDE's bad data).

**Diagnostic (two splits):** (1) **survive a re-roll/reload?** No → **false (timing)**, done. Yes →
**real**. (2) On the real branch — **do quantities/movements tie?** Ledger-sum ≠ on-hand (a movement in
one table, missing in the other) → **system glitch**; quantities tie but value differs → **cost/reval**.
[PROPOSED discriminator — owner to confirm RR doesn't surface the glitch some other way.]

**Analyst decision tree [PROPOSED — owner to confirm the two checks below]:**
1. **Re-roll → reload cardex** (always first). Clears → false/timing, done (recurs often → the only
   source fix is tightening the **extract window** so extracts don't run mid-transaction — an
   extraction/scheduling fix, not per-item). Persists → real → step 2.
2. **Diagnose** on `inventory-cardex-variance.html`: which item; **do quantities tie?** (glitch vs.
   cost/reval); the cost delta + when it changed; and **whether the revaluation posted to GL.**
3. **Dispose** — outcomes by cause:
   - **(a) Legitimate revaluation, already posted to GL** → document as an explained finding
     (Findings panel, UI-15); RR reconciles on refresh. No further action.
   - **(b) Real value gap NOT posted to GL** (revaluation not run/incomplete) → **route to the
     accountant** for a JE (analyst can't post; role split). Finding note carries the cause.
   - **(c) Wrong cost basis** (cost method / level misconfigured) → **source-fix in JDE** so future
     postings are consistent; historical gap routes to the accountant for a one-time true-up.
   - **(d) System glitch (F4111/F41021 mismatch)** → **correct JDE's data** — re-post the missing
     half / run JDE's item-ledger↔on-hand **integrity + repost** so the tables agree; a re-roll only
     helps AFTER that. Escalate if beyond the analyst's JDE access. Interim GL gap → accountant JE,
     but the real fix is the JDE correction so it stops recurring.

**Key nuance:** cardex splits by whether there's an *error* to eliminate. **Errors to fix at source:**
extract-timing (false → re-roll + tighten the extract window) and **system glitch** (correct JDE data /
repost). **Not an error:** a legitimate **revaluation** — value movement to *explain*, and if unposted,
*route to the accountant*. So the Cardex ladder is **diagnose → dispose**, where dispose is
source-fix (timing / glitch) OR explain+route (revaluation) — not a single "fix to prevent recurrence."

**Open checks (owner):** (1) route-to-accountant correct for an unposted revaluation gap (role split)?
(2) is the re-roll/reload — and the JDE re-post/integrity for a glitch — the analyst's call, or does it
go through whoever runs RR maintenance / owns JDE data ([[reference_what_to_rebuild]] — owner runs
rebuilds today)? (3) confirm the **quantity-mismatch vs. value-at-matching-qty** discriminator separates
glitch from revaluation. **Module INCOMPLETE — owner still teaching; more causes/rules likely coming.**

### Cardex flow (owner teaching, in progress) — starting steps

**First step (owner-confirmed):** when someone brings an RR inventory report saying an item balance
"doesn't look correct," **confirm the discrepancy against the source of truth (the item's position in
JDE) before acting.** Forks: RR agrees with JDE → no real variance (reader's expectation off / misread)
→ explain, done; RR disagrees → confirmed variance → diagnostic path. Also rule out **stale refresh**
in that same look (a stale extract can make a balance look wrong).

**Two dimensions of "correct" (owner 2026-07-07):** correctness is **Quantity (units)** AND **Amount
(value)** — independent. States: both right (no variance) · qty right / amount wrong · amount right /
qty wrong · neither right. So the confirm-against-JDE step is **two comparisons** (RR qty vs JDE qty;
RR amount vs JDE amount), read separately — not one "does the balance look right." Which dimension(s)
broke narrows the cause. *(Cause-mapping per combination: owner still to teach — do NOT infer it yet.)*

**HARD GATE — JDE must be confirmed correct before RR alters ANY data (owner 2026-07-07):** RR is built
from JDE (source of truth); syncing RR to a wrong JDE would launder the error. So no RR data change
(re-roll / reload / sync) until the analyst confirms JDE is right. The tool must **GUIDE the analyst
through JDE validation + fixes first**, then — after confirmation — **compare JDE position to RR
position and offer a process to sync RR up to JDE.**

### AUTHORITATIVE flow — sourced from [`RRUniversity/inventory-cardex-variance.html`](../../RRUniversity/inventory-cardex-variance.html)

This RRU walkthrough is the authoritative process; it **supersedes Claude's exploratory guesses above
where they differ** (esp.: validate-JDE-FIRST, not re-roll-first; the manual export/compare method, NOT
the R41543/R41544 integrity programs I guessed). The exploratory notes above stay as background on
causes; the steps below are the real procedure.

> **Refuted by the owner 2026-08-03 — kept here as history, do not act on it.** The R41543/R41544
> guess recorded above later leaked out of these notes into shipped copy: the Completion Not
> Journaled material first, then the Transfer Integrity (IT) corrective action on the 5.19 catalog
> entry, the Home and Transactions card findings, the analyzer's `_transferIntegrityResolution`,
> `usp8_txv_flags` block C, and the classifier design doc. The owner refuted the pairing for
> Completion Not Journaled earlier and for Transfer Integrity on 2026-08-03; both are purged, and
> each of those sites now carries a guard forbidding its reintroduction. This paragraph is the
> provenance record of where the guess came from — that is why it stays.

- **Definition:** a cardex integrity variance = summarized **quantity** or **extended amount** in the
  item ledger (F4111) ≠ the on-hand balance in JDE Item Location (F41021). RR compares summarized F4111
  ↔ F41021 automatically every nightly import (excluding memo txns `ILIPCD="X"`, applying UOM
  conversions, respecting cost level). Surfaces per item as **`QtyVar`** and **`AmtVar`** with a
  **`Reason`** = Quantity or Amount. Causes: rounding over time, manual cost overrides, incorrect
  average-cost calcs, UOM changes. **JDE is system of record; RR only sees history from program-init /
  last reset — Re-Roll syncs RR→JDE, never the reverse.**
- **Step 1 — open the Cardex Integrity pop-up** (RR): read `QtyVar` / `AmtVar` / `Reason`. Both 0 → stop.
  **Investigate quantity before dollars.**
- **Step 2 — validate in JDE (source of truth):** export the item's cardex, exclude memo (`ILIPCD="X"`),
  summarize **Quantity (primary UOM)** + **Extended Amount**, compare to JDE on-hand qty + value.
  → both match JDE = JDE correct, variance is RR-only → **Re-Roll (Step 4)**; → **amount** mismatches =
  true dollar discrepancy in JDE → **Step 3**; → **quantity** mismatches = a quantity issue **NOT covered
  by the guide — investigate separately, may require IT.**
- **Step 3 — dollars-only adjustment in JDE (amount fix):** a dollars-only Inventory Adjustment in
  **P4114** — enter Item / Branch / Location / Lot + **Extended Amount**; leave **Quantity AND Unit Cost
  BLANK** (that's what makes it dollars-only; posts to F4111 + GL). **Average cost (Method 02) only:**
  first disable the P4114 average-cost update via **UDC `40/AV`** (P4114 Description 02 `Y`→`N`), do the
  IA, verify, then **restore `N`→`Y`**. Standard cost (Method 07) skips the UDC dance. Verify the IA shows
  in F4111 with correct amount + zero qty and the GL posted to the right inventory account.
- **Step 4 — sync RR via Re-Roll** (three options, one at a time): **Re-Roll Item** (most common —
  recalcs each period total forward; use after a JDE correction or a UOM change) · **Zero Beg Bal** (force
  earliest period's beginning balance to 0 — only if it should be; recalcs all forward) · **Remove CX Var**
  (clears the displayed variance — only when JDE is confirmed correct and RR shows a phantom; never to
  mask a real JDE issue). **No UNDO — validate JDE first.**
- **Step 5 — confirm after the NEXT REFRESH:** Re-Roll applies to RR internals immediately, but the pop-up
  reflects data as of the last nightly import. **After a JDE correction, RR can't show the fix until the
  next refresh pulls the corrected data (owner 2026-07-07).** Reopen after the refresh; confirm `QtyVar=0`
  and `AmtVar=0`.

**Tolerance (owner 2026-07-07):** cardex variance is **never exactly 0 because of rounding**, so the
analyst must be able to **set an acceptable tolerance per company** (and possibly per item) — below it,
no attention needed; only a crossing is flagged. Current mechanism: `_cardexTol` per company + the
`cxDot` (default 0 = strict). **Wanted: a user-settable tolerance UI** so they set the threshold that
matters. *(Queue this as its own UI item when the module is built — NOT this batch.)*

**Role note to confirm with owner:** the RRU doc says a **cost/inventory accountant** with JDE security
performs the cardex correction (the P4114 IA creates GL entries). Under the V8 role split
([[project_analyst_accountant_role_split]]) this is a **JDE source-fix**, so it reads as the analyst's
(not an RR journal entry) — but confirm, since the doc names an accountant.

## Reconciliation honesty — source-of-truth total vs details total (ALWAYS show the delta)

Owner principle 2026-07-07: whenever the AI message states a "total to resolve," it must show
**both** the source-of-truth total **and** the details total, and be **up front that they won't
match exactly** because of tolerance/netting. Never claim the details "sum back to / tie to" the
source of truth — they're computed from different datasets:

- **Source of truth** — the account roll-forward Variance (`v6ui_raccountsummary`, via
  `_txvRfSeries` / `_invRows`) — the authoritative net variance for the company + period (the
  graph's readout).
- **Details** — the reconciling-items residual (`recstatus=1`, via `_txvRows` / `perRows`) that the
  cards are built from and that "Open in worklist" shows.

The two differ by what was auto-netted or sits within tolerance. So the headline should read like:
*"Source of truth: −$361 (account roll-forward). Actionable detail cards total −$X; the −$Y
difference is within tolerance / netted — not individually actionable."* The current headline
(`renderAnalystTxVar` ~L6994) wrongly says "the cards below break it down and sum back to it (ties to
the graph's total above)" — that assertion is the bug. Applies wherever a source-of-truth total is
decomposed into details (analyst tx-variance first; the same honesty applies to accountant reads).
Pairs with [[feedback_all_signal_no_noise]] — a stated-but-false tie is noise that erodes trust.

## Open questions (owner to resolve as the teaching continues)

- **Cardex variance** — ⚠ **IN PROGRESS, owner still teaching — NOT complete, do not scaffold/build yet.**
  Captured so far (partial): roll-integrity module; F41021 on-hand vs. F4111 rolled baseline; three
  causes so far — false = extract-timing (re-roll clears); real = system glitch (F4111/F41021 qty
  mismatch → correct JDE/repost) OR cost/revaluation (value at matching qty → document/route/config);
  analyst tree = re-roll → (qty-vs-value) diagnose → dispose. More causes/rules + the open checks still
  to come from the owner. See the Cardex section.
- **Reclass** — analyst source-fix or accountant JE? (The one action that could sit on either side.)
