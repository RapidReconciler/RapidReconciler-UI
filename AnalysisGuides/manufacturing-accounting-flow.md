# Manufacturing accounting flow — which program updates which table

Owner-supplied reference, 2026-08-03. This is the authoritative sequence for
work-order manufacturing accounting in JDE and the table each step touches. It is
the ground truth for reasoning about any cardex-vs-GL variance on a manufacturing
document type (IM, IC, IH, IV).

| Step | Program | F4801 Work Order Header | F3111 Parts List | F31122 Routing Hours | F3112 Routing File | F3102 Variances | F4111 Item Ledger | F0911 GL Detail | F0902 GL Balance |
|---|---|---|---|---|---|---|---|---|---|
| Attach Parts List / Routing | R31410 | Quantity on Order updated | Required Quantity updated | | Required Hours updated | Standard & Current Units and Amounts | | | |
| Material Issues | P31113 | | Quantity Issued & Unaccounted Units updated | | | | **IM transaction written (no batch # or G/L date)** | | |
| Hours and Quantities | P311221 | | | Hours Reported updated | | | | | |
| Hours and Quantities Update | R31422 * | | | Processed Flag updated | Unaccounted Units updated | | | | |
| Work Order Completions | — | Quantity Completed & Unaccounted Units updated | | | | | **IC transaction written (no batch # or G/L date)** | | |
| Manufacturing Accounting | R31802A | Unaccounted Units reset to blank | Unaccounted Units reset to blank | | Unaccounted Units reset to blank | Planned, Actual, Completed and Scrapped Units and Amounts | **IM & IC batch # and G/L date updated** | **Journal entries created for IM, IC & IH** | |
| Variance Accounting | R31804 | Variance Flag updated | | | | | | Journal entries created for **IV** | |
| Journal Entry Batch Post | R09801 | | | | | | | | Account Balances updated |

\* Hours and Quantities Update (P31422) also updates the data seen in Order Hours
Status (P31121).

## What this settles

**The batch number is written by R31802A, not by the completion.** Material
issues (IM) and completions (IC) land in F4111 with **no batch number and no G/L
date**. R31802A stamps both onto the existing F4111 rows *and* creates the F0911
journal entries in the same step.

So on any IM / IC cardex row:

- **Batch number present ⇒ R31802A ran for that transaction, and the F0911
  journal entries were created.** The two happen together. "The accounting
  program never ran" is therefore not available as a root cause for a row that
  carries a batch.
- **Batch number and G/L date absent ⇒ R31802A has not processed it yet.** That
  is the literal, un-journaled state.

**Unaccounted Units is the standing diagnostic.** R31802A resets Unaccounted Units
to blank on F4801, F3111 and F3112. So work orders still carrying unaccounted units
have completions and issues that manufacturing accounting has not picked up. That
backlog is checkable at any time and is the thing to monitor to prevent recurrence
rather than to discover after the fact.

**R09801 only updates F0902.** The post moves account balances; it does not create
or remove F0911 detail. So unposted journal entries still exist in F0911. Any
comparison that reads only posted GL activity — or reads F0902 — will present an
unposted batch as a missing entry when the detail is in fact present.

**Variance (IV) entries come from a different program.** R31804 creates the IV
journal entries and sets the Variance Flag on F4801. A missing IV entry is an
R31804 question, not an R31802A one.

**There is no such thing as reposting a completion through R31802A.** Two facts in
the table above close it off together: the run stamps the cardex batch, and the same
run resets Unaccounted Units. Unaccounted units are what drive the program's
selection, so once it has run there is nothing left for it to pick up. Telling an
analyst to repost is not merely mislabelled, it is inert. Any surface that prescribes
it is prescribing a remedy that does not exist.

## The population is `RCardexLedgerCompare2`, always

**`RCardexLedgerCompare2` is the document source of truth for transaction
variances — the sole reason the table exists is to list the documents that need
analysis. Any other document in a result set is wrong.** (Owner ruling
2026-08-05, HARD.) `RCardexLedgerCompare` without the `2` is the pre-netting
table holding both sides of everything; counting from it produces figures that
describe the whole ledger and mean nothing about the variance population.

**Scope to `recstatus = 1`, never `< 2`** — `recstatus = 2` rows have already
been resolved by server-side processes and are not analysis work. Full
statement and worked failures in `transaction-detail-analysis.md` § Section 0.

## Grain: what you may and may not aggregate

Owner rulings, 2026-08-05. These govern every manufacturing comparison and each one
invalidates a reading that looks obviously right.

**Batch cannot be used to aggregate manufacturing amounts.** A work order sits on the
floor for weeks. It issues material many times on different days, and **each issue gets
its own batch.** The IC is not generated until the product is fully complete — days or
weeks after the last issue — **in a batch of its own.** So a document's cardex rows and
its GL entries routinely live in different batches, and pairing them within a batch
reports a difference where none exists.

**Doc type is part of the grain.** The IC carries labor and overhead out of WIP; the IM
does not. **An IM total will therefore never match an IC total,** and netting them is
meaningless. Compare IM against IM and IC against IC.

**The correct grain is (work order, account, doc type) across ALL batches and periods.**
Match manufacturing by the work order in `GLSBL`, never by batch and never by document
number.

Measured consequence on a specimen database: at batch grain the unclassified manufacturing
residual read **562 rows / −$11,309,997.50**. Regrained, **450 of 551 IC pairs tie to
exactly zero** and account for **$11,006,129.37** of it. That money was never a variance.
Worked row — cardex IC $305,521.99 stamped batch 3263483 on 08-09; GL IC $305,521.99 on the
**same account** in batch 3295108 on 08-25. Same penny, sixteen days later.

**3120 carries no inventory.** In JDE the WIP account is a **dollars-only holding
account**. Only **3110** (Inventory/Raw Materials) and **3130** (Sub-Assembly/Finished
Goods) belong in a cardex-to-GL inventory comparison.

⚠ **Identify WIP by its AAI, never by its F0901 description.** On the specimen database the
accounts *named* "Work in Process" were reached by **3110 and 3130**, and were the declared
inventory account for **20,875 items** (specimen figure) across GL classes MLDP / SECD /
PRSP / SUBC / SUBA. Excluding on the description would have deleted **837 legitimate
inventory rows** (specimen figure). The description is a label; the AAI is the fact.

**3120 and 3401 are not absent from JDE. They are absent from RapidReconciler's derived
tables.** Measured 2026-08-10 against raw `F4095` on the three demo databases, all specimen
figures: 3120 holds 162 / 1 / 490 rows and 3401 holds 117 / 0 / 365 on Demo1 / Demo2 / Demo3.
**Every one of those rows carries a blank document type**, which is deliberate, because one
AAI entry has to serve all five manufacturing document types. That blank is what loses them.
All thirteen load levels in `usp6_002b_aai_staging.sql` carry the predicate
`mldct != '' and f.mlobj != ''`, so an entry with no document type never survives any level.
`RAccountInstr` and `v8ui_dmaai_routes` held zero rows for either AAI. **Fixed 2026-08-10:**
the blank-doc-type predicate came out of all thirteen levels, and both AAIs now stage and reach
`RAccountInstrExp`, which is where `v6_003_expanded_aais_exp` always intended them — that view's
exclusion list never named 3120 or 3401. `RAccountInstr` is unchanged and still holds neither,
correctly, because it carries only the DMAAI tables that hold inventory accounts. The lesson
outlives the fix: **an empty derived table says nothing about a customer's JDE setup, and any
absence question has to be answered against raw `F4095`.**

**3210 is not part of that gap — it loads.** Same measurement, Demo3: 62 raw `F4095` rows,
**none** with a blank document type, and `rdmaaistaging` holds 621 expanded rows for table
3210 (specimen figures). 3220 and 3240 load as well, at 8 staging rows each. 3210 is absent
from `v8ui_dmaai_routes`, and that absence is correct — the view is scoped to a fixed list of
DMAAI tables that hold **inventory** accounts (`3110, 3130, 4122, 4126, 4134, 4162, 4172,
4240, 4310, 4365, 4385, 4400`, per `v8ui_dmaai_mismatch_active.sql`). 3210 clears WIP to COGS
and holds no inventory account, so it does not belong there. **Absence from that view is not
absence from the loader.** An earlier revision of this guide asserted 3210 was excluded
alongside 3120 and 3401 without measuring the staging table, and it was wrong.

**A shared 3110 / 3130 account is not a net-zero defect.** SME ruling, 2026-08-10: net zero
applies only to a valid DMAAI pairing, and 3110 with 3130 is not one. Net zero means the debit
AAI and the credit AAI **of the same transaction** resolve to a single account. In
manufacturing that gives two tests:

| Transaction | Debit | Credit | Net zero when |
|---|---|---|---|
| IM material issue | 3120 | 3110 | 3110 and 3120 resolve to the same account |
| IC completion (and IS scrap) | 3130 | 3120 | 3120 and 3130 resolve to the same account |

3110 and 3130 sit at opposite ends of two different transactions with WIP in between, so
pairing them tests nothing. An IM and an IC are separate events and get analyzed that way.
Where a customer points 3110 and 3130 at one inventory account, assume it was intended,
particularly at a site that runs a single inventory account. Do not raise it as a finding.

(IH pairs 3120 against 3401, but 3401 is a P&L accrual rather than an inventory account, so a
shared account there is a different question and not an inventory net-zero.)

## Unit-cost history: `F4111` ordered by `ilukid`

JDE has no unit-cost history table, and `F4105` / `F30026` are current-state only — so
comparing a transaction's `iluncs` to today's `F4105` proves nothing. **Order `F4111` by
`ilukid` within (item, branch) and read `iluncs` transaction by transaction. The steps are
the cost changes.** The roll journals itself in the cardex as its own row: doc type **`IB`,
quantity 0, and `iluncs` = the cost DELTA**, not the new cost.

Worked chain, item 700100 at one branch: `0.0514` → `IB` +0.0002 → `0.0516` → `IB` +5.4629
→ `5.5145` → `IB` −1.6779 → `3.8366`, which is exactly the current `F4105` value. Every step
reconciles.

Consequence: **"the transaction cost differs from the current standard" is not a finding.**
It is usually just a later roll. The real test is whether the cost was the *prevailing* cost
at its own `ilukid` position.

⚠ Branch codes in `F30026` and `F4111` are **left-padded** (`'        P027'`). `rtrim()`
alone matches nothing. Use `ltrim(rtrim(...))`. A filter returning zero rows against a table
you just proved is populated is this.

## Two cost sources on one transaction: `F4105` prices the cardex, `F30026` prices the GL

**Owner SME ruling, 2026-08-14.** When an IM or IC for manufacturing is written to the
cardex, the cost is taken from `F4105`. When R31802A builds the GL distribution, the cost
is built from the `F30026` cost components. **If the component total does not equal the
`F4105` cost, that gap is a variance, and testing for it is a routine check on any
manufacturing document.**

The sign follows the documented convention (`Variance = ledger − cardex`), so the
prediction is `(sum of components − F4105 cost) × transaction quantity`.

⚠ `F30026`'s payload columns read backwards from their names. **`iecost` holds the
cost-component CODE** (`A1`, `A2`, `B1`, `B3`, `D1`); **`iecsl` holds the AMOUNT.** Read
that out of the data, never off the name. Every row on the specimen carries ledger `07`,
so join `F4105` on `coledg = '07'`. The left-padding warning above applies to `iemmcu`.

```sql
with comp as (
    select ieitm, ltrim(rtrim(iemmcu)) as mcu, sum(iecsl) as comp_total
    from dbo.f30026 where ltrim(rtrim(ieledg)) = '07'
    group by ieitm, ltrim(rtrim(iemmcu))
),
cost as (
    select coitm, ltrim(rtrim(comcu)) as mcu, councs
    from dbo.f4105 where ltrim(rtrim(coledg)) = '07'
)
select l.ildoco, ltrim(rtrim(l.ildct)) as dct,
       sum(l.iltrqt * (c.comp_total - k.councs)) as predicted_variance
from dbo.f4111 l
join comp c on c.ieitm = l.ilitm and c.mcu = ltrim(rtrim(l.ilmcu))
join cost k on k.coitm = l.ilitm and k.mcu = ltrim(rtrim(l.ilmcu))
where ltrim(rtrim(l.ildct)) in ('IM', 'IC')
group by l.ildoco, ltrim(rtrim(l.ildct));
```

Join that to `RCardexLedgerCompare2` on `OrderNumber` + `DocType` and compare
`predicted_variance` against `Variance`.

**Measured 2026-08-15 on a specimen database, all specimen figures.** `F30026` summed to
(item, branch, ledger 07) joins `F4105` on 122,816 keys: **119,381 tie exactly, 3,435
carry a gap.** Against that database's manufacturing variance population (`recstatus = 1`,
`Type = 'Mfg'`, 4,999 rows):

| Doc type | Orders carrying a gap item | Of those, predicted variance ties within $0.01 | Orders with no gap item | Ties |
|---|---|---|---|---|
| IC | 266 | **247** | 1,944 | 0 |
| IM | 81 | **36** | 2,707 | 0 |

283 rows and **$34,303.99** are explained to the penny by that one subtraction — 5.7% of
the rows, so it is a screen rather than the dominant cause. **The zero column is the
control:** not one of the 4,651 rows without a gap item ties by accident.

Worked row (specimen): an IC completion of 800 units. `F4105` ledger 07 for the item is
**0.0000**, and the cardex row's `iluncs` is **0.0000** for an extended value of **$0.00**
— the cardex leg took the `F4105` cost. `F30026` holds five components on the same item
and branch: A1 1.8005 + A2 0.2878 + B1 1.3922 + B3 0.9014 + D1 0.0838 = **4.4657**. The
posted `F0911` IC line is **$3,572.56**, which is 4.4657 × 800, and
`RCardexLedgerCompare2.Variance` is **3,572.56**. Both legs, both sources, one penny.

**The dominant shape is a standard that was never rolled:** 243 of the 247 explained IC
rows sit on an item whose `F4105` cost is exactly zero while its components carry value.

**What the measurement can and cannot distinguish.** `F4105` and `F30026` are
current-state only — the same limitation this guide already records for `iluncs`.

- A **hit is strong.** A historical variance reproduced to the penny out of today's two
  tables means neither side has moved since, so the gap is standing and preventable.
- A **miss is not evidence of absence.** Either side may have rolled after the transaction
  posted, and neither table holds history. A zero prediction rules the component gap out
  *today*, not on the G/L date.
- The test **cannot** separate a component gap from a later cost roll on a row where the
  arithmetic does not land. Read the `iluncs` chain by `ilukid` first.

**Counter-example, and the precondition to check before trusting a zero.** On a second
specimen database `F30026` holds **zero rows** against 20,497 in `F4105` — the extract
loaded the item cost and not the components. **Confirm `F30026` is populated before
concluding anything from a zero prediction.**

The row that prompted the ruling sits on that database: an IM at company 30001, period
2023-05-31, cardex **−57,245.60**, ledger **−57,252.64**, variance **−7.04**. Measured:

- Two cardex IM rows, −55,997.116532 and −1,248.480000, sum to the cardex figure.
- Three `F0911` IM lines on the same account, batch and G/L date: −55,997.12 and −1,248.48,
  which match those two cardex rows after 2-decimal rounding, plus a **third line of −7.04
  carrying no cardex counterpart.** The whole variance is that extra line.
- Against `F4105` (ledger 02 there; no ledger 07 row exists for either item) the
  transaction cost differs from the current cost by −$2,235.54 on one item and −$14.56 on
  the other. **Neither is −7.04, and no combination of them is.** That route is refuted.
- `F30026` is empty on that database, so the component route **cannot be measured at all**.
  −7.04 stays **unexplained.** It matches the ruling only in shape — an extra GL line the
  cardex does not carry — and shape is not a cause. Do not book it as one.

The shape recurs there: of 549 manufacturing documents in that population, **13 carry more
GL lines than cardex rows** (−$9,772.81 together) and 20 carry fewer. Re-run the check
against a database whose `F30026` loaded before treating the ruling as tested on this row.

**Where the population already lives, and one correction.** The `F4105` / `F30026`
divergence taxonomy is authored in `frozen-cost-integrity-analysis.md` (Integrity Report 6,
the R30543-equivalent), and its **Issue Type 2, "cost in F30026 only"**, is the same
condition as the dominant shape measured above — so the analyst does not have to write this
SQL to find the items. Use that report to get the population, then this check to price its
effect per document. Two claims in that guide need reading against the measurement:

- It says a "cost in F30026 only" item has "material issues and completions post at zero
  cost." **Measured: only the cardex leg posts at zero.** The `F0911` leg posted the full
  component value on the worked row above. Both legs at zero would net out; it is precisely
  because they disagree that a variance exists.
- It routes the resulting difference to R31804 / IV. **Measured: it surfaces first as an
  IM / IC cardex-vs-ledger variance on `RCardexLedgerCompare2`,** before any IV entry.

## Consequences for a Completion Not Journaled card

The card only claims cardex rows that carry a **batch number**. By the sequence
above, a batch means R31802A ran and wrote F0911 in the same step, so the card never
contains a transaction awaiting the run. Everything on it was already processed —
confirmed at population scale: **320 of 320** card rows carry a batch. The batch
proves R31802A ran; it is not proof the F0911 entry exists.

**The leading cause is a genuine gap: the run stamped the cardex batch and wrote no
F0911 completion detail for the order.** It is what a specimen dataset shows, and no
vendor article matches it (the near miss is ruled out below). One company, 39 rows in
one period:

- All 39 work orders carry `IM` rows and **zero** `IC` rows in F0911, matched on
  company plus numeric subledger. Widened to those order numbers with **no** company
  and **no** document-type restriction: 507 rows, all `IM`. No `IC` anywhere.
- F3106 holds 543 cross-reference rows covering all 39, so the run did process them.
- The 7 batches involved hold **1,080 `IC` rows** — posted, matching document
  company, every one with a numeric subledger. Summarization did not drop the
  subledger here.
- 37 of the 39 sit on one short account that carries **293 `IC` rows in those same
  batches for 260 other orders.**
- The shape is standing, not a one-off. Every period from January to August 2025
  carries it (42, 51, 57, 25, 14, 71, 39, 21 rows), across order types `WO` / `WR` /
  `W1`. The 39 rows in one period sit on **7 distinct G/L dates spanning three weeks**,
  one date per batch, so the miss follows the runs rather than a single bad day. Each
  period ran **4 to 11 batches**, essentially one per business day the job fired.
- Across all **58 batches in the 8 periods, every batch journaled the large majority
  of its completions and dropped a slice, and not one batch was empty of completions.**
  The dropped share ranges **0.6% to 24.6% per batch** and **3.2% to 11.3% per
  period.** A ~40x swing between the best and worst run says run conditions modulate
  the severity without ever eliminating it. This is a partial-run failure repeating on
  every run, not one bad run.

Same run, same batches, same account: 260 orders got their completion entries and
these 39 did not. The specimen queries want repeating against a customer database to
settle it beyond one dataset.

**Match failures are the secondary set.** Each was refuted on that specimen, but they
remain real at other sites, so rule them out with the batch lookup rather than
assuming them:

- **The GL detail exists but the correlation cannot see it.** It landed under a
  different document company, a document type the correlation does not count, or with
  no work-order subledger at all because the run summarized the journal entries.
  Summarization combines entries by account across work orders and drops the order
  number; summarizing material issues *within* the work order keeps it.
- **The GL detail exists in JDE but not in RapidReconciler's copy.** The F0911 pull
  is windowed on G/L date, 35 days back by default, so a backdated manufacturing run
  drops the population while the cardex rows are present.

Read the batch **for the work order**, not just for the batch. The specimen batches
were full of `IC` rows; none of them belonged to the 39 orders on the card. A batch
that holds completions is not evidence this order's completion is among them.

An unposted batch is *not* one of the causes. RapidReconciler loads unposted F0911
and the correlation has no posted filter, so an unposted completion suppresses the
card. That break surfaces as a GL Batches variance instead.

Document renumbering is a related reason manufacturing document types must match by
subledger rather than document number, but it is not itself a cause of this card:
the correlation never looks at the document number.

**Prevention.** Have whoever runs R31802A read the error report that run produces,
starting with the run that stamped these completions. Then pursue the R31802A
behaviour with Oracle through the customer's own IT department, which owns the
support contract. Ask for it as an **undocumented condition, not as KB 420628** —
naming the wrong article invites a remedy built for a different cause.

## Near miss, tested and ruled out: Oracle Support KB 420628

Oracle Support **KB 420628**, *"E1: 31A: When Running (R31802A) Manufacturing
Accounting No IM Journal Entry Or Batch Number Created In (F0911) But Cardex Is
Updated Correctly"*, last updated 2025-11-15. Applies to JD Edwards EnterpriseOne
Shop Floor Control, version XE and later.

**What the article states** (retrieved in full). When Manufacturing Accounting
(R31802A) is run, no
journal entries and no batch number are created in the G/L (F0911), while the record
in the P4111 / F4111 cardex is updated correctly. The example: a work-order
inventory issue is performed via P31113 and the cardex is correctly updated with the
IM transaction for a component; R31802A runs and the existing cardex IM record **is**
correctly updated with a batch number — but no journal entries and no batch number
are written to F0911. The batch therefore does not appear in the R09801 report and
**cannot be posted**.

**Its cause and remedy, both stated in the body.** The trigger is an issue quantity
(`TRQT`, 4 decimals) below **0.0050**. The part list cost field `CTS1` in F3111 carries
only 2 decimals, so a quantity that small rounds `CTS1` to blank, and without a value
there R31802A cannot write the journal entries. The remedy Oracle gives is **manual
journal entries** — accounting work, not analysis, and not a prevention.

**Two grounds rule it out. Only the second carries the ruling:**

- **Shape — inverted, and this is the decisive ground.** The article's symptom is the
  IM's **own** entry missing from F0911. This card is the opposite: across the full
  card population IM is present in volume (5,059 F0911 rows for those work orders,
  every one of them IM, zero IC) and only the completion is absent. The article's
  failure mode striking IM would **suppress** this card rather than create it. This
  ground is precision-independent and generalizes to any dataset.
- **Quantity — true here, but does not generalize.** No row in the population
  qualifies: the smallest issue quantity anywhere is `0.0100`, twice the threshold.
  ⚠ Do **not** lean on this ground alone. The specimen database's sanitization
  quantized quantities to 2 decimals, so the article's precondition is structurally
  impossible there — the test cannot fail in that data and therefore proves nothing
  about a customer's live data.

**Untested, and not to be dismissed:** whether a blank `CTS1` could block only *part*
of a run's output — the completion leg while the issue leg still writes. The article
does not address it. RapidReconciler does not load F3111 at all, so `CTS1` is not
reachable from an RR database or an export; settling it takes a query against the
customer's own part list.

**The stranded state is still the point,** whatever the cause turns out to be. The
batch is stamped on the cardex, no GL detail exists, the batch cannot be posted, and
R31802A will not reprocess because the unaccounted units are already cleared. That
combination is why the transaction is stuck — and why "repost" is inert.

Cite it as: Oracle Support KB 420628, retrieved in full, **a near miss ruled out on
shape — never as a match.**
