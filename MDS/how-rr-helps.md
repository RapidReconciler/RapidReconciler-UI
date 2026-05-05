---
---

# How RapidReconciler Helps

## Reconciliation for JD Edwards Inventory, In Transit, and PO Receipts

---

Reconciling inventory to the general ledger in JD Edwards is one of the most time-consuming tasks in a period-end close. The standard approach -- running a Stock Status report and comparing it to the trial balance -- has five well-documented failure points: **timing**, **backdating**, **report definition errors**, **DMAAI misconfiguration**, and **GL class code changes**. Each one produces a mismatch that must be traced manually, and most recur every period if the root cause is never found.

RapidReconciler replaces that manual process with a continuous, automated reconciliation updated every nightly import cycle. Rather than discovering what went wrong at period end, reconcilers confirm a position they already understand.

> **Key principle:** RapidReconciler reads JD Edwards data in read-only mode. It never modifies JDE tables. All corrections are made in JD Edwards -- RapidReconciler's role is to identify exactly what is out of balance, where the discrepancy originates, and what the correct corrective action is.

---

## The Three Modules

RapidReconciler covers three balance sheet reconciliations, each with its own dedicated module:

| Module | What Is Reconciled | Key Tables |
|---|---|---|
| **Inventory** | Perpetual item ledger balance vs. GL | F4111 vs. F0902 / F0911 |
| **In Transit** | Goods-in-transit clearing account vs. open ST/OT orders | F4111 / F43121 vs. F0902 / F0911 |
| **PO Receipts** | Received-not-vouchered (RNV) balance vs. open receipts | F43121 vs. F0902 / F0911 |

---

## Module 1 -- Inventory Reconciliation

### The Challenge

The perpetual inventory balance and the GL balance should always agree. In practice, timing differences, DMAAI mismatches, cardex integrity issues, unposted batches, and GL class code changes each create variances that the standard Stock Status report cannot identify, isolate, or explain. Without a way to break the total variance into its sources, every close starts with an unexplained number.

### How RapidReconciler Helps

**Valuation Section** compares the summarized F4111 perpetual balance to the F0902 GL balance automatically for every period. No manual report run is required. If the out-of-balance is zero, inventory is reconciled.

**Variance Calculation Section** breaks the total out-of-balance into six labeled sources -- Carry Forward, GL Batches, End of Day, Transactions, Cardex, and Manual Journal Entries -- so each can be addressed with the correct corrective action rather than treating the total as one unexplained number.

**Cardex Integrity Pop-Up** automatically compares summarized F4111 to F41021 for every item on every import cycle. It surfaces only items with variances and distinguishes between quantity issues (requiring IT intervention) and dollar-only issues (requiring a dollars-only IA adjustment in JD Edwards).

**Transactions Page** identifies individual documents where the item ledger does not match the GL, surfaces the specific matching field that differs, and provides drill-down to the DMAAI setup responsible for the mismatch. The Transaction Detail report shows the full F4111 cardex, F0911 GL entries, and all DMAAI entries for every GL class code in the transaction -- making it possible to identify the exact AAI causing an account mismatch without manually cross-referencing JD Edwards setup screens.

**As-Of Page** maintains a continuously updated period-end inventory position by item, branch, location, and lot. It includes QtyVar and AmtVar columns that surface cardex integrity issues at the item level, and replaces the timing-dependent Stock Status report entirely.

**Integrity Reports 2--6** proactively identify DMAAI mismatches, excluded GL class codes, UOM conversion gaps, GL class code inconsistencies between item branch and location records, and frozen cost discrepancies -- the configuration issues that silently create reconciling variances -- before they accumulate into large period-end problems.

**Audit Report** produces a complete period-end reconciliation document including account summaries, unposted batches, open orders, manual entries, transaction variances, and perpetual detail, exportable for internal review and audit support.

---

## Module 2 -- In Transit Reconciliation

### The Challenge

When goods move between branch plants via ST/OT transfer orders, their value sits in a clearing account until receipt. Standard cost changes between order entry and shipment, cost differences between branches, and quantity mismatches between ship and receive all create balances that do not clear. Once both the ST and OT orders reach status 999, no further JD Edwards processing is possible and the balance remains indefinitely without a systematic way to identify and manage it.

### How RapidReconciler Helps

**Orders Page** automatically calculates the in-transit position (Shipments minus Receipts) for every order pair and displays only those with an open quantity or amount. Orders that reconcile exactly are removed automatically -- no manual filtering required.

**Exclusion Process** isolates residual balances on fully closed (status 999) order pairs and surfaces the exact journal entry value needed to clear the In Transit GL account. Previously excluded orders are monitored for new activity via the ExclVarQty and ExclVarAmt columns -- if a receipt is processed against an excluded order, the discrepancy surfaces immediately rather than being silently omitted from the reconciliation.

**Variance Calculation Section** separates the total out-of-balance into Carry Forward, GL Batches, End of Day, Transactions, Exclusions, and Manual Journal Entries -- each with the appropriate resolution path.

**As-Of Page** reconstructs the in-transit position as of any historical period end date, calculated backwards from the current position, with full transaction-level detail and drill-down for audit support.

**Integrity Report 4 -- Transfer Cost Variances** lists orders where the ST sales cost or price does not match the OT purchase order cost, which is the most common cause of In Transit balances that do not clear after receipt. These are surfaced proactively before they accumulate into large unresolved period-end balances.

