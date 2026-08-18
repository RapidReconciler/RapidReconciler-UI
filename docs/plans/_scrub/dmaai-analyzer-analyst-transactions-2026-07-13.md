# DMAAI analyzer — analyst Transaction Details

**Design for sign-off · 2026-07-13 · owner-designed · held (references demo specimens).**
**Page:** `RRV8/inventory-transactions.html` (the txv drill-down). **Replaces** the two
launch-gated AI cards with one analyzer.

## Why

The analyst's job is to **prevent recurrence at the source, not build journal
entries** (role split — JEs are the accountant's, on their page). The current
Transaction Details page violates that: it leads with a **"Suggested Entry"**
correcting-JE builder (`#tx-je-launch`, ~L2868/6289-6462). That's accountant work
on the analyst's surface, and it teaches the wrong mental model — the whole point
of the analyst view is to **eliminate the *need* for a manual entry**
([[project_analyst_view_demo_wow]]), not draft one.

Beside it sits **"Recurrence Prevention"** (`#tx-recur-launch`) — right intent
("DMAAI setup, overrides…") but delivered as a generic AI narrative, not grounded
in the rows on screen.

For the dominant variance patterns this session surfaced — the 4152-vs-4240
**account mismatch** (doc 1125744) and the **non-stock-to-inventory routing**
(doc 1125513) — **the source fix *is* a DMAAI change.** So a data-grounded DMAAI
analyzer over the drilled grid is the analyst's actual tool. It replaces both
cards with one.

## What changes

- **Remove** `#tx-je-launch` (Suggested Entry / correcting JE) entirely — with its
  Full-tier builder logic (`_txAi*` JE path, ~L6381-6462).
- **Replace** `#tx-recur-launch` (Recurrence Prevention) with the DMAAI analyzer.
- **Keep** the Findings box (`#tx-findings-note`) + Save-findings flow unchanged —
  the analyzer's diagnosis pushes into it, same as the old cards did (just a DMAAI
  fix now, not a JE draft). Update its placeholder (drop "Suggested Entry").
- Header identity strip (`Database · Company · Period · Card`) stays — it already
  gives the page the self-identifying header we're adding to cards.

## The analyzer — grounded over the drilled grid, not a narrative

**Input:** the drilled group's rows (the same company/period/card rows the grid
below shows — e.g. Co 80002 · Jul 2025 · Make to Order · 271 rows).

**Resolve, per distinct account the group touches** (reuse the existing DMAAI
resolution — `accounting-dmaais.html` / the export workbook's DMAAIs tab / the
`/inventory/integrity/dmaai` overlay + `data/dmaai-analysis-latest.json`; do NOT
reinvent the AAI lookup):
- the cardex-side inventory account via the **4152** inventory-model AAI (object + BU);
- the GL-side account(s) actually posted via **4240 / 4220 / 4230 / 4141**;
- flag **object-level** and **BU-level** mismatches — exactly the workbook's
  "Model Account / Inv Account / Exp Account + *Mismatch - object* / *Mismatch - BU*"
  output, brought live into the app.

**Output — two states, card-type aware:**

1. **Mismatch found (DMAAI-driven card).** LEAD with the diagnosis and the fix:
   > *"Cardex relieves the 4152 model account (obj 147272); the GL posts inventory
   > to 4240 (obj 512498) — an object mismatch driving $X across N rows. Fix: align
   > the 4152/4240 AAI for GL class SWIT so both post to the same account."*
   This is the source fix that stops the recurrence — no JE needed.

2. **No mismatch (timing / pairing card — e.g. MTO, Transfers).** Say so plainly:
   > *"Accounts resolve cleanly — this is WIP-to-fulfillment timing, not a mapping
   > issue. It clears as the order completes; investigate only the ones that persist
   > across periods."*
   Do not send the analyst chasing a config ghost.

