# Shared figure registry (UI-71)

Every number an analyst can see on two RRV8 surfaces at once, and the single
function that produces it.

Numbers only. Status colour and state tokens are governed by
[`shared-state-registry.md`](shared-state-registry.md), which is normative about
which colours exist and what each one claims before it is a directory of
producers. Tolerances and thresholds stay here; they are figures.

## Why this file exists

On 2026-08-09 four analyst surfaces disagreed with each other, and only the
wrong one was ever loud:

| Surface A | said | Surface B | said |
|---|---|---|---|
| Home model band | 27 classes / 16 accounts | Model Review page | 22 / 14 |
| Home model band | 801 items | Model Review page | 440 items |
| Home day-brief chip | 5 excluded classes | Home model band | 2 |
| Home roll-forward band | clean | Roll-forward page | 14 accounts unevaluated |

All eight figures were arithmetically correct. They were computed at different
grains, from different sources, by different code, and nothing forced them to
agree. Every one was found by a human happening to see both surfaces in one
viewport while working on something else. None was found by looking.

`RRV8.txv` exists because nine card maps drifted into three names for one
pattern. This is the same disease in the numbers instead of the labels, and the
cure is the same: one producer, imported by every consumer.

## The rule

A figure that appears on more than one analyst surface has exactly one producer,
and that producer lives in `RRV8/config.js`. A consumer may format it, round it,
or leave it out. A consumer may not recompute it.

Where one producer genuinely cannot serve two grains, both grains get a name in
the label. "801 rows" and "440 items" are both honest. "801 items" was not.

## Grain vocabulary

These words mean one thing across the product. Do not use them loosely.

| Word | Grain |
|---|---|
| row | one row of the source view, whatever that view's grain is |
| item | distinct (short item, branch) |
| slice | distinct (company, GL class, stocking type) &mdash; the verdict grain |
| class | distinct (company, GL class) &mdash; the DMAAI 4152 fix grain |
| break | a roll-forward row failing on either axis, counted once |
| account | distinct (company, long account) |

## Registry

### Excluded GL classes

Producer: `RRV8.excluded` (`slices`, `progress`, `byClass`, `sliceKey`).
Source: `v_integrity3_exc_glc` plus `/inventory/integrity/excluded-class-reviews`.

| Consumer | Reads |
|---|---|
| `home.html` &rarr; `_analystExclusionCounts` | slices + progress, feeds the model band and the model check |
| `home.html` &rarr; `_analystModelCheck` | the same object, so the AI day-brief fact and the band cannot diverge |
| `accounting-model-review.html` &rarr; `excludedSlices` / `_exclProgress` / `_exclSummary` | table, footer, verdict banner, AI lead, AI fact lines |

`GET /inventory/integrity/model-approval` no longer feeds any count on Home.
Its `report3Count` is `report3.size()`, the raw row count, and its
`report3GlClassCount` ignores recorded verdicts. Both fields are honest and
neither answers what the analyst is being shown. The endpoint still owns the
approval verdict and the drift fingerprint, which are its actual job.

Measured on Demo1 company 80002: 801 rows, 440 items, 10 slices, 5 classes,
2 of them still open, $140,346.16 total. SUPP alone is 509 rows and 185 items,
which is the pair that used to be printed as one number.

### Account roll forward

Producer: `RRV8.rollForward` (`tok`, `normRow`, `classify`, `summary`).
Source: `v6ui_raccountsummary`.

| Consumer | Reads |
|---|---|
| `home.html` &rarr; `_briefData` | per-company `summary()`, stored as `c.rf`; `c.breaks` is its break count |
| `home.html` &rarr; `_analystRollForwardCheck` | `c.breaks` and `c.rf.unk` for the band and the AI fact |
| `inventory-account-rollforward.html` &rarr; `breakSummary` | the corrective band, the Reload GL prompt, the AI brief |

Three buckets, and the third is the one Home never had:

- `gl` &mdash; F0902 does not tie to posted F0911. Run R099102 in JD Edwards
  first, then Reload GL.
