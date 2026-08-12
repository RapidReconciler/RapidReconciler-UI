# AN-1 residual survey: unclassified reconciliation residual across the 3 demo DBs

Read-only survey run 2026-07-17 against `localhost,1433` (SQL auth `rruser`). No
writes, no classifier changes, no schema changes. Scope: rows in
`RCardexLedgerCompare2` with `recstatus = 1` and a blank `SubType`. These are the
terminal residual (Phase 3 cards 7-10 in `usp8_txv_classify`): rows that got a
`Type` from Phase 0 but no named `SubType` from any Phase 1-2 rule, so the UI
files them under the generic Inventory / Sales / Purchasing / Mfg buckets.

## Summary

| DB | Unclassified rows | Net $ | Abs $ | Nameable (abs $) | Genuinely unclassifiable (abs $) | Top clusters |
|---|---|---|---|---|---|---|
| Demo1 | 1,380 | +304,362.74 | 700,457.46 | ~99% | ~0.1% | Mfg cost mismatch (both-differ WO), Sales shipment-not-journaled (cardex-only RI) |
| Demo2 | 202 | +127,740.16 | 620,433.26 | ~99% | ~0% | Mfg not-journaled (cardex-only IB/IM), Inventory adjustment (cardex-only II), Purchasing variance (OV) |
| Demo3 | 1,860 | -11,277,887.83 | 11,483,135.77 | ~98% by $ | ~1% by $ | Decimal-scaling artifact (cardex = 100x GL), long tail of sub-$20 sales rows |

Two cautions on the table before anyone acts on it:

- "Nameable" means the cluster has a clear shape and a defined corrective action,
  not that a JE is owed. Several of the biggest clusters are fixed at source
  (repost via R31802A, re-mine decimals, re-roll cardex), not with a journal
  entry.

  > SUPERSEDED 2026-08-03: "repost via R31802A" is a fabrication and has since
  > been removed from the classifier, the analyst guide, the AI grounding, the UI
  > copy and the analyzer engine. There is no repost. A completion reaches F4111
  > with no batch number and no G/L date, and R31802A stamps the batch and writes
  > the F0911 journal entries in the same step, so a batch on the row means the
  > program already ran. The same run resets Unaccounted Units, which are what
  > drive its selection, so it cannot pick the transaction up a second time. The
  > rest of the bullet stands: the source-fix-not-a-JE point holds, and re-mine
  > decimals and re-roll cardex are unaffected. Current text: usp8_txv_flags
  > block "-- D." and AnalysisGuides/manufacturing-accounting-flow.md.
- Demo3's 11.5M abs is misleading. About 96% of it is a single data defect (a
  100x decimal-scaling mismatch), not 1,860 pieces of analyst work. See the Demo3
  section. Treat that number as "one config fix worth 11M," not "11M of residual
  to work."

## How the current classifier leaves rows blank

`usp8_txv_flags` (Phase 2) is the extension point. It already claims five named
patterns by stamping a `SubType`, each guarded on `recstatus < 2 AND isnull(SubType,'') = ''`:

- Duplicate Sales (matches `RDuplicateSales` on company/order/type/period)
- Vouchers (`BatchType = 'V'` on an inventory account)
- Transfer Integrity (`DocType = 'IT'`, cardex-only)
- Completion Not Journaled / CNJ (Mfg `IC`, cardex-only, WO has GL issues `IM` but no GL completion `IC`)

Everything the group / net / account / period / flags passes leave untouched
falls to `usp8_txv_terminal`, which flips `recstatus` to 1 and stops. That is the
population surveyed here. A new rule is one more `UPDATE` in `usp8_txv_flags` with
the same unclaimed-SubType guard.

---

## Demo1 (1,380 rows, 700,457.46 abs)

Shape by Type (`GL-only` = ledger moved, cardex flat; `cardex-only` = cardex moved,
ledger flat; `both-differ` = both moved, amounts disagree):

