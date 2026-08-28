# Posting-policy detection, cross-subtype grouping, and the close of UI-164

Spec for UI-167 and UI-165, plus the closing measurement for UI-164.
Written 2026-08-27 from measurements taken on Demo1, Demo2, Demo3 and
`JDE_PRIST920` with `rruser` over the ODBC `sqlcmd`. Every number below was
measured in this session. Nothing here was inherited.

This document specifies. It does not implement. Where a change to an existing
file is required, the file and the location are named so a later lane can make
the change.

---

## 0. What was measured, and the harness

```
"C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\sqlcmd.exe" \
  -S localhost,1433 -U rruser -P rruser -C -d <db> -W -s "|" -b
```

`INFORMATION_SCHEMA` returns nothing for `rruser`, so every catalog query uses
`sys.columns` / `sys.tables`. All reads. No demo data was changed.

Working queries are kept in the session scratchpad as `q_ui165.sql`,
`q_ui165b.sql`, `q_ui165c.sql`, `q_ui164.sql`, `q_ui164b.sql`, `q_ui164d.sql`,
`q_ui164ctl.sql` and `q_ui167.sql`.

---

## 1. UI-167, condition (a): GL summarization

### 1.1 What summarization does to the comparison

`usp8_txv_flags.sql` already carries the consequence in its Completion Not
Journaled block. R31802A summarization combines entries by account across work
orders, and the subledger processing option does not apply to summarized
entries. The card's `#gl` temp table counts only rows whose subledger casts to a
number above zero, so a summarized completion is invisible to it. At a
summarizing customer, summarization would create the card rather than be ruled
out by it.

The same assumption is baked one layer lower. `vcr_F0911` resolves the
manufacturing GL leg's document number like this:

```sql
case when glicut = '0' and sddoco is not null then sddoco
     when glicut = '0' and isnumeric(glsbl) = 1 then convert(int, glsbl)
     else gldoc end as DocNumber
```

and it takes `sddoco` from an F3106 subquery whose own comment reads
`max doc is for R31802A set to summarize by account across work orders`. So
`vcr_F0911` already knows summarization exists and copes with it by picking
`max(sddoco)`, which silently attributes a summarized GL line to one arbitrary
work order out of however many it covers. That is the quiet failure mode: not an
error, a plausible wrong answer.

### 1.2 The detection

Two probes were run. One of them is the right one.

**Probe A, the subledger proxy.** Blank or non-numeric `glsbl` on F0911 rows
with `glicut = '0'` and `gldct` in (`IC`,`IM`).

| Database | IC rows | IC subledger absent | IM rows | IM subledger absent |
|---|---|---|---|---|
| Demo1 | 154,339 | 0 | 1,797,363 | 0 |
| Demo2 | (no batch type `0` rows at all) | | | |
| Demo3 | 24,020 | 0 | 74,439 | 0 |

**Probe B, the direct signature.** One GL document cross-referenced by F3106 to
more than one work order:

```sql
select sddoc, sddgj, sdicut, sdicu, count(distinct sddoco) as orders_per_gl_doc
from F3106 group by sddoc, sddgj, sdicut, sdicu
```

| Database | GL documents in F3106 | Documents covering >1 work order |
|---|---|---|
| Demo1 | 1,951,501 | 0 |
| Demo2 | 0 (F3106 empty) | 0 |
| Demo3 | 28,648 | 0 |

**Probe B is the detection.** Probe A is a proxy for it and is weaker in both
directions: a customer can summarize while still writing a subledger on some
rows, and a customer can leave the subledger blank for reasons that have nothing
to do with summarization. Probe B tests the thing itself, which is whether one
GL document covers more than one work order.

**Probe C was tried and rejected.** Comparing F0911 line counts against F4111
row counts per manufacturing batch looked like a compression signal, but on
Demo1 it flags 8 batches at 2x or more and 223 batches carrying GL lines and no
cardex rows at all. Those 223 are the IV variance batches (1,490 lines), which
are not completions. Ordinary journal-line consolidation inside a single order
is indistinguishable from cross-order summarization at that grain. Do not build
on Probe C.

### 1.3 Demo2 is why the detection needs three states, not two

Demo2 has 260,403 F0911 rows under document type `IM`, and 260,401 of them carry
a blank subledger. Read naively that is a screaming summarization signal. It is
not one. Every row is batch type `N`, and Demo2 has no batch type `0` rows
anywhere in F0911. Per `reference_batch_type_discriminates_manufacturing`, batch
type `0` is manufacturing and `IM` is a repurposable document type, so Demo2's
`IM` rows were written by an inventory program and have no work order to carry.

