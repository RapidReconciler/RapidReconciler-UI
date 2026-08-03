# ROLLFORWARD grounding — curated MERGED source (PROPOSAL)  ⚠

**Status:** PROPOSAL 2026-07-18. Not wired. **This topic cannot be generated from
its guide alone** — see the disagreement analysis in
`docs/plans/analyst-grounding-distillation.md` §4. The current catalog is grounded
in the RRV8 assistant page's corrective levers (R099102 repost in JDE, then Reload
GL in RR — guidance on the order, not a checkpoint RR verifies), which
`AnalysisGuides/inv-account-roll-forward-analysis.md` never names. The guide adds
diagnostic depth the catalog lacks. This block MERGES both: it keeps the RR-UI
levers + GL-precedence and folds in the guide's refinements (batch-post
self-corrects without R099102; end-period OOB and reset artifacts are expected;
aged variance breaks self-correct on refresh and escalate to IT if they persist;
data-load breaks → reimport).

If ROLLFORWARD is ever generated, its source must be THIS curated merged section,
not the guide. Alternatively keep it permanently hand-authored — it is the topic
least suited to mechanical extraction.

```grounding
ROLL-FORWARD POLICY (account roll-forward) — reason from these rules:
- The account roll-forward keeps the inventory source-of-truth accurate period over period. A break is either GL-side (the GL roll-forward does not tie, GLOK=no) or variance-side (the cardex-to-GL variance roll-forward does not tie, VarOK=no).
- Corrective levers exist only on the GL side: R099102 repost in JDE, then Reload GL in RR (Reload GL re-imports F0902 into RR). The variance side has NO manual lever — RR recomputes the full period timeline on every refresh, so a variance that failed to carry forward clears on the next run. Never prescribe a re-roll (retired — the recompute made it obsolete) or Reload Cardex (a standalone cardex data-integrity utility, not a roll-forward corrective) for a variance.
- ALWAYS fix GL-side breaks before variance-side — a GL break feeds the variance, so posting the repost and reloading the GL usually squares the variance too.
- GL-side breaks split by cause: (a) a late-posting batch (the prior period had an unposted batch that later posted) self-corrects once the batch is posted in JDE and RR re-imports — Reload GL, no R099102 needed; (b) an F0902/F0911 misalignment (all batches posted, gap remains) needs R099102 in JDE first, then Reload GL. Use R099102 only when a batch does not explain the gap.
- End-period (current-period) out-of-balance is EXPECTED while a period is open — do not chase it. Only a non-zero OOB in a closed historical period is a real break. Likewise, a VarOK break next to a reset timestamp is an expected reset artifact, not an error.
- Aged variance breaks (more than ~3 periods old) are usually stale roll-forward math, not bad data: age no longer puts a break out of reach, because the recompute rebuilds every period, not just the recent few. Refresh and re-run the report and the aged break resolves itself. Only if the same break survives a refresh is it real — and no self-service step will clear it, so it goes to the customer's IT department to investigate.
- Consecutive GLOK breaks on one account with no GL activity but a shifting beginning balance are a RapidReconciler data-load problem, not a JDE issue — neither a batch post nor R099102 will clear it. It needs RR's F0902/F0911 data reloaded, which goes to the customer's IT department to arrange.
- This is analyst / operations maintenance, never a journal entry: the accountant does not journal a roll-forward break.
- Audience is a JDE-fluent finance analyst: answer in 2-4 sentences, plain finance language; standard JDE program references (R099102, R09801, P0011) are fine; no SQL, endpoint, or table terms.
```

**Sync obligation:** if this ships, keep it aligned with the two live copies of the
same policy — `RRV8/config.js` (`ROLLFORWARD_GROUNDING`, the source the page reads)
and the inline fallback string in `RRV8/inventory-account-rollforward.html`
(`triggerTodoAi`). Both already carry the corrected ladder (GL-side repost then
Reload GL; no manual variance lever; escalate a surviving variance to IT). Do not
restore the retired four-lever text into either one.
