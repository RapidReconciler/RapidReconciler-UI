# Analyst Reference — transaction-variance root-cause → corrective-action knowledge base

**Status:** THREE MODULES AUTHORED, OWNER SME PASS APPLIED 2026-08-27. Scaffolded 2026-07-07
(structure + schema). **Intercompany Order processing authored 2026-08-06** from measured evidence plus
owner rulings. **MTO and Cardex variance drafted 2026-08-27** on the same method, per the owner's ruling
that Claude drafts and the owner corrects the SME calls. **Every SME call raised in this file was
answered by the owner on 2026-08-27 and the answers are written in below** — there are no open questions
here. One item is an open *investigation* rather than an open question: the MTO both-differ mechanism
needs a measurement, not a ruling, and the module says so where it matters. This is the analyst-side
companion to the accountant
[`accounting-reference.md`](accounting-reference.md). Worklist: **UI-24**. Full process design + the
closed-card/convergence model live in [`transaction-variance-process.md`](transaction-variance-process.md).

⚠ **This file is NOT the source of `RRV8.ANALYST_GROUNDING`, and the earlier header here said it would
be.** Verified 2026-08-27 against `Tools/build-ai-grounding.py`: `ANALYST_GROUNDING` is generated, but
from `AnalysisGuides/_catalog/analyst/transaction.md` + `period-workflow.md`, with the `_core.md`
invariants composed in — a `grounding`-fenced block lifted verbatim, prose outside the fence ignored.
`CARDEX_GROUNDING` generates the same way from `_catalog/analyst/cardex.md`. So this reference is an
authoring source for a human, and a module reaching the AI is a **separate, deliberate step**: distil it
into the matching `_catalog` fence and re-run the generator. Editing this file alone changes no AI answer.

## Mission (owner-confirmed 2026-07-07)

Drive the recurring transaction-variance residual to **zero at the source** — so inventory-to-GL ties
on its own, period after period, without correcting entries. The analyst finds the root cause of a
variance and fixes it at the SOURCE (config / order-process / re-roll); **the analyst never posts a
journal entry** (that's the accountant — [[project_analyst_accountant_role_split]]). Every module's
corrective-action ladder serves this one goal.

### The role axis — stated once, and every module inherits it

Owner-confirmed 2026-08-27, and this is the whole test:

> The analyst's lane is making JDE produce correct postings going forward — even when that action itself
> posts. The accountant's lane is the GL's current state being wrong: value in the wrong account, or
> value that never arrived.

The analyst owns prevention at the source; the accountant owns correcting what the GL says today. A
source-side action stays the analyst's **even when it writes GL entries** — a dollars-only P4114
inventory adjustment is the analyst's for exactly that reason, because it is a JDE source action. And a
real value gap that never reached the GL is the accountant's, because the GL's current state is wrong,
whether or not anything posted. Do not re-derive this per module; the ladders below cite it.

⚠ **The axis is analyst-versus-accountant only.** It does **not** decide the analyst-versus-administrator
boundary — whether an RR Administrator function belongs in an analyst's ladder is a separate question,
settled separately below (`MTO-GL-WINDOW` and `CX-RELOAD-CARDEX`, owner 2026-08-27): the ladder **names
the request** as its own rung, so the analyst gets a complete actionable path and the resolution is
still countable.

⚠ **"re-roll" above, and in the schema below, is a retired verb — left in place because the surrounding
text is owner-confirmed, flagged so it does not propagate.** The manual per-company re-roll was replaced
by an unconditional full-timeline recompute that runs on every refresh, and the card was cut from the
roll-forward page ([[reference_varok_break_resolution]]). The item-level control on the cardex page is
Adjust Beginning Balance. No ladder in this file should ever prescribe a re-roll.

## Structure — two layers, one schema per module

**(A) Foundational layer — DMAAIs.** The AAI-config substrate every order process resolves through.
Do NOT re-author it here — reference the existing **[[dmaai-reference]]** + `AiService.DMAAI_GROUNDING`.
Each process module below cites the specific DMAAIs it touches.

**(B) Process / variance modules.** One section each, all on the same **5-part schema**:
1. **Process** — the JDE flow (docs → F4211/F4311 → F4111/F0911).
2. **Root cause(s)** — why a residual is left (config / timing / missing linkage / sign).
3. **RR signals** — which Transaction-Variance card/subtype + fields surface it (ties to the DAC-16
   10-card taxonomy — the connective tissue between this KB and what the analyst sees).
4. **Corrective-action ladder** — the ONE best SOURCE fix first (DMAAI/config → order/process setup →
   re-roll/reload), by return-on-effort, + anti-patterns. **Never a journal entry** (hand a real,
   unfixable residual to the accountant).
5. **Related DMAAIs** — cross-links into the foundational reference.

---

## Module: MTO (Make-to-Order) processing

**Make to Order is a BUSINESS GROUPING, not a variance type.** `usp6_008` stamps the subtype on a
work-order row whose originating sales order carries the work order on the sales side
(`vcr_f42119.sdrorn` = the work order), so one job's costs stay on one card linked to the customer
order. What sits inside that group is ordinary manufacturing cardex-vs-GL variance. Diagnose it as
manufacturing; the MTO label only says which job it belongs to
([`transaction-detail-analysis.md`](../../AnalysisGuides/transaction-detail-analysis.md) §5.20).

**Rule out two things before spending any time.** The inventory routings resolve to the same account
as the 4152 cardex model — the routing check comes back clean, so there is no AAI to chase here. And
the sales orders shipped and closed (status `999` in `vcr_f42119`), so there is no stranded in-transit
leg waiting to net. Both established §5.20.

**The order types are `WO`, `W1` and `WR` — three, not two — and they are read off the SALES-ORDER
line, not off the work order.** The shipping build proc selects
`vcr_F42119` rows where `sdrorn` is non-zero and the trimmed **related order type** `sdrcto` is one of
those three, and the proc's own assert header says the same (`usp8_txv_build.sql`, subtype-mto build,
measured 2026-08-27). The guide's pairing-family table lists only `WO` / `W1` and **is wrong**; where
the two disagree, this is current. Carry the precision the guide loses: `sdrcto` is the *related* order
type carried on the sales-order line, not the work order's own document type. Order-type codes live in
UDC `00/DT` and are customer-defined — name the family first and read the codes the instance in front of
you actually uses.

