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