Consequences for the build, both load bearing:

1. **The probe must be gated on `glicut = '0'`.** Ungated, it produces a
   99.999% false positive on Demo2. The gate exists in the proc's confirmation
   guidance already; it does not exist in the probe as UI-167 states it.
2. **The detection has three outcomes, not two.** Detail posting confirmed,
   summarization detected, and not applicable because this customer has no
   manufacturing batches. Demo2 must land in the third. A detection that reports
   "detail posting confirmed" for Demo2 is asserting a fact it has no evidence
   for, which is the defect class this row exists to close.

### 1.4 Grain, storage, and cadence

**Grain: per company.** Not per period. The posting policy is a property of the
customer's R31802A version and processing options, so a per-period recomputation
would let the same customer read as summarizing in one period and not in the
next purely on volume. If a builder finds themselves keying this by
`PeriodEnds`, that is the design smell the brief warned about and the answer is
to stop.

**Storage: a new table.** Do not reuse `RCompanies.SubLedgerWO`. The name is a
trap. `usp6_002a_companies.sql:110` sets it with
`case when f.comp is null then 0 else 9 end`, which is a "this company has a
baseline" flag, and `v6_006_perpetual.sql` lines 6 to 9 plus `v6_006_asof_bf.sql`
lines 6 and 9 read it to decide whether to zero the perpetual baseline. It holds
`9` on every company in all three demos. Writing a posting-policy value into it
would corrupt the perpetual inventory baseline.

Proposed shape, `dbo.RPostingPolicy`:

| Column | Type | Meaning |
|---|---|---|
| `CompanyNumber` | as `RCompanies.CompanyNumber` | PK |
| `SummarizationState` | `nchar(12)` | `Detail`, `Summarized`, `NoMfg` |
| `MfgGLDocs` | `int` | GL documents tested |
| `MfgGLDocsMultiOrder` | `int` | of those, covering more than one work order |
| `GLUnitsState` | `nchar(12)` | `NotExtracted`, `Populated`, `Partial`, `Absent` |
| `ComputedOn` | `datetime` | |

**Cadence: once per load, rebuilt not merged.** Follow the precedent set by
`usp8_txv_signals.sql`, whose header states the reasoning in full: DELETE and
rebuild every run rather than merge, so the table can never hold an answer the
data no longer supports, and DELETE rather than TRUNCATE because TRUNCATE needs
ALTER on the table and the runtime account has no other reason to hold it. That
proc is also the precedent for "disclosure, not a claim": it writes only to its
own table and never to `RCardexLedgerCompare2`. This detection must do the same.
Classification stickiness (`reference_txv_classification_is_sticky`) does not
apply to a rebuilt table, which is the point of rebuilding it.

Do not put this in `usp8_txv_signals` itself. That table is keyed per document.
This fact is per company.

### 1.5 The sink

The sink already exists and it is wrong. `RRV8/config.js`, in the `'CNJ'` card's
`finding.context` array, second bullet:

> Not tested: summarization, and the test is BLIND to it rather than ruling it
> out. The GL search only counts rows with a numeric work-order subledger, so a
> summarized completion carrying no subledger is invisible and would CREATE this
> card. On both demos every completion in these batches carries a subledger, so
> summarization is not what is happening there, check yours.

Two defects in one bullet. It renders under the heading "Not tested on these
rows", which will be false once the detection ships. And it ships the phrase
"on both demos" to a customer-facing card, which is specimen language about our
test data on a surface a customer reads. That is a second, independent finding
worth fixing whatever happens to UI-167.

**UI-168 closed the second half on 2026-08-27. The quote above is the PRE-FIX
wording, kept so this section still reads as an argument.** The specimen sentence
is gone from `config.js`; the bullet now ends "Confirm your completions carry a
work-order subledger at all before you treat the entry as never written." A
FOURTH context bullet on the same card also said "Both were true on the demos" —
UI-168 named only the second bullet, and the sweep found two. Both are fixed.
**The first defect is untouched and is still UI-167's:** the bullet renders under
"Not tested on these rows", and that heading goes false the moment detection
ships. Build the table below against the current wording, not the quote.