---

## Module 3 -- PO Receipts (RNV) Reconciliation

### The Challenge

The F43121 table is not a true ledger. Receipt and voucher reversals overwrite existing records rather than creating new entries, making As-Of reporting impossible. Reconciliation must always be performed as a current balance-to-balance comparison -- open receipts now vs. GL balance now. Without automation, this means manually matching Match Type 1 and 2 records across hundreds or thousands of PO lines every period with no historical roll-forward to rely on.

### How RapidReconciler Helps

**Orders Page** imports F43121 and F0911 automatically and displays only purchase orders with open amounts or variances. Fully reconciled orders are removed automatically.

**Calculation Section** separates the out-of-balance into Open Receipts, Unreconciled, and Batches components and provides a Suggested Entry amount that excludes outstanding variances -- making it straightforward to decide whether to close around unresolved items or resolve them first.

**PO Receipts Aging** provides an immediate visual breakdown of open receipts by period, identifying whether the RNV balance is driven by recent legitimate activity or aged receipts that have not been vouchered -- without running a separate aging report.

**Suspension Feature** removes orders cleared by manual voucher entry, accrual-only landed costs (PRLAND = 3), or data cutoff artifacts from the variance calculation, isolating genuine unresolved items from known exceptions without changing JD Edwards data.

**Line Analysis Page** provides a side-by-side F43121 vs. GL comparison at the document level for any purchase order line, with document-level exclusion, audit notes, and a Recalc function that updates variance calculations within minutes.

**Unreconciled Link** navigates directly from the Reconciliation page to a pre-filtered Orders view showing only orders requiring action, removing the need to manually filter the full order listing each period.

---

## Proactive Configuration Monitoring

Beyond the reconciliation itself, RapidReconciler monitors the DMAAI configuration that drives every GL posting in JD Edwards distribution. A single misconfigured AAI causes every transaction of a given type to post to the wrong account -- silently, with no error message -- creating a growing systematic variance that is difficult to trace manually.

The Integrity Reports surface these issues proactively:

| Report | What It Checks |
|---|---|
| **Integrity Report 1 -- Model Table** | Verifies the DMAAI 4152 model table assigns a valid GL account to every GL class code in the system |
| **Integrity Report 2 -- DMAAI Entry Integrity** | Compares balance sheet DMAAI entries against the model table and flags object, business unit, and subsidiary mismatches |
| **Integrity Report 3 -- Excluded GL Classes** | Lists GL class codes present in item ledger transactions but missing from the model table -- these items are silently excluded from the reconciliation |
| **Integrity Report 4 -- Transfer Cost Variances** | Lists ST/OT order pairs where the sales cost and purchase order cost do not match |
| **Integrity Report 5 -- GL Class Integrity** | Compares GL class codes between Item Branch (F4102) and Item Location (F41021) records and surfaces mismatches |
| **Integrity Report 6 -- Frozen Cost Integrity** | Identifies items where the frozen cost in F4105 does not match the cost used in recent cardex transactions |

**Transaction Detail Drill-Down** is available for any unreconciled transaction on the Transactions page. It shows the complete F4111 cardex, F0911 GL entries, and all DMAAI entries for every GL class code in the transaction -- making it possible to trace the exact AAI that caused an account mismatch without navigating through JD Edwards setup menus.

---

## Before and After

| Without RapidReconciler | With RapidReconciler |
|---|---|
| Run Stock Status and trial balance, compare manually in Excel | F4111 vs. F0902 comparison performed automatically on every nightly import |
| Extract F4111, exclude memo transactions, compare to F41021 by hand for every item | Cardex Integrity pop-up shows exactly which items have variances and whether it is a quantity or dollar issue |
| No visibility into which DMAAI caused an account mismatch without tracing each transaction | Transaction Detail drill-down identifies the specific DMAAI entry causing any account mismatch |
| GL class code mismatches detected only when a reconciling variance appears -- often months later | Integrity Reports 2, 3, and 5 proactively flag DMAAI and GL class code issues monthly |
| RNV reconciliation requires matching F43121 records to GL entries manually across hundreds of PO lines | PO Receipts module shows only unreconciled orders and enables document-level investigation |
| In Transit clearing account balanced by manually comparing shipment and receipt records per order | In Transit module calculates the open position per order pair, surfaces cost mismatches, and manages exclusions with a full audit trail |
| Unresolved variances carried forward indefinitely because the root cause was never identified | Every variance source is labeled, quantified, and linked to the correct corrective action |

---

## Important to Know

**RapidReconciler is read-only.** It reads JD Edwards data and never modifies JDE tables. All corrections -- adjustments, journal entries, AAI changes -- are made in JD Edwards.

**Data is refreshed nightly.** Transactions entered in JD Edwards after the most recent import will not appear until the following night's refresh. Both status lights on the Reconciliation page must be green before making any adjustments to the general ledger.

**History is calculated from the initiation date.** RapidReconciler calculates its cardex position from the point the program was first initiated or from the last data reset. Transaction history predating that point is not visible without a Re-Roll.

---

*The period-end close should be a confirmation of what you already know -- not a discovery of what went wrong.*

---

*For support, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com) or log in at [rapidreconciler.getgsi.com](https://rapidreconciler.getgsi.com)*
