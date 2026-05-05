# End of Day Analysis Guide

## RapidReconciler — End of Day Variance Report Reference

---

## Section 1: Using Claude for Automated Analysis

Claude can perform a full End of Day variance analysis automatically and return an updated `.xlsx` workbook with the multi-finding analysis written to a card-layout sheet, the source sheet equipped with AutoFilter and freeze panes, and findings categorized by priority. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`end-of-day-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The End of Day report (`.xlsx`)

Then use the following prompt:

> *"Analyze this file using the End of Day Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the multi-finding analysis sheet."*

Claude will read both documents, work through the analysis procedure against the Excel data, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent End of Day reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **End of Day-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Multi-Finding, period-end report.** Each finding catalogues a class of pending transactions awaiting resolution before close; there is often a meaningful aggregate dollar variance.

**File naming** (formatting spec, Section 1): `End of Day Analysis {YYYY-MM-DD}.xlsx`. Use the period being closed (most recent PeriodEnds value in the export) — End of Day is a period-end report.

**Source sheet name:** `End of Day`. **Sorting is not required** for analysis correctness, but if the export's native order obscures the chronological reading of aging, sort ascending by PeriodEnds and then TransDate. Apply AutoFilter on the header row and freeze panes per the formatting spec.

**Headline anchor** (formatting spec, Section 4): period being closed.

> `End of Day Variance — Period Ending {YYYY-MM-DD}`

If the report is being run against historical data (the most recent PeriodEnds is older than the current calendar period), include the analysis date in the secondary context strip: `Generated {date} (against data through {period end})`.

**Subline** (formatting spec, Section 5.3): the aggregate net variance and a count of findings, e.g., `${X} net variance — {N} findings across {M} companies, {K} rows`.

**Secondary context strip** (formatting spec, Section 5.4) carries: companies in scope, transaction type breakdown (Sales / Mfg / Voucher Match counts), and total row count.

**Issue Summary table** (formatting spec, Section 7.1): one row per distinct finding, sorted by priority. Columns: Issue label, Scope (companies / transaction types), Detail (row counts, age range, dollar magnitude), Rows count, Priority badge.

**Finding cards** (formatting spec, Section 7.2): one card per finding type. Typical findings for End of Day:

- `Sales Backlog — R42800 not run` (status combinations 540/580 in the current period)
- `Sales — Aged Sales Orders` (status 580 with age > 7 days)
- `Manufacturing — Prior Period Work Orders` (status outside normal range, or PeriodEnds before the current period)
- `Manufacturing — Status 90 Not Yet Costed` (active work orders in current period at status 90)
- `Voucher Match — Error Type` (TransDate of 2000-01-01 with non-zero net amount)
- `Voucher Match — Net Zero Pairs` (TransDate of 2000-01-01 with paired rows that net to zero — informational)

Each card has the standard Scope / Pattern / Resolution sub-fields. **Do not use a "Root Cause" sub-field** — End of Day is a snapshot of pending work; the Pattern field characterizes what the data shows.

**Priority assignment** (formatting spec, Section 9.3, rule-based by age + status):

| Priority | Conditions |
|---|---|
| **P1** | Outside normal status range; OR PeriodEnds before the current period; OR age > 14 days; OR voucher-match error type with non-zero net amount |
| **P2** | Normal status range with age 7-13 days; OR Mfg status 90 in current period; OR voucher-match net-zero pairs from a prior period |
| **P3** | Normal status range with age 0-6 days; OR voucher-match net-zero pairs in current period (informational) |

Compute the priority for each row before grouping into findings. Findings are then bucketed by priority in the Issue Summary table.

**Sub-tables** (formatting spec, Section 7.3): not typically used in End of Day — readers filter the source sheet by transaction type and status to see specific subsets. The Issue Summary table provides the at-a-glance breakdown.

**Action Plan** (formatting spec, Section 7.4): in execution order. Typical sequence:

1. Resolve P1 voucher-match errors first — they block period close.
2. Run R42800 (Sales Update) for any unposted sales backlog.
3. Investigate aged work orders — confirm whether they should be closed, voided, or carried forward.
4. Process current-period activity per normal end-of-day workflow.
5. Re-run the End of Day report after corrections to confirm findings have cleared.
6. Do not post period-close journal entries until net variance is at expected levels.

The final action (period-close gate) is mandatory for any End of Day analysis.

**Source sheet handling** (formatting spec, Section 10): **Pattern A — no highlights, AutoFilter only** for typical exports (>30 rows). For very small exports (≤30 rows) where each row clearly belongs to one finding, **Pattern B — highlight all rows by issue type** is acceptable.

### 1.4 Notes and Limitations

- Claude analyzes the data as exported. If the report was generated with account or company filters applied, the analysis reflects only the visible rows.
- Prior-period items are identified by comparing PeriodEnds values within the export. Claude flags any PeriodEnds that differs from the most common value in the file.
- Work order status interpretation uses the full status code table in Section 3.2 of this guide.
- Floating-point precision artifacts in amounts are rounded to two decimal places throughout.
- Claude cannot access JD Edwards to confirm work order details, check R42800 run history, or verify voucher match status. These are flagged as investigation steps inside the Resolution sub-field of the relevant Finding card.
- For exports with more than 100 rows, consider noting the specific companies or date ranges of interest in the prompt to focus the analysis.

---

## Overview

Entries on the End Of Day report originate from the cardex (F4111) but have not yet been matched to a general ledger entry (F0911). It provides visibility into transactions that have occurred in the item ledger but do not have a batch number populated. This is typically because the batch program responsible for creating the GL entry has not yet run.

End of Day is one of the four sources of variance on the RapidReconciler Reconciliation page. Until this variance reaches zero, the perpetual balance and the GL balance will not agree — and the GL balance in F0902 is understated relative to the item ledger.

> **Who should use this guide:** JD Edwards cost accountants, inventory accountants, and operations staff responsible for investigating and resolving End of Day variances in RapidReconciler.

> **Important:** All corrections are made in JD Edwards. RapidReconciler displays the End of Day variance for visibility but does not modify JD Edwards data.

---

## Section 2: What Is an End of Day Transaction?

In JD Edwards EnterpriseOne, most inventory transactions update both the item ledger (F4111) and the general ledger (F0911) simultaneously. End of Day transactions are the exceptions — they update F4111 immediately but defer the GL update to a batch program that runs later, typically overnight.

**Three transaction types are End of Day by nature:**

| Transaction | What Defers the GL | Batch Program | Typical Schedule |
|---|---|---|---|
| **Sales shipment / invoice** | Ship confirmation (P4205) or Sales Order Entry updates F4111 immediately | Sales Update (R42800) | Nightly |
| **Work order material issue and completion** | Inventory Issues (P31113) and Completions (P31114) update F4111 immediately | Manufacturing Accounting (R31802A) | Nightly |
| **Voucher match** | The voucher match process creates an F4111 record that is not finalized until the match completes | Voucher Match (P4314 / P0411) | Interactive or nightly |

Until the applicable batch program runs, RapidReconciler has a cardex amount but no GL amount for these transactions — this is reported as End of Day variance.

**Key principle:** An End of Day variance is not an error. It is an expected gap between the real-time item ledger and the batch-updated GL. The question is always: *how old is it, and why hasn't the batch run?*

---

## Section 3: End of Day by Transaction Type

### 3.1 Sales — R42800 (Sales Update)

Sales Update (R42800) is the final step in the sales order process. It creates GL entries in F0911 and AR records in F0311, and advances the sales order to status 999.

**End of Day behavior:**

- Ship confirmation (P4205) writes the F4111 cardex record immediately
- The GL entry (F0911) is not created until R42800 runs
- The cardex entry carries no GL date or batch number until R42800 processes it

> **Ship confirmation vs. Sales Update:** Whether cardex is written at ship confirm or Sales Update depends on whether the order type is in UDC table **40/IU**. If it is, cardex is written at ship confirmation and the document number is later updated to the invoice number when R42800 runs. If it is not, cardex is written by Sales Update with the invoice number directly. Both paths produce the same End of Day gap — no GL entry until R42800 runs.

**Key indicators in the End of Day report:**

| Field | What to Look For |
|---|---|
| **Type** | `Sales` |
| **OrderType** | SO (standard sales order), SI (intercompany sales), SF (freight) |
| **DocType** | SO, SI, SF — document type matches order type for unprocessed orders |
| **Status** | 580–620 is normal (awaiting Sales Update); 999 means fully closed — should not appear |
| **TransactionDate** | Should be recent; dates older than 2 days require investigation |

**What causes Sales End of Day to accumulate:**
- R42800 did not run for a scheduled period
- R42800 ran but encountered errors and stopped mid-processing
- Orders are on hold and cannot be invoiced (Hold Invoice flag in customer master)
- Wrong R42800 version used — the version that assumes an invoice number exists was run against orders that have not yet been invoiced, or vice versa
- GL Interface flag not set in the order line type or Branch/Plant Constants — R42800 ran but did not create GL entries

**R42800 version selection:**

| Version Type | When to Use | Data Selection |
|---|---|---|
| **Standard (invoice assigned)** | Order has been through Invoice Print (P42565) — a document number and type exist in F4211 | Invoice NE \*BLANKS |
| **Assign Invoice No.** | Order has not been through Invoice Print — no invoice number yet | \*ALL except Invoice Date NE \*ZEROS |

> **Important:** Running the wrong version produces multiple F0311 and F0911 records or none at all. Always confirm which version applies before running R42800 for a backlog.

**Batch types created by R42800:**

| Scenario | Batch Type(s) |
|---|---|
| Standard run | **I-batch** (all entries) |
| Summarizing inventory/COGS to separate batch (PO 12 = 1) | **I-batch** (sales) + **G-batch** (inventory/COGS) |
| Interbranch — no A/R and A/P batches | **I-batch** + **ST batch** |
| Interbranch — creating A/R and A/P batches (PO 26 = 1) | **I-batch** + **V batch** |

**Proof vs. final mode:**

Always run R42800 in proof mode first when processing a backlog. Proof mode generates the Invoice Journal report and identifies errors without updating any files or advancing statuses. Final mode is irreversible — it advances orders to status 999 and posts records to F0311, F0911, and F4111.

**Common R42800 error codes:**

| Error | Cause | Resolution |
|---|---|---|
| **0028 / 0381** | AAI not configured, or account not in chart of accounts | Add the missing AAI; verify account exists and has correct posting edit code |
| **1837** | Hold Invoice flag set to Y in Customer Master | Change Hold Invoice flag to N on the customer record |
| **0002** | Line did not advance to status 999, or invoice already processed | Reset status to 999 or correct the duplicate pay item on the F0311 record |
| **0272** | Tax Rate/Area not set up, or missing Tax Explanation Code | Verify Tax Rate/Area setup and effective dates |
| **1829** | RT AAI not set up — validated even for exempt/non-taxable orders | Set up the RT AAI using the GL Class Code from the Tax Rate/Area GL Offset |
| **0065** | Fiscal date pattern issue — GL date falls outside open period | Check fiscal date pattern; confirm prior period posting is allowed if needed |
| **3490** | Address Book number valid but no Customer Master record | Add the Customer Master record |

> **R42800 stopped mid-processing:** If R42800 stops mid-run, identify the problem F4211 record from the job log. Verify which records were fully processed before the stop — files updated before the stop may need to be reviewed for partial updates. Clean up the problem record and rerun.

### 3.2 Manufacturing — R31802A (Manufacturing Accounting)

Manufacturing Accounting (R31802A) creates GL entries for material issues (IM), labor (IH), completions (IC), and scrap (IS). Until R31802A runs in final mode for a work order, all of these transactions exist only in F4111.

**End of Day behavior:**

- P31113 (Issues) and P31114 (Completions) write F4111 records immediately
- R31422 (Hours Update) writes IH records to F4111
- None of these create F0911 entries — that is R31802A's job
- R31802A can only be run once per work order in final mode

**Manufacturing cost flow:**

```
Raw Material Inventory (AAI 3110)
        ↓  Material Issues (IM) — credit component inventory, debit WIP