**Where it renders.** `RRV8/inventory-transactions.html`, in the finding
renderer around lines 7533 to 7551. The function assembles the block from
`checked` under "What happened", `context` under "Not tested on these rows",
`found` under "What I found", `fix` under "What to do", and `alsoChecked` under
"Also checked", which always renders last.

**What the builder does with the three states.**

| State | Section | Text |
|---|---|---|
| `Detail` | `checked` or `found` | Every manufacturing GL document on this install covers exactly one work order, so summarization is not creating this card. |
| `Summarized` | `checked`, and it must lead | N of M manufacturing GL documents cover more than one work order. This card counts only completions carrying a work-order subledger, so summarized completions are invisible to it and this card may be reporting a matching gap rather than a posting gap. |
| `NoMfg` | `context` | Keep a "not tested" wording. This is the only state where "not tested" is the honest heading. |

`Tools/check_txv_cards.py` enforces a maximum of two bullets in `checked`, so
the `Summarized` line has to displace something rather than be appended.

**The assertion gate.** Every bullet cites an assertion id validated against
`RRV8/txv-assertions.json` (393 lines today), which
`RapidReconciler-DB/Tools/gen_txv_assertions.py` generates by globbing
`usp8_txv_*.sql` for `@asserts` manifest lines. So the build order is: add the
`@asserts` line in the DB proc, regenerate the JSON, then add the citing bullet
in `config.js`. Adding the bullet first fails the gate.

**Transport.** `GET /admin/companies` is JWT-scoped and already fetched once per
database at `RRV8/home.html:7694` through `rrFetch`. `inventory-transactions.html`
deliberately avoids that lookup; the comment at line 6946 says company data is
resolved without a separate `/admin/companies` call. So the builder chooses
between widening the payload the transactions page already receives, or adding
the `/admin/companies` fetch to that page and paying for the round trip. This is
a real decision and it is not made here.

The Agent side is `InventoryIntegrityController.java`, whose `ALLOWED_VIEWS` set
at line 106 whitelists readable views. Any new view backing this fact has to be
added there or it returns 403.

### 1.6 The GLU extract stays an investigation aid

Extracting `GLU` and `GLUM` is permitted only as a gated, labelled investigation
aid. The analyst-facing unit-cost comparison is refused and does not appear in
this spec. It needs GLU populated and the GL posting in detail, and neither is
guaranteed.

Cost of extracting it, which the builder should know before agreeing to it. The
chain is the SSIS package `RapidReconciler_Prod.dtsx`, then
`dbo.Staging_F0911`, then `usp8_apply_f0911`, then `dbo.F0911`. Four artifacts
across two repos for a field that is diagnostic only.

---

## 2. UI-167, condition (b): GLU population

### 2.1 Measured

RR's own `dbo.F0911` carries 31 columns on all three demos, and the three
`jdesource_demo*` copies carry 31 as well. There is no units field. The only
near-match is `gluser`, which is `nchar(20)` and holds the user id.

`JDE_PRIST920.PS920DTA.F0911` carries 141 columns including `GLU` (`float`) and
`GLUM` (`nchar`). Population by document type, on rows where `GLU` is non-null
and non-zero:

| Doc type | Rows | GLU populated | % |
|---|---|---|---|
| IM | 160 | 160 | 100.0 |
| IC | 121 | 121 | 100.0 |
| IS | 138 | 130 | 94.2 |
| IA | 4,801 | 2,304 | 48.0 |
| IT | 6 | 4 | 66.7 |
| JE | 6,691 | 49 | 0.7 |
| IB | 160 | 0 | 0.0 |

Every figure in UI-167's own paragraph reproduced exactly.

### 2.2 The detection

A count per document type per company, stored as `GLUnitsState` on the table in
§1.4. Four states, and the first one is the one that matters today:

- `NotExtracted` when the `GLU` column is absent from `dbo.F0911`. This is the
  state on every install right now, and it is the honest answer rather than a
  silent zero.
- `Populated` / `Partial` / `Absent` once the column exists, thresholded per
  document type.

The reason this needs a state rather than a number: the owner ruling is that not
all customers populate GLU. A conclusion drawn from the populated half of a
document type is indistinguishable on screen from one drawn from all of it, so
any surface that renders a GLU-derived figure must render the population rate
for that document type beside it, on the same surface. A tooltip does not count.

---

## 3. The test-corpus gap