### Process

An MTO job is one work order plus the sales order that originated it, and the two sides post through
different programs on different clocks.

- **Sales-order lines resolve through `vcr_f42119`** (the union of `F4211` open/active and `F42119`
  history), never either table alone. An empty `F42119` is a valid customer purge-processing choice,
  not missing data — a customer who does not purge leaves closed lines in `F4211` at status `999`.
- **The WO's completions load finished goods; the originating SO relieves it at ship.** A residual
  between those two events is open WIP/FG timing, not a mapping error.
- **The GL document number is not the cardex document number.** R31802A posts the manufacturing GL
  under its own renumbered document and carries the work order in the F0911 subledger (`GLSBL`,
  subledger type `W`, zero-padded). Match key is **subledger primary, F3106 fallback** — not all
  customers populate `GLSBL`, so F3106 has to stay ([[reference_wo_completion_gl_match_by_subledger]]).
- **The correct grain is (work order, account, doc type), across all batches and all periods.** A work
  order issues material many times, each issue in its own batch, and the completion is journaled in a
  batch of its own days or weeks later — so a document's cardex rows and its GL entries routinely live
  in different batches. Compare IM to IM and IC to IC: the IC carries labor and overhead out of WIP and
  the IM does not, so an IM total will never match an IC total ([[reference_mfg_grain_not_batch]]).
- **3120 (WIP) carries no inventory** — it is a dollars-only holding account. Only 3110 and 3130 belong
  in a cardex↔GL inventory comparison. Identify WIP by AAI, never by the F0901 account description: on
  one specimen the accounts *named* "Work in Process" are reached by 3110 and 3130 and are the declared
  inventory account for 20,875 items.
- **Manufacturing activity is identified by F0911 batch TYPE, not doc type.** Batch type `0` = work-order
  batches; a client with no batch type `0` does no manufacturing at all, and doc type `IM` can be
  repurposed as an adjustment ([[reference_batch_type_discriminates_manufacturing]]).

### Root cause(s)

- **Match-key artifact — the residual is not a residual.** Pairing cardex to GL on document number or
  batch strands manufacturing rows that are actually journaled. Measured on a specimen "Unclassified —
  Manufacturing" population: 452 of 647 IC rows / £11.0M tie **exactly** once matched by subledger. Regraining
  a second specimen off batch tied 450 of 551 IC pairs to exactly zero, $11,006,129.37 that was never a
  variance. Establish this before reading any MTO figure as money.
- **Completion written to the cardex with no GL completion detail for that order.** The cardex-only
  shape. The batch on the cardex row is **non-zero**, so R31802A already processed the transaction —
  batch `0` means unposted, batch `> 0` means the GL posted and the match is failing on the key. Most
  often the run wrote no completion detail for that particular order while journaling other orders in
  the same batch normally (§5.19, and no vendor article matches the shape).
- **Both-differ: cause UNCONFIRMED, and the obvious answer was tested and rejected.** This slice was read
  as a standard-vs-actual cost-basis difference; tested 2026-08-04 against a verified population, the
  profile does not fit. A standard-versus-actual gap should be a modest share of the transaction and fall
  either side of it; instead most of the value sits on rows where the gap exceeds **half** the item-ledger
  amount, and the GL side is the larger one in about **two thirds** of the rows and the large majority of
  the value. **Do not assert the cost-basis cause.** The value also concentrates on very few accounts, so
  the analyst works them **by account, largest first, with cost accounting**. Where a standard cost
  genuinely did move after a completion posted, **WIP revaluation** is the mechanism that carries it to
  the GL — but **never state a report number for it**; have the analyst confirm the program and version in
  their own JDE.

  ⚠ **Unconfirmed is the honest state, not a hole to fill, and the shipped grounding already says so**
  (`RRV8/config.js:529`, `ANALYST_GROUNDING`, MTO — read 2026-08-27; this module now matches it word for
  word in substance). **What would close it is a measurement, not an SME ruling:** name the one or two
  accounts carrying the value on Demo1 / Demo3 and work them with cost accounting. That is filed as its
  own investigation, and it is currently blocked on a database credential — `sqlcmd -E` fails on the build
  box, the agent's SQL password is not in the shell environment, and VALC holds per-database passwords
  encrypted. The path that does work is the agent HTTP API with a locally minted token (verified against
  all three agents, 2026-08-27).

**GL-only is not a root cause and needs no action.** Cardex 0 with a GL amount is the variance side of
standard costing — labor, overhead and material burden landing in the GL, which never move inventory.
Expected on a make-to-order job. On the full-population read it was 39% of the gross.

### RR signals

- **The `Make to Order` subtype card** on the Transactions page, classifier code `MTO`, written up at
  §5.20. The analyzer drill reports the three-shape breakdown with row counts and dollars rather than
  the generic "routings match, it's timing" line, and leads with the batch lookup when any cardex-only
  completions are present.
- **Split every row by shape before reading the card total.** Worked full population, one company, eight
  periods: GL-only 1,088 rows / ~$129.5K, both-differ 1,400 / ~$133.0K, cardex-only 377 / ~$67.7K, about
  $330K gross. **Read the gross, not the net** — a single-period net of −$11K hid $57K of work. The shapes
  and the tests generalize; the rates are that dataset's.
