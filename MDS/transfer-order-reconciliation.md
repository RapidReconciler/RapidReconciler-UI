# How to Reconcile In Transit Using RapidReconciler

## A Step-by-Step Process Guide

---

## Table of Contents

1. [Purpose of This Guide](#1-purpose-of-this-guide)
2. [Quick Reference: The Reconciliation Process at a Glance](#2-quick-reference-the-reconciliation-process-at-a-glance)
3. [Process Flow Diagram](#3-process-flow-diagram)
4. [Before You Begin](#4-before-you-begin)
5. [The Seven-Step Reconciliation Process](#5-the-seven-step-reconciliation-process)
   - [Step 1 — Log In and Verify System Health](#step-1--log-in-and-verify-system-health)
   - [Step 2 — Review and Triage Open Orders](#step-2--review-and-triage-open-orders)
   - [Step 3 — Read the Reconciliation Page](#step-3--read-the-reconciliation-page)
   - [Step 4 — Resolve Each Variance Source](#step-4--resolve-each-variance-source)
   - [Step 5 — Investigate Transaction-Level Variances](#step-5--investigate-transaction-level-variances)
   - [Step 6 — Post Journal Entries and Close](#step-6--post-journal-entries-and-close)
   - [Step 7 — Run Integrity Reports and Save the Audit Report](#step-7--run-integrity-reports-and-save-the-audit-report)
6. [Reference: Key Pages and What They Show](#6-reference-key-pages-and-what-they-show)
7. [Reference: Variance Sources and Resolution Actions](#7-reference-variance-sources-and-resolution-actions)
8. [Reference: Integrity Reports](#8-reference-integrity-reports)
9. [Reference: Supporting Widgets and Tools](#9-reference-supporting-widgets-and-tools)
10. [Troubleshooting Common Scenarios](#10-troubleshooting-common-scenarios)
11. [Best Practices and Tips](#11-best-practices-and-tips)
12. [Recommended Cadence](#12-recommended-cadence)
13. [Glossary](#13-glossary)
14. [Related Documentation](#14-related-documentation)

---

## 1. Purpose of This Guide

This guide walks you through reconciling the **In Transit clearing account** in RapidReconciler from start to finish. By the end of the process, you will be able to:

- Confirm the In Transit GL balance ties to open transfer order activity
- Identify and resolve every source of variance
- Post the correct journal entries in JD Edwards
- Produce a complete audit trail for period-end close

### What Is Being Reconciled

When goods are shipped from Branch A to Branch B, their value sits in a clearing account (typically via DMAAI 4220 or 4245) until they are received at the destination. If the shipment and receipt do not match in both quantity and amount, a balance remains in the clearing account that must be explained and cleared.

| Side | Source | Description |
|---|---|---|
| **In Transit Balance** | ST/OT order pairs (Shipments − Receipts) | Open transfer order activity |
| **GL Balance** | F0902 Account Balances | Period-end balance for the In Transit clearing account |
| **Out of Balance** | The difference between the two | What you must explain and resolve |

> **Key principle:** RapidReconciler does **not** correct In Transit issues. All corrections happen in JD Edwards or through manual journal entries. RapidReconciler's job is to tell you exactly which orders are unbalanced, by how much, and why — so you can take the right action.

> Although this guide refers to ST/OT order types, RapidReconciler detects different transfer types based on a flag in the F4211 table.

---

## 2. Quick Reference: The Reconciliation Process at a Glance

| # | Step | Page / Tool | Goal |
|---|---|---|---|
| 1 | Log in and verify system health | Reconciliation page | Both status lights green |
| 2 | Review and triage open orders | Orders page | Exclude closed-but-unbalanced pairs |
| 3 | Read the Reconciliation page | Reconciliation page | Identify the Out of Balance amount |
| 4 | Resolve each variance source | Variance Calculation section | Address Carry Forward, GL Batches, End of Day, Transactions, Exclusions |
| 5 | Investigate transaction-level variances | Transactions page | Understand root cause of each item |
| 6 | Post journal entries and close | JD Edwards | Clear remaining variance |
| 7 | Run integrity reports and save audit report | Integrity Reports + Audit Report | Confirm clean configuration; document the close |

---

## 3. Process Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                    START: Begin Reconciliation                       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────────┐
              │  STEP 1: Log in & select period    │
              │  Both status lights GREEN?         │
              └──────────────┬─────────────────────┘
                             │
                  ┌──────────┴──────────┐
                  │ NO                  │ YES
                  ▼                     ▼
      ┌──────────────────┐   ┌────────────────────────────────────┐
      │ Resolve prior    │   │  STEP 2: Review Orders page        │
      │ period or        │   │  • Exclude status-999 pairs        │
      │ contact admin    │   │  • Check ExclVarQty / ExclVarAmt   │
      └──────────────────┘   └──────────────┬─────────────────────┘
                                            │
                                            ▼
                             ┌────────────────────────────────────┐
                             │  STEP 3: Read Reconciliation page  │
                             │  Out of Balance = $0?              │
                             └──────────────┬─────────────────────┘
                                            │
                                 ┌──────────┴──────────┐
                                 │ YES                 │ NO
                                 ▼                     ▼
                      ┌──────────────────┐   ┌────────────────────────┐
                      │ Skip to Step 7   │   │  STEP 4: Resolve each  │
                      │ (Audit Report)   │   │  variance line         │
                      └────────┬─────────┘   └──────────┬─────────────┘
                               │                        │
                               │             ┌──────────▼────────────┐
                               │             │  Transactions ≠ $0?    │
                               │             └──────────┬────────────┘
                               │                        │
                               │             ┌──────────▼────────────┐
                               │             │  STEP 5: Investigate  │
                               │             │  on Transactions page │
                               │             └──────────┬────────────┘
                               │                        │
                               │             ┌──────────▼────────────┐
                               │             │  STEP 6: Post JEs in  │
                               │             │  JD Edwards & wait    │
                               │             │  for nightly refresh  │
                               │             └──────────┬────────────┘
                               │                        │
                               └────────────┬───────────┘
                                            ▼
                             ┌────────────────────────────────────┐
                             │  STEP 7: Integrity reports +       │
                             │  Save Audit Report                 │
                             └──────────────┬─────────────────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │  END: Period     │
                                   │  Reconciled      │
                                   └──────────────────┘
```

---

## 4. Before You Begin

### 4.1 Prerequisites

| Item | Requirement |
|---|---|
| **RapidReconciler access** | Login credentials provided by your administrator |
| **Permissions** | Access to the In Transit module and applicable companies |
| **JD Edwards access** | Required to investigate and correct issues identified in RapidReconciler |
| **Background knowledge** | Familiarity with ST/OT order types, DMAAI configuration, and the In Transit clearing account |

### 4.2 Critical Rules to Remember

> 1. **Both status lights must be GREEN** before making any GL adjustments.
> 2. **Data refreshes nightly.** JD Edwards transactions entered today won't appear until tomorrow's refresh.
> 3. **RapidReconciler is read-only.** Every correction is made in JD Edwards.
> 4. **The Orders page always shows the *current* position** — changing the period selector does not change what it displays.

### 4.3 Mindset for Success

- **Do this often, not just at month-end.** A weekly walk-through of the Orders page prevents period-end surprises.
- **Document as you go.** Notes on transactions become the audit trail.
- **Always investigate before excluding.** An exclusion you regret is harder to undo than one you delayed.

---

## 5. The Seven-Step Reconciliation Process

### Step 1 — Log In and Verify System Health

**Goal:** Confirm the system is ready for reconciliation work.

1. Log in to RapidReconciler at **https://rapidreconciler.getgsi.com**.
2. Navigate to the **In Transit** module. The Reconciliation page opens by default.
3. Use the period selector (top right) to choose the period being reconciled.
4. Apply company and account filters as needed (Company → Business Unit → Object → Subsidiary).
5. Verify the two status indicators:

| Indicator | Green Means | If Red |
|---|---|---|
| **In Transit Validation** | The carry-forward from prior period is accurate | Hover for details; resolve the prior period before proceeding |
| **System Status** | The JD Edwards import completed successfully | Hover for details; contact your administrator |

> If the System Status light is **flashing yellow**, the import is in progress. Wait for it to finish before continuing.

**Do not proceed to Step 2 if either light is red.** Fixing the underlying issue first prevents wasted work.

---

### Step 2 — Review and Triage Open Orders

**Goal:** Make sure the Orders page lists only what is *truly* in transit. Everything else must be excluded.

1. Navigate to the **Orders page**.
2. Review every order pair. For each one, decide its disposition:

| Situation | Action |
|---|---|
| Both ST and OT at status **999** with remaining balance | **Exclude** — no further JD Edwards activity is possible |
| OT not yet received or partially received; more receipts expected | **Leave open** — legitimately in transit |
| Partial receipt; remaining quantity unclear | **Investigate** with the warehouse before excluding |
| Cost variance only; quantity is zero | **Exclude** and post a JE for the dollar variance |

3. Before excluding, **research each order** in JD Edwards to confirm no further activity will occur.
4. Check the **ExclVarQty** and **ExclVarAmt** columns. Any non-zero value means new transactions have hit a previously excluded order — you must **unexclude and re-exclude** to recalculate.
5. Note the total **Exclusions amount** at the bottom of the page. This becomes your offsetting journal entry amount in Step 6.

#### Order Pair Columns to Know

| Column | Meaning |
|---|---|
| **From / To** | Shipping and receiving branch plants |
| **TranQty** | In-transit quantity (Ship Qty − Rec Qty) |
| **TranAmt** | In-transit amount (Ship Amt − Rec Amt) |
| **Ship Sts / Rec Sts** | Current status of the ST and OT orders |
| **ExclQty / ExclAmt** | Quantity and amount previously excluded |
| **ExclVarQty / ExclVarAmt** | New activity on previously excluded orders — review every period |

> **What is an exclusion?** Excluding an order pair tells RapidReconciler to stop counting it toward the In Transit balance. It does **not** change anything in JD Edwards — the GL balance still needs an offsetting journal entry.

---

### Step 3 — Read the Reconciliation Page

**Goal:** Quantify the Out of Balance amount and decide what to investigate.

1. Return to the **Reconciliation page**.
2. Look at the **Valuation section**:

| Field | Source | Meaning |
|---|---|---|
| **GL Balance** | F0902 | Period-end balance of the In Transit clearing account |
| **In Transit Balance** | ST/OT pairs (Shipments − Receipts) | Calculated from open transfer activity |
| **Out of Balance** | GL − In Transit | What needs to be explained |

3. **If Out of Balance = $0**, skip ahead to Step 7 — you are reconciled.
4. **If Out of Balance ≠ $0**, continue to Step 4 to address each variance source.

---

### Step 4 — Resolve Each Variance Source

**Goal:** Walk down the Variance Calculation section and address every non-zero line. The sum of all lines equals the Out of Balance amount.

| Variance Line | Must Be Zero to Close? | Resolution |
|---|---|---|
| **Carry Forward** | Investigate | Resolve in prior period or roll into current JE |
| **GL Batches** | **Yes** | Work with finance to post all open batches |
| **End of Day** | **Yes** | Confirm Sales Update (R42800) ran for transfer orders |
| **Transactions** | Investigate | Drill in via Step 5 and prepare offsetting JEs |
| **Exclusions** | Prepare JE | Post journal entry for the excluded amount |
| **Manual Journal Entries** | Informational | Confirm entries are correctly reflected |

#### 4.1 Carry Forward

The unresolved out-of-balance amount from the prior period.

**Resolve by:** Returning to the prior period to investigate, or — if the prior period is closed — including the amount in the current period's manual journal entry. Document the reason.

#### 4.2 GL Batches

Entries in F0911 where the posted code is not "P" (not yet posted to the GL).

**Resolve by:** Working with finance to post the outstanding batches. A **bell icon** flags batches more than 2 days old — prioritize these. If a batch header is missing, run JD Edwards' "Missing Batch Header" report.

> GL Batches **must be zero** before performing closing activities.

#### 4.3 End of Day

Transfer sales orders that have been ship confirmed but not yet processed through Sales Update (R42800/P42800).

**Resolve by:** Confirming the Sales Update version configured for transfer orders is scheduled and completing successfully. The In Transit Sales Update version must have the **A/R interface turned off**. A **bell icon** flags orders more than 2 days old.

> End of Day **must be zero** before closing. Until Sales Update runs, the shipment has no batch number or GL date.

#### 4.4 Transactions

Documents where the item ledger (F4111) does not match the GL (F0911). Common causes: DMAAI mismatches, fiscal period differences, account number discrepancies.

**Resolve by:** Going to the Transactions page (Step 5) to investigate each item. The corrective action is always an offsetting JE in JD Edwards plus a note in RapidReconciler.

#### 4.5 Exclusions

The "leftover" balance from order pairs you excluded in Step 2.

**Resolve by:** Posting a journal entry in JD Edwards — debit or credit the In Transit account and offset to an appropriate variance or expense account per your organization's policy.

#### 4.6 Manual Journal Entries

Manual entries posted directly to the In Transit GL account. Informational only — confirms they are reflected in the variance calculation.

#### 4.7 Example Variance Calculation

| Variance Source | Amount | Status |
|---|---|---|
| Carry Forward | ($750.10) | Investigate prior period |
| GL Batches | $0.00 | ✓ Clear |
| End of Day | $0.00 | ✓ Clear |
| Transactions | $0.00 | ✓ Clear |
| Exclusions | ($23.31) | Post journal entry |
| Manual Journal Entries | $0.00 | ✓ Clear |
| **Unreconciled Variance** | **($773.41)** | **Total requiring resolution** |

---

### Step 5 — Investigate Transaction-Level Variances

**Goal:** Determine the root cause of every transaction variance and prepare corrective journal entries.

1. Navigate to the **Transactions page**.
2. Note that transactions differing by less than 1 monetary unit are filtered by default but still counted in totals (administrator can adjust the tolerance).
3. For each row, click the **+ icon** on the left to open the Transaction Detail report. The report has six sections:

| Section | Contents |
|---|---|
| **1 — Unassigned Account** | Cardex transactions with a GL class code missing from the model DMAAI table |
| **2 — F4111 Cardex** | All F4111 rows for the company, document type, and document number |
| **3 — F0911 GL** | All F0911 rows for the same |
| **4 — RapidReconciler** | How RapidReconciler matches the data (one row = match; multiple = mismatch) |
| **5 — Order Data** | For PO receipts and sales shipments, all lines for the associated order |
| **6 — DMAAIs** | All DMAAI entries for each GL class code (first row = model table) |

4. **Analysis tips:**
   - Verify company number, account number, and period ending date match across Sections 2 and 3.
   - If account numbers differ, consult the DMAAI setup in Section 6.
   - Refer to the [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md) for configuration help.

5. Determine the root cause: **DMAAI mismatch**, **period mismatch**, or **account mismatch**.
6. Prepare an **offsetting journal entry in JD Edwards** for each variance.
7. **Add a note** in RapidReconciler documenting the corrective action.

> **Best practice:** include your name and date in every note. Notes appear on the period-end audit report.

8. Optionally mark the transaction **"Worked"** to filter it off the grid (this is a view filter only — totals do not change).

---

### Step 6 — Post Journal Entries and Close

**Goal:** Clear the remaining variance and confirm the period reconciles.

#### Pre-Close Checklist

- [ ] GL Batches = **$0**
- [ ] End of Day = **$0**
- [ ] All transaction variances reviewed and JEs prepared
- [ ] Exclusion journal entry prepared for the Exclusions amount
- [ ] Carry-forward amount included in the JE if applicable

#### Posting the Journal Entries

| Use This Tool | When |
|---|---|
| **Journal Entry button** | Account-level entries — produces an Excel report of GL and In Transit balances |
| **Offset Account widget** (star icon on the End of Day row) | Transaction-level offsets at close |
| **Manual JE in JD Edwards** | Exclusion amounts (see [Transfer Order Exclusion Guide](../MDS/transfer_order_exclusion_guide.md)) |

> The Offset Account widget is for End of Day **only** — there is no Transactions offset in this module. After exporting to Excel, replace any "Tolerance Adjust" or "TBD" placeholders with correct GL accounts, then copy the two rightmost columns into JD Edwards. Do not use mid-period — it's a close-only tool.

#### Confirm Reconciliation

After posting in JD Edwards:

1. **Wait for the next nightly refresh** (RapidReconciler does not see your JE until then).
2. Return to the Reconciliation page.
3. Confirm **Out of Balance = $0**.
4. If a residual variance remains, return to Step 4 and identify which line moved.

---

### Step 7 — Run Integrity Reports and Save the Audit Report

**Goal:** Verify clean configuration and produce permanent documentation.

1. Run the four **Integrity Reports** as part of the period-end close:

| Report | Name | Purpose |
|---|---|---|
| **Report 1** | Model AAI Table | Verify all GL class codes have correct account assignments |
| **Report 2** | Missing GL Classes | Add missing GL class codes to the transit DMAAI table 4310 |
| **Report 3** | Order Exclusions | Confirm all exclusions are correct and accounted for |
| **Report 4** | Transfer Cost Variances | Investigate any orders with non-zero **UnitPrVar** — most common cause of unresolved In Transit balances |

2. Click the **Audit Report** button.
3. Save the output (Excel or PDF) to a dedicated period-end folder.

> **Save the Audit Report *before* any data purge.** Detail data may be removed during a purge and cannot be recreated.

The audit report contains:

| Section | Contents |
|---|---|
| Accounts Summary | Valuation and variance summary per account |
| Unposted GL Batches | Details of any remaining unposted batches |
| End of Day | Sales orders awaiting Sales Update |
| Manual Journal Entries | All manual entries to the account |
| Variances | Transaction variances with user-entered notes |
| Perpetual Details | Item balances and values at period end |

**You are done.** The period is reconciled and documented.

---

## 6. Reference: Key Pages and What They Show

| Page | Shows | Period Behavior |
|---|---|---|
| **Reconciliation** | Valuation, variance calculation, and overall close status | Honors selected period |
| **Orders** | Open ST/OT order pairs with a remaining quantity or amount | Always **current** position regardless of period |
| **Transactions** | F4111 vs F0911 mismatches at the document level | Honors selected period |
| **As-Of** | In-transit position as of any historical period end | Calculated **backwards** from the Orders page totals |

### About the As-Of Page

The As-Of page reconstructs what was in transit at any prior period end by walking backward from the current Orders page totals.

- The total will always match the Reconciliation page total for the same period.
- It will only match the Orders page total if the **current period** is selected.
- Calculations are dynamic — backdated activity changes prior As-Of positions.
- Click the **+** sign on any row for transaction-level detail in reverse date sequence (sourced from sales/purchase orders, not the item ledger).
- "Exclusion Adjust" entries in detail are RapidReconciler adjustments, not JD Edwards transactions.

---

## 7. Reference: Variance Sources and Resolution Actions

| Source | Where It Comes From | Where to Resolve | Must Be Zero to Close? |
|---|---|---|---|
| Carry Forward | Prior period out-of-balance | Prior period or current JE | Investigate |
| GL Batches | F0911 unposted entries | Finance — post the batches | **Yes** |
| End of Day | Ship confirmed without Sales Update | R42800 / P42800 | **Yes** |
| Transactions | F4111 vs F0911 mismatch | JE in JDE + note in RapidReconciler | Investigate |
| Exclusions | Excluded order pair leftovers | JE in JDE | Prepare JE |
| Manual JEs | Direct GL entries | Verify only | Informational |

---

## 8. Reference: Integrity Reports

Review these when RapidReconciler is first installed and **monthly** during period-end close.

| Report | Name | Frequency | Purpose |
|---|---|---|---|
| **0** | JDE AAIs | Debugging only | Analyze DMAAI configuration when investigating Transactions items |
| **1** | Model AAI Table | Before GL adjustments | DMAAI 4152 entries for transfer order GL account assignment |
| **2** | Missing GL Classes | Monthly | Transfer pairs where GL class code is missing from DMAAI 4310 — silently excluded otherwise |
| **3** | Order Exclusions | Monthly | All excluded order pairs — verify exclusions and confirm audit trail |
| **4** | Transfer Cost Variances | Monthly | Orders where ST sales cost/price ≠ OT purchase cost — most common cause of stuck In Transit balances |

### Report 4 — Key Columns

| Column | Description |
|---|---|
| **TransPrc** | Transfer cost or price of the item |
| **SOExtCost / SOExtAmt** | Extended cost and price on the sales order |
| **POUnitCost / POTotal** | Unit cost and total on the purchase order |
| **UnitPrVar** | Variance between sales price and purchase cost — amount that will not clear |
| **QtyVar** | Difference in units shipped vs received |
| **CostMthd** | Cost method in receiving branch — determines variance handling |

> A non-zero **UnitPrVar** means the In Transit account will carry a balance for that order pair even after receipt. This is the most common cause of unresolved In Transit variances. Review DMAAI 4335 configuration and ST/OT price management procedures.

---

## 9. Reference: Supporting Widgets and Tools

| Tool | Where Found | What It Does |
|---|---|---|
| **Drill Down Widget** | Reconciliation page | Visual breakdown of where the largest variances exist; drill from currency → company → BU → account |
| **Offset Account Widget** | Star icon on End of Day row | Generates suggested offset entry for End of Day amounts at close |
| **Out of Balance History Graph** | Reconciliation page | 14-period trend; click a data point to jump to that period |
| **Journal Entry Button** | Reconciliation page | Excel report of GL and In Transit balances for account-level JEs |
| **Audit Report Button** | Reconciliation page | Full period-end documentation in Excel or PDF |

---

## 10. Troubleshooting Common Scenarios

### "The In Transit Validation light is red."
A prior-period issue is affecting carry forward. Hover for details, navigate to the prior period, and resolve the residual variance before continuing.

### "GL Batches won't go to zero."
A batch is unposted in JD Edwards. Look for the bell icon flagging batches over 2 days old. If a batch header is missing, run the JDE "Missing Batch Header" report.

### "End of Day amount keeps growing."
Sales Update (R42800) is not running for transfer orders. Confirm the version is scheduled, completing successfully, and configured with the A/R interface **off**.

### "I excluded an order, and now its ExclVarQty is non-zero."
A new transaction hit the previously excluded order. **Unexclude and re-exclude** to recalculate the exclusion amount — do not ignore it.

### "The Out of Balance is small but won't clear."
Check the tolerance setting on the Transactions page. Sub-tolerance amounts are excluded from the grid display but still counted in the variance total. Drill into Report 4 — a small **UnitPrVar** on multiple orders may explain the residual.

### "I posted a JE in JDE but RapidReconciler still shows the variance."
Data refreshes nightly. Wait until tomorrow's refresh and re-check.

### "The As-Of page total doesn't match the Orders page."
This is expected unless the current period is selected. As-Of reflects historical positions; Orders always reflects the current position.

### "I can only see 14 periods of history."
That's the default retention. Contact your administrator to request a purge or extension.

---

## 11. Best Practices and Tips

- **Reconcile weekly, not just at month-end.** Catching a variance the day after it occurs is dramatically easier than untangling a month of accumulated variances.
- **Always investigate before excluding.** An unjustified exclusion hides the real problem and can mask DMAAI configuration issues.
- **Document every transaction note with your name and date.** It saves your future self (and the auditor) significant time.
- **Run the Audit Report every period and store it in a dedicated folder.** Detail data may be lost in a purge.
- **Treat Integrity Report 4 as an early warning system.** Cost variances surface here before they accumulate into period-end pain.
- **Keep the In Transit Sales Update version separate from regular Sales Update.** It must have the A/R interface turned off.
- **Coordinate with finance on GL Batches early in the close.** Posting batches is often the longest pole in the tent.
- **Use the Drill Down Widget in multi-company environments** to identify which entity is driving the variance before diving into transactions.

---

## 12. Recommended Cadence

| Activity | Frequency |
|---|---|
| Review Orders page; process exclusions | **Daily or weekly** — never wait until period end |
| Confirm Sales Update has run for transfer orders | **Daily** |
| Full reconciliation review | **Weekly** |
| Integrity Reports 1–4 | **Monthly** (period end) |
| Closing activities and Audit Report | **Period end** |
| Configuration review (Report 0, DMAAI setup) | **At install + when issues arise** |

---

## 13. Glossary

| Term | Definition |
|---|---|
| **DMAAI** | Distribution / Manufacturing Automatic Accounting Instructions — JDE table that maps transactions to GL accounts |
| **F0902** | JDE Account Balances table (GL period balances) |
| **F0911** | JDE Account Ledger table (GL detail) |
| **F4111** | JDE Item Ledger (Cardex) table |
| **F4211** | JDE Sales Order Detail table — contains the flag identifying transfer types |
| **In Transit Clearing Account** | GL account that temporarily holds the value of goods shipped but not yet received |
| **Order Pair** | Summarized view of a transfer at the ST sales order, OT purchase order, and item number level |
| **OT Order** | Transfer purchase order (receiving side) |
| **R42800 / P42800** | JDE Sales Update — the program that posts ST orders to the GL |
| **ST Order** | Transfer sales order (shipping side) |
| **Status 999** | JDE order status indicating the order is fully closed and no further activity is possible |
| **UnitPrVar** | Per-unit price variance between ST sales price and OT purchase cost |

---

## 14. Related Documentation

| Document | When to Use |
|---|---|
| [In Transit Key Concepts](../MDS/in-transit-key-concepts.md) | ST/OT definitions, DMAAI setup, common issues |
| [Transfer Order Reference Guide](../MDS/transfer_order_reference.md) | Full accounting detail, DMAAI 4335 configuration, period-end reconciliation |
| [Transfer Order Exclusion Guide](../MDS/transfer_order_exclusion_guide.md) | Complete exclusion procedure and journal entry guidance |
| [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md) | Complete AAI reference for distribution and manufacturing |
| [Sales Order Reference Guide](../MDS/sales_order_reference.md) | Sales Update (R42800) processing — resolves End of Day variances |
| [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md) | Root causes of GL vs perpetual discrepancies |
| [How to Reconcile Inventory](../MDS/inventory-using-application.md) | Parallel workflow for perpetual inventory |
| [Getting Started with RapidReconciler](../MDS/getting-started-with-rapidreconciler.md) | Login, navigation, and application overview |
