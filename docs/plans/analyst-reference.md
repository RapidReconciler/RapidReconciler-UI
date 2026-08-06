# Analyst Reference — transaction-variance root-cause → corrective-action knowledge base

**Status:** PARTIALLY AUTHORED. Scaffolded 2026-07-07 (structure + schema). **Intercompany Order
processing authored 2026-08-06** from measured evidence plus owner rulings; MTO still awaiting content.
This is the analyst-side companion to the accountant [`accounting-reference.md`](accounting-reference.md)
and mirrors the [[dmaai-reference]] pattern: a curated doc + a compact `RRV8.ANALYST_GROUNDING`
constant (to be added in config.js when content exists), kept in sync, prepended to the analyst AI
reads (`askAnalyst` / `_analystPrompt` / `_analystTxFacts`). Worklist: **UI-24**. Full process design +
the closed-card/convergence model live in [`transaction-variance-process.md`](transaction-variance-process.md).

## Mission (owner-confirmed 2026-07-07)

Drive the recurring transaction-variance residual to **zero at the source** — so inventory-to-GL ties
on its own, period after period, without correcting entries. The analyst finds the root cause of a
variance and fixes it at the SOURCE (config / order-process / re-roll); **the analyst never posts a
journal entry** (that's the accountant — [[project_analyst_accountant_role_split]]). Every module's
corrective-action ladder serves this one goal.

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

## Module: MTO (Make-to-Order) processing  `[OWNER — author the content]`

- **Process:** `[OWNER]` — the SO→WO linkage and how MTO legs post (IM/IC) across documents.
- **Root cause(s):** `[OWNER]` — what leaves an MTO residual (linkage break / config / timing).
- **RR signals:** MTO card / subtype in the tx-variance taxonomy; WO-grouped grain (per DAC-16). `[OWNER — refine]`
- **Corrective-action ladder:** `[OWNER]` — the source fix(es), best-first.
- **Related DMAAIs:** `[OWNER]` — which AAIs (e.g., 3120 WIP …) MTO resolves through.

## Module: Intercompany Order processing

**Intercompany is a property of the ORDER type, never of the document type.** This is the first thing
to get right, because getting it wrong sends you at the wrong population. The intercompany order types
are **`SI`** (intercompany sales order), **`SK`** (intercompany sales, inter-branch) and **`OK`**
(intercompany purchase order). The document types those orders post under are ordinary sales and
purchasing document types shared with non-intercompany traffic: `JS`, `RI`, `OV`. A single `JS`
population routinely mixes `SK` intercompany lines with plain `SA` lines that behave nothing like them.
Split by order type before drawing any conclusion. On the source records, `F4211.SDSO11` and
`F4311.PDPS01` set to `3` mark the order as intercompany.

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

1. **Read the order type and confirm the population is actually intercompany.** `SI`, `SK`, `OK`, or
   `SDSO11` / `PDPS01` = 3. If the rows are a different order type sharing the document type, this
   module does not apply and the diagnosis belongs elsewhere.
2. **Match on order number across both companies before anything else.** Most apparent intercompany
   residual is a key problem or a counterpart leg on the other company's books, not missing money.
3. **Count the residual across adjacent periods.** A residual that appears in one period and clears in
   the next is counterpart-company timing. Confirm it cleared rather than assuming; then leave it alone.
4. **Verify DMAAI 4162 routes the receiving company's inventory debit to that company's inventory
   account.** A misroute here recurs every period, which makes it the highest-value fix when the
   residual persists across periods.
5. **Verify DMAAI 4400 settlement routing** for the billing legs (`IV`, `OB`, `OC`, `OP`) when the
   variance sits on the receivable or payable side rather than on inventory.
6. **For a cross-period repeat of one order, test the order across all loaded periods, not within the
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

## Module: Cardex variance  — see [`transaction-variance-process.md`](transaction-variance-process.md)

⚠ **IN PROGRESS — owner still teaching; NOT scaffolded here yet.** Captured (partial) in the process
doc: roll-integrity module, F41021 on-hand vs. F4111 rolled baseline, three causes (extract-timing /
system glitch / cost-revaluation), the validate-JDE-first flow (authoritative steps sourced from
[`RRUniversity/inventory-cardex-variance.html`](../../RRUniversity/inventory-cardex-variance.html)),
and a settable-tolerance requirement. Fold into this schema once the owner says the module is complete.

## Later modules (room to grow)

Transfers · Direct Ship · Purchasing / Vouchers · Sales — add on the same 5-part schema as the owner
teaches each.
