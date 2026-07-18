# CARDEX grounding — curated distilled source (PROPOSAL)

**Status:** PROPOSAL 2026-07-18. Not wired. Candidate liftable source distilled
from `AnalysisGuides/cardex-variance-analysis.md` (corroborates the catalog's
declared source of truth: the analyst's P4111-export-vs-F41021 JDE validation).
Review notes in `docs/plans/analyst-grounding-distillation.md`.

Keeps every current rule (including the trust-boundary "don't auto-classify"
rule) and adds three substantive rules the current catalog omits: the ILIPCD="X"
memo-row exclusion, the cost-level aggregation scope, and the three
Adjust-Beginning-Balance presets. One OPTIONAL tentative root-cause bullet is
written to sit under the trust-boundary hedge.

```grounding
ANALYST POLICY (cardex variance) — reason from these rules:
- DEFINITION: cardex variance = the item ledger (F4111) does not sum to the on-hand balance (F41021) for one item. QUANTITY variance = the sum of F4111 primary-UoM quantity does NOT equal the F41021 Quantity On Hand. AMOUNT variance = the sum of F4111 extended cost does NOT equal the F41021 on-hand Value. Nothing else is cardex variance. It is inventory-internal, NOT the ledger-vs-GL gap (that is transaction variance).
- STEP 1 IS ALWAYS THE JDE VALIDATION. The analyst opens Work With Item Ledger (P4111) in JDE, exports the grid, EXCLUDES memo rows (ILIPCD = "X" — work-order scrap, lot releases, certain warehouse moves; they do not affect on-hand), and checks that the remaining F4111 primary quantity sums to the header Quantity On Hand and the extended cost sums to the header Value. Anything wrong in JDE is corrected in JDE FIRST. RR cannot verify JDE — it TRUSTS the analyst did this. Never imply RR confirmed JDE.
- USE THE RIGHT AGGREGATION SCOPE: cost-level 1 and 2 items reconcile at branch/item (all locations and lots summed together); cost-level 3 items reconcile per location and lot. Comparing at the wrong grain manufactures a false variance.
- THE REMEDY FORK, decided by that validation, not by RR: (a) if JDE itself is out of balance (F4111 does not sum to F41021 in JDE), the variance is REAL — fix it at the source in JDE. The common real case is F41021 not updating for one or more cardex transactions (a system glitch that needs IT). An RR adjustment is at best a stopgap. (b) If JDE ties but RR still shows a variance, RR's load/roll is the artifact (e.g. F4111 and F41021 captured out of sync during a live load) — sync RR to the JDE figure with the in-place, reversible Adjust Beginning Balance.
- ADJUST BEGINNING BALANCE has three presets: Clear to JDE (sets the opening so the variance nets to zero — use when JDE is confirmed correct and the variance is an RR-only artifact), Zero opening (opening qty and amount set to 0), and Manual (type the known-correct opening qty and amount — use after a JDE correction or a UOM change). Every adjustment is logged and reversible from the Adjustment ledger.
- DO NOT auto-classify a real glitch vs load-timing noise from RR data. Both can persist (especially from the initial baseline perpetual build), and RR cannot see live JDE, so a heuristic would only guess. Surface the variance and the two sums (F4111 total vs F41021 on-hand); let the analyst's JDE validation determine the cause. Name a LIKELY cause tentatively if asked, never as a verdict.
- OPTIONAL (tentative only, never a verdict): dollar-only variances usually trace to WAC escalation after a higher-cost receipt or revaluation, an IK kit received at a BOM cost off the prevailing WAC, or a period-end PI revaluation posted after the stock was depleted; quantity variances usually trace to an IA that posted to F4111 but did not update F41021, or a gap embedded in the back-calculated beginning balance at go-live.
- Quantity first: when units are off, lead with the quantity — the dollars usually follow at cost. Amount-only (units tie, value off) points at cost/valuation, not counting.
- Cardex variance CANNOT be journaled — people try. It is analyst / operations work: fix the data at the source in JDE, or apply the in-place reversible sync once JDE is validated. The accountant's journal entry never touches it.
- Audience is a JDE-fluent analyst: F4111, F41021, P4111, ILIPCD, UOM, cost method / level are fine; no SQL or plumbing terms.
```

**Preserved:** all current bullets, including the trust-boundary rule.
**New:** ILIPCD="X" exclusion (folded into Step 1), cost-level scope, the three
presets, and the OPTIONAL tentative root-cause bullet.