- **The cardex-only rows stay on this card by design.** `usp6_008` stamps the MTO subtype in Phase 0,
  before `usp8_txv_flags` runs, and the Completion Not Journaled pass claims only rows with no subtype.
  So an MTO completion keeps its business grouping and does **not** appear on the `CNJ` card
  ([[reference_mto_residual_decomposition]]). Moving them would be a classifier-ordering change, not a
  copy change.
- **Neighbouring cards to check you are on the right one:** `XBC` Cross-Batch Completion (§5.21) —
  amounts tie at work-order grain, the completion was simply journaled in a later batch than the one
  stamped on the cardex, and that is not a variance. `MCM` Manufacturing Cost Mismatch (5.16) is a real
  mechanism but has to be confirmed on these rows, not assumed.
- **Demo2 cannot exercise any of this.** It holds zero `IC` rows and no batch type `0`. Validate MTO work
  on Demo1 / Demo3 only — a change can pass on Demo2 while never executing.

### Corrective-action ladder

Best return on effort first. Never a journal entry; the analyst's deliverable is recurrence prevention
plus the written finding ([[feedback_analyst_job_is_prevent_recurrence]]).

1. **`MTO-REGRAIN` — Re-match at (work order, account, doc type) before reading the number.** Subledger
   primary, F3106 fallback. On the measured specimens this removed most of the residual outright. Cheapest
   rung and the only one that costs nothing to be wrong about. **Disposition `establishes` — not a fix**
   (see "Rungs that are not fixes" below): it decides whether there is anything to fix at all.
2. **`MTO-BATCH-LOOKUP` — Take the batch off the cardex row and read F0911 for it, batch type `0`, looking
   for *this order's* subledger.** Four outcomes, four different next steps: `IC` rows carrying this order's
   subledger = a match failure (check the subledger for blank or non-numeric, then the document company,
   then the doc type); `IC` rows present but none for this order = the genuine completion gap; no `IC`
   anywhere in the batch = the same gap run-wide; `IC` absent from RR but present in JDE = a load-window
   problem.
3. **`MTO-GL-WINDOW` — Ask the RR Administrator to widen the GL pull or reload the GL for the period**
   when the completion is in JDE's F0911 and not in RR's. Nothing is wrong upstream; RR is looking at a
   short window. **Reloading the GL is an Administrator utility in V8, and this rung is the analyst
   *requesting* it** — deliberately, so the ladder gives a complete actionable path and a
   reload-shaped resolution is still countable rather than falling off the end of the analyst's work
   (owner ruling 2026-08-27). The analyst detects the condition and names the request; the administrator
   runs it.
4. **`MTO-R31802A-ERRORS` — Have whoever runs the job pull the error report R31802A produced for the run
   that stamped these completions.** The cheapest source of a real answer on the completion gap, and it
   exists whether or not anyone reads it.
5. **`MTO-VERSION-POLICY` — Hold one R31802A summarization and subledger policy across every version in
   use.** Match-failure branch only. A second version with different processing options reintroduces the
   split every run, which is what makes this the durable fix rather than a cleanup. Where summarized
   entries are the deliberate business choice, the fix belongs on the correlation side instead, because
   the subledger will never be there.
6. **`MTO-QTY-THRESHOLD-CHECK` — Check the completion and issue quantities against `0.0050` before reaching
   for any vendor article.** Below that threshold KB 420628 is back in play and its remedy is manual
   entries, which is not an analyst-preventable cause. Above it, that article is the wrong lead
   ([[reference_kb420628_r31802a_blank_cts1]]).
7. **`MTO-ORACLE-SR` — Pursue the R31802A behaviour with Oracle through the customer's own IT department,**
   which owns the support contract. Present it as an undocumented condition, with the evidence: batch
   stamped on the cardex, no `IC` detail in F0911 for the order, other orders in the same batch journaled
   normally, quantities above the threshold. Naming the wrong article invites a remedy that does not fit.
8. **`MTO-COST-ACCT-REVIEW` — Work the both-differ slice by account, largest account first, with cost
   accounting,** and state the cause as unconfirmed. Do not hand over the cost-basis story; it was tested
   and rejected.
9. **`MTO-COMPLETION-GAP-DOCUMENT` — Where R31802A wrote no completion detail for the order at all,
   document it and escalate. Every time.** **There is NO known prevention for this branch** (owner ruling
   2026-08-27). Rungs 4, 5 and 7 are the grounded ones and rung 5 covers only the match-failure branch;
   for the genuine "no completion detail was written" case there is no customer-side setting and no
   operating practice that stops it recurring. Say that plainly in the finding rather than implying a
   lever exists, so the analyst stops hunting for one. Documenting *is* the disposition here, and a card
   that can only ever be documented is worth naming out loud.

### Rungs that are not fixes — stated once, for every ladder in this file

Two rungs across the modules resolve nothing. **`MTO-REGRAIN`** establishes whether there is anything to
fix at all: a regrain that clears the residual proves the money was never a variance. **`CX-JDE-VALIDATE`**
in the Cardex module is a hard gate on whether the variance is real, and produces no correction of any
kind.

**Neither may be stored as a fix type.** Counting them among the fixes inflates any count of resolutions
by exactly the population that turned out to need no fix — the number then reports work that never
happened. Give them their own dispositions, **`establishes`** and **`gate`**, held apart from the fix
types wherever ladder outcomes are counted or grouped. Both stay in their ladders and both stay
mandatory; the separation is about what a downstream number means, not about skipping a step.