**No demo dataset exercises the summarized path.** Probe B returns zero on all
three databases. `vcr_F0911`'s `max(sddoco)`, which exists specifically to cope
with summarization, has never once been exercised in the test corpus. Nothing in
CI would catch a regression in it.

**The fixture that would close the gap.** A fourth manufacturing dataset, or a
seeded company inside Demo3, satisfying all of:

1. F0911 rows at `glicut = '0'`, `gldct = 'IC'`, with `glsbl` blank.
2. F3106 rows where one `(sddoc, sddgj, sdicut, sdicu)` key maps to at least
   three distinct `sddoco` work orders.
3. F4111 completion rows for each of those work orders in the same `ilicu`
   batch, so the cardex side keeps its per-order grain while the GL side does
   not.
4. Total F0911 amount on the summarized line equal to the sum of the F4111
   amounts across the covered orders, so the customer's books balance and only
   the pairing is broken.

Condition 4 is what makes it a real fixture rather than a broken one. The
summarizing customer is not out of balance; their GL is correct and RR's
document-level pairing is what fails.

Two assertions on that fixture:

- Probe B returns `SummarizationState = 'Summarized'` with
  `MfgGLDocsMultiOrder` greater than zero.
- The CNJ card renders the `Summarized` copy, and the string "Not tested" does
  not appear against summarization on that install.

Demo3 is the natural host. It has manufacturing (2,489 batch type `0` batches,
98,459 F0911 rows) and 28,648 F3106 cross-reference documents, all currently
single-order.

---

## 4. UI-165: cross-subtype grouping

### 4.1 The four buckets reproduce exactly

Filter: `recstatus = 1`, both `CardexAmount` and `LedgerAmount` non-zero and
unequal, `abs(LedgerAmount/CardexAmount - 10.14905) < 0.001`.

| SubType | ShortAccount | DocType | Rows | Gross |
|---|---|---|---|---|
| Mfg Cost Mismatch | 00223950 | IC | 24 | 97,567.38 |
| (unclassified) | 00223925 | IM | 13 | 96,693.33 |
| Make to Order | 00223950 | IM | 20 | 59,053.94 |
| (unclassified) | 00223950 | IM | 4 | 1,704.43 |

61 rows, 255,019.08. Demo1's entire both-differ population is 2,464 rows and
748,689.70 gross, so the cluster is 34.1% of it. Every figure in UI-165
reproduced. `SB25` is short account `00223950` and `SB19` is `00223925`.

### 4.2 Which key discriminates, tested rather than assumed

**Same account: no.** Account `00223950` carries 774 both-differ rows and
241,385.09 gross, of which 48 are in the cluster. Sixteen times over-collection
on rows. Account `00223925` carries 30 rows and 205,926.88, of which 13 are in
the cluster.

**Same item: not computable.** `RCardexLedgerCompare2` has 27 columns and none
of them is an item. Item lives on `RTransactions` / `RItems` / `F4111`, a grain
below the document. Since `feedback_rclc2_is_the_document_scope` fixes the scope
at RCLC2, item is out of reach without widening it, and widening it is
forbidden.

**Same ratio: workable but noisy, and fragile.** Rounding is the wrong operator.
At `round(ratio, 4)` the cluster splits across five adjacent bins (10.1486,
10.1489, 10.1490, 10.1491, 10.1493) totalling 60 rows, so a naive group-by would
fragment the very population it was built to unify. A tolerance band works, but
the band width becomes a tuning constant nobody can defend. And the ratio
produces roughly 38 clusters of three rows or more on Demo1 alone. The largest
by gross is not the 10.149 cluster at all: it is ratio 0.5, 16 rows, 182,920.94,
spanning nine accounts and four document types, and its composition (eight
Transfers rows on `ST` orders, seven Mfg Cost Mismatch rows, one Duplicate Sales
row) reads as coincidence at a round number rather than one defect.

**Same order: yes, and it is clean.**

| Key | Rows pulled by the cluster's keys | Of which in the cluster |
|---|---|---|
| `OrderNumber` | 92 (264,443.00) | 61 |
| `Batch` | 527 (332,057.91) | 61 |

`OrderNumber` over-collects by 31 rows and 9,424 gross, about 3.6%. `Batch`
over-collects 8.6 times and is the wrong key.

Two safety checks on `OrderNumber` as a bare key, both clean on Demo1: zero
orders appear under more than one `(CompanyNumber, OrderType)` combination, and
zero both-differ rows carry a blank or zero order number. The recommended key is
still the triple `(CompanyNumber, OrderType, OrderNumber)`, because the
collision test passing on one dataset is not a guarantee on a customer's.

