# Transaction-variance claim audit: every card bullet marked

**Date:** 2026-08-10 · **Scope:** all 22 cards in `RRV8/config.js` `RRV8.txv.META`
**Measured on:** `RapidReconciler_Demo1`, `RapidReconciler_Demo2` and `RapidReconciler_Demo3`,
`RCardexLedgerCompare2 where recstatus = 1`

> **Correction, same day, and it is this audit's own disease.** The first version of this document
> was measured on Demo1 and Demo3 and said "zero rows on **both** demos" about the Period Mismatch
> card. There are three demo databases. Demo2 carries **672 Periods rows across 336 groups**, and
> it is also the Vouchers database (3,812 rows). The word "both" was doing the work of "all three",
> which is a claim stated more widely than it was measured. Demo2 has now been measured and every
> figure below reflects it. See "Period Mismatch, measured properly" near the end.

## Why

Every card defect found so far has been the same defect: prose asserting something no code
tests, printed under a heading that reads as a test result. The word `Confirmed.` was the tell
each time. Four of them were found one at a time, because four separate questions happened to
get asked. This pass enumerates the closed set instead of waiting for the fifth question.

## The three marks

| Mark | Meaning | What happened to it |
|---|---|---|
| CONFIRMED-BY-TEST | a predicate in the claim establishes it | kept, now carrying its assertion id |
| TRUE-BUT-UNTESTED | true on measurement, but no predicate tests it | moved to `context`, renders under "Not tested on these rows" |
| FALSE | contradicted by the data, or describes a test that does not exist | deleted or corrected |

Every `checked` bullet on every card now carries one of these. `fix` bullets are prescriptions
rather than test results, so they were audited for embedded claims rather than marked.

---

## FALSE, measured rather than reasoned