**Anti-patterns.** Reposting the completions through R31802A — **there is no such thing**, and the batch
is non-zero so nothing is left for the job to select ([[feedback_analyst_job_is_prevent_recurrence]],
owner 2026-08-03). Sending the cardex-only rows to cost accounting: there is no cost to reconcile when
there is no GL entry at all, and it is a fifth of the card. Deleting unposted manufacturing batches — the
unaccounted units are already cleared and nothing in JDE regenerates the detail. Chasing an AAI. Reading
GL-only as a gap. Reading a cardex-only row with a batch as an unposted batch. Comparing an IM total to
an IC total.

### Related DMAAIs

R31802A posts the completion legs (3110 / 3120 / 3130 / 3401); R31804 posts the variances
(3210 / 3220 / 3240 / 3260 / 3270 / 3280). Verified against Oracle JDE 9.2, 2026-07-06 — see
[[dmaai-reference]].

- **3110** Inventory / Raw Materials — `IM` issue to WO, credits raw inventory, offsets to WIP.
- **3120** Work in Process — the manufacturing hub every leg offsets to. **Dollars only, no inventory**;
  exclude it from a cardex↔GL inventory comparison.
- **3130** Sub-Assembly / Finished Goods — `IC` completion debit, offsets WIP.
- **3401** Accruals (payroll / outside operations) — `IH`, credits the accrual, offsets WIP.
- ⚠ **3120 and 3401 read as absent in the derived tables and are not.** Their `F4095` rows carry a blank
  doc type deliberately (one AAI serves five doc types) and `usp6_002b_aai_staging` drops blank-doc-type
  rows as junk at all thirteen load levels. Raw `F4095` holds 162 rows for 3120 on one specimen, 490 on
  another. "Not on the DMAAIs page" is a load gap, never evidence that an AAI is unconfigured
  ([[reference_blank_doctype_aai_load_gap]]).
- **`DMAAI Net Zero` (5.22) was WITHDRAWN 2026-08-10, not reworded.** 3110 and 3130 are not a debit/credit
  pair — they sit on the same side of two different transactions. The valid manufacturing tests are 3110
  against 3120 on the `IM`, and 3120 against 3130 on the `IC`; both return zero on all three demo databases
  ([[reference_dmaai_valid_pairings]]). A shared 3110 / 3130 account is assumed intended.

### Owner rulings applied — MTO (2026-08-27)

- **Order types are `WO` / `W1` / `WR`, off `sdrcto`.** Settled by measuring the shipping proc, not by
  asking. [[reference_mto_residual_decomposition]] was right; the guide's pairing-family table is wrong
  and needs correcting where it lives.
- **The both-differ mechanism stays UNCONFIRMED,** because the shipped grounding already says so and
  saying otherwise would be an invention. Open as an investigation needing a measurement + a credential,
  not as a question for the SME.
- **`MTO-GL-WINDOW` stays in the ladder, worded as a request** to the administrator.
- **The completion gap has no known prevention.** Rung 9 documents-and-escalates, and says so.

## Module: Intercompany Order processing

**Intercompany is a property of the ORDER type, never of the document type.** This is the first thing
to get right, because getting it wrong sends you at the wrong population. The intercompany order types
are **`SI`** (intercompany sales order), **`SK`** (intercompany sales, inter-branch) and **`OK`**
(intercompany purchase order). The document types those orders post under are ordinary sales and
purchasing document types shared with non-intercompany traffic: `JS`, `RI`, `OV`. A single `JS`
population routinely mixes `SK` intercompany lines with plain `SA` lines that behave nothing like them.
Split by order type before drawing any conclusion. On the source records, `F4211.SDSO11` and
`F4311.PDPS01` set to `3` mark the order as intercompany.

**`SI` is ALWAYS intercompany** (owner ruling 2026-08-06). There is no exception to check for and no
qualifying condition: an `SI` order is an intercompany order. `SI` is the **originating** sales order,
`SK` the inter-branch sales leg, `OK` the purchase leg. Do not treat the `SDSO11` = `3` flag as the
definition of intercompany, only as one way to detect it. The flag is unreliable across databases: on
one specimen it is blank on all 23,130 sales-order rows while that same database carries 261 `SK`
orders, and on another it uses values `2` and `4` but never `3`. **The order type is the reliable
signal; the flag is the convenient one.**

### Process

One economic transaction, two companies' books. The selling company relieves inventory and recognises
the sale; the buying company receives inventory and records the payable. JDE generates the settlement
legs so both companies balance, which means the GL for a single intercompany document can span more
than one company number. Confirmed in the data: the GL legs for one `JS` population sit on companies
30001 and 30002, against cardex rows carried on the selling company alone.

Two mechanically distinct flows land under this module:

- **Inter-branch / cross-company inventory movement.** Stock moves between branches or companies. The
  inventory legs route through **DMAAI 4162**, which debits the receiving company's inventory account.
- **Intercompany billing and settlement.** The receivable, payable and settlement legs route through
  **DMAAI 4400** (document types `IV`, `OB`, `OC`, `OP`).

**There is no intercompany receipt leg, and there never will be. This is line-type configuration, not
missing data.** Established 2026-08-06 after searching every table that could hold one. The two
counterpart legs use line types whose `F40205` setup rules out a cardex presence:

| Line type | Description | Inventory interface | GL interface | GL offset |
|---|---|---|---|---|
| `IC` (the `SK` sales leg) | Intercompany Non-Stock | **`N`** | `Y` | `NS20` |
| `D` (the `OK` purchase leg) | Direct Ship Item | **`D`** | `Y` | `IN99` |
| `S` (ordinary stock, for contrast) | Stock Inventory Item | `Y` | `Y` | `IN99` |

Read that table before concluding anything is missing:

- The `SK` sales leg is **intercompany non-stock with inventory interface `N`**, so it writes to the GL
  and **never to the item ledger**. Every `SK` row you see in the compare arrives from the **GL side
  only**. On one specimen database `F4111` holds 284 `SI` rows and **zero** `SK` rows, which is correct
  behaviour and not an extract gap.