**Always resolve, adapt the lead.** The DMAAI resolution runs on every card (it's
account-level truth); only the *lead* changes on whether a mismatch exists. Bonus:
this **cross-checks the classifier** — if a card labeled MTO/timing is hiding a
real mismatch, the analyzer surfaces it (catching exactly the leakage AN-1 found,
where account mismatches sat in "Unclassified").

## AI tier behavior

- **The mismatch resolution is a fact, not an AI opinion — show it at ALL tiers.**
  It's an AAI lookup + comparison, deterministic. This replaces the current
  "needs the Full AI tier" gate on the JE/recurrence cards (that gate made the
  analyst's core tool unavailable at lower tiers — wrong).
- **Full tier adds narration:** plain-analyst-English explanation of the mismatch
  and the fix, grounded in the resolved facts (via `DMAAI_GROUNDING`). Grounded >
  narrative — the narration can't disagree with the resolution
  ([[reference_f4111_pc_field_not_gl]] lesson).

## Findings + Audit (unchanged loop)

The analyzer's diagnosis → "push to findings" (like the old cards) → Save findings
→ `cardStore` (worked → the Home card's source-fix → Audit Center). Same
finding→card→Audit spine; only *what's pushed* changes (a DMAAI source fix, not a
JE draft). Dovetails with the Pass-2 Audit-Center work (the source-fix outcome).

## Ties to

- **Pattern catalog** ([[feedback_analytical_knowledge_one_source]]): this is the
  **analyzer-consumer** of the account-mismatch / non-stock entries — the same rule
  the classifier card (DAC-28) and the grounding use. One rule, three surfaces.
- **project_analyst_view_demo_wow**: "eliminate the need for manual entries" — this
  is the literal mechanism.
- **accounting-dmaais.html / accounting-model-review.html**: reuse the resolution +
  the model (4152) definition; the analyzer is the per-group, analyst-facing view of
  the same data the accountant approves wholesale.

## Card redesign — Home analyst txv cards (parity with the accountant card)

The Home Transaction-Variance cards read plain next to the accountant Overview
card. They're the *summary*; the details page (this analyzer) is the *drill* — same
DMAAI substance, two depths. Redesign the card to the accountant card's design
system (`project_scope_band_standard` — navy accent, label 12.5px / value 19px,
pad 18/24, shared color tokens + chip styles) so the two read as one product, and
give it real substance (the compact diagnosis) so the polish isn't lipstick.

**Card layout, top → bottom:**

1. **Header strip (scope-band):** `Co 80002 · Summit Industrial · Jul 2025` (left,
   muted — the Pass-1 self-identifying header). Right: the resolution status chip
   in the shared style — `✓ Source fixed` / `Reviewed` / `Finding drafted` / (none
   at rest) — matching the accountant card's `✓ Corrected` chip.
2. **Title row:** pattern name (Make to Order) + type tag (LINKED PAIR / MTO / …),
   accent-colored by tier. The card's identity.
3. **Financial summary strip — parity with `GL Balance · Inventory · Out`:**
   `Variance · Cardex · Ledger · Rows`, scope-band label/value sizing, the Variance
   colored + drilling (arrow) into this analyzer. Scannable money, not one lonely
   amount.
4. **Diagnosis hero line — the wow (compact form of the analyzer):** a colored
   diagnostic strip, not a gray cause sentence. Mismatch → `cardex → 4152 model
   (147272) · GL → 4240 (512498) · object mismatch` (orange, fix teased);
   accounts-agree → `accounts agree — duplicate cardex relief` / `order-lifecycle
   timing` (neutral/green). This is the line no other tool shows.
5. **Decomposition pills — parity with `Carry-forward · Transactions · Manual
   entries`:** break the variance by its meaningful axis (by account / DMAAI item /
   sub-pattern), each a drill pill with amount + arrow, summing back to the
   Variance. Collapses to nothing on a clean single-account card (no noise).
6. **Recurrence evidence:** the existing N/6 sparkline/chip (chronic vs one-off) —
   kept, restyled consistent. The "worth fixing?" signal.
7. **Footer (today's state-driven cleanup):** at rest = `Investigate →` (drills to
   the full analyzer) + the resolution action (`Reopen to edit` / `Mark resolved`);
   editing = inline editor + `Cancel` / `Save & mark resolved`.

**Reading order = the wow:** identity → money → **diagnosis** → decomposition →
recurrence → action. Rich, scannable, drillable — the accountant card's depth, in
the analyst's language.

**Card ↔ analyzer relationship:** the card shows the *compact* diagnosis (one
line, from the same `v8ui_dmaai_resolve` view); `Investigate →` drills to
`inventory-transactions.html` where the *full* analyzer runs (per-account
resolution, every mismatch, the fix copy). Build them together — the card's richer
layout exists to hold the analyzer's content, so styling-then-restyling is wasted
work.

## Open questions (for the owner)

- **Data source — RESOLVED 2026-07-13 (owner hint + verify): the normalized RR
  accounting-instruction tables, via a view — NOT the 6 MB JSON universe.**
  `RDMAAIStaging` holds the AAIs normalized: `(TableNumber [4152/4240/4220/4230/4141],
  company, doctype, ordertype, GLClass, costtype) → businessunit·object·subsidiary`
  (rebuilt each B→C by `usp6_002b_aai_staging`). **`v6_003_expanded_aais` already
  joins `RDMAAIStaging` + `rcompanies` (+ `f0901` for names) and resolves each AAI
  item to its account** — verified: Co 80002's 4152 model resolves by GL class
  (ASGB→147272, BUYP→141818, COLC→140909). The resolver = read the **4152** model
  account and the **4240** GL account for the drilled row's (company, GLClass,
  doctype) and compare; mismatch = the diagnosis.
  - **Build a thin purpose-view `v8ui_dmaai_resolve`** on top of
    `v6_003_expanded_aais` that PIVOTS the AAI items (4152 vs 4240 side-by-side per
    company/GLClass/doctype) + pre-flags the mismatch, so the analyzer reads the
    answer instead of self-joining client-side. (DB work — pairs with DAC-28.)
  - **Preload cost is now trivial** (hundreds of rows for the company, not 6 MB) —
    cache the company's resolution on analyst-view entry, or query scoped per drill.
    The 6 MB `v-integrity-jde-aais.json` was a dev sidecar; the view is the prod path
    (via the agent, scoped). Supersedes the earlier "warm the 6 MB universe" plan.
