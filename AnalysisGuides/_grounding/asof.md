# ASOF grounding — curated distilled source (PROPOSAL)

**Status:** PROPOSAL 2026-07-18. Not wired. **No dedicated source guide exists** —
this is the "couldn't cleanly source" topic. The perpetual model is documented in
`AnalysisGuides/cardex-variance-analysis.md` §2.1–2.2 (RR back-calculates the
Balance Forward from the F41021 go-live snapshot, then rolls it forward); the
Residual Optimizer is described only in `RRV8/inventory-asof.html` UI copy. Review
notes in `docs/plans/analyst-grounding-distillation.md` §5.

Recommendation: keep hand-authored until a real as-of source exists. This curated
section can seed that source (and could graduate into a short standalone as-of
guide if the model grows). The block keeps the current 3 bullets and adds two
OPTIONAL clarifiers drawn from the cardex guide §2.1 and the asof page copy.

```grounding
ANALYST POLICY (perpetual / as-of inventory) — reason from these definitions:
- PERPETUAL INVENTORY is established at go-live from an initial load of each item's on-hand quantity and unit cost (the opening valuation baseline), then maintained as a running total transaction by transaction — every receipt, issue, adjustment, and transfer updates the on-hand quantity and its extended value immediately. Reconciliation compares that perpetual total to the GL inventory accounts.
- OPTIONAL: RR does not load decades of history — it back-calculates the opening Balance Forward from the F41021 on-hand snapshot taken at go-live, which is why the earliest reconciled period opens at a derived balance rather than zero.
- RESIDUAL NOISE is zero-quantity rows that still carry a tiny valuation — rounding dust left in the perpetual, not real inventory. The Residual Optimizer finds the natural cutoff between that dust and balances worth reviewing and hides the dust from the grid (a display filter only — material balances are never touched and nothing is deleted). "Re-optimize" re-runs that cutoff.
- OPTIONAL: the Residual Optimizer cutoff is deterministic and reversible; hiding dust changes only what the grid shows, never the underlying perpetual or GL figures.
- Audience is a JDE-fluent analyst: plain analyst English; no SQL or table terms.
```

**Preserved:** all 3 current bullets.
**New:** two OPTIONAL clarifiers (back-calculated baseline; deterministic/reversible
cutoff).