- The `OK` purchase leg is **direct ship**, so the goods move from the supplying branch straight to the
  customer and are never received into the buying company's inventory. All 181 `OK` order lines on that
  database sit at next status **`999` (closed)** with **quantity received `0` and amount received `0`**
  against $689,404.01 of extended cost. `F43121` holds no receipt for them, in the RR database or in the
  JDE source.
- So the **`SI` originating sales order is the only intercompany leg with a real item-ledger presence.**
  That is why grouping matters so much here: the group is what pairs the GL-only `SK` leg with the
  cardex-only `SI` leg so the two can net. An ungrouped `SI` row cannot net against anything and falls to
  triage carrying its full value.

Consequence for anyone reading `RIntercoXref`: its `porec` / `porectype` columns are **structurally
unpopulatable** on this configuration (measured 0 of 160), because they are joined from the cardex and
the receipt does not exist. Do not treat that as a defect to fix, and do not build a pass that depends on
them.

### Root cause(s)

- **Counterpart-company leg timing.** The two companies' legs post in different periods, so a
  per-period tie-out shows a residual on one side that the other side clears later. This is timing, not
  a defect, and it self-clears. Establish it before treating the variance as an error.
- **Misrouted interco leg (4162).** The receiving-company inventory debit points somewhere other than
  the receiving company's inventory account, so the movement never lands where the tie-out looks for it.
  Configuration, so it recurs every period until corrected.
- **Cross-period repeat of the same order.** The same intercompany sales order is relieved in two
  periods at an identical amount, both legs cardex-only. Observed on a specimen database: order type
  `SI`, one order relieved twice at $45,912.68 in periods a month apart, accounting for $91,825.36 of a
  $111,563.50 residual in two rows.

**Do not reach for the duplicate-sales explanation first on intercompany orders.** A single
intercompany order legitimately carries many identical relief rows, one per stock location, and reading
those as duplicates is a known wrong turn (owner ruling 2026-08-03: an order showing 14 identical
relief rows was 14 different locations, not 14 duplicates). The narrower and answerable question is
whether the same order is relieved across *two periods*, which is a different shape from repeated rows
inside one period.

### RR signals

- **The `Intercompany` subtype card** on the Transactions page, described in
  [`transaction-detail-analysis.md`](../../AnalysisGuides/transaction-detail-analysis.md) Section 8.1 as
  "Intercompany order variance." Grouping is order-keyed, per the DAC-16 `SK`/`OK` passes.
- **The GL match key for intercompany is OrderNumber**, and it carries on 100% of sales and purchasing
  rows. Subledger is the manufacturing key and is not populated here. Never conclude an intercompany GL
  entry is absent without first matching on order number: see
  [[reference_gl_match_key_per_type]].
- **Where intercompany ties, it ties exactly.** On a specimen population the 249 `SK` rows under
  document type `JS` matched on document number plus batch to the penny, $0.00 unmatched against
  -$6,465,601.39 of activity. A clean intercompany population is the expected state, so a large
  intercompany residual is worth doubting before it is worth explaining.

**Known signal gap, worth carrying into any claim work.** The `Duplicate Sales` classifier flag is
period-scoped (`d.PeriodEnds = a.PeriodEnds`), so it structurally cannot see the same order relieved in
two different periods. The cross-period repeat described above is invisible to it. Any claim covering
this root cause needs its own cross-period test rather than an extension of the duplicate-sales gate.

### Corrective-action ladder

Best return on effort first. **Never a journal entry**; hand a genuinely unfixable residual to the
accountant ([[project_analyst_accountant_role_split]]).

1. **`ICO-ORDERTYPE-CONFIRM` — Read the order type and confirm the population is actually intercompany.** `SI`, `SK`, `OK`, or
   `SDSO11` / `PDPS01` = 3. If the rows are a different order type sharing the document type, this
   module does not apply and the diagnosis belongs elsewhere.
2. **`ICO-ORDERNUM-MATCH` — Match on order number across both companies before anything else.** Most apparent intercompany
   residual is a key problem or a counterpart leg on the other company's books, not missing money.
3. **`ICO-PERIOD-SPAN` — Count the residual across adjacent periods.** A residual that appears in one period and clears in
   the next is counterpart-company timing. Confirm it cleared rather than assuming; then leave it alone.
4. **`ICO-4162-ROUTE` — Verify DMAAI 4162 routes the receiving company's inventory debit to that company's inventory
   account.** A misroute here recurs every period, which makes it the highest-value fix when the
   residual persists across periods.
5. **`ICO-4400-ROUTE` — Verify DMAAI 4400 settlement routing** for the billing legs (`IV`, `OB`, `OC`, `OP`) when the
   variance sits on the receivable or payable side rather than on inventory.
6. **`ICO-CROSSPERIOD-TEST` — For a cross-period repeat of one order, test the order across all loaded periods, not within the
   period.** Establish whether the second relief is a legitimate second shipment against the same order
   or a genuine re-relief, then correct the order-process setup that permitted it.

**Anti-patterns.** Diagnosing at document-type grain. Calling identical relief rows within a period
duplicates. Concluding a GL entry is absent from a document-number test alone. Posting a correcting
entry for counterpart-company timing, which balances the period and returns the residual next month.

### Related DMAAIs

- **4162** cross-company inventory transfer (`IX`), debits receiving-company inventory. Documented
  failure: interco leg misrouted. See [[dmaai-reference]].
- **4400** Intercompany / Advanced Pricing Settlement (`IV`, `OB`, `OC`, `OP`), intercompany billing
  and advanced-pricing adjustment.
- `TransactionComp` may legitimately differ from `CompanyNumber` under intercompany configurations, so
  a company mismatch between the two is not by itself a finding.

## Module: Cardex variance

