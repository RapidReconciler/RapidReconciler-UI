# AN-1: Residual survey across the three demo databases

**Date:** 2026-07-14
**Scope:** `RCardexLedgerCompare2` rows with `recstatus = 1` AND
`isnull(SubType,'') = ''`. That is the *unclassified* reconciliation
residual: the rows no variance card has claimed yet. Read-only, aggregate
only. Row counts, dollar sums of `Variance`, and JDE order-type /
document-type / Type / cardex-GL-shape signatures. No account, item,
company-name, or document-number identifiers.

"Shape" splits each row by which side carries the amount:

- **cardex-only**: `CardexAmount` non-zero, `LedgerAmount` near zero.
  Inventory moved, GL never posted.
- **GL-only**: `LedgerAmount` non-zero, `CardexAmount` near zero. GL
  posted, no cardex movement.
- **both-differ**: both sides non-zero but not equal. Posted at a
  different amount (cost, quantity, or timing variance).

Near-zero threshold: `abs(...) < 0.005`.

---

## Headline

The unclassified residual is structured, not random. In every demo DB,
five or six `(OrderType, DocType, Type, shape)` signatures account for
almost the entire residual, and each signature maps to a specific
corrective action. A classifier (DAC-28) that stamps `SubType` from these
signatures could reclaim 72 to 85 percent of the residual rows into named
cards, on top of the 14 to 28 percent already covered by shipped cards.

Materiality is concentrated and does not track row count. The largest
cluster by dollars is the Demo3 work-order completions that hit cardex but
were never journaled: -$11.1M across 520 rows, roughly 98 percent of the
entire dollar residual of all three DBs combined. It already has a shipped
card. The largest cluster by *count* is 1,292 Demo3 sales rows, and those
carry only about $23K. A survey ranked by row count alone would point the
analyst at the wrong problem.

---

## Per-DB residual size

| DB | Residual rows | Residual $ (sum of Variance) |
|---|---:|---:|
| Demo1 | 1,703 | $250,474.64 |
| Demo2 | 202 | $127,740.16 |
| Demo3 | 1,860 | -$11,277,887.83 |

Shape split:

| DB | cardex-only | GL-only | both-differ |
|---|---|---|---|
| Demo1 | 526 rows / $162,239 | 457 rows / $35,369 | 720 rows / $52,867 |
| Demo2 | 158 rows / $128,966 | 33 rows / -$2,247 | 11 rows / $1,021 |
| Demo3 | 1,815 rows / -$11,018,919 | 13 rows / -$88,181 | 32 rows / -$170,788 |

---

## Cluster breakdown

Each cluster groups one or more `(OrderType, DocType, Type, shape)`
signatures. `%` is the share of that DB's residual rows. The action column
names the corrective path. "shipped" means a card already exists,
"DAC-28" means a classifiable pattern with no card yet, and "timing" means
a cutoff bucket rather than a per-row fix.

### Demo1: 1,703 rows / $250,474.64

| Cluster (signature) | Rows | % | $ | Corrective action |
|---|---:|---:|---:|---|
| WIP material-issue variance (WO/W1/WR, IM, all shapes) | 536 | 31.5% | -$107,261 | DAC-28: WO cost variance review |
| Completion GL-mismatch (WO/W1/WR, IC, both-differ + GL-only) | 498 | 29.2% | $182,444 | DAC-28: completion posted, GL not equal to cardex |
| Completion Not Journaled (WO/W1/WR, IC, cardex-only) | 368 | 21.6% | -$86,434 | shipped: Completion Not Journaled |
| Sales cardex vs GL (Sales, RI/RM, all shapes) | 295 | 17.3% | $255,963 | DAC-28: duplicate-sales or unjournaled shipment |
| Transfer Integrity (IT, cardex-only) | 3 | 0.2% | $6,472 | shipped: Transfer Integrity |
| Purchasing (OP/OO, OV) | 3 | 0.2% | -$710 | RNV/A-P (1 row) + unclassifiable (2 rows) |

### Demo2: 202 rows / $127,740.16

| Cluster (signature) | Rows | % | $ | Corrective action |
|---|---:|---:|---:|---|
| Mfg issue not journaled (IB/IM, cardex-only; WM, IM, cardex-only) | 133 | 65.8% | -$28,248 | DAC-28: issue hit cardex, no GL |
| Mfg GL-only (IM, GL-only) | 33 | 16.3% | -$2,247 | DAC-28: non-stock or issue reversal |
| Received-Not-Vouchered (OP, OV; PV, cardex-only) | 29 | 14.4% | $2,559 | RNV/A-P module (named) |
| Inventory adjustment not journaled (II/IA/PI, cardex-only) | 6 | 3.0% | $155,650 | DAC-28: new pattern, high $ |
| Purchasing other (OC, OV, both-differ) | 1 | 0.5% | $26 | unclassifiable |

### Demo3: 1,860 rows / -$11,277,887.83