- **Config-fix copy per mismatch type — DRAFTED 2026-07-13 (owner curates the SME wording).** Data fills the `<…>` slots from the resolved rows:
  - **BU mismatch:** "The cardex relieves inventory to business unit `<model-BU>`, but the GL posts to business unit `<gl-BU>` for GL class `<glc>`. Point the 4152 and 4240 AAIs at the same business unit so the cardex and GL land together — then it stops at the source."
  - **Object mismatch:** "The cardex relieves the 4152 model account (object `<obj-A>`), but the GL posts inventory to the 4240 account (object `<obj-B>`) for GL class `<glc>`. Align the object on one of the two AAIs so both resolve to the same account."
  - **Non-stock routing:** "This is a non-stock line (type N) whose GL value posted to an inventory account. Non-stock lines move no inventory, so they belong on a P&L / clearing account — correct the line-type / AAI routing so future non-stock lines post off inventory."
  - **Accounts agree (no mapping issue):** "The cardex and GL resolve to the same account — not a mapping problem. `<if dup-sales flagged:>` It's a duplicated cardex relief; reverse the double-write at the source. `<else:>` It's `<order-lifecycle timing / transfer pairing>` that clears as the order completes — investigate only what persists across periods."
- **"Escalate to Oracle" — DROPPED (owner 2026-07-13).** No escalation affordance on the analyzer.