**Cardex variance is inventory-internal and account-blind.** It is F4111 against F41021 for one item —
not the item-ledger-vs-GL gap, which is transaction variance. There is no account information on the
cardex screens and the analyst does not consider accounting data here: the only question is *do my
transactions add up, yes or no?* ([[reference_cardex_inventory_side_account_blind]], owner 2026-07-15).
Do not add account columns, account splits or an account-change boundary to this surface — the
by-account tie-out lives on the reconciliation side.

Fuller process design, the open UI threads, and the provenance of the earlier exploratory notes live in
[`transaction-variance-process.md`](transaction-variance-process.md). This module is the distilled
version; where the two differ, this one is current — see the contradictions noted at the end.

### Process

- **The definition, and nothing else is cardex variance** (owner SME 2026-07-15). **Quantity variance** =
  the sum of F4111 primary-UoM quantity does not equal the F41021 Quantity On Hand. **Amount variance** =
  the sum of F4111 extended cost does not equal the F41021 on-hand Value. It is the header versus the grid
  on Work With Item Ledger (P4111).
- **RR compares summarized F4111 ↔ F41021 on every nightly import**, excluding memo transactions
  (`ILIPCD = "X"` — work-order scrap, lot releases, certain warehouse moves; they do not affect on-hand),
  applying UOM conversions, and respecting cost level. It surfaces per item as `QtyVar` / `AmtVar` with a
  `Reason`.
- **The `Reason` vocabulary is exactly two values: `Quantity` and `Amount`.** `usp6_006b_cardex_variance`
  stamps `Quantity` if the unit variance is non-zero, else `Amount`. Every cause below is an *inference*
  behind one of those two words, not a stored bucket ([[reference_cardex_variance_demo_and_reason]]).
- **The comparison grain is set by cost METHOD and cost LEVEL together, and getting it wrong manufactures
  a false variance.** Average (02) and actual (09) reconcile at **item** on cost level 1, at
  **branch/item** on level 2, and per **location and lot** on level 3. Standard (07) reconciles per
  location and lot at every level, and so does any other method ([[project_cardex_netting_rules]]).
- **Netting never crosses GL account.** Every net group keys on the short account, so two equal-and-opposite
  variances from a GL-class change cannot cancel to a false zero. That is a backend correctness guard, not
  an analyst-facing dimension.
- **Cardex is king, and the sign follows from it** (owner 2026-07-15). A quantity fix is made to F41021 —
  bring on-hand up to the cardex, never touch the cardex. The displayed convention is **F41021 − F4111**
  (on-hand minus cardex), so a shortfall reads negative.
- **Trust boundary: RR cannot see live JDE.** It trusts that the analyst validated the item there. Never
  write or imply that RR confirmed anything about JDE.

### Root cause(s)

**Quantity — two causes, and RR cannot tell them apart.**

- **F41021 did not update for one or more cardex transactions.** The item ledger recorded the movement and
  the location balance did not. Real, permanent, and does not self-heal — a refresh does not sync two JDE
  tables that are already inconsistent with each other. This is the most common real quantity variance and
  it needs a source fix.
- **F4111 and F41021 were captured out of sync during a live load.** The extract ran while a transaction
  was still processing, so RR's baseline was computed off an inconsistent snapshot. RR-side artifact.
  ⚠ **There is nothing to tighten here, and the "narrow the extract window" suggestion is not a real
  lever** (owner ruling 2026-08-27). The analyst recognises the shape and waits for the next refresh;
  that is the whole disposition. And the refresh schedule is not the customer's RR Administrator's to
  set in the first place — **a GSI DBA sets it, in VALC.** Checked against the product: the agent exposes
  the schedule **read-only**, and its own note says editing it lives in VALC rather than in the agent
  (`RefreshScheduleController`, `GET /admin/refresh-schedule`, read 2026-08-27). V8's admin card views
  the schedule; it does not set it. Any doc implying a customer's RR Administrator sets the refresh
  schedule is wrong.
- ⚠ **Do NOT auto-classify glitch versus load timing from RR data.** Both persist, especially from the
  initial baseline perpetual build, and RR cannot see live JDE, so any heuristic is a guess. Surface the
  variance and the two sums; the analyst's JDE validation decides. Name a likely cause tentatively if asked,
  never as a verdict (owner: *are we overthinking this?* — yes).

**Amount — cost and valuation.** Manual cost overrides, incorrect average-cost calculations, UOM changes,
and rounding accumulated over time. Quantities tie; the value does not.

**A third, RR-only cause worth knowing: RR's copy of F4111 is stale.** RR's routine change-detection watches
for a change in the batch number and then updates a predetermined field list, so an arbitrary direct-SQL
update in JDE outside that list is invisible to it. The SSIS changed-row query is also
high-water-mark-by-batch (`ILICU >= N`), so any JDE row whose batch falls below RR's high-water mark is never
requested again. Rows updated in JDE never reach RR ([[reference_reload_cardex_purpose]]). Reload Cardex
exists for exactly this and reloads everything as *new* rows, which launders the change through the reliable
monotonic-key path.

### RR signals

- **The Home Cardex Variance tab: three cards**, quantity-first — (1) Quantity variance, cost-method
  agnostic; (2) Amount variance, standard cost (07); (3) Amount variance, average cost (02). A row that is
  off on quantity lands in card 1 and only quantity-clean rows reach cards 2 and 3, so every row sits in
  exactly one card. A drawer row deep-links the sync page for that item.
- **`RRV8/inventory-cardex-variance.html` is the sync engine, not a browse surface.** It is item-focused —
  arrive from a drawer row or type in an item and branch — and it works on items with no variance at all,
  because syncing and variance are separate needs.
