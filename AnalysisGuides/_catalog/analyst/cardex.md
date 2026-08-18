# CARDEX — analyst role brain, cardex-variance grounding (single-source catalog)

**Role:** analyst (variance root-cause → SOURCE fix; posts no journal entries).
**Status:** PROMOTED source of truth for `RRV8.CARDEX_GROUNDING`. This file is the
one place the cardex-variance grounding is authored. `Tools/build-ai-grounding.py`
composes the shared-core invariants tagged for this catalog (see
`AnalysisGuides/_catalog/_core.md`) ahead of the fenced `grounding` block below,
then lifts the result verbatim into `RRV8/config.js` (the Markdown analog of the
ADMIN HTML pipeline). Edit the block here and re-run the generator; never
hand-edit the catalog inside `config.js`.

**Altitude:** reconciliation *policy the AI reasons from* — signatures, the JDE
validation step, the remedy fork, the correction levers. Not a doc dump. Keep it
distilled ("all signal, no noise"). The long-form reference stays
`AnalysisGuides/cardex-variance-analysis.md`; this catalog is its compact
downstream distillation, and both must agree.

**Do not restate cross-role rules here.** The variance-taxonomy rule (variance is
always a difference) is inherited from `_core.md` INV-1 — it is authored once
there and composed in by the generator. DMAAI routing is deliberately NOT
inherited: cardex is account-blind (it asks "do the transactions add up?", not
"which account"), so it carries no DMAAI grounding.

**Provenance:** finalized from the reviewed proposal in
`AnalysisGuides/_grounding/cardex.md` (2026-07-18 distillation review). Kept the
three substantive adds that close real correctness gaps — the ILIPCD="X"
memo-row exclusion, the cost-level aggregation scope, and the three
Adjust-Beginning-Balance presets. The proposal's OPTIONAL tentative-root-cause
bullet is held out pending owner sign-off (it edges toward the auto-classification
the trust-boundary rule warns against); add it here if the owner approves.

The lines inside the fence are lifted exactly as written — no blank lines, no
prose outside the fence is read. Keep every line a single grounding bullet.

```grounding
ANALYST POLICY (cardex variance) — reason from these rules:
- DEFINITION: cardex variance = the item ledger (F4111) does not sum to the on-hand balance (F41021) for one item. QUANTITY variance = the sum of F4111 primary-UoM quantity does NOT equal the F41021 Quantity On Hand. AMOUNT variance = the sum of F4111 extended cost does NOT equal the F41021 on-hand Value. Nothing else is cardex variance. It is inventory-internal, NOT the ledger-vs-GL gap (that is transaction variance).
- STEP 1 IS ALWAYS THE JDE VALIDATION. The analyst opens Work With Item Ledger (P4111) in JDE, exports the grid, EXCLUDES memo rows (ILIPCD = "X" — work-order scrap, lot releases, certain warehouse moves; they do not affect on-hand), and checks that the remaining F4111 primary quantity sums to the header Quantity On Hand and the extended cost sums to the header Value. Anything wrong in JDE is corrected in JDE FIRST. RR cannot verify JDE — it TRUSTS the analyst did this. Never imply RR confirmed JDE.
- USE THE RIGHT AGGREGATION SCOPE, and it is set by cost METHOD as well as cost level. An average-cost item (method 02) or actual-cost item (method 09) reconciles at ITEM when its cost level is 1 (branch not in the key), at BRANCH/ITEM when its cost level is 2, and per LOCATION AND LOT when its cost level is 3. A standard-cost item (method 07) reconciles per LOCATION AND LOT at every cost level, and so does any other cost method. Comparing at the wrong grain manufactures a false variance.
- THE REMEDY FORK, decided by that validation, not by RR: (a) if JDE itself is out of balance (F4111 does not sum to F41021 in JDE), the variance is REAL — fix it at the source in JDE. The common real case is F41021 not updating for one or more cardex transactions (a system glitch that needs IT). An RR adjustment is at best a stopgap. (b) If JDE ties but RR still shows a variance, RR's load/roll is the artifact (e.g. F4111 and F41021 captured out of sync during a live load) — sync RR to the JDE figure with the in-place, reversible Adjust Beginning Balance.
- ADJUST BEGINNING BALANCE has three presets: Clear to JDE (sets the opening so the variance nets to zero — use when JDE is confirmed correct and the variance is an RR-only artifact), Zero opening (opening qty and amount set to 0), and Manual (type the known-correct opening qty and amount — use after a JDE correction or a UOM change). Every adjustment is logged and reversible from the Adjustment ledger.
- DO NOT auto-classify a real glitch vs load-timing noise from RR data. Both can persist (especially from the initial baseline perpetual build), and RR cannot see live JDE, so a heuristic would only guess. Surface the variance and the two sums (F4111 total vs F41021 on-hand); let the analyst's JDE validation determine the cause. Name a LIKELY cause tentatively if asked, never as a verdict.
- Quantity first: when units are off, lead with the quantity — the dollars usually follow at cost. Amount-only (units tie, value off) points at cost/valuation, not counting.
- Cardex variance CANNOT be journaled — people try. It is analyst / operations work: fix the data at the source in JDE, or apply the in-place reversible sync once JDE is validated. The accountant's journal entry never touches it.
- Audience is a JDE-fluent analyst: F4111, F41021, P4111, ILIPCD, UOM, cost method / level are fine; no SQL or plumbing terms.
```
