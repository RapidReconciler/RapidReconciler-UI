# ST/OT Transfer Order Exclusion Guide

## Managing Unbalanced Transfers and Exclusion Variance in RapidReconciler

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Unbalanced Transfer Orders -- The Problem](#section-1-unbalanced-transfer-orders----the-problem)
- [Section 2: The Exclusion Process in RapidReconciler](#section-2-the-exclusion-process-in-rapidreconciler)
- [Section 3: Exclusion Variance -- Monitoring Previously Excluded Orders](#section-3-exclusion-variance----monitoring-previously-excluded-orders)
- [Section 4: Exclusion Adjust in the In Transit As-Of View](#section-4-exclusion-adjust-in-the-in-transit-as-of-view)
- [Section 5: Journal Entry Guidance](#section-5-journal-entry-guidance)
- [Section 6: Period-End Reconciliation Workflow](#section-6-period-end-reconciliation-workflow)
- [Section 7: Key Takeaways](#section-7-key-takeaways)
- [Section 8: Related Documentation](#section-8-related-documentation)

---

## Overview

In a perfect world, every ST/OT transfer order would ship and receive at identical quantities and amounts, leaving the In Transit clearing account with a zero balance at period end. In practice, this is rarely the case. Processing discrepancies, receiving errors, and timing differences between shipment and receipt create situations that standard JD Edwards cannot resolve once orders are closed.

RapidReconciler's **Order Exclusion** feature is specifically designed to handle these situations. This guide covers:

- What unbalanced transfer orders are and why they occur
- How the Exclusion process works in RapidReconciler
- How to monitor for new activity on previously excluded orders using Exclusion Variance
- Best practices for maintaining a clean In Transit GL account

---

## Section 1: Unbalanced Transfer Orders -- The Problem

### 1.1 What Is an Unbalanced Transfer?

An unbalanced transfer order occurs when the quantity or amount received does not match what was shipped, yet both the sales order (ST) and the purchase order (OT) have been fully closed at status 999.

Since In Transit is calculated as **Quantity Shipped minus Quantity Received**, any unbalanced transfer will remain open indefinitely in JD Edwards. There is no standard process within JD Edwards to balance these transactions once both orders are closed.

### 1.2 Common Causes

| Cause | Description |
|---|---|
| **Partial receipt applied to wrong order** | Multiple transfer orders exist for the same item. A receiver processes all units against one PO, leaving the other open with no receipt activity. |
| **Quantity received differs from quantity shipped** | A short shipment or counting error at the receiving dock results in a quantity mismatch. Both orders are eventually closed without correction. |
| **Cost variance at close** | The amount received differs from the amount shipped due to a cost change or pricing discrepancy, leaving a dollar balance with no quantity variance. |
| **Manual status advancement** | An order is advanced to status 999 manually without being fully processed, bypassing normal receipt matching. |

### 1.5 Prevention

While exclusions are sometimes unavoidable, the following practices reduce their frequency:

- **Train receiving staff** on how to identify and correctly receive against multiple open purchase orders for the same item rather than applying all units to one.
- **Implement receiving controls** that require a PO number to be scanned or entered before processing a receipt, reducing the risk of receiving against the wrong order.
- **Monitor open transfer orders** regularly so that discrepancies are caught and corrected before orders are closed at status 999.
- **Avoid manual status advancement** to 999 without confirming that all receipt and voucher activity has been properly completed.
- **Coordinate between shipping and receiving locations** on large or split shipments to ensure both sites understand which units belong to which order.

### 1.3 Example -- Multiple Orders for the Same Item

Two transfer orders are in process for the same item, each for 50 units, scheduled to ship within a week of each other.

Due to delays, all 100 units are shipped together. Ship confirmations are processed correctly -- 50 units on each order.

At the receiving dock, the operator counts 100 units in the same box, looks up the item, and receives all 100 units against **one** of the two open purchase orders.

**Result:**
- One OT order is closed correctly with 50 units shipped and 50 units received.
- The second OT order has 50 units shipped but **zero units received** -- it remains open indefinitely.
- The In Transit GL account carries a balance for the second order with no mechanism to clear it through normal JD Edwards processing.

### 1.4 Impact on Reconciliation

Unbalanced transfer orders create a direct challenge when reconciling the In Transit GL account:

- The remaining balance has no corresponding open order activity to clear it.
- No further processing can be performed in JD Edwards once both orders are at status 999.
- The balance accumulates over time, making it increasingly difficult to identify which orders are genuinely in transit vs. which represent closed unbalanced transactions.
- At period end, the In Transit GL account will not reconcile to open order activity without accounting for these exceptions.

---

## Section 2: The Exclusion Process in RapidReconciler

### 2.1 What the Exclusion Process Does

RapidReconciler's Order Exclusion feature allows unbalanced transfer order pairs that cannot be resolved through standard JD Edwards processing to be flagged and isolated from the In Transit reconciliation calculation.

Flagging an order pair using the Exclusion feature accomplishes the following:

- The excluded amounts are **summarized in the Variance Calculation section** of the In Transit Reconciliation page, isolating the unbalanced amount as a distinct variance line item.
- This summarized amount identifies the exact value of the offsetting journal entry needed to bring the In Transit GL account into balance.
- Individual exclusions are listed in the **In Transit As-Of transaction details** as an **"Exclusion Adjust"** entry, providing a complete audit trail of all excluded order activity.

### 2.2 Step-by-Step Exclusion Procedure

Follow these steps to exclude an unbalanced transfer order pair:

**Step 1 -- Identify the unbalanced order pair**

Navigate to the **In Transit Orders page** in RapidReconciler. Review orders where:
- Both the ST and OT are at status **999** (fully closed in JD Edwards)
- A remaining quantity or dollar variance exists on the order pair

**Step 2 -- Verify the order cannot be resolved in JD Edwards**

Before excluding, confirm that there is no further processing available in JD Edwards to correct the imbalance. Orders at status 999 cannot be re-opened without reversals.

**Step 3 -- Flag the order pair using the Exclusion process**

Select the order pair on the In Transit Orders page and apply the Exclusion flag.

**Step 4 -- Review the updated Variance Calculation**

After exclusion, navigate to the In Transit Reconciliation page. The excluded amount will now appear as a distinct **Exclusions** variance line item in the Variance Calculation section, separate from legitimate open in-transit activity.

**Step 5 -- Prepare and post the offsetting journal entry in JD Edwards**

Use the summarized exclusion amount to prepare the appropriate offsetting journal entry to clear the unbalanced amount from the In Transit GL account. The journal entry should debit or credit the In Transit account and offset to an appropriate expense or variance account based on your organization's policies.

**Step 6 -- Document the exclusion**

Record the order numbers, amounts, and reason for the exclusion for audit and period-end documentation purposes.

### 2.3 Benefits of the Exclusion Process

| Benefit | Description |
|---|---|
| **Identification** | Surfaces unbalanced transfer orders that would otherwise remain undetected within the In Transit account balance |
| **Isolation** | Separates unresolvable balances from legitimate open in-transit activity, making the reconciliation cleaner and more accurate |
| **Correction** | Enables preparation of accurate offsetting journal entries to clear unbalanced amounts from the In Transit GL account |
| **Audit Trail** | Individual exclusion details appear in the In Transit As-Of transaction details as "Exclusion Adjust" entries, supporting period-end documentation |

---

## Section 3: Exclusion Variance -- Monitoring Previously Excluded Orders

### 3.1 The Risk of Excluding an Open Order

When an order pair is excluded because it cannot be resolved, a secondary risk is introduced: if the OT purchase order remains **open** in JD Edwards at a status below 999, it is still possible for items to be received against it at a future date -- even from an unrelated shipment.

If this occurs, the new receipt activity will not be reflected in RapidReconciler's In Transit calculations because the order was previously excluded. This can result in:

- New transactions being omitted from the reconciliation
- The In Transit GL account carrying a balance that does not match the RapidReconciler position
- An understated or overstated In Transit variance at period end

### 3.2 Exclusion Variance Columns on the Orders Tab

To address this risk, four columns are available on the **Orders tab** in the In Transit module:

| Column | Description |
|---|---|
| **ExclQty** | The quantity excluded on the order |
| **ExclAmt** | The dollar amount excluded on the order |
| **ExclVarQty** | The exclusion quantity variance -- identifies any quantity activity on a previously excluded order since it was excluded |
| **ExclVarAmt** | The exclusion amount variance -- identifies any dollar activity on a previously excluded order since it was excluded |

### 3.3 How to Interpret the Exclusion Variance Columns

The **ExclVarQty** and **ExclVarAmt** columns are the key fields to monitor during the periodic reconciliation review.

| Value | Interpretation | Action Required |
|---|---|---|
| **Zero** | No new activity has occurred on the excluded order | No action needed |
| **Non-zero** | Transaction activity has occurred on a previously excluded order | Unexclude and re-exclude the order pair |

### 3.4 Unexclude and Re-Exclude Procedure

When non-zero values appear in the ExclVarQty or ExclVarAmt columns, the affected order pair must be reprocessed as follows:

**Step 1 -- Unexclude the order pair**

Remove the Exclusion flag from the order pair to reinstate it in the In Transit calculations. This allows the new transaction activity to be visible in the reconciliation.

**Step 2 -- Review the updated order activity**

With the exclusion removed, review the order pair to understand what new transactions occurred and whether the order can now be fully resolved in JD Edwards.

**Step 3 -- Re-exclude the order pair**

Re-apply the Exclusion flag. The exclusion quantities and amounts will be recalculated to include all activity -- both the original excluded transactions and the new ones. This ensures the In Transit reconciliation reflects an accurate and complete picture.

**Step 4 -- Update the journal entry if needed**

If the new activity changes the exclusion amount, update or reverse the previously posted offsetting journal entry and post a corrected entry for the new net amount.

---

## Section 4: Exclusion Adjust in the In Transit As-Of View

When orders are excluded, an **"Exclusion Adjust"** entry appears in the In Transit As-Of transaction details for the affected item. This entry:

- Represents the adjustment made by the exclusion process to the item's in-transit balance
- Is included in the As-Of calculation to ensure the period-end in-transit position is accurately stated
- Provides an audit trail showing when and how much was excluded for each item

> **Note:** The Exclusion Adjust entry in the As-Of view is informational. It does not represent a JD Edwards transaction -- it is a RapidReconciler adjustment to the reconciliation position.

---

## Section 5: Journal Entry Guidance

Once an order pair has been excluded, an offsetting journal entry is required to clear the unbalanced amount from the In Transit GL account. The appropriate entry depends on why the imbalance exists.

### 5.1 Determining the Correct Offsetting Account

| Scenario | Debit | Credit | Notes |
|---|---|---|---|
| Quantity shipped but never received (goods lost or written off) | Expense / Write-Off account | In Transit | Represents the cost of goods that were never received |
| Quantity received against wrong order (goods actually received) | In Transit | Inventory | Goods are physically in stock; inventory account should carry the value |
| Cost variance between ship and receive amounts | In Transit or Variance account | In Transit or Variance account | Depends on whether the variance is favorable or unfavorable and your organization's policy |
| Duplicate shipment confirmation (goods not actually shipped) | In Transit | Inventory (Branch A) | Reverses the incorrect shipment entry |

> **Important:** Consult your cost accountant or controller before posting any manual journal entry to the In Transit account. The appropriate offsetting account will depend on the specific circumstances of the unbalanced order and your organization's accounting policies.

### 5.2 Documenting the Journal Entry

Every manual journal entry posted to clear an excluded order should include the following in the memo or description field:

- The ST order number and OT order number
- The item number and quantity involved
- The reason the order was excluded (e.g., "received against wrong PO," "quantity discrepancy at close")
- The date of the exclusion in RapidReconciler
- Reference to the RapidReconciler exclusion for audit traceability

### 5.3 Reversing a Journal Entry After Re-Exclusion

If new activity occurs on a previously excluded order and the unexclude/re-exclude process is performed, the original journal entry may need to be adjusted:

1. Determine the new net exclusion amount after re-exclusion.
2. If the amount has changed, reverse the original journal entry.
3. Post a new journal entry for the updated net amount.
4. Update the documentation to reflect the revised entry.

---

## Section 6: Period-End Reconciliation Workflow

### 5.1 Recommended Monthly Procedure

| Step | Action |
|---|---|
| **1** | Open the In Transit Orders page in RapidReconciler |
| **2** | Filter for order pairs at status 999 with a remaining open quantity or amount -- these are candidates for exclusion |
| **3** | Verify each candidate cannot be resolved in JD Edwards before excluding |
| **4** | Apply the Exclusion process to confirmed unbalanced order pairs |
| **5** | Review the Variance Calculation section on the In Transit Reconciliation page -- excluded amounts now appear as a distinct line item |
| **6** | Prepare and post the offsetting journal entry in JD Edwards for the total exclusion amount |
| **7** | Check the **ExclVarQty** and **ExclVarAmt** columns for all previously excluded orders -- address any non-zero values using the unexclude/re-exclude process |
| **8** | Document all exclusions and journal entries for audit purposes |

### 5.2 Exclusion vs. Resolution -- Choosing the Right Approach

The exclusion process is a reconciliation tool, not a substitute for correcting underlying data issues in JD Edwards. Before excluding an order, consider the following:

| Question | If Yes | If No |
|---|---|---|
| Can the order be corrected in JD Edwards (e.g., additional receipt, reversal, manual status change)? | Correct in JD Edwards first | Proceed with exclusion |
| Is the order genuinely closed (status 999 on both ST and OT)? | Proceed with exclusion | Investigate whether further processing is possible |
| Is the variance amount material enough to require a journal entry? | Post journal entry after exclusion | Evaluate based on materiality thresholds |
| Could the open OT order attract future unrelated receipts? | Monitor ExclVarQty and ExclVarAmt regularly | Standard exclusion with periodic monitoring |

---

## Section 7: Key Takeaways

- **Unbalanced transfer orders are common** in high-volume environments and cannot be resolved through standard JD Edwards processing once both orders are closed at status 999.
- **The Exclusion process** isolates unbalanced orders from the In Transit reconciliation, surfaces the exact amount needing a journal entry, and maintains an audit trail through the Exclusion Adjust entry in As-Of details.
- **Exclusion Variance columns** (ExclVarQty and ExclVarAmt) protect against the risk of new activity being applied to previously excluded open orders -- always review these columns during the periodic reconciliation.
- **The unexclude/re-exclude process** recalculates exclusion amounts to include all activity, ensuring the reconciliation remains accurate after new transactions occur on excluded orders.
- **Exclusion is a reconciliation tool** -- it does not fix the underlying JD Edwards data. Where possible, resolve the root cause in JD Edwards before resorting to exclusion.
- **Materiality matters** -- not every exclusion requires a journal entry. Establish a materiality threshold with your controller and document the policy. Small immaterial variances may be acceptable to leave without a journal entry, provided they are documented and reviewed at each period end.

---

## Section 8: Related Documentation

- [Transfer Order Reference Guide](../MDS/transfer_order_reference.md)
- [In Transit Key Concepts](../MDS/in-transit-key-concepts.md)
- [In Transit: Using the Application](../MDS/in-transit-using-application.md)
- [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md)
- [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md)