- **Quantity before dollars.** When units are off the dollars usually follow at cost, so leading with the
  amount wastes the pass. Amount-only (units tie, value does not) points at cost and valuation, not counting.
- **Cardex variance is a term in the reconciliation identity** and it is one of the two components that is
  *not* the accountant's: `BegVar + Variance + JEs + CardexVar − UnpostBatch − EndofDay = OOB`, measured
  across all three demo databases 2026-08-19 ([[reference_inventory_variance_taxonomy]]). It cannot be
  journaled away, and people try.
- **Tolerance: cardex variance is never exactly zero, because of rounding.** **What ships is a
  PER-COMPANY tolerance and nothing finer** — the agent stores one tolerance per company and its setter
  takes a company and an amount, with no item dimension anywhere in the call
  (`CardexToleranceController`, read 2026-08-27); a company with no row is strict, i.e. zero. V8 **reads**
  that tolerance on Home and on the cardex page and ships **no control to set it**, so today the value is
  set outside the analyst's screens even though the endpoint requires the analyst grant.
  ⚠ **The owner's ruling is that the tolerance must be per company AND per item, and that is a product
  gap, not something this document can describe as working — filed as UI-161** (agent schema + endpoint,
  the company-versus-item precedence rule, and the V8 UI). The owner accepted the stale-override risk that
  comes with a per-item tolerance on one condition: **the suppression has to be visible where it acts**,
  so an item silently held under an old tolerance is never invisible. Until UI-161 ships, a per-item
  tolerance does not exist — do not write a ladder rung, a card definition or a grounding line that
  assumes it.
- **All three demo databases net to zero cardex variance** — the page has nothing to show by default. Demo1
  carries a seeded set injected by a demo-only proc. If a demo shows nothing, that is correct behaviour, not
  a broken page ([[reference_cardex_variance_demo_and_reason]]).
- **Do not confuse this with the Period Mismatch card.** That is a *transaction*-variance card about the
  cardex period stamp (entry date by default) differing from the GL date. Different surface, different
  question, and the entry-date basis is deliberate ([[reference_cardex_periodends_is_entry_date]]).

### Corrective-action ladder

This module is **diagnose → dispose**, not one durable prevention fix: some of what lands here is an error
to eliminate and some is legitimate movement to explain. Rung 1 is a hard gate, not a fix.

1. **`CX-JDE-VALIDATE` — Validate the item in JDE first. Nothing else happens before this.** Open P4111,
   export the grid, exclude memo rows (`ILIPCD = "X"`), sum primary quantity against the header Quantity On
   Hand and extended amount against the header Value. RR is built from JDE, so syncing RR to a wrong JDE
   launders the error. Authoritative steps:
   [`inventory-cardex-variance.html`](../../RRUniversity/inventory-cardex-variance.html).
   **Disposition `gate` — not a fix** (see "Rungs that are not fixes" below): it decides whether the
   variance is real, and nothing it produces is a correction.
2. **`CX-GRAIN-CHECK` — Confirm you compared at the grain the item's cost method and level actually use.**
   A level-3 average-cost item compared at item level will show a variance that does not exist.
3. **`CX-QTY-SOURCE-FIX` — Quantity mismatch confirmed in JDE: the F41021 update gap is a JDE data problem.**
   Correct it at the source and escalate to the customer's own IT department where it is past the analyst's
   JDE access. An RR adjustment here is at best a stopgap. The RRU flow explicitly leaves the quantity branch
   uncovered and routes it out.
4. **`CX-JDE-AMOUNT-IA` — Amount mismatch confirmed in JDE: a dollars-only Inventory Adjustment in P4114.**
   Enter Item / Branch / Location / Lot and the Extended Amount; leave **Quantity and Unit Cost blank** — that
   is what makes it dollars-only. It posts to F4111 and to the GL. Verify the IA shows in F4111 with the
   correct amount and zero quantity, and that the GL posted to the right inventory account.
   **This rung is the ANALYST's, and the GL entries it creates do not change that** (owner ruling
   2026-08-27). It is a source-side action taken in JDE, which is the analyst's lane by the role axis
   above — the axis turns on where the action is taken, not on whether it posts. The customer doc names a
   cost/inventory accountant with JDE security; read that as *who holds the JDE security to key it*, not
   as which lane owns the corrective action.
5. **`CX-AVGCOST-UDC` — Average cost (method 02) only, and it wraps rung 4.** Disable the P4114 average-cost
   update through UDC `40/AV` (Description 02, `Y` → `N`), do the IA, verify, then **restore `N` → `Y`**.
   Standard cost (07) skips this entirely. Leaving the UDC flipped is its own future defect.
6. **`CX-RELOAD-CARDEX` — RR's F4111 copy is stale: ask the RR Administrator to reload the cardex.**
   Deletes RR's cardex back to a chosen point and reloads everything as new rows, bypassing the
   change-detection path that missed the update. **This is an Administrator utility in V8**
   (`RRV8/admin-reload-cardex.html` says so on its face). **The request is the rung** — it stays in the
   analyst's ladder, worded as a request, rather than the ladder stopping at "hand it to the
   administrator" (owner ruling 2026-08-27). The analyst is the one who can detect the stale-copy
   condition, so the analyst names the request; keeping it here is also what lets a reload-shaped
   resolution be counted instead of vanishing.
7. **`CX-SYNC-CLEAR` — JDE ties, RR does not: Adjust Beginning Balance, preset Clear-to-JDE.** Sets the
   opening so the variance nets to zero. In place, logged to the adjustment ledger, and reversible.
8. **`CX-SYNC-ZERO` — Adjust Beginning Balance, preset Zero.** Opening quantity and amount set to 0, when
   that is what they should be.
9. **`CX-SYNC-MANUAL` — Adjust Beginning Balance, preset Manual.** Type the known-correct opening quantity and
   amount; the path after a JDE correction or a UOM change.
