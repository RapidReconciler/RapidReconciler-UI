# ROLLFORWARD grounding — curated MERGED source (PROPOSAL)  ⚠

**Status:** PROPOSAL 2026-07-18. Not wired. **This topic cannot be generated from
its guide alone** — see the disagreement analysis in
`docs/plans/analyst-grounding-distillation.md` §4. The current catalog is grounded
in the RRV8 assistant page's corrective levers (Reload GL, Reload Cardex, Re-roll,
R099102-attest gate — all real UI actions), which
`AnalysisGuides/inv-account-roll-forward-analysis.md` never names. The guide adds
diagnostic depth the catalog lacks. This block MERGES both: it keeps the RR-UI
levers + GL-precedence and folds in the guide's refinements (batch-post
self-corrects without R099102; end-period OOB and reset artifacts are expected;
aged breaks → re-roll; data-load breaks → GSI reimport).

If ROLLFORWARD is ever generated, its source must be THIS curated merged section,
not the guide. Alternatively keep it permanently hand-authored — it is the topic
least suited to mechanical extraction.

```grounding
ROLL-FORWARD POLICY (account roll-forward) — reason from these rules:
- The account roll-forward keeps the inventory source-of-truth accurate period over period. A break is either GL-side (the GL roll-forward does not tie, GLOK=no) or variance-side (the cardex-to-GL variance roll-forward does not tie, VarOK=no).
- Four corrective levers, grouped by side: R099102 repost and Reload GL fix GL-side breaks; Re-roll companies then Reload Cardex fix variance-side breaks. Reload GL re-imports F0902 into RR; Reload Cardex rebuilds the cardex from the break period (use only if a re-roll did not hold).
- ALWAYS fix GL-side breaks before variance-side — a GL break feeds the variance, so clearing GL first often clears the variance without a re-roll.
- GL-side breaks split by cause: (a) a late-posting batch (the prior period had an unposted batch that later posted) self-corrects once the batch is posted in JDE and RR re-imports — Reload GL, no R099102 needed; (b) an F0902/F0911 misalignment (all batches posted, gap remains) needs R099102 in JDE first, then Reload GL. Use R099102 only when a batch does not explain the gap.
- End-period (current-period) out-of-balance is EXPECTED while a period is open — do not chase it. Only a non-zero OOB in a closed historical period is a real break. Likewise, a VarOK break next to a reset timestamp is an expected reset artifact, not an error.
- Aged variance breaks (more than ~3 periods old) will not self-correct — Re-roll the affected companies, then Reload Cardex if the re-roll does not hold.
- Consecutive GLOK breaks on one account with no GL activity but a shifting beginning balance are a RapidReconciler data-load problem, not a JDE issue — the fix is a GSI-assisted F0902/F0911 reimport, not a batch post or R099102.
- This is analyst / operations maintenance, never a journal entry: the accountant does not journal a roll-forward break.
- Audience is a JDE-fluent finance analyst: answer in 2-4 sentences, plain finance language; standard JDE program references (R099102, R09801, P0011) are fine; no SQL, endpoint, or table terms.
```

**Sync obligation:** if this ships, update the inline fallback string in
`RRV8/inventory-account-rollforward.html` (`triggerTodoAi`) to match — it currently
mirrors the old four-lever text and would otherwise drift.