| Card | The bullet | What the data says |
|---|---|---|
| TXI | "GL: both legs posted to the same account and net to zero" | Demo3, 80 of the 83 rows: **one** F0911 leg, on the cardex account, for **0.00**. Demo1, 3 rows: legs on a **different** account with none on the cardex account, and 1 of the 3 does not net. Two shapes, neither one the sentence. |
| TXI | "receipt leg carries a unit cost and no extended value. Confirmed" · "which leg fails: the receipt leg, on every document" · "DMAAI routings resolve correctly" | The claim tests document type, ledger amount, cardex amount, unclaimed. There is **no** extended-cost, unit-cost, leg-direction or AAI predicate. It is a catch-all for residual IT documents C1 did not take. |
| CNJ | "not under any company, not under any document type" | The GL search is scoped to the row's **own company** and to document types **IC and IM** only. On Demo3, **119** of the card's documents carry `JE` rows against the same work-order subledger. |
| CNJ | "Work-order reference present. Summarized entries ruled out" | Backwards. The aggregate counts only rows whose subledger casts above zero, so a summarized completion is **invisible** to it and would create this card rather than be excluded by it. Not happening on the two databases that carry this card: 0 of 9,569 and 0 of 819 IC rows lack a subledger. Demo2 has no rows on it. |
| CNJ | "batches are fine" · "account and AAI are fine" · "posting status: posted" · "batches all present" | No batch, account, AAI or posted predicate exists anywhere in the claim. |
| DUP | "Variance equals the value of the extra relief. Confirmed" | **No amount is compared.** The match is company plus order plus order type plus period, so every row of that order is stamped. Of 6 rows on Demo1: 2 are GL-only and cannot be a duplicated relief at all, 1 is exactly 2x, 1 differs by $4.62. |
| OFF | "The order line type: stock" | Nothing reads F40205. **114 of 128** documents sit on an order carrying at least one non-stock line. |
| OFF | "two entries, both posted, in the same batch" | True on measurement, but neither posted status nor batch is a predicate, so it was demoted rather than deleted. |
| ACCT | "Both sides of the document posted. Missing entry ruled out." | No presence predicate. A zero ledger amount cannot establish it either: these rows are `Mfg`, where the match key is the work-order **subledger**, not the document number. |
| PER | "Item-ledger date against GL date: different fiscal periods. Confirmed" | **No date is read.** The claim compares variance sums across `PeriodEnds`. |
| PER | "Both sides posted, and the amounts agree" | For the row on the card the amounts specifically do not agree. They agree only once both periods are added together. |
| MTO, ICO, TRF, DS | "DMAAI routings resolve correctly. Mapping ruled out." | Four cards, one sentence, zero code. No linking pass in `usp8_txv_build` or `usp8_txv_group` reads an AAI table. |
| MTO | "Sales orders shipped and closed" | Not tested, and **not measurable here**: on the two databases that carry MTO rows, `F42119` holds **zero** rows, so `vcr_F42119` is `F4211` alone and every sales order reads as open. (Demo2 has 48 F42119 rows and no MTO rows, so it cannot settle it either.) Zero rows means not loaded, so this does not get resolved from demo data. |
| ICO | "Both companies are in scope on the same order. Confirmed." | 2 of the 27 Demo1 rows have **no group code**, meaning no cross-reference row, so the counterpart may not be in the database at all. |
| SAC | "searched under its own type and under every other type" | The predicate covers the own type only. True on measurement (0 of 1,292 carry another type), so it was demoted. |
| T-SALES, T-PURCH, T-MFG, T-INV | "both sides posted and disagree" | Every shape reaches a terminal card. Demo1 `T-MFG`: 473 both-sided, **29 cardex-only, 44 GL-only** of 546. Demo2 `T-INV`: **168 rows, 135 item-ledger-only, 33 GL-only, and zero carrying both**, so it was wrong for 100% of that card. Demo3 `T-INV` is a single GL-only row. One-sided is the norm on the inventory terminal, not the exception. |
| T-MFG | "Not a completion missing from the GL. Ruled out." | The completion claim also requires a stamped batch and GL material issues, so a cardex-only IC failing either test lands here. **10 such rows on Demo1, 2 on Demo3, every one with a batch.** |
| T-INV | "Not a one-sided location transfer. Ruled out." | Both transfer claims only ever look at document type `IT` with a zero ledger amount. |
| SNJ | all five `checked` bullets | The card is withdrawn server-side and cannot fire. Its recorded evidence was re-measured and none of it held. The whole block is now a withdrawal notice. |

## Latent rather than live, recorded so nobody re-measures it

- `ACCT` does not require two distinct accounts. A single-account group under tolerance would
  be stamped. All 366 Demo1 groups carry exactly 2, so this is structural only.
- The `ACCT` mechanism (item ledger on one account, GL on the other) holds for **134 of 366**
  groups. **100** have both sides on both accounts and 132 are mixed.
- `XBC` and `MCM` compare an aggregated GL side against a **single** cardex row. Every XBC key
  carries one row today. MCM has 81 of 533 rows on multi-row keys, and re-measured with the
  cardex side aggregated to the same grain, all 452 keys still differ, so nothing is
  mislabelled.
- TXI precedence: Demo1's 3 TXI documents are the *Offsetting Entries* shape. Section E would
  claim them, but C2 runs first and takes every residual IT row regardless of shape.
- `NSL` and `NCL` match order lines on order number alone, with no company predicate.

## Period Mismatch, measured properly

Demo2 carries 672 rows across 336 groups, and once measured this is the best-supported card in
the set:

- **336 of 336** groups span exactly two periods, so the across-periods shape is universal.
- **672 of 672** rows name their offset period in the comment.
- **322 of 336** groups are the clean shape the card describes: one leg carrying only a cardex
  amount, the other only a GL amount, same account, same batch. 14 are mixed.
- **317 of 336** groups sit one month apart, which is what a period-end straddle looks like. The
  rest run 2, 3, 6, 8 and 9 months apart. A nine-month gap is not a cut-off, so the card now says
  that rather than telling the analyst every row on it is timing.
- Worked specimen: document 2098343, type II, account 00237437. G/L 974.55 in December, cardex
  974.55 in January, netting to zero across the two.

