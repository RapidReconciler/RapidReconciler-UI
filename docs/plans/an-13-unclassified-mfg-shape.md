# AN-13: shape of the unclassified Manufacturing residual

Measurement only. No classifier change, no card proposed from plausibility.

Context: the manufacturing `DMAAI Net Zero` claim was withdrawn 2026-08-10
(`usp8_txv_flags.sql` block I). Its rows fell back to unclassified `Mfg`. This
document measures what those rows are on each of the three demo databases.

All figures below carry the database they came from. Nothing is stated wider
than it was measured.

---

## 1. The population

One query defines it on every database:

```sql
select *
from   RCardexLedgerCompare2
where  recstatus = 1
and    rtrim(Type) = 'Mfg'
and    isnull(SubType, '') = ''
```

| Database | Residual rows | abs(Variance) | net(Variance) | Ties (tol 0.005) |
|---|---:|---:|---:|---:|
| Demo1 | 546 | 116,677.00 | -108,835.44 | 0 |
| Demo2 | 2 | 1,936.37 | 1,936.37 | 0 |
| Demo3 | 41 | 341,164.54 | -200,459.36 | 0 |

Full `Mfg` context at `recstatus = 1`, same table:

| SubType | Demo1 | Demo2 | Demo3 |
|---|---:|---:|---:|
| Make to Order | 2,865 | 0 | 0 |
| Accounts | 732 | 0 | 0 |
| *(residual)* | 546 | 2 | 41 |
| Mfg Cost Mismatch | 533 | 0 | 71 |
| Completion Not Journaled | 320 | 0 | 125 |
| Cross-Batch Completion | 3 | 0 | 450 |

Demo2 has no classified `Mfg` rows at all. Its entire manufacturing population
is the two residual rows, so no separator can be tested against a Demo2 control
group.

---

## 2. Shape

### 2.1 Demo1, 546 rows (`RCardexLedgerCompare2`)

- DocType: `IM` 536, `IC` 10.
- BatchType: `0` on all 546.
- GroupCode: empty on all 546.
- OrderType: `WO` 495, `W1` 42, `WR` 9.
- `Batch`, `DocNumber`, `OrderNumber` non-zero on all 546.
- `DocNumber = OrderNumber` on all 546.
- Periods: 2025-01-30 through 2025-08-28, eight periods, 27 to 124 rows each.

Leg shape:

| Leg | Rows | abs(Variance) |
|---|---:|---:|
| both | 473 | 111,524.46 |
| GL-only | 44 | 1,966.88 |
| cardex-only | 29 | 3,185.66 |

Materiality bands:

| Band | Rows | abs(Variance) |
|---|---:|---:|
| 0 to 100 | 501 | 5,751.32 |
| 100 to 1K | 28 | 9,015.26 |
| over 1K | 17 | 101,910.42 |

17 rows (3.1%) carry 87.3% of the value.

Accounts:

| ShortAccount | Rows | abs(Variance) |
|---|---:|---:|
| 00223917 | 199 | 7,013.02 |
| 00223941 | 150 | 3,418.26 |
| 00223950 | 116 | 5,747.75 |
| 00223933 | 39 | 1,517.21 |
| 00223925 | 20 | 97,120.26 |
| 00223976 | 15 | 1,816.45 |
| 00223888 | 7 | 44.05 |

### 2.2 Demo1 ratio distribution, 473 both-leg rows

`round(CardexAmount / LedgerAmount, 4)`, grouped:

- 195 distinct ratios across 473 rows. 117 of those are singletons.
- Sign agrees on all 473. Cardex negative / GL negative on 468, positive /
  positive on 5. No opposite-sign pair.
- Largest clusters by row count: 0.9414 (25 rows, $263), 0.0985 (17 rows,
  $98,398), 0.7967 (17, $614), 0.8488 (17, $63), 0.6132 (15, $653), 0.5497 (13,
  $192).

The distribution is a smear by count and a spike by value. The 0.0985 cluster is
17 of 473 rows carrying 84% of the residual's total abs(Variance). Every other
cluster is immaterial. Ratio is therefore useful as a value concentration, not
as a partition.

### 2.3 Demo2, 2 rows (`RCardexLedgerCompare2`)