10. **`CX-CONFIRM-NEXT-REFRESH` — Reopen after the next refresh and confirm both variances are zero.** The
    adjustment applies to RR internals immediately, but the pop-up reflects data as of the last nightly
    import, so **a JDE-side correction cannot show until the next refresh pulls it**. Closing the finding
    before that confirms nothing.
11. **`CX-TOLERANCE-SET` — Set the per-company tolerance so rounding noise stops presenting as work.**
    Steady-state drift is never exactly zero; a strict threshold turns rounding into a worklist. **Per
    company is the only grain that exists today**, and V8 ships no control for it — the analyst names the
    tolerance and it is set outside the analyst's screens. Per-item is the owner's ruling and is
    **UI-161**, not current behaviour; do not offer it until that row ships.
12. **`CX-ACCT-HANDOFF` — A real value gap that never posted to the GL: hand it to the accountant as a
    finding.** JDE validation stands up a genuine change in value, and no GL entry carries it — an
    unposted revaluation is the clearest case. **This is the accountant's, not the analyst's**, because
    the GL's current state is wrong: value that never arrived (owner ruling 2026-08-27, and the general
    form is *anything that does not post to the GL is the accountant's domain*). The analyst's deliverable
    is still a finding, not an entry, and it travels through the Audit Center like every other handoff —
    what changes is that the ladder now *has* an accountant rung, where it previously ran out of rungs and
    left the condition unowned. Do not confuse this with the JDE-side dollars-only IA at rung 4: that one
    posts, in JDE, at the source, and stays the analyst's.

**Rung 1 is not a fix.** `CX-JDE-VALIDATE` carries disposition **`gate`** and is held out of any count
by fix type — see "Rungs that are not fixes" in the MTO module above, which states the rule once for both
ladders.

**Anti-patterns.** Journaling it — cardex variance cannot be journaled and the accountant's entry never
touches it. That is not in tension with rung 12: the accountant rung hands over a **GL-side** gap this
investigation happened to surface, not the cardex variance itself, and the cardex number is untouched
either way. Auto-classifying glitch versus timing from RR data. Adjusting the cardex to fix a quantity
(cardex is king; the fix is to on-hand). Syncing before JDE is validated. Prescribing a **re-roll** — the
manual per-company re-roll was retired by the unconditional full-timeline recompute, and the item-level
control on this page is Adjust Beginning Balance ([[reference_varok_break_resolution]]). Gating the
correction behind an attestation or a "did you validate?" checkbox: RR is a utility, not law enforcement,
and reversibility is the safety net ([[feedback_rr_utility_not_enforcement]]). Telling the analyst to
escalate to GSI — the escalation target in the customer product is the customer's own IT department.

### Related DMAAIs

**Cardex variance itself has no DMAAI dimension** — it is account-blind by design, which is why the cardex
AI grounding deliberately carries no DMAAI rules. One AAI pair matters only at rung 4, because the P4114
adjustment writes GL entries:

- **4122 / 4124** Inventory DR / CR — the adjustment/issue/transfer/reclass pair, doc types including `IA`.
  Verify the dollars-only IA landed on the intended inventory account rather than assuming it did. See
  [[dmaai-reference]].

### Contradictions found while writing this module

- **The customer doc's Step 4 names V7 controls that V8 does not have.**
  [`inventory-cardex-variance.html`](../../RRUniversity/inventory-cardex-variance.html) offers *Re-Roll Item*,
  *Zero Beg Bal* and *Remove CX Var* and states **"No UNDO."** The shipped V8 page exposes Adjust Beginning
  Balance with presets **Clear-to-JDE / Zero / Manual**, logs every adjustment to the adjustment ledger, and
  reverses it through the undo path (verified in `RRV8/inventory-cardex-variance.html`). The ladder above
  follows the shipped product. **The customer doc needs updating; it is not this file's to edit.**
- **The process doc's "re-roll → reload cardex, always first" decision tree is superseded twice over** — by
  the validate-JDE-first flow it itself marks authoritative, and by the retirement of the re-roll verb. It
  survives in [`transaction-variance-process.md`](transaction-variance-process.md) as exploratory background
  and should not be read as the procedure.
- **"F41021 on-hand vs. the F4111 rolled baseline"**, the phrasing carried on the old pointer here, is not the
  owner's definition. The definition is F4111 *summed* against F41021 (owner 2026-07-15). The baseline framing
  belongs to the roll, not to the variance.

### Owner rulings applied — Cardex variance (2026-08-27)

- **Tolerance grain: per company AND per item.** The shipping product is per company only, so this is a
  **gap** rather than a confirmation — **UI-161**. The ladder describes what ships and points at the row.
- **The P4114 dollars-only IA is the ANALYST's**, GL entries and all, because it is a source action in
  JDE. The role axis at the top of this file is what decides it.
- **`CX-RELOAD-CARDEX` stays in the analyst's ladder, worded as a request** to the administrator. Same
  ruling covers `MTO-GL-WINDOW`.
- **An unposted revaluation routes to the ACCOUNTANT**, so the ladder now carries `CX-ACCT-HANDOFF`. It
  had no accountant rung before, and the general rule the owner gave — anything not posting to the GL is
  the accountant's domain — is what required one.
- **The extract-timing artifact has no lever.** Recognise and wait for the next refresh. The
  "tighten the extract window" suggestion should be **deleted** from
  [`transaction-variance-process.md`](transaction-variance-process.md) rather than left marked
  unconfirmed — that file is outside this pass, so the deletion is flagged, not made. Separately: a GSI
  DBA sets the refresh schedule in VALC, never the customer's RR Administrator.

## Later modules (room to grow)

Transfers · Direct Ship · Purchasing / Vouchers · Sales — add on the same 5-part schema as the owner
teaches each.
