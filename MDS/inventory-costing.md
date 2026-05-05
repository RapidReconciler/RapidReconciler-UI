# JD Edwards Product Costing Reference Guide

## Cost Methods, Configuration, Integrity, and Reconciliation

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Cost Methods in JD Edwards](#section-1-cost-methods-in-jd-edwards)
- [Section 2: Standard Cost (Method 07)](#section-2-standard-cost-method-07)
- [Section 3: WIP Revaluation for Standard Cost (R30837)](#section-3-wip-revaluation-for-standard-cost-r30837)
- [Section 4: Weighted Average Cost (Method 02)](#section-4-weighted-average-cost-method-02)
- [Section 5: Actual Cost (Method 09)](#section-5-actual-cost-method-09)
- [Section 6: Costing and Inventory Reconciliation](#section-6-costing-and-inventory-reconciliation)
- [Section 7: Cost Method Selection Guide](#section-7-cost-method-selection-guide)
- [Section 8: Quick Reference Summary](#section-8-quick-reference-summary)
- [Section 9: Related Documentation](#section-9-related-documentation)

---

## Overview

Accurate product costing is foundational to inventory reconciliation. When costs are configured or maintained incorrectly, variances between the item ledger and the general ledger are inevitable -- and often difficult to trace. This guide covers the three primary costing approaches used in JD Edwards, their setup requirements, common failure points, and best practices for maintaining cost integrity.

---

## Section 1: Cost Methods in JD Edwards

JD Edwards supports several cost methods. Each item can carry costs in multiple cost buckets simultaneously, but only one method is designated as the **Sales/Inventory cost method** -- the method used to value inventory transactions and generate journal entries.

All costs are stored in the **Item Cost file (F4105)** in the primary unit of measure.

| Cost Method | Description | Stored In |
|---|---|---|
| **01** | Last-In Cost | F4105 |
| **02** | Weighted Average Cost | F4105 |
| **03** | Memo Cost 1 | F4105 |
| **04** | Current Invoice Cost | F4105 |
| **05** | Future Cost | F4105 |
| **06** | Lot Cost | F4105 |
| **07** | Standard Cost | F4105 (frozen standard from F30026) |
| **08** | Memo Cost 2 | F4105 |
| **09** | Actual Cost | F4105 / F30026 |

> **Key Rule:** The Sales/Inventory cost method is set in **Cost Revisions (P4105)** on menu G4112. The method selected here determines how inventory transactions are valued and how journal entries are generated.

---

## Section 2: Standard Cost (Method 07)

### 2.1 How Standard Cost Works

In a standard cost system, each item's total cost is made up of several individual **cost components** stored in table **F30026**. A cost roll-up procedure calculates and freezes the total standard cost, which is then stored in F4105 as the cost method 07 bucket.

Cost components typically include:

| Component Type | Description |
|---|---|
| **A1** | Material cost -- purchased cost of the item |
| **A2** | Material scrap -- planned scrap percentage from BOM |
| **B1** | Direct labor |
| **C1** | Machine overhead |
| **D1** | Subcontract / outside operations |
| **X1+** | Extra costs / material burden (user-defined) |

The sum of all cost components should always equal the value in the cost ledger (F4105, method 07). When these two figures diverge, reconciliation variances result.

### 2.2 The Cost Roll-Up Process

The standard cost roll-up involves three programs run in sequence:

| Program | Purpose |
|---|---|
| **P30026** | Cost Components -- identifies material cost (A1) and all burden components |
| **P30820** | Simulated Standard Rollup -- calculates total simulated cost by adding A1 and computed burden |
| **P30835** | Frozen Standard Update -- freezes the simulated cost as the standard, replacing the 07 bucket in F4105 |

> **Important:** The cost ledger value in F4105 should always reflect the sum of all cost components in F30026. If these values are out of sync, the item ledger and general ledger will record different values for the same transaction.

### 2.3 Cost Component / Ledger Mismatch -- The Reconciliation Risk

A discrepancy between the cost ledger and the sum of its cost components typically occurs when the cost ledger is **changed manually** without going through the proper roll-up procedure.

**Example:**

- Sum of all cost components for an item: **$389**
- Cost ledger manually changed to: **$400**
- Item issued to a work order:
  - **Item ledger (cardex / F4111)** records the transaction at the cost ledger amount: **$400**
  - **General ledger (manufacturing accounting)** books the transaction by cost component: **$389**
  - **Result:** An $11 discrepancy between the item ledger and the general ledger -- a direct reconciling variance

### 2.4 Identifying Cost Integrity Issues -- Report R30543 and RapidReconciler Integrity Report 6

The **R30543 Cost Component/Ledger Integrity Report** identifies items where the cost ledger value does not equal the sum of its cost components.

**To use this report:**

1. Run report **R30543** in JD Edwards.
2. Review the output -- each row represents an item with a mismatch.
3. For each item identified, perform a **cost re-roll** to recalculate and reset the cost ledger to the correct sum of components.

> **Best Practice:** Run R30543 on a periodic basis -- ideally before each period-end close -- to proactively identify and resolve cost discrepancies before items are issued to work orders or processed through manufacturing accounting. Catching mismatches early eliminates the downstream impact on the item ledger and general ledger.

**RapidReconciler Integrity Report 6** provides the same standard cost integrity check directly within RapidReconciler, without the need to run a separate JD Edwards report. It identifies items where the cost ledger value (F4105, method 07) does not match the sum of cost components in F30026 -- the same condition detected by R30543 -- and surfaces them in a consolidated view alongside other inventory integrity issues.

> **Recommendation:** Use RapidReconciler Integrity Report 6 as part of the regular period-end review process. Because it runs within RapidReconciler's import cycle rather than requiring a separate JD Edwards job submission, it provides a faster and more accessible way to monitor standard cost integrity on an ongoing basis.

### 2.5 Standard Cost AAI Requirements

The following AAIs must be configured for standard cost manufacturing transactions:

| AAI | Account |
|---|---|
| **3110** | Raw Material Inventory |
| **3120** | Work In Process (WIP) |
| **3130** | Finished Goods |
| **3401** | Labor / Overhead Accruals |
| **3220 -- 3280** | Variance accounts (Labor, Material, Planned, Engineering, Other) |

For full AAI detail, see the [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md).

---

## Section 3: WIP Revaluation for Standard Cost (R30837)

### 3.1 Overview

When the standard cost of an item is updated via the Simulate and Freeze process, the Frozen Cost Update (R30835) changes the Production Cost table (F30026) and revalues on-hand inventory -- but it does **not** automatically update the production costs for open work orders. The Production Cost Inquiry (F3102) for those work orders will still reflect the old costs, creating a discrepancy between:

- The **work order production costs** in F3102 (based on the old cost), and
- The **item cost in F4105** (based on the new cost).

This results in incorrectly valued WIP on the balance sheet and may require manual journal entries to correct.

The **WIP Revaluation program (R30837)** resolves this by revaluing the production costs for all open work orders in F3102 based on the latest item cost, and optionally creating the required journal entries automatically.

### 3.2 Key Limitations

- R30837 revalues **open work orders only** -- it does not revalue on-hand inventory.
- R30837 **cannot** revalue closed work orders. Closed work orders are identified by a value of **3** in the Variance Flag (PPFG) field in the Work Order Master table (F4801).
- R30837 does **not** eliminate variances that already exist in F3102, such as actual variances due to over-issue of material or engineering variances caused by missing frozen costs at work order generation.
- Flex Accounting from R30837 is not supported -- this is by design.
- R30837 will not look for a cost in F4105 or update labor when Frozen Work Center Rates change unless specifically configured to do so.
- For standard cost items, R30837 **must** be called from the Frozen Standard Update (R30835) only. The standalone version of R30837 is designed for actual cost work orders and should not be used for standard costing.

### 3.3 WIP Revaluation Calculation

R30837 calculates the change in work-in-process value as follows:

**Change in WIP = New WIP - Old WIP**

Where: **WIP = Actual - Completed**

**Example:**

| | Actual | Completed | WIP |
|---|---|---|---|
| Before Frozen Cost Update | $100 | $50 | **$50** |
| After Frozen Cost Update | $200 | $100 | **$100** |
| **Change in WIP** | | | **$50** |

An IB journal entry is written for the $50 change in WIP value. If the change in WIP equals zero, no journal entry is written, although F3102 is still updated with the new costs.

### 3.4 AAI Requirements

R30837 uses the following AAI tables for journal entries:

| AAI | Account | Usage |
|---|---|---|
| **3120** | Work In Progress | Debit -- WIP revaluation adjustment |
| **4136** | Expense or COGS | Credit -- WIP revaluation adjustment |
| **4134** | Inventory | Used by R30835 for on-hand inventory revaluation |

AAIs 3120 and 4136 must be configured in F4095 for the **IB document type** before running WIP revaluation. If the processing option to create journal entries is blank, manual journal entries must be written to reflect the correct WIP values.

### 3.5 Prerequisites -- Run in This Order

Before running WIP Revaluation, the following steps must be completed in order:

1. **Run Manufacturing Accounting (R31802A)** -- Clears all unaccounted units and updates F3102 with the latest transactions before any cost changes are implemented.
2. **Run Simulated Roll Up (R30812)** -- Calculates the new simulated costs based on updated component costs and/or work center rates.
3. **Run Frozen Update (R30835)** -- Freezes the simulated costs as the new standard cost. WIP Revaluation (R30837) is called from R30835 by setting the processing option on the Process tab, option #5:
   - **Blank** = Do not invoke WIP Revaluation
   - **1** = Invoke WIP Revaluation for Work Orders
   - **2** = Invoke WIP Revaluation for Lean Manufacturing

### 3.6 Setup and Configuration

**Before running R30835:**

- Confirm that all work orders at a closed status have **PPFG = 3** in F4801. R30837 uses this flag to identify open work orders eligible for revaluation.
- Enable the **Update Work Center Rates** processing option in R30835 if work center rates have changed and the new rates should be reflected in production costs.
- R30835 sets the **CCFL (Cost Change Flag)** on all changed items. R30837 clears this flag upon successful completion.

**When F3102 will be updated:**

- The F4801 Variance Flag (PPFG) is **not equal to 3** (work order is open).
- A change has been made to a Work Center Rate and R30835 is run to freeze the cost, update work centers, and call WIP Revaluation.

**When F3102 will NOT be updated:**

- The F4801 Variance Flag (PPFG) **equals 3** (work order is closed).
- The F4105 Cost Change Flag (CCFL) is blank -- this field is cleared by R30837 after a successful run.
- No Work Center Rates related to the parent items / work orders in the R30835 data selection have changed.

### 3.7 Data Selection and F3111 Part List

R30837 uses the cache built from the R30835 data selection. It uses the **F3111 Part List** as the source to revalue component lines in F3102.

> **Important:** R30837 does not reference the F3002 BOM file for Current Amounts in F3102. If the part list has been changed via P3111 or P31113, re-simulating, freezing, and calling R30837 -- regardless of whether component costs have changed -- can cause Engineering Variances when Planned variances would have been expected.

### 3.8 Full Example

**Initial frozen costs:**

| Cost Type | Cost |
|---|---|
| A1 | $10.00 |
| B1 | $1.00 |
| C3 | $0.01 |
| C4 | $0.01 |

A work order for 100 units was entered, material issued for 100 units at $10 each, 100 hours of Hours and Quantities recorded, and 50 units completed. After running R31802A, **Total WIP (Actual - Completed) = $551.00**.

**After cost change** (component to $20, work center rates to $2.00 and $0.02):

| Cost Type | New Cost |
|---|---|
| A1 | $20.00 |
| B1 | $2.00 |
| C3 | $0.02 |
| C4 | $0.02 |

After running R30812, R30835 (with work center rate freeze and WIP Revaluation enabled), and R30837:

- **Total WIP (Actual - Completed) = $1,102.00**
- **IB journal entry written for: $551.00** ($1,102.00 - $551.00)

All production costs in F3102 are revalued to reflect the updated component costs and work center rates.

### 3.9 Testing Procedure

Before implementing WIP Revaluation in production, the following test procedure is recommended:

1. Add a new parent item and some component items for the test.
2. Run Simulate (R30812) and Freeze (R30835) -- do not call R30837 at this stage.
3. Create three work orders for the new parent item:
   - **Work Order 1** -- Attach parts list and routing only.
   - **Work Order 2** -- Take through material issues and run Manufacturing Accounting (R31802A).
   - **Work Order 3** -- Take through material issues, complete half the quantity, and run Manufacturing Accounting (R31802A).
4. Review all work orders using **Production Cost Inquiry (P31022)** and note the Standard, Current, Planned, Actual, and Completed values.
5. Change the cost of the component items (08 cost type).
6. Run Simulated Roll Up (R30812) from cost method 08 to cost method 07 for the parent item, exploding the BOM.
7. Run Frozen Update (R30835) with the WIP Revaluation processing option enabled.
8. Review all work orders (P31022) for changes to Standard, Current, Planned, Actual, and Completed values.
9. Review the IB journal entries for correct values reflecting the WIP changes.

### 3.10 Known Issues

| Bug | Description | Workaround |
|---|---|---|
| **17285174** | R30837 should update F3102 to the latest standard cost whenever R30835/R30837 is run, even when the new standard cost is zero. | Under review. |
| **16785420** | B1 Current Amount in F3102 is cleared when a quantity or date is changed on the work order and R30835 is run calling R30837. Expected behavior: B1 Current Amount should not be cleared. | Rerun R31410 immediately after making changes to the work order. |

---

## Section 4: Weighted Average Cost (Method 02)

> **Warning:** Weighted Average Cost is not designed to be used in an environment where the inventory on-hand quantity is allowed to go negative. Negative quantities will produce incorrect average cost calculations.

### 4.1 How Weighted Average Cost Works

Weighted Average Cost is **cost method 02** in JD Edwards. The system uses a weighted average formula to recalculate an item's per-unit average cost after each qualifying transaction. The recalculation can occur in two ways:

- **Online** -- Recalculated automatically after each transaction is completed.
- **Batch mode** -- Recalculated by running the Update Average Cost program (R41811).

The final weighted average cost resulting from a series of transactions will be the same regardless of whether the recalculation is performed online or in batch mode. The order in which transactions are processed does not affect the final result.

### 4.2 Weighted Average Cost Formula

**New Average Cost = (Quantity on Hand x Current Average Cost + Transaction Quantity x Transaction Cost) / (Quantity on Hand + Transaction Quantity)**

**Example:**

| Step | Quantity on Hand | Average Cost | Calculation |
|---|---|---|---|
| Initial state | 50 | $10.00 | -- |
| PO Receipt: 50 units at $20 | 100 | **$15.00** | (50 x $10 + 50 x $20) / 100 |
| Voucher Match: same PO at $25 | 100 | **$17.50** | (50 x $10 + 50 x $25) / 100 |

### 4.3 Recalculation vs. Manual Change

| Action | IB Transaction Created? | Journal Entry Created? |
|---|---|---|
| Online or batch recalculation | No | No |
| Manual change via Cost Revisions (P4105) | **Yes** | **Yes** |

When the weighted average cost is recalculated -- either online or in batch -- the inventory value has not changed; the system has simply averaged the per-unit cost. No journal entry is required.

When the cost is manually changed in P4105, the value of the inventory changes directly, so an **IB transaction** is created and appears in the Cardex (F4111), and a journal entry is generated.

### 4.4 Setup

#### Setting the Sales/Inventory Cost Method

Navigate to **Cost Revisions (P4105)** on menu **G4112** and set the Sales/Inventory cost method to **"02"**.

#### UDC Table 40/AV -- Controlling Which Programs Affect Weighted Average Cost

UDC table **40/AV** lists every program that can affect weighted average cost. The **Description 02** column controls whether each program participates in the recalculation:

| Description 02 Value | Behavior |
|---|---|
| **Y** | The program will affect the weighted average cost |
| **N** | The program will not affect the weighted average cost |

> **Note:** Adding programs to UDC 40/AV that were not included when the table shipped will have no effect on weighted average cost processing.

#### Online vs. Batch Recalculation

**Online:** Navigate to **System Constants** by taking the form exit from Branch/Plant Constants (P41001) and check the **"Update Average Cost On-Line"** option.

**Batch (R41811):** The Update Average Cost program has no processing options and is based on the **Average Cost Work File (F41051)**. Data selection can target specific items or branch plants. When System Constants is not set to update online, each qualifying transaction creates a record in F41051. When R41811 runs, it processes and **purges** the F41051 records it has processed.

#### Unit of Measure Conversions by Branch (BUMC)

The BUMC setting in System Constants controls whether UOM conversions are maintained at the item or item/branch level. This is a universal system-wide setting and affects how weighted average cost is calculated when items are transacted in multiple units of measure.

### 4.5 Configuration by Transaction Type

**Inventory Transactions (Issues, Transfers, Adjustments, Reclassifications)**

To prevent inventory transactions from affecting weighted average cost, set Description 02 to **"N"** for programs P4112, P4113, P4114, and P4116 in UDC 40/AV.

**Sales Transactions**

- If the order type is in UDC **40/IU**, weighted average cost is calculated at **Shipment Confirmation (P4205)** -- not at Sales Update (R42800).
- If the order type is not in UDC 40/IU, weighted average cost is calculated at **Sales Update (R42800)**.
- Because inventory can only be relieved once per sales detail line, the weighted average cost calculation will only be performed once -- even if both P4205 and R42800 are set to "Y" in UDC 40/AV.

**Purchasing Transactions**

- If both PO Receipt (P4312) and Voucher Match (P0411/P4314) are set to "Y" in UDC 40/AV, the recalculation will only be done at **receipt** unless a different cost is used at Voucher Match.
- If Voucher Match uses a different cost than the receipt, the calculation done at receipt is ignored and the recalculation is based on the cost at Voucher Match.

**Transfer Orders**

If different costs are used in different branch plants, the price on the sales order becomes the cost on the purchase order and will affect the weighted average cost in the receiving branch plant -- unless both P4312 and P0411/P4314 are set to "N" in UDC 40/AV.

> **Important:** If UDC 40/AV is configured so that neither PO Receipt nor Voucher Match affects weighted average cost, **no** purchasing receipts or voucher matches will affect weighted average cost -- regardless of how the purchase order was created.

### 4.6 Landed Cost and Weighted Average Cost

Landed Cost Rules can be configured to be included in or excluded from weighted average cost calculations. Setup must be completed in two places:

- **UDC 40/AV** -- Program **P43291** must have Description 02 set to **"Y"**. If this is not set, the second step has no effect.
- **Landed Cost Revisions (P41291)** off menu G43A41 -- The **"Include in Unit Cost Y/N"** field:
  - **Y** -- The landed cost is included in the transaction cost and will affect the weighted average cost.
  - **N** -- The landed cost will not affect the weighted average cost.

### 4.7 Alternative Language Consideration

If a user is operating in an alternative language and weighted average cost is not updating despite correct setup, verify whether the alternative language version of UDC 40/AV has been enabled:

1. Enter **UDC** on the fast path.
2. Enter **40/AV** and click **Find**.
3. Highlight a program and take the **Language** row exit to verify the alternative language settings.

---

## Section 5: Actual Cost (Method 09)

### 5.1 Overview

Actual costing calculates costs based on **actual transactions** rather than predefined standards. This method provides the most accurate reflection of true production costs but requires more configuration and discipline to maintain correctly.

**Who should use this guide:**
- CNC / System Administrators
- Finance / Cost Accounting
- Manufacturing Analysts
- Power Users

### 5.2 High-Level Process Flow

1. Configure Manufacturing Constants
2. Define Work Center Rates and Overhead
3. Set up AAIs
4. Configure Parent Item
5. Define Components and Costs
6. Execute Work Orders and Capture Actual Costs

### 5.3 Manufacturing Constants Setup (F3009)

**Navigation:** Manufacturing Systems Setup -> Manufacturing Constants

Key fields to configure:

- **Overhead Cost Types** -- Select the cost components to be included in overhead calculations
- **Labor Rate Source** -- Work Center Rates or Employee Labor Rates (F00191)
- **Machine Rate Source** -- Work Center Rates or Equipment Rates (F1301)

### 5.4 Work Center and Overhead Setup

**Work Center Rates (F30008)**

Navigation: Manufacturing Systems Setup -> Product Costing -> Work Center Rates

- Maintain cost methods 02 and 09
- Run **Frozen Update (P30835)** after changes

**Overhead Rates (F30006)**

Navigation: Manufacturing Systems Setup -> Product Costing -> Overhead Rates

### 5.5 AAI Setup

The following AAIs are required for actual cost manufacturing:

| AAI | Account |
|---|---|
| **3110** | Raw Materials |
| **3120** | Work In Process |
| **3130** | Finished Goods |
| **3401** | Accruals |

**Variance Accounting (R31804):**

- Uses AAI **3210** (COGS)
- Document Types: IS, IC, SO

### 5.6 Parent Item Setup

**Item Cost Revisions (P4105)**

Navigation: Inventory Management -> Inventory Setup -> Item Cost Revisions

- Use cost method **02** or **09**

**Inventory Cost Level:**

- **Level 2** or **Level 3** -- Level 3 is required for actual cost

**Extra Costs (F30026)**

Navigation: Manufacturing Systems Setup -> Product Costing -> Extra Costs

### 5.7 Component Setup

**Bill of Material (P3002)**

Navigation: Manufacturing Systems Setup -> Product Data Management -> Bill of Material

Rules:
- Components do not need to use the same cost method as the parent item
- Components **cannot** use cost method 09
- Costs come from P4105 and are calculated at the time of material issue

### 5.8 Common Pitfalls

| Issue | Result | Resolution |
|---|---|---|
| Missing P4105 costs | Zero cost on transactions | Ensure all items have costs entered in P4105 before processing work orders |
| Incorrect cost method | Defaults to standard costing behavior | Verify cost method is set to 02 or 09 in P4105 for all applicable items |
| Components set to cost method 09 | Not supported -- unpredictable results | Set component cost method to any valid method except 09 |
| Inventory Cost Level set to 1 | Actual cost not supported at Level 1 | Set to Level 2 or Level 3 |

> **Best Practice:** Validate the actual cost configuration with test work orders in a non-production environment before going live. Review F4111 (Item Ledger) after each test transaction to confirm costs are being captured correctly.

---

## Section 6: Costing and Inventory Reconciliation

Regardless of which cost method is in use, costing issues are a leading cause of inventory reconciliation variances. The following summarizes the most common costing-related reconciliation problems and how to address them.

### 6.1 Standard Cost -- Component/Ledger Mismatch

| Symptom | Cause | Detection | Resolution |
|---|---|---|---|
| Item ledger and GL record different values for the same work order transaction | Cost ledger manually changed without re-rolling components | R30543 Cost Component/Ledger Integrity Report or **RapidReconciler Integrity Report 6** | Re-roll cost for affected items using P30820 and P30835 |

### 6.2 Weighted Average Cost -- Negative Quantity

| Symptom | Cause | Detection | Resolution |
|---|---|---|---|
| Average cost becomes zero, negative, or wildly inaccurate | On-hand quantity allowed to go negative | Review F41021 for negative quantities | Prevent negative quantities; investigate the source transaction; manually correct average cost via P4105 if necessary (IB transaction will be created) |

### 6.3 Weighted Average Cost -- Incorrect UDC 40/AV Configuration

| Symptom | Cause | Detection | Resolution |
|---|---|---|---|
| Average cost not updating after transactions | Program not set to "Y" in UDC 40/AV | Review UDC 40/AV Description 02 settings | Update Description 02 to "Y" for applicable programs; run R41811 in batch mode to catch up |

### 6.4 Standard Cost -- WIP Revaluation Not Run After Cost Change

| Symptom | Cause | Detection | Resolution |
|---|---|---|---|
| WIP balance sheet value incorrect after a standard cost update; unexpected variances on open work orders | R30837 not called from R30835 when standard costs were changed | Review F3102 Production Cost Inquiry (P31022) -- old costs still showing on open work orders | Run R30812 (Simulate), then R30835 (Freeze) with WIP Revaluation processing option set to "1" to invoke R30837 |

### 6.5 Actual Cost -- Missing Costs

| Symptom | Cause | Detection | Resolution |
|---|---|---|---|
| Work order transactions record at zero cost | No cost in F4105 for the item or cost method | Query F4105 for the item | Enter correct costs in P4105 before reprocessing; validate with test work order |

---

## Section 7: Cost Method Selection Guide

Choosing the correct cost method is a foundational implementation decision. Changing cost methods mid-stream is technically possible but operationally complex and carries significant reconciliation risk. The following guidance helps organizations select the appropriate method during implementation.

### 7.1 Comparison of Primary Cost Methods

| Factor | Standard Cost (07) | Weighted Average (02) | Actual Cost (09) |
|---|---|---|---|
| **Best suited for** | Manufacturing environments with stable, repeatable costs | Distribution or mixed environments where purchase costs vary | Job-shop or high-value, low-volume manufacturing |
| **Cost source** | Frozen standard from F30026 cost components | Recalculated automatically at each receipt | Actual costs captured per work order |
| **Variance visibility** | Explicit -- purchasing, labor, material, and overhead variances are each broken out | Implicit -- cost changes absorbed into the average; no separate variance | Explicit -- full actual cost per work order |
| **Inventory value** | Fixed until standard is updated and frozen | Fluctuates with each purchase cost change | Varies by work order |
| **Period-end complexity** | Moderate -- requires cost roll management and WIP revaluation when costs change | Low-to-moderate -- self-maintaining but sensitive to negative quantities | High -- requires careful work order management |
| **Inventory Cost Level** | 1, 2, or 3 | 1, 2, or 3 | 2 or 3 required |
| **Component cost method** | Any | Any | Cannot be 09 |
| **Negative quantity risk** | Low -- cost is fixed | **High** -- negative quantities corrupt the average cost | Moderate |
| **Common in** | Discrete manufacturing | Distribution, process manufacturing | Contract manufacturing, aerospace, defense |

### 7.2 Key Decision Factors

**Use Standard Cost (07) when:**
- The organization manufactures a stable product line with predictable material, labor, and overhead costs
- Management requires explicit variance reporting (purchase price variance, labor efficiency variance, etc.)
- A formal annual or semi-annual cost roll process is acceptable

**Use Weighted Average Cost (02) when:**
- The organization primarily purchases and resells items rather than manufacturing them
- Purchase costs fluctuate frequently and variance tracking is not required
- Inventory Cost Level 1 is preferred for simplicity

**Use Actual Cost (09) when:**
- Each unit or work order is unique (job-shop, project-based manufacturing)
- Precise cost capture per job is required for profitability analysis or customer billing
- The organization has the operational discipline to manage work orders to completion before closing

### 7.3 Changing Cost Methods

If a cost method change is required after go-live, the following steps are generally required:

1. **Adjust inventory to zero** for all affected items before changing the cost method. Changing the cost method with quantity on hand can produce incorrect journal entries and cardex integrity issues.
2. **Update P4105** for each affected item to the new cost method.
3. **Update UDC 40/AV** if switching to or from weighted average cost.
4. **Adjust inventory back in** under the new cost method.
5. **Run R30543** after any standard cost change to verify cost component/ledger integrity.
6. **Test in a non-production environment** before making changes to production data.

> **Warning:** Changing the cost method on items with open work orders or open purchase orders requires additional steps. Consult with a JD Edwards specialist before proceeding.

---

## Section 8: Quick Reference Summary

| Topic | Key Point |
|---|---|
| Cost storage | All costs stored in F4105 in the primary UOM |
| Standard cost components | Stored in F30026; must equal F4105 method 07 value |
| Standard cost integrity | Run R30543 periodically to detect component/ledger mismatches; **RapidReconciler Integrity Report 6** provides the same check within the reconciliation workflow |
| WIP revaluation | Run R30837 from R30835 whenever standard costs change and open work orders exist |
| WIP revaluation -- closed work orders | R30837 does not revalue closed work orders (PPFG = 3 in F4801) |
| WIP revaluation -- prerequisite | Always run R31802A before R30812 and R30835/R30837 |
| WIP revaluation -- standalone | Do not run R30837 standalone for standard cost items -- call from R30835 only |
| Weighted average warning | Do not allow on-hand quantity to go negative |
| Weighted average formula | (QOH x Current Cost + Trans Qty x Trans Cost) / (QOH + Trans Qty) |
| Weighted average control | UDC 40/AV Description 02 = Y or N per program |
| Manual cost change (P4105) | Creates IB transaction and journal entry |
| Recalculation (online/batch) | No IB transaction, no journal entry |
| Actual cost level | Requires Inventory Cost Level 2 or 3 |
| Actual cost components | Cannot use cost method 09 |
| Landed cost in weighted average | Requires P43291 = Y in UDC 40/AV AND Y in P41291 |
| Validate configuration | Always test in a non-production environment first |

---

## Section 9: Related Documentation

- [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md)
- [Manufacturing AAIs and Accounting](../MDS/manufacturing-aais.md)
- [GL Class Code Management and Change Procedures](../MDS/gl-class-code-changes.md)
- [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md)
- [Installing the RapidReconciler-Prod Database](../MDS/Installing_production_database.md)