- `varc` &mdash; the variance did not carry forward. No manual step; it
  re-clears on the next refresh.
- `unk` &mdash; no prior period to roll forward from, so the row was never
  compared. Amber and named. A baseline row is not in this bucket: it is the
  opening snapshot, so having no predecessor is what the label means.

`breaks` counts distinct broken rows. A row broken on both axes is one broken
row. Adding `gl.rows + varc.rows` reports it twice, which is invisible while
every consumer tests `> 0` and wrong the day one of them prints it.

### Data integrity reports

Producer: `RRV8.integrityCount`.
Source: `v_integrity4_uom_conv`, `v_integrity5_gl_class`, `v_integrity7_frozen_cost`.

| Consumer | Reads |
|---|---|
| `home.html` &rarr; `_analystIntegrityCheck` | `.items` for the Integrity Review row and the AI fact |

Home called `rows.length` "N items flagged". The Reports badge on
`inventory-asof.html` called the identical figure "N rows in scope". Measured on
all three demos, rows equals distinct item by branch for all three reports, so
nothing on screen was wrong. It is not guaranteed: `v_integrity5_gl_class`
carries Location and Lot, and one item on two locations with a branch/location
class split is two rows for one item. No demo has that shape.

Checking which of the two surfaces was right is what turned up that the badge
had not existed for some time. `badge-uom`, `badge-frozen-cost` and
`badge-gl-class` appear in no markup in this repo; the Reports drawer moved to
Home's Data Health tab and left its counter behind. The dead code fired three
`POST /inventory/integrity` calls on every company scope change and threw all
three away. Removed.

### Cardex variance

Producer: the shared session cache under `cardexCacheKey()`.

| Consumer | Reads |
|---|---|
| `home.html` &rarr; `autoWarmCardex` | writes the cache, already filtered to the proc tolerances (qty 0.05 / amt 0.005) and with `Reset:` kept for the detail banner |
| `home.html` &rarr; `_cardexRead` / `_analystCardexSummary` / `_analystCardexFacts` | chip, Cardex Variance tab, AI facts |
| `inventory-cardex-variance.html` &rarr; `readCardexCache` | the item worklist |

This one was already single-source and stays that way. The floor is applied once,
by the writer, so a reader cannot forget it. Both sides also share the
signed-versus-magnitude convention: magnitude decides whether anything is off,
the signed net is what gets displayed, and the gross is shown alongside when
offsetting items would make the net read clean.

### The viewed period

Producer: `_analystViewedPeriod()` in `home.html`. A clicked period bar
(`_briefPeriodOverride`) wins; otherwise the `#periodSelect` value.

| Consumer | Reads |
|---|---|
| `renderTxVarWidget` &rarr; `focusedPeriod` | which bar is active and which period the chart's headline totals |
| `renderAnalystTxVar` &rarr; `focusP` | the Transaction Overview header, the cards, the period-review record |
| `_briefData` &rarr; `perKey` | the per-company period slice the whole brief is built on |
| `_analystBriefLead` | the `VIEWED PERIOD` fact handed to the AI day-brief |
| the analyst ask box | its `focusPeriod` fallback |
| `renderPeriodWidget` &rarr; `activeP` | the accountant chart's active column |

Five private copies of the same expression existed before 2026-08-12. They all
agreed, so nothing broke &mdash; but the word "period" did not mean one thing on
this page, and that is what the rest of this section is about.

**Three different periods are all called "period" on the analyst surface.** They
are not interchangeable and the copy must say which one it means:

| | What it is | Where it shows |
|---|---|---|
| viewed | the period the analyst selected | every panel header |
| open window | the last two periods carrying residual, still actionable | the AI grounding |
| data-current | the latest period loaded | the scope band ("numbers current to&hellip;") |

UI #449 pulled these apart on the chrome pill. They were still colliding inside
the panels: an amount that lived entirely in the open window's *older* period was
printed as "this period" on a screen showing the newer one.

### Transaction variance: two measures, one word

There is no single producer here and there cannot be. Two structurally different
measures of "the variance for this period" sit within a few inches of each other,
and both are correct.

