# Transaction Detail Analysis Guide

## RapidReconciler Inventory -- Transaction Detail Report Reference

---

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
| Cardex-only entry | LedgerAmount = 0, CardexAmount has a value | Unposted batch; cardex written but GL not updated |
| Partial cardex-only entry | Both totals are non-zero but unequal; one or more RR Summary rows show LedgerAmount = $0.00 for a specific batch/account | A single line item within an otherwise-posted batch has no GL counterpart -- see Section 5.3 |
| GL-excess entry | Both totals are non-zero but unequal; the GL amount for a specific account and batch exceeds the corresponding cardex; net variance is positive | GL entry is a summarized manufacturing posting spanning multiple work orders; manual journal entry miscoded to inventory; cardex row excluded from report -- see Sections 4.11 and 4.12 |

### Manufacturing Accounting GL Summarization (IC, IM, IH Transactions)

R31802A (Manufacturing Accounting) summarizes GL postings for work order transactions. A single F0911 entry may represent costs from multiple work orders, multiple completion batches, or multiple material issue documents processed in the same run. The GL document number in F0911 for IC, IM, and IH transactions is therefore almost always different from the cardex document number -- and a single GL entry may be larger than any individual cardex row because it covers activity from other work orders not shown in this report.

**Implication for RapidReconciler matching:** RapidReconciler matches on the batch number, not the GL document number. For manufacturing transactions, always verify the scope of an F0911 entry by querying F0911 for the GL document number across all order numbers before concluding that a GL entry is erroneous or missing.

**Applies to:** IC (work order completion), IM (material issue to work order), IH (manufacturing accounting journal entry). Does not apply to standard inventory transactions (IA, IT, II, IB).

**How to verify the scope of a GL entry:**
1. Note the GL document number in the F0911 Inv Acct section.
2. Query F0911 for that GL document number with no other filters.
3. If the GL document number references multiple order numbers or subledgers, the entry is a summarized posting -- the variance is attributable to the combination of all work orders, and RapidReconciler will reflect the full variance across all affected transaction records.

**Cross-work-order GL excess — specific pattern for IM transactions:**

When an IM document shows a GL-excess pattern (F0911 exceeds F4111 for a specific GL class and batch) and all other GL class / batch combinations on the same document reconcile cleanly, this is a strong indicator that R31802A captured component costs from other work orders processed in the same run and posted them to the same GL account and batch as this document. The excess belongs to those other work orders — not to a posting error on this document. See Section 5.12 for the full investigation procedure.

---

## Section 5: Common Variance Patterns and Root Causes

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

When a work order completion is processed, the cardex is written at the current standard cost. If the standard cost is subsequently updated via R30835 (Frozen Standard Update) **after** the completion has already posted, JD Edwards writes a second cardex row to revalue the completed inventory to the new standard. However, if WIP Revaluation (R30837) was not configured to run -- or was not called from R30835 -- the corresponding GL journal entry is never created, leaving the cardex revaluation with no GL counterpart.

The GL document number mismatch (e.g., cardex shows doc 545031 but GL shows 566580) is **normal behavior** for IC transactions -- Manufacturing Accounting (R31802A) summarizes multiple work order transactions into a single GL document. This is not the cause of the variance but can cause confusion when tracing the transaction.

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| R30837 (WIP Revaluation) not run after standard cost update | F4111 Row 2 shows "Standard Cost Change" with no matching GL entry; variance amount matches Row 2 exactly | Post a manual journal entry: debit inventory account for the variance amount; credit the appropriate variance account (AAI 3260 Planned Variance or 3240 Material Variance). Review WIP Revaluation configuration to prevent recurrence. |
| R30837 run but work order was already closed at status 999 | Work order NxtSts = 999; R30837 does not revalue closed work orders | Same journal entry resolution. Note: R30837 only revalues open work orders -- closed work orders require manual correction. |

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
| **IV** | Accounts | Which variance type (AAIs 3220–3280) is misconfigured or missing? Was R31804 run before all IM/IH/IC transactions were fully processed? | R31804 Process PO 2/3; AAIs 3220–3280 |
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
| **SK** | Intercompany sales (inter-branch) |
| **OK** | Intercompany purchase order |
| **JS** | Sales order shipment (cost-of-sales entry). The same standard cost change after shipment pattern seen on IC transactions can occur on JS -- if a second F4111 row appears with zero quantity and comment "Standard Cost Change," the GL revaluation entry is missing. See Section 5.9. |
| **RI** | Sales invoice / shipment. Covers standard SO and direct ship S6 order types. For account mismatches, R42800 PO 5 (Business Unit Source) is the most common cause — it controls where the business unit portion of the GL account is sourced from and a wrong setting affects all sales entries in that version. For period mismatches, check R42800 PO 1 (GL Date). If F0911 Comment reads "Non stock line in Inv acct," a non-stock line type (N, F, or similar) posted to the inventory account -- investigate line type definition. Lines showing GL date 2000-01-01 and document 0 were never processed through Sales Update. |
| **RM** | Sales return / credit memo. If the batch type is **IB** rather than I, the return was processed via a manual correction batch that posted to the inventory account without writing a cardex record -- this produces a GL-only variance. Investigate who created the IB batch and whether the inventory account coding is correct. |

---

## Section 10: Related Documentation

- [Inventory: Using the Application](../MDS/inventory-using-application.md)
- [DMAAI Reference Guide](../MDS/distribution-aais.md)
- [GL Class Code Management Guide](../MDS/gl-class-code-changes.md)
- [Item Ledger and Cardex Analysis Guide](../MDS/item-ledger-faq.md)
- [Zero Balance Adjustments Guide](../MDS/zero-balance-adjustments.md)
- [Cardex Integrity Variance Guide](../MDS/cardex_variance.md)
- [Purchase Order Reference Guide](../MDS/purchase_order_reference.md)
- [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md)

---

