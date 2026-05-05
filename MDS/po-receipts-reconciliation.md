# How to Reconcile PO Receipts (RNV) in RapidReconciler

## A Comprehensive Guide to the PO Receipts Module

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Key Concepts](#section-1-key-concepts)
  - [1.1 What Is the RNV Account?](#11-what-is-the-rnv-account)
  - [1.2 The Standard Accounting Flow](#12-the-standard-accounting-flow)
  - [1.3 Why RNV Reconciliation Is Challenging](#13-why-rnv-reconciliation-is-challenging)
  - [1.4 The F43121 Table](#14-the-f43121-table)
  - [1.5 F43121 Match Types](#15-f43121-match-types)
  - [1.6 The PRLAND Field](#16-the-prland-field)
  - [1.7 What RapidReconciler Reconciles](#17-what-rapidreconciler-reconciles)
  - [1.8 No Period Selector — Why It Matters](#18-no-period-selector--why-it-matters)
- [Section 2: How RapidReconciler Helps](#section-2-how-rapidreconciler-helps)
- [Section 3: Before You Begin](#section-3-before-you-begin)
- [Section 4: Process Flow](#section-4-process-flow)
- [Section 5: The Orders Page](#section-5-the-orders-page)
  - [5.1 Overview](#51-overview)
  - [5.2 Filtering Results](#52-filtering-results)
  - [5.3 What Is a Suspension?](#53-what-is-a-suspension)
  - [5.4 Orders Page Column Definitions](#54-orders-page-column-definitions)
  - [5.5 Line Details](#55-line-details)
  - [5.6 Things to Check on the Orders Page](#56-things-to-check-on-the-orders-page)
- [Section 6: The Reconciliation Page](#section-6-the-reconciliation-page)
  - [6.1 Status Indicators](#61-status-indicators)
  - [6.2 Account Filters](#62-account-filters)
  - [6.3 Calculation Section](#63-calculation-section)
  - [6.4 PO Receipts Aging Chart](#64-po-receipts-aging-chart)
- [Section 7: The Line Analysis Page](#section-7-the-line-analysis-page)
  - [7.1 Accessing the Line Analysis Page](#71-accessing-the-line-analysis-page)
  - [7.2 Edit Note Button (Notes and Exclusions)](#72-edit-note-button-notes-and-exclusions)
  - [7.3 Document Button](#73-document-button)
  - [7.4 Filter Drop-Downs](#74-filter-drop-downs)
  - [7.5 Recalc and Export](#75-recalc-and-export)
  - [7.6 Documents Grid](#76-documents-grid)
- [Section 8: Step-by-Step Reconciliation Workflow](#section-8-step-by-step-reconciliation-workflow)
- [Section 9: Working Unreconciled Purchase Orders](#section-9-working-unreconciled-purchase-orders)
- [Section 10: Common Issues and How to Resolve Them](#section-10-common-issues-and-how-to-resolve-them)
- [Section 11: Suspension vs. Exclusion — When to Use Which](#section-11-suspension-vs-exclusion--when-to-use-which)
- [Section 12: Key Benefits](#section-12-key-benefits)
- [Section 13: Glossary](#section-13-glossary)
- [Section 14: Related Documentation](#section-14-related-documentation)

---

## Overview

The RapidReconciler PO Receipts module reconciles the **Received-Not-Vouchered (RNV)** balance sheet liability account against open purchase order receipt activity. The RNV account (controlled by DMAAI **4320**) holds the value of goods received from suppliers until the corresponding supplier invoice is matched and vouchered through Accounts Payable.

Receipt table data (F43121) is imported into RapidReconciler and balanced directly against general ledger details (F0902 / F0911), eliminating the need for separate tools or manual matching processes. The module surfaces only the orders and documents that require attention — fully vouchered and reconciled orders are removed automatically.

> **Key principle:** RapidReconciler does not correct RNV issues — all corrections are made in JD Edwards or through manual journal entries. RapidReconciler's role is to identify *which* purchase orders are unbalanced, *at which line and document*, and *by how much* — so that the correct corrective action can be applied efficiently rather than discovered at period end.

---

## Section 1: Key Concepts

### 1.1 What Is the RNV Account?

The Received-Not-Vouchered (RNV) account is a temporary liability account that holds the value of goods received from a supplier until the corresponding supplier invoice is matched and vouchered. It acts as the bridge between the **purchasing** and **accounts payable** processes.

At any point in time, the RNV account balance should equal the value of goods that have been received but not yet matched to a supplier invoice. If the balance does not agree to open receipt activity, a reconciling variance exists.

### 1.2 The Standard Accounting Flow

| Step | Transaction | Account Debited | Account Credited | AAI |
|---|---|---|---|---|
| **1** | PO Receipt | Inventory | **RNV** | 4310 / 4320 |
| **2** | Voucher Match | **RNV** | A/P Trade | 4320 / PC |

A balanced RNV account therefore shows offsetting debits and credits for every fully processed PO line, with a residual balance that reflects only goods received but not yet vouchered.

### 1.3 Why RNV Reconciliation Is Challenging

Without a dedicated tool, reconciling the RNV account requires manually matching F43121 records to general ledger entries — a time-consuming process that becomes increasingly complex as transaction volume grows. Common challenges include:

- **Volume** — High-volume purchasing environments can have thousands of open receipts at any point in time.
- **Aging receipts** — Old receipts that were never vouchered or were incorrectly closed accumulate over time and are difficult to identify manually.
- **Manual vouchers** — Receipts cleared through manual journal entries rather than the standard voucher match process leave the F43121 record open, creating a false variance.
- **Cost variances** — Price variances at voucher match (AAIs 4330, 4332, 4335) can leave residual balances in the RNV account that are difficult to trace.
- **Currency differences** — In multi-currency environments, exchange rate variances at voucher match (AAI 4340) can create additional reconciling items.
- **No As-Of reporting** — The F43121 table overwrites records on reversal rather than maintaining a transaction history, so reconciling to a prior point in time is not possible from the table itself.

### 1.4 The F43121 Table

The **F43121 (PO Receiver)** table is the source of truth for RNV reconciliation. It stores a record of every receipt and voucher match transaction on a purchase order line. RapidReconciler imports F43121 data and compares it directly to the corresponding GL entries to identify where the two do not agree.

### 1.5 F43121 Match Types

Each record in F43121 carries a **Match Type** field that identifies what stage of the purchasing process the record represents. Understanding match types is essential for interpreting the RNV reconciliation.

| Match Type | Description | Effect on RNV |
|---|---|---|
| **1** | **Receipt** — Created when goods are received against a purchase order (P4312). The initial record that opens the RNV balance. | **Opens** RNV — credits the RNV account via AAI 4320 |
| **2** | **Voucher Match** — Created when the supplier invoice is matched to the receipt (P4314/P0411). Written when the Match Type 1 record transitions from open to paid. | **Closes** RNV — debits the RNV account via AAI 4320 |
| **3** | **Reversal of Receipt** — Created when a receipt is reversed. Offsets the original Match Type 1 record. | **Closes** RNV for the reversed quantity |
| **4** | **Reversal of Voucher Match** — Created when a voucher match is reversed. Reopens the RNV balance for the reversed amount. | **Reopens** RNV for the reversed amount |
| **5** | **Landed Cost Receipt** — Created when a landed cost is applied at the time of receipt (P4312). | Opens RNV for the landed cost amount (AAI 4390) |
| **6** | **Landed Cost Voucher Match** — Created when a landed cost is matched to an invoice. | Closes RNV for the landed cost amount |

> **Key Point:** A fully reconciled purchase order line should have offsetting Match Type 1 and Match Type 2 records that net to zero. Any line where Match Type 1 exists without a corresponding Match Type 2 represents an open receipt — a legitimate component of the RNV balance. Lines that appear unbalanced for reasons *other* than a missing voucher match are where reconciling variances originate.

### 1.6 The PRLAND Field

The **PRLAND** field in F43121 identifies whether a record is a standard receipt or a landed cost, and whether the landed cost is eligible for voucher match:

| PRLAND Value | Meaning |
|---|---|
| **Blank** | Standard product/item receipt line |
| **1** | Product/item line |
| **2** | Landed cost — eligible for voucher match |
| **3** | Landed cost — accrual only, not eligible for voucher match |

> **Note:** When PRLAND = 3, the landed cost is accrued at receipt but will never be vouchered. These records contribute to the F43121 open balance but will never have a corresponding Match Type 2 record. They must be **suspended** in RapidReconciler to avoid creating a permanent false variance in the RNV reconciliation.

### 1.7 What RapidReconciler Reconciles

| Side | Source | Description |
|---|---|---|
| **Open Receipts Balance** | F43121 Match Type 1 records | Receipts not yet vouchered |
| **GL Balance** | F0902 Account Balances | General ledger balance for the RNV account |
| **Out of Balance** | Difference between the two | What must be explained and resolved |

### 1.8 No Period Selector — Why It Matters

Unlike the Inventory and In Transit modules, the PO Receipts module has **no period selector**. Because the F43121 table overwrites records on reversal rather than creating new entries, As-Of reporting is not possible. The reconciliation is always performed as a **current balance-to-balance comparison** — open receipts now vs. GL balance now.

This has two practical implications:

1. The reconciliation must be performed regularly (weekly is recommended) so that issues are caught while the supporting evidence is still recent.
2. JD Edwards reports used for comparison should be run at approximately the same time as the most recent RapidReconciler nightly import.

---

## Section 2: How RapidReconciler Helps

| Feature | How It Helps |
|---|---|
| **Orders Page** | Automatically calculates the open receipt position for every purchase order and displays only those with open amounts or variances between F43121 and the GL. Fully vouchered and reconciled orders are removed automatically. |
| **Reconciled / Suspended Filters** | Allow the user to focus on unreconciled orders, audit suspended orders, or validate the full open receipts listing — without manual sorting or filtering of raw data. |
| **Calculation Section** | Separates the total out-of-balance amount into Open Receipts, Unreconciled, and Batches components, and provides a Suggested Entry amount that excludes outstanding variances — making it straightforward to decide whether to close around unresolved items or resolve them first. |
| **PO Receipts Aging Chart** | Provides a visual breakdown of open receipts by period, immediately identifying whether the RNV balance is driven by recent legitimate activity or by aging receipts that have not been vouchered — without running a separate aging report. |
| **Suspension Feature** | Removes orders cleared by manual voucher entry, PRLAND = 3 landed cost records, or data cutoff artifacts from the variance calculation — isolating genuine unresolved items from known exceptions without requiring changes to JD Edwards data. |
| **Line Analysis Page** | Provides a side-by-side F43121 vs. GL comparison at the document level for any purchase order line, with the ability to exclude specific documents and add audit notes — making it possible to trace the exact document causing a variance rather than reviewing the full order. |
| **Document Button** | Displays all transactions for a PO line with a Variance column identifying precisely which documents have discrepancies between F43121 and F0911, eliminating the need to cross-reference two separate data extracts. |
| **Unreconciled Link** | Navigates directly from the Reconciliation page to a pre-filtered Orders page showing only the orders requiring action — removing the need to manually filter through the full order listing each period. |

---

## Section 3: Before You Begin

### Prerequisites

| Item | Requirement |
|---|---|
| **RapidReconciler access** | Login credentials provided by your administrator |
| **Module permissions** | Access to the PO Receipts module and applicable companies |
| **Suspension permission** | Must be granted by your administrator to suspend orders |
| **Exclusion permission** | Must be granted by your administrator to exclude documents |
| **JD Edwards access** | Required to investigate and correct issues identified in RapidReconciler |

### Key Rules Before Starting

- Both status lights on the Reconciliation page must be **green** before making any adjustments to the general ledger.
- RapidReconciler data is refreshed **nightly**. Any JD Edwards report used for comparison should be run at approximately the same time as the RapidReconciler data was imported.
- The **Open Receipts balance** in RapidReconciler should match an Open Receipts report run directly from JD Edwards. Resolve any discrepancies between the two before making journal entries.
- The reconciliation objective is to ensure that **amounts on receipts and vouchers match between F43121 and the GL** — not to match individual vouchers to receipts. A receipt without a voucher is a legitimate open receipt and correctly contributes to the RNV balance.

---

## Section 4: Process Flow

The diagram below shows the end-to-end reconciliation flow at a glance. Each step is detailed in [Section 8](#section-8-step-by-step-reconciliation-workflow).

```
                        ┌─────────────────────────────┐
                        │  START: Log in to           │
                        │  RapidReconciler            │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │  Navigate to PO Receipts    │
                        │  module                     │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │  Both status lights GREEN?  │
                        └──────┬───────────────┬──────┘
                          NO   │               │  YES
                               ▼               ▼
                ┌──────────────────────┐   ┌──────────────────────────┐
                │ Hover for details;   │   │ Apply company / account  │
                │ resolve before       │   │ filters                  │
                │ proceeding           │   └──────────────┬───────────┘
                └──────────────────────┘                  │
                                                          ▼
                                       ┌──────────────────────────────────┐
                                       │ STEP 1 — Validate Orders Page    │
                                       │ • Sort by MostRecReceipt asc     │
                                       │ • Identify aged receipts         │
                                       │ • Audit suspended orders         │
                                       │ • Suspend or correct in JDE      │
                                       └──────────────┬───────────────────┘
                                                      │
                                                      ▼
                                       ┌──────────────────────────────────┐
                                       │ AmtOpen total matches            │
                                       │ JD Edwards Open Receipts report? │
                                       └──────┬───────────────────┬───────┘
                                         NO   │                   │  YES
                                              ▼                   ▼
                                  ┌──────────────────────┐  ┌──────────────────────┐
                                  │ Investigate timing   │  │ STEP 2 — Reconciliation
                                  │ / data differences   │  │ Page: review balances │
                                  └──────────┬───────────┘  └──────────┬───────────┘
                                             │                         │
                                             └────────────┬────────────┘
                                                          ▼
                                       ┌──────────────────────────────────┐
                                       │ Out of Balance = $0?             │
                                       └──────┬───────────────────┬───────┘
                                         YES  │                   │  NO
                                              ▼                   ▼
                                  ┌──────────────────────┐  ┌──────────────────────┐
                                  │ Save audit           │  │ STEP 3 — Click       │
                                  │ documentation        │  │ Unreconciled link    │
                                  │  → END               │  └──────────┬───────────┘
                                  └──────────────────────┘             │
                                                                       ▼
                                                       ┌──────────────────────────────────┐
                                                       │ For each unreconciled order:     │
                                                       │ • Expand with [+]                │
                                                       │ • Click Line Analysis on grey    │
                                                       │   line                           │
                                                       │ • Set Rec=All, Line=0, Query     │
                                                       │ • Click Document button          │
                                                       │ • Find variance in Variance col  │
                                                       └──────────────┬───────────────────┘
                                                                      │
                                                                      ▼
                                                       ┌──────────────────────────────────┐
                                                       │ Determine root cause             │
                                                       │ (see Section 10)                 │
                                                       └──────────────┬───────────────────┘
                                                                      │
                                                                      ▼
                                                  ┌───────────────────┴───────────────────┐
                                                  │                                       │
                                                  ▼                                       ▼
                                  ┌────────────────────────┐              ┌────────────────────────┐
                                  │ Correctable in JDE?    │              │ Known exception?       │
                                  │ → Process voucher      │              │ → Suspend order or     │
                                  │   match, reverse, or   │              │   exclude document in  │
                                  │   post correcting JE   │              │   RapidReconciler;     │
                                  └───────────┬────────────┘              │   add audit note       │
                                              │                           └───────────┬────────────┘
                                              └─────────────┬─────────────────────────┘
                                                            ▼
                                          ┌──────────────────────────────────┐
                                          │ Click Recalc to refresh          │
                                          │ variance calculation             │
                                          └──────────────┬───────────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────────┐
                                          │ STEP 4 — Post adjusting JE       │
                                          │ • All resolved → use Out of      │
                                          │   Balance                        │
                                          │ • Carry forward → use Suggested  │
                                          │   Entry                          │
                                          └──────────────┬───────────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────────┐
                                          │ STEP 5 — Save audit              │
                                          │ documentation                    │
                                          │ (export Reconciliation & Orders) │
                                          │  → END                           │
                                          └──────────────────────────────────┘
```

---

## Section 5: The Orders Page

### 5.1 Overview

The Orders page lists all purchase orders — summarized to the order level — where one or more of the following conditions exist:

- **Open Receipts** — A receipt document (Match Type 1) has not yet been matched to a supplier invoice (Match Type 2)
- **Variances** — A receipt or voucher in F43121 has an amount that does not match the corresponding GL entry in the RNV account

Orders that have been fully received, fully vouchered, and where everything reconciles are **automatically removed** from the list.

### 5.2 Filtering Results

Results can be filtered using the drop-downs at the top of the grid:

| Filter | All | Yes | No |
|---|---|---|---|
| **Reconciled** | Show all orders | Show only reconciled orders | Show only unreconciled orders |
| **Suspended** | Show all orders | Show only suspended orders | Show only non-suspended orders |

**Recommended filter combinations:**

| Reconciled | Suspended | What You See | Purpose |
|---|---|---|---|
| All | No | All orders contributing to the Open Receipts balance | Validate the total open receipts amount |
| No | No | All unreconciled, non-suspended orders | Identify orders requiring investigation |
| All | Yes | All suspended orders | Audit that suspensions are still warranted |

### 5.3 What Is a Suspension?

A suspension in PO Receipts is equivalent to flagging an order as "Ignore Me." Suspending an order removes its amounts from the out-of-balance and variance calculations.

**Common reasons to suspend:**

| Reason | Description |
|---|---|
| **Data cutoff artifact** | RapidReconciler was loaded by date and only the voucher was imported, not the original receipt. The order processed correctly — it's a start-up issue. |
| **Manual voucher clearance** | A supplier invoice was entered using standard voucher entry (P0411) instead of being matched to the PO (P4314), leaving a paid receipt showing as open in F43121. Correcting in JD Edwards is preferred; suspension is the alternative. |
| **PRLAND = 3 landed cost** | An accrual-only landed cost that will never be vouchered. These records permanently contribute to the F43121 balance and should be suspended to prevent a false variance. |
| **Aged receipt under review** | An older open receipt that is being actively investigated but not yet resolved. Suspend temporarily with a note explaining the status. |
| **PO at status 999 with no further activity possible** | Closed in JD Edwards but still showing residual F43121 balance. |

> **Important:** Performing a suspension in RapidReconciler does **not** change any data in JD Edwards. If the order should be corrected in JD Edwards, make that correction first.

> **Best Practice:** Document the reason for each suspension in the note field for audit purposes. Suspended orders should be reviewed periodically to confirm they remain appropriately suspended and have not had new activity applied against them.

If an order is suspended in error, it can be unsuspended. Suspension permission must be granted by your administrator.

### 5.4 Orders Page Column Definitions

| Column | Description |
|---|---|
| **Suspended** | Checkbox indicating the order has been suspended |
| **Note** | Icon indicating a text note has been entered. Click "Edit Note" to view. |
| **Company** | The company number associated with the RNV account |
| **Long Account** | The RNV account number being reconciled |
| **Supplier** | The address book number on the PO. May show two addresses if landed costs are applied. |
| **Name** | Name of the supplier on the row |
| **Order** | Purchase order number |
| **Type** | Purchase order type |
| **MostRecReceipt** | The date of the most recent receipt — key field for aging analysis |
| **UnitsRec** | Total units received |
| **AmtRec** | Total value of units received |
| **UnitsVouch** | Total units vouchered |
| **AmtVouch** | Total value of units vouchered |
| **UnitsOpen** | Units received but not yet vouchered |
| **AmtOpen** | Value of units received but not yet vouchered. When Reconciled = All and Suspended = No, this column total matches the Open Receipts balance on the Reconciliation page. |
| **RecTotal** | Total value of all order transactions from F43121 |
| **GLTotal** | Total value of all order transactions posted to the GL RNV account |
| **Variance** | RecTotal minus GLTotal. Ideally zero. Non-zero values indicate an issue to resolve. |
| **ExclAmount** | The total exclusion amount for the order |
| **CurrCode** | Currency code associated with amounts |

> **Key distinction:** **AmtOpen** reflects legitimate open receipts (receipts not yet vouchered). **Variance** reflects a discrepancy between F43121 and the GL for the same document — this is a reconciling issue, not a legitimate open receipt.

### 5.5 Line Details

Click the **+** icon on the left of any order row to expand the line detail. This shows each individual PO line and whether it has an open receipt amount or a variance.

- Unreconciled lines are highlighted in **grey**
- Reconciled lines are displayed in **white**
- Details can be exported to Excel using the green down arrow

Clicking the **Line Analysis** button within the expanded row navigates directly to the Line Analysis page with filter data pre-populated for that line. This is the fastest way to investigate a specific unreconciled line.

### 5.6 Things to Check on the Orders Page

Before proceeding to the Reconciliation page, validate the Orders page to ensure the Open Receipts balance is accurate. Work through the following checks:

| Check | How | What to Look For |
|---|---|---|
| **Identify aged open receipts** | Sort by **MostRecReceipt** ascending | Oldest receipts at top — confirm whether they are still active or candidates for suspension or JD Edwards correction |
| **Audit suspended orders** | Set Reconciled = All; Suspended = Yes | Confirm every suspended order still genuinely warrants suspension — review the note for each |
| **Identify orders requiring review** | Set Reconciled = No; Suspended = No | These orders have variances that must be resolved |
| **Review unreconciled lines** | Expand any order by clicking **+** | Grey lines indicate unreconciled lines — click Line Analysis for detail |
| **Validate the open receipts total** | Set Reconciled = All; Suspended = No | The **AmtOpen** total must be validated before comparing to the GL balance |

> The open receipts listing **must be validated** before proceeding with the reconciliation. The quality of the reconciliation depends on the accuracy of the Orders page. Any order on the list in error — either correct in JD Edwards or suspend in RapidReconciler.

---

## Section 6: The Reconciliation Page

The Reconciliation page is the default page displayed on login. This is where the open receipts balance is compared to the GL balance and all variance sources are identified.

### 6.1 Status Indicators

Both indicators must be **green** before making any adjustments to the general ledger.

| Indicator | Green Means | Red Means | Action if Red |
|---|---|---|---|
| **PO Receipt Validation** | Carry-forward from prior period is accurate | Prior period issue exists | Hover for details; resolve before proceeding |
| **System Status** | JD Edwards import completed successfully | Import error occurred | Hover for details; contact your administrator |

### 6.2 Account Filters

- Operate as a hierarchy from left to right (Company → Business Unit → Object → Subsidiary)
- Removing a company automatically removes associated business units, objects, and subsidiaries
- Search rows at the top of each column filter within that column
- Filter selections persist across pages within the PO Receipts module

### 6.3 Calculation Section

| Field | Description | Source |
|---|---|---|
| **GL Balance** | General ledger balance for the RNV account | F0902 — matches the trial balance exactly |
| **Open Receipts** | Calculated from F43121 Match Type 1 records | F43121 |
| **Out of Balance** | Difference between GL Balance and Open Receipts | Zero = fully reconciled |
| **Unreconciled** | Total variance between F43121 and GL for unreconciled orders | Orders page Variance column total |
| **Batches** | GL batches awaiting posting | Unposted F0911 entries |
| **Total Variance** | Sum of Unreconciled and Batches amounts | — |
| **Suggested Entry** | Out of Balance minus Unreconciled amount | The journal entry amount if unreconciled orders are excluded from the current close |
| **Manual Entries** | Manual adjustments made to the selected accounts | Informational |

**Understanding Suggested Entry vs. Out of Balance:**

| Use | Amount | When to Use |
|---|---|---|
| **Out of Balance** | Includes unreconciled orders | Use when all unreconciled variances have been resolved before closing |
| **Suggested Entry** | Excludes unreconciled orders | Use when unreconciled orders will be carried forward for resolution next period |

> **Best Practice:** Resolve all unreconciled orders before closing the period. Using the Suggested Entry amount to close around outstanding variances defers the problem and accumulates carry-forward balances over time.

### 6.4 PO Receipts Aging Chart

The aging chart provides a visual breakdown of open receipts by period. Use this to identify whether open receipts are recent (normal) or aging (requires investigation). A large proportion of aged open receipts is a signal that the voucher match process is not keeping pace with receipts, and may indicate:

- Supplier invoices that were never received or processed
- Purchase orders that were incorrectly closed without a voucher match
- Disputed invoices being held outside the normal process
- System errors that prevented the voucher match from completing

Addressing aging RNV items regularly prevents the balance from accumulating to a point where it becomes difficult to manage.

---

## Section 7: The Line Analysis Page

### 7.1 Accessing the Line Analysis Page

> **Always access the Line Analysis page from the Orders page** by clicking the Line Analysis button on an expanded order row. This pre-populates the filter with the correct order and line data. Clicking the Line Analysis link in the Main Navigation pane does not populate filter data and may cause confusion.

### 7.2 Edit Note Button (Notes and Exclusions)

The Edit Note button is used to:

- Add a note for future reference or audit documentation
- Exclude a specific document (receipt or voucher) from variance calculations

**Procedure:**

1. Click the grid row(s) to be edited
2. Type in the text box to add a note
3. Check the **Excluded** box to remove amounts from the variance calculation after recalculation
4. Click **Save**

> If an exclusion is made in error, unchecking the box will reinstate the document. Exclusion permission must be granted by your administrator.

**When to use document exclusion:** Document exclusion at the line level is different from order suspension. Use document exclusion when a specific receipt or voucher document has a known discrepancy that is being tracked — for example, a receipt that was partially reversed out of sequence, creating an entry in F43121 that no longer matches the GL. See [Section 11](#section-11-suspension-vs-exclusion--when-to-use-which) for guidance on which to use.

### 7.3 Document Button

The Document button displays a pop-up listing all documents associated with the PO line, combining data from F43121 and F0911. This provides a **side-by-side comparison** of the receipts table and GL amounts for each document.

| Column | Description |
|---|---|
| **Cutoff Date** | The earliest date considered during import. Discrepancies caused by the cutoff date are less likely the further the capture date is from the cutoff. |
| **Capture Date** | The date the data was imported into RapidReconciler |
| **Variance** | The difference between the F43121 amount and the GL amount by document — the key field to review |

### 7.4 Filter Drop-Downs

| Filter | Options | Use |
|---|---|---|
| **Exc (Excluded Docs)** | All / Yes / No | Show all, only excluded, or only non-excluded documents |
| **Rec (Reconciled Docs)** | All / Yes / No | Show all, only reconciled, or only unreconciled documents |
| **Doc** | Individual document selection | Filter to a specific document number |

> **Helpful Trick:** Change the line number to **0** and click Query to display data for **all lines** on the PO. This is extremely useful when diagnosing variances that span multiple lines. The Document button will then show all documents for the entire order.

### 7.5 Recalc and Export

- **Recalc** — Recalculates variances after documents have been excluded. A gear icon in the top right corner indicates the recalculation is in progress. Results are available within a few minutes.
- **Export** — Exports grid data to Excel.

### 7.6 Documents Grid

Lists all transactions for the PO line(s) being filtered, split by data source:

- **F43121 rows** — Receipt and voucher data from the receipts table
- **F0911 rows** — GL detail entries for the same transactions
- Reconciled rows are displayed in **light color**; unreconciled rows are displayed in **grey**

For a side-by-side comparison, click the **Document** button rather than reading the grid rows individually.

---

## Section 8: Step-by-Step Reconciliation Workflow

### 8.1 Frequency Guidance

| Activity | Recommended Frequency |
|---|---|
| Review Orders page for aged receipts | **Weekly** |
| Audit suspended orders | **Monthly** |
| Full reconciliation review | **Weekly** |
| Period-end closing activities | **Period-end close** |

### 8.2 Step 1 — Log In and Select the Data Set

1. Log in to RapidReconciler at [https://rapidreconciler.getgsi.com](https://rapidreconciler.getgsi.com)
2. Navigate to the **PO Receipts** module
3. Confirm both status lights are **green** — do not proceed if either is red
4. Apply the appropriate company and account filters

### 8.3 Step 2 — Validate the Orders Page

1. Set filters to **Reconciled = All; Suspended = No**
2. Sort by **MostRecReceipt** ascending to identify the oldest open receipts
3. Review all orders for accuracy:
   - Orders that are genuinely in transit — leave open
   - Orders cleared by manual voucher — correct in JD Edwards or suspend in RapidReconciler
   - PRLAND = 3 landed cost records — suspend in RapidReconciler
   - Orders at status 999 with no further JD Edwards activity possible — suspend
4. Set filters to **Reconciled = All; Suspended = Yes** — confirm all suspended orders still warrant suspension and have a note explaining why
5. Confirm the **AmtOpen** total is accurate before proceeding

### 8.4 Step 3 — Review the Reconciliation Page

1. Navigate to the **Reconciliation page**
2. If Out of Balance = $0, skip to Step 6
3. Review the Calculation section:

| Field | Required Before Close | Action |
|---|---|---|
| **GL Balance** | Informational | Confirm matches the trial balance |
| **Open Receipts** | Validate first | Confirm matches a JD Edwards Open Receipts report |
| **Out of Balance** | Must be resolved | Investigate each contributing source |
| **Unreconciled** | Resolve or carry forward | Click the link to navigate to unreconciled orders |
| **Batches** | **Must be zero** | Work with finance to post outstanding GL batches |
| **Suggested Entry** | Use if carrying variances forward | Journal entry amount excluding unreconciled orders |

### 8.5 Step 4 — Work Unreconciled Orders

1. Click the **Unreconciled** link on the Reconciliation page (or set Orders page filters to Reconciled = No; Suspended = No)
2. Expand each unreconciled order using the **+** icon
3. Click **Line Analysis** on each grey (unreconciled) line
4. On the Line Analysis page:
   - Change Rec filter to **All** and Line to **0**, then click **Query** to see all transactions for the order
   - Click the **Document** button to view the F43121 vs. GL side-by-side comparison
   - Review the **Variance** column to identify which specific documents are out of balance
5. Determine the root cause and take corrective action (see [Section 10](#section-10-common-issues-and-how-to-resolve-them))
6. If the document cannot be corrected, use **Edit Note** to exclude it and add an audit note
7. Click **Recalc** to update the variance calculations after any exclusions

### 8.6 Step 5 — Make the Adjusting Journal Entry

Once all unreconciled orders have been addressed:

- If all variances are resolved: use the **Out of Balance** amount as the journal entry
- If carrying forward unresolved variances: use the **Suggested Entry** amount
- Post the journal entry in JD Edwards to the RNV account with the appropriate offset account

**Common offset accounts for RNV journal entries:**

| Situation | Offset Account |
|---|---|
| Unvouchered receipt to be written off | Expense / Cost of Goods Sold |
| Price variance between receipt and invoice | Purchase Price Variance (AAI 4330) |
| Goods consumed before voucher match | Cost of Sales Variance (AAI 4332) |
| Standard cost variance | AAI 4335 |
| Exchange rate variance (multi-currency) | AAI 4340 |
| Correction of a processing error | Appropriate correcting account per the error |

### 8.7 Step 6 — Produce and Save the Audit Report

After the reconciliation is complete and the journal entry has been posted:

1. Navigate to the Reconciliation page
2. Confirm the Out of Balance amount is zero after the next nightly refresh
3. Produce and save documentation of the reconciliation for audit purposes

> There is no dedicated Audit Report button in the PO Receipts module as there is in Inventory and In Transit. Save a copy of the Reconciliation page and Orders page (exported to Excel) as the period-end documentation.

---

## Section 9: Working Unreconciled Purchase Orders

### 9.1 Display Unreconciled Orders

Click the **Unreconciled** link on the Reconciliation page. This opens the Orders page with filters preset to Reconciled = No; Suspended = No — showing only orders with variances.

### 9.2 Select and Expand the Order

Click the **+** icon on the left of the order row to expand it. Identify which lines are displayed in grey (unreconciled). Click **Line Analysis** on the line to be investigated.

### 9.3 Perform Order and Line Analysis

On the Line Analysis page:

1. Change the **Rec filter to ALL** and the **Line filter to 0**, then click **Query** to see all transactions for the full order
2. Click the **Document** button for a side-by-side F43121 vs. GL comparison
3. Review the **Variance** column — identify which document(s) show a non-zero variance
4. For each document with a variance, determine whether the discrepancy is in F43121, the GL, or both

### 9.4 Variance Pattern Quick Reference

| Variance Pattern | Likely Cause | Corrective Action |
|---|---|---|
| F43121 amount differs from GL | Receipt cost and GL entry do not match | Investigate the receipt transaction; post a manual journal entry to the GL if needed |
| GL entry exists but no F43121 record | Manual GL entry posted to RNV account | Exclude the GL document in Line Analysis; document the manual entry |
| F43121 record exists but no GL entry | Unposted batch | Post the outstanding batch in JD Edwards |
| Reversal out of sequence | Receipt or voucher reversed after period close | Investigate the reversal; post a correcting journal entry |
| Cutoff date artifact | Data imported from a date after the original receipt | Exclude the document if the original receipt predates the import cutoff |

---

## Section 10: Common Issues and How to Resolve Them

This section consolidates the most frequently encountered RNV reconciliation issues — both at the underlying business-process level and at the RapidReconciler tooling level.

### 10.1 Business-Process Issues

| Issue | Cause | Resolution |
|---|---|---|
| **Unmatched receipt** | Goods received but supplier invoice not yet processed | Process voucher match in JD Edwards (P4314) when the invoice is received |
| **Manual GL entry used to clear RNV** | A journal entry was posted directly to the RNV account instead of processing through voucher match | Suspend the order in RapidReconciler; verify the GL is correct |
| **Price variance at voucher match** | Invoice amount differs from receipt amount; AAI 4330 or 4332 not configured to clear RNV | Review AAI configuration; post manual journal entry if needed |
| **Standard cost variance** | Receiving at a different cost than the standard (AAI 4335) | Verify DMAAI 4335 configuration for the applicable order type |
| **Exchange rate variance** | Multi-currency orders where the rate changed between receipt and voucher match | Review AAI 4340; post manual entry to clear residual |
| **Landed cost not vouchered** | Landed cost applied at receipt with PRLAND = 2 but voucher match not completed | Process voucher match for the landed cost; or set PRLAND = 3 if accrual only |
| **Aging open receipts** | Old receipts never vouchered accumulating in the balance | Investigate each aged item; process voucher match, reversal, or manual entry as appropriate |
| **Duplicate receipt or voucher** | Same receipt or voucher processed more than once | Reverse the incorrect transaction in JD Edwards |
| **Purchase order incorrectly closed** | Order set to status 999 without voucher match | Reopen and reprocess through standard voucher match, or write off via journal entry |

### 10.2 RapidReconciler Tooling Issues

| Issue | Cause | Resolution |
|---|---|---|
| **Open Receipts balance does not match JD Edwards** | Timing difference — RapidReconciler imports nightly; JD Edwards report run at a different time | Run both reports at approximately the same time; confirm timing of last import |
| **Suspended order reappears after unsuspension** | New activity posted against the order | Review the new activity; re-suspend if appropriate or process the voucher match |
| **Aged open receipts accumulating** | Supplier invoices not being processed promptly; or receipts processed without corresponding voucher matches | Investigate each aged receipt; contact the supplier for the invoice; consider writing off if the receipt is no longer valid |
| **Large number of unreconciled orders** | DMAAI misconfiguration causing receipts to post to a different account than expected | Review DMAAI 4320 configuration. See DMAAI Reference Guide. |
| **Variance on a specific document** | Reversed receipt or voucher processed out of sequence; rounding difference; tax entry mismatch | Use Line Analysis Document view to compare F43121 vs. GL; exclude the document if the discrepancy is known and justified |
| **PRLAND = 3 records causing permanent variance** | Accrual-only landed costs that will never be vouchered | Suspend the order in RapidReconciler |
| **Tax entries creating unexpected variances** | Tax explanation codes S, U, V, C, or B generate different AAI entries at receipt vs. voucher match | Review tax configuration. See Purchase Order Reference Guide. |
| **Carry-forward balance growing each period** | Unresolved variances being deferred using Suggested Entry instead of being resolved | Prioritize working unreconciled orders before close; avoid using Suggested Entry as a routine practice |
| **Status light is red** | Prior period issue or import failure | Hover for details; contact administrator if import failed |
| **Batches amount is non-zero** | Unposted F0911 batches | Work with finance to post outstanding batches before closing |

---

## Section 11: Suspension vs. Exclusion — When to Use Which

A common point of confusion is when to **suspend an order** versus when to **exclude a document**. Both remove amounts from variance calculations, but they operate at different levels.

| Action | Scope | Use When |
|---|---|---|
| **Order Suspension** | Entire purchase order | The whole order should be ignored — e.g., PRLAND = 3 landed cost, manual voucher clearance for the entire order, or a data cutoff artifact affecting the whole order |
| **Document Exclusion** | Individual document (single receipt or voucher) | The order is mostly correct, but a specific document has a known discrepancy — e.g., a single receipt reversed out of sequence, a tax rounding difference, or a manual GL entry tied to one document |

**Rule of thumb:** If the issue affects every line on the order, suspend the order. If the issue is limited to a specific receipt or voucher number, exclude the document.

> Both actions affect only RapidReconciler — neither changes any data in JD Edwards. Always document the reason in the note field.

---

## Section 12: Key Benefits

Using RapidReconciler for RNV reconciliation provides the following advantages:

- **Consolidated platform** — RNV reconciliation is performed in the same application as inventory and goods in-transit reconciliation, reducing the need for multiple tools
- **Automated balancing** — Receipt table data is automatically imported and compared to general ledger details, eliminating manual matching
- **Focused exception reporting** — The Unreconciled link surfaces only the orders with issues, saving time during the reconciliation process
- **Flexible handling** — Orders cleared by manual voucher can be suspended, and individual documents can be excluded, preventing them from distorting variance calculations
- **Full drill-down capability** — From the summary level down to the individual document, all detail is accessible within the application
- **Aging visibility** — Open receipts can be reviewed by age to identify and address items that have been outstanding for extended periods
- **Audit trail** — Notes can be attached to suspensions and exclusions, providing documentation for audit review

---

## Section 13: Glossary

| Term | Definition |
|---|---|
| **AAI** | Automatic Accounting Instruction — JD Edwards configuration that maps transactions to GL accounts |
| **DMAAI** | Distribution/Manufacturing AAI — the AAI subset used by purchasing and inventory transactions |
| **F0902** | Account Balances table — source of GL balance |
| **F0911** | Account Ledger table — source of GL transaction detail |
| **F43121** | PO Receiver table — source of receipt and voucher match transaction detail |
| **Match Type** | Field in F43121 identifying the type of transaction (1 = Receipt, 2 = Voucher Match, 3 = Reversal of Receipt, 4 = Reversal of Voucher Match, 5 = Landed Cost Receipt, 6 = Landed Cost Voucher Match) |
| **P4312** | JD Edwards PO Receipts program |
| **P4314** | JD Edwards Voucher Match program |
| **P0411** | JD Edwards Standard Voucher Entry program |
| **PRLAND** | F43121 field identifying record as standard receipt or landed cost |
| **RNV** | Received-Not-Vouchered — the temporary liability account holding the value of received but unvouchered goods |
| **Suspension** | RapidReconciler action that flags an order to be ignored in variance calculations |
| **Exclusion** | RapidReconciler action that removes a specific document from variance calculations |

---

## Section 14: Related Documentation

| Document | Relevance |
|---|---|
| [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md) | Complete AAI configuration for all purchasing transactions |
| [Accounting in Purchasing](../MDS/accounting-in-purchasing.md) | Detailed accounting flow for the purchasing process |
| [Purchase Order Reference Guide](../MDS/purchase_order_reference.md) | Tax treatment by code, landed cost setup and journal entries, receipts routing accounting |
| [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md) | Root causes of GL balance discrepancies |
| [How to Reconcile Inventory](../MDS/inventory-using-application.md) | Parallel workflow for perpetual inventory reconciliation |
| [How to Reconcile In Transit](../MDS/in-transit-using-application.md) | Parallel workflow for goods in transit reconciliation |
| [Getting Started with RapidReconciler](../MDS/getting-started-with-rapidreconciler.md) | Login, navigation, and application overview |

---

*For more information about RNV reconciliation in RapidReconciler, contact GSI support at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com) with "RNV for RapidReconciler" in the subject line.*