| | Roll-forward net | Reconciling items |
|---|---|---|
| Producer | `_txvRfSeries` / `sourceTotal` | `_txVarBucket` &rarr; `_txVarCache`; `netTotal` |
| Source | `v6ui_raccountsummary.Variance` via `_invRows` | `RCardexLedgerCompare2` where `recstatus = 1`, via `POST /inventory/transactions` with `period: null` |
| Population | every posted non-manual row, any size | posted documents over the materiality threshold, `batchstatus = 0` |
| Grain | account | document |
| Drawn by | the period chart + its headline | the Transaction Overview figure + every card |
| Periods carried | all of them | only those with residual |

They do not tie in either direction. On Demo3 co 30002 the residual is *larger*
than the roll-forward net at Mar 31 2023 ($83,371.62 against $81,362.57), so
"the narrower population gives the smaller number" is not a rule you can lean on.

Because one producer cannot serve both, the registry's other clause applies:
**both grains get a name in the label.** The chart says `Roll-forward net`; the
Overview figure says `Reconciling items`. Neither says a bare "variance" any more.
The Overview footer states the roll-forward net alongside, but only when the gap
clears $1 &mdash; below that it is rounding, and printing it every period is noise.

Both writers of the residual cache (`renderTxVarWidget` and `_txvRows`) send the
same body and bucket the same way, and every reader key-checks before trusting it.
The **open window** is now `series.slice(-2)` computed from the cache, not read out
of `_txVarContext`: that object is written only by `renderTxVarWidget`, so the
day-brief's window was two periods if the analyst had opened the Transaction
Variance tab and one if they had not. Same brief, same data, different amount,
depending on where they had clicked.

Measured 2026-08-12, Demo3 company 30002, viewed period Apr 30 2023:

| Surface | Value | Why |
|---|---|---|
| AI day-brief | $76K, 5 of 12 periods | Inventory module, open window, entirely Mar 31 |
| Chart headline | $3 | roll-forward net, Apr 30, $2.54 |
| Transaction Overview | $2 | residual, Apr 30, $1.89 |

All three were arithmetically correct and every one used `RRV8.kAmount`. The bug
was that no label said which period, which grain, or which population &mdash; and
the AI called a March figure "current-period" while the analyst looked at April.

### Model baseline routings

Producer: `GET /inventory/integrity/model-baseline` (`v_integrity1_aai_base`).

Home's band and the Model Review page's baseline table read the same endpoint.
The view is already scoped to the company's `RCompanies.AAIDocType`, so the
narrowing is structural rather than a client-side guess at which document type is
live. Home narrows to `TableNumber = 4152` and the scoped company and counts
distinct GL classes and accounts; the page renders the rows. Verified live:
band caption 22 classes routing to 14 accounts, page 22 rows.

The band used to read `v8ui_dmaai_routes`, which carries every document type on
4152. On a demo company that view holds three types, so the band summed the
union and reported 27 classes routing to 16 accounts against the page's 22 and
14.

## Regression harness

`RRV8/_uitest/ui71.html` runs the real producers over real demo rows and compares
against measured queries. Open it at
`http://localhost:8765/RRV8/_uitest/ui71.html`. It needs no token and touches no
`localStorage`.

Its fixture is gitignored because this repo is public and a committed fixture
would go stale without saying so. The SQL that builds it is in the page's own
header comment. If a demo database is reloaded, re-measure the expectations
rather than relaxing an assertion.

Static checks do not cover this class of bug. `parsecheck.py` proves the file
parses and `bootrefs.py` proves nothing reads a shared global at parse time.
Neither can tell you that two correct functions disagree.

## Adding a figure

1. Does it already appear somewhere else, under this name or another? Search the
   grain vocabulary above, not just the variable name.
2. If yes, import the producer. If the existing producer cannot serve your
   grain, extend it there and name both grains in both labels.
3. If it is genuinely new and a second surface will want it, put it in
   `config.js` now rather than after the second copy exists.
4. Add a case to `_uitest/ui71.html` with a measured expectation.
5. Add a row to the registry above.