| Type | Shape | Rows | Net $ | Abs $ |
|---|---|---|---|---|
| Mfg | both-differ | 716 | 52,962.22 | 381,820.32 |
| Sales | cardex-only | 134 | 241,516.11 | 241,516.11 |
| Mfg | GL-only | 299 | 20,820.47 | 24,754.23 |
| Mfg | cardex-only | 67 | -24,673.17 | 27,685.07 |
| Sales | GL-only | 158 | 14,548.57 | 23,858.23 |
| Purchasing | cardex-only | 2 | -715.79 | 715.79 |
| Sales | both-differ | 3 | -101.69 | 101.69 |
| Purchasing | both-differ | 1 | 6.02 | 6.02 |

Clusters and candidate actions:

- **Mfg cost mismatch (both-differ, WO, IC/IM).** 716 rows, 381,820 abs. The
  document posted to both the cardex and the GL for a work order, but the amounts
  disagree. This is the analyzer's existing pattern 5.16 (Mfg Cost Mismatch),
  which has a UI diagnosis but no classifier `SubType`, so every one of these
  rows lands in the generic Mfg bucket. Corrective action: investigate standard
  versus actual completion cost and repost via R31802A. Nameable. This is the
  single largest reclaim in Demo1 at 54.5% of abs $.

  > SUPERSEDED 2026-08-03: strike "and repost via R31802A" from the corrective
  > action. Investigating standard versus actual completion cost still stands;
  > the repost does not exist. A batch on the cardex row means R31802A already
  > stamped it and wrote the F0911 entries in the same step, and that same run
  > cleared the unaccounted units its selection depends on, so it cannot
  > reprocess the transaction. See usp8_txv_flags block "-- D." for the current
  > reasoning.
- **Sales shipment not journaled (cardex-only, RI).** 134 rows, 241,516 abs.
  Inventory was relieved on the cardex (RI, batchtype IB) with no GL leg. Order
  types span SI, CW, CO, C2. This is the sales-side mirror of CNJ: the shipment
  hit the cardex but the COGS/relief journal never posted. Corrective action:
  post the missing sales-update journal (R42800 family). Nameable. 34.5% of abs $.
- **Mfg completion in GL not in cardex (GL-only IC, WO).** 299 rows, 24,754 abs.
  The reverse of CNJ: the completion journaled to the GL but the cardex never got
  the finished-goods receipt. Corrective action: Re-roll then Reload Cardex.
  Nameable, lower dollars.
- **Sales returns not relieved (GL-only RM credit memos).** 158 rows, 23,858 abs.
  A credit memo posted to the GL with no matching cardex relief. Nameable.
- **Mfg cardex-only IC with a GL IC that exists elsewhere.** 45 of the 67 Mfg
  cardex-only rows. CNJ correctly skips these because a GL completion does exist
  for the WO, just not on this row's account/period, so the shape is a cost /
  account mismatch rather than a missing completion. Belongs with the cost-mismatch
  family.
- **Genuinely unclassifiable.** The Purchasing both-differ row (6.02) and the
  three Sales both-differ rows (101.69). About 0.02% of abs $.

Reclaim opportunity: two rules (Mfg cost mismatch + Sales shipment-not-journaled)
would claim roughly 895 rows and 648K, about 65% of rows and 92.5% of abs $. Add
the two GL-only rules and it is 99%+ of both.

---

## Demo2 (202 rows, 620,433.26 abs)

| Type | Shape | Rows | Net $ | Abs $ |
|---|---|---|---|---|
| Mfg | cardex-only | 133 | -28,247.92 | 379,705.72 |
| Inventory | cardex-only | 6 | 155,650.39 | 156,806.99 |
| Mfg | GL-only | 33 | -2,247.15 | 45,342.83 |
| Purchasing | cardex-only | 19 | 1,563.48 | 35,513.40 |
| Purchasing | both-differ | 11 | 1,021.36 | 3,064.32 |

Demo2 has the smallest row count but a wide dollar spread. No Sales residual at
all, and the Mfg residual is cardex-only rather than the both-differ shape seen
in Demo1.

- **Mfg not journaled (cardex-only, IB and IM, batchtype N).** 133 rows, 379,706
  abs. The largest sub-cluster is `IB / N` with a blank order type (83 rows,
  322,651 abs). Cardex value with no GL leg. This is the same "not journaled"
  family as CNJ, but the document types are IB and IM rather than IC, so the
  current CNJ gate does not fire. A generalized "Mfg cardex value with no GL"
  rule would claim it. Nameable. 61% of abs $.
