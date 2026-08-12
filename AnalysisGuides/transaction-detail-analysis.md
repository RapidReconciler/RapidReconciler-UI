# Transaction Detail Analysis Guide

## RapidReconciler Inventory -- Transaction Detail Report Reference

---

## Section 0: The population — read this before writing any query

**`RCardexLedgerCompare2` is the document source of truth for transaction
variances. That is the sole purpose the table exists: to hold just the list of
documents that need analysis. Including any other document in a result set is
wrong.** (Owner ruling 2026-08-05, HARD.)

A document not in `RCardexLedgerCompare2` does not need analysis, by
definition — it already tied and was cleared.

**Do not confuse it with `RCardexLedgerCompare`** (no `2`). That is the
*pre-netting* table holding BOTH sides of EVERY transaction. `...Compare2` is
what survives netting. They are not two views of the same thing: one is the
whole ledger, the other is the worklist. Counting from the wrong one produces
numbers that look authoritative and mean nothing.

Worked examples of getting this wrong, all from a single session:

- Counting cardex-only `IT` documents in `RCardexLedgerCompare` gave **124,397**
  and read as a large inventory matching failure. Scoped to `...Compare2` the
  real figure is **3 rows on one database and 102 on another**, all already
  claimed by Transfer Integrity or Transfer Leg Missing. The other 124,000-odd
  had matched and cleared.
- A study of which match key minimises residual, run against
  `RCardexLedgerCompare`, produced figures such as "$2.68M sales residual". They
  describe the full ledger, support no conclusion about the variance
  population, and were discarded.

**Scope to `recstatus = 1`, never `< 2`.** (Owner 2026-08-05.) **`recstatus = 2`
rows have already been resolved by server-side processes** — they are not
analysis work and do not belong in a result set either. The domain is only
{1, 2} today, so the two predicates return the same rows; `= 1` states the
intent and stays correct if a status is ever added. For scale: 5,354 / 229,
2,093 / 2 and 4,684 / 135 across the three demo databases.

**The correct shape** — anchor on the variance population, then reach outward
only to *explain* those rows:

```sql
with p as (select * from dbo.RCardexLedgerCompare2
           where recstatus = 1 and <the card's own predicates>)
-- every other table joins TO p. Nothing else supplies the population.
```

The classifier already follows this: every claim in `usp8_txv_flags` scopes its
temp tables with `exists (select 1 from RCardexLedgerCompare2 ...)`, so F0911
and F4211 are never aggregated whole. Match that pattern.

⚠ **The dangerous case is a test that asks whether something exists OUTSIDE the
table** — *is there any F0911 row for this document?* It is anchored on a
`...Compare2` row, but its answer depends on a match key that may be wrong for
that transaction type, and a wrong key returns "nothing found" rather than an
error. The withdrawn `Sales Not Journaled` claim shipped exactly this way. See
§ Grain in `manufacturing-accounting-flow.md` for the per-type match keys, and
never conclude an entry is *absent* without first establishing the key for that
type.

### 0.1 `Type` comes from BATCH type, not document type

**Batch type is what discriminates manufacturing. Document type does not, because
`IM` is repurposable.** The batch type is stamped by the program that created the
batch: manufacturing accounting (R31802A) writes batch type **`0`**; inventory
programs write **`N`**. RR's own configuration agrees, listing exactly two
programs of interest: batch type `0` for WO/manufacturing accounting and `IB` for
sales inventory (R42800).