Work In Process / WIP (AAI 3120)
        ↑  Labor and Overhead (IH) — debit WIP, credit Payroll Accrual (3401)
        ↓  Completions (IC) and Scrap (IS) — debit Finished Goods (3130), credit WIP
Finished Goods Inventory (AAI 3130)
        ↓  Sales Update (R42800)
Cost of Goods Sold
```

**Key indicators in the End of Day report:**

| Field | What to Look For |
|---|---|
| **Type** | `Mfg` |
| **OrderType** | WO, WS, WD, WR, WT, WC — work order type codes |
| **DocType** | IM (material issue), IC (completion), IH (labor), IS (scrap) |
| **Status** | Work order status. 90/95 = ready for or processed by R31802A; 45/50 = still in process; ER = error |
| **TransactionDate** | Should match recent manufacturing activity; dates in prior periods are critical |
| **PeriodEnds** | If this differs from the current period, the transaction is from a prior period — escalate immediately |

**Full work order status code reference:**

| Status | Description | Set By | End of Day Implication |
|---|---|---|---|
| **00** | Entered | Work Order Entry (P48013) | Order exists; no material or cost data attached |
| **10** | Frozen | Work Order Processing (R31410) | Frozen standard and planned cost locked to the order |
| **20** | In Queue | Scheduling | Order waiting to begin |
| **30** | In Process | Time Entry / Completions | Active manufacturing; issues and labor entries allowed |
| **40** | Partially Completed | Completions (P31114) | Some quantity completed; work order still open |
| **50** | Pending Close — Labor Complete | Manual | Labor complete; pending final review |
| **60** | Pending Close — Material Reconciled | Manual | Material matches planned; pending final review |
| **90** | Complete | Manual / Completion program | All manufacturing done; ready for R31802A |
| **95** | Manufacturing Accounting Complete | R31802A | R31802A has run; GL entries exist for all IM, IH, IC transactions |
| **97** | Variance Accounted | R31804 | Variance accounting complete; WIP cleared to zero |
| **99 / 999** | Closed | R31804 or manual | Fully closed; no further processing allowed |

> **Frozen standards are locked at status 10.** Changes to BOM, routing, or item costs after R31410 runs do not update the work order — they produce engineering and planned variances at R31804 (status 97).

**GL class code rule — critical for diagnosis:**

| Transaction | Side | GL Class Code Source |
|---|---|---|
| **IM — Material Issue** | Credit (reducing raw material) | GL class code of each **individual component** (from F41021) |
| **IM — Material Issue** | Debit (adding to WIP) | GL class code of the **parent item** (from F41021) |
| **IH — Labor** | Both sides | GL class code of the **parent item** |
| **IC — Completion** | Both sides | GL class code of the **parent item** |
| **IS — Scrap** | Both sides | GL class code of the **parent item** |

> **F41021 vs. F4102:** GL class codes are sourced from the **Item Location table (F41021)**, not the Item Branch table (F4102). JD Edwards allows these to differ without warning. If they carry different values, manufacturing transactions post to a different account than expected. Run Integrity Report 5 in RapidReconciler to identify mismatches.

**R31802A GL summarization:**

R31802A summarizes GL entries by account within its run. A single F0911 entry for a given account and batch may reflect costs from **multiple work orders** processed in the same R31802A run. The GL document number in F0911 will differ from the cardex document number — this is normal. When investigating an apparent GL excess on an IM transaction, always query F0911 for the GL document number across all order numbers before concluding a variance exists. See Section 6.3 for the cross-work-order pattern.

**Pre-close checks before running R31802A:**

Before running R31802A for work orders at status 90, perform both checks. Skipping either can produce permanent variances that require manual journal entries to correct.

| Check | Program | What to Verify |
|---|---|---|
| **Material reconciliation** | Inventory Issues (P31113) | Quantity Ordered should equal Quantity Issued. Document any valid variances (e.g., component scrap) in the Remarks field before proceeding. |
| **Hours reconciliation** | Order Hour Status (P31121) | Actual machine, labor, and setup hours should be close to standard hours. Investigate differences before running R31802A. |

**Manufacturing Constants settings that affect End of Day:**

| Setting | Impact |
|---|---|
| **Work Center Efficiency** | If enabled, R31802A creates separate labor efficiency variance entries to AAI 3220. If AAI 3220 is not configured for all parent GL class codes in use, R31802A will error and the W batch will not be created — all IM, IH, IC entries remain in End of Day. |
| **GL Date Source (R31802A PO 1)** | Controls whether F0911 entries use the work order completion date or the R31802A run date. If set to run date, all work orders processed on the same day share the same GL date and batch, increasing the likelihood of cross-work-order GL summarization. |
| **Accounting Cost Quantity (ACQ)** | Determines setup cost per unit. Default of 1 overstates setup cost for all but single-unit work orders — producing systematic setup variances that can obscure genuine issues. |

**Work order status codes relevant to End of Day:**

| Status | End of Day Implication |
|---|---|
| **45 / 50** | Work order is still active or pending close — IM entries are expected; no IC yet |
| **90** | Ready for R31802A — should be processed immediately |
| **95** | R31802A has run — should not appear in End of Day unless a prior-period issue exists |
| **97** | Variance accounting complete — should not appear in End of Day |
| **ER** | Work order error — must be resolved before R31802A can run |

> **Prior period manufacturing:** If the PeriodEnds column shows a period other than the current reconciliation period, the work order was never processed by R31802A in its original period. These are the most critical End of Day items and will not self-resolve without direct intervention.

### 3.3 Voucher Match — P4314 / P0411 (Error Type)

Voucher match transactions appear in the End of Day report when a PV (payment voucher) document exists in F4111 but was not completed through the normal voucher match process. These are identified by the **Error** type in the report.

**The 2000-01-01 date pattern:**

A TransactionDate of **2000-01-01** is the JD Edwards flag for a voucher match transaction that was never fully processed. It always appears as a pair with a real-date row for the same document number:

| Row | TransactionDate | Amount | Meaning |
|---|---|---|---|
| Row 1 | 2000-01-01 | Positive amount | Original unprocessed voucher entry |
| Row 2 | Real date (e.g., Mar 25) | Negative amount | Reversal or correction attempt |

These pairs net to zero per document, so they do not contribute a dollar variance — but they indicate unfinished voucher match activity that must be investigated and resolved.

**Key indicators:**

| Field | What to Look For |
|---|---|
| **Type** | `Error` |
| **DocType** | PV (payment voucher) |
| **OrderType** | OP (purchase order), OC (order change) |
| **TransactionDate** | 2000-01-01 on one row; real date on the paired row |
| **Amount** | Positive on the 2000-01-01 row; equal negative on the real-date row |

---

## Section 4: Report Structure and Field Reference

### 4.1 Report Structure

The End of Day report is a flat row-per-transaction export. Each row represents a single F4111 item ledger record that has no matching F0911 GL entry. The report is not grouped — Sales, Manufacturing, and Error rows are interleaved and must be separated during analysis.

Key structural rules:

- **One row per F4111 transaction** — unlike the GL Batches report, rows are not grouped by batch. Each individual item ledger record appears separately.
- **All rows are unmatched** — every row in the report represents an item ledger entry with no corresponding GL entry.
- **PeriodEnds may vary** — unlike the GL Batches report, the PeriodEnds column may differ across rows within the same export if prior-period items are present. Always check this column first.
- **Amounts may carry floating-point artifacts** — amounts such as `-105493.48000000001` are IEEE 754 precision artifacts from the export. Round to two decimal places for analysis.

### 4.2 Column Definitions

| Column | Description |
|---|---|
| **PeriodEnds** | The RapidReconciler period the transaction belongs to. If this differs from the current period, the row is from a prior period — treat as critical. |
| **TransactionDate** | The date the item ledger record was created. A date of **2000-01-01** is a JD Edwards flag for an unprocessed voucher match transaction. |
| **CompanyNumber** | JD Edwards company number. Leading zeros included. |
| **LongAccount** | The full GL account number in Business Unit.Object format (e.g., 73010.1421). |
| **OffsetAccount** | The offset GL account, if populated. Blank for most End of Day rows — the GL entry does not yet exist. |
| **Type** | RapidReconciler classification of the transaction source. See Section 5.1 for all codes. |
| **OrderType** | The JD Edwards order type (e.g., SO, SI, WO, OP). Identifies the source business process. |
| **DocType** | The JD Edwards document type (e.g., SO, IM, IC, PV). Combined with OrderType, uniquely identifies the transaction class. |
| **DocNumber** | The JD Edwards document number. Use this to locate the transaction in JD Edwards for investigation. |
| **BranchPlant** | The branch plant associated with the transaction. |
| **Status** | The current status of the source order (sales order status, work order status). Critical for manufacturing — see Section 3.2. |
| **TransactionAmount** | The item ledger amount. Positive = debit; negative = credit. |
| **Currency** | Currency code. A mix of currencies (e.g., GBP and USD) in the same export indicates multi-company or multi-currency activity. |
| **Rate** | Exchange rate. 1.0 = domestic or no conversion. |

### 4.3 Derived Fields for Analysis

| Derived Field | How to Calculate | Purpose |
|---|---|---|
| **Transaction Age (Days)** | Current date minus TransactionDate (use PeriodEnds as the reference for exports analyzed at period end) | Identifies stale items. Over 2 days warrants attention; over 7 days requires escalation; prior period is critical. |
| **Total by Type** | Sum of TransactionAmount grouped by Type | Shows the dollar contribution of each transaction category to the overall End of Day variance. |
| **Prior Period Flag** | PeriodEnds ≠ the current reconciliation period | Prior period End of Day items require immediate attention — they will not clear without direct intervention. |

---

## Section 5: Type and Status Code Reference

### 5.1 Type Codes

| Type | Description | Batch Program Needed | Key Concern |
|---|---|---|---|
| **Sales** | Sales shipment or invoice awaiting Sales Update | R42800 | R42800 not run; orders on hold; version selection gap |
| **Mfg** | Manufacturing material issue, completion, or labor awaiting Manufacturing Accounting | R31802A | Work order status; prior period items; work orders in error state |
| **Error** | Voucher match transaction with 2000-01-01 date — unprocessed voucher | P4314 / P0411 | Paired rows net to zero but indicate unfinished voucher match activity |
| **Manufacturing** | Alternative label for Mfg in some configurations | R31802A | Same as Mfg |

### 5.2 Work Order Status Codes (Manufacturing Type)

See Section 3.2 for the full work order status reference. The most important statuses for End of Day diagnosis are:

| Status | End of Day Implication |
|---|---|
| **45 / 50** | Work order is still active or pending close — IM entries are expected; no IC yet |
| **90** | Ready for R31802A — should be processed immediately |
| **95** | R31802A has run — should not appear in End of Day unless a prior-period issue exists |
| **97** | Variance accounting complete — should not appear in End of Day |
| **ER** | Work order error — must be resolved before R31802A can run |

### 5.3 Sales Order Status Codes (Sales Type)

| Status | Description | End of Day Implication |
|---|---|---|
| **580–599** | Awaiting Sales Update (older orders) | Should have been processed by previous R42800 runs — investigate if aged |
| **600–620** | Awaiting Sales Update (normal) | Expected for same-day or recent orders; normal End of Day |
| **999** | Fully closed | Should not appear in End of Day — investigate if present |

---

## Section 6: Common End of Day Patterns and Root Causes

### 6.1 Sales Backlog — R42800 Not Run

**Symptoms:**
- Many Sales-type rows, same company, multiple transaction dates spanning several days
- All status 620 (or similar awaiting Sales Update status)
- Transaction dates cluster around the same period without gaps

**What is happening:**

R42800 did not run successfully for one or more scheduled periods. Every sales shipment confirmed during that time is waiting in the End of Day queue. The backlog may span multiple days if the job has been failing silently.

**Resolution:**

> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.

1. Confirm whether R42800 ran for the affected days by checking the job scheduler or output queue.
2. Run R42800 in **proof mode** first — review the Invoice Journal for errors.
3. Run in **final mode** to process the backlog.
4. Verify the End of Day variance clears at the next RapidReconciler refresh.

> **Older orders in the same backlog:** If the backlog contains orders with significantly older doc numbers or statuses below 600, investigate those separately. They may have been missed by earlier R42800 runs rather than being part of the current outage.

### 6.2 Sales — Older SO Orders at Status 580

**Symptoms:**
- SO order type rows (not SI) with status 580
- Doc numbers significantly lower than the bulk of the backlog
- Transaction dates older than the surrounding Sales rows

**What is happening:**

Status 580 sales orders were not fully processed by Sales Update in a prior period. They remain in the End of Day list because R42800 did not select them, possibly due to version data selection criteria or a hold flag on the order.

**Resolution:**

1. Locate each SO document in Customer Service Inquiry (P4210).
2. Check whether the order is on hold, has a missing invoice number, or has a data issue preventing Sales Update.
3. Review the R42800 version data selection to confirm these order types are included.
4. Resolve any holds or data issues, then rerun R42800.

### 6.3 Manufacturing — Prior Period Work Orders

**Symptoms:**
- Mfg-type rows with a PeriodEnds date from a prior period (e.g., 2024-08-31 in a March 2026 report)
- Multiple work orders, multiple doc types (IM and IC)
- Some work orders at status 45/50 (never completed); others at status 90/95 (should have been processed)

**What is happening:**

R31802A never processed these work orders in their original period. The item ledger records were written in August 2024 (or whenever) but the corresponding GL entries were never created. These transactions will continue to appear in every End of Day report indefinitely until R31802A is run or the work orders are closed and removed.

**Why it happens:**
- Work orders were left open and never completed
- R31802A was not scheduled or failed for that period
- Work orders were in an error status preventing R31802A from running
- Work orders were at too-early a status (45/50) when the period closed

**Resolution by work order status:**

| Status | Action |
|---|---|
| **45 / 50 (open)** | Determine whether the work order should be completed or cancelled. If completing: issue remaining material, record completions, advance to status 90, then run R31802A. If cancelling: close the work order and post a manual journal entry to clear the item ledger balance. |
| **90 (ready)** | Run R31802A in proof mode, review, then final mode. Work order will advance to status 95. |
| **95 (should be done)** | Investigate why the work order is still appearing. Query F4111 for the work order — there may be additional cardex rows written after R31802A ran. |
| **97 (variance accounting done)** | Should not appear. Query F4111 and F0911 directly for the work order to identify the unmatched record. |
| **ER (error)** | Resolve the error condition in JD Edwards first. Check the work order for missing routing steps, invalid accounts, or incomplete data. Then run R31802A. |

> **These items will not self-resolve.** Every period-end close will show the same prior-period manufacturing rows until R31802A processes them or the work orders are formally closed. Escalate to manufacturing and IT immediately.

### 6.4 Voucher Match Errors — 2000-01-01 Date Pattern

**Symptoms:**
- Error-type rows with TransactionDate = 2000-01-01 paired with real-date rows for the same document number
- Doc type = PV; order type = OP or OC
- Each pair nets to $0.00

**What is happening:**

A voucher match transaction (PV) was entered but not completed through the normal P4314 flow. The 2000-01-01 date is JD Edwards' internal flag for an item ledger record that was written during a voucher match attempt that was subsequently reversed or abandoned. The paired real-date row is the reversal.

These pairs net to zero and do not contribute to the dollar variance, but they indicate that a voucher match was not completed as expected. Leaving them unresolved obscures the true End of Day picture and can cause confusion at period end.

**Resolution:**

1. Locate each PV document in JD Edwards (P4314 or P0411).
2. Determine whether the voucher was intentionally reversed or needs to be completed.
3. If intentionally reversed: the item ledger records will clear naturally once the process is fully resolved. Document for audit purposes.
4. If incomplete: re-process the voucher match through P4314.

### 6.5 Manufacturing — Work Order in Error Status

**Symptoms:**
- Mfg-type row with Status = ER (or similar error code)
- IM entries present with no IC
- May appear alongside normal-status work orders for the same company

**What is happening:**

The work order has been flagged with an error condition in JD Edwards that prevents R31802A from processing it. Common causes include invalid routing steps, missing standard costs, or data integrity issues on the work order header.

**Resolution:**

1. Navigate to the work order in Work Order Entry (P48013) or Work Order Processing (P31114).
2. Review the error messages associated with the work order.
3. Correct the underlying data issue (missing cost, invalid account, incomplete BOM).
4. Run Work Order Processing (R31410) again if needed to refresh the frozen standard.
5. Once the error is resolved, advance the work order to status 90 and run R31802A.

### 6.6 Manufacturing — R31802A Cross-Work-Order GL Summarization

**Symptoms:**
- Mfg-type rows at status 95 (R31802A has run) still appearing in End of Day for one specific GL class
- Other GL class rows for the same work order have cleared
- The remaining rows have a small amount compared to the overall work order cost

**What is happening:**

R31802A summarizes GL entries by account within its run. A single F0911 entry for a given account and batch may cover multiple work orders. RapidReconciler matches on batch number — when it attributes the full GL summary amount to the first work order it encounters, the other work orders in the same batch show a residual cardex-only balance in End of Day until their own records are reviewed and documented.

This is not a posting error. The GL entries exist and are correct in aggregate — the apparent End of Day variance is an artifact of the matching logic.

**How to confirm:**

1. Note the work order number (DocNumber) and GL class from the End of Day row.
2. In JD Edwards, query F0911 for the GL document number associated with this batch and GL class.
3. If multiple work order numbers appear in the F0911 results, the entry is a summarized posting.
4. Sum the F4111 cardex amounts for all included work orders for the same GL class — the total should equal the F0911 amount.

**Resolution:**

If Step 3 confirms cross-work-order summarization, suspend the record in RapidReconciler with a note identifying the GL document number and confirming the summarization. No journal entry is required. The corresponding records on the other affected work orders will clear when their own analysis is documented.

> **Do not post a correcting entry based solely on End of Day appearance.** The Transaction Detail report for the specific work order will show the GL-excess pattern that distinguishes this from a genuine missing GL entry. See the Transaction Detail Analysis Guide for the full investigation procedure.

---

## Section 7: Step-by-Step Analysis Procedure

Use this procedure for every End of Day report export:

**Step 1 — Check the PeriodEnds Column First**

Before any other analysis, scan the PeriodEnds column for rows that do not match the current period. Any row with a prior-period date is a critical finding and must be escalated immediately. Group these rows separately — they require a different resolution process than current-period items.

**Step 2 — Separate by Type**

Group all rows by the Type column:
- **Error** — voucher match rows with 2000-01-01 dates
- **Sales** — awaiting R42800
- **Mfg** — awaiting R31802A

Each group has a distinct root cause and resolution path.

**Step 3 — Analyze Error-Type Rows**

For each Error-type row, find its pair (same DocNumber, opposite amount). Confirm the pair nets to zero. Note the real transaction date for the paired row — this is the date the reversal occurred. Identify the document number and investigate in P4314.

**Step 4 — Analyze Sales-Type Rows**

Summarize by transaction date to understand the scope of the backlog:
- How many days of orders are queued?
- Are there any orders with significantly older doc numbers mixed in?
- Are there any orders at status 580 or below (not normal End of Day status)?

Determine whether the backlog is from a single missed R42800 run or a multi-day accumulation.

**Step 5 — Analyze Manufacturing-Type Rows**

For each work order (DocNumber), note:
- The work order status (Status column)
- Whether both IM and IC rows are present (status 90+ should have IC)
- Whether the period is current or prior
- Whether the status is ER (error)

Group work orders by resolution category: run R31802A, complete and close, or resolve error first.

**Step 6 — Assess Transaction Age**

For each group, calculate the age relative to PeriodEnds:

| Age | Action Level |
|---|---|
| 0–2 days | Normal — will resolve at next batch run |
| 3–7 days | Investigate — confirm batch ran and identify why it missed these items |
| 8–14 days | Escalate — identify owner and set a resolution deadline |
| 15+ days | Critical — systematic failure or deliberate non-processing; prior period if different PeriodEnds |

**Step 7 — Assign Priority and Actions**

| Priority | Criteria | Action |
|---|---|---|
| **1 — Immediate** | Prior period PeriodEnds OR work order status ER OR age > 14 days | Escalate same day; involve manufacturing / IT |
| **2 — High** | Error-type rows with 2000-01-01 dates OR Sales rows > 7 days old OR WO status 90 not processed | Investigate and resolve within 1 business day |
| **3 — Normal** | Sales rows aged 0–2 days at status 620 OR active WOs at status 45/50 | Include in next R42800 or R31802A run |

**Step 8 — Document Findings**

Record the analysis on the Analysis sheet following the formatting rules in the shared formatting spec.

**Step 9 — Follow Up**

After corrections are made, confirm the End of Day variance reaches $0 at the next RapidReconciler refresh. Prior-period manufacturing items may require multiple R31802A runs across different work orders before fully clearing.

---

## Section 8: Period-End Requirements

The End of Day variance must equal **$0** before performing any period-end closing activities in RapidReconciler. Specifically:

- All Sales-type rows must be cleared by R42800
- All Mfg-type rows at status 90 must be cleared by R31802A
- All Error-type (2000-01-01) rows must be investigated and resolved
- No prior-period rows should remain outstanding

> **Do not post closing journal entries or produce the Audit Report until the End of Day variance is zero.** An unresolved End of Day variance means the perpetual inventory balance includes transactions that are not yet reflected in the GL — any closing entry based on the current balance will be calculated on an incomplete picture.

**Mfg rows at status 45/50 (active work orders):**

Active work orders (status 45/50) are expected to appear in the End of Day report and do not need to be resolved before period close if the orders genuinely span the period boundary. Document these with a note in RapidReconciler and confirm the amounts are appropriate for the open work-in-process balance.

**Prior-period manufacturing items:**

These must be resolved — they cannot be accepted as an ongoing open item. If a work order cannot be completed (e.g., it has been physically scrapped or cancelled), close the work order formally in JD Edwards and post a manual journal entry to clear the item ledger balance. Document the decision for audit purposes.

### 8.1 Manufacturing AAI Reference

The following AAIs must be correctly configured for R31802A to process without errors. Missing or misconfigured AAIs cause R31802A to fail, leaving all work order transactions in End of Day.

| AAI | Account | Used By | GL Class Code Source |
|---|---|---|---|
| **3110** | Raw Material / Sub-Assembly Inventory | IM — credit side | **Component** GL class code (one entry per component class) |
| **3120** | Work In Process (WIP) | IM debit, IH debit, IC credit, IS credit, IV debit/credit | **Parent item** GL class code |
| **3130** | Finished Goods / Scrap | IC debit, IS debit | **Parent item** — configure separately by doc type IC vs. IS to route scrap to a different account |
| **3220** | Labor Variance | IV (only if Work Center Efficiency enabled) | **Parent item** |
| **3240** | Material Variance | IV | **Parent item** |
| **3260** | Planned Variance | IV | **Parent item** |
| **3270** | Engineering Variance | IV | **Parent item** |
| **3280** | Other Variance / WIP Clearance | IV | **Parent item** |
| **3401** | Payroll Accrual | IH — credit side | **Parent item** |

**Common AAI misconfigurations that cause End of Day to persist:**

| Misconfiguration | Effect |
|---|---|
| AAI 3110 missing for a component GL class code | R31802A errors on IM credit side; W batch not posted; all transactions remain in End of Day |
| AAI 3120 missing for parent GL class code | R31802A errors; batch fails; all transactions for that work order remain in End of Day |
| AAI 3220 missing with Work Center Efficiency enabled | R31802A errors on every work order with labor; entire batch fails |
| AAI 3130 not differentiated by doc type IC vs. IS | Scrap posts to finished goods account — account mismatch visible after R31802A runs |

### 8.2 Period-End Checklist for Manufacturing

Before closing a period that includes manufacturing activity, confirm:

- [ ] All work orders at status 90 have been processed by R31802A (status advanced to 95)
- [ ] All W batches from R31802A are posted (posting status = D in P0011)
- [ ] Work orders requiring variance accounting have been processed by R31804 (status 97 or 99)
- [ ] All W batches from R31804 are posted
- [ ] GL Batches variance in RapidReconciler = $0 for all inventory accounts
- [ ] End of Day variance in RapidReconciler = $0 (no IM, IH, IC, IS transactions awaiting R31802A)
- [ ] Any Standard Cost Change rows on closed work orders have been resolved via manual journal entry
- [ ] UDC 31/ER rates reconciled with payroll for the period
- [ ] Integrity Report 5 reviewed for F41021 / F4102 GL class code mismatches

---

## Section 9: Related Documentation

- [GL Batch Analysis Guide](../MDS/gl-batch-analysis-guide.md)
- [Transaction Detail Analysis Guide](../MDS/transaction-detail-analysis-guide.md)
- [Inventory: Using the Application](../MDS/inventory-using-application.md)
- [DMAAI Reference Guide](../MDS/distribution-aais.md)

---

*For support, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com)*