- **Inventory adjustment not journaled (cardex-only, II, batchtype N).** 6 rows,
  156,807 abs, most of it in 4 `II` rows. A physical count or adjustment changed
  inventory value on the cardex with no GL entry. Corrective action: post the
  IA/II adjustment journal. This is a new named pattern worth its own card.
  Nameable. 25% of abs $.
- **Purchasing variance on inventory (OV, batchtype O).** 30 rows (19 cardex-only
  + 11 both-differ), 38,578 abs combined. Purchase-order variance / landed cost
  landing on an inventory account. The existing Vouchers rule catches batchtype V
  only, so this is a near-miss the Vouchers gate could be widened to cover.
  Nameable. 6% of abs $.
- **Mfg completion in GL not in cardex (GL-only IM).** 33 rows, 45,343 abs. Same
  family as Demo1's GL-only cluster. Nameable.
- **Genuinely unclassifiable.** The single `PV` row (9.63) and one `PI` row
  (578.30). Under 0.1% of abs $.

Reclaim opportunity: three rules (Mfg not-journaled generalization, Inventory
adjustment, Purchasing OV) would claim roughly 92% of abs $. Effectively nothing
in Demo2 is genuinely unclassifiable.

---

## Demo3 (1,860 rows, 11,483,135.77 abs)

This is the important one, and the headline number is a trap.

| Type | Shape | Rows | Net $ | Abs $ |
|---|---|---|---|---|
| Mfg | cardex-only | 523 | -11,041,845.08 | 11,181,469.28 |
| Mfg | both-differ | 28 | -173,065.94 | 174,470.34 |
| Mfg | GL-only | 11 | -95,086.48 | 95,086.48 |
| Sales | cardex-only | 1,292 | 22,926.26 | 22,926.26 |
| Sales | GL-only | 1 | 6,865.78 | 6,865.78 |
| Sales | both-differ | 3 | 2,275.04 | 2,275.04 |
| Inventory | GL-only | 1 | 40.04 | 40.04 |
| Purchasing | both-differ | 1 | 2.55 | 2.55 |

### The 11M is a decimal-scaling artifact, not variance

The Mfg cardex-only cluster is 523 rows and 11.18M abs, which is 97% of Demo3's
entire residual. Almost all of it (471 rows, 11.07M) is `IC / WO / batchtype 0`,
sitting on one account (`00990210`, object 1121). CNJ does not claim these
because a GL completion (`IC`) does exist for each WO. So the shape looked like
"completion posted to a different account."

It is not that. Comparing the cardex amount against the WO's GL `IC` amount, the
cardex is almost exactly 100 times the GL on 465 of the 520 rows in that gate:

| Ratio bucket (cardex / GL) | Rows | Abs cardex $ |
|---|---|---|
| ~100x | 465 | 11,022,517.05 |
| other | 53 | 86,798.20 |
| no GL match | 2 | 2,304.91 |

Example: WO 492022 shows cardex 342,956.82 against a GL IC of 3,429.57. That is
100.0000x, and the same clean 100x repeats across 465 independent work orders.
A deterministic 100x across hundreds of unrelated WOs is not a business event. It
is a currency decimal-places (F9210 FRCDEC) mismatch: one side of the compare was
scaled by 100 and the other was not. This lines up with the standing note that
JDE decimals are re-mined per DB every build (`feedback_jde_decimals_mine_live`)
and with Demo3 being the TR-sourced demo that already carries NA contamination
(`project_tr_na_source_contamination`).

Consequence for AN-1: the corrective action for 11.0M of Demo3's residual is to
re-mine the decimals catalog for this DB and re-roll, not to write a JE and not to
teach the classifier a business pattern. If a classifier rule is added here, its
job is to label these rows "scaling mismatch, fix decimals" so an analyst is not
fooled into cutting an 11M journal entry against a phantom.

### The rest of Demo3

- **Sales cardex-only (JS / SA).** 1,292 rows but only 22,926 abs, so 69% of the
  rows and 0.2% of the dollars. Sub-$20 per row on average. Same
  shipment/adjustment-not-journaled family as Demo1's sales cluster, but the
  materiality is noise. Nameable, low value. Worth a rule mostly to clear row
  clutter from the analyst's view.