### 4.3 The feature: an order whose rows landed on more than one card

The ratio turns out to be unnecessary. Define a split order as one whose
both-differ rows carry more than one distinct `SubType`, counting blank as its
own value.

On Demo1: **28 split orders, 76 rows, 209,324.13 gross, 28.0% of the whole
both-differ population.** Every one is a manufacturing order type, 27 `WO` and
one `WR`.

Why this is better than the ratio filter:

- Thirteen of the 28 sit inside the ratio cluster, and they are the top thirteen
  by gross. The feature finds the cluster's most valuable half without knowing
  the constant exists.
- It surfaces fifteen more split orders the ratio filter misses entirely
  (1244402, 1289442, 1250103, 1277985, 1269351, 1251216, 1273590, 1250085,
  1281829, 1275829, 1299290, 1243960, 1245722, 1254221, 1239236).
- The population is bounded and rare. Only 28 of 2,004 orders in Demo1's
  both-differ pool are split, so this is a short list an analyst can work, not
  dozens of ratio bins to triage.
- No magic constant, no tolerance band, no item.

**The honest limitation, and it must not be glossed.** The split-order key links
bucket 1 to bucket 2, because those two buckets are the same thirteen work
orders seen from the completion side and the issue side. It does **not** link
buckets 3 and 4. The Make to Order rows sit on orders 1262009 to 1262230,
1297934 to 1297951, 1305972, 1305974 and 1315452; the four unclassified rows sit
on 1283729 to 1283731 and 1315834. Those sets do not intersect. Those four rows
share the ratio and nothing else RCLC2 can see.

So the feature covers the fragmentation defect UI-165 describes, which is one
order's rows being reported on different cards, and does not cover "different
orders exhibiting the same underlying economics". The second is a real thing and
it needs the item, which means it needs a scope widening that is out of bounds.
Say so on the surface rather than implying the group is complete.

### 4.4 Where it surfaces

This is a disclosure, not a claim, so it takes the `usp8_txv_signals` shape:
computed after classification, written to its own table, never writing
`SubType`. Classification stickiness makes any precedence change inert, which is
why the owner ruled for grouping over reclassification, and a rebuilt disclosure
table sidesteps stickiness entirely.

On the card, the natural home is `alsoChecked` in the relevant card
definitions in `RRV8/config.js`, which renders last under "Also checked" in the
`inventory-transactions.html` finding renderer. The bullet needs to name the
order, the other card, and the gross sitting there, because a bullet that says
"this order also appears elsewhere" without the amount sends the analyst hunting.

The cards that need the bullet are the ones the 28 orders actually land on:
`Mfg Cost Mismatch`, `Make to Order`, and the unclassified pool. The
unclassified pool is the hard one, because rows with a blank `SubType` surface
on no card at all. Two of the four buckets carry no subtype, which is UI-165's
sharpest point and the part a card-side-only fix cannot reach. Whatever surface
carries this has to be reachable from the grid, not only from a card.

The precise element is a decision for the builder and it is not made here. The
constraint that is made here: the number must be on screen, per
`feedback_ui_bullets_and_readable` and the numbers-on-screen rule.

### 4.5 The behaviour test

Positive fixture, Demo1:

- 28 split orders.
- 76 rows on those orders.
- 209,324.13 gross on those orders.
- The top order by gross is `WO 1292133` at 44,227.63 across 5 rows and 2
  subtypes.
- All four of the §4.1 buckets contribute at least one row to the split-order
  set. This is the assertion that fails if the grouping drops a bucket.

Negative controls, and they are the reason the test is not Demo1-only: Demo2
returns 0 split orders against 1,047 both-differ rows, and Demo3 returns 0
against 33. So the feature is measured not to fire spuriously on a distribution
dataset or on a manufacturing dataset without the defect.

One trap for whoever writes the assertion. On the empty sets, `sum(abs(Variance))`
returns `NULL`, not `0`. An assertion written as `= 0` passes on Demo1 by
accident and reports nothing useful on Demo2 and Demo3. Wrap it in `isnull`.

---

## 5. UI-164: the composition test, and the recommendation

### 5.1 The test

The remaining question was whether the GL side of a document covers items or
accounts the cardex row does not. Answerable with what we hold, and answered.

