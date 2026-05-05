# JD Edwards Manufacturing Work Order Reference Guide

## Work Order Processing, Manufacturing Accounting, Variance Analysis, and Reconciliation

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Work Order Status Flow](#section-1-work-order-status-flow)
- [Section 2: Manufacturing Accounting Flow (R31802A)](#section-2-manufacturing-accounting-flow-r31802a)
- [Section 3: Material Issues (IM)](#section-3-material-issues-im)
- [Section 4: Labor and Outside Operations (IH)](#section-4-labor-and-outside-operations-ih)
- [Section 5: Work Order Completions (IC)](#section-5-work-order-completions-ic)
- [Section 6: Parent Scrap (IS)](#section-6-parent-scrap-is)
- [Section 7: Variance Accounting (IV)](#section-7-variance-accounting-iv)
- [Section 8: WIP Revaluation (R30837)](#section-8-wip-revaluation-r30837)
- [Section 9: AAI Reference](#section-9-aai-reference)
- [Section 10: Reconciliation Reference](#section-10-reconciliation-reference)
- [Section 11: Related Documentation](#section-11-related-documentation)

---

## Overview

This reference guide covers the JD Edwards EnterpriseOne manufacturing work order cycle from creation through variance accounting, with a focus on the tables updated at each step and the accounting implications for inventory reconciliation.

| Section | Topic |
|---|---|
| **Section 1** | Work Order Status Flow — status codes, programs, and the two pre-close checks |
| **Section 2** | Manufacturing Accounting Flow — R31802A overview, GL summarization behavior, key tables |
| **Section 3** | Material Issues — IM journal entries, GL class code rule, tables updated |
| **Section 4** | Labor and Outside Operations — IH journal entries, UDC 31/ER, tables updated |
| **Section 5** | Work Order Completions — IC journal entries, standard cost change pattern, tables updated |
| **Section 6** | Parent Scrap — IS journal entries and scrap account behavior |
| **Section 7** | Variance Accounting — IV journal entries, variance types, tables updated |
| **Section 8** | WIP Revaluation — R30837 purpose, trigger conditions, and missing GL entry pattern |
| **Section 9** | AAI Reference — 3000-series AAIs, GL class code sources, common misconfigurations |
| **Section 10** | Reconciliation Reference — RapidReconciler patterns, document type behavior, common variances |

> **Key principle:** GL entries for manufacturing transactions are **not created at the time of the transaction**. They are created when Manufacturing Accounting (**R31802A**) runs in final mode — typically nightly. Until R31802A runs, material issues, completions, and labor entries exist in F4111 (item ledger) with no corresponding F0911 (GL detail) record. RapidReconciler reports these as **End of Day** variances until R31802A processes them.

---

## Section 1: Work Order Status Flow

### 1.1 Overview

A JD Edwards work order moves through a defined set of status codes from creation through variance accounting close. Status codes are stored in the **F4801** (Work Order Header) and **F4801T** (Work Order Routing) tables. The active status and next status on each record control which programs can process the order.

### 1.2 Work Order Status Codes

| Status | Description | Set By | Key Behavior |
|---|---|---|---|
| **00** | Entered | Work Order Entry (P48013) | Order exists; no material, labor, or cost data attached |
| **10** | Frozen | Work Order Processing (R31410) | Frozen standard, current cost, and planned cost locked to the order; BOM and routing attached |
| **20** | In Queue | Scheduling | Order is waiting to begin |
| **30** | In Process | Time Entry / Completions | Active manufacturing in progress; material issues and labor entries allowed |
| **40** | Partially Completed | Completions (P31114) | Some quantity completed; work order remains open for additional completions |
| **50** | Pending Close — Labor Complete | Manual | Labor entry is complete; pending final review |
| **60** | Pending Close — Material Reconciled | Manual | Material issues match planned quantities; pending final review |
| **90** | Complete | Manual / Completion program | All manufacturing activity is complete; order is ready for Manufacturing Accounting |
| **95** | Manufacturing Accounting Complete | R31802A | R31802A has processed the order in final mode; GL entries exist for all IM, IH, and IC transactions |
| **97** | Variance Accounted | R31804 | Variance accounting (R31804) has run; WIP is cleared to zero; order is fully closed from an accounting perspective |
| **99** / **999** | Closed | Work Order Close (R31804 or manual) | Order is fully closed; no further processing allowed |

> **Important:** Frozen standards, current costs, and planned costs are locked when R31410 is run (status 10). Changes to BOM, routing, or item costs after this point do not update the work order — they contribute to engineering and planned variances at status 97.

### 1.3 Programs by Status Transition

| Transition | Program | Description |
|---|---|---|
| 00 → 10 | **R31410** — Work Order Processing | Attaches BOM and routing; freezes standard cost; calculates planned cost |
| 10 → 30 | Scheduling / manual | Order released to the floor |
| 30 → 40/90 | **P31114** — Work Order Completions | Records completed quantity; writes IC cardex to F4111 |
| 30 → ongoing | **P31113** — Inventory Issues | Issues components from inventory to the work order; writes IM cardex to F4111 |
| 30 → ongoing | **P311221** + **R31422** | Time entry and hours update; writes IH cardex to F4111 |
| 90 → 95 | **R31802A** — Manufacturing Accounting | Creates GL entries (F0911) for all IM, IH, and IC transactions; **must run in final mode** |
| 95 → 97 | **R31804** — Variance Accounting | Clears WIP balance to zero; creates IV variance entries in F0911 |
| 97 → 99 | **R31804** or manual | Final close |

### 1.4 Pre-Close Checks Before Running R31802A

Before advancing a work order to status 95 and running Manufacturing Accounting, perform both of the following checks. Skipping either can result in permanent variances that cannot be corrected without manual journal entries.

**Check 1 — Material Reconciliation**

Using the **Inventory Issues program (P31113)**, review work orders closed during the most recent business cycle:

| Field | Expectation | If Different |
|---|---|---|
| **Quantity Ordered** | Should equal Quantity Issued | A variance exists — investigate before proceeding |
| **Quantity Issued** | Should equal Quantity Ordered | Document valid variances (e.g., component scrap) in the Remarks field |

**Check 2 — Hours Reconciliation**

Using the **Order Hour Status program (P31121)**, review work orders closed during the most recent cycle:

| Field | Expectation | If Different |
|---|---|---|
| **Actual Machine Hours** | Should be close to Standard Machine Hours | Investigate reason before running R31802A |
| **Actual Labor Hours** | Should be close to Standard Labor Hours | Investigate reason before running R31802A |
| **Actual Setup Hours** | Should be close to Standard Setup Hours | Investigate reason before running R31802A |

> **If differences are found:** Correct any data entry errors or missing time entries before running R31802A. Valid differences (e.g., genuine labor efficiency) should be documented. These differences will produce variances at R31804 — documenting them in advance makes variance review faster at period end.

### 1.5 Files Updated at Each Status

| Status Transition | Tables Written or Updated |
|---|---|
| 00 → 10 (R31410) | F4801 (WO Header — cost data attached), F3111 (Parts List), F3112 (Routing) |
| Material Issues (P31113) | F4111 (Item Ledger — IM cardex), F41021 (Item Location — quantity reduced) |
| Time Entry (P311221) | F31122 (Time Entry) |
| Hours Update (R31422) | F4111 (Item Ledger — IH cardex) |
| Completions (P31114) | F4111 (Item Ledger — IC cardex), F41021 (Item Location — quantity increased) |
| 90 → 95 (R31802A) | F0911 (GL Detail — IM, IH, IC entries created), F0011 (Batch Control), F4801 (status to 95) |
| 95 → 97 (R31804) | F0911 (GL Detail — IV variance entries), F0011 (Batch Control), F4801 (status to 97 or 99) |

---

## Section 2: Manufacturing Accounting Flow (R31802A)

### 2.1 Overview

R31802A is the central manufacturing accounting program. It reads all F4111 cardex records for work orders at status 90 (or the configured trigger status) and creates corresponding GL entries in F0911. Until R31802A runs, **no GL entries exist** for any manufacturing transaction — the item ledger exists but the general ledger is silent.

### 2.2 Key Processing Characteristics

| Characteristic | Description |
|---|---|
| **GL entries not real-time** | F0911 entries are created by R31802A, not by P31113, P31114, or P311221 |
| **GL document number ≠ cardex document number** | R31802A assigns its own GL document number. The cardex document number (e.g., WO 1281504) will not match the GL document number (e.g., 11247844). This is normal and expected. |
| **GL summarization by account and batch** | R31802A summarizes GL entries by GL account within its run. A single F0911 entry for a given account and batch may represent costs from **multiple work orders** processed in the same R31802A run, not just the work order shown in a given report. |
| **Run once per work order** | R31802A can only be run once in final mode per work order. Once run, all corrections require manual journal entries. |
| **Proof mode available** | Always run R31802A in proof mode first and review the output before final mode. |

### 2.3 Manufacturing Cost Flow

Costs move through the following accounts in sequence:

```
Raw Material Inventory (AAI 3110)
        ↓  Material Issues (IM)
Work In Process / WIP (AAI 3120)
        ↑  Labor and Overhead (IH)
        ↓  Completions (IC) and Scrap (IS)
Finished Goods Inventory (AAI 3130)
        ↓  Sales Update (R42800)
Cost of Goods Sold
```

### 2.4 Tables Updated by R31802A

| Table | Description | What Is Written |
|---|---|---|
| **F0911** | Account Ledger (GL Detail) | One entry per GL account per batch — may span multiple work orders |
| **F0011** | Batch Control | One batch header per R31802A run; batch type **W** |
| **F4801** | Work Order Master | Status advanced to 95 |

### 2.5 Batch Type

R31802A creates batch type **W** (Work Order / Manufacturing). This batch type is visible in the GL Batches variance screen in RapidReconciler. For period-end close, all W batches must be posted before the GL Batches variance can reach zero.

### 2.6 GL Class Code Rule — Critical

The GL class code used for journal entry creation differs by transaction side:

| Transaction | Side | GL Class Code Source |
|---|---|---|
| **IM — Material Issue** | **Credit** (reducing raw material) | GL class code of each **individual component** |
| **IM — Material Issue** | **Debit** (adding to WIP) | GL class code of the **parent item** |
| **IH — Labor** | Both sides | GL class code of the **parent item** |
| **IC — Completion** | Both sides | GL class code of the **parent item** |
| **IS — Scrap** | Both sides | GL class code of the **parent item** |
| **IV — Variance** | Both sides | GL class code of the **parent item** |

> **Critical:** GL class codes are sourced from the **Item Location table (F41021)**, not the Item Branch table (F4102). JD Edwards allows these two tables to carry different values without generating a warning. If F41021 and F4102 carry different GL class codes for the same item, manufacturing transactions will post to a different account than expected. Run Integrity Report 5 in RapidReconciler to identify mismatches.

---

## Section 3: Material Issues (IM)

### 3.1 Overview

Material issues record the transfer of components from inventory into a work order. They are entered using **Inventory Issues (P31113)**. The item ledger (F4111) is updated immediately; the GL (F0911) is updated when R31802A runs.

### 3.2 Journal Entry

Material is transferred from Raw Material Inventory to WIP at **Actual Quantity × Frozen Standard Cost (F30026)**:

| Account | Debit | Credit | AAI | GL Class Code Source |
|---|---|---|---|---|
| Work In Process (WIP) | × | | **3120** | Parent item |
| Raw Material / Sub-Assembly Inventory | | × | **3110** | Each component individually |

> **Note:** If multiple components are issued with different GL class codes, each component generates its own credit entry to AAI 3110 using its own GL class code. The debit to AAI 3120 uses the parent item's GL class code only.

### 3.3 Cost Basis

| Cost Element | Source |
|---|---|
| Standard material cost (A1) | F30026 — Frozen Standard Cost |
| Additional cost types (B1–B4, C1–C4, D1–D2) | F30026 — depends on Manufacturing Constants configuration |
| Actual quantity | F4111 — actual units issued to the work order |

### 3.4 Tables Updated

| Step | Table | Description |
|---|---|---|
| At issue (P31113) | **F4111** | IM cardex record created; quantity and amount written at frozen standard cost |
| At issue (P31113) | **F41021** | On-hand quantity reduced for each component |
| At R31802A | **F0911** | GL entries created: debit WIP (3120), credit Raw Material (3110) per component GL class |
| At R31802A | **F0011** | Batch header created for the W batch |
| At R31802A | **F4801** | Work order status advanced |

### 3.5 Common Reconciliation Issues

| Issue | Cause | Indicator in RapidReconciler |
|---|---|---|
| IM in End of Day | R31802A has not yet run for this work order | End of Day variance; batch number blank on F4111 record |
| GL-excess on one component GL class | R31802A summarized costs from multiple work orders into one F0911 entry | Account/batch GL amount exceeds F4111 for that GL class; other classes reconcile cleanly. See Section 10.3. |
| Account mismatch on IM credit side | Component GL class code in F41021 differs from what was expected; AAI 3110 not configured for that class | Transactions page — Accounts sub-type; DMAAs section shows mismatch or missing AAI |
| Account mismatch on IM debit side | Parent item GL class code in F41021 differs from F4102 | Transactions page — Accounts sub-type; verify F41021 directly |

---

## Section 4: Labor and Outside Operations (IH)

### 4.1 Overview

Labor, outside operations, and cross-charges are recorded using time entry (**P311221**). The item ledger is updated when the **Hours and Quantities Update (R31422)** runs. GL entries are created when R31802A runs.

Outside operations are recorded when a routing step sends work to an external supplier. The purchase order receipt for the outside operation generates the cost entry; R31802A then moves that cost into WIP.

### 4.2 Journal Entry

Labor and overhead are transferred to WIP at **Actual Hours × Frozen Work Center Rate**:

| Account | Debit | Credit | AAI | GL Class Code Source |
|---|---|---|---|---|
| Work In Process (WIP) | × | | **3120** | Parent item |
| Payroll Accrual | | × | **3401** | Parent item |

### 4.3 Cost Basis

| Cost Element | Source |
|---|---|
| Labor rate | UDC table **31/ER** — if actual labor charged by individual; otherwise work center rate |
| Machine rate | Work Center Master (F30006) |
| Setup rate | Work Center Master (F30006) |
| Overhead rate | Manufacturing Constants — percentage of labor |
| Actual hours | F31122 — Time Entry records |

> **UDC 31/ER:** If actual labor is charged by individual employee, each employee's labor rate must be maintained in UDC table **31/ER**. This table is referenced by P311221 to retrieve the employee's rate. If payroll does not maintain this table systematically, a separate process must be established to keep it synchronized. An out-of-date 31/ER entry produces an incorrect labor rate in F4111, which flows through to F0911 via R31802A — the F4111 amount and F0911 amount will differ, appearing as an amount discrepancy on the Transactions page in RapidReconciler.

### 4.4 Tables Updated

| Step | Table | Description |
|---|---|---|
| At time entry (P311221) | **F31122** | Time entry record created |
| At hours update (R31422) | **F4111** | IH cardex record created with actual hours and rate |
| At R31802A | **F0911** | GL entries created: debit WIP (3120), credit Payroll Accrual (3401) |
| At R31802A | **F0011** | Batch header for the W batch |

### 4.5 Work Center Efficiency

If Work Center Efficiency is enabled in Manufacturing Constants, R31802A creates **separate journal entries** for labor efficiency variances. These post to AAI **3220** (Labor Variance). If AAI 3220 is not configured for all GL class codes in use, the efficiency entry has no account and R31802A will error.

> **Recommendation for new implementations:** Delay enabling Work Center Efficiency for 12–18 months until sufficient real-world data exists to calculate efficiency rates accurately. Premature use produces large meaningless variances that obscure genuine cost issues.

### 4.6 Common Reconciliation Issues

| Issue | Cause | Indicator in RapidReconciler |
|---|---|---|
| IH in End of Day | R31422 or R31802A has not run | End of Day variance |
| Amount discrepancy on IH | UDC 31/ER rate does not match the rate used in F0911 | Transactions page — amount difference between F4111 and F0911 for the same batch |
| Period mismatch on IH | R31422 ran in a different period than the time entry date | Transactions page — Periods sub-type; compare F4111 creation date to F0911 GL date |
| Missing 3220 account | Work Center Efficiency enabled but AAI 3220 not configured for all GL class codes | R31802A error; batch fails to post |

---

## Section 5: Work Order Completions (IC)

### 5.1 Overview

Completions record the transfer of finished goods from the work order into inventory. They are entered using **Work Order Completions (P31114)**. The item ledger and item location are updated immediately; GL entries are created when R31802A runs.

### 5.2 Journal Entry

Finished goods are debited and WIP is credited at **Actual Quantity Completed × Frozen Standard Cost (F30026)**:

| Account | Debit | Credit | AAI | GL Class Code Source |
|---|---|---|---|---|
| Finished Goods / Sub-Assembly Inventory | × | | **3130** | Parent item — F41021 |
| Work In Process (WIP) | | × | **3120** | Parent item — F41021 |

### 5.3 Tables Updated

| Step | Table | Description |
|---|---|---|
| At completion (P31114) | **F4111** | IC cardex record created at frozen standard cost |
| At completion (P31114) | **F41021** | On-hand quantity increased for the parent item |
| At R31802A | **F0911** | GL entries created: debit Finished Goods (3130), credit WIP (3120) |
| At R31802A | **F0011** | Batch header for the W batch |
| At R31802A | **F4801** | Work order status advanced to 95 |

### 5.4 Standard Cost Change After Completion — Two-Row Pattern

If the item's standard cost is updated via **R30835 (Frozen Standard Update)** after a completion has already posted to F4111, JD Edwards writes a second F4111 row to revalue the completed inventory. This produces a characteristic two-row pattern in the Transaction Detail report:

| Row | Comment | Quantity | Unit Cost | Amount |
|---|---|---|---|---|
| **Row 1** | Completed W.O.'s To Inventory | Non-zero | Original standard | Original amount |
| **Row 2** | Standard Cost Change | **Zero** | **Zero** | Revaluation amount only |

**The GL entry for Row 2 is only created if WIP Revaluation (R30837) was run after the cost update.** If R30837 was not run, Row 2 exists in F4111 with no corresponding F0911 entry — creating a cardex-only variance equal to the Row 2 amount. See Section 8 for the full R30837 procedure.

### 5.5 Second Completion Batch Pattern

If a work order is completed in two separate batches, F4111 will contain two rows for the same document, both with comment "Completed W.O.'s To Inventory" and non-zero quantities. R31802A assigns the GL document to the first batch only; the second batch's GL entry carries a different GL document number.

| Signal | Description |
|---|---|
| Two IC rows, both non-zero quantity | Second completion batch — GL doc mismatch is expected |
| Two IC rows, Row 2 has zero quantity | Standard Cost Change — see Section 5.4 |

### 5.6 Common Reconciliation Issues

| Issue | Cause | Indicator in RapidReconciler |
|---|---|---|
| IC in End of Day | R31802A has not run | End of Day variance |
| Cardex-only variance equal to Row 2 amount | R30837 not run after standard cost update | "Standard Cost Change" row in F4111 with no GL match; see Section 8 |
| GL doc mismatch — apparent missing GL entry | Second completion batch with different GL doc | Two IC rows with identical non-zero amounts; query F0911 for the work order across all GL docs before posting a journal entry |
| Account mismatch on IC | AAI 3130 or 3120 misconfigured for parent GL class | Transactions page — Accounts sub-type; DMAAs section |

---

## Section 6: Parent Scrap (IS)

### 6.1 Overview

Parent scrap records the disposal of work-in-process material that cannot be completed. The scrap debit uses AAI **3130** configured as a scrap account rather than a finished goods account. WIP is credited at the same rate as a normal completion.

### 6.2 Journal Entry

| Account | Debit | Credit | AAI | GL Class Code Source |
|---|---|---|---|---|
| Scrap Account | × | | **3130** (scrap) | Parent item — F41021 |
| Work In Process (WIP) | | × | **3120** | Parent item — F41021 |

> **AAI 3130 dual use:** AAI 3130 serves as both the Finished Goods account (for IC completions) and the Scrap account (for IS transactions). To route scrap to a separate account from finished goods, configure AAI 3130 with document type **IS** pointing to the scrap account, and AAI 3130 with document type **IC** pointing to the finished goods account. If both use the same AAI entry, scrap and finished goods post to the same account.

### 6.3 Tables Updated

| Step | Table | Description |
|---|---|---|
| At scrap entry | **F4111** | IS cardex record created |
| At scrap entry | **F41021** | On-hand quantity reduced (scrap removed from inventory) |
| At R31802A | **F0911** | GL entries: debit Scrap (3130), credit WIP (3120) |
| At R31802A | **F0011** | Batch header for the W batch |

### 6.4 Common Reconciliation Issues

| Issue | Cause | Indicator in RapidReconciler |
|---|---|---|
| Scrap posting to finished goods account | AAI 3130 not differentiated by document type IS vs. IC | Transactions page — scrap amount in finished goods account |
| IS in End of Day | R31802A has not run | End of Day variance |

---

## Section 7: Variance Accounting (IV)

### 7.1 Overview

Variance accounting is the final manufacturing accounting step. **R31804** clears the WIP balance to zero after all material and labor transactions have been processed by R31802A. The formula is:

**WIP = (IM + IH) − IC − IS = IV**

R31804 can only be run **once per work order** and must not be run until R31802A has processed all IM, IH, IC, and IS transactions for that order. Running R31804 prematurely creates a permanent variance that requires manual journal entries to correct.

### 7.2 Journal Entry

WIP is cleared and variance amounts are distributed to the appropriate variance accounts:

| Account | Debit or Credit | AAI | Variance Type |
|---|---|---|---|
| Work In Process (WIP) | Debit or credit (as needed to zero) | **3120** | Offset |
| Labor Variance | Offset | **3220** | Labor efficiency variance |
| Material Variance | Offset | **3240** | Material usage variance |
| Planned Variance | Offset | **3260** | Planned quantity or substitution variance |
| Engineering Variance | Offset | **3270** | Current cost vs. standard cost variance |
| Other Variance / WIP Clearance | Offset | **3280** | Remaining unallocated WIP balance |

Each variance AAI receives a debit or credit depending on whether the variance is favorable (credit) or unfavorable (debit).

### 7.3 Variance Types

| Variance Type | AAI | How It Is Generated |
|---|---|---|
| **Engineering** | 3270 | R31410 found a difference between Standard Cost and Current Cost. Current Cost reflects BOM or routing changes not yet included in the frozen standard. |
| **Planned** | 3260 | A different component was substituted for the one on the BOM, or assembly occurred at a work center with different rates than planned. |
| **Material** | 3240 | Actual material or labor used differed from the planned amount. Quantity Ordered ≠ Quantity Issued at the time R31804 ran. |
| **Labor Efficiency** | 3220 | A labor efficiency other than 100% was used. Only generated if Work Center Efficiency is enabled in Manufacturing Constants. |
| **Other / WIP Clearance** | 3280 | Remaining WIP balance after all other variance types have been allocated. Common when material was issued for more units than were completed and unused material was not returned to inventory. |

### 7.4 Tables Updated

| Step | Table | Description |
|---|---|---|
| At R31804 | **F0911** | GL entries: debit/credit WIP (3120); debit/credit variance accounts (3220–3280) |
| At R31804 | **F0011** | Batch header for the W batch |
| At R31804 | **F4801** | Work order status advanced to 97 or 99 |

### 7.5 Variance Types — Diagnostic Guide

| Large Variance | Most Likely Cause | First Check |
|---|---|---|
| Large engineering variance | BOM or routing changed after R31410 ran | Compare frozen standard (F30026) to current cost at time of R31804 |
| Large planned variance | Component substitution or different work center used | Review parts list (F3111) vs. actual issues in F4111 |
| Large material variance | Over- or under-issue; scrap not recorded | Compare F3111 Quantity Ordered to F4111 Quantity Issued |
| Large other variance | Incomplete material return or unclosed partial completions | Confirm all surplus material was returned via P31113; confirm completion quantities |
| Unexpected labor efficiency | Work center efficiency enabled with unrealistic rate | Check UDC 31/ER rates and Manufacturing Constants efficiency settings |

### 7.6 Common Reconciliation Issues

| Issue | Cause | Indicator in RapidReconciler |
|---|---|---|
| IV in End of Day | R31804 batch not yet posted | End of Day variance |
| Account mismatch on IV | Variance AAI (3220–3280) not configured for parent GL class | Transactions page — Accounts sub-type; DMAAs section shows missing or mismatched AAI |
| Period mismatch on IV | R31804 ran in a different period than IM/IH/IC entries | Transactions page — Periods sub-type; compare IV GL date to IM/IH/IC dates |
| Variance larger than expected | R31804 run before all IM/IH/IC transactions processed by R31802A | Confirm R31802A status = 95 before running R31804 |

---

## Section 8: WIP Revaluation (R30837)

### 8.1 Overview

When the frozen standard cost of an item is updated via **R30835 (Frozen Standard Update)**, any open work-in-process must be revalued to the new standard. **R30837 (WIP Revaluation)** performs this revaluation by writing an adjusting entry to both F4111 (cardex) and F0911 (GL).

**R30837 only processes open work orders.** Work orders that have already been closed (status 99 or 999) are not revalued — manual journal entries are required for those.

### 8.2 When R30837 Must Be Run

R30837 must be run whenever R30835 updates the frozen standard for an item that has:

- Open work orders with WIP balances
- Work orders with completions already posted but not yet variance-accounted

Failure to run R30837 produces a **Standard Cost Change** row in F4111 with no matching F0911 entry — a cardex-only variance that persists until a manual journal entry is posted.

### 8.3 Journal Entry (R30837)

| Account | Debit | Credit | Condition |
|---|---|---|---|
| Finished Goods / WIP | × | | Cost increased |
| Variance Account | | × | Cost increased |
| Variance Account | × | | Cost decreased |
| Finished Goods / WIP | | × | Cost decreased |

### 8.4 Tables Updated

| Step | Table | Description |
|---|---|---|
| At R30837 | **F4111** | "Standard Cost Change" row written with zero quantity and revaluation amount |
| At R30837 | **F0911** | GL revaluation entry created |
| At R30837 | **F30026** | Frozen standard updated to new cost |

### 8.5 Identifying a Missing R30837 Entry

The pattern is visible in the Transaction Detail report in RapidReconciler:

| Signal | Location | What to Look For |
|---|---|---|
| Two-row F4111 pattern | F4111 Data section | Row 1: IC completion with non-zero quantity. Row 2: "Standard Cost Change" with zero quantity and zero unit cost but non-zero dollar amount. |
| Cardex-only variance | RR Summary | Row 2 appears as CardexAmount non-zero, LedgerAmount = $0.00 |
| Variance amount | RR Summary | Equals the Row 2 Standard Cost Change amount exactly |
| No DMAAs flag | DMAAs section | Configuration is clean — this is not an AAI problem |

### 8.6 Resolution for Missing R30837 Entry

**If the work order is still open (status < 99):**
- Run R30837 for the affected item. The revaluation GL entry will be created and the variance will clear at the next RapidReconciler refresh.

**If the work order is closed (status 99 or 999):**
- R30837 will not process this work order. Post a manual journal entry:
  - **Debit:** Inventory account (AAI 3130) for the Row 2 variance amount
  - **Credit:** Appropriate variance account (AAI 3260 Planned Variance or 3240 Material Variance)
- Enter a note in RapidReconciler documenting the manual entry.

> **Aged variance note:** Missing R30837 entries frequently produce historic variances dating back months or years, since cost updates and the resulting cardex rows may not be detected until the next reconciliation review. Assess materiality before posting journal entries for small or very old amounts.

---

## Section 9: AAI Reference

### 9.1 Manufacturing AAIs (3000 Series)

| AAI | Account | Document Types | GL Class Code Source | Notes |
|---|---|---|---|---|
| **3110** | Raw Material / Sub-Assembly Inventory | IM (credit side) | **Component** | One entry per component GL class code |
| **3120** | Work In Process (WIP) | IM (debit), IH (debit), IC (credit), IS (credit), IV (debit or credit) | **Parent item** | All transaction types use parent except IM credit |
| **3130** | Finished Goods / Sub-Assembly / Scrap | IC (debit), IS (debit) | **Parent item** | Configure separately by document type IC vs. IS to route scrap to a different account |
| **3220** | Labor Variance | IV | Parent item | Only generated if Work Center Efficiency enabled in Manufacturing Constants |
| **3240** | Material Variance | IV | Parent item | Generated when actual material differs from planned |
| **3260** | Planned Variance | IV | Parent item | Generated when different component or work center used |
| **3270** | Engineering Variance | IV | Parent item | Generated when current cost differs from frozen standard |
| **3280** | Other Variance / WIP Clearance | IV | Parent item | Clears any remaining WIP balance not allocated to other variance types |
| **3401** | Payroll Accrual | IH (credit) | Parent item | Credit side of all labor, outside operations, and cross-charges |

### 9.2 AAI Search Sequence

Like all DMAIs, manufacturing AAIs fall back through the following search sequence if an exact match is not found:

| Step | Search Criteria | Result if Not Found |
|---|---|---|
| 1 | Company + Document Type + GL Class Code | Proceed to Step 2 |
| 2 | Company + Document Type + **** (wildcard class) | Proceed to Step 3 |
| 3 | Company 00000 + Document Type + GL Class Code | Proceed to Step 4 |
| 4 | Company 00000 + Document Type + **** (wildcard) | Error — AAI not found |

### 9.3 Common AAI Misconfigurations

| Misconfiguration | Symptom | Resolution |
|---|---|---|
| AAI 3110 missing for a component GL class code | Account mismatch on IM credit side; Transactions page — Accounts sub-type | Add AAI 3110 for the component's GL class code pointing to the correct raw material account |
| AAI 3120 missing for parent GL class code | Account mismatch on IM debit, IH, IC, IS, or IV | Add AAI 3120 for the parent item's GL class code pointing to the correct WIP account |
| AAI 3130 not differentiated by document type | Scrap posting to finished goods account | Configure AAI 3130 with document type IS pointing to scrap account; document type IC to finished goods |
| AAI 3220 missing with Work Center Efficiency enabled | R31802A error; batch fails to post | Add AAI 3220 for all parent GL class codes in use, or disable Work Center Efficiency if efficiency data is not reliable |
| Variance AAIs (3240–3280) all pointing to same account | Variance detail lost — all variances net in one account | Set up each variance AAI to a distinct account to enable variance type analysis |
| F41021 GL class code differs from F4102 | Transactions post to unexpected account; no warning generated by JDE | Run Integrity Report 5 in RapidReconciler; correct F41021 to match F4102 |

### 9.4 Branch/Plant Constants — GL Explanation Field

The General Ledger Explanation field in **Branch/Plant Constants** controls what descriptive text appears in the journal entry explanation field:

| Setting | Explanation Used | Recommendation |
|---|---|---|
| **1** (default) | Item description (from Item Master) | Not recommended — descriptions change over time and make journal entries hard to trace |
| **2** | Primary Part Number | **Recommended** — uniquely identifies the item regardless of description changes; essential for variance research and report generation |

---

## Section 10: Reconciliation Reference

### 10.1 Document Type Summary

| Document Type | Description | GL Created By | GL Doc = Cardex Doc? | F4111 Written? |
|---|---|---|---|---|
| **IM** | Material issue to work order | R31802A | **No** — GL doc is R31802A's own document number | Yes |
| **IH** | Labor and overhead accrual | R31802A | **No** | Yes |
| **IC** | Work order completion to finished goods | R31802A | **No** | Yes |
| **IS** | Parent scrap | R31802A | **No** | Yes |
| **IV** | Variance accounting / WIP clearance | R31804 | **No** | No — IV is GL-only; no cardex is written |

> **IV transactions:** Because IV does not write to F4111, it will appear as a GL-only entry on the Transactions page. This is expected. Query F0911 for the IV batch to confirm the variance amounts and types.

### 10.2 RapidReconciler Variance Sources for Manufacturing

| Variance Source | When Manufacturing Contributes | Resolution |
|---|---|---|
| **End of Day** | IM, IH, IC, IS transactions where R31802A has not yet run | Confirm R31802A ran successfully for the affected work orders; check batch status |
| **GL Batches** | W batch created by R31802A or R31804 that is unposted or in error | Post the batch; resolve any posting errors — see GL Batch Posting Reference Guide |
| **Transactions — Accounts** | Account mismatch between F4111 and F0911 for IM, IH, IC, IS | Check AAI configuration for the affected GL class codes; check F41021 vs. F4102 class code match |
| **Transactions — Periods** | Period mismatch between F4111 and F0911 | Check R31802A and R31804 GL Date processing option; confirm batch ran in the correct period |
| **Cardex Variance** | Standard Cost Change row with no GL match (missing R30837) | Run R30837 for open work orders; post manual journal entry for closed work orders |

### 10.3 GL Summarization — The Cross-Work-Order Pattern

R31802A summarizes GL entries by account within its run. A single F0911 entry for a given GL account and batch may reflect costs from **multiple work orders** processed in the same R31802A run — not just the work order shown in a given Transaction Detail report.

**This produces the following pattern in RapidReconciler:**

| Signal | Description |
|---|---|
| GL-excess on one GL class | F0911 exceeds F4111 for one specific GL class and batch; all other GL class / batch combinations reconcile cleanly |
| DMAAs section is clean | No configuration flags — the AAIs are correct |
| Net variance positive | GL posted more than cardex shows for this document |

**Investigation before posting any correcting entry:**
1. Note the GL document number from the F0911 entry for the affected batch and GL class.
2. Query F0911 for that GL document number with no order number filter.
3. If multiple work orders appear, the F0911 entry is a summarized posting. Sum the F4111 amounts for all included work orders — the total should equal the F0911 amount.
4. If the totals agree, suspend this record in RapidReconciler with a note explaining the GL summarization. No journal entry is required.

### 10.4 Period-End Checklist for Manufacturing

Before closing a period that includes manufacturing activity:

- [ ] All work orders at status 90 have been processed by R31802A (status advanced to 95)
- [ ] All W batches from R31802A are posted (posting status = D in P0011)
- [ ] All work orders requiring variance accounting have been processed by R31804 (status 97 or 99)
- [ ] All W batches from R31804 are posted
- [ ] GL Batches variance in RapidReconciler = $0 for all inventory accounts
- [ ] End of Day variance in RapidReconciler = $0 (no IM, IH, IC, IS transactions awaiting R31802A)
- [ ] Any Standard Cost Change rows on closed work orders have been resolved via manual journal entry
- [ ] UDC 31/ER rates reconciled with payroll for the period
- [ ] Integrity Report 5 reviewed for F41021 / F4102 GL class code mismatches
- [ ] Integrity Report 6 reviewed for F30026 / F4105 frozen cost mismatches

### 10.5 Manufacturing Constants — Settings That Affect Reconciliation

| Setting | Location | Reconciliation Impact |
|---|---|---|
| **Work Center Efficiency** | Manufacturing Constants | If enabled, requires AAI 3220 for all parent GL class codes. Missing 3220 causes R31802A to error — W batch not created; End of Day variances persist. |
| **Accounting Cost Quantity (ACQ)** | Manufacturing Constants | Determines setup cost per unit. If left at default of 1, setup cost is overstated for all but single-unit work orders — producing systematic setup variances that obscure genuine cost issues. |
| **Fixed and Variable Overhead** | Manufacturing Constants | Both calculated as a percentage of labor. If both are configured without a clear split, overhead may be double-counted in WIP — inflating variance amounts at R31804. |
| **GL Date Source** | R31802A Processing Options | Controls whether F0911 entries use the work order completion date or the R31802A run date. If set to run date, all work orders processed on the same day share the same GL date, increasing cross-work-order GL summarization. |

---

## Section 11: Related Documentation

- [DMAAI Reference Guide](../MDS/distribution-aais.md)
- [Manufacturing Programs — Processing Options & Variance Reference](../MDS/processing-options.md)
- [GL Batch Posting Reference Guide](../MDS/gl-batch-processing.md)
- [Inventory Key Concepts](../MDS/inventory-key-concepts.md)
- [Transaction Detail Analysis Guide](../MDS/transaction-detail-analysis-guide.md)
- [Inventory: Using the Application](../MDS/inventory-using-application.md)
- [Product Costing Guide](../MDS/product-costing.md)
- [Outside Operations Reference Guide](../MDS/outside-operations.md)
- [Zero Balance Adjustments](../MDS/zero-balance-adjustments.md)