Both rows, in full:

| Period | Account | DocType | BatchType | OrderType | Doc = Order | Batch | Cardex | GL | Variance |
|---|---|---|---|---|---|---|---:|---:|---:|
| 2025-03-31 | 00141245 | IM | *(blank)* | WM | 660369 | 4504318 | -1,358.07 | 0.00 | 1,358.07 |
| 2025-03-31 | 00141245 | IM | *(blank)* | WM | 672425 | 4594938 | -578.30 | 0.00 | 578.30 |

Both are cardex-only, so no ratio exists.

Demo2's `BatchType` is blank, not `0`. Demo1 and Demo3 both carry `0`. A card
predicate written against `BatchType = '0'` would silently skip Demo2.

### 2.4 Demo3, 41 rows (`RCardexLedgerCompare2`)

- DocType: `IM` 39, `IC` 2.
- BatchType: `0` on all 41.
- OrderType: `WO` 28, `WD` 6, `WS` 3, `WR` 2, `WT` 2. Five order types, against
  Demo1's three, and only `WO` and `WR` are common to both.
- Periods: 2022-02-28 through 2023-05-31.
- Accounts: `01013781` 22 rows, `02005522` 19 rows. Two accounts, against
  Demo1's seven.

Leg shape:

| Leg | Rows |
|---|---:|
| both | 25 |
| GL-only | 11 |
| cardex-only | 5 |

Materiality bands:

| Band | Rows | abs(Variance) |
|---|---:|---:|
| 0 to 100 | 19 | 258.52 |
| 100 to 1K | 11 | 4,720.27 |
| over 1K | 11 | 336,185.75 |

11 rows carry 98.5% of the value. The single largest is doc 513696 on
`02005522`, cardex -168,557.35 against GL -313,443.22, variance -144,885.87.

No ratio cluster on Demo3. The 25 both-leg rows carry 25 distinct ratios from
0.0320 to 1.9399. Sign agrees on all 25.

Demo3 differs from Demo1 in ways that matter to any candidate predicate: all 11
GL-only rows sit on one account, the order-type set is wider, the accounts are
different, and the value concentration is steeper.

---

## 3. Account 00223925 on Demo1: resolved

The 20 residual rows on this account carry $97,120 of the $116,677 Demo1
residual. Thirteen of them share a ratio of exactly 0.098531. Measured against
`F4111` and `F0911` directly, not through any derived table.

### What the compare row is made of

Compare row for doc 1285207 (Demo1, `RCardexLedgerCompare2`): account 00223925,
cardex -119.42, GL -1,212.00.

`F4111` for `ildoc = 1285207`, `ildct = 'IM'`:

| ilitm | iltrqt | iluncs | ilpaid |
|---|---:|---:|---:|
| 525541 | -200 | 0.051600 | -10.32 |
| 525544 | -1,000 | 0.109100 | -109.10 |

Sum is -119.42, matching `CardexAmount` to the penny.

`F0911` for `glsbl = '01285207'`, `gldct = 'IM'`, `glaid = '00223925'`:

| glaa |
|---:|
| -1,102.90 |
| -109.10 |

Sum is -1,212.00, matching `LedgerAmount` to the penny. Note that `gldoc` for
these rows is 10656013, not 1285207: the GL side correlates by subledger, not by
document, exactly as the manufacturing match key requires.

### The cause

The 525544 leg ties exactly: -109.10 on both sides. The 525541 leg does not.
GL -1,102.90 against cardex -10.32 on the same 200-unit issue.

-1,102.90 / 200 = 5.5145 per unit. Cardex used 0.0516.

`F4111` holds a unit cost of **5.514500** in item 525541's own `iluncs` history
(2 rows), alongside 0.051600 (55 rows), 0.051400 (23 rows), 5.462900 (1 row),
0.000200 (1 row) and -1.677900 (1 row). The GL is posting a cost the item
genuinely carried at some point.

Verified across the cluster. Implied quantity at 5.5145 per unit, taken from the
large `F0911` leg on 00223925:

| glsbl | glaa | glaa / -5.5145 | F4111 525541 qty |
|---|---:|---:|---:|
| 01285207 | -1,102.90 | 200.0000 | -200 |
| 01286990 | -4,963.05 | 900.0000 | -900 |
| 01292133 | -22,058.00 | 4,000.0000 | -4,000 |
| 01320527 | -12,131.90 | 2,200.0000 | -2,200 |

Exact on every one. The other 9 signature work orders show the same 5.5145 rate
by arithmetic on their `F0911` legs (01288130, 01289454, 01296992, 01298967,
01303064, 01306912, 01309774, 01310837, 01316594).

**Finding: one item, 525541, on Demo1.** The cardex wrote it at 0.0516 per unit
and the GL journaled it at 5.5145 per unit, a factor of 106.87. Thirteen
independent work orders, four periods, same rate every time. The second
component on those work orders (525544) ties exactly, so this is not a
document-level or account-level problem. It is one item's cost basis.

This is the exact driver `usp8_txv_flags` block H names as the usual one behind
Mfg Cost Mismatch: "a cost basis that moved between the cardex write and the
journaling run." Here it is measured rather than assumed, and the divergent cost
is present in `F4111`'s own `iluncs` history.

### Corrections to the working notes

- The cluster is **13 rows on 00223925**, not 10. The 10 figure counts distinct
  GL amounts; 1,212.00 occurs four times.
- **119.42 is not a unit cost.** It is the sum of two component issues
  (200 x 0.0516 plus 1,000 x 0.1091). Its resemblance to 100 x 1.1942, the
  parent item 536665's unit cost, is a coincidence.
- **1,212.00 is not a GL unit cost** either. It is 200 x 5.5145 plus
  1,000 x 0.1091.
- The 0.098531 ratio is a **blended artifact** of one wrong leg and one correct
  leg. The real defect is a single-item rate of 106.87x. Nothing in the source
  carries a factor of 10.149 or 0.098531.
- The population-wide `round(ratio, 4) = 0.0985` group has **17 rows, not 13**.
  Four rows on account 00223950 (docs 1283729, 1283730, 1283731, 1315834) round
  to the same 4dp value at 0.098528 and are a different mechanism. Their cardex
  side is item 536665 alone (24 x 1.1942 = -28.66 on doc 1283729) against a GL
  leg of -290.88, which is 12.12 per unit. **12.12 is not in item 536665's
  `iluncs` history** (which holds 1.194200, 1.192800, 8.764200, 7.570000,
  0.001400). Those four rows are unresolved.
- **A single AAI-account rate defect cannot always be attributed to an item.**
  `F0911` has no item column. The 525541 case resolved only because the work
  order had exactly two components and one leg tied exactly. Where an account
  receives more than one item's issues, the GL leg cannot be decomposed. That is
  a hard limit of the source, not of the query.

### Not determined

- **Cost method.** `F4102.IBCOST` is not extracted by RapidReconciler, so
  whether 525541 is standard, average, or last-in cannot be established here.
  Not guessed.
- **Which cost is correct.** 5.5145 and 0.0516 both appear in `F4111` history.
  Nothing in the extracted data says which one the item should have carried on
  these dates.
- **The 00223950 12.12-per-unit rate.** Not attributable to any `F4111` cost.

---

## 4. Which predicate these rows fail

This is a gap in coverage, not a missing card. Read
`RapidReconciler-DB/RapidReconciler/dbo/Stored Procedures/usp8_txv_flags.sql`.

### The named predicate

**`usp8_txv_flags.sql` line 577, block H (Mfg Cost Mismatch):**

```sql
and         rtrim(a.Type) = 'Mfg' and rtrim(a.DocType) = 'IC' and a.Batch > 0
```

Decomposed against the residual:

| Database | Fail `DocType = 'IC'` | Reach the `#mfgic` join |
|---|---:|---:|
| Demo1 | 536 of 546 | 10 |
| Demo2 | 2 of 2 | 0 |
| Demo3 | 39 of 41 | 2 |

**577 of the 589 residual rows across all three demos are document type `IM`
and fail MCM at its document-type test.** Not one of them is ever evaluated
against the cost logic.

`Batch > 0` eliminates nothing. Every residual row on every database has
`Batch > 0`.

### The gap is structural, not a tuning miss

Every manufacturing block in `usp8_txv_flags` gates on `DocType = 'IC'`:

| Block | Card | Gate |
|---|---|---|
| D (line 320) | Completion Not Journaled | `rtrim(a.DocType) = 'IC'` |
| G (line 537) | Cross-Batch Completion | `rtrim(a.DocType) = 'IC'` |
| H (line 577) | Mfg Cost Mismatch | `rtrim(a.DocType) = 'IC'` |

No block in the proc claims `DocType = 'IM'`. The manufacturing card set covers
the completion side of a work order and nothing on the issue side. Block H's own
`@asserts MCM.iconly` states this deliberately for the GL aggregate ("only
document type IC is summed on the GL side, so material issues are never netted
against completions"), but the same restriction on the compare row is what
leaves the issue leg with no card at all.

The 525541 case in section 3 is a cost mismatch by MCM's own definition: a GL
leg exists for this work order on this account, and the amount differs. It is
unclassified only because it is `IM`.

### The 10 `IC` rows on Demo1

They pass the document-type and batch tests and fail the join. Measured against
raw `F0911`:

- All 10 have `LedgerAmount = 0` (cardex-only).
- All 10 fail `MCM.glcompletionsameaccount`: no `F0911` row with `gldct = 'IC'`
  and `glsbl` = the padded order number on that company **and that account**.
- 7 of the 10 (orders 1260791, 1260793, 1260803, 1267109, 1267110, 1267111,
  1267112) do have an `IC` leg on the same company and work order, on a
  **different** account. The account equality in the `#mfgic` build
  (`c.ShortAccount = g.glaid`, line 502) is what excludes them.
- The remaining 3 (orders 1237206, 1299339, 1331624, all on account 00223976)
  have no `F0911` `IC` leg on any account for that work order.

Those 3 look like Completion Not Journaled but fail block D at line 322:
`g.im_rows > 0`. Block D requires the GL to hold the work order's issues before
it will claim a missing completion. Not re-measured per row.

Demo3's 2 `IC` rows (orders 489411, 490398) fail the same
`MCM.glcompletionsameaccount` test.

### The Accounts card

`usp8_txv_account_mismatch` runs in Phase 2 ahead of the flags and needs two or
more distinct `ShortAccount` values on one
`(PeriodEnds, CompanyNumber, Batch, DocNumber, DocType)` key. Among unclaimed
ungrouped rows:

| Database | Sole account on their key | Have siblings |
|---|---:|---:|
| Demo1 | 517 of 546 | 29 |
| Demo2 | 2 of 2 | 0 |
| Demo3 | 41 of 41 | 0 |

517 Demo1 rows fail the Accounts grain outright. The 29 with siblings were still
not claimed; the aggregate's net test was not decomposed per row.

---

## 5. Separator table

A separator partitions the residual absolutely. If the same value also appears
on a classified `Mfg` row, it is not a separator. Every test below is against
`RCardexLedgerCompare2` at `recstatus = 1, Type = 'Mfg'`.

| Field | Partitions absolutely? | Evidence |
|---|---|---|
| `DocType` | No | Demo1 `IM` also carries Make to Order (1,643) and Accounts (610). `IC` carries five subtypes. |
| `OrderType` | No | Demo1 `WO` carries MCM 461, Make to Order 2,111, CNJ 286, Accounts 620, XBC 3. `W1` and `WR` likewise. Demo3 `WD`/`WS`/`WT` are residual-only (11 rows) but `WO` (28 residual) is shared with 595 classified rows. |
| `BatchType` | No | Demo1 and Demo3: `0` on every `Mfg` row, classified and not. Demo2: blank on both rows, no control group. Constant, not discriminating. |
| `GroupCode` | No | Empty on the residual by construction. Phase 0a resets only `GroupCode = ''`, so the residual can never carry one. |
| Leg shape | No | Demo1 both-leg 473 residual against 1,975 classified; GL-only 44 against 1,504; cardex-only 29 against 974. Demo3 GL-only (11) is residual-only, but Demo1 GL-only is not, so the field does not hold across databases. |
| Sign agreement | No | Same-sign on all residual both-leg rows on Demo1 (473) and Demo3 (25). Also same-sign on 332 of 332 Accounts and 241 of 241 MCM rows on Demo1. Universal, not discriminating. |
| Tie / no tie | No | Zero ties in the residual on all three databases, and zero ties in every classified `Mfg` subtype on Demo1 and Demo3 as well. Universal. |
| Ratio | No | Demo1: 195 distinct ratios over 473 rows, 117 singletons. Demo3: 25 distinct over 25 rows. No cluster is exclusive to the residual, and Demo3 has no clusters at all. |
| `ShortAccount` | No | All 7 Demo1 residual accounts carry classified rows (00223917 527 classified, 00223925 84, 00223888 51, and so on). Both Demo3 residual accounts likewise. |
| `PeriodEnds` | No | Demo1 residual spans eight periods, all of which carry classified rows. |
| `DocNumber = OrderNumber` | No | True on 546 of 546 residual **and** 4,453 of 4,453 classified `Mfg` rows on Demo1. Universal. |
| Batch spread | No | `Batch > 0` on 546 of 546 residual and on the classified population. Universal. |
| Work order carries classified siblings | No | 43 of 513 distinct residual work orders on Demo1 also carry a classified `Mfg` row. A tendency at 92%, not a partition. |
| `DocType = 'IM'` **and** no `IC` card claims `IM` | **Yes, mechanically** | 536 of 546 Demo1, 2 of 2 Demo2, 39 of 41 Demo3. This is not a property of the data. It is the coverage boundary of `usp8_txv_flags`. |

---

## 6. Verdict

**No field in the data separates this population.** Every candidate tested above
appears on classified `Mfg` rows as well, on at least one database. The one
clean partition (`DocType = 'IM'`) describes where the classifier stops looking,
not what the rows have in common.

Three statements the measurement supports:

1. **577 of the 589 residual rows across Demo1, Demo2 and Demo3 are `IM`, and
   no block in `usp8_txv_flags` claims `IM`.** Blocks D, G and H all gate on
   `rtrim(a.DocType) = 'IC'`. The manufacturing card set covers the completion
   side of a work order only. This is the finding, and it is a coverage gap in
   the existing cards rather than a missing card.

2. **MCM's mechanism already fits at least part of the residual, verified on
   Demo1.** Thirteen rows worth $97,120 are one item (525541) journaled at
   5.5145 per unit against a cardex cost of 0.0516, with both costs present in
   `F4111`'s own `iluncs` history. That is "a GL leg exists for this work order
   on this account and the amount differs," which is MCM's claim verbatim, on
   the issue side instead of the completion side.

3. **Any extension of MCM to `IM` must be specified and measured on all three
   databases before it is written, and it will not clear the residual.** On
   Demo1 it would reach at most the 473 both-leg rows and leave 73. Demo2's two
   rows are cardex-only and would be untouched. Demo3's 11 GL-only rows would be
   untouched. Whether the reachable rows actually satisfy the join has not been
   measured, and the `IM` GL side aggregates several items per account with no
   item column in `F0911` to decompose it, so the grain problem block G and H
   already flag (`glsideaggregated`) gets worse, not better, on the issue side.

Recommendation: leave the residual unclassified for now. Track "extend the
manufacturing cost-mismatch mechanism to `IM`" as its own item with its own
measurement, including the `IM` GL aggregation grain, before any predicate is
written. Do not write a card off section 3 alone. One item on one database is a
worked example, not a population.

---

## Appendix: what was measured, and where

| Claim | Source table |
|---|---|
| Residual population, shape, leg, ratio, bands, accounts, periods | `RCardexLedgerCompare2` at `recstatus = 1` |
| Cardex amounts, item numbers, quantities, unit costs, cost history | `F4111` (`ildoc`, `ildct`, `ilitm`, `iltrqt`, `iluncs`, `ilpaid`) |
| GL amounts, subledger correlation, `IC`/`IM` leg existence | `F0911` (`gldct`, `glsbl`, `glaid`, `glco`, `glaa`) |
| Card predicates and their line numbers | `usp8_txv_flags.sql`, `usp8_txv_account_mismatch.sql`, `usp8_txv_classify.sql` |

No derived table was used to scope a tie-out. No `ROUND()` was applied to a
float for equality; leg shape and tie tests use a 0.005 tolerance and the
`#mfgic` reproduction uses block H's own 0.01.
