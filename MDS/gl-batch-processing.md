# JD Edwards GL Batch Posting Reference Guide

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Batch Processing Flow](#section-1-batch-processing-flow)
- [Section 2: Batch Header Status Codes](#section-2-batch-header-status-codes)
- [Section 3: Approval Status Codes](#section-3-approval-status-codes)
- [Section 4: Posting Status Codes](#section-4-posting-status-codes)
- [Section 5: Resolving Common Batch Errors](#section-5-resolving-common-batch-errors)
- [Section 6: Fixing Missing Batch Headers](#section-6-fixing-missing-batch-headers)
- [Section 7: Setting Up Automatic Batch Approval](#section-7-setting-up-automatic-batch-approval)
- [Section 8: RapidReconciler — GL Batches Variance](#section-8-rapidreconciler--gl-batches-variance)

---

## Overview

In JD Edwards EnterpriseOne, every transaction that affects the general ledger is grouped into a **batch** before it is posted to account balances. A batch must pass through two sequential gates before it updates the GL:

1. **Approval** — the batch is reviewed and authorized for posting
2. **Posting** — the GL detail table (F0911) is summarized into the account balance table (F0902)

Until both steps are complete, transactions exist in F0911 but are not reflected in F0902. Any reconciliation tool — including RapidReconciler — that compares perpetual inventory to GL account balances will show these unposted amounts as a variance under the GL Batches source.

**Key tables:**

| Table | Description |
|---|---|
| **F0011** | Batch Control Records — one record per batch; holds batch header, approval status, and posting status |
| **F0911** | Account Ledger — GL transaction detail; records exist here before and after posting |
| **F0902** | Account Balances — period-end balances; only updated when a batch is posted in final mode |

> **Important:** All corrections to batch status are made in JD Edwards. RapidReconciler displays batch posting variances for visibility but does not modify JD Edwards data.

---

## Section 1: Batch Processing Flow

```
Transaction entered in JD Edwards
        ↓
Batch created in F0011
Batch status: Approved = blank, Posted = blank
        ↓
Manual or automatic approval
Batch status: Approved = A, Posted = blank
        ↓
Posting program runs (R09801)
        ↓
Post succeeds → F0902 updated
Batch status: Approved = A, Posted = D (Done)
        ↓
Post fails → Error written to F0011
Batch status: Approved = A, Posted = E (Error)
```

A batch that has not been approved (Approved = blank) will not post even if the posting program is run. A batch in error status (Posted = E) requires investigation and correction before it can be reposted.

---

## Section 2: Batch Header Status Codes

The batch header in F0011 contains two independent status fields: **Approval Status (ICUT)** and **Posting Status (ICUT)**. Both must be in the correct state for a batch to post successfully.

### Batch Types (ICUT)

The batch type identifies what kind of transactions the batch contains. It also determines which approval and posting rules apply.

| Batch Type | Description | Typical Source Programs |
|---|---|---|
| **G** | General Journal | Journal Entry (P0911) |
| **N** | Inventory Adjustments / Issues / Transfers | P4112, P4113, P4114, P4116 |
| **IB** | Inventory Balance Adjustments | Cost changes|
| **V** | Vouchers | Voucher Entry (P0411), Voucher Match (P4314) |
| **O** | Purchase Order Receipts | PO Receipts (P4312) |
| **0** | Manufacturing / Work Orders | Manufacturing Accounting (R31802A) |
| **IB** | Sales Invoices | Sales Update (R42800) |
| **NC** | Frozen Cost Update | Frozen Standard Cost Update (R30835), Item Cost Components (P30026) |

---

## Section 3: Approval Status Codes

The approval status is stored in the **ICUT** field of F0011 and controls whether the batch is eligible to be posted.

| Code | Status | Description | Action Required |
|---|---|---|---|
| *(blank)* | **Pending** | Batch has been created but not yet approved. Will not post. | Approve manually via Batch Approval (P0011) or configure automatic approval — see Section 7. |
| **A** | **Approved** | Batch has been approved and is eligible for posting. | None — batch is ready to post. |
| **D** | **Approved (Auto)** | Batch was approved automatically by the system based on company constants configuration. | None — batch is ready to post. |
| **H** | **Hold** | Batch has been placed on hold and will not be approved or posted until released. | Investigate why the hold was applied. Release via Batch Approval (P0011) once the issue is resolved. |
| **R** | **Rejected** | Batch was submitted for approval but rejected by the approver. | Review rejection reason. Correct the batch and resubmit for approval. |
| **S** | **Submitted** | Batch has been submitted for approval and is awaiting review. | No action required until the approver acts. Follow up if approval is delayed. |

---

## Section 4: Posting Status Codes

The posting status is stored in the **ICUT** field of F0011 and reflects the result of the most recent posting attempt.

| Code | Status | Description | Action Required |
|---|---|---|---|
| *(blank)* | **Unposted** | Batch has not yet been posted. May or may not be approved. | Approve if needed, then run the posting program (R09801). |
| **D** | **Posted** | Batch has been fully posted. F0902 account balances have been updated. | None. |
| **E** | **Error** | The posting program encountered an error and could not post the batch. F0902 has not been updated. | Investigate the error using the Batch Review program (P0011). See Section 5 for common errors and resolutions. |
| **P** | **In Process** | The posting program is currently running for this batch. | Wait for the posting run to complete. If the status remains P for an extended time, investigate whether the posting job is still running or has stalled. |
| **\#** | **Held by System** | The system has placed the batch in a temporary hold during processing. | Usually resolves automatically. If the status persists, contact your system administrator — a job may have terminated abnormally. |

---

## Section 5: Resolving Common Batch Errors

When a batch has a posting status of **E** (Error), navigate to the Batch Review program (P0011) and review the error message in the batch header. The most common errors and their resolutions are listed below.

### 5.1 Invalid Object Account

| Field | Detail |
|---|---|
| **Error** | Object account is invalid or is not set up as a posting account |
| **How to identify** | Error message in P0011 references an invalid account number; the account does not exist in the Chart of Accounts (F0901) or has a posting code of "N" (non-posting) |
| **Cause** | An AAI, manual journal entry, or program processing option references an account that does not exist or is marked as a header account |
| **Resolution** | (1) Verify the account exists in the Chart of Accounts (P0901 off menu G09411). (2) If the account does not exist, add it or correct the AAI pointing to it. (3) If the account exists but is non-posting, change the posting code to "Y" or redirect the AAI to a valid posting account. (4) Delete and re-enter the batch if necessary, or correct the account directly in F0911 via a JDE SQL script (IT involvement required). |

### 5.2 Invalid Business Unit

| Field | Detail |
|---|---|
| **Error** | Business unit does not exist in the Business Unit Master (F0006) |
| **How to identify** | Error message references an unrecognized business unit; the business unit is not visible in the Organization Structure (P0006) |
| **Cause** | An AAI, manual entry, or program references a business unit that has not been set up, was deleted, or has a typo |
| **Resolution** | (1) Verify the business unit exists in F0006 (P0006 off menu G09411). (2) If missing, add the business unit or correct the AAI. (3) If the business unit was recently deleted or renamed, update any AAIs or processing options referencing it. (4) Correct the F0911 record directly (IT involvement) or delete and re-enter the transaction. |

### 5.3 Amounts Out of Balance

| Field | Detail |
|---|---|
| **Error** | Debits do not equal credits in the batch |
| **How to identify** | Error message states the batch is out of balance; running the batch proof report shows a non-zero net amount |
| **Cause** | A transaction was partially entered, a line was deleted after entry, a rounding difference was introduced, or a system interruption occurred during transaction creation |
| **Resolution** | (1) Run the batch proof report to identify which document is out of balance. (2) Locate the document in F0911 and review all lines. (3) Add the missing offsetting entry or remove the orphaned line. (4) For system-generated batches (not manual journal entries), investigate the source program — a program bug or interruption may have created an incomplete transaction. Do not rebalance a system-generated batch by adding manual lines without understanding the root cause. |

### 5.4 Invalid GL Date — Closed Period

| Field | Detail |
|---|---|
| **Error** | Batch is attempting to post to a closed or non-existent fiscal period |
| **How to identify** | Error message references an invalid GL date or closed period; the GL date on the batch falls outside the open period range in Company Constants |
| **Cause** | The batch was created with a GL date in a period that has since been closed, or the GL date was entered incorrectly |
| **Resolution** | (1) Check the open period in Company Constants (P0010) for the applicable company. (2) If the period should still be open, re-open it temporarily, post the batch, then re-close. (3) If the transaction should post in the current period, change the GL date on the batch via the Batch Header Revisions program (P0011) or directly in F0911. Consult the finance team before re-opening closed periods. |

### 5.5 Account in a Locked Company

| Field | Detail |
|---|---|
| **Error** | The company associated with the batch is locked for posting |
| **How to identify** | Error message references a locked company; Company Constants (P0010) shows the company is in a lock state |
| **Cause** | The company was locked for period-end processing, year-end close, or audit |
| **Resolution** | (1) Confirm with the finance team whether the lock is intentional. (2) If the lock should be released, unlock the company in Company Constants (P0010). (3) Do not unlock a company without authorization — the lock may be in place for audit or legal reasons. |

---

## Section 6: Fixing Missing Batch Headers

A missing batch header occurs when F0911 contains transaction detail records that have no corresponding record in F0011. This is a data integrity issue that prevents the batch from being posted.

RapidReconciler identifies missing batch headers with an internal status code of **MH** (Missing Header), visible in the Approval Status and Posting Status columns on the GL Batches variance preview screen.

### 6.1 How a Missing Batch Header Occurs

Missing headers most commonly result from:

- A system interruption or job failure during transaction creation that wrote F0911 records but did not complete the F0011 write
- A data corruption event or failed database transaction
- A direct SQL insert into F0911 without a corresponding F0011 record (common in data migration or legacy conversion scenarios)
- A batch that was manually deleted from F0011 without removing the corresponding F0911 records

### 6.2 Identifying a Missing Batch Header

Before attempting to rebuild a missing header, confirm that the header is truly absent:

1. Note the batch number from the RapidReconciler GL Batches variance screen or from the F0911 record.
2. In JD Edwards, navigate to the Batch Header Revisions program (**P0011**) and search for the batch number.
3. If no record is returned, the header is missing.
4. Alternatively, query F0011 directly for the batch number. If no row is returned, the header does not exist.

### 6.3 Rebuilding a Missing Batch Header — Method 1: R007021

The **Batch Header Creation** program **R007021** is the recommended JD Edwards tool for automatically reconstructing missing batch headers from existing F0911 records.

**Steps:**

1. Navigate to the Batch Header Creation program. It is typically found on the **General Accounting** setup menu or can be accessed via fast path.
2. Set data selection to the specific batch number(s) requiring a header rebuild.
3. Run the program in **proof mode** first. Review the report output to confirm the correct batches are identified.
4. Run in **final mode** to create the F0011 records.
5. Navigate to P0011 and confirm the batch headers now exist.
6. Approve the newly created batch headers if auto-approval is not configured.
7. Post the batches using the GL Posting program (R09801).

> **Note:** R007021 reconstructs the header based on the F0911 records that exist. If F0911 records are incomplete or corrupt, the rebuilt header may reflect an out-of-balance batch. Always run in proof mode first and review the output carefully.

### 6.4 Rebuilding a Missing Batch Header — Method 2: Manual Entry via P0011

If R007021 is not available or produces unexpected results, a batch header can be created manually:

1. Navigate to **Batch Header Revisions (P0011)**.
2. Click **Add** to create a new batch header record.
3. Enter the following fields to match the existing F0911 records:
   - **Batch Number** — must match the batch number on the F0911 records exactly
   - **Batch Type** — must match the batch type of the F0911 records (e.g., I, O, W, S)
   - **Batch Date** — use the GL date of the F0911 records
   - **User ID** — the user ID associated with the original transaction
   - **Company** — the company number
4. Save the record.
5. Query the batch in P0011 to confirm it now appears.
6. Approve and post the batch as normal.

> **Caution:** Manually entering a batch header requires care. The batch number, type, and company must match the F0911 records exactly or the posting program will not associate the header with the detail records. Involve your JD Edwards administrator for this step.

### 6.5 After Rebuilding

Once the header has been rebuilt and the batch has been posted:

- Confirm the posting status shows **D** (Done) in P0011.
- In RapidReconciler, verify the MH status has cleared after the next nightly import.
- If the account balances in F0902 still do not match F0911 after posting, run the Account Balance Repost program (**R099102**) for the affected accounts and period. This regenerates F0902 from the F0911 detail and corrects any discrepancy caused by the missing header.

---

## Section 7: Setting Up Automatic Batch Approval

By default, JD Edwards requires batches to be manually approved before they can be posted. Automatic batch approval eliminates this step for routine transaction types, allowing batches to post without human intervention. It is configured at the company and batch type level in **Company Constants (P0010)**.

### 7.1 When to Use Automatic Approval

Automatic approval is appropriate when:

- The source program has sufficient built-in validation (e.g., standard inventory receipts, voucher matching)
- Posting volume is high enough that manual approval creates a bottleneck
- Transactions are system-generated rather than manually entered (lower error risk)
- The business process does not require a second-level review before GL impact

Manual approval should be retained for:

- General journal entries entered by users
- Adjusting entries and period-end accruals
- Any batch type where segregation of duties is required by policy or audit

### 7.2 Configuring Automatic Approval in Company Constants (P0010)

1. Navigate to **Company Constants** via fast path **P0010**, or from the General Accounting setup menu.
2. Select the company to configure and click **Revise**.
3. Locate the **Batch Control** section of the form.
4. For each batch type, a field controls the approval requirement:

| Field | Setting | Effect |
|---|---|---|
| **Batch Approval Required** | **Y** | Manual approval required. Batches remain in Pending status until approved via P0011. |
| **Batch Approval Required** | **N** | Automatic approval. Batches are set to Approved status (code **D**) immediately upon creation. |

5. Set the field to **N** for each batch type where automatic approval is desired.
6. Save the Company Constants record.

> **Note:** The Batch Approval Required field is configured per company. If multiple companies exist, each must be configured independently. Changes take effect for new batches created after the save — existing pending batches are not affected retroactively.

### 7.3 Automatic Approval by Batch Type

Company Constants allows approval requirements to be set at the batch type level. Typical configurations by batch type:

| Batch Type | Typical Setting | Rationale |
|---|---|---|
| **G** — General Journal | Manual (**Y**) | Journal entries carry higher risk; second-level review is standard practice |
| **N** — Inventory | Automatic (**N**) | System-generated by inventory programs; low manual intervention risk |
| **O** — PO Receipts | Automatic (**N**) | System-generated at receipt; high volume makes manual approval impractical |
| **V** — Vouchers | Manual (**Y**) | AP vouchers typically require approval for payment controls |
| **0** — Manufacturing | Automatic (**N**) | System-generated by R31802A; high volume; manual approval creates End of Day backlogs |
| **IB** — Sales Update | Automatic (**N**) | System-generated by R42800; nightly run; manual approval delays period-end close |

### 7.4 Testing After Configuration

After enabling automatic approval for a batch type:

1. Enter a test transaction of the applicable type.
2. Navigate to P0011 and search for the new batch.
3. Confirm the Approval Status shows **D** (Auto-Approved) immediately upon creation.
4. Run the GL posting program (R09801) and confirm the batch posts without requiring manual approval.
5. Verify the account balance in F0902 reflects the test transaction.

### 7.5 Considerations for Automatic Approval

- **Audit trail:** Automatically approved batches carry a system approval code (D) rather than a user ID in the approver field. If audit requirements mandate a named approver for specific transaction types, automatic approval cannot be used for those types.
- **Error batches:** Automatic approval does not prevent posting errors. A batch that fails to post (status E) still requires manual investigation regardless of whether it was auto-approved.
- **Reversals:** Automatically approved batches can be reversed through the normal reversal process. The reversal batch will also be auto-approved if the batch type is configured for automatic approval.
- **Segregation of duties:** For batch types subject to SOD requirements, automatic approval removes the explicit approval step. Review with your internal audit or controls team before enabling automatic approval on sensitive batch types (G, D, V).

---

## Section 8: RapidReconciler — GL Batches Variance

The GL Batches variance source in RapidReconciler identifies records in the GL detail table (F0911) where the posting status (GLPOST) is not equal to 'P' for inventory accounts.

### 8.1 How the Variance Is Calculated

RapidReconciler summarizes F0911 amounts for non-'P' posting codes, regardless of batch header status. Totals are reported as a GL Batches variance.

### 8.2 Status Codes Shown in RapidReconciler

The GL Batches variance preview screen in RapidReconciler displays batch-level detail including the following status indicators:

|  Approval Status | Meaning | Action |
|---|---|---|
| **Pending Approval** | Batch exists in F0011 but has not been approved | Approve the batch in P0011, then post |
| **Approved** | Batch is approved but has not been posted | Run the GL posting program R09801 |

|  Posting Status | Meaning | Action |
|---|---|---|
| **Error** | Posting program ran but encountered an error | Review the error in P0011 — see Section 5 |
| **MH** | F0911 records exist for this batch but no F0011 header record was found | Rebuild the batch header — see Section 6 |
| **In Use** | F0911 records exist for this batch but no F0011 header record was found | Rebuild the batch header — see Section 6 |
| **Bell icon** | One or more batches have been in an unposted or error state for more than 2 days | Escalate for immediate investigation |

### 8.3 Required Status Before Period-End Close

The GL Batches variance must equal **$0** before performing any period-end closing activities in RapidReconciler. Specifically:

- All inventory-related batches must have a posting status of **D** (Done)
- No batches in **E** (Error) or **MH** (Missing Header) status should remain outstanding
- The bell icon on the GL Batches row should not be present

> **Do not post closing journal entries or produce the Audit Report until the GL Batches variance is zero.** A non-zero GL Batches amount means the GL account balances in F0902 do not accurately reflect all posted transactions, and any closing entries based on those balances will be calculated on an incomplete picture.

### 8.4 Reposting Damaged Account Balances (R099102)

If an account balance in F0902 becomes corrupted or misaligned with F0911 for reasons other than unposted batches (e.g., a failed database transaction, a year-end close issue, or a direct update to F0902), it can be regenerated using the **Account Balance Repost** program **R099102**.

**When to use R099102:**

- F0902 balance differs from F0911 sum for the same account and period after all batches have been confirmed as posted
- The GL Batches variance in RapidReconciler persists as zero but the Valuation section still shows an out-of-balance amount
- A year-end close or period close left F0902 in an inconsistent state

**How to run R099102:**

1. Identify the affected company, fiscal year, and account numbers.
2. Navigate to R099102 (typically via the General Accounting reports menu or fast path).
3. Set data selection to the specific company, fiscal year, and account range.
4. Run in **proof mode** first to review which accounts will be affected.
5. Run in **final mode** to regenerate the F0902 balances from F0911.
6. Confirm account balances in the trial balance match F0911 totals after the run.

> **Caution:** R099102 replaces F0902 balances entirely for the selected accounts and periods. Run with precise data selection to avoid unintended impact on accounts outside the problem area. Involve your JD Edwards administrator and finance team before running in final mode.

---

*For support, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com)*