| Cluster (signature) | Rows | % | $ | Corrective action |
|---|---:|---:|---:|---|
| Sales unjournaled shipment (SA, JS, cardex-only) | 1,292 | 69.5% | $22,926 | DAC-28 / timing: high count, low $ |
| Completion Not Journaled (WO/WW/WM, IC, cardex-only) | 520 | 28.0% | -$11,111,620 | shipped: carries about 98% of all $ |
| WIP variance (W*, IM all shapes; WO/WR, IC, both-differ) | 42 | 2.3% | -$198,377 | DAC-28: WO cost variance review |
| Sales other (SO/SF, RI, both; CO, RM, GL-only) | 4 | 0.2% | $9,141 | DAC-28: sales cardex vs GL |
| Inventory (II, GL-only) | 1 | 0.1% | $40 | unclassifiable |
| Received-Not-Vouchered (OP, OV, both-differ) | 1 | 0.1% | $3 | RNV/A-P module (named) |

---

## Classifier-reclaim opportunity (DAC-28)

Rows split three ways. Some are already covered by a shipped card. Some are
reclaimable by a DAC-28 classifier into a known pattern whose card is not
built yet. A small long-tail is genuinely unclassifiable.

| DB | Shipped/module today | DAC-28 reclaimable | Unclassifiable |
|---|---|---|---|
| Demo1 | 372 rows (21.8%) | 1,329 rows (78.0%) | ~2 rows (0.1%) |
| Demo2 | 29 rows (14.4%) | 172 rows (85.1%) | 1 row (0.5%) |
| Demo3 | 521 rows (28.0%) | 1,338 rows (71.9%) | 1 row (0.1%) |

Almost none of the residual is truly unclassifiable. The gap between
"shipped card" and "classifiable" is the DAC-28 prize: a classifier keyed
on `(OrderType, DocType, Type, shape)` would name 72 to 85 percent of the
rows that currently sit blank. The three largest unbuilt-card patterns:

1. **WIP material-issue variance** (`W*, IM`). WO material issues where
   cardex does not equal GL. Demo1 alone has 536 rows / -$107K. This is
   issue-side cost variance (standard versus actual issue cost), not a
   missing journal, so it is distinct from the completion (`IC`) card.
2. **Completion GL-mismatch** (`W*, IC, both-differ + GL-only`). The
   partial or inverse of Completion Not Journaled. The completion did post
   to GL, but at a different amount (both-differ) or with no cardex leg at
   all (GL-only). Demo1: 498 rows / $182K. The shipped card only claims the
   clean cardex-only case.
3. **Sales cardex vs GL** (`Sales, RI/RM/JS`). 295 rows in Demo1, 1,292 in
   Demo3. Two sub-cases worth separating. High-dollar, low-count is a
   duplicate-sales candidate (Demo1 `SI, RI`: 8 rows / $114K).
   High-count, low-dollar looks like an unjournaled-shipment or cutoff
   timing case (Demo3 `SA, JS`: 1,292 rows / $23K).

---

## New patterns beyond the known catalog

1. **Inventory adjustment not journaled** (`(blank OT), II/IA/IB/PI,
   cardex-only`). A direct inventory adjustment moved cardex with no GL
   posting. It is not one of the six variance-taxonomy cards and not the
   shipped completion or transfer cards. The dollars per row are large:
   Demo2 `II` is just 4 rows but $156K, and Demo2 `IB` is 83 rows / -$38K.
   This is the strongest single candidate for a new card. Small row count,
   large dollars, clean cardex-only signature.

2. **Sales unjournaled-shipment at scale** (`SA, JS, cardex-only`, Demo3,
   1,292 rows). Sales shipment cardex entries with no GL counterpart and
   tiny per-row dollars. It behaves like a cutoff timing bucket, not a
   per-row correction. A classifier should route it to a "sales cutoff"
   summary rather than 1,292 individual findings, or the finding list
   drowns.

3. **Completion GL-mismatch sign split** (`W*, IC, GL-only`). GL posted
   with no cardex leg, the mirror image of Completion Not Journaled (cardex
   with no GL). Demo1 has 189 + 63 GL-only rows. The match logic is the
   same subledger key (GLSBL = WO) as the shipped card, running in the
   opposite direction. These are likely completion reversals or non-stock
   completions. Better folded into the completion card as a second sign
   case than treated as a separate pattern.

4. **`WW` and `WM` work-order document families** (Demo3) belong under
   Completion Not Journaled alongside the canonical `WO`. The classifier
   signature should key on `DocType IC` + `Type Mfg` + cardex-only, not on
   `OrderType = WO` alone, or these variants leak out of the card.

---

## Method note

Counts and dollars are exact `SELECT` aggregates over
`RCardexLedgerCompare2` at `recstatus = 1 AND isnull(SubType,'') = ''`. The
cluster groupings are analyst judgment over the raw
`(OrderType, DocType, Type, shape)` breakdown. The raw signature table has
no long tail beyond what is shown here: every signature with at least one
row is accounted for in the cluster totals, which sum to each DB's residual
row count and dollar total.