- **Mfg cost mismatch (both-differ).** 28 rows, 174,470 abs. Same 5.16 pattern as
  Demo1. Nameable.
- **Mfg completion in GL not in cardex (GL-only IM).** 11 rows, 95,086 abs.
  Nameable.
- **Genuinely unclassifiable.** The 53-row "other" bucket in the scaling table
  (86,798 abs) plus the handful of single Inventory / Purchasing / Sales tail
  rows. About 1% of abs $. The "other" bucket deserves a closer per-row look
  before naming, since it may be a mix of partial scaling and real cost variance.

Reclaim opportunity: by dollars, a scaling-mismatch guard plus the cost-mismatch
rule would touch ~98% of abs $, but 96% of that is really an upstream data fix.
By rows, the sales rule reclaims 69% but for almost no dollars. The honest
statement is that Demo3 has roughly 270K of real, analyst-workable residual
(cost mismatch + GL-only + tails) hiding under an 11M data defect and a pile of
sub-$20 sales rows.

---

## New patterns beyond BU-mismatch and non-stock

The classifier today names Accounts (BU / account mismatch), Periods, Make to
Order, Intercompany, Transfers, Direct Ship, Vouchers, Duplicate Sales, Transfer
Integrity, and Completion Not Journaled. The survey turned up these shapes that no
current rule claims:

1. **Mfg cost mismatch (both-differ WO, IC/IM).** Present in Demo1 (381,820) and
   Demo3 (174,470). The analyzer already diagnoses this as pattern 5.16 but the
   classifier never stamps it. Highest-value, lowest-risk new rule: the analyzer
   catalog already carries the label, so this is a sync, not a new invention.
2. **Sales shipment not journaled (cardex-only RI/JS).** Present in Demo1
   (241,516) and Demo3 (22,926 across 1,292 rows). The sales-side mirror of CNJ.
3. **Decimal-scaling / FRCDEC mismatch (cardex = 100x GL).** Dominates Demo3
   (11.0M). Not a business pattern. Worth detecting only so it can be labeled as a
   data defect and kept out of the analyst's JE queue.
4. **Inventory adjustment not journaled (cardex-only II/IA).** Present in Demo2
   (156,807). Physical count or adjustment value with no GL.
5. **Purchasing variance on inventory (OV, batchtype O).** Present in Demo2
   (38,578). A widening of the existing Vouchers gate from batchtype V to also
   cover O.

## Top rules worth writing

Ranked by value and confidence:

1. **Mfg cost mismatch (5.16).** Claims the biggest nameable dollars in Demo1 and
   real dollars in Demo3, and the label already exists in the analyzer catalog.
   Gate candidate: `Type = 'Mfg'`, `DocType IN ('IC','IM')`, both amounts
   non-zero, WO order type. Verify at the WO level to avoid stealing rows that a
   netting or MTO grouping pass should have handled.
2. **Sales shipment not journaled.** Claims 241K in Demo1 and clears 1,292 noise
   rows from Demo3. Gate candidate: `Type = 'Sales'`, cardex-only, `DocType` in
   the shipment family (RI, JS). Confirm the GL leg is truly absent rather than
   sitting in a later period before naming, so this does not swallow a period
   timing case.
3. **Scaling-mismatch guard for Demo3.** Not a normal classifier rule. Its value
   is protective: label rows where `abs(cardex / matched-GL) ~= 100` as a decimals
   defect so nobody works 11M of phantom variance. The real fix is re-mining the
   decimals catalog and re-rolling Demo3.

Runners-up: Inventory adjustment not journaled (Demo2, 157K) and the Purchasing
OV widening (Demo2, 39K).

## Method notes

- One bounded SELECT batch per DB, run once. No watcher, no polling loop. Float
  amounts were bucketed with a 0.005 tolerance for the zero test.
- The scaling finding was verified with two follow-up SELECTs on Demo3 only
  (account routing of the GL IC leg, then a cardex/GL ratio histogram).
- Read-only throughout. Nothing was written to any DB and nothing was committed.
- Query files used for the run live in the session scratchpad
  (`an1_survey.sql`, `an1_verify.sql`, `an1_ratio.sql`), not in the repo.