Shipped 2026-08-06 (DB PR #100): `Type` now derives batch-type-first, document
type only as a last resort when no batch type is resolvable. What it corrected:

- One specimen database holds batch types `N`, `G`, `O`, `V` and `IB` and **no
  batch type `0` anywhere**, meaning it does no manufacturing at all. Yet 166
  rows were typed `Mfg` purely because their document type was `IM`. They are
  inventory transactions run through an inventory program configured with a
  work-order document type. After the fix: 2 rows, and those two sit on batches
  absent from both F0011 and F0911, so no batch type exists to discriminate them.
- Lean manufacturing was ruled out against Oracle's documentation as an
  alternative explanation: lean uses `LM` / `LL` / `LC` / `LP` / `LO` / `LV`,
  never `IM`.
- Blank batch type in the compare was RR-produced, not JDE's. F0011 carried a
  batch type on batches the compare showed as empty. One database went from 825
  blank to 0. Once carried, blank versus populated separates **"the GL for this
  transaction was never loaded"** from **"the GL loaded and disagrees"** — two
  conditions with different corrective actions.
- Where F0911 and F0011 both carry a batch type they agree on all 2,180 compare
  batches checked, zero disagreements, so the F0011 fallback is safe rather than
  a guess. F0911 still wins when present.

**Consequence for analysis:** a manufacturing card firing on a company that does
no manufacturing is a typing error, not a finding. Check the company's batch
types before believing a manufacturing diagnosis.

### 0.2 Intercompany is an ORDER-type property, and `SI` is always intercompany

Owner ruling 2026-08-06: **an `SI` order is an intercompany order, always.** The
three intercompany order types are `SI` (the originating sales order), `SK` (the
inter-branch sales leg) and `OK` (the purchase leg). The document types they post
under — `JS`, `RI`, `OV` — are ordinary sales and purchasing types shared with
non-intercompany traffic, so **diagnosing at document-type grain averages
incompatible subgroups.**

Do not treat the `F4211.SDSO11` / `F4311.PDPS01` = `3` flag as the definition of
intercompany. It only detects it, and it does not hold up: on one database the
flag is blank on all 23,130 sales-order rows while that same database carries 261
`SK` orders; another uses values `2` and `4` but never `3`. The order type is the
reliable signal.

**Only the `SI` leg touches the item ledger.** The `SK` leg is line type `IC`
(Intercompany Non-Stock, inventory interface `N`), so it posts GL and never the
cardex. The `OK` leg is direct ship, so goods never enter the buying company and
**no receipt exists to find** — all `OK` lines close at status 999 with quantity
and amount received of zero. `F4111` holding zero `SK` rows is therefore correct,
not an extract gap. Full treatment in
[`analyst-reference.md`](../docs/plans/analyst-reference.md) § Module:
Intercompany Order processing.

⚠ **Never measure an intercompany tie-out *through* `RIntercoXref`.** That table
is incomplete by design of its source flag — on one order the GL held four
intercompany invoices and the xref carried two. A tie-out joined through it
under-reports the GL and manufactures phantom variance. Two wrong root-cause
hypotheses were published off exactly that mistake on 2026-08-06. Measure F0911
directly, then use the xref to *explain* what you found, never to scope it.

---

### 0.3 "Linked pair" means two JDE DOCUMENTS, not two AAI legs

A **linked pair** — the term the Transaction Variance lanes use, alongside *Linked
transactions* — is **two or more JDE documents that belong to one business event**,
matched to each other and judged as a whole rather than one at a time. Typically a
sales-side order and its purchase-side counterpart, held together by the classifier's
groupcode.

| Family | What is paired | Order types seen on current data |
|---|---|---|
| Transfers | The shipping side and the receiving side of a branch-to-branch move | `ST` / `OT` (also `S6`) |
| Direct Ship | The customer-facing sales order and the supplier purchase order that ships direct | Customer-defined |
| Intercompany | The selling company's document and its counterpart in the buying company | `SI` / `SK` |
| Make to Order | The work order and the sales order that originated it | `WO` / `W1`, keyed on the work order |

Order-type codes live in UDC `00/DT` and are **customer-defined** — name the family
first, and quote codes only as the instance in front of you actually uses them. Do not
assume `ST` means transfer on a customer you have not checked.

**Why the distinction matters enough for its own section.** "Pair" also appears in
DMAAI territory, where AAIs work in offsetting pairs and one leg debits while the other
credits. That is a *different concept at a different layer*, and conflating the two
produces an answer that is fluent, accurate about AAIs, and useless — asked "what is a
linked pair", an AI grounded only in the DMAAI reference answered with offsetting debit
and credit legs, which is not what the lane label means and not what the analyst was
asking (observed 2026-08-09).

**And it is the wrong SUBJECT for this reader.** The reconciliation analyst works
orders, documents, order types, programs and item movement, and fixes causes at the
source in JD Edwards. They are not posting the entries — that is the accountant's side
of the split. Answering an analyst in debits, credits and which account is charged is
off-target even when every word is correct. Reserve account-level mechanics for when
the question is explicitly about an account.

## Section 1: Using Claude for Automated Analysis

Claude can perform a full Transaction Detail analysis automatically and return an updated `.xlsx` workbook with the analysis written to a card-layout sheet, the source sheet highlighted with priority colours and equipped with jump-to-row hyperlinks, and the priority level computed from the variance against the document amount. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`transaction-detail-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The Transaction Detail report (`.xlsx`)

Then use the following prompt:

> *"Analyze this file using the Transaction Detail Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the card-layout analysis sheet and the source sheet with priority highlights."*

Claude will read both documents, work through the analysis procedure against the Excel data, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent Transaction Detail reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet and highlights."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **Transaction Detail-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Transactional, document-focused.** A single primary variance with a single root cause; the reader's job is to understand *this* number for *this* document.

**File naming** (formatting spec, Section 1): `Transaction Detail Analysis for {doc} {DT}.xlsx`. The key identifier is the document number (from the Doc Header) and the document type code.

**Source sheet name:** `Transaction Details`. **Sorting is not required** — the Transaction Detail export is grouped by section (Doc Header, F4111 Data, F0911 Inv Acct, F0911 Exp Acct, RR Summary, Header Comp, Receipts, DMAAs) rather than sequenced by time. Apply AutoFilter on the header row (row 2) and freeze panes at A3 per the formatting spec; do not reorder rows.

**Headline anchor** (formatting spec, Section 4): document ID and document type.

> `Transaction Detail — Document {doc} ({DT name}) — Order {order} ({OT})`

Spell out the DT and OT codes (RI = Sales Invoice, OV = Purchase Order Receipt, IM = Material Issue, etc.) — see Section 9 of this guide for the full DT reference.

**Variance subline** (formatting spec, Section 5.3): a single sentence that describes the gap. Examples of what the sentence should answer: which side has an unmatched amount, what account the gap is on, whether the variance is a posting issue or an account-mismatch issue.

**Secondary context strip** (formatting spec, Section 5.4) carries: Company, GL Date, Period.

**Variance card pattern label** (formatting spec, Section 6.1): use the Section 5 pattern classification followed by a one-line plain-English explanation. Examples (substitute the actual case):

- `Pattern:  GL-Only Entry — {what posted where it shouldn't have}`
- `Pattern:  Account Mismatch — {what account got the value vs. what should have}`
- `Pattern:  Period Mismatch — {which side ran in a later period}`

**Priority calculation** (formatting spec, Section 9.3, ratio-based — single-ratio): denominator is `max(|CardexAmount|, |LedgerAmount|)` from the RR Summary line. The label in the rationale string is "document amount":

> `${variance} variance vs ${denom} document amount = {ratio}% — {action label}`

When both Cardex and Ledger are zero (no document found), treat ratio as 100% / Priority 1.

**HOW card content** for Transaction Detail variances generally takes one of two shapes (Resolution sub-card per formatting spec, Section 6.2):

1. **Posting-correction case** (the variance is real and needs a journal entry). Structure: `DR / CR` journal entry on indented lines as Step 1, followed by investigation and control steps. Include a materiality reminder if the amount is small or the document is old.

2. **Configuration-correction case** (the variance is symptomatic of a misconfigured AAI, processing option, or GL class code). Structure: identify the configuration item to fix as Step 1, the verification step as Step 2, and the correction-or-suspension decision as Step 3.

In both cases, include a step that has the user verify the current state of the document on the Transactions page in RapidReconciler before posting any correction, since the variance may have moved since this analysis was generated.

**All patterns share a unified output style** &mdash; the WHAT card is a bullet list of the key facts (amounts, accounts, period, variance direction); the WHY card is a bullet list of 1&ndash;3 root-cause candidates (not exhaustive); the HOW card is a short numbered action sequence ending with a one-line prevention pointer. No prose paragraphs, no "Step 1 / Step 2 / Step 3 / Step 4 / Step 5" boilerplate where 2 steps would do. The Account Mismatch pattern (Section 5.4) is the most elaborate &mdash; its HOW includes a real Excel JE-flow matrix &mdash; but every pattern's output passes the same "all signal, no noise" check.

**Suggested causes** from the Section 8 Quick Lookup should be distilled into the WHY card body (formatting spec, Section 6.2), not listed as a separate section. The full lookup table lives in this guide for the analyst to reference; the workbook only needs the most likely cause.

**Evidence list** (formatting spec, Section 6.3): show the source rows that drive the variance. For Transaction Detail, evidence typically includes:

- **Root cause (P1)** — the F4111 row or F0911 row that creates the imbalance
- **Anchor (P2)** — the RR Summary line showing the variance values
- **Related (P2)** — the counterpart row(s) that establish the comparison (e.g., the matching ledger entry)
- **Informational (P3)** — Doc Header, DMAAI, or Receipts rows providing context

Each Evidence row is hyperlinked to its source-sheet row.

**Source sheet handling** (formatting spec, Section 10): Pattern C — **highlight only the rows referenced by Evidence** with priority fills matching their severity badge. Do not highlight every row in the report.

### 1.4 Notes and Limitations

- Claude analyzes the data as exported. If the source report was generated with filters applied or sections suppressed, the analysis reflects only what is present in the file.
- For very large Transaction Detail reports spanning many documents or periods, include a note in the prompt identifying the specific document number to focus on if only one transaction is under investigation.
- Claude will note if a finding requires further investigation in JD Edwards (e.g., querying F0911 across all accounts for a specific batch or GL document number) that cannot be completed from the Excel file alone. These items will appear inside the HOW card or as Related evidence rows.
- Amounts in the exported file may display with floating-point precision artifacts. Claude rounds all amounts to two decimal places for analysis and reporting purposes. These artifacts do not affect the accuracy of the analysis.
- Processing option suggestions are drawn from the Section 8 Quick Lookup table in this guide. They identify candidate settings to investigate, not confirmed causes. The correct version settings must be verified in JD Edwards before any conclusions are drawn.
- The priority level on the variance card is computed mechanically from `|variance| / max(|cardex|, |ledger|)` against the thresholds in Section 9.3 of the formatting spec. A small variance against a large document is genuinely lower priority than the same variance on a small document, even when both look like "$X has a problem" at first glance.

## Overview

The Transaction Detail report in RapidReconciler is produced when drilling into an unreconciled transaction on the Transactions page. It provides a complete side-by-side view of what exists in the item ledger (F4111) versus what exists in the general ledger (F0911) for a specific company, document type, and document number.

The report is the primary diagnostic tool for identifying the root cause of transaction-level variances. A thorough understanding of each section and how RapidReconciler uses them is essential for effective analysis.

> **Who should use this guide:** JD Edwards business analysts, cost accountants, and inventory accountants responsible for investigating and resolving transaction variances in RapidReconciler.

---

## Section 2: Report Structure

The Transaction Detail report is organized into the following sections, always appearing in this order:

| Section | Name | Purpose |
|---|---|---|
| **Unassigned** | Unassigned Account | **Appears only when GL class codes are missing from the model table.** Lists F4111 cardex rows that RapidReconciler cannot assign to a GL account. These rows are excluded from the reconciliation and do NOT appear in the F4111 Data section or F4111 Total. |
| **Doc Header** | Document Header | High-level summary of the document being analyzed including the variance amount and sub type |
| **F4111 Data** | Item Ledger Data | All cardex records for the document from the item ledger table -- **excludes any rows in the Unassigned section** |
| **F0911 Inv Acct** | GL Inventory Account | All GL entries posted to inventory balance sheet accounts for the document |
| **F0911 Exp Acct** | GL Expense Account | All GL entries posted to non-inventory (expense/variance) accounts for the document |
| **RR Summary** | RapidReconciler Summary | How RapidReconciler matched and summarized the data; shows the net cardex total, GL total, and variance |
| **Header Comp** | Header Comparison | Purchase order or sales order header data for context |
| **Receipts** | Receipt and Voucher Detail | All F43121 records (receipts, voucher matches, reversals) for the order being analyzed |
| **DMAAs** | DMAAI Entries | All AAI entries for each GL class code in the transaction, starting with the model table (4152) |

> **Critical:** If the Unassigned section is present, the F4111 Total shown in the report is **understated**. The true cardex total is the F4111 Total plus the Unassigned Total. The variance displayed in the Doc Header and RR Summary only reflects the portion of the transaction that RapidReconciler can match -- not the full picture. Always check whether the Unassigned section is present before interpreting variance amounts.

---

## Section 3: Section-by-Section Field Reference

### 3.1 Unassigned Section

The Unassigned section appears at the top of the report **only when one or more GL class codes in the transaction are missing from the model DMAAI table (4152)**. It is the first indicator that a model table gap exists.

| Field | Description |
|---|---|
| **Account** | Displays "outside operations" or another internal RapidReconciler label -- not a real GL account number, because no model table entry exists to assign one |
| **CardexAmount** | The F4111 amount for this row -- excluded from the F4111 Total and from all reconciliation matching |
| **LedgerAmount** | Always $0.00 in this section |
| **Variance** | Equal to CardexAmount -- the full amount is unmatched |
| **Comment** | "Unassigned Account" -- confirms why the row appears here |
| **Unassigned Tot** | The total of all unassigned rows. **Add this to the F4111 Total to get the true cardex amount for the document.** |

> **What to do:** When the Unassigned section is present, immediately go to the DMAAs section and look for "Missing model table entry" in the Comment column. Identify which GL class code is missing and add it to DMAAI table 4152 in JD Edwards. After the next RapidReconciler refresh, the previously unassigned rows will move into the F4111 Data section and the full variance will be visible.

### 3.2 Doc Header

| Field | Description |
|---|---|
| **Period** | The fiscal period the transaction falls in |
| **Account** | The GL account number |
| **Source** | Always "Doc Header" |
| **Company** | JD Edwards company number |
| **Doc** | The document number being analyzed |
| **DT** | Document type (e.g., OV = receipt, PV = voucher match, PD = payment, IM = inventory issue) |
| **OrderNum** | The associated purchase or sales order number |
| **OT** | Order type (e.g., OP = purchase order) |
| **LedgerAmount** | The total GL amount for this document -- the variance to be explained |
| **Sub Type** | RapidReconciler classification of the variance type (see Section 8) |

### 3.3 F4111 Data

| Field | Description |
|---|---|
| **F4111 Tot** | The total cardex (item ledger) amount for this document. If zero and the GL has an amount, this is a GL-only entry -- a common and significant finding. |

Individual F4111 rows (when present) include:

| Field | Description |
|---|---|
| **TransDate** | The transaction creation date |
| **GLDate** | The GL date assigned to the transaction |
| **GLClass** | The GL class code from the item location record |
| **Batch** | The JD Edwards batch number |
| **BT** | Batch type |
| **Doc / DT** | Document number and type |
| **OrderNum / OT** | Order number and type |
| **Line** | The order line number |
| **Ext** | Cost method (UDC 40/CM) recorded against the F4111 row at posting time. `02` = Weighted Average, `07` = Standard, `09` = Manufacturing Last, etc. Lets the analyst confirm the costing regime in effect for this transaction without a separate F4105 lookup. See the [Cost Methods reference](../RRUniversity/inventory-costing.html#section-1) for the full UDC list. |
| **PC** | Posting code. "P" = posted; blank or other = not posted. "X" = memo transaction (excluded from reconciliation) |
| **Branch** | Branch plant |
| **Item** | Item number |
| **Location / Lot** | Location and lot number |
| **Qty** | Transaction quantity |
| **UM** | Unit of measure |
| **UnitCost** | Unit cost on the transaction |
| **CardexAmount** | Extended amount from the cardex |

### 3.4 F0911 Inv Acct

GL entries posted to inventory balance sheet accounts. These are the entries RapidReconciler expects to match to the F4111 cardex.

| Field | Description |
|---|---|
| **Account** | The GL account number |
| **TransDate / GLDate** | Transaction and GL dates |
| **Batch / BT** | Batch number and type |
| **Doc / DT** | Document number and type |
| **LedgerAmount** | The GL amount for this entry |
| **Comment** | Supplier name or other descriptive text from the GL |
| **F0911 Tot** | Total of all GL inventory account entries for this document |

### 3.5 F0911 Exp Acct

GL entries posted to non-inventory accounts (expense, variance, RNV, tax). These entries are visible for context but are not included in the inventory reconciliation matching.

> **Non-F4111 purchasing AAIs:** Several purchasing AAIs are **not written to F4111** and will always appear here as one-sided GL entries with no cardex counterpart. This is expected behavior, not a data error. Confirm the amount is reasonable before treating it as a problem.
>
> | AAI | When Invoked |
> |---|---|
> | **4335** | Standard cost variance at receipt — when the receipt cost differs from the F4105 standard |
> | **4332** | Goods sold prior to voucher match — when on-hand quantity is less than the quantity being vouchered |
> | **4337** | Material Burden — credit generated by P4312 for purchased items only; never written to F4111 |
> | **4340** | Exchange rate variance at voucher match — for foreign currency POs |

### 3.6 RR Summary

The most important section for understanding what RapidReconciler sees and how it matched the transaction.

| Field | Description |
|---|---|
| **CardexAmount** | The total F4111 amount RapidReconciler used for matching |
| **LedgerAmount** | The total F0911 inventory account amount RapidReconciler used for matching |
| **Variance** | CardexAmount minus LedgerAmount. Non-zero = unreconciled. |
| **RR Total row** | Summary line showing the net variance. The Variance column here matches what appears on the Transactions page. |

> **Key diagnostic:** Work through the following checks in order:
>
> - **CardexAmount = 0, LedgerAmount non-zero** → GL-only entry. The variance is entirely on the GL side. See Section 5.2.
> - **LedgerAmount = 0, CardexAmount non-zero** → Cardex-only entry. Check for unposted batches. See Section 5.3.
> - **Both non-zero but unequal, with one or more rows showing LedgerAmount = $0.00 for a specific batch** → Partial cardex-only entry. A single line item within an otherwise-posted batch has no GL counterpart. See Section 5.3.
> - **Both non-zero but unequal, with one or more rows showing a GL amount larger than the corresponding cardex for a specific batch** → GL-excess entry. The GL entry for that account and batch exceeds the cardex. The net variance is positive. See Section 5.11.
> - **Multiple rows with CardexAmount and LedgerAmount on separate rows** → Account or period mismatch. See Sections 4.4 and 4.5.
> - **Both non-zero but unequal, and the document type is IM, and all individual account/batch pairs show a GL excess on one GL class while other GL classes reconcile cleanly** → R31802A cross-work-order GL summarization. The GL entry for the affected account may span multiple work orders processed in the same R31802A run. See Section 5.12.

> **Floating-point display:** Amounts in the RR Summary and F4111 Data sections may display with extended decimal precision (e.g., $636.20000000000005 or -$16.579999999999998). These are IEEE 754 floating-point representation artifacts from the export process and do not indicate a data error in JD Edwards or RapidReconciler. Always round to two decimal places when reading amounts from this report. The document-level variance shown in the Doc Header is the authoritative figure for reconciliation purposes.

### 3.7 Header Comp

Purchase order or sales order header context. Key fields:

| Field | Description |
|---|---|
| **TransDate / GLDate** | Dates on the order header |
| **GLClass** | GL class code on the order line |
| **Doc / DT** | Document number and type |
| **OrderNum / OT** | Order number and type |
| **Line** | Line number |
| **LineTy** | Line type (e.g., S = stock, N = non-stock, F = freight, D = direct ship, W = work order) |
| **NxtSts** | Next status. 999 = fully closed. Important for determining whether further JD Edwards processing is possible. |
| **Branch / Item / Location / Lot** | Item details |
| **Qty / UM / UnitCost** | Quantity, unit of measure, and unit cost on the order |
| **CardexAmount** | The cardex amount associated with this order line |
| **Comment** | Additional context (e.g., "Taxes", "Voucher Match", "Landed Cost", "non stock line", "sales ext cost error calc") |

> **Key indicator -- GLDate of 2000-01-01 and Doc of 0:** When a Header Comp row shows a GL date of **2000-01-01** and a document number of **0**, this is a RapidReconciler flag indicating the order line was **never processed through Sales Update**. The line exists in JD Edwards but has no invoice document and no GL entry. If the CardexAmount is also $0.00, no cardex was written either. These lines may represent unbilled quantities, cancelled lines that were not properly closed, or calculation errors. Look for an accompanying comment such as "sales ext cost error calc = [amount]" which indicates RapidReconciler detected a discrepancy in the extended cost calculation for the line.

### 3.8 Receipts

All F43121 records for the order. This is the most detailed section for understanding the full purchasing history.

| Field | Description |
|---|---|
| **Source** | Always "Receipts" |
| **TransDate / GLDate** | Receipt or voucher match dates |
| **GLClass** | GL class code |
| **Batch / BT** | Batch number and type. "No Cx" in the Batch field means no cardex record was created -- this is significant. |
| **Doc / DT** | Document number and type |
| **OrderNum / OT** | Order number and type |
| **Line** | Line number |
| **NxtSts** | Next status on the F43121 record |
| **Qty / UM / UnitCost** | Quantity and cost details |
| **CardexAmount** | The cardex (F4111) amount for this receipt/voucher |
| **LedgerAmount** | The GL (F0911) amount for this receipt/voucher |
| **Variance** | Difference between CardexAmount and LedgerAmount for this specific document |
| **Comment** | Context such as tax amounts ("Taxes = 1057.02"), "Landed Cost", "Voucher Match" |

### 3.9 DMAAs

All DMAAI entries for each GL class code in the transaction. The first row is always from the model table (4152).

| Field | Description |
|---|---|
| **Account** | The full account number (Business Unit.Object.Subsidiary) |
| **DMAAI Table** | The specific AAI table number and name |
| **Company** | The company the AAI is configured for |
| **GLClass** | The GL class code |
| **Object** | The object account in the AAI |
| **Ty** | Order type the AAI applies to |
| **Comment** | RapidReconciler flags such as "Mismatch - object", "Mismatch - BU", "Net Zero" |

> **Critical:** Any entry in the Comment column of the DMAAs section indicates a configuration problem. "Mismatch - object" means the AAI object account does not match the model table. "Mismatch - BU" means the business unit differs. "Net Zero" means the debit and credit AAIs point to the same account, producing no net GL impact.

### 3.10 Cross-Section Interpretation Rules

The Transaction Detail sections are not independent. Each carries an expectation about what should appear in the others, and the variance you're investigating is almost always a violation of one of these expectations. Read them as a small set of rules; the existing patterns in Section 5 are specializations of these rules.

**Rule 1 -- LineTy on the Header Comp / Orders section predicts F4111 presence.**

Every order line in the Header Comp section (both purchase and sales orders) carries a **LineTy** code (S, N, J, F, T, M, W, B, D, and site-defined variants). The **Inventory Interface** flag on the line-type constant (`F40205`) is the cardex-vs-GL lever -- it decides whether the line writes to the item ledger (F4111) or posts to the GL only:

| Inventory Interface | Writes cardex (F4111)? | What the line is | Typical codes |
|---|---|---|---|
| **Y** | Yes | Full inventory processing -- F41021 availability, F4111 cardex, costing, and the GL | S (stock), W (work order) |
| **D** | Yes | Direct-ship inventory processing (same cardex handling as Y) | D (direct ship) |
| **A** | No -- GL only | The line carries a G/L account number and a lump-sum amount, no item | J (G/L account / non-stock), IC (intercompany non-stock) |
| **B** | No -- GL only | Like A, but an item number is also required (bulk / commingled) | B, SI (internal sales) |
| **N** | No | Treated as a text line -- little editing; no item-ledger, and often GL-only or nothing | N / NS (non-stock), T (text), F (freight), M (misc), % (tax) |

**This is the classification rule the reconciliation leans on:** a GL-only reconciling row (F0911 present, F4111 absent) on an **A / B / N** line is **expected** -- a non-inventory line posting straight to the GL -- **not a variance**. The anomalies are the inverse: a **Y / D** line missing its cardex (Pattern 5.13 is the closed-order variant -- could be an unshipped backorder when NxtSts < ship-confirm, or a genuinely unwritten cardex), or an **A / B / N** line that somehow *did* write cardex (a misconfigured line type or a posting that bypassed the interface).

**Do not trust a generic "standard" F40205 -- the interface is per-JDE-environment.** A line type's code is whatever that customer configured; a code *named* "non-stock" can be set inventory-writing, and assuming the textbook value will misclassify real volume. Validate a line type's true interface against the database's **own cardex footprint**: join the order lines (sales `F4211`/`F42119.sdlnty`, purchase `F4311.pdlnty`) to `F4111` on the originating order (`ildoco` / `ildcto` / `ilkco` / `illnid`) and measure what fraction of that line type's lines actually produced cardex rows. A true stock line runs ~80--90%; a genuine non-cardex line runs 0%. *(Worked case: one shop's `NS` line fired cardex on 89% of its lines -- inventory-writing despite the "non-stock" name, so its real interface is `Y`, not the standard `N`. A generic seed would have mislabeled ~60K inventory movements as expected GL-only.)* RapidReconciler now carries each customer's `F40205` as a **per-database table** (mined from their `PRODCTL.F40205`), so the classifier and this analyzer resolve the *actual* interface per line type rather than guessing.

See `RRUniversity/inventory-line-types.html` for the full LineTy reference, including which flags each code carries.

**Sales-order lines — always resolve through `vcr_f42119`** (the union of `F4211` open/active + `F42119` history), never `F4211` or `F42119` alone. An **empty `F42119` is a valid customer process choice, not missing data**: JDE Sales Update (`R42800`) moves a line from `F4211` to `F42119` only when its purge-to-history processing option is set; if the customer doesn't purge, closed/shipped orders (status `620`/`999`) simply stay in `F4211` by status. So don't read "no shipments / no sales history" from an empty `F42119` — query `vcr_f42119` and filter by status (`sdnxtr`; `999` = closed/shipped). This is how the WO↔SO link resolves for a Make-to-Order card: the WO's completions load Finished Goods, and the originating sales order (stamped on `OrigOrder`) relieves it when it ships — a residual there is open WIP/FG timing, not a mapping error.

**Rule 2 -- The F4111 row's Account column is the expected GL account.**

Each F4111 row carries an **Account** value -- that's the GL account where RapidReconciler expects the corresponding F0911 inventory entry to land, based on the DMAAI configuration that fired for the transaction. When the F0911 Inv Acct entry lands on a **different account**, the variance is an **account mismatch** (Section 5.4). The mismatch is read directly off the two sections without any DMAAI configuration lookup -- F4111 has the expected account, F0911 has the actual posted account.

Common causes when these disagree:
- A DMAAI configuration that's been changed mid-period -- older cardex rows reference the prior account; newer GL entries reference the new account
- A non-stock line on the same order routing through an inventory AAI (mixed-line-type pattern; analyzer pattern 5.7 -- documented here under the non-stock-line cause in Section 5.2)
- A manual journal entry that miscoded an inventory amount to a different account (Section 5.2)

**Rule 3 -- The F4111 row's Period and the matching F0911 row's Period should match.**

If F4111 and F0911 hit the same account but in **different fiscal periods**, the variance is a **period mismatch** (Section 5.5). This is a different root cause from an account mismatch -- the AAI is correctly configured, but the GL post landed in a period other than the cardex period. Typical causes:
- Sales Update (R42800) or Manufacturing Accounting (R31802A) ran with a GL date processing option set to "use system date" rather than the F4111 transaction date -- every batch posts to the GL period the program runs in, not the period the inventory moved
- Backdated F0911 entries (manual JE) coded to inventory
- Period close timing -- cardex written in the open period; GL post deferred into the next period

Account mismatch and period mismatch are mutually exclusive: an account mismatch is about *where* the GL landed; a period mismatch is about *when*. Both produce multiple rows in the RR Summary, so the way to tell them apart is to look at the rows directly -- same account but different periods is the period case; different accounts is the account case.

**Rule 4 -- F4111 row count can exceed F0911 row count.**

RapidReconciler matches on the totals after normalization, not on row counts. JDE's GL-posting programs frequently summarize multiple cardex rows into a single F0911 entry to save record count in the GL:
- R31802A (Manufacturing Accounting) summarizes by GL account across a batch of work orders -- one F0911 entry per (account, batch) regardless of how many components were issued
- R42800 (Sales Update) can summarize by document or by GL account depending on its processing options
- R09870 (General Post) can also consolidate inventory postings

So seeing 8 F4111 rows and 2 F0911 rows on the same doc is normal, not a bug. The opposite -- fewer F4111 rows than F0911 entries on the same account, batch, and period -- is suspicious (suggests a GL post with no cardex backing, Pattern 5.2, or a cardex shortage like Pattern 5.13).

**Rule 5 -- The RR Summary normalizes both sides to one row per (account, period).**

The F4111 Data and F0911 Inv Acct sections both contain raw rows; the **RR Summary** rolls each side up to one row per unique (Account, Period) combination and lays them side-by-side. That's why:
- A clean reconciliation produces **one** RR Summary row with CardexAmount and LedgerAmount both populated
- An account or period mismatch produces **two or more** RR Summary rows -- one with only CardexAmount, one with only LedgerAmount, on different accounts or different periods

The RR Summary is the section to read first. The F4111 and F0911 sections back up the diagnosis once the Summary points you at the right rows.

**Rule 6 -- One document reconciles on its own; screen for a duplicate relief first.**

A transaction variance reconciles **one document**: the F4111 (item ledger / cardex) extended value against the F0911 (GL / ledger) for the *same* company, document, and account. The variance is `ledger − cardex` for that document and nothing else, so a POSITIVE variance means the GL carries more value than the item ledger and a NEGATIVE variance means the item ledger carries more. Two habits follow from this:

- **Duplicate sales are the first-order check.** They are rare, but the test is cheap and definitive, so run it before reaching for a cost, mapping, or timing explanation. When a line is written to the cardex more than once (two F4111 relief rows for the same order + line) but the GL books it once, the cardex is overstated by exactly that line and the **variance equals the duplicated relief**. `dbo.RDuplicateSales` is the ready-made flag -- it keys on OrderNumber + OrderType + LineID + item / branch / location / lot, with `Records` as the repeat count and `Amount` as the duplicate value. When it fires, lead with it and fix the double relief at the source (an inventory adjustment); it is never a journal entry. Full procedure in Section 5.17.

- **A transfer's two legs are independent, and in-transit is a separate surface.** A transfer ships and receives as two independent transactions (ST shipment, OT receipt); each reconciles on its own document. Never explain one leg's variance by whether or when the other leg posted. The pairing of the two legs -- the ST↔OT match, the 4220 / 4245 in-transit clearing account, the exclusions -- is a **different reconciliation** that lives on the transfer-order Orders page (see `../RRUniversity/transfer-order-reconcile.html`). Do **not** invoke a stranded-leg or in-transit clearing model to explain a per-document cardex-vs-ledger variance. That conflation produces a plausible-but-wrong diagnosis on a variance that is really a duplicate relief, an account mismatch, or a period mismatch.

---

## Section 4: How RapidReconciler Matches Transactions

RapidReconciler matches F4111 and F0911 records using the following fields:

- Company number
- Account number
- Fiscal period
- Document type
- Document number
- Order number
- Batch number

A difference in **any one of these fields** results in a mismatch. The RR Summary section will show multiple rows when a mismatch exists -- one row per unique combination of matching fields found.

**Single row in RR Summary = match. Multiple rows = mismatch on one or more fields.**

Common mismatch scenarios:

| Mismatch Type | What It Looks Like | Common Cause |
|---|---|---|
| Account mismatch | CardexAmount and LedgerAmount on separate rows | DMAAI misconfiguration; GL class code change |
| Period mismatch | Same amounts but in different period rows | Backdating; Sales Update or Manufacturing Accounting processed in a different period than the cardex |
| GL-only entry | CardexAmount = 0, LedgerAmount has a value | Manual journal entry to inventory account; payment or discount entry coded to inventory; voucher with no receipt |
| Cardex-only entry | LedgerAmount = 0, CardexAmount has a value | Unposted batch (batch = 0) with cardex written but GL not updated -- **except** IC/IM/IH work-order docs with batch &gt; 0, where the GL is posted under an R31802A-renumbered document and must be matched by the subledger (work order); see "Manufacturing Accounting GL Summarization" below |
| Partial cardex-only entry | Both totals are non-zero but unequal; one or more RR Summary rows show LedgerAmount = $0.00 for a specific batch/account | A single line item within an otherwise-posted batch has no GL counterpart -- see Section 5.3 |
| GL-excess entry | Both totals are non-zero but unequal; the GL amount for a specific account and batch exceeds the corresponding cardex; net variance is positive | GL entry is a summarized manufacturing posting spanning multiple work orders; manual journal entry miscoded to inventory; cardex row excluded from report -- see Sections 4.11 and 4.12 |

### Manufacturing Accounting GL Summarization (IC, IM, IH Transactions)

R31802A (Manufacturing Accounting) summarizes GL postings for work order transactions. A single F0911 entry may represent costs from multiple work orders, multiple completion batches, or multiple material issue documents processed in the same run. The GL document number in F0911 for IC, IM, and IH transactions is therefore almost always different from the cardex document number -- and a single GL entry may be larger than any individual cardex row because it covers activity from other work orders not shown in this report.

**Implication for RapidReconciler matching:** because R31802A renumbers the GL document, cardex and GL for IC / IM / IH transactions cannot be paired on the document number. The reliable key is the **work order**, carried in the F0911 **subledger** (`GLSBL`, subledger type `W`): match the cardex completion to the GL entry whose subledger equals the work order, on the same account. Where a customer does not populate the subledger, fall back to the **F3106** document cross-reference (`sddoco` = work order &rarr; `sddoc` = GL document). Matching that ignores the subledger strands work-order completions as false **cardex-only** rows -- they look like an unposted batch but the GL completion is fully posted under a renumbered document. On one live customer, 452 of 647 such stranded IC rows (£11.0M) tied out exactly once matched by subledger. The true residual after the match was two real patterns, not artifacts: £0.1M of cost differences (5.16 Mfg Cost Mismatch, GL completion present but at a different amount) and £1.6M of **completions never journaled** -- the work order's material issues (IM) are posted to the GL but the completion (IC) was never posted at all, so the cardex shows finished goods in inventory that the GL never received (WIP overstated, FG understated). That last one is a genuine posting gap to work, not a match artifact, and it only becomes visible once the false cardex-only rows are matched away by subledger.

**Do not read a cardex-only IC/IM/IH row as an unposted batch when its batch number is non-zero.** Batch = 0 means unposted; batch &gt; 0 means the GL posted and the match is failing on the key, not the posting. Resolve it by the subledger before treating it as a posting gap.

**Applies to:** IC (work order completion), IM (material issue to work order), IH (manufacturing accounting journal entry). Does not apply to standard inventory transactions (IA, IT, II, IB).

**One caveat on F3106:** it has been seen to cross-reference a work order to its material-*issue* document rather than the *completion* document, so treat the subledger as authoritative when present and use F3106 only as the fallback.

**How to verify the scope of a GL entry:**
1. Query F0911 by the **work order in the subledger** (`GLSBL`, type `W`) to find the completion regardless of its renumbered document, then note the GL document number.
2. Query F0911 for that GL document number with no other filters.
3. If the GL document number references multiple order numbers or subledgers, the entry is a summarized posting -- the variance is attributable to the combination of all work orders, and RapidReconciler will reflect the full variance across all affected transaction records.

**Cross-work-order GL excess — specific pattern for IM transactions:**

When an IM document shows a GL-excess pattern (F0911 exceeds F4111 for a specific GL class and batch) and all other GL class / batch combinations on the same document reconcile cleanly, this is a strong indicator that R31802A captured component costs from other work orders processed in the same run and posted them to the same GL account and batch as this document. The excess belongs to those other work orders — not to a posting error on this document. See Section 5.12 for the full investigation procedure.

---

## Section 5: Common Variance Patterns and Root Causes

**Pattern index -- analyzer ID vs app code vs guide section.** Three numbering
schemes exist and none of them is the other. The Export Analyzer (the workbook)
assigns each Transaction Detail diagnosis an internal **pattern ID** (e.g.
`5.18`). This guide's **section numbers** drifted from those IDs as patterns were
added. And the **application** -- the Transaction Variance cards on Home and the
pattern cards on the details page -- identifies patterns by **named code**
(`ACCT`, `DUP`, `CNJ`), never by number: it used to mirror the analyzer's `5.x`
IDs one-for-one-ish, which read as an alignment that was never true, so the app
codes were renamed to names. The analyst sees a *label* on every surface, never
an ID. Use this table to cross-walk. **--** in a column means that scheme has no
entry for the row.

| Analyzer pattern ID | Pattern label | App code | Guide section |
|---|---|---|---|
| 5.1 | Unassigned Account -- Missing Model Table Entry | -- | 5.1 |
| 5.2 | GL-Only Entry (No Cardex) | `GL-ONLY` | 5.2 |
| 5.3 | Cardex-Only Entry (No GL) | `CDX-ONLY` | 5.3 |
| 5.4 | Account Mismatch | `ACCT` | 5.4 |
| 5.5 | Net-zero F0911 pair (DMAAI complement misrouted) | `NZR` (net-zero AAI pair, mfg) | 5.10 |
| 5.6 | Standard Cost Change after WO completion | `STD-COST` (Cardex Revaluation) | 5.9 |
| 5.7 | Mixed line types on a return doc | `NSL` / `NCL` | 5.2 (non-stock-line cause) |
| 5.11 | GL-Excess / R31802A cross-WO summarization | `OTHER` | 5.11 (IM variant: 5.12) |
| 5.13 | Post-confirm order edit (sales) | -- | 5.13 |
| 5.14 | Period Mismatch | `PER` | 5.5 |
| 5.15 | R31802A orphan cardex row | -- | 5.14 |
| 5.16 | Manufacturing Cost Mismatch | `MCM` | 5.16 |
| 5.17 | Voucher Variance on Inventory (PV) | `VCHR` | 5.15 |
| 5.18 | Duplicate shipment -- same order line | `DUP` | 5.17 |
| 5.19 | Transfer Integrity -- IT receipt leg priced and never extended | `TXI` | 5.18b |
| -- (card) | Transfer Leg Missing -- IT document with one item-ledger leg | `TLM` | 5.18a |
| 5.20 | Completion Not Journaled -- WO completion on cardex, not in GL | `CNJ` | 5.19 |
| -- (card) | Make to Order -- manufacturing residual, decomposed by shape | `MTO` | 5.20 |
| 5.21 | Cross-Batch Completion -- ties at work-order grain | `XBC` | not written up yet |
| 5.22 | DMAAI Net Zero -- 3110 and 3130 resolve to one account | `NZR` **withdrawn 2026-08-10** -- 3110 and 3130 are not a debit/credit pair; reasoning in `usp8_txv_flags` block I | not written up |
| 5.23 | Sales Not Journaled -- relief stamped, no GL entry | `SNJ` **withdrawn 2026-08-05** -- the absence is real, the failed-run inference was not; the cause is now `SAC` | 5.22 |
| 5.24 | Non-Stock Charge Lines -- every line non-stock | `NCL` | not written up yet |
| -- | Offsetting GL entries -- 4220 and 4240 both route to a P&L account | `OFF` | 5.23 |
| -- (card) | Sales DMAAI Net Zero -- 4220 and 4240 resolve to ONE account, so no GL entry is written and the cost never reaches cost of goods | `SAC` | 5.22 |
| -- | Intercompany / Transfer / Direct Ship leg pairing | `ICO` / `TRF` / `DS` | 5.20 (mfg), leg pairing not written up yet |
| -- | Unclassified residual by transaction type | `T-SALES` / `T-PURCH` / `T-MFG` / `T-INV` | -- |
| -- | Tax Variance | -- | 5.6 |
| -- | Landed Cost Variance | -- | 5.7 |
| -- | "No Cx" in Batch Field | -- | 5.8 |

Every app code's name, mechanism, corrective action and structured finding is
declared once, in the application's own catalog (`RRV8/config.js`, `RRV8.txv`).
The copy an analyst reads on a card, in the scope band, in the work panel and in
a saved finding all comes from that one entry.

### 5.1 Unassigned Account -- Missing Model Table Entry

**Symptoms:**
- An **Unassigned** section appears at the top of the report before the Doc Header
- F4111 rows appear in the Unassigned section with an account labeled "outside operations" or similar internal label
- The F4111 Total is zero or lower than expected
- The DMAAs section shows **"Missing entry / Missing model table entry"** for one or more GL class codes
- The variance shown in the Doc Header and RR Summary reflects only the portion of the transaction with a known GL class -- the unassigned portion is hidden

**What is happening:**

RapidReconciler uses DMAAI table 4152 to assign a GL account to every F4111 cardex row during import. If a GL class code has no entry in the model table, RapidReconciler cannot assign an account and places those rows in the Unassigned section instead of F4111 Data. These rows are completely excluded from the reconciliation matching -- they do not appear in the F4111 Total, do not appear in the RR Summary, and do not contribute to the displayed variance.

This means the **true variance is larger than what RapidReconciler is showing**. The actual unmatched cardex amount is the F4111 Total plus the Unassigned Total.

**Common causes:**

> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.

| Cause | How to Identify | Resolution |
|---|---|---|
| New GL class code added to items but not to model table | DMAAs shows "Missing model table entry" for the GL class; Integrity Report 3 also lists this class | Add the GL class code to DMAAI table 4152 in JD Edwards with the correct account. After the next refresh, unassigned rows move to F4111 Data. |
| GL class code changed on item without updating model table | Recent GL class code change visible in GL Class Integrity (Integrity Report 5) | Same resolution -- add the new GL class to the model table |
| \*OP outside operation items with specialist GL class | Item numbers contain \*OP suffix; GL class is specific to outside operations | Add the outside operations GL class to the model table pointing to the correct inventory account |

> **Important:** Fixing the model table entry will cause previously invisible cardex amounts to become visible in the reconciliation after the next refresh. The displayed variance will increase before it can be resolved. This is expected -- it represents the true state of the reconciliation, not a new problem.

### 5.2 GL-Only Entry (No Cardex)

**Symptoms:**
- F4111 Total = $0.00
- F0911 Total has a non-zero amount
- RR Summary shows CardexAmount = 0, LedgerAmount = non-zero

**Check the order line type FIRST.** The most common GL-only cause is a **non-stock / surcharge line** (line type `N`, `F`, and similar in the Header Comp / Orders section -- the "Non-stock line posted to inventory account" row below). A non-stock line routes a charge to an inventory GL class but writes **no cardex**, so a GL-only row for it is *expected behavior*, not a defect -- rule it out before investigating the manual-entry causes. It is often immaterial (a small surcharge on a shipped item); confirm the line type off the export's `LineTy` column and move on.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| Manual journal entry posted to inventory account | Doc type is JE or similar; no F43121 record exists | Investigate who posted the entry and why. Recode to correct account via reversing journal entry. |
| A/P payment (PD document) hitting inventory | Doc type PD; appears in F0911 inventory account; no F4111 record | Payment discount or currency adjustment coded to wrong account. Recode to discount/variance account. |
| Tax variance at voucher match | PV document; tax amount in comment differs between receipt and voucher rows | Tax rate or taxable amount changed between receipt and voucher match. Post manual journal entry for the difference. |
| Voucher posted without a receipt | PV document; no matching OV in F43121 | Receipt may have been reversed after voucher match. Investigate F43121 history. |
| **Non-stock line posted to inventory account** | F0911 Comment reads **"Non stock line in Inv acct"**; line type in Header Comp is N, F, or another non-inventory type; F4111 is empty | The line type definition is configured with a GL offset that routes to an inventory GL class. Review the line type definition for the applicable order type. Post a manual journal entry to move the GL amount from the inventory account to the correct expense or COGS account. If this pattern appears on multiple transactions, the line type configuration requires correction rather than transaction-by-transaction journal entries. |
| Sales return (RM) with IB batch type | Doc type is RM; batch type is IB rather than I; F4111 is empty | The return was processed via a manual correction batch (IB) that posted to the inventory account without writing a cardex record. Investigate who created the IB batch and whether it was intended as a correction. Post a journal entry to recode if the inventory account is incorrect. |

### 5.3 Cardex-Only Entry (No GL)

**Symptoms:**
- F4111 Total has a non-zero amount **and** F0911 Total = $0.00 (full cardex-only); **OR**
- F0911 Total is non-zero but smaller than the F4111 Total for the same GL class and batch, and one or more RR Summary rows show CardexAmount non-zero with LedgerAmount = $0.00 (partial cardex-only -- a single line item within an otherwise-posted batch has no GL counterpart)
- Appears in the GL Batches variance on the Reconciliation page

> **Important distinction:** The partial variant does not set off the obvious "F0911 Total = $0.00" alarm. The batch is fully posted and other lines reconcile cleanly. The only indicators are the RR Summary cardex-only row for a specific batch/account combination and a gap between the F4111 and F0911 totals for that GL class. Always compare totals at the GL class and batch level, not just at the document level.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| Unposted batch | PC field in F4111 is not "P"; batch visible in GL Batches variance | Post the batch in JD Edwards |
| Batch posted to wrong period or company | F4111 record exists but GL entry is in different period/company | Locate the GL entry; determine if a period or company mismatch exists |
| Partial batch GL failure -- single line missing from an otherwise-posted batch | PC = "P" on all F4111 rows; all other lines in the same batch and GL class have matching F0911 entries; one cardex line has no GL counterpart; the missing line often has a unit cost that is a significant outlier relative to other lines in the same transaction | First, query F0911 for the document and batch across **all** accounts (not just inventory) -- the GL entry may have posted to an unexpected account rather than being absent entirely. If no entry exists anywhere, post a manual journal entry for the specific line amount. Investigate whether the outlier unit cost caused the GL interface to reject or suppress the line. |

### 5.4 Account Mismatch (Both Cardex and GL Exist but in Different Accounts)

**Symptoms:**
- Multiple rows in RR Summary
- CardexAmount and LedgerAmount are on separate rows
- Variance equals the amount on each row

> **Analyzer output:** for account-mismatch docs the analyzer's headline is the **misposted amount** (the dollars that need to move via JE), not the document's net variance — the net is $0 because the cardex and GL amounts agree in absolute value. Priority bucketing (P1/P2/P3) is retired for this template; the dollar amount + pattern label carry the headline. The HOW card is built from "what should have posted" rather than from the F4111 model. It contains:
>
> 1. **Doc context** — names the inventory-side DMAAI for the doc type (IM → 3110, IA → 4124, SO/RI → 4240, IB → 4134, etc.).
> 2. **The corrective JE**, direction derived from the sign of the cardex amount. For credit-inventory doc types (IM, IA, II, SO/ST/SD shipment, etc.) the JE is `Dr posted_acct / Cr expected_acct`; for debit-inventory doc types (IC, OP, PV, RM) it's `Dr expected_acct / Cr posted_acct`. The direction is the result of subtracting the actual F0911 post from the JE that should have posted — it lands the dollars on the expected account and zeroes out the bad account.
> 3. **A T-account picture** rendered as real Excel cells with borders (account number above a thick horizontal bar; Dr and Cr columns split by a vertical bar). Three accounts are shown: the expected account (gets the entry that should have happened), the bad account (Dr and Cr offset each other → ending balance 0), and the counterpart leg of the original JE (untouched). The picture is the WHY-of-the-direction made visible.
> 4. **A one-line prevention pointer** — review the inventory-side DMAAI in JDE; restrict posting-time overrides if applicable.
>
> The investigation block (DMAAI change-history check, F0911 batch-type / source check) was dropped — analysts don't chase down the audit trail once the JE clears the variance. The two scenarios (DMAAI reconfigured vs override at post time) live in the WHY card now.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| DMAAI misconfiguration | DMAAs section shows "Mismatch" flag | Correct the AAI in JD Edwards. Post manual journal entry to move the GL amount to the correct account. |
| GL class code changed after receipt | Item has different GL class on the order line vs. current location | Manual journal entry to recode the GL amount to match the cardex account |
| Flex accounting producing unexpected account | BUFlex or SubFlex active in DMAAs section | Review flex accounting rules in P40296 for the item/customer/branch combination. See Section 6. |
| Processing option allows manual GL account entry | Doc type is II, IA, or IT; DMAAs shows no mismatch flag; F0911 account does not match any AAI in the DMAAs section | Check whether Allow Entry of GL Account (PO 1) or Allow Override of GL Account (PO 2) is enabled in the version used. If either is on, the operator manually entered an account that overrides the AAI. The AAI-assigned account is written to F4111; the operator-entered account is written to F0911. See Section 8 Quick Lookup for the specific program. |
| R42800 Business Unit Source mismatch | Doc type is RI/RR/RC; the business unit in F0911 does not match what the AAI would produce for the branch/plant | Check R42800 PO 5 (Business Unit Source) in the version that processed the order. This single option controls where the BU portion of the GL account is sourced from and is the most common cause of systematic sales account mismatches. |

### 5.5 Period Mismatch

**Symptoms:**
- Multiple rows in RR Summary with different Period values
- Amounts match but are in different fiscal periods

> **Analyzer output:** the analyzer now treats period mismatch as its own pattern (distinct from 5.4 Account Mismatch). The two share a shape ("multiple RR Summary rows") but lead to different fixes: account mismatch needs an account-to-account JE and an AAI correction; period mismatch needs a period-to-period JE and a GL Date processing-option correction. The analyzer routes account-mismatch first when both differ on the same doc, since the AAI fix is the more impactful root cause.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| Backdated GL entry | GLDate on F0911 row is in a prior period vs. F4111 TransDate | Manual journal entry to move the GL amount to the correct period |
| Sales Update or Manufacturing Accounting processed after period close | End of Day variance visible; batch number populated after the period | No correction needed if intentional; document for audit |
| GL Date processing option set to use invoice or promised date | F0911 GL date differs from F4111 TransDate by a consistent number of days matching an invoice or PO promised date; common on OV, PV, and RI doc types | Check the GL Date Source processing option in the program version: P4312 (PO receipts) PO 2, P4314 (voucher match) PO 2, R42800 (Sales Update) PO 1 (Defaults tab). If set to use the invoice or promised date rather than the system date, any transaction where that date falls in a different period than the item ledger date will produce a period mismatch. |
| Cycle count update batch ran in a different period than the count entry | Doc type is WK or WS; F4111 date and F0911 GL date are in different periods | Check the GL Date option in R41413/R41610. The count entry date and the update batch date spanned a period end. Post a manual journal entry to move the GL amount to the correct period. |

### 5.6 Tax Variance

**Symptoms:**
- Receipt rows in the Receipts section show "Taxes = [amount]" in Comment
- Tax amount at voucher match differs from tax amount at receipt
- Variance amount matches the tax difference

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| Tax rate changed between receipt and voucher match | Compare Taxes comment on OV receipt row vs. PV voucher row | Review tax explanation code and rate on the order. Post manual journal entry for the net difference. |
| Tax explanation code change | Tax code visible on order header; different from what was used at receipt | Investigate which code should apply; correct in JD Edwards if possible; journal entry if not |

### 5.7 Landed Cost Variance

**Symptoms:**
- Receipts section contains rows with "Landed Cost" in Comment
- Landed cost CardexAmount or LedgerAmount is zero or mismatched

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| Landed cost applied but not vouchered (PRLAND = 3) | No PV row for the landed cost in Receipts section | Accrual-only landed cost -- no voucher will be generated. Suspend in RapidReconciler if creating a false variance. |
| Landed cost reversed without re-application | Reversal visible in Receipts; no subsequent application | Re-apply landed cost or post manual journal entry |
| AAI 4385 misconfigured for the GL class code | Landed cost appears in F0911 Exp Acct at an unexpected account; DMAAs shows a mismatch on 4385 | Correct AAI 4385 to point to the correct inventory account for the item's GL class code. Post a manual journal entry to recode the existing entry. |
| Material Burden (AAI 4337) active simultaneously with Landed Cost at Receipt | P4312 PO 4 (Landed Cost at Receipt) and PO 5 (Material Burden) are both enabled; duplicate cost entries visible in F0911 | Do not enable landed cost at receipt when Material Burden is also active. Apply landed cost using the standalone landed cost program (P43214) instead. |
| AAI 4332 invoked because on-hand quantity < quantity being costed (P43214) | F0911 Exp Acct contains a 4332 entry with no F4111 counterpart | Confirm on-hand quantity at the time landed cost was applied. The 4332 entry is expected behavior when goods have been partially or fully sold. Confirm AAI 4332 is configured; if missing, the entry will post to an unexpected account. |

### 5.8 "No Cx" in Batch Field

**Symptoms:**
- A receipt row in the Receipts section shows "No Cx" in the Batch column
- This means the voucher match was processed but no cardex record was written

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| Voucher match processed against a previously reversed receipt | OV receipt was reversed (Match Type 3) before voucher match occurred | Investigate F43121 history; determine correct sequence of events; manual journal entry to clear |
| Line type does not interface with inventory | LineTy field shows non-stock line type | Expected behavior for non-stock lines; verify AAI configuration |

### 5.9 Standard Cost Change After Work Order Completion

**Symptoms (Variant A -- Standard Cost Change row):**
- Document type is **IC** (work order completion)
- F4111 has **two rows** for the same document number:
  - Row 1: Comment "Completed W.O.'s To Inventory" -- normal completion with quantity and unit cost
  - Row 2: Comment "Standard Cost Change" -- **zero quantity, zero unit cost**, with a dollar amount only
- F0911 GL has only **one entry** -- the original completion amount -- referencing a **different document number** than the cardex (Manufacturing Accounting summarizes completions into a GL document)
- RR Summary shows two rows: one GL-only (the completion matched to the GL doc) and one cardex-only (the net cardex amount with no GL match)
- The variance amount equals the Row 2 "Standard Cost Change" amount exactly

**What is happening:**

When a work order completion is processed, the cardex is written at the current standard cost. If the standard cost is subsequently updated via R30822 (Frozen Cost Update) **after** the completion has already posted, JD Edwards writes a second cardex row to revalue the completed inventory to the new standard. However, if WIP Revaluation (R30837) was not configured to run -- or was not called from R30822 -- the corresponding GL journal entry is never created, leaving the cardex revaluation with no GL counterpart.

The GL document number mismatch (e.g., cardex shows doc 545031 but GL shows 566580) is **normal behavior** for IC transactions -- Manufacturing Accounting (R31802A) summarizes multiple work order transactions into a single GL document. This is not the cause of the variance but can cause confusion when tracing the transaction.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| R30837 (WIP Revaluation) not run after standard cost update | F4111 Row 2 shows "Standard Cost Change" with no matching GL entry; variance amount matches Row 2 exactly | Post a manual journal entry: debit inventory account for the variance amount; credit the appropriate variance account (AAI 3260 Planned Variance or 3240 Material Variance). Review WIP Revaluation configuration to prevent recurrence. |
| R30837 run but work order was already at its Closed status | Work order NxtSts at the Closed value in UDC 00/SS (typically 90; values are customer-defined per shop's order activity rules); R30837 does not revalue closed work orders | Same journal entry resolution. Note: R30837 only revalues open work orders -- closed work orders require manual correction. |

> **Aged variance note:** This pattern frequently produces historic variances dating back months or years, since the cost change and the missing GL entry may not be detected until the next reconciliation review. Assess materiality before posting a journal entry for small or very old amounts.

---

**Variant B -- Second Completion Batch (no "Standard Cost Change" row):**

- Document type is **IC** (work order completion)
- F4111 has **two rows** for the same document number, **both** with comment "Completed W.O.'s To Inventory", **both** with non-zero quantity and non-zero unit cost at the same rate
- F0911 GL has only **one entry**, covering the quantity in Row 1 only
- RR Summary shows Row 2 as cardex-only with no GL match
- No "Standard Cost Change" comment appears anywhere in the report
- The variance equals Row 2's cardex amount exactly; total F4111 quantity exceeds what the GL entry implies

**What is happening:**

The work order was completed in two separate batches. Each batch produced its own F4111 cardex row. Manufacturing Accounting (R31802A) assigned the GL journal entry only to the first batch's document number. The second batch's GL entry posted under a different GL document number not visible in this report.

**How to distinguish from Variant A:**

| Signal | Variant A | Variant B |
|---|---|---|
| Row 2 comment | "Standard Cost Change" | "Completed W.O.'s To Inventory" (identical to Row 1) |
| Row 2 quantity | Zero | Non-zero |
| Row 2 unit cost | Zero | Same as Row 1 |
| Likely cause | R30837 not run after cost update | Second completion batch; GL doc mismatch |

**Investigation step (before posting a journal entry):**

Query F0911 for the work order number across **all** GL document numbers. The second batch's GL entry may exist but be attributed to a different GL document. If found, this is a document number mismatch (Section 5.4) rather than a missing entry, and no journal entry is required -- only documentation.

**Resolution if GL entry is truly absent:**

Post a manual journal entry: debit inventory account for the Row 2 cardex amount; credit the appropriate WIP or variance account (AAI 3260 Planned Variance or 3240 Material Variance). Same accounts as Variant A.

> **Aged variance note:** Applies equally to Variant B. Both patterns frequently produce historic variances. Assess materiality before posting.

---

### 5.10 IB Cost Change -- Net Zero GL Entries

**Symptoms:**
- Document type is **IB** with comment "Inventory Cost Change"
- F4111 has a single entry with a non-zero amount
- F0911 Inv Acct has **two entries that net to zero** -- one debit and one credit of the same amount, both to the same account
- F0911 Total = $0.00 despite individual entries existing
- RR Summary shows CardexAmount = non-zero, LedgerAmount = $0.00
- DMAAs section shows **"Net zero review - 4134, 4136"** in the Comment column

**What is happening:**

An IB cost change transaction in JD Edwards generates two journal entries -- a debit via AAI **4134** (Inv Cost Chg) to the inventory account, and a credit via AAI **4136** (Exp Cost Chg) to an expense or variance account. When both AAIs are configured to point to the **same object account**, the debit and credit cancel each other within the inventory account, producing a net GL impact of zero. The cardex still records the full amount, creating a variance.

This is distinct from a simple cardex-only entry -- both GL entries exist, but they are in the same account and net to zero. RapidReconciler flags this specifically in the DMAAs Comment column.

| Cause | How to Identify | Resolution |
|---|---|---|
| AAI 4134 and 4136 point to the same object account | DMAAs Comment shows "Net zero review - 4134, 4136"; F0911 shows equal debit and credit to same account; F0911 Total = $0 | (1) Correct AAI 4136 to point to a cost change expense or variance account. (2) Post a manual journal entry to create the missing expense account entry and relieve the inventory account for the current variance amount. (3) Review other IB transactions in the same company and GL class for the same issue. |

---

### 5.11 GL-Excess Entry (GL Total Exceeds Cardex for a Specific Account and Batch)

**Symptoms:**
- RR Summary net variance is positive
- Both F4111 Total and F0911 Total are non-zero
- For one specific GL class and batch combination, the F0911 GL amount is larger in absolute value than the corresponding F4111 cardex amount
- All other GL class / batch combinations in the document reconcile cleanly
- The excess GL amount for the affected batch equals the document-level variance exactly

> **Important distinction:** This pattern does not trigger the obvious GL-only alarm (CardexAmount = $0.00). Both sides have values. The only indicator is the per-batch comparison: one batch and account shows more GL than cardex, while everything else matches. Always compare F0911 and F4111 totals at the GL class and batch level individually before concluding the investigation.

**How to isolate the excess:**

Compare F0911 and F4111 totals by GL class and batch combination. For each combination, the amounts should be equal. The combination where F0911 exceeds F4111 in absolute value is the source. Confirm that the excess equals the document-level variance.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| GL entry is a summarized manufacturing posting spanning multiple work orders | Doc type is IC, IM, or IH; F0911 GL document number covers multiple order numbers when queried across all subledgers (see Section 4, Manufacturing Accounting GL Summarization) | Query F0911 for the GL document number across all order numbers. If multiple work orders are covered, the excess belongs to other orders and this document has no standalone variance. Suspend in RapidReconciler with a note explaining the GL summarization. See Section 5.12 for the IM-specific investigation procedure. |
| Manual journal entry miscoded to inventory account referencing this document | Batch type JE or IH in F0911; GL entry amount does not correspond to any cardex row | Query F0911 for the period and account for batch type JE or IH entries. If found, post a reversing entry: debit the inventory account for the excess amount; credit the correct variance or expense account. |
| Cardex row exists in JD Edwards but was excluded from this report | Report may have been generated with filters applied or for a subset of periods | Regenerate the Transaction Detail report without filters. If additional F4111 rows appear that close the gap, no journal entry is needed. |

**Investigation steps before posting any correcting entry:**

1. **Query F0911** for the GL document number shown in the excess row across all order numbers and document numbers. If the entry covers multiple work orders, the excess is a GL summarization issue, not an error.
2. **Query F4111** for the affected batch and GL class across all document numbers. Confirm whether additional cardex rows exist outside this report that account for the excess.
3. **Check for manual journal entries.** If Steps 1 and 2 confirm the GL entry legitimately belongs only to this document, query F0911 for batch type JE or IH entries against the same account for the same period.

Do not post a correcting entry until all three steps are complete.

---

### 5.12 IM GL-Excess -- R31802A Cross-Work-Order Summarization

This section describes a specific and common variant of the GL-excess pattern (Section 5.11) that applies exclusively to IM (material issue) transactions processed by R31802A. It is distinguished from a general GL-excess by its signature: a GL excess on exactly one GL class, with all other GL classes on the same document reconciling cleanly, and with the excess occurring on a GL class that has only a small number of component rows in F4111.

**Symptoms:**
- Document type is **IM**
- RR Summary net variance is positive (GL exceeds cardex)
- For one specific GL class and batch combination, the F0911 GL amount is significantly larger than the corresponding F4111 cardex total for that GL class
- All other GL class / batch combinations on the same document reconcile to zero
- The F4111 rows for the affected GL class represent only a small number of component items
- The DMAAs section shows no Comment flags -- DMAAI configuration is clean
- A secondary finding may also be present: a small cardex-excess on a different GL class in the same batch, where a single component item's cardex amount does not appear in the F0911 total for that GL class

**What is happening:**

R31802A processes all material issues in its run and creates GL summary entries by GL account, not by individual work order or cardex document. When multiple work orders are processed in the same R31802A run, the GL entry for a given account and batch reflects the combined cost of components from all of those work orders -- not just the one shown in the current Transaction Detail report. RapidReconciler matches on batch number, which means it attributes the full GL summary amount to whichever work order it encounters first, producing a GL-excess on that document. The corresponding RapidReconciler records for the other work orders in the same batch will show a cardex-only pattern, since the GL amount has already been attributed elsewhere.

**Critical diagnostic signal:** If all GL class / batch combinations reconcile cleanly except for one GL class and the excess on that GL class matches the document-level variance exactly, this is almost certainly a GL summarization issue rather than a posting error. The excess does not belong to this work order.

**Secondary signal:** A small cardex-excess on a different GL class in the same batch (e.g., a BUYP component totaling -$141.57 in F4111 with only -$119.17 in F0911) may indicate that one component's cost was captured in the GL summary for the excess GL class rather than its own GL class -- typically because a component's GL class code in F41021 differs from what was expected.

**Investigation procedure:**

1. Note the GL document number from the F0911 Inv Acct section for the affected batch and GL class.
2. Query F0911 in JD Edwards for that GL document number with no order number filter. If it references multiple work orders, the excess is attributable to other work orders and this document has no standalone variance.
3. Sum the F4111 cardex amounts for all work orders appearing in Step 2 for the affected GL class. The sum should equal the F0911 GL total. If it does, no correcting entry is needed.
4. If a secondary cardex-excess is also present on a different GL class: query F4111 for the specific component item(s) contributing to the excess across all document numbers in the same batch. Check whether the GL class code in F41021 matches the expected GL class for that item -- a mismatch would explain why the item's cost was captured in the wrong GL account.

**Resolution:**

If Step 2 confirms other work orders are included in the GL entry, suspend this record in RapidReconciler with a note identifying the GL document number and confirming the cross-work-order summarization. No journal entry is required. The corresponding cardex-only records on the other affected work orders will resolve when their own Transaction Detail reports are reviewed and documented.

If Step 2 finds the GL entry belongs only to this work order and the excess cannot be attributed to other work orders, escalate to Section 5.11 and follow the standard GL-excess investigation procedure.

**Processing options to review if the pattern is unexpected:**

| Program | Option | What to Check |
|---|---|---|
| R31802A — PO 1 | GL Date Source | Whether the GL date is set to the work order date or the system run date. If set to the run date, all work orders processed on the same day share the same GL date and batch, increasing the likelihood of cross-work-order summarization. |
| R31802A — PO 3 | Cost Method | Whether the cost method matches R31410 (Work Order Processing). A mismatch produces per-unit value differences between F4111 and the GL summary, which can look like a cross-work-order issue but is actually a valuation discrepancy. |
| R31802A — PO 2 | Proof or Final Mode | Whether R31802A was run in final mode more than once for any work order in the batch. A double run creates a doubled GL entry with only one set of F4111 records, producing a permanent GL excess that cannot be resolved by simply querying other work orders. |
| F41021 vs. F4102 | GL Class Code | Whether the GL class code in the Item Location table (F41021) matches the Item Branch table (F4102) for each component. Manufacturing journal entries use F41021. A mismatch causes a component's cost to post to an unexpected GL class account, producing both a GL excess on the unexpected account and a cardex excess on the expected one. |

> **These are suggestions only.** Multiple R31802A versions may be in use, and multiple configurations can produce similar symptoms. Confirm version settings in JD Edwards before drawing conclusions about the cause.

---

### 5.13 Post-Ship-Confirm Order Edit (Sales Order)

**Symptoms:**
- Document type is sales-related (RI, SI, ST shipment) on an SO / ST / SD / RM / CR / CO order
- Order line(s) in the Orders section show **NxtSts ≥ 540** (ship-confirm or later)
- F4111 cardex total is materially less than F0911 inventory total (cardex short)
- F0911 inventory total **matches** the order math (`Σ qty × unit cost` across stock lines) within rounding
- The document variance equals `(order qty − cardex qty) × unit cost`
- Often only **one F4111 row per item** despite the order line showing a higher current qty
- DMAAs section is **clean** -- no configuration flags

**What is happening:**

Not every Transaction Detail discrepancy is a DMAAI configuration problem. Some are process / access-control violations.

When a sales order is **ship-confirmed**, JD Edwards writes the F4111 cardex records immediately from the warehouse's pick and sets the **Inventory In Hand flag** (`F4211.IVI = 1`) on the affected lines. The cardex is now locked: it represents what physically left the warehouse.

The GL postings, however, don't happen until **R42800 (Sales Update)** runs later -- often hours or a day later. R42800 reads the **current** F4211 line qty at the moment it runs and computes the GL postings from `qty × unit cost`.

If someone edits the order line in P4210 / P42101 (Sales Order Entry) **between ship-confirm and R42800**, the cardex is unchanged (already locked) but R42800 uses the new qty. The GL therefore reflects more units than actually shipped. The cardex-to-GL variance equals the qty delta times the unit cost.

This is supposed to be impossible:
- **Order Activity Rules** should treat the post-confirm status as terminal-editable for the order type
- The **Inventory In Hand flag** should block P4210 / P42101 line edits at the row level
- **Role permissions** should restrict P4210 / P42101 edit access for users who don't legitimately need post-confirm corrections

When all three controls are correctly in place, a user simply cannot perform the edit that causes this variance. When the variance is observed, one of the three controls is misconfigured or has been bypassed.

| Cause | How to Identify | Resolution |
|---|---|---|
| User edited a sales-order line between ship-confirm and Sales Update | NxtSts ≥ 540 on the Orders line; F4111 qty is smaller than the current order qty; cardex × order-qty math equals the GL total; variance = (order qty − cardex qty) × unit cost | (1) Confirm what physically shipped (warehouse pick ticket). (2) If cardex is correct: post a JE reversing the GL excess — Dr inventory, Cr COGS for the variance amount. (3) If GL is correct: write the missing F4111 rows via a JDE-side cardex repost; do NOT post a JE in that case. (4) Fix Order Activity Rules so the post-confirm status is terminal-editable, confirm `F4211.IVI` is being set at ship-confirm, and restrict P4210 / P42101 edit access for users who don't need it. (5) Sweep F4211 for other lines with last-modified timestamp > ship-confirm timestamp to find sibling cases. |

**Critical distinction from Section 5.11 (GL-Excess):**

Section 5.11's GL-excess is typically a manufacturing GL summarization (R31802A) or a miscoded JE on an inventory account. The fingerprint there is "GL exceeds cardex for a specific GL-class + batch combination."

Section 5.13's variance has the same shape (`GL > cardex`) but a different cause -- the Orders section will show stock lines past ship-confirm whose qty equals the GL-implied qty, not the F4111-recorded qty. If the Orders section is present and the order qty matches the GL math, **5.13 is the diagnosis, not 5.11**. The corrective action is a process / access-control fix, not a cost-method or AAI fix.

**Prevention checklist (for the customer to action with their JDE Distribution team):**

| Control | Where it lives | What it does |
|---|---|---|
| **Order Activity Rules** | P40204 (Order Activity Rules) | Defines which statuses allow which transactions. Set the post-ship-confirm status (typically 540 → 560) as the terminal editable status for the affected doc type. |
| **Inventory In Hand flag** | `F4211.IVI` (set automatically at ship-confirm if Activity Rules are correct) | When set to 1, P4210 / P42101 refuse line edits at the row level — second line of defense if Activity Rules permit edits. |
| **Role permissions** | Security Workbench (P00950) on P4210 / P42101 | Remove edit access for users whose role doesn't legitimately require post-confirm corrections. For the few roles that do, route edits through an approval workflow (manager sign-off). |

If a correction is genuinely needed after ship-confirm, the supported path in JDE is: invoice first (which lifts the Inventory In Hand lock), create a credit order to reverse, then re-enter the corrected order. Direct line edits should be the exception, not the routine.

**Customer-facing reference:** `RRUniversity/inventory-line-types.html` carries the full LineTy reference (S / N / J / F / T / M / W / B / D / O / R), notes which line types write F4111 at ship-confirm, and frames this pattern in customer-readable terms.

---

### 5.14 R31802A Orphan Cardex Row (Manufacturing)

> Numbered 5.14 in the analyzer guide; the analyzer's internal pattern ID is 5.15 (5.14 is reserved in code for Period Mismatch). The two numbers don't have to align — the analyst sees the pattern label, not the ID.

**Symptoms:**
- Document type is **manufacturing** (IC, IM, IH, or IS)
- F4111 cardex has multiple rows on the same inventory account; one row's cardex amount equals the document's net variance
- That F4111 row has no matching F0911 entry on the same account / amount
- Other F4111 rows on the same account reconcile to F0911 cleanly
- DMAAs section is **clean** -- no Mismatch / Net Zero flags

**What is happening:**

R31802A (Manufacturing Accounting) is what turns F4111 inventory movements into F0911 journal entries for manufacturing docs. For most of this document's rows, R31802A did its job: the F4111 row and its F0911 counterpart line up. One row got skipped, so the F0911 side of that row is missing -- the row is an "orphan."

R31802A has a small number of legitimate reasons to skip a single F4111 row:

| Cause | How to identify | Resolution |
|---|---|---|
| Partial / interrupted R31802A run | Run log shows non-zero exit code, rows-processed count below rows-selected, or "killed" status; an identical-data twin row on the same doc posted normally (selection / errors would have skipped both) | Re-run R31802A for the affected batch; AAI routing drives the correct posting and leaves no manual JE in the GL |
| "Already processed" flag set on the F4111 row | F4111 row's status flag indicates already-posted, but no corresponding F0911 row exists | Confirm whether a prior failed run set the flag manually; clear it if appropriate and re-run R31802A |
| Processing error during R31802A (no twin) | R31802A run report's Errors section names the item; classic killer is "Cost components missing for item X" (no rollup → no variance → no F0911) | Fix the item-master issue (cost components in P30026, AAI configuration, target-account status) and re-run R31802A |
| Version / selection PO filtered the row out (no twin) | R31802A version's processing options have a selection criterion (cost type, GL class, sub-ledger) that excludes the row | Either re-run with a less restrictive version, or confirm the exclusion is intentional |

**Critical caveat:**

RapidReconciler **does not** filter F0911 inventory accounts (it filters P&L). So absence of a matching F0911 row in this report is a strong signal the row really is missing from JDE F0911 -- not just hidden by RR's import. The analyzer's HOW card still suggests querying JDE F0911 directly across all accounts as a sanity check, because a misrouted GL entry on a *different* account would appear in JDE but not flag in this pattern.

**Critical distinction from Section 5.9 (Standard Cost Change After WO Completion):**

Section 5.9 is the narrow case where R30837 / R30822 sequencing produces an orphan F4111 cost-revaluation row. The analyzer detects 5.9 specifically when the orphan F4111 row's comment includes "Standard Cost Change" -- that's a different root cause (R30822 fired before R30837 was ready, or the WO is closed and R30837 won't revalue it).

5.14 is the broader bucket: any orphan F4111 row on a manufacturing doc whose amount equals the document variance, regardless of comment. The two patterns share evidence shape but lead to different fixes.

**Analyzer signal: identical-data twin row**

When the orphan row has a *twin* on the same doc -- same item, same account, same unit cost -- two of the four causes drop out:

- Selection / version filtering can't be the cause (selection is field-based; identical rows pass or fail together).
- Processing errors can't be the cause (item-master / AAI lookups resolve uniformly across rows for the same item).

That narrows the diagnosis to partial-run OR a stale "already-processed" flag -- and on a same-batch twin, partial-run is overwhelmingly likely.

---

### 5.15 Voucher Variance on Inventory (PV under standard cost)

> Numbered 5.15 in this guide; the analyzer's internal pattern ID is **5.17**.

**Symptoms:**
- Document type is **PV** (P4314 Voucher Match)
- F4111 cardex is empty (no cardex rows for this doc)
- F0911 has entries on an inventory-side account (RR pulled them into `f0911Inv`)
- DMAAs section may show "Override" or unusual routing for AAI 4330

**What is happening:**

A PV (voucher match) document writes its variance through AAI **4330 (Purchase Price Variance)**. The destination depends on the customer's costing method:

| Cost method | AAI 4330 routes to | F4111 cardex behavior |
|---|---|---|
| Standard cost | Expense / variance account (P&L) | Empty -- voucher does not write to F4111 |
| Weighted average | Inventory account | F4111 captures a revaluation row |

The full receipt-voucher cycle:

```
Receipt (OV, P4312)        Voucher (PV, P4314)            Voucher with variance
---------------------      -----------------------        ---------------------------
Dr  Inventory (4310)       Dr  RNV (4320)                 Dr  RNV (4320)
Cr  RNV (4320)             Cr  A/P (PC AAI)               Dr  Variance (4330)  -- or Cr
                                                          Cr  A/P
```

When a PV doc shows up with **`F4111 empty + F0911 on inventory`**, that's wrong for either cost method:

- **Standard cost** -- 4330 should route to expense, so the variance landing on inventory means 4330 was overridden at posting time (manual JE on the inventory account, or a posting-program override flag), OR 4330 was reconfigured / wasn't set correctly for this routing.
- **Weighted average** -- 4330 routes to inventory by design and F4111 should have a cardex revaluation row, but the cardex side is missing. P4314 didn't trigger the F4111 write -- either a partial run, a configuration issue suppressing the F4111 update, or the item is mis-flagged non-stock for this branch.

**Diagnostic key:** what AAI 4330 resolves to for this customer's company / GL class settles it.

> **Analyzer output:** Pattern 5.17 in the analyzer pulls AAI 4330's resolved account from the loaded F4095 (DMAAIs preload) and chooses the right hypothesis directly. The WHY card names the cost method ("Customer is on standard cost -- AAI 4330 resolves to {acct} (an expense account)") and the HOW card pre-fills the corrective JE with the actual variance amount and accounts. When F4095 isn't loaded, the analyzer presents both hypotheses and tells the analyst to confirm 4330 in JDE before posting anything.

**Common causes and resolution:**

| Cause | How to identify | Resolution |
|---|---|---|
| Std-cost: DMAAI 4330 overridden at posting time | F0911 batch source/comment shows manual JE batch type (JE / IH) or override flag | Post Dr expense (the account 4330 should resolve to) / Cr inventory for the variance amount. Restrict override permissions or route manual inventory JEs through an approval step to prevent recurrence. |
| Std-cost: DMAAI 4330 was reconfigured after this doc posted | Audit / change history on DMAAI 4330 shows a modification date after this doc's batch posted | Same JE as above. Then sweep other PV docs that posted under the prior config -- they'll need the same correction. |
| Weighted-avg: P4314 didn't write F4111 | F4095 confirms 4330 routes to inventory; F4111 has no row for this doc | Confirm P4314 ran to completion (no partial-run / job-step failure on this batch). Post a manual cardex revaluation for the variance amount; coordinate with cost-accounting so the entry updates the item's average cost, not just sits on the cardex. |

**Caveat:** the analyzer's data view of F0911 is filtered to inventory-relevant accounts (per RR's mirror filter). When confirming in JDE, query F0911 for the full batch without that filter -- the RNV (4320) and A/P legs are filtered out of RR's view but are part of the same voucher posting.

### 5.16 Manufacturing Cost Mismatch (cardex unit cost vs GL unit cost)

> Numbered 5.16 in this guide; the analyzer's internal pattern ID is also **5.16**.

**Symptoms:**
- Document type is a **manufacturing completion** -- **IC** (completion), **IH**, or **IS** (scrap)
- Both F4111 cardex and F0911 GL have meaningful (non-zero) entries, so this is not a GL-only (5.2) or cardex-only (5.3) case
- The **implied per-unit cost differs sharply between the two sides** -- the analyzer flags it at a **5x or greater** ratio. (F4111 carries qty + unit cost per row; F0911 carries no quantity, so the GL-implied unit cost is the F0911 inventory total divided by the F4111 quantity total.)
- All rows sit on the same WIP/FG account and period -- which is why Account Mismatch (5.4) and Period Mismatch (5.14) do not catch it

**What is happening:**

The completion was recorded at **two different unit-cost bases**: the cardex (F4111) captured one cost, the GL (F0911) posted another, and the variance is the gap multiplied by the quantity. On a standard-cost item (cost method 07), one side used the frozen standard from F30026 and the other used the work-order actual. On manufacturing-last (09) or another actual method, the cardex captured the pre-completion basis while the GL captured the completion-time actual.

The usual root cause is **R30822 (Frozen Cost Update) changing the standard after the completion posted, with R30837 (WIP Revaluation) failing to bridge cardex to GL.** R30837 does not bridge when the variance AAI (**3240 Material / 3260 Planned**) is not configured for the routing, its processing options suppress the GL write, or the work order has reached its **Closed status in UDC 00/SS** (typically 90 -- R30837 skips closed WOs).

**Common causes and resolution:**

> ⚠ **Before posting:** confirm with cost-accounting which side is the intended cost basis (frozen standard vs work-order actual). The corrective JE direction depends on that decision.

| Cause | How to identify | Resolution |
|---|---|---|
| Standard cost changed after completion; R30837 did not revalue | Cost method 07; F30026 frozen standard changed after the completion's GL date; the higher cost is on the GL side | Post a corrective JE moving the excess between the WIP/FG account and the manufacturing variance AAI (3240 / 3260) -- credit inventory / debit variance when GL is over-stated, or the reverse when GL is under-stated. Then fix R30837 so it is called from R30822. |
| WO at Closed status -- R30837 skips it | The work order's status in UDC 00/SS is the closed value (e.g. 90); R30837 logs no revaluation for it | Same corrective JE. Re-open the WO only if policy allows a revaluation; otherwise the JE is the permanent correction. |
| Actual-cost (09 / other) timing window | Cost method is 09 or another actual method; cardex and GL picked up costs at different moments | Same corrective JE to the variance AAI; confirm the completion's cost source with cost-accounting. |

**Prevention:** ensure R30837 (WIP Revaluation) is invoked from R30822 (Frozen Cost Update) so cardex and GL stay aligned through standard-cost changes -- otherwise this mismatch recurs on every future cost change.

> **Analyzer output:** the analyzer computes the implied per-unit cost on each side, reports the ratio, names the dominant cost method from the F4111 Ext code, and pre-builds the corrective JE-flow matrix (Inventory vs AAI 3240/3260) with the variance direction filled in. It fires after the narrower 5.6 (Standard Cost Change comment) and 5.15 (orphan-row) detectors, and before 5.4 / 5.14.

### 5.17 Duplicate Shipment -- Same Order Line Relieved Twice

> Numbered 5.17 in this guide; the analyzer's internal pattern ID is **5.18**.

> **First-order check.** Screen for this pattern before reaching for a cost, mapping, or timing explanation -- it is rare but cheap to confirm and definitive when it fires. `dbo.RDuplicateSales` flags the affected order lines directly (keyed on OrderNumber + OrderType + LineID + item / branch / location / lot; `Records` is the repeat count, `Amount` is the duplicate value), so you do not have to eyeball the cardex to find it. On the Transactions page the flag arrives as the Comment "check duplicate sales integrity" and lands the row on the Duplicate Sales card. When a document is flagged, the variance equals the duplicate relief and the fix is at the source -- do not chase an in-transit or account explanation for it.

**Symptoms:**
- A **sales (SO / RI ship)** or **transfer (OT)** document
- **Two or more F4111 cardex rows relieve the same order number + line number** -- the same line shipped more than once
- F0911 booked the shipment **once**; the cardex total exceeds the GL total
- The variance equals the value of the duplicate relief(s)

**What is happening:**

JDE never re-uses a line number for a partial shipment -- a genuine partial increments the line (e.g. 6.001, 6.100). So **a repeated line number on the cardex is a double relief, not a normal split.** The line was ship-confirmed more than once, relieving inventory each time. R42800 (Sales Update) posts GL from the **first occurrence** of the line, so the duplicate cardex relief hit inventory with **no matching GL entry** -- leaving inventory short by its value.

**Resolution:**

> ⚠ **Confirm the billing first:** one invoice (F4211 / RI) against a duplicate cardex relief is an inventory-only correction; a duplicate *invoice* is a separate A/R correction.

1. **Verify in JDE** -- pull the F4111 (Item Ledger) for the order + line and confirm two ship-confirm records for the same quantity. Matching line numbers (rather than .001 / .100) confirm the double relief.
2. **Confirm billing** -- check F4211 / RI for a single invoiced line.
3. **Post an inventory adjustment (IA)** -- return the double-shipped item to its branch / location, putting back the value the second relief removed without a sale. This realigns the cardex to the GL.
4. **Refresh RapidReconciler and re-analyze** -- the variance clears once the IA posts.

**Prevention:** review the ship-confirm / RF workflow that allowed a closed line (NxtSts 999) to be confirmed a second time.

> **Analyzer output:** the analyzer groups F4111 rows by (order, line); a group of 2 or more is the duplicate. It reports the per-relief amount and the group total and pre-fills the IA corrective steps. It outranks Mixed Line Types (5.7) when both could match the same doc.

---

### 5.18 Transfer Breaks on IT Documents -- Two Faults Behind One Gate

> Numbered 5.18 in this guide. The analyzer's internal pattern ID for the priced-at-zero half is **5.19**; the missing-leg half has no analyzer pattern of its own yet.

> **`LedgerAmount = 0` on these documents does not mean the GL is missing.** It means the GL legs **netted to zero**, which is what a value-neutral location move should do. Every document behind both cards has an F0911 entry, verified on all 101 documents across the two companies in the specimen dataset. Read a cardex-only IT as an item-ledger break, not as a batch waiting to post, and never write it up as "relieved value with no GL entry."

**The population splits on item-ledger leg count, and on the specimen the split was absolute.** `usp8_txv_flags` works the same gate (DT `IT`, `LedgerAmount = 0`, `CardexAmount <> 0`, after netting) in two passes:

| F4111 rows on the document | Claim | Card | The fault |
|---|---|---|---|
| Exactly one | section C1, runs first | `Transfer Leg Missing` | The counterpart leg was never written. Quantity and value both moved one way |
| Two or more | section C2 | `Transfer Integrity` | Both legs are present; the receipt leg carried a unit cost it never extended |

JDE writes a transfer as a **line-ID pair**: `.000` for the relief, `.500` for the receipt. A document holding one F4111 row is missing half the pair, and that is a different problem from a pair that priced badly.

**Company A and company B below** are the two companies in the specimen dataset used throughout this section, re-measured 2026-08-10. Company A loaded 16 periods and carries both faults; company B loaded 12 periods and carries only the priced-at-zero one. On company A the split ran 21 single-leg documents against 11 with two or more, no overlap, and the single-leg group held 87% of that company's transfer-break dollars. Every figure attributed to a company is that dataset's and not a property of the pattern.

---

#### 5.18a Transfer Leg Missing (`TLM`) -- one item-ledger leg, both legs in the GL

**Symptoms:**
- An inventory transfer (DT `IT`) with exactly **one** F4111 row
- The GL carries **both** legs of the pair, same account, posted, summing to zero
- The extended cost on the row that is present calculated correctly

**What is happening:**

Half the pair never reached the item ledger. Because a transfer moves quantity as well as value, the receiving location is short units and short dollars, which is what separates this from the priced-at-zero shape below. The GL knowing about the leg that the cardex does not have is the useful fact: the transfer completed in JDE, and the item-ledger write is what went missing after it.

**The cause is open, and this guide is not going to close it from RR data.** Two candidates:

1. **JDE never wrote the row.** A one-sided item-ledger write by the transfer program.
2. **The row was dropped on the way in.** `F4111`'s primary key is `ilukid` alone, so a colliding key is lost on a dedupe-on-insert load with no error raised.

Neither can be ruled out from the RapidReconciler database, and the specimen data cuts both ways. The GL knew about the missing line ID, which argues for the load. But the 20 failures on company A clustered on **one item, one lot, one location and one day with consecutive document numbers**, which is not the shape of a random load drop. Do not write either cause into a finding.

**The test that settles it** runs against source JDE, not against RR:

```sql
-- source JDE, not the RapidReconciler database
select ildoc, illnid, ilitm, illocn, iltrqt, iluncs, ilpaid, ilukid
from   f4111
where  ildct = 'IT'
and    ildoc between <first doc on the card> and <last doc on the card>
order  by ildoc, illnid;
```

- Both `.000` and `.500` present in JDE, only one in RR: **a load fault.** Hand the document numbers over.
- Only one line ID in JDE too: **a one-sided item-ledger write.** Take it to Oracle through the customer's IT department, with the F0911 legs attached as evidence that the transfer itself posted.

**Resolution:**

1. **Run the source query above.** Nothing in RapidReconciler answers the question and no amount of further reading of the card will.
2. **Read item, location, lot and date across the documents on the card** before escalating. A cluster on one combination and one day frames the escalation differently from failures scattered across the file.
3. **Correcting the inventory balance is a quantity-and-value adjustment**, booked by the accountant.
4. **Refresh RapidReconciler and re-analyze** once the source position is settled.

**Prevention** depends on which branch the source query lands in, so there is nothing to prescribe before it is run.

**Specimen evidence, company A only, measured 2026-08-10. Do not quote these as rates:**

| Test | Result |
|---|---|
| Card documents with exactly one F4111 row | **21 of 21.** The other 11 documents on the same gate all had two or more |
| Unpaired `.000` / `.500` line pairs across every IT document on company A | **23 of 795,558 line pairs, spread over 276,614 documents.** 21 of the 23 are these documents; the other 2 are zero-value and excluded by the classifier's `CardexAmount <> 0` gate. The population closes with nothing left over |
| Same measurement on company B | **Zero unpaired legs across 41,824 line pairs on 37,136 documents.** The two conditions never co-occurred in one company |
| Which leg survived | **20 relief, 1 receipt.** Either direction occurs, so leg direction is not a screen |
| GL for these documents | **Present on all 21.** Both legs, same account, posted, netting to zero |
| Periods affected | **2 of 16 loaded.** One document in 2022-04, then 20 in 2022-08 |
| Concentration | The 20 documents in the burst share **one item, one lot, one location and one G/L date**, with consecutive document numbers |
| Share of company A's transfer-break dollars | **87%** ($19,978.60 of $23,010.75) |

---

#### 5.18b Transfer Integrity (`TXI`) -- the receipt leg was priced and never extended

**Symptoms:**
- An inventory transfer (DT `IT`) with **both** item-ledger legs present
- The **receipt** leg carries a unit cost with a **zero extended cost**, so the item-ledger amount never calculated
- The GL legs net to zero, so `LedgerAmount = 0`

**What is happening:**

A location transfer should be value-neutral: the out leg relieves the location and the in leg receives it at the same cost, so the two net to zero with no GL impact. Here the receipt leg priced the quantity but never extended it to a dollar amount, so the move relieved inventory value that never came back.

**The discriminator is narrower than it looks, and earlier readings of it were wrong.** Corrected against the data on 2026-08-03 and again on 2026-08-10; the queries are in the evidence table below.

- **It is the receiving leg.** An earlier note in this section said otherwise, based on zero-extended legs splitting evenly between the relief and receipt sides. That measured every zero-extended leg in the company, and the vast majority of those are harmless. Measured on the legs that actually **cause** the card, the failing leg is the receipt leg in every case: 69 of 69 on company B, 15 of 15 on company A.
- **A zero extended cost is ordinary.** It sits on 488,606 of company A's 1,591,177 IT item-ledger rows and is harmless on almost all of them. Only the slice that **also carries a unit cost** produces this card, and that slice is 646 rows.
- **Cost level is not a property of the pattern.** Company B's failures are cost level 3 throughout; company A mixes levels 2 and 3.
- **A missing leg is a different card.** Documents holding one F4111 row are claimed by `Transfer Leg Missing` before this pass runs, so everything here has both legs.
- **No vendor article has been cited for it.** Do not call it a named JDE or Oracle defect. The shape is real and confirmed in the data; the vendor attribution was never sourced.

**It is episodic, not a standing setup fault.** In the specimen data the failures cluster into bursts separated by clean stretches while transfer volume runs steadily throughout. Company B failed in its first two loaded periods, ran six consecutive clean ones, then failed in three consecutive periods at rising severity, then ran clean again at normal volume. Count the failures per period before deciding whether the setup is still broken.

**Specimen evidence, measured 2026-08-10. Every figure below belongs to the company named beside it and to one loaded window. None of them is a property of the pattern:**

| Test | Result | Dataset |
|---|---|---|
| Which leg carries the unit cost it never extended | **69 of 69** and **15 of 15**. The receipt leg, always | both companies, card documents only |
| Zero-extended IT legs by direction, measured across the whole file | Near-even: 244,311 receipt against 244,295 relief on company A; 1,038 against 964 on company B. **This measures harmless legs and does not describe the card** | both |
| Zero-extended legs that also carry a unit cost | 646 of 488,606 on company A; 152 of 2,002 on company B | both |
| Cost level of the card documents | Level 3 throughout on company B; a mix of levels 2 and 3 on company A | both |
| Periods affected | 5 of 12 loaded on company B; 3 of 16 on company A | both |
| Failure rate per transfer | 1.7% in the worst single month: 32 documents against 1,837 IT documents posted that month | **company B, period 2023-02** |
| Value concentration | 69 documents carried $246,785.97, with $153,348.06 in 2023-02 and $76,496.34 in 2023-03 | **company B** |
| GL present on the card documents | Yes, on all 80 across both companies. Both legs, same account, netting to zero | both |
| Both item-ledger legs present | Yes, by construction. Single-leg documents go to `Transfer Leg Missing` | both |

Repeat these on a customer database before generalizing.

**Resolution:**

> **This is a source fix.** Correct the cost setup in JDE; the accountant books the entry that restores the value. A journal entry on its own leaves the cardex short and the break returns on the next transfer.

1. **Confirm the signature** -- pull the F4111 legs for the IT document and check that the **receipt** leg carries a unit cost with a zero extended cost. Do not screen on cost level; it does not separate these documents from healthy transfers.
2. **Confirm the GL** -- read F0911 for the document and expect to find both legs on the same account, netting to zero. That is the normal picture here, and finding it rules out the unposted-batch reading. You do not need to run anything to find the rest of the population: the classifier stamps every priced-at-zero transfer receipt `Transfer Integrity`, so the card already holds them all.
3. **Count the failures per period, either side of the one you are working** -- this is the step that tells you which problem you have. A burst that starts and stops, with clean periods afterwards at normal transfer volume, is a cost change or a specific set of items. Failures in every period are a setup that is still wrong.
4. **Compare the cost setup of the failing items against items that transferred cleanly in the same period** -- that difference is the lead, and it is a narrower question than auditing the cost setup as a whole.
5. **Restoring the value is a dollars-only inventory adjustment (IA)** so the cardex ties back to the GL.
6. **Refresh RapidReconciler and re-analyze** once the source correction and the IA post.

**Prevention:** the target depends on step 3. Where the failures cluster into a burst, find what changed in that window (a cost roll, a new item set, a conversion) rather than treating the whole cost setup as broken. Where they run every period, the cost setup for the affected items is not extending a cost and that is the fix. Either way, re-check the next period: new IT documents whose receipt leg carries a unit cost with no extended cost mean the condition is still live.

> ⚠ **Do not prescribe R41543 / R41544 for this pattern.** The pairing was a guess and the owner refuted it 2026-08-03, the same ruling that pulled the programs off Completion Not Journaled (§5.19). The remedy is the item cost setup plus the dollars-only IA. And there is no population-finding step to replace: the classifier's `Transfer Integrity` claim already is the population of priced-at-zero transfer receipts.

> **Analyzer output:** the analyzer fires this ahead of the generic Cardex-Only diagnosis (5.3) for any IT document that relieved the cardex with a zero GL total, so the item-ledger story wins over "go post the batch." The analyzer does not yet distinguish the missing-leg half; the classifier does, and the two cards render separately on the Transactions page.
---

### 5.19 Completion Not Journaled -- Cardex Completion Whose GL Completion Cannot Be Found

> Numbered 5.19 in this guide; the analyzer's internal pattern ID is **5.20**.

> **The card name predates what the data says.** It reads as a posting gap; the gate makes it mostly a match failure. Keep the name (it is what the analyst sees on the card) and read the section for what it actually is.

> **This is the residual left AFTER the subledger match runs.** The "Manufacturing Accounting GL Summarization" subledger match (above) pairs a cardex completion with its GL completion by the work order (`GLSBL`) across batches, so a completion that WAS journaled -- even under a renumbered R31802A document in a different batch -- reconciles and clears. What survives as a cardex-only `IC` is either a genuine cost variance (a GL completion exists, amount differs -- that is **5.16 Manufacturing Cost Mismatch**) or a completion whose GL leg the correlation could not locate. This section is the second case.

**Symptoms:**
- A **work-order completion (DT `IC`)** relieved finished goods into inventory on the cardex (F4111); `CardexAmount` has a value, `LedgerAmount` = 0, and **the batch is non-zero**
- An F0911 aggregate keyed on the **document company** (`GLKCO`) plus the **numeric work-order subledger** (`GLSBL`), counting only `IC` and `IM`, finds the WO's **material issues (IM)** and **no completion (IC)** -- on any account, in any period, posted or not
- Distinguish from 5.16: there, a GL completion (IC) *does* exist for the WO and only the amount differs

**What happened -- read the batch first:**

Material issues and completions are written to F4111 with **no batch number and no G/L date**. R31802A stamps the batch onto those rows *and* creates the F0911 journal entries in the same step, so a batch on the cardex row means **R31802A already processed this transaction and wrote GL detail.** (Sequence: `AnalysisGuides/manufacturing-accounting-flow.md`.)

That reframes the card. Something processed the completion; the question is whether it wrote the GL detail at all or wrote it somewhere the correlation cannot reach.

> ⚠ **There is no repost.** R31802A resets Unaccounted Units on F4801 / F3111 / F3112 in the same run that stamps the batch, and unaccounted units are what drive its selection. After it has run, the program has nothing left to select, so "repost through R31802A" does nothing at all.

**Why -- leading cause: a genuine gap, data-confirmed, with no vendor-documented match**

R31802A stamps the cardex batch and writes **no F0911 completion detail for the order.** The shape is confirmed in the data (evidence table below). It is **not** matched by any Oracle Support article we have found, so describe it as an observed condition and not as a known defect.

> **Oracle Support KB 420628 is a near miss, not our case.** The article is retrieved in full. Its symptom looks like ours at a glance: R31802A updates the cardex correctly, including the batch number, while no journal entries and no batch number reach F0911, so the batch never appears on the R09801 report and cannot be posted. Its **cause does not apply to us.** The article's trigger is an issue quantity below **0.0050**. Transaction quantity carries 4 decimals and the part list cost field `CTS1` in F3111 carries only 2, so a quantity that small rounds `CTS1` to blank, and without a value there R31802A cannot write the journal entries. Its remedy is **manual journal entries**, which is accounting work rather than analysis. Two things rule it out here: the quantities are far too large, and the failure lands on the wrong transaction type.

**The distinguishing test, and how the specimen answers it:**

| KB 420628 requires | The specimen shows |
|---|---|
| An issue quantity below `0.0050` | **No row qualifies.** Across the full population the completions bottom out at `1.0000` and the material issues at exactly `0.0100`. Nothing falls below `0.0050`, and nothing falls below `0.01` |
| The **issue** (`IM`) journal entry to be missing from F0911 | The opposite. `IM` entries are **present** (thousands of them) and only `IC` is absent. The article's failure striking `IM` would *suppress* this card rather than produce it |
| A blank `CTS1` on the work order's F3111 part list | **Untested.** F3111 is a JDE part list table that RapidReconciler does not load, so `CTS1` is not reachable from an RR database or an export |

Whether a blank `CTS1` could block only *part* of a run's output, the completion leg while the issue leg still writes, is **not addressed by the article and is not something to assume.** Settling it takes a query against the customer's own `PRODDTA.F3111`: look for the card's work orders carrying a blank or zero `CTS1` while their transaction quantity sits at or above `0.0050`, then check whether those same orders' `IM` entries reached F0911. Until someone runs that, KB 420628 stays a near miss worth knowing and nothing more.

Keep the quantity check in the workflow regardless. It is one column on the export and it cleanly separates the two conditions.

The evidence from a specimen dataset (one company, 39 rows in one period):

| Test | Result |
|---|---|
| F0911 per work order, matched on company + numeric subledger | All 39 orders: **0 `IC` rows**, 1-29 `IM` rows |
| Same orders, **no** company and **no** document-type restriction | **507 rows, all `IM`. No `IC` anywhere** |
| F3106 cross-reference | **543 rows covering all 39** -- the run did process them |
| The 7 batches those rows belong to | **1,080 `IC` rows**, posted, document company matching, **every one with a numeric subledger** |
| The account 37 of the 39 sit on | **293 `IC` rows in those same batches for 260 other orders** |
| Per period, Jan-Aug 2025 | 42, 51, 57, 25, 14, 71, 39, 21 rows, across order types `WO` / `WR` / `W1` |
| Every batch across those 8 periods | **58 manufacturing batches**, 4-11 per period, roughly one per business day the job fired. **Every one journaled the large majority of its completions and dropped a slice. Not one batch was clean, and not one failed outright.** The dropped share runs **0.6%-24.6% per batch** and **3.2%-11.3% per period** |
| The 39 rows' G/L dates | **7 distinct dates, Jul 8-30, one date per batch.** F4111 agrees on `ildgl` / `ilcrdj` / `perioddate`, and `iluser` is a single value, so the writer is not the variable |

Same run, same batches, same account: 260 orders got their completion entries and these 39 did not. The shape is **standing, not a one-off.**

Read the batch counts carefully, because they change what this is. Zero whole-run failures across all 58 batches, and zero clean ones. That makes it a **partial-run failure repeating on every run**, not one bad run that needs finding. The roughly 40x spread between the lightest and heaviest batch says run conditions move the severity without ever eliminating it. Repeat these queries on a customer database to confirm it beyond the one dataset.

**Why -- secondary causes: match failures.** Every one was refuted on the specimen above, but they remain real possibilities at other sites, so rule them out with the batch lookup rather than assuming them.

1. **R31802A summarized the journal entries, so the completion carries no work-order subledger.** The subledger processing option does not apply to summarized entries, and summarization combines entries **by account across work orders**, dropping the order number. "Summarize Material Issues within Work Order" creates one entry per account **plus** work order and keeps it. Issues keyed to the order and completions not keyed to it would give the same `IM`-present / `IC`-absent asymmetry. *(Refuted on the specimen: every `IC` row in those batches carries a numeric subledger.)*
2. **The completion journaled under a document type the correlation does not count.** Only `IC` and `IM` are counted; scrap defaults to `IS` and variance is `IV`, both processing-option driven. *(Refuted: no `IC` for those orders with the restriction removed.)*
3. **A different document company on the GL side,** so the company leg of the join misses while the order number matches. *(Refuted: still no `IC` with the company restriction removed.)*
4. **The GL completion sits outside RapidReconciler's loaded F0911 window.** The pull is windowed on G/L date, 35 days back by default, so a backdated manufacturing run drops the population from RR's copy while the cardex rows are present. *(Refuted: the batches and their other `IC` rows are loaded.)*
5. **Something other than R31802A stamped the batch** -- interoperability, EDI, a custom program. `ILPID` identifies the writer.

**Refuted -- none of these can put a row on this card at all:**
- R31802A never ran, errored and skipped the order, was blocked by work-order status, or the completion cost zero -- all excluded by the batch and cardex-amount conditions
- **An unposted batch.** RapidReconciler loads unposted F0911 and the correlation has no posted filter, so an unposted `IC` *suppresses* this card. That break surfaces as a GL Batches variance instead
- **Posted to a different account or period.** The correlation carries no account and no period predicate
- **An F0911 purge.** JDE's purge targets the F0911Z1 staging table

**Confirm it -- one lookup, then fork**

Take the batch number off the cardex row and read F0911 for that batch, manufacturing batch type `'0'`. **Read it for the work order, not just for the batch** -- the specimen batches were full of `IC` rows, just none for the 39 orders on the card.

| What the batch holds | Diagnosis | Next |
|---|---|---|
| `IC` rows carrying **this order's** subledger | **Match failure** | Check the subledger for blank or non-numeric first, then the document company, then the document type |
| `IC` rows present, but **none for this order**, while F3106 still names the batch for it | **The genuine gap** (specimen shape, no vendor article matches it) | R31802A processed the order and wrote no completion detail for it. F3106 is the cross-reference it updates with work order, document, type, G/L date and batch |
| **No `IC` anywhere** in the batch | **The gap, run-wide** | The whole run's completions failed rather than a subset. Same conclusion, wider blast radius |
| `IC` absent from RR's F0911, present in JDE's | **Load window** | The G/L date falls outside the loaded window; widen the pull or reload the GL for the period |

**Prevention**

- **Read the error report R31802A produces.** Have whoever runs the job pull it for the run that stamped these completions.
- **Pursue the R31802A behaviour with Oracle through the customer's own IT department,** which owns the support contract. Ask for it as an undocumented condition rather than as KB 420628, and hand over the evidence: batch stamped on the cardex, no `IC` detail in F0911 for the order, other orders in the same batch journaled normally, quantities well above the `0.0050` threshold that KB 420628 turns on. Naming the wrong article invites a remedy that does not fit.
- **Check the quantities before reaching for KB 420628.** Any completion or issue below `0.0050` puts that article back in play, and its remedy is manual journal entries rather than anything an analyst can prevent. Above that threshold the article is the wrong lead.
- **For the match-failure branch only: hold one R31802A summarization and subledger policy across every version in use.** A second version with different options reintroduces the split. Where summarized entries are the deliberate business choice, the fix belongs on the correlation side, because the subledger will never be there.
- **Do not delete unposted manufacturing batches.** The unaccounted units are already cleared, so nothing in JDE regenerates the detail.

> **Analyzer output:** the analyzer fires this ahead of the generic Cardex-Only diagnosis (5.3) for any `IC` completion that relieved the cardex with no GL, so the batch-first reading wins over "go post the batch." The classifier stamps the same rows **Completion Not Journaled** (`usp8_txv_flags`, correlated against F0911 by company + numeric subledger), and they group on their own card on the Transactions page.

---

### 5.20 Make to Order -- Manufacturing Residual, Decomposed by Shape

> A card-level analysis, not a single analyzer pattern. **Make to Order** is a *business* grouping, not a variance type: `usp6_008` stamps the subtype on any work-order row whose originating sales order is on the sales side (`vcr_f42119.sdrorn` = the work order), so a make-to-order job's costs stay together on one card linked to the customer order. The variance inside that group is ordinary manufacturing cardex-vs-GL, and it splits into three shapes, each with its own action. The card carries all three so the analyst works the whole job in one place.

**First, rule out the two things it is not:**
- **Not a DMAAI mapping issue.** The inventory routings resolve to the same account as the 4152 cardex model -- the analyzer's routing check comes back clean. Do not chase an AAI here.
- **Not a missing sales offset.** The sales orders shipped and closed (status 999 in `vcr_f42119`); there is no stranded in-transit leg waiting to net. The residual is between the cardex and the GL on the manufacturing side, one document at a time.

**The three shapes** (split each row by whether the cardex and GL sides carry a value):

| Shape | Cardex / GL | What it is | Action |
|---|---|---|---|
| **GL only** | cardex 0, GL &ne; 0 | Standard-cost variances -- the completion posted to the cardex at standard while the GL carried the actual-cost variance components (labor, overhead, material burden) that never move inventory. | **Expected. No action.** GL-only on a make-to-order job is the variance side of standard costing landing in the GL, not a reconciliation gap. See 5.2. |
| **Both differ** | both &ne;, unequal | **Cause not confirmed.** This slice was read as a cost-basis difference (standard on the cardex, actual in the GL, gap = quantity &times; cost-basis difference). Tested 2026-08-04 against the full loaded population and **the profile does not fit** -- see the evidence below. | **Work by account, largest account first,** with cost accounting, and do not carry the cost-basis story into that conversation. 5.16 Manufacturing Cost Mismatch remains a real mechanism, but it has to be *confirmed* on these rows rather than assumed. |
| **Cardex only** | cardex &ne;, GL 0 | A completion (`IC`) on the cardex with no GL completion for the order, while the same work order's material issues (`IM`) are in the GL. **Check the batch:** it is non-zero, so R31802A already processed the transaction. | **Do not repost -- there is nothing left for R31802A to select.** Read F0911 for the cardex row's batch, looking for this order's subledger specifically, and fork from there. Most often the run wrote no completion detail for the order at all (the observed gap, not matched by any vendor article). See 5.19 Completion Not Journaled. Held under the make-to-order subtype because `usp6_008` stamped it first. |

**Why the cardex-only slice stays here and not on the Completion Not Journaled card:** the make-to-order subtype is assigned in `usp6_008` from the sales-order link; the `usp8_txv_flags` Completion-Not-Journaled pass only claims rows with **no** subtype, so a make-to-order completion keeps its business grouping. The decomposition surfaces the same shape and the same lookup in place -- the analyst sees the whole job on one card rather than having those rows split off. (If a future call moves them, it is a classifier-ordering change, not a copy change.)

**Worked shape (one make-to-order company, one period):** 271 rows netting about -$11K -- roughly 158 GL-only (+$22.8K, expected standard-cost variances), 81 both-differ (-$26.6K, completion cost differences to investigate), 32 cardex-only (-$7.4K, completions whose GL leg has to be located by batch). The net is small, so read the gross: only two of the three shapes need any work.

**Full population, same company, all eight loaded periods (queried 2026-08-04).** 2,865 rows, about $330K gross:

| Shape | Rows | Gross | Share of gross |
|---|---|---|---|
| GL only | 1,088 | ~$129.5K | 39% |
| Both differ | 1,400 | ~$133.0K | 40% |
| Cardex only | 377 | ~$67.7K | 21% |

Two things follow that the single-period view did not show.

**The cost-basis cause does not fit the both-differ slice.** A standard-versus-actual gap is a modest share of the transaction and falls either side of it. This population does neither:

| Test | Expected for a cost-basis difference | What the rows show |
|---|---|---|
| Size of gap vs size of transaction | A modest percentage | **577 of 1,400 rows exceed 50%** of the item-ledger amount, carrying ~$110.7K, i.e. **83% of the slice's value** |
| Is that an artifact of a near-zero cardex side? | Would explain it away | **No.** Only 26 of those rows have a cardex side under \$1. **104 rows with a cardex of \$100 or more carry ~$86.5K**, still differing by over half |
| Direction of the gap | Roughly symmetric | **Asymmetric.** GL exceeds cardex on 958 of 1,400 rows and ~$111.5K of ~$133.0K, so **84% of the value runs one way** |
| Spread across accounts | Broad, following production | **Concentrated.** One account carries 453 rows and ~$89.4K (**67% of the slice**); two carry ~$109.4K (82%) |

So something systematically puts more value in the GL than on the cardex, on a small number of accounts, at magnitudes a cost-basis delta would not produce. Name it as unconfirmed and work the concentration.

**The cardex-only slice is a fifth of the card and is not cost work.** 377 rows and ~$67.7K carry the completion-gap shape, which is the &sect;5.19 investigation. Sending them to cost accounting wastes the analyst's and the accountant's time, because there is no cost to reconcile when there is no GL entry at all.

Repeat these on a customer database before generalizing. The shapes and the tests generalize; the rates are this dataset's.

> **Analyzer output:** for a Make-to-Order drill the analyzer skips the generic "routings match, it's timing" line and instead reports the three-shape breakdown with row counts and dollars, leading with the batch lookup when any cardex-only completions are present. Same knowledge in the classifier (the subtype + the Completion-Not-Journaled correlation) and the AI grounding.

---

### 5.21 Item Location GL Class Blank -- Variance Equals the Whole Balance

**Signature.** The item confirms a quantity and an amount, then shows a variance of the *same* quantity and amount. The variance equals the balance rather than the difference between two balances. When you see those figures agree exactly, stop looking for a timing or a costing difference and go read the GL class.

**Cause.** GL class lives at three levels: F4101 `IMGLPT` (item master), F4102 `IBGLPT` (item branch), and F41021 `LIGLPT` (item location). Amending one does not propagate to the others, and the location value is the one that governs. A class amended on the item master while the location record stays blank splits the two sides of the reconciliation. The amendment is often days old, so nothing about the current period looks unusual.

**Why the whole balance moves rather than a delta.** RapidReconciler carries GL class inside the item identity. `RItems` is built from a union of distinct (branch, item, location, lot, glclass, cost level, primary UOM) across F4111 `ILGLPT` and F41021 `LIGLPT` (`v6_006_items`), and the itemid binds join on `LIGLPT = glclass` for the location and `ILGLPT = glclass` for the cardex (`usp6_006_inventory_data_prep`). A blank location class beside a populated cardex class therefore resolves to two different itemids. `RPerpetualInv` is keyed on itemid alone and holds the on-hand pair next to the cardex pair, so one row receives the quantity and amount on hand with no cardex, and the other receives the cardex with no on-hand. Neither nets against the other, and both read as a full variance.

**The test that settles it in one pass.** Restore live production into test and rerun the refresh. If the variance survives both, it is source data and not RapidReconciler state, because anything internal (a stale load, an unbound itemid, a partial refresh) clears on the reload. That result redirects the investigation to JDE master data instead of to the reconciliation.

Which configuration check catches it:

| Check | What it covers |
|---|---|
| GL Class Integrity (Integrity Report 5, `v_integrity5_gl_class`) | Compares F4102 `IBGLPT` against F41021 `LIGLPT`, so it catches a branch against location split. It does not read F4101 `IMGLPT`. A master-only amendment that leaves both lower levels blank passes clean, since blank equals blank. |
| Unassigned Account (Integrity Report 3, `v_integrity3_exc_glc`) | Lists items whose GL class resolved to no base account and renders a blank class as `*blank*`. A blank location class surfaces here even when Report 5 is quiet. Check it second. |

**Resolution.** Set the GL class on the item location record in JDE, then refresh. No journal entry is involved; the amounts were never misposted, they were split across two item identities.

**Recurrence prevention.** This is master-data hygiene on the customer's side. Whoever amends an item's GL class has to amend the item location, and the item branch, in the same change. Route that to the customer's IT or data-governance owner rather than treating it as a reconciliation task.

> **Worked shape (fictional):** item `SI-100200` in branch `MFG01` is amended from blank to GL class `IN20` on the item master. The location record for `MFG01` / location `A-01-02` stays blank. The next refresh produces one RItems row at class `IN20` holding the cardex activity and one at blank holding 4,300 units and $86,000 on hand. Both rows report a variance of 4,300 units and $86,000.

> **Keep the GL Class column visible.** In practice the fastest diagnosis of this pattern has come from an analyst reading GL Class = blank directly off the RapidReconciler display. The column earns its place on the analysis surface.

---

### 5.22 Sales AAI Cancels -- The Cost-of-Sales Pair Resolves to One Account

**Card:** `Sales DMAAI Net Zero` (`SAC`), claimed by `usp8_txv_flags` block L. The
card was titled `Sales AAI Cancels` when this section was first written; both
strings resolve to the same SubType, so an older screenshot is not a different
card.
**Shape:** cardex-only at document grain -- `CardexAmount` non-zero,
`LedgerAmount` zero -- on a sales document that has no `F0911` row at all.

> **Corrected 2026-08-10.** This was written up as a sample despatch with no GL
> posting rule, and it closed by asking the customer whether sample issues were
> meant to post and to which expense account. The account instruction exists.
> Both of its legs point at one account, so the entry cancels and never reaches
> the GL. The blank-`BatchType` signal recorded here is stale as well: `BatchType`
> reads `G` on all 1,292 rows of the specimen population.

**Symptoms:**
- Document type `JS`, order type `SA` on the specimen, cardex-only, so
  `LedgerAmount = 0`
- Many rows, each carrying a trivial amount, against a real inventory account
- The stock location often names the movement: `SAMPDESP`, `SAMPWIP`,
  `SAMPRACK*`, `LABWIP`, `CLEANROOM`, `S1ASAMP*`
- The batch reads posted in `F0011` (status `D`) and still holds no `F0911`
  detail for the document
- `F0911` holds nothing for the document number under **any** document type

**What is happening.**

The shipment writes its cost of sales through two account instructions: **4220**,
the cost-of-goods debit, and **4240**, the inventory credit. For this order type
both resolve to the same account. The debit and the credit land on it together,
cancel, and no journal detail is produced. The item ledger relieved inventory and
the GL received nothing, so the relief has no counterpart and the variance is the
full relieved amount. The batch shows posted because JD Edwards closed it, not
because this document produced an entry.

**The order shipped at no charge, so its cost belongs in cost of goods sold.**

- Order type `SA` is the first indication the shipment is a sample. The customer
  asked for samples; the goods went out free of charge. Read the order type off
  the item-ledger row before you read anything else.
- **A price of zero on every line confirms it.** No charge on any line of an `SA`
  order is a sample despatch, and one look at the order lines settles it. Order
  type alone is an indication; order type plus no price is the conclusion.
- The goods left the building. Their cost is a cost of doing business and belongs
  in cost of goods sold -- not parked on the balance sheet, and not cancelled.

**Rank the two defects in this order when you write the finding.**

1. **Primary: the pair nets to zero.** 4220 and 4240 land on one account, so the
   cost that belongs in cost of goods sold cancels itself across the debit and
   the credit and never reaches the P&L at all. The item ledger relieved
   inventory and the income statement never saw the charge. That is the finding.
2. **Secondary: the routing does not match the 4152 cardex model.** The
   analyzer's routing check reports that the inventory DMAAIs resolve somewhere
   other than the model account, and it is worth correcting in the same change.
   It is a mapping discrepancy, not the reason the cost went missing. Lead with
   it and the customer repairs the label while the leak stays open.

**Read the order type before the document type.** A `JS` document is a
sales-order cost-of-sales entry, and one `JS` population can hold order types
whose accounting behaviour has nothing in common. Diagnosing at document-type
grain averages them and produces a conclusion that is wrong for every subgroup.
On the specimen, re-measured 2026-08-10:

| Order type | Cardex rows (`F4111`) | Cardex documents | `F0911` legs found | GL value |
|---|---|---|---|---|
| `SK` intercompany inter-branch | 249 | 87 | 87 | -6,465,601.39 |
| `SP` | 104 | 73 | 72 | -1,356,923.58 |
| `SA` sample and lab issues | 5,563 | 3,104 | **0** | **0.00** |

`SK` ties on document number plus batch, to the penny, on every row. Before
concluding that `JS` cannot be matched per document, split by order type and
re-test.

**The AAI is the evidence, and it is one query against `F4095`.**

> **Column semantics, and getting this backwards returns an empty result you will
> read as "the AAI does not exist".** On the **42xx sales** instructions the
> ORDER TYPE is carried in `mldct`, and `mldcto` is blank. The **31xx
> manufacturing** instructions are the other way round: `mldcto` holds the order
> type and `mldct` the document type. Read `F4095` directly. A derived table that
> returns nothing means not loaded, never not configured.

Resolve each AAI number the way JDE does -- the item's GL class from `F4111`
first, the `****` wildcard second -- and compare the two accounts. On the
specimen, `SA` resolves through a single `****` row on each company and both AAIs
land on one inventory account. An order type on the same company that ships
correctly routes 4220 to a P&L object and 4240 to the branch inventory object.
`F0911` holds no row on the shared account's object and none under document type
`SA`, which is the confirmation that nothing was written rather than written
elsewhere.

**Exposure is per (company, order type, GL class), not per order type.** Specimen
counts of slices where 4220 and 4240 resolve together:

| Order type | Slices cancelling | Cardex activity in the window |
|---|---|---|
| `SA` | every class defined | yes -- this is the entire residual |
| `SR`, `S3` | every class defined | none in the window, so misconfigured but quiet |
| `C1`, `C2` | 5 of 9 classes per company | none |
| `SO`, `SF`, `SX`, `CO`, `SD`, `SM`, `SW` | 1 or 2 of 9 classes | shipments, but not on the affected classes |

The order types with shipments and no residual are the useful negative control:
the classes they ship on route correctly. Count the slices before telling the
customer the exposure is one order type wide.

**Why the earlier "Sales Not Journaled" reading was wrong, and what it cost.**
The withdrawn claim gated on "no `F0911` row exists for this document number" and
concluded the posting run had failed. The absence is real; the conclusion drawn
from it was wrong, and the evidence recorded for it does not survive
re-measurement: the 159 `JS`
legs on this database belong to `SK` and `SP`, not to `SA`; every one of them
matches an `F4111` document number **and** its batch rather than carrying an
internal number; and grouped by document they return exactly one leg per
document, 159 to 159, so there is no summarization in this population to explain
anything. The full correction is recorded in `usp8_txv_flags` block J. The
standing rule it produced still holds: **the cardex-to-GL match key differs per
transaction type, and `LedgerAmount = 0` means the correlation found nothing, not
that the GL is absent.**

> **Do not re-propose it.** The population still looks exactly the way it looked
> when the claim was first written -- relief on the item ledger, nothing in the
> GL under the document number -- so a fresh reading arrives at the same wrong
> answer unless the withdrawal is read first. It is recorded in two places: this
> section, and the comment block above the `SNJ` entry in `RRV8/config.js`. The
> `SNJ` entry itself survives only so a database still emitting the old SubType
> renders a titled card; its presence is not evidence the claim is live.

**Resolution.**

> This is an account-instruction fix, not a journal entry. A correcting entry
> balances the period and the next shipment on the order type reopens the
> variance.

1. **Confirm the order type and the location.** Pull the item-ledger rows for the
   document and read order type and stock location. A different order type on the
   same document type is a different transaction and it may well tie.
2. **Confirm the GL is absent rather than differently keyed.** Read `F0911` for
   the document number with no account, period or document-type filter, then for
   the batch. Both empty is the finding. Do not stop at the document number
   alone.
3. **Read 4220 and 4240 for that order type** on the document's company,
   resolving exact GL class first and `****` second. One account on both legs is
   the cause.
4. **Diff against an order type on the same company that ships correctly**, GL
   class by GL class. That comparison is the whole diagnosis and it hands the
   customer the target values.
5. **Check the batch composition.** A batch holding both affected and unaffected
   rows shows GL for the unaffected ones only. That is expected and is not
   evidence this document posted.
6. **Quantify before escalating.** The row count is high and the value is low.
   Confirm against the customer's materiality threshold, and say plainly that the
   row count is what makes it visible, not the dollars.

**Prevention.** Point 4240 at the inventory account per GL class, matching the
order types that already ship correctly, and 4220 at cost of goods sold, so the
two legs stop landing together. Sweep the rest of the family in
the same change: an order type with no shipments this period is misconfigured all
the same. The accountant
separately books the relief that never reached the GL for the periods already
closed. Re-check the following period: new cardex-only rows on the same order
type mean the AAI was not changed.

> **Materiality reads backwards on this pattern, and that is worth telling the
> analyst.** On the specimen database these are 1,292 of 1,338 unclassified rows,
> 96.6% of the residual by count and 1,292 of its 1,295 unclassified sales rows, worth
> -22,926.26 across 1,291 documents and 15 consecutive periods. It dominates the
> worklist and barely moves the balance sheet. Report both numbers together so
> nobody triages it on count alone or dismisses it on value alone.

> **Not to be confused with Section 5.23.** Offsetting GL Entries is the same root
> cause -- the sales cost-of-sales pair -- in a different shape: there the GL
> wrote two legs that cancel each other off inventory, here it wrote nothing at
> all because both legs resolved onto one account. `OFF` needs two or more legs to
> detect the cancellation, so it structurally cannot reach these documents, which
> is why the two claims exist separately. Read the AAI pair and the `F0911` leg
> count before choosing between them.

---

### 5.23 Offsetting GL Entries -- Both Sales COGS AAIs Route to a P&L Account

**Card:** `Offsetting GL Entries` (`OFF`). **Shape:** cardex-only at document
grain -- `CardexAmount` non-zero, `LedgerAmount` zero -- on a stock line.

**What the GL actually did.** The document posted. `F0911` holds exactly two legs
for it, equal and opposite, both in the same posted batch as the item ledger, and
neither on the inventory account the cardex used. A specimen: cardex relieved
-8,651.99 on inventory account `00223976`; the GL wrote +8,651.99 to object
`510415` and -8,651.99 to object `512498`, both in business unit `9999842`, both
posted, batch `12862772`, both explained "Inventory transaction".

**`LedgerAmount = 0` here does not mean the GL entry is missing.** It means the GL
wrote a self-cancelling pair somewhere else and never touched inventory. "Go post
the batch" is the wrong instruction: the batch is posted. And because both legs
land in the same statement, the P&L nets to zero, so no income-statement review
will ever surface it. Only the balance sheet moves, and it moves by the full
item-ledger amount.

**The cause is the AAI pair, per ORDER TYPE.** JDE's sales shipment writes the
cost-of-sales entry through two account instructions: **4220** (the COGS debit)
and **4240** (its counterpart, which is supposed to relieve the inventory
account). The two roles were printed the wrong way round here until 2026-08-10;
the table below only reads correctly with 4240 as the inventory leg, and raw
`F4095` on a second database agrees -- a working sales order type routes 4220 to
a P&L object and 4240 to the branch inventory object. Read both for the order type
on the document:

| Order type family | 4220 object | 4240 object | GL classes routed to an inventory account |
|---|---|---|---|
| `C2` `C3` `C5` `C6` `C7` `CO` `CR` `CW` | `510415` COGS | `512498` COGS | **0 of 28, on either table** |
| `S2` `S3` `S5` `S6` `S7` `S8` `S9` `SE` | `524996` COGS | inventory objects per class | **22 of 28 on 4240** |

Both families are on the same company, in the same table, refreshed by the same
job. The `S` family is the working template; the `C` family routes every one of
its 28 GL classes to a P&L account on both legs.

**The published test for this is too narrow, and it passes here.** The DMAAI
reference says 4220 "must point to a different account than 4240" and warns that
pointing both at one account makes the debit and credit cancel. On this company
they point at *different* accounts -- `510415` and `512498` -- so that test
passes, and the entry still cancels off inventory. **The test is not "are they
different", it is "does one of them reach an inventory account".** Two different
COGS accounts fail just as completely as one shared account, and they fail
invisibly.

**How to work it**

1. **Read the order type off the document, not the document type.** The whole
   population here posts under document type `RI`, shared with correctly-behaving
   order types on the same company. Diagnosing at `RI` grain averages them.
2. **Pull 4220 and 4240 for that order type** and read the object account on
   each. An object in the inventory range on neither leg is the finding.
3. **Find a working order type on the same company** and diff its 4240 against
   the broken one, GL class by GL class. That comparison is the whole diagnosis,
   and it also gives the customer the exact target values.
4. **Check the whole family before calling it isolated.** Eight order types share
   this configuration on the specimen; only three of them had shipments in the
   period, so the residual understates the exposure.

**Corrective action (source side, customer owns it).** Point 4220 -- or 4240,
whichever leg is meant to carry the relief on this shop's setup -- at the
inventory account per GL class for every order type in the family, matching what
the working order types already do. **No journal entry prevents recurrence**: every
shipment on these order types reproduces it until the AAI changes. The accountant
separately restores the inventory account for what has already posted.

**Re-check the following period.** New documents on the same order types with the
same two-leg cancelling signature mean the AAI was not changed.

> **Negative controls, both measured.** On a second database the `C` family's 4220
> and 4240 *do* route some GL classes to inventory, and that database has **zero**
> cardex-only rows on those order types. On a third, the only sales order type is
> `SO`, its 4240 routes 86 classes to inventory, and it likewise has none. The
> association runs both ways, which is what separates this from a coincidence.

> **Not to be confused with Section 5.22.** Sample despatch is also cardex-only on
> a sales document, and it is a different finding with a different owner: there the
> line never had a GL rule at all, here the rule exists and points at the wrong
> kind of account. Read the order type and the AAI before choosing between them.

---

## Section 6: DMAAI Analysis

The DMAAs section at the bottom of the Transaction Detail report is critical for diagnosing account-level mismatches. Work through it in the following order:

**Step 1 -- Check the Model Table (4152)**

The first row is always the model table entry. Confirm:
- The account matches the account shown in the F0911 Inv Acct section
- If they don't match, the GL entry posted to a different account than the model table -- this is the account mismatch

**Step 2 -- Check for Comment Flags**

Any entry with a value in the Comment column requires investigation:

| Flag | Meaning | Action |
|---|---|---|
| **Missing entry / Missing model table entry** | The GL class code for this transaction has no entry in model DMAAI table 4152. All cardex rows with this GL class are excluded from the reconciliation and appear in the Unassigned section instead. | Add the GL class code to DMAAI table 4152 in JD Edwards with the correct account. After the next refresh, previously unassigned rows will move into F4111 Data and the full variance will be visible. Also check Integrity Report 3 (Excluded GL Classes) for a full list of missing codes. |
| **Mismatch - object** | The object account in this AAI differs from the model table | Correct the AAI object account to match the model table |
| **Mismatch - BU** | The business unit in this AAI differs from the model table | Correct the AAI business unit or confirm the difference is intentional |
| **Mismatch - sub** | The subsidiary in this AAI differs from the model table | Correct the AAI subsidiary |
| **Net Zero** | The debit and credit AAIs point to the same account | The transaction has no net GL impact -- investigate whether this is intentional |
| **Net zero review - 4134, 4136** | AAIs 4134 (Inv Cost Chg) and 4136 (Exp Cost Chg) both point to the same object account | IB cost change entries are netting to zero within the inventory account. Correct AAI 4136 to point to an expense or variance account. See Section 5.10. |
| **Net zero review - 4122, 4124** | AAIs 4122 (Inv Adj) and 4124 (Exp Adjust) both point to the same object account | IA inventory adjustment entries are netting to zero. Correct AAI 4124 to point to an expense or variance account different from AAI 4122. |

**Step 3 -- Identify Which AAI Caused the Mismatch**

Cross-reference the account shown in F0911 Inv Acct against the AAI entries in the DMAAs section. The AAI whose account matches the F0911 entry is the one that drove the GL posting. If that AAI's account differs from the model table account, that is the root cause.

**Step 4 -- Check for Flex Accounting**

Entries labeled "flex" in the Account column indicate Flexible Accounting is active for that AAI. The business unit or subsidiary was dynamically constructed from transaction fields rather than read directly from the DMAAI. If the flex result is unexpected, review the flex accounting rules in P40296.

**Common Flexible Accounting variance scenarios:**

| Scenario | Variance Sub-Type | Why It Causes a Variance |
|---|---|---|
| Manual account entry (II/IA PO 1) active alongside Flex | **Accounts** | Flexible Accounting is **not** applied to manually entered accounts. The AAI-assigned (flexed) account is written to F4111; the manually entered account goes to F0911 — guaranteed mismatch regardless of flex configuration. |
| AAI configured in F4096 but DMAAI business unit is not left blank | **Accounts** | If the DMAAI has a hard-coded business unit AND a Flexible Accounting rule exists for the same AAI, the hard-coded DMAAI value overrides the flex rule. All transactions use the hard-coded account; the flex rule is silently ignored. |
| Flex rules not defined for all GL class codes in use | **Accounts** | Items without a matching flex rule fall back to the standard DMAAI. If the standard DMAAI account differs from the expected flexed account, a mismatch results. |
| R42800 — Selective version approach (only some versions have flex enabled) | **Accounts** | If Flexible Accounting is active in one R42800 version but not another, the same item/customer combination will post to different accounts depending on which version processed the order. Check which version ran using the Print tab version setting. |
| R42800 — Setup Method "C" (Combination) with conflicting Object and AAI rules | **Accounts** | In Combination mode, Object rules take precedence over AAI rules. If both are defined and point to different accounts, the Object rule always wins and the AAI-based flex rule is effectively ignored. |

> **When Flexible Accounting is active:** Use Integrity Report 0 (JDE DMAAs) in RapidReconciler to view both F4095 (standard DMAAI) and F4096 (Flexible Accounting) entries side by side for the GL class code in question. The DMAAs section of the Transaction Detail will show which entry was actually selected for the transaction.

> **For IM transactions:** When DMAAs shows no Comment flags and DMAAI configuration is clean, do not continue looking for an AAI explanation. A clean DMAAs section on an IM GL-excess means the excess is almost certainly a cross-work-order GL summarization issue (Section 5.12), not a configuration problem. Proceed directly to the F0911 query step.

---

## Section 7: Step-by-Step Analysis Procedure

Use this procedure for every Transaction Detail report:

**Step 1 -- Read the Doc Header**

Note the document number, document type, order number, order type, and the total LedgerAmount (the variance to be explained). Note the Sub Type -- this gives the first indication of the variance category.

**Step 2 -- Check for the Unassigned Section**

Before reviewing anything else, scan the top of the report for an **Unassigned** section. If present:
- The F4111 Total is understated -- the true cardex amount is F4111 Total plus Unassigned Total
- The displayed variance is partial -- the full variance is larger than shown
- Go to the DMAAs section immediately and look for "Missing model table entry"
- See Section 5.1 for the resolution procedure

**Step 3 -- Check the RR Summary**

- Is CardexAmount zero? → GL-only entry. The variance is entirely on the GL side. See Section 5.2.
- Is LedgerAmount zero? → Cardex-only entry. Check for unposted batches. See Section 5.3.
- Are there multiple rows with CardexAmount and LedgerAmount on separate rows? → Account or period mismatch. See Sections 4.4 and 4.5.
- Are both totals non-zero but unequal, with one or more rows showing LedgerAmount = $0.00 for a specific batch? → Partial cardex-only entry. A single line item within an otherwise-posted batch may be missing from the GL. See Section 5.3.
- Are both totals non-zero but unequal, with the GL amount exceeding the cardex for a specific batch? → GL-excess entry. The GL entry for that account and batch is larger than the cardex. See Section 5.11.
- Is the document type IM, the GL-excess isolated to one GL class with all others reconciling cleanly, and the DMAAs section flag-free? → Cross-work-order GL summarization by R31802A. See Section 5.12 before taking any corrective action.
- Single row with matching amounts? → This should not appear as unreconciled. Investigate the tolerance setting.

**Step 4 -- Review the F4111 Data**

- Is the section empty? → No cardex records exist for this document. Confirm whether one should exist.
- Check the PC (posting code) field. "X" = memo transaction; should not be present for stock transactions.
- Note the GLDate vs. TransDate. A large gap may indicate a period mismatch.
- Are there two rows for the same document?
  - One row has zero quantity and a "Standard Cost Change" or "Inventory Cost Change" comment → See Sections 4.9 (Variant A) and 4.10.
  - Both rows have non-zero quantity, identical comments, and the same unit cost → See Section 5.9 (Variant B). The second row represents a second completion batch whose GL entry may be under a different document number.
- When the RR Summary shows a partial cardex-only pattern, scan the F4111 unit costs for outliers. A single line with a unit cost that is a significant multiple of all others is a strong indicator of where the GL gap originates.
- **For IM documents showing a GL-excess:** Count the F4111 rows for the affected GL class. A small number of component rows paired with a GL amount significantly larger than their combined value is the primary indicator of cross-work-order GL summarization. Compare this to the number of components you would expect to be issued to a single work order of this type.

**Step 5 -- Review the F0911 Inv Acct**

- What account did the GL entry post to?
- Does the account match the F4111 GLClass and the model table account?
- Note the batch number -- does it match the F4111 batch number?
- Check the Comment field for supplier name or other context.
- When the RR Summary shows a partial cardex-only pattern, compare the F0911 entries for each GL class and batch individually against the corresponding F4111 lines. A GL class total that is smaller than its F4111 counterpart points to the specific account and batch where the missing line item will be found. Before concluding the GL entry is absent, query F0911 across **all** accounts for the document and batch -- the entry may have posted to an unexpected account rather than being missing entirely.
- **For IC, IM, and IH document types:** The GL document number in F0911 is almost always different from the cardex document number -- this is normal. Before concluding a GL entry is missing or erroneous, query F0911 for the GL document number across all order numbers to determine whether it is a summarized manufacturing posting covering multiple work orders. See Section 4 (Manufacturing Accounting GL Summarization) and Section 5.12.
- When the RR Summary shows a GL-excess pattern, compare the F0911 and F4111 totals for each GL class and batch individually to isolate which combination is the source. See Sections 4.11 and 4.12 for the investigation procedure.
- **When the Orders section is present and shows stock lines with NxtSts ≥ 540:** compare the order line qty against the F4111 qty for the same item / line. If the order line qty is larger than what F4111 captured AND the F0911 inventory total matches `Σ qty × unit cost` from the Orders section, the order was edited after ship-confirm. See Section 5.13. The corrective action is a process / access-control fix, not a configuration fix.

**Step 6 -- Review the Receipts Section**

- Trace the full receipt and voucher history for the order.
- Note any "No Cx" batch entries (no cardex written).
- Compare tax amounts in Comments between OV (receipt) and PV (voucher match) rows.
- Check for landed cost rows and their CardexAmount vs. LedgerAmount.
- Note the NxtSts (next status) -- 999 means fully closed; no further JD Edwards processing is possible.

**Step 7 -- Review the DMAAs Section**

- Check for Comment flags (Missing entry, Mismatch, Net Zero).
- Identify which AAI produced the GL account shown in F0911.
- Compare to the model table account.
- If the DMAAs show no flags and the DMAAI configuration is clean, the variance is not a configuration issue -- focus the investigation on the GL posting history for the specific document and batch (see Step 5 notes on partial cardex-only and GL-excess patterns).
- **For IM documents:** A clean DMAAs section combined with a GL-excess on one GL class is a strong indicator of cross-work-order GL summarization (Section 5.12). Proceed to the F0911 query before considering any other cause.

**Step 8 -- Check Processing Options**

If the root cause has not been identified from the report data alone, use the document type and Sub Type to look up likely processing option causes in Section 8. Processing option settings are not visible in the Transaction Detail report and must be verified in JD Edwards. The options listed in Section 8 are candidates for investigation, not confirmed causes.

**Step 9 -- Determine Root Cause and Corrective Action**

Based on the analysis above, classify the variance using Section 5 of this guide and identify the appropriate corrective action. All corrections are made in JD Edwards; the corrective action is always one of:
- Post a manual journal entry to recode the GL amount to the correct account
- Post the unposted batch
- Correct the DMAAI configuration and document the impact
- Add missing GL class to model table 4152
- Tighten Order Activity Rules and / or role permissions to prevent post-ship-confirm order edits (Section 5.13)
- Suspend the order in RapidReconciler if the variance is a known exception (e.g., confirmed cross-work-order GL summarization)

**Step 10 -- Document in RapidReconciler**

Add a note to the transaction in RapidReconciler documenting the root cause, corrective action taken, and the date. Mark as "Worked" once resolved.

---

## Section 8: Sub Type and Quick Lookup Reference

### 8.1 Sub Type Reference

RapidReconciler assigns a Sub Type to each unreconciled transaction on the Transactions page:

| Sub Type | Description |
|---|---|
| **Accounts** | Account number mismatch between F4111 and F0911 |
| **Periods** | Fiscal period mismatch between F4111 and F0911 |
| **Transfers** | ST/OT transfer order variance |
| **Intercompany** | Intercompany order variance |
| **Direct Ship** | Direct ship order variance |
| **Voucher Variance** | Variance on a voucher match transaction |
| **Vouchers** | GL-only voucher entry with no corresponding cardex |

### 8.2 Quick Lookup: Document Type × Sub Type → Processing Option to Check

Use the document type (from the Doc Header DT field) and Sub Type together to identify which program settings are the most likely cause. These are starting points for investigation -- confirm all settings in JD Edwards before drawing conclusions. Multiple versions of a program may be in use; verify which version processed the specific transaction.

**Inventory Programs**

| Doc Type | Sub Type | First Thing to Check | Program / Option |
|---|---|---|---|
| **II** | Accounts | Is Allow Entry of GL Account (PO 1) or Allow Override of GL Account (PO 2) enabled? Was a manual account entered for the 4124 offset side? | P4112 Process PO 1/2 |
| **II** | Accounts | Does the cost method (PO 3) differ from the item standard in F4105? Is AAI 4141 configured? | P4112 Process PO 3 |
| **IT** | Transfers / Accounts | Is this an interbranch transfer? Is PO 2 (Interbranch Transfer) set to generate entries on both sides? Do the From and To locations have different GL class codes? | P4113 Process PO 2 |
| **IT** | Accounts | Did PO 3 (Override Unit Cost) produce a 4141 variance? Do the From and To branch/plants use different AAI 4122/4124 configurations? | P4113 Process PO 3 |
| **IA** | Accounts | Is the item average cost (method 02)? Check UDC 40/AV (PO 3). Is PO 1 (Allow Entry of GL Account) enabled? | P4114 Process PO 1/3 |
| **IR** | Accounts | Do the From and To items have different GL class codes? Do they have different standard costs, generating a 4141 entry? Is PO 2 (Allow Override of Unit Cost) enabled? | P4116 Process PO 1/2 |
| **WK / WS** | Periods | Did the count update batch (R41413/R41610) run in a different period than the count entry date? Compare the GL Date option. | R41413 / R41610 GL Date |
| **IB** | Periods | Did R41052 (Future Cost Update) run near a period end? Compare the F4111 date to the F0911 GL date. | R41052 GL Date |
| **IB** | Accounts | Is AAI 4172 or 4174 misconfigured? Was the wrong From Cost Method specified? | R41052 Cost Method |
| **Any** | Accounts | Is Flexible Accounting active (XT4111Z1 enabled)? Is the DMAAI business unit left blank for all flexed AAIs? Check Integrity Report 0. | P40296 / F4096 |

**Purchasing Programs**

| Doc Type | Sub Type | First Thing to Check | Program / Option |
|---|---|---|---|
| **OV / OP** | Accounts | Does the receipt cost match the F4105 standard? If not, is AAI 4335 configured (4335 is not written to F4111 -- check F0911 Exp Acct)? | P4312 Process PO 1 (Cost Method) |
| **OV / OP** | Accounts | Is Material Burden (PO 5) enabled? Is AAI 4337 configured for the GL class code? Is Landed Cost at Receipt (PO 4) also enabled -- if so, disable one to avoid duplicate cost entries. | P4312 Process PO 4/5 |
| **OV / OP** | Periods | Is the GL Date (PO 2) set to use the PO promised date? Does the promised date fall in a prior period? | P4312 Process PO 2 |
| **PV** | Accounts | Is the Voucher Match Variance Account flag checked in the Line Type definition? Is AAI 4330 configured? Was AAI 4332 invoked (on-hand qty < qty vouchered)? | P4314 Process PO 1; Line Type |
| **PV** | Accounts | For foreign currency POs: is AAI 4340 (exchange rate variance) configured? 4340 is not written to F4111 -- confirm the F0911 Exp Acct entry is expected. | P4314 Process PO 3 |
| **PV** | Periods | Does the voucher GL date (PO 2) fall in a different period than the original receipt date? | P4314 Process PO 2 |
| **OV** | Accounts | Is this a standalone landed cost (P43214)? Is AAI 4385 configured for the correct GL class code? Was AAI 4332 also invoked (goods sold)? | P43214; AAI 4385 |
| **OV / OP** | Accounts (routing) | Is this a routing/movement transaction (P43250)? Is AAI 4365/4370 configured for every routing step? Was an item dispositioned off (AAI 4375)? | P43250 step configuration |

**Sales Programs**

| Doc Type | Sub Type | First Thing to Check | Program / Option |
|---|---|---|---|
| **RI / RR / RC** | Accounts | What is PO 5 (Business Unit Source) on the Defaults tab? Does the business unit in F0911 match what the AAI would produce for that branch/plant? This is the most impactful single option in R42800. | R42800 Defaults PO 5 |
| **RI / RR / RC** | Accounts | Does PO 3 (Cost of Goods Sold) use AAI 4220 or 4240? Is that AAI correctly configured for the item's GL class code? | R42800 Defaults PO 3 |
| **RI / RR / RC** | Accounts | Is A/R bypass (PO 2) enabled? Is AAI 4245 configured? Does the RC financial AAI match the customer's GL Distribution code in P03013? | R42800 Defaults PO 2 |
| **RI / RR / RC** | Periods | Is the GL Date (PO 1) set to use the invoice date? Does the invoice date fall in a prior period? | R42800 Defaults PO 1 |
| **RI / RR / RC** | Accounts | Is this an interbranch order? Is AAI 4260 configured for the GL class code? Are both P4210 and R42800 Update PO 1 set to enable interbranch? | R42800 Update PO 1; P4210 |
| **RI / RR / RC** | Accounts | Are Advanced Pricing adjustments attached? Is the GL class code populated in P4071 (Price Adjustment Definition)? Are both AAIs 4270 and 4280 configured? | P4071; AAIs 4270/4280 |
| **Any sales** | Accounts | Is Flexible Accounting active for R42800? Is the DMAAI business unit left blank for all flexed AAIs? Which R42800 version processed this order? Check the Print tab version setting. | R42800 version; P40296 |
| **Any sales** | Accounts | Does F41021 (Item Location) carry a different GL class code than F4102 (Item Branch) for this item? Sales transactions use F41021 -- check it directly. | F41021 vs. F4102 |

**Manufacturing Programs**

| Doc Type | Sub Type | First Thing to Check | Program / Option |
|---|---|---|---|
| **IM** | Accounts (credit) | Does the **component's** GL class code exist in AAI 3110? The credit side of IM uses component GL class codes -- check Section 7 (DMAAs) for each component's class code. | R31802A; AAI 3110 |
| **IM** | Accounts (debit) | Is AAI 3120 (WIP) configured for the **parent** item's GL class code? The debit side of IM uses the parent. | R31802A; AAI 3120 |
| **IM** | Periods | Did R31802A run in a different period than the material issue date? Check PO 1 (GL Date Source). | R31802A Process PO 1 |
| **IC** | Accounts | Are AAIs 3130 (Finished Goods debit) and 3120 (WIP credit) configured for the parent item's GL class code? Did R31802A (PO 3 Cost Method) match the method used in R31410 (Work Order Processing)? | R31802A Process PO 3; R31410 |
| **IC** | Periods | Did R31802A run in a different period than the completion date? | R31802A Process PO 1 |
| **IH** | Accounts | Is UDC 31/ER current for the employee who recorded the time? Does the rate match the expected work center rate? | R31422; UDC 31/ER |
| **IH** | Periods | Did R31422 (Hours and Quantities Update) run in a different period than the time entry date? | R31422 GL Date Source |
| **IS** | Accounts | Is AAI 3130 configured as a scrap account for the parent's GL class code? Is the scrap account separate from the finished goods account? | R31802A; AAI 3130 |
| **IV** | Accounts | Which variance type (AAIs 3220 / 3240 / 3260 / 3270 / 3280, plus 3210 Clear Work in Process on an actual-costing order) is misconfigured or missing? Was R31804 run before all IM/IH/IC transactions were fully processed? | R31804 Process PO 2/3; AAIs 3210–3280 |
| **IV** | Periods | Did R31804 run in a different period than the IM/IH/IC entries it is clearing? | R31804 Process PO 1 |
| **Any mfg** | Accounts | Does F41021 (Item Location) carry a different GL class code than F4102 (Item Branch) for the parent item or any component? Manufacturing journal entries use F41021 -- verify it directly. | F41021 vs. F4102 |
| **Any mfg** | Accounts | Is Work Center Efficiency enabled in Manufacturing Constants? Is AAI 3220 (Labor Efficiency) configured for all GL class codes in use? | Manufacturing Constants; AAI 3220 |

---

## Section 9: Document Type Reference

Common document types appearing in the Transaction Detail report:

| Document Type | Description |
|---|---|
| **OV** | Purchase order receipt (creates inventory debit via AAI 4310 and RNV credit via AAI 4320). A standard cost variance entry may appear in F0911 Exp Acct via AAI 4335 — this is not written to F4111 and is expected. For account mismatches, check P4312 PO 1 (Cost Method) — if the receipt cost differs from the F4105 standard, the variance posts to 4335; a misconfigured 4335 can produce an unexpected account. For period mismatches, check P4312 PO 2 (GL Date) — if set to use the PO promised date, a receipt may post to a prior period. |
| **PV** | Voucher match (clears RNV; creates A/P credit). Purchase price variances post to AAI 4330 only if the Voucher Match Variance Account flag is checked in both the Line Type definition **and** P4314 PO 1 — both must be set. AAI 4332 (goods sold prior to match) and AAI 4340 (exchange rate variance) are not written to F4111 and produce expected GL-only entries in F0911 Exp Acct. For period mismatches, check P4314 PO 2 (GL Date). |
| **PD** | A/P payment. Should not normally appear in the inventory account. |
| **IM** | Inventory issue (material issue to work order). GL entries are created by Manufacturing Accounting (R31802A) and are typically assigned a **different document number** than the cardex -- this is normal. A single F0911 entry for an IM document may represent costs from multiple material issues processed in the same R31802A run. Before concluding a GL entry is missing or excess, query F0911 for the GL document number across all order numbers. See Section 4 and Section 5.12. The credit side uses **component** GL class codes (AAI 3110); the debit side uses the **parent** GL class code (AAI 3120) — this split is the most common source of IM misdiagnosis. |
| **IA** | Inventory adjustment (P4114). For account mismatches, check whether PO 1 (Allow Entry of GL Account) is enabled — if so, the operator manually entered the 4124 offset account. For average cost items, check whether UDC 40/AV is correctly configured (PO 3). |
| **IT** | Inventory transfer (P4113). Single-sided IT transfers (where both sides net in the same account) are expected for certain configurations. For interbranch transfers, check PO 2 (Interbranch Transfer) — if not set to generate interbranch entries, only the issuing branch receives a GL entry. |
| **II** | Inventory issue (P4112). For account mismatches, check whether PO 1 (Allow Entry of GL Account) or PO 2 (Allow Override) is enabled — an operator-entered account overrides the AAI entirely, writing different accounts to F4111 and F0911. |
| **IC** | Work order completion to finished goods inventory. The GL entry for IC transactions is created by Manufacturing Accounting (R31802A) and is typically assigned a **different document number** than the cardex -- this is normal. If F4111 contains two rows for the same IC document: (1) one completion row and one "Standard Cost Change" row with zero quantity -- a standard cost was updated after the completion posted without a corresponding GL revaluation; see Section 5.9 Variant A. (2) two completion rows with identical comments and non-zero quantities -- the work order was completed in two batches and the second batch's GL entry may be under a different document number; see Section 5.9 Variant B. |
| **IH** | Manufacturing accounting journal entry for labor (R31422). GL entries may be summarized across multiple work orders -- see Section 4. For account mismatches, check UDC 31/ER for the employee's labor rate — if missing or incorrect, the IH entry will be calculated at the wrong rate. |
| **IB** | Inventory balance adjustment. Covers zero balance adjustments, Re-Roll operations, and **inventory cost changes (P4105 manual cost revision)**. When the comment reads "Inventory Cost Change," check AAIs 4134 and 4136 for the net zero pattern described in Section 5.10. For future cost update entries from R41052, check the From Cost Method setting (wrong source method means the revaluation starting value is incorrect) and the GL Date setting (running near a period end can cause a period mismatch). |
| **ST** | Transfer order sales (shipment) |
| **OT** | Transfer order purchase (receipt) |
| **SI** | Intercompany sales order |
| **SK** | Intercompany sales (inter-branch). Under document type `JS` this leg ties on document number plus batch; confirmed to the penny on every row of a specimen population. Do not assume `JS` cannot be matched per document until you have split the population by order type |
| **OK** | Intercompany purchase order |
| **CO** / **CW** / **C2** | Sales order types in the `C` family. On one company they sit in a block of eight (`C2`, `C3`, `C5`, `C6`, `C7`, `CO`, `CR`, `CW`) configured identically in AAIs 4220 and 4240, and their orders carry both stock lines (line type `S`, inventory interface `Y`) and carton-charge lines (line type `CC`, inventory interface `N`). **Their UDC `00/DT` descriptions are not in the RapidReconciler database** -- there is no `F0005` extract, so read the name in JD Edwards if you need it. What matters for reconciliation is the AAI routing, not the name: see Section 5.23 |
| **SA** | Standard sales order. Under document type `JS`, `SA` lines issued out of sample or lab locations (`SAMPDESP`, `SAMPWIP`, `SAMPRACK*`, `LABWIP`, `CLEANROOM`) relieve inventory value and post **no GL line**. High row count, low value. The order type is the first indication these are samples shipped at no charge; **a price of zero on every line confirms it**, and the cost of the sample belongs in cost of goods sold. See Section 5.22 |
| **SP** | Sales order type appearing under `JS` alongside `SA` and `SK`, including returns (`B4RRETURN` and similar return locations). Substantially matched on document plus batch in the observed population, with a small unmatched remainder that Section 5.22 does not explain |
| **JS** | Sales order shipment (cost-of-sales entry). **Read the order type before diagnosing a JS document.** One JS population routinely spans several order types with different accounting behaviour -- on a specimen database, `SK` (intercompany inter-branch) ties 100% on document plus batch, while `SA` sample and lab issues relieve the cardex and post no GL line at all. Diagnosing at document-type grain averages them and is wrong for every subgroup. See Section 5.22. The standard cost change after shipment pattern seen on IC transactions can also occur on JS -- if a second F4111 row appears with zero quantity and comment "Standard Cost Change," the GL revaluation entry is missing. See Section 5.9. |
| **RI** | Sales invoice / shipment. Covers standard SO and direct ship S6 order types. For account mismatches, R42800 PO 5 (Business Unit Source) is the most common cause — it controls where the business unit portion of the GL account is sourced from and a wrong setting affects all sales entries in that version. For period mismatches, check R42800 PO 1 (GL Date). If F0911 Comment reads "Non stock line in Inv acct," a non-stock line type (N, F, or similar) posted to the inventory account -- investigate line type definition. Lines showing GL date 2000-01-01 and document 0 were never processed through Sales Update. |
| **RM** | Sales return / credit memo. If the batch type is **IB** rather than I, the return was processed via a manual correction batch that posted to the inventory account without writing a cardex record -- this produces a GL-only variance. Investigate who created the IB batch and whether the inventory account coding is correct. |

---

## Section 10: JDE Status Code Reference

Several patterns (5.6, 5.9, 5.13, 5.15, 5.16) branch on the order or work-order status of the document being analyzed. Statuses live in **three separate UDC tables**, one per order type, each with its own canonical range and its own field on the source record. Status codes are **user-defined per shop's Order Activity Rules** (P40204 for purchasing, P40203 for sales, P98012 for work orders) -- the canonical values below are the JDE standard but customer-specific overrides are common.

### 10.1 Work Order Statuses (UDC 00/SS)

Stored on **F4801** (Work Order Header). Field names: `WrStts` (last status) and `NxtSts` (next status). Range: typically **two-digit values 10-99**.

| Status | Description | Meaning |
|---|---|---|
| **10** | Entered | WO created but not approved |
| **20** | Approved | Ready for planning |
| **30** | Planned | Material / capacity planning complete |
| **40** | Firm Planned | Frozen for scheduling |
| **50** | Released | Available to shop floor -- controls when inventory can be issued |
| **60** | Parts List / Routing Complete | Pick lists and routing ready |
| **70** | In Process | Production started |
| **80** | Completed | Quantity completed -- controls completions to inventory |
| **90** | Closed | Accounting complete -- prevents further transactions; R30837 will not revalue |
| **99** | Cancelled | WO voided / cancelled |

More detailed implementations may also use intermediate values: 15 (Awaiting Approval), 25 (MRP Planned), 45 (Scheduled), 55 (Picked), 65 (Started), 85 (Production Complete), 95 (Financial Close).

> **Important for Patterns 5.6 / 5.15 / 5.16:** **R30837 (WIP Revaluation) will not revalue a work order at the Closed status (typically 90).** When a Standard Cost Change orphan is detected and the WO is already closed, the only correction path is a manual JE -- the cardex revaluation is permanent at that point. If the WO is still open (any status below the customer's Closed value), R30837 can be re-run after the AAI / config fix to catch the orphan automatically.

### 10.2 Sales Order Statuses (UDC 40/AT)

Stored on **F4211** (Sales Order Detail) and **F4201** (Sales Order Header). Field names: `LSTS` (last status) and `NXTR` (next status). Range: typically **three-digit values 500-999**.

| Status | Description | Meaning |
|---|---|---|
| **500** | Quote | Quote stage, not a firm order |
| **510** | Blanket Order | Open blanket / contract order |
| **520** | Order Entry | Order created |
| **525** | Credit Check | Awaiting credit approval |
| **530** | Allocation | Inventory allocated |
| **540** | Print Pick Slip | Ready for warehouse |
| **560** | Warehouse Pick | Items picked |
| **580** | Shipment Confirmation | Shipped -- F4111 cardex written |
| **600** | Shipped | Shipment confirmed |
| **620** | Sales Update / Invoiced | R42800 ran; F0911 written |
| **999** | Closed | Fully complete -- no further processing |

> **Important for Pattern 5.13 (Post-Confirm Order Edit):** the analyzer's stock-line check uses **NxtSts &ge; 540** to identify ship-confirmed lines. When NxtSts is at the Closed value (typically 999) and the F4211 qty exceeds the F4111-captured qty, the order line was edited after ship-confirm. Lines with NxtSts &lt; 540 are still in-flight and don't trigger Pattern 5.13.

### 10.3 Purchase Order Statuses (UDC 40/AT for PO)

Stored on **F4311** (Purchase Order Detail) and **F4301** (Purchase Order Header). Field names: `LSTS` (last status) and `NXTR` (next status). Range: typically **three-digit values 200-999**.

| Status | Description | Meaning |
|---|---|---|
| **200** | Requisition | Requisition stage |
| **220** | PO Entry | PO created |
| **230** | Approval | Approved for purchasing |
| **260** | Budget Check | Awaiting budget approval |
| **280** | Print PO | PO printed / sent to vendor |
| **400** | Partially Received | Some receipts completed |
| **420** | Fully Received | All quantities received |
| **430** | Voucher Match | A/P voucher created |
| **999** | Closed | Order closed |

> **Important for OV / PV doc types:** an OV (PO Receipt -- P4312) advances the line from a pre-receipt status (e.g. 280) to a post-receipt status (e.g. 400). A PV (Voucher Match -- P4314) advances it further to 430 / 999. The doc type on F4111 / F0911 rows tells you which event posted; the order line's NxtSts tells you where the line is in the cycle. Reconciling against the wrong stage of the cycle is a frequent source of "missing GL" diagnoses that are actually "GL hasn't fired yet."

### 10.4 Order Activity Rules

Each order type has its own configuration of allowed status transitions:

| Program | Order Type | UDC | Header / Detail |
|---|---|---|---|
| **P40203** | Sales Order Activity Rules | 40/AT | F4201 / F4211 |
| **P40204** | Purchase Order Activity Rules | 40/AT | F4301 / F4311 |
| **P98012** | Work Order Activity Rules | 00/SS | F4801 |

When a customer's statuses diverge from the JDE standard (e.g. a custom "550 -- Quality Hold" inserted between Pick Slip and Pick Confirmed), the analyzer's hard-coded status comparisons in Patterns 5.13, 5.6, 5.15, 5.16 should still work because the comparisons are **inequalities** against the canonical Closed value, not exact-status matches. The exception: a customer who uses a non-standard Closed value for any order type. If a shop closes work orders at status `95` instead of `90`, the WO-Closed branch in Pattern 5.6 / 5.16 needs to be configured to that shop's value -- otherwise the analyzer will recommend the "WO still open, R30837 re-run viable" path on an effectively-closed WO.

---

## Section 11: Manufacturing Cost Programs Reference

Patterns 5.6 / 5.9 / 5.15 / 5.16 reference several JDE programs in their explanation and resolution prose. The canonical role of each:

| Program | Role | When it runs | Tables it writes |
|---|---|---|---|
| **P4312** | PO Receipts (interactive) | Receipt entry against an open PO line | F43121, **F4111** (inventory at frozen std + separate "Standard Cost Change" row for the variance when receipt price differs from frozen std), F0911 (inventory Dr / RNV Cr; variance to AAI 4335 when configured) |
| **P4314** | Voucher Match (interactive) | Voucher entry against received PO lines | F43121, F0911 (RNV Dr / A/P Cr; PPV via AAI 4330 when applicable). Does NOT write to F4111 under standard cost; **does** write F4111 revaluation under weighted average. |
| **R30812** | Cost Rollup | Manual / batch | F30026 (cost components — simulated) |
| **R30835** | Cost Simulation | Manual / batch | F30026 (simulated cost values; preview only -- does not freeze) |
| **R30822** | Frozen Cost Update | Manual / batch (typically scheduled) | F4105 (writes the new frozen std cost over the prior value). Does NOT directly post F4111 or F0911 by itself -- the cardex + GL revaluation is the job of **R30837**. |
| **R30837** | WIP Revaluation | Run after R30822 (or after late labor / material on actual-cost WOs) | F4111 (Standard Cost Change rows for affected items) + F0911 (matching GL entries through AAI 3240 / 3260). Primarily an **actual-costing** tool (methods 02 / 09); under standard costing it's an optional revaluation control rather than an automatic step in the cycle. Skips work orders that have reached their Closed status. |
| **R31802A** | Manufacturing Accounting | Run after WO completion | F4111 (cardex rows for completion, scrap, issues), F0911 (GL through AAIs 3110 / 3120 / 3130 / 3401). The variance AAIs (3210 / 3220 / 3240 / 3260 / 3270 / 3280) belong to **R31804**, not to this program. |
| **P3102** | Production Cost Inquiry | Interactive (review only) | Read-only |

**Diagnosis implication for the "Standard Cost Change" F4111 row signature:**

- **OV doc context (PO Receipt):** the row was written by **P4312** at receipt time, splitting the receipt into inventory-at-frozen-standard plus a variance entry. The variance should also appear in F0911 routed through AAI 4335 (PPV). If F4111 has the row but F0911 doesn't, the cause is in P4312's accounting -- typically AAI 4335 isn't configured for the routing or the receipt's processing options suppressed the GL write. **Pattern 5.6 does NOT fire on OV docs** -- this is expected P4312 behavior with a separate variance leg.
- **IC doc context (WO Completion):** the row was written by **R30837** after R30822 changed the frozen standard. R30837 normally writes both the F4111 row AND the matching F0911 entry. If F4111 has the row but F0911 doesn't, R30837 partially fired -- the GL side failed because of AAI 3240 / 3260 configuration, a Closed-status WO (R30837 skips closed WOs in UDC 00/SS, typically `90`), or processing-options gap. **Pattern 5.6 fires on IC docs only.**

Mixing these up was a real cause of misdiagnosis in earlier analyzer iterations -- the F4111 row looks identical in both contexts but the corrective program and accounting expectation are different.