The two corrections to the card copy stand: no date is read anywhere in the claim, and the
amounts do not agree on the row in front of the analyst. What changed is that both now carry a
real count instead of an assertion.

## True by population, so cards cite it instead of re-asserting it

Every residual row's `(company, account)` is in `RInvAccountList`, with **0** off-list rows on
**all three** demos. `VCHR` and `NSL` cite `POP.inventoryaccount` rather than claiming they
checked it.

`VCHR` is also confirmed on the database that carries it: all **3,812** Demo2 rows are batch type
V, and **1,033** carry a cardex side. The `$752,088.82` recorded in the `config.js` comment is
right, but it is a **sum of absolute values**; the signed sum is `$677,817.32`. The figure needed
its grain in the label, not a correction.

---

## The gate, so this does not come back

Prose was the only thing holding a card to its claim. Now:

1. Each claim block declares what it asserts, as `-- @asserts <CARD>.<slug>  <statement>` line
   comments in `usp8_txv_*.sql`. **90 assertions across 6 procs.**
2. `RRV8/txv-assertions.json` is generated from those lines by
   `RapidReconciler-DB/Tools/gen_txv_assertions.py`. The DB repo's CI fetches the public copy
   and fails if it has drifted from the SQL.
3. Each card cites ids: `checked: [{ a: 'TLM.oneleg', t: '...' }]`.
   `Tools/check_txv_cards.py` fails on a bare string, an unknown id, or an empty `t`, and runs
   in the UI repo's CI.
4. `context: []` is where untested-but-true material goes, under its own heading.

A bullet under "What I checked" is now backed by a declared predicate or the build goes red.
One hole is worth naming: an id can be cited by a bullet whose text does not match the
statement. The gate proves the assertion exists, not that the sentence paraphrases it
faithfully. Reading text against statement is still a human job.

### Adding a check

Add the `@asserts` line to the proc, regenerate the manifest, then cite the id. If there is no
assertion to cite, the sentence belongs in `context` or nowhere. Never invent an id to get a
bullet past the gate, because that puts the disease back with a green build on top of it.

---

## Deployed

Release dacpac published to all three demo databases (`8.0 beta.93`), then
`EXEC usp8_txv_classify` on each. The publish diff was exactly the six edited procs plus a refresh
of two dependents plus the version extended property: no table or data changes.

`RCardexLedgerCompare2` was copied to `dbo.zz_compare2_backup_20260810_predeploy` in each database
first. After the re-run: `err = 0` everywhere, row counts identical (5,583 / 4,819 / 2,095),
residual nets identical to the pre-deploy baseline, and **zero rows changed card** on any database,
which is what should happen when the same predicates meet the same data. The two corrected
user-visible comments are on the rows: 3 Demo1 and 80 Demo3 Transfer Integrity, 21 Demo3 Transfer
Leg Missing.

## Verified in the browser, and what was not

Walked on Demo1, company 80002, drafting each finding through the shipped renderer: `MTO` at
271 rows, `CNJ` at 39, `ACCT` at 278 (period 2025-05-29), and `T-MFG`. No console errors once
the async work settled. `Mark reviewed` is present and enabled, though the write itself was not
exercised.

The walk caught one defect and it was mine. The Details page runs its own DMAAI routing check
on the loaded rows and prints "every DMAAI resolves to the model account. Ruled out." Sitting
next to the card's honest "nothing in the linking passes reads an AAI", the same drafted
finding contradicted itself. Context bullets now carry a topic key and get suppressed when this
page has actually measured that topic. Suppression happens on a successful **read**, not on an
attempt, so the "could not be read" branch still prints the card's line, because at that point
the two agree.

**Not verified live: `SAC` (1,292 rows), `TXI`, and `TLM`.** Those live on Demo3 and the
browser's token is Demo1-scoped (`sidebarCompanies=80002+80008`), so the drill returns zero
rows. Their copy is gate-clean and parse-clean and the renderer is proven on four other cards,
but the Demo3 leg of the tour is unwalked, and `SAC` is the largest card in the demo set.
