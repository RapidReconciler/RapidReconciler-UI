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

## Consequences for a Completion Not Journaled card

The card only claims cardex rows that carry a **batch number**. By the sequence
above, a batch means R31802A ran and wrote F0911 in the same step, so the card never
contains a transaction awaiting the run. Everything on it was already processed.

**The leading cause is a genuine gap: the run stamped the cardex batch and wrote no
F0911 completion detail for the order.** That is the vendor-documented defect below,
and it is what a specimen dataset shows. One company, 39 rows in one period:

- All 39 work orders carry `IM` rows and **zero** `IC` rows in F0911, matched on
  company plus numeric subledger. Widened to those order numbers with **no** company
  and **no** document-type restriction: 507 rows, all `IM`. No `IC` anywhere.
- F3106 holds 543 cross-reference rows covering all 39, so the run did process them.
- The 7 batches involved hold **1,080 `IC` rows** — posted, matching document
  company, every one with a numeric subledger. Summarization did not drop the
  subledger here.
- 37 of the 39 sit on one short account that carries **293 `IC` rows in those same
  batches for 260 other orders.**
- The shape is standing, not a one-off: every period from January to August 2025
  (42, 51, 57, 25, 14, 71, 39, 21 rows), roughly **10-15% of each run's
  completions**, across order types `WO` / `WR` / `W1` and 7 separate batches.

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

**Prevention belongs on the run, not the orders.** At 10-15% of completions every
period, working individual work orders addresses one symptom while the next run
reproduces the rest. Bound the exposure with R41543 (Item Ledger / Account
Integrity) monthly, and pursue the R31802A behaviour with Oracle through the
customer's own IT department, which owns the support contract. The KB body is
login-gated, so the vendor remedy is unknown until IT retrieves it.

## Vendor-confirmed defect: R31802A stamps the cardex batch and writes no GL

Oracle Support **KB 420628**, *"E1: 31A: When Running (R31802A) Manufacturing
Accounting No IM Journal Entry Or Batch Number Created In (F0911) But Cardex Is
Updated Correctly"*, last updated 2025-11-15. Applies to JD Edwards EnterpriseOne
Shop Floor Control, version XE and later.

**What the abstract states.** When Manufacturing Accounting (R31802A) is run, no
journal entries and no batch number are created in the G/L (F0911), while the record
in the P4111 / F4111 cardex is updated correctly. The example: a work-order
inventory issue is performed via P31113 and the cardex is correctly updated with the
IM transaction for a component; R31802A runs and the existing cardex IM record **is**
correctly updated with a batch number — but no journal entries and no batch number
are written to F0911. The batch therefore does not appear in the R09801 report and
**cannot be posted**.

Three caveats bound what the article can be used for:

- **Only the public abstract is available.** The article body sits behind the My
  Oracle Support login and could not be retrieved, so the Cause and Solution are
  unknown. Do not infer them. Working a confirmed instance requires the article body
  or Oracle Support.
- **The article documents the IM (material issue) variant; the Completion Not
  Journaled card is the IC (completion) variant** — same program, same failure mode,
  different transaction type. The distinction matters: the card fires only when an IM
  row is *present* in F0911, so this defect striking IM would **suppress** the card
  rather than cause it. The IC analog is what produces CNJ.
- **The stranded state is the point.** The batch is stamped on the cardex, no GL
  detail exists, the batch cannot be posted, and R31802A will not reprocess because
  the unaccounted units are already cleared. That combination is why the transaction
  is stuck — and why "repost" is inert.

Cite it as: Oracle Support KB 420628 (My Oracle Support, login required), abstract
only.