The join grain had to be read rather than guessed, and it is not the obvious
one. `F0911` holds no row at `gldoc = 1292133`, because for manufacturing
`vcr_F0911` builds `DocNumber` from `sddoco` or `glsbl`, so RCLC2's `DocNumber`
is the work order and the GL document number rides separately as `GLXref`.
Querying `F0911` on `gldoc` returns nothing and looks like a missing GL leg.

Method: materialize both legs for the cluster's 35 documents, the GL leg from
`vcr_F0911` and the cardex leg from `RTransactions` joined to `RItems`, then
compare account sets per document with `EXCEPT` in both directions.

### 5.2 The result: negative

Across all 35 documents, **zero accounts appear on the GL leg and not the cardex
leg, and zero appear on the cardex leg and not the GL leg.** Six accounts on
each side for the Make to Order documents, two on each side for the Mfg Cost
Mismatch documents, matched exactly.

Line counts per RCLC2 row:

| GL lines | GL docs | Cardex rows | Cardex items | Rows | Gross |
|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 36 | 82,609.95 |
| 2 | 1 | 2 | 2 | 13 | 96,693.33 |
| 1 | 1 | 2 | 1 | 9 | 55,044.19 |
| 1 | 1 | 3 | 1 | 3 | 20,671.61 |

`gl_docs = 1` on every row, so no GL document is shared across cluster rows. The
twelve rows where one GL line covers two or three cardex rows are ordinary
journal-line consolidation within the same account and document, not a scope
difference: the account sets still match exactly.

Worked example, `WO 1292133`. Batch 12966481 account 00223950: GL one line
4,581.36 against cardex one row one item 451.41. Batch 12971203 account 00223925:
GL two lines -24,240.00 against cardex two rows two items -2,388.40. Every GL
document (10764592, 10772724, 10789697, 10793675) carries lines attributed to
work order 1292133 and to no other.

**Composition is identical on both legs. Only the amount differs.**

### 5.3 Control, run last

The same probe was run against 200 manufacturing documents whose RCLC2 rows
include a leg with a zero amount on one side, where a composition difference
should exist. It fired on 22 documents where the GL covers accounts the cardex
does not, and 101 where the cardex covers accounts the GL does not. The probe
detects differences. The zeroes on the cluster are the data.

### 5.4 Recommendation: close the row as unconfirmed

Four hypotheses are now dead, three inherited and one measured here:

1. Cost basis, standard on the cardex against actual in the GL. Killed
   2026-08-04.
2. Frozen cost, F4105 `UnitCost` against the F30026 component sum. Killed
   2026-08-27 at ratio 1.00000 on all three items, with a control confirming the
   query would have caught a gap.
3. Unit of measure. Killed 2026-08-27, `iltrum` and `primaryuom` both `EA` on all
   three items.
4. GL composition. Killed here, zero account-set difference on 35 of 35
   documents, control passing at 22 and 101 of 200.

The quantity test remains impossible on any data we hold, because there is no
`GLU` in RR's staging or in any `jdesource_demo*`, which §2.1 re-measured.

Close UI-164 as unconfirmed, mechanism unknown. That matches what the shipped
grounding at `RRV8/config.js:529` already tells the analyst: do not assert the
cost-basis cause, the value concentrates on very few accounts, work them by
account largest first with cost accounting. Four killed hypotheses is a result.
A fifth invented to avoid an open ending is the failure mode this row exists to
prevent.

---

## 6. Open decisions for the builder

1. **Transport for the per-company fact.** Widen the payload
   `inventory-transactions.html` already receives, or add the
   `/admin/companies` fetch that page currently avoids by design. Either way,
   any new view needs adding to `ALLOWED_VIEWS` in
   `InventoryIntegrityController.java:106`.
2. **Which `checked` bullet the `Summarized` line displaces**, given the
   two-bullet cap in `Tools/check_txv_cards.py`.
3. **Whether to extract `GLU`/`GLUM` at all.** Four artifacts across two repos
   for a diagnostic-only field, and it is `NotExtracted` on every install today.
4. **The surface for the split-order disclosure**, specifically how it reaches
   rows with a blank `SubType`, which appear on no card.
5. **Whether to host the summarization fixture inside Demo3 or as a fourth
   dataset.**
6. **Whether the "on both demos" phrasing in the CNJ card's `context` array gets
   fixed now or with UI-167.** It is a live defect either way.
