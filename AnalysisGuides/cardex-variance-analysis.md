# Cardex Variance Analysis Guide
**Template for Item Roll Forward Amount Variance Investigations**
*Integrates JD Edwards / RapidReconciler resolution procedure*

---

## Section 1: Using Claude for Automated Analysis

Claude can perform a full cardex variance analysis automatically and return an updated `.xlsx` workbook with the analysis written to a card-layout sheet, the source sheet sorted into chronological order with priority highlights, and the priority level computed from the variance against typical transaction activity in both quantity and amount dimensions. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`cardex-variance-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The Item Roll Forward export (`.xlsx`)

Then use the following prompt:

> *"Analyze this file using the Cardex Variance Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the card-layout analysis sheet and the source sheet sorted ascending by ukid with priority highlights."*

Claude will read both documents, perform the analysis described in Sections 2–10 of this guide, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet and highlights."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **cardex-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Transactional, item-focused.** A single primary variance with a single root cause; the reader's job is to understand *this* number.

**File naming** (formatting spec, Section 1): `Cardex Variance Analysis for Item {item} {branch}.xlsx`. The key identifier is the item number and primary branch.

**Source sheet name:** `Item Roll Forward`. The export arrives in descending order by ukid (newest transaction first); per Section 13.4 of the formatting spec, this guide requires the source sheet to be **sorted ascending by ukid (column C)** before analysis. The Beg bal row (ukid `0`) sorts to the top, the Curr bal row (ukid `999999999999`) sorts to the bottom, and the running totals build chronologically.

**Headline anchor** (formatting spec, Section 4): item ID and primary location.

> `Cardex Variance — Item {n}, Branch {b}, Location {loc}`

**Variance subline** (formatting spec, Section 5.3): a single sentence that quantifies the gap. Examples of what the sentence should answer: how much quantity is unaccounted for, how much dollar value is stranded, what the on-hand table is showing relative to the item ledger.

**Secondary context strip** (formatting spec, Section 5.4) carries: GL Class, GL Account, and Std Cost (or WAC depending on cost method).

**Variance card pattern label** (formatting spec, Section 6.1): use the Section 4 / Section 5 pattern name from this guide. For quantity variances: `F41021 vs F4111 Integrity Gap (Quantity Variance)` — followed by a one-line plain-English explanation appropriate to the case.

**Priority calculation** (formatting spec, Section 9.3, ratio-based — dual-ratio variant): cardex takes the **higher** of the quantity and amount ratios as the governing ratio. This is necessary because some items have negligible cost — a large-quantity gap on a $0.001/unit item shows almost no dollar variance but is still a real operational problem.

The two ratios are computed against the **transaction rows** of the sorted-ascending source sheet (excluding the Beg bal and Curr bal anchor rows):

```
qty_ratio = |QtyVar| / mean(|qty change|)
amt_ratio = |AmtVar| / mean(|amt change|)
governing = max(qty_ratio, amt_ratio)
```

For zero-cost or near-zero-cost items, the amount ratio will be undefined; the quantity ratio governs. For mixed-cost items, taking the max biases toward the higher-priority outcome.

The variance card rationale row (formatting spec, Section 6.1) shows both ratios and identifies which one governs:

> `qty {n}% · amt {n}% — governing {n}% ({dimension}) — {action label}`

**HOW card standard steps** for cardex variances (Resolution sub-card per formatting spec, Section 6.2):

1. Confirm F41021 on-hand qty matches expectation. If it doesn't, run a cycle count or adjust the quantity manually, then re-evaluate after the next RapidReconciler refresh cycle.
2. View the item on the item ledger screen in JD Edwards, display all rows, and export to Excel. Then perform an analysis using this guide to obtain the current quantity and amount variances — these are the figures to use for the corrections in the steps below.
3. Request an F41021 SQL correction from IT using the current quantity variance from Step 2 (DBA support required — confirm F4111 is the accurate record before proceeding).
4. If there are any residual amounts after the quantity correction, perform a dollars-only adjustment to clear.
5. Run Re-Roll on the RapidReconciler As Of page for all locations for the item and confirm QtyVar and AmtVar both go to zero on the next refresh.

The exact wording can be specialized to the case (specific item number, location, etc.), but the step structure should be preserved.

**Evidence list** (formatting spec, Section 6.3): the Evidence list shows the source rows that drive the variance, with severity badges (Section 6.4):
- **Root cause (P1)** — the transaction that caused the variance
- **Anchor (P2)** — the Curr bal row showing the variance values
- **Related (P2)** — supporting transactions that help the reader understand the pattern (e.g., paired transfers, the Beg bal anchor)
- **Informational (P3)** — context-only rows

Each Evidence row is hyperlinked to its source-sheet row.

**Source sheet handling** (formatting spec, Section 10): Pattern C — **highlight only the rows referenced by Evidence** with priority fills matching their severity badge. Do not highlight every transaction.

**Source sheet column formatting requirements:**

| Column | Field | Format |
|---|---|---|
| A | `companynumber` | Text / character — format as `@` |
| B | `longaccount` | Text / character — format as `@` |
| C | `ukid` | Plain integer, no commas — format as `0` |
| D | `branch` | Text / character — format as `@` |
| E–N, P–U | All other fields | Per field type: dates as date, quantities as `#,##0.000`, amounts as `#,##0.00`, text as text |
| O | `doc` (document number) | Plain integer, no commas — format as `0` |

`companynumber`, `longaccount`, and `branch` are JD Edwards identifiers that must be preserved exactly as exported — numeric formatting would strip leading zeros or alter the display. `ukid` and `doc` are system-generated identifiers, not quantities; comma formatting misrepresents them.

### 1.4 Notes and Limitations

- Claude analyzes the data as exported. If the source report was generated with filters applied or sections suppressed, the analysis reflects only what is present in the file.
- For very large Item Roll Forward files spanning many items or periods, include a note in the prompt identifying the specific item number and lot to focus on if only one item is under investigation.
- Claude will note findings that require further investigation in JD Edwards (e.g., verifying a PI revaluation authorization, querying F0911 for a specific batch) that cannot be completed from the Excel file alone. These will appear inside the HOW card or as Related evidence rows pointing to the source.
- Amounts in the exported file may display with floating-point precision artifacts. Claude rounds all amounts to two decimal places for analysis and reporting purposes. These artifacts do not affect the accuracy of the analysis.
- The correction amounts in the output reflect the variance present at the time the workbook was generated. The variance in JDE may have moved since then (corrections applied, new transactions posted), which is why HOW Step 2 directs the analyst to refresh the variance numbers from JDE before posting any correction.
- The priority level on the variance card is computed mechanically from `max(qty_ratio, amt_ratio)` against the thresholds in Section 9.3 of the formatting spec. A reviewer who disagrees with the computed priority can override it manually, but should also question whether the threshold rule needs adjustment in the guide rather than just the one workbook.


## Section 2: What Is a Cardex Variance?

A **Cardex** (also called an Item Roll Forward or Item Transaction History) records every inventory movement for an item — receipts, issues, transfers, and adjustments — along with running quantity (`runqty`) and running amount (`runamt`) balances. In JD Edwards, this data lives in the item ledger table **F4111**.

An **amount variance** (`amtvar`) exists when the running amount does not agree with the expected value for the on-hand quantity. The most critical scenario is when:

> **runqty = 0** but **runamt ≠ 0**

This means the item has been fully depleted in quantity, yet a residual dollar balance remains stranded on the inventory GL account.

**JD Edwards is the system of record.** RapidReconciler calculates its cardex variance only from the point when the program was first initiated or data was last reset — it does not have visibility into transaction history that predates that point. If a discrepancy exists between RapidReconciler and JD Edwards, the Re-Roll options synchronize RapidReconciler to match JD Edwards, not the other way around.

### 2.1 How RapidReconciler Calculates the Beginning Balance

JD Edwards does not provide reliable "as-of" inventory data, and loading decades of historical transactions into RapidReconciler at initial setup would be impractical. RapidReconciler therefore derives a **Balance Forward** internally to serve as the starting point for reconciliation. The process works as follows:

1. **Stable snapshot at go-live:** At the time of the initial production import, no inventory transactions should be in process. This ensures stable item balances can be obtained from the item location table (F41021).
2. **Back-calculation to the first reconciliation period:** Item ledger transactions (F4111), already assigned to fiscal periods using JD Edwards date patterns, are used to back-calculate from the F41021 snapshot to the first period to be reconciled. The result is the Balance Forward for that opening period.
3. **Fiscal period assignment:** Each F4111 record is allocated to a fiscal period using the following hierarchy — GL Date (if present and on or after the first day of the fiscal year) takes precedence; Creation Date is used only when no GL date is populated (possible for unprocessed End of Day transactions).
4. **Rolling forward:** From the Balance Forward, period-end perpetual balances are calculated by summarizing F4111 item ledger transactions period by period. These balances are reported in the RapidReconciler **Valuation** section.
5. **Cardex variance detection:** Any difference between the transaction-based summarization and the latest F41021 inventory snapshot is reported as **cardex variance** in the current period only. It is updated each nightly refresh cycle.

> **Important:** Cardex variance is always stated as a total amount in the **current period only**, regardless of when the underlying discrepancy originated. If the nightly refresh runs while transactions are in process, false positives may appear — recheck after the next clean refresh before taking corrective action.

**Cardex Accounting Methods — how prior-period variances are handled:**

When a variance occurs in a prior period but is not resolved until a later period, RapidReconciler provides two options:

| Method | Behavior | When to Use |
|---|---|---|
| **Inventory Basis** *(default, recommended)* | The prior-period variance remains in the period it occurred. The correcting transaction from the resolution period offsets the original variance. The variance category changes from "End of Day" to "Transactional Variance" and cross-period comments are added. Prior-period reconciliations are not altered. | Most organizations — handles timing differences cleanly without distorting historical periods |
| **GL Basis** | The variance is assigned to the period in which the correcting transaction is created rather than the period it occurred. | Only recommended for organizations that can routinely resolve all variances within the same period and will not encounter timing differences |

To change the Cardex Accounting Method, submit a written request to rrsupport@getgsi.com.

### 2.2 Where Cardex Variance Fits in the Reconciliation Framework

RapidReconciler identifies four sources of variance between the perpetual inventory system and the general ledger. Cardex variance is Source 4 — the integrity check between the item ledger transaction summary and the on-hand balance. If all four sources equal zero, perpetual and GL balances must be equal. Transactions must match in the same company, GL account, and fiscal period to be considered reconciled.

| # | Variance Source | Description |
|---|---|---|
| 1 | **GL Batch Postings** | Difference between GL detail table (F0911) and account balance table (F0902) — out of scope for this guide |
| 2 | **End of Day** | Item ledger transactions not yet reflected in the general ledger (work order completions via R31802A; sales shipments via R42800) — out of scope for this guide |
| 3 | **Transactional** | Fully processed transactions with a mismatch between F4111 and F0911 — out of scope for this guide |
| 4 | **Cardex** | Item ledger transaction summary (F4111) does not match the on-hand balance (F41021) — **this guide addresses Source 4 only** |

For **average cost items**, the summarization level depends on the cost level assigned to the item. Cost level 2 (branch plant level) items are analyzed by branch and item, inclusive of all locations and lots. For **standard cost items**, the summary must match on-hand balance in both units and amounts at the branch, item, location, and lot level.

In all cases, item ledger records with a posting code (`ILIPCD`) of **X** are memo transactions — work order scrap, lot releases, and certain warehousing movements — and must be excluded from the cardex calculation.

### 2.3 Variance Types

| QtyVar | AmtVar | Interpretation | Approach |
|---|---|---|---|
| 0 | 0 | No variance | No action |
| **Non-zero** | **Non-zero** | **Quantity and amount variance — F4111 ledger and F41021 on-hand have drifted apart** | **Proceed to Section 4; use the QtyVar branch at Step 2** |
| Non-zero | 0 | Quantity gap with no dollar impact — unusual; may indicate UOM issue | Investigate F41021 vs F4111 directly; coordinate with IT |
| **0** | **Non-zero** | **Dollar-only variance — cost differential with no quantity gap** | **Proceed to Section 4; use the dollar-only branch at Step 2** |

> **Note on the QtyVar + AmtVar pattern:** When both are non-zero, the AmtVar is almost always partly explained by the QtyVar — the quantity gap valued at the prevailing WAC accounts for the majority of the dollar variance, with a small residual remaining. Decompose the AmtVar into these two components before investigating further (see Step 2a below).

---

## Section 3: Key Fields Reference

### 3.1 Item Roll Forward Columns

| Field | Description |
|---|---|
| `runqty` | Running (cumulative) on-hand quantity after each transaction |
| `runamt` | Running (cumulative) inventory value after each transaction |
| `qty` | Transaction quantity (positive = in, negative = out) |
| `val` | Transaction value posted to inventory (qty × cost) |
| `cost` | Unit cost used for this transaction |
| `dt` | Transaction type code (see table below) |
| `doc` | JD Edwards document number — a plain integer identifier; formatted without commas in the output workbook (column O) |
| `qtyvar` | Quantity variance on the current balance row |
| `amtvar` | Amount variance on the current balance row |
| `comm` | Comment flag — look for `Curr bal` (current balance) and `Beg bal` (beginning balance) |
| `periodends` | Period end date for the transaction |

### 3.2 Common Transaction Type Codes (`dt`)

| Code | Description | GL Impact |
|---|---|---|
| `IT` | Inventory Transfer / Issue | Moves cost between locations or depletes inventory |
| `IM` | Manufacturing Issue — material issued to a work order | Reduces on-hand; GL updated by Manufacturing Accounting (R31802A) nightly |
| `OV` | Purchase Order Receipt | Increases on-hand; triggers WAC recalculation if cost differs from current WAC |
| `PV` | Voucher Match — A/P invoice matched to PO receipt | Zero or nominal qty; if invoiced cost differs from receipt cost, triggers a second WAC recalculation |
| `PI` | Purchase Invoice or Period Invoice (zero-qty = cost revaluation) | Updates WAC; zero-qty rows adjust cost without changing quantity |
| `IK` | Inventory Kit / Assembly receipt | Receipts finished kit into inventory at BOM cost |
| `IR` | Inventory Receipt | Standard purchase receipt |
| `IA` | Inventory Adjustment — quantity or dollars-only correction | Updates F4111 and F41021; high-volume items may have many small IA transactions across periods |
| `IB` | Inventory Balance / Cost Change | Zero balance adjustments, Re-Roll entries, and P4105 manual cost revisions; created by manual P4105 changes but **not** by system-driven WAC recalculations |

### 3.3 RapidReconciler Cardex Integrity Pop-Up Fields

| Field | Description |
|---|---|
| **Reason** | Either Quantity or Amount |
| **Quantity** | On-hand quantity recorded in RapidReconciler |
| **Amount** | On-hand value recorded in RapidReconciler |
| **QtyVar** | Quantity variance between RapidReconciler and JD Edwards |
| **AmtVar** | Dollar variance between RapidReconciler and JD Edwards |

> **Note:** The pop-up reflects data as of the most recent nightly refresh cycle. Any transactions after the last import will not appear until the following night's refresh.

### 3.4 Identifying the Item's Cost Method and Cost Level

The `dt` field carries two distinct pieces of item configuration data depending on which special row is being read. Both should be noted at the start of every analysis.

**Cost method — read from the `dt` field where `ukid = 999999999999` (Curr bal row)**

This field otherwise holds transaction type codes on all other rows. On the Curr bal row it carries the JD Edwards Sales/Inventory cost method code instead.

| Value in `dt` on Curr bal row | Cost Method | Key reconciliation implications |
|---|---|---|
| `02` | Weighted Average Cost | WAC recalculates after each qualifying OV receipt and PV voucher match; manual P4105 changes create IB rows; negative quantities corrupt the WAC — check that runqty never went below zero |
| `07` | Standard Cost | Costs frozen from F30026 cost components; component/ledger mismatch is the primary risk; check RapidReconciler Integrity Report 6 or run R30543; WIP Revaluation (R30837) must be run from R30835 when standards change |
| `09` | Actual Cost | Costs captured per work order; zero-cost transactions indicate missing F4105 entries; Inventory Cost Level must be 2 or 3 |

**Cost level — read from the `dt` field where `ukid = 0` (Beg bal row)**

The Beg bal row carries the JD Edwards Inventory Cost Level in its `dt` field. The cost level controls the granularity at which the system maintains the item's on-hand balance and average cost.

| Value in `dt` on Beg bal row | Cost Level | Meaning |
|---|---|---|
| `1` | Level 1 | Cost maintained at item/branch level — all locations and lots share a single cost |
| `2` | Level 2 | Cost maintained at item/branch level but quantity tracked by location and lot |
| `3` | Level 3 | Cost maintained at item/branch/location/lot level — each lot carries its own cost |

> **Reconciliation relevance:** The cost level affects the correct scope for the F4111 summary and F41021 comparison in Step 5.1. For Level 1 and 2 items, the cardex integrity check is performed at the branch and item level, inclusive of all locations and lots. For Level 3 items, each location and lot combination must be reconciled independently. Misidentifying the cost level can produce a false variance if the wrong aggregation level is used.

**WAC-specific analysis steps (cost method 02):**

When the cost method is `02`, extend the standard workflow with the following checks:

- **Trace OV/PV pairs:** Each OV purchase receipt may be followed by a PV voucher match at a different cost. If both are active in UDC 40/AV, the PV triggers a second WAC recalculation. A PV row with zero quantity and a non-zero `val` is the signature of this adjustment — it is normal behaviour, not a variance.
- **Confirm no IB rows from manual overrides:** IB rows signal a manual cost change via P4105. System-driven WAC recalculations produce no IB row. An IB row on a WAC item warrants confirmation that the manual change was authorised and necessary.
- **Check for negative quantity excursions:** Review whether `runqty` ever fell below zero at any point in the transaction history. A negative runqty corrupts the WAC formula and can produce costs that are zero, negative, or wildly incorrect from that point forward.
- **Assess silent cost absorption:** WAC absorbs purchase price changes into the running average without generating variance accounts. Note the opening WAC (Beg bal implied cost) and the current WAC (cost on the Curr bal row) and flag material increases for management awareness, even when the item is reconciled.

---

## Section 4: Step-by-Step Analysis Workflow

### Step 1 — Identify the Variance Row

Locate the row with `comm = "Curr bal"`. Read the `qtyvar` and `amtvar` values.

If using RapidReconciler, open the Cardex Integrity pop-up by hovering over the cardex variance line and clicking the green square. Note both the QtyVar and AmtVar fields — the combination determines which branch of this workflow applies.

Also read the following two `dt` field values before proceeding — both are required for a complete analysis:

- **Cost method** — `dt` on the **Curr bal row** (`ukid = 999999999999`): `02` = Weighted Average, `07` = Standard Cost, `09` = Actual Cost. Determines which additional checks apply (see Section 3.4).
- **Cost level** — `dt` on the **Beg bal row** (`ukid = 0`): `1`, `2`, or `3`. Determines the correct aggregation scope for the F4111 vs F41021 comparison in Step 5.1 — Level 1 and 2 items are reconciled at branch/item level inclusive of all locations and lots; Level 3 items are reconciled per location and lot (see Section 3.4).

### Step 2 — Determine the Variance Type and Branch

Sum all `qty` values across the transaction history (excluding the Curr bal and Beg bal rows). Compare the net to the `runqty` on the Curr bal row to confirm internal ledger consistency.

**Branch A — Dollar-only (QtyVar = 0, AmtVar ≠ 0):**
The F4111 ledger is internally consistent and the quantity ties to F41021. The variance is a cost differential — the ledger value does not match what the quantity should be worth at the current WAC. Proceed to Step 3.

**Branch B — Quantity and amount (QtyVar ≠ 0, AmtVar ≠ 0):**
The F4111 ledger quantity summary does not match the F41021 on-hand balance. Decompose the AmtVar first:

```
Component A (qty-driven)  = QtyVar × prevailing WAC (cost field on Curr bal row)
Component B (dollar-only) = AmtVar – Component A
```

If Component B is small or zero, the dollar variance is fully explained by the quantity gap. Investigate the quantity root cause (see Section 5h) before addressing any residual dollar amount. Proceed to Step 3 for the transaction-type segmentation, then jump to Section 5h for the quantity-specific root cause guidance.

### Step 3 — Verify the Beginning Balance

Before segmenting transactions, confirm the Beg bal row is consistent:

- Note the Beg bal `runqty`, `runamt`, and implied unit cost (`runamt ÷ runqty`).
- Confirm: Beg bal `runqty` + net transaction `qty` = Curr bal `runqty`. If this does not tie, the beginning balance itself may be the source of the discrepancy — see Section 2.1 for how RapidReconciler back-calculates this value.
- A small implied cost rounding difference (e.g., $0.0001/unit) between the Beg bal and the prevailing WAC is normal and immaterial.
- If the beginning balance does not tie, consider whether the discrepancy pre-dates RR go-live — meaning it may have been embedded in the Balance Forward at initial setup.

### Step 4 — Segment by Transaction Type

Group and sum `qty` and `val` by `dt` code. The transaction type with a mismatched value-to-quantity ratio relative to the others is the starting point for root cause analysis.

Example layout (dollar-only variance):

| dt | Net Qty | Net Val | Observation |
|---|---|---|---|
| IT | –70.00 KG | –$27,391.16 | Issues at blended higher WAC |
| IK | +70.00 KG | +$6,973.82 | Receipts at kit BOM cost |
| PI | 0.00 KG | $0.00 | Revaluations only, no net flow |
| **Total** | **0.00 KG** | **–$20,417.34** | **= amtvar** |

Example layout (quantity + amount variance):

| dt | Net Qty | Net Val | Observation |
|---|---|---|---|
| IT | +682,955.28 LB | +$1,662,915.41 | Transfers in |
| IM | –653,978.20 LB | –$1,593,002.42 | Work order issues |
| IA | –29,993.23 LB | –$73,330.31 | Adjustments — primary suspect for qty gap |
| IB | 0.00 LB | +$928.82 | Zero-qty cost corrections |
| **Total** | **–1,016.10 LB** | **–$2,488.38** | Net transactions only |

### Step 5 — Identify Cost Changes Over Time

Extract distinct `cost` values chronologically. A sharp change in unit cost between receipt and issue transactions is the most common driver of **dollar-only** amount variances in WAC environments. For **quantity variance** items, also check whether the cost has been stable — a single stable cost throughout history means WAC escalation is not a factor and the investigation should focus entirely on the quantity gap.

Look specifically for:
- PI rows with zero quantity (period-end revaluations that reset WAC without a purchase)
- IK rows where the `cost` differs from the prevailing PI `cost` on the same date
- Large cost jumps (>10%) between consecutive periods
- A single uniform cost across all transactions (rules out WAC escalation as a driver)

### Step 6 — Quantify the Cost Differential (Dollar-Only Branch)

Calculate the gap between the average receipt cost of the mismatched transaction type and the effective issue cost:

```
Avg receipt cost  = IK total val ÷ IK total qty
Effective issue   = |IT total val| ÷ |IT net qty|
Cost gap per unit = Effective issue – Avg receipt
Total variance    = Cost gap × net qty
```

Where a single driver is not obvious, decompose into sub-components (see Section 5a).

### Step 7 — Trace the Root Cause Event

**Dollar-only path:** Identify the specific transaction or period where cost increased materially:
- Was there a purchase at a significantly higher price that elevated the WAC pool?
- Were IK/assembly receipts posted at a cost that differed from the prevailing WAC?
- Was a PI (zero-qty revaluation) posted that stepped WAC up or down without an offsetting receipt?
- Were there backdated transactions that disturbed the WAC sequence?

**Quantity variance path:** Identify the transaction type and period where F4111 and F41021 diverged:
- Are there IA transactions where the F4111 record exists but F41021 was not updated? Query F4111 for IA rows where ILIPCD ≠ "P".
- Does the quantity gap pre-date RR go-live? If so, it may be embedded in the beginning balance.
- Is the gap consistent with a single transaction failure, or spread across multiple periods?

### Step 8 — Assess Materiality and Validate in JD Edwards

Before posting any correction, validate the variance directly in JD Edwards (see Section 6). Determine whether the issue requires a quantity correction, a dollars-only IA, or documentation only.

---

## Section 5: Common Root Causes

### 4a. Weighted Average Cost (WAC) Escalation After Kit Receipt

**Most common cause for IK-sourced variances.** When a kit/assembly receipt enters inventory at a BOM-derived cost ($X/KG) and the WAC subsequently rises significantly before those units are issued, the issues are priced at the higher WAC. When all units are depleted to zero quantity, the cost differential leaves a stranded GL balance.

**Two-component structure:** This root cause typically has two measurable sub-components:

| Component | Description | Calculation |
|---|---|---|
| IK receipt premium | IK cost differs from prevailing WAC at receipt date | (IK cost – PI cost on same date) × qty |
| WAC escalation | WAC rose after IK receipt; units issued at higher rate | Total variance – IK premium component |

*Indicators:* IK transactions with a `cost` value noticeably above or below surrounding PI costs; large jump in `cost` field between June and July periods; no offsetting purchase receipts to dilute the pool before depletion.

### 4b. WAC Escalation — General (No IK Involvement)

Same mechanism as 4a but driven by standard IT issue/receipt cycles. When large price increases enter the WAC pool (via higher-priced purchase receipts or PI revaluations) between the time stock was received and when it is ultimately issued, a residual can accumulate if the pool is fully depleted.

*Indicators:* PI rows showing a step-change in `cost` without a corresponding quantity flow; cost nearly doubling or more within a single period.

### 4c. IK Cost Mismatch (BOM Rate vs. Prevailing WAC)

Kit or assembly transactions post receipts at a **bill-of-materials cost** that may differ from the prevailing inventory WAC. This injects a new cost layer that is not corrected by subsequent PI revaluations (which apply only to on-hand quantity at the time of the revaluation).

*Indicators:* IK `cost` differs from the `cost` shown on PI rows dated on or before the same date.

### 4d. Period-End Revaluation (PI) Applied After Depletion

PI transactions with zero quantity are cost revaluations. If the PI is posted *after* inventory has been partially or fully issued, the cost correction applies only to remaining on-hand units. Prior issues that used the old cost are not retroactively adjusted, leaving a residual if the pool is later fully depleted.

*Indicators:* PI rows with zero qty clustered at period-end; variance magnitude matches the PI cost adjustment multiplied by the quantity on hand at the time of the PI.

### 4e. Rounding and Decimal Truncation

Fractional quantities (e.g., 0.49 KG) multiplied by high unit costs can produce small residual amounts due to rounding in the costing engine. This is generally immaterial but may accumulate over many periods.

*Indicators:* Small variance (< $50); non-integer quantities with many decimal places; variance unrelated to any single large transaction.

### 4f. Manual Override of Transaction Cost

If a user manually overrides the unit cost on an individual IT transaction (rather than allowing the system WAC to apply), that transaction is priced at the override cost rather than the pool WAC. This can leave the pool in an inconsistent state.

*Indicators:* Individual IT rows with a `cost` that does not match the prevailing WAC shown on surrounding PI rows.

### 4g. Unit of Measure Change

If the primary unit of measure for an item changes while inventory is on hand, historical transactions in the old UOM may not convert cleanly to the new UOM, producing an amount discrepancy even when quantity nets to zero.

*Indicators:* Mixed UOM values in the `uom` column across the transaction history.

### 4h. F41021 vs F4111 Integrity Gap (Quantity Variance)

**The cause when both QtyVar and AmtVar are non-zero.** The F4111 item ledger is internally consistent (beginning balance + net transactions = current runqty), but the F41021 on-hand balance does not agree with the F4111 summary. The ledger records more (or fewer) units than the physical on-hand table reflects.

**AmtVar decomposition:** In this pattern, the AmtVar has two components. The primary component is the quantity gap valued at the prevailing WAC (QtyVar × cost). A small residual dollar-only component may remain — often attributable to IB cost adjustment pairs or minor rounding — and is addressed separately with a dollars-only IA after the quantity issue is resolved.

```
Component A = QtyVar × WAC  ← resolved by fixing the quantity gap
Component B = AmtVar – Component A  ← resolved by dollars-only IA if material
```

**Common causes:**

| Cause | How to Identify | Resolution |
|---|---|---|
| IA transaction recorded in F4111 but F41021 was not updated | Query F4111 IA rows for ILIPCD ≠ "P"; gap is consistent with a specific IA document | Determine whether the IA failed to post or whether F41021 simply did not update; post the IA if unposted, or request an F41021 SQL correction from IT if the IA is confirmed posted |
| IA transaction posted to F4111 but failed to update F41021 | ILIPCD = "P" on all IA rows but F41021 qty still doesn't match; gap consistent with a specific IA document | Coordinate with IT; F41021 SQL correction required |
| Quantity gap pre-dates RR go-live | Discrepancy visible at the Beg bal level; gap has been stable across all periods without a clear transaction source | Determine whether F41021 or F4111 was correct at go-live; correct F41021 via SQL if F4111 is the accurate record; or post an IA to align F4111 to F41021 if F41021 is the accurate record |
| IB zero-qty cost adjustment pairs with unequal amounts | Two IB rows with zero qty but different absolute values netting to a non-zero amount | Confirm both IB entries were authorized; if one is erroneous, reverse it |

*Indicators:* QtyVar ≠ 0; F4111 ledger is internally consistent (beg bal + net trans = curr runqty); stable cost throughout history (ruling out cost escalation); high volume of IA transactions across many periods; gap is small relative to total IA activity (consistent with a single failed F41021 update).

### 4i. Weighted Average Cost Corruption (Method 02 Items Only)

**Applies only when the cost method on the Curr bal row is `02`.** WAC corruption occurs when the on-hand quantity is allowed to go negative at any point in the transaction history, causing the WAC formula to produce a zero, negative, or nonsensical unit cost from that point forward.

The corruption is silent — it does not immediately generate a variance. The corrupted cost is applied to all subsequent receipts and issues, and the damage only becomes visible when the running amount diverges materially from what the quantity should be worth. By the time a variance is detected, the corrupted cost may have been in use for many periods.

A secondary cause is an unauthorised manual cost change in P4105, which creates an IB transaction. While IB transactions are not inherently wrong, an unintended IB that set the cost to an incorrect value will corrupt all subsequent WAC calculations from that point.

| Cause | How to Identify | Resolution |
|---|---|---|
| On-hand quantity went negative | Scan `runqty` column chronologically for any negative value; the cost on the row immediately after the negative excursion will be the corrupted value | Identify the source transaction that caused the negative qty; correct or reverse it; manually reset the WAC via P4105 (creates IB); review all transactions since the corruption for restatement |
| Unauthorised IB manual cost change | IB row present with a cost that differs significantly from surrounding OV/PV costs and has no obvious authorisation | Confirm with cost accounting whether the IB change was intentional; reverse if not; repost downstream transactions if necessary |

*Indicators:* Cost method = `02`; `runqty` reaches a negative value at any row; `cost` field shows an anomalous value (zero, negative, or a dramatic jump) at the row following the negative excursion; IB rows present without a clear authorisation trail.

---

## Section 6: JDE Validation and Correction Procedure

### 6.1 Export and Validate the Cardex in JD Edwards

1. Export all cardex transactions for the item from JD Edwards to Excel (F4111).
2. **Exclude memo transactions:** Remove all rows where column `ILIPCD = "X"`. Memo transactions (work order scrap, lot releases, certain warehousing movements) do not impact the on-hand balance.
3. Sum the remaining `Quantity` (in primary UOM) and `Extended Amount` columns.
4. Compare your totals to the on-hand quantity and value displayed in JD Edwards (F41021).

| Result | Interpretation | Next Step |
|---|---|---|
| Qty and amount both match JDE | JDE is correct; variance is in RapidReconciler only | Use Re-Roll options (Section 7) |
| **Amount does not match JDE, qty matches** | **True dollar-only discrepancy in JD Edwards** | **Post a dollars-only IA (Steps 5.2–5.6)** |
| **Quantity does not match JDE** | **F4111 and F41021 quantities diverge — quantity correction required** | **Proceed to Step 5.7** |

### 6.2 Determine Cost Environment

- **Standard Cost (Method 07):** Proceed directly to Step 5.4.
- **Average Cost (Method 02):** Complete Step 5.3 first.

### 6.3 Average Cost Only: Disable Average Cost Update for P4114

> **Skip this step for standard cost items.**

In an average cost environment, P4114 (Inventory Adjustments) typically recalculates the unit cost when a transaction is posted. Running this recalculation during a dollars-only adjustment would change the average cost, negating the correction.

1. Enter **UDC** on the fast path → enter **40/AV** → click Find.
2. Locate program **P4114** in the table.
3. Change **Description 02** from **"Y" to "N"** to disable the average cost update.

> **Proceed immediately to Step 5.4.** This change takes effect at once — minimize the window during which it is active.

### 6.4 Post the IA Transaction in P4114

Navigate to **Inventory Adjustments (P4114)** from the applicable inventory menu and complete the following:

| Field | Value |
|---|---|
| **Item Number** | The item requiring adjustment |
| **Branch Plant** | The applicable branch plant |
| **Location** | The applicable location |
| **Lot Number** | The applicable lot number (if applicable) |
| **Extended Amount** | The adjustment amount (positive to increase value, negative to decrease) |

**Leave blank:**

| Field | Why |
|---|---|
| **Quantity** | Must be blank — entering a quantity changes the on-hand balance |
| **Unit Cost** | Must be blank — entering a unit cost produces a quantity-based transaction |

> **Critical:** Leaving Quantity and Unit Cost blank is what makes this a dollars-only adjustment. If either contains a value, the transaction will not behave as intended.

Review and post. The IA will appear in F4111 with the correct dollar amount and zero quantity.

### 6.5 Verify the JDE Adjustment

1. Open the item ledger (F4111) and confirm the IA transaction appears with the correct extended amount and a quantity of zero.
2. Re-export the cardex to Excel, re-apply the ILIPCD = "X" exclusion, and re-summarize to confirm the extended amount ties to the JD Edwards balance.
3. Verify that corresponding GL entries have been created and posted to the correct inventory account.

### 6.6 Average Cost Only: Restore UDC Table 40/AV

> **Skip this step for standard cost items.**

**Immediately after verifying the adjustment:**

1. Enter **UDC** on the fast path → **40/AV** → Find.
2. Locate **P4114**.
3. Change **Description 02** from **"N" back to "Y"**.

> **Warning:** Leaving P4114 set to "N" will prevent the average cost from updating on future legitimate transactions. Do not skip this step.

### 6.7 Standard vs. Average Cost Summary

| Step | Standard Cost | Average Cost |
|---|---|---|
| 5.3 — Disable avg cost update (UDC 40/AV) | Skip | **Required** |
| 5.4 — Post IA transaction | Required | Required |
| 5.5 — Verify adjustment | Required | Required |
| 5.6 — Restore UDC 40/AV | Skip | **Required** |

### 6.7 Quantity Variance — Correction Procedure

Use this procedure when Step 5.1 confirms that F4111 and F41021 quantities do not agree.

**5.7.1 — Locate the source of the gap**

Query F4111 for the affected item, branch, location, and lot. Filter for IA rows where ILIPCD ≠ "P" to identify any transactions that did not complete posting.

| Finding | Next Action |
|---|---|
| One or more IA rows with ILIPCD ≠ "P" found | Post the transaction(s) in JD Edwards. Recheck F41021 qty after posting before taking any further action. |
| All IA rows have ILIPCD = "P" but gap remains | The F41021 record did not update correctly when the IA was processed. Proceed to Step 5.7.2. |
| No IA transaction explains the gap | The discrepancy may pre-date RR go-live and be embedded in the beginning balance. Proceed to Step 5.7.3. |

**5.7.2 — F41021 correction (all batches confirmed posted)**

A direct correction to F41021 requires IT involvement and DBA access. Do not attempt this without coordination with your system administrator. Before requesting the correction, confirm:
- The F4111 summarized quantity is the accurate figure (i.e., all transactions are legitimate and correctly posted).
- The F41021 quantity is the figure that needs to be corrected, not the reverse.
- The correction quantity equals exactly the QtyVar amount shown in RapidReconciler.

After the F41021 correction, re-run the RapidReconciler import and confirm QtyVar = 0. Then address any residual dollar-only AmtVar using Steps 5.2–5.6.

**5.7.3 — Pre-go-live gap embedded in the beginning balance**

If the quantity discrepancy cannot be traced to any F4111 transaction and appears to have existed since RR was first initiated, the gap was likely embedded in the back-calculated beginning balance at setup (see Section 2.1). In this case:

1. Determine which system was accurate at go-live — F41021 (physical snapshot) or F4111 (transaction ledger).
2. If F41021 was correct at go-live and F4111 has since drifted: post an IA in JD Edwards to align F4111 to F41021 for the quantity difference.
3. If F4111 was correct at go-live and F41021 was wrong: request an F41021 SQL correction from IT for the quantity difference.
4. After the correction, use the **Zero Beginning Balance** Re-Roll option in RapidReconciler if the earliest period balance needs to be reset to reflect the correction (see Section 7, Option 2).

---

> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.

## Section 7: RapidReconciler Resolution Using Re-Roll

After completing the JD Edwards correction in Section 6 (or if Step 5.1 confirmed JDE is correct and the variance is in RapidReconciler only), use the **Re-Roll Item** dialog to synchronize RapidReconciler with JD Edwards.

> **Key principle:** The Re-Roll options do not change JD Edwards data. They recalculate or adjust RapidReconciler's internal balances to bring them into alignment with JD Edwards. **There is no Undo. Use with caution.**

### Option 1: Re-Roll Item

**When to use:** UOM changes; after a JDE correction has been made and RapidReconciler needs to be recalculated.

**What it does:** Keeps the current balance forward at the beginning of the timeline; adjusts transactions as needed; recalculates each period-ending total through the current period.

**How to use:** Open the Re-Roll Item dialog → check **Re-Roll Item** → verify item details (Company, Branch, Item Number, Location, Lot, GI Class, Cost Level, Primary UOM, Period Ends, Quantity, Amount, QtyVar, AmtVar) → click **Re-Roll**.

> This is the most common re-roll option. Verify item details carefully before executing.

### Option 2: Zero Beginning Balance

**When to use:** Only if the first available period for the item in RapidReconciler should have a beginning balance of zero. Confirm by selecting the oldest date from the Period Ends drop-down before using.

**What it does:** Forces the beginning balance to zero; recalculates each period total from the beginning of the timeline forward.

> **Warning:** All perpetual period totals may change. Do not use if the earliest period has a legitimate non-zero beginning balance.

### Option 3: Remove CX Var

**When to use:** JD Edwards is confirmed correct but RapidReconciler is showing a cardex variance. Requires JDE validation (Section 6.1) to be completed first.

**What it does:** Removes the erroneous cardex variance displayed in RapidReconciler for the item.

> **Important:** Do not use this option to mask a genuine JDE data issue. Always complete JDE validation first.

### Re-Roll Quick Reference

| Option | Use When | Key Caution |
|---|---|---|
| **Re-Roll Item** | UOM changes or general recalculation | Verify item details before executing |
| **Zero Beg Bal** | Earliest period should be zero | All perpetual period totals recalculate |
| **Remove CX Var** | JDE correct, RR shows variance | Complete JDE validation first |

### Confirming the Result

Re-Roll changes are applied immediately in RapidReconciler's internal data, but the Cardex Integrity pop-up reflects data as of the most recent nightly import. Verify the variance has cleared by checking the item after the **next nightly refresh cycle** completes. Confirm both **QtyVar** and **AmtVar** show **0**. If a variance still appears, repeat the Section 6 validation before taking further action.

---

## Section 8: Case Studies — [Generated from Customer Data]

Section 8 is populated by Claude based on the uploaded Item Roll Forward file. Each case study documents one item/lot/branch combination under investigation. The structure below defines what each case study must contain.

### Case Study Template

**Case Study [N] — Item [number] / Lot [lot or "none"] / Branch [branch] ([Variance Type]: [Root Cause Classification])**

**File:** `[filename]`
**Item:** [item number] | **Lot:** [lot or none] | **Branch:** [branch] | **Location:** [location]
**GL Account:** [account] | **GL Class:** [GL class] | **UOM:** [unit]
**QtyVar:** [value] | **AmtVar:** [value]

**[N].1 Transaction Summary**
Net quantity and value by `dt` code. Confirm whether the F4111 ledger is internally consistent (Beg bal + net transactions = Curr bal runqty). State clearly whether the variance is dollar-only or quantity + amount.

**[N].2 Beginning Balance**
Beg bal date, runqty, runamt, and implied unit cost. Internal consistency check result. Note if the gap may pre-date RR go-live.

**[N].3 Variance Decomposition** *(quantity + amount variances only)*
Break AmtVar into Component A (QtyVar × prevailing WAC) and Component B (dollar-only residual). Identify the primary driver.

**[N].4 Root Cause**
Section 5 pattern classification. For dollar-only variances: identify the cost inflection point(s), the transactions that drove cost changes, and the mechanism by which the stranded balance accumulated. For quantity variances: identify the most likely source of the F4111 / F41021 gap.

**[N].5 RapidReconciler Classification**
State the root cause code from Section 5, the variance type (QtyVar = 0 or ≠ 0, AmtVar value), and a one-sentence summary.

**[N].6 Corrective Action**
Full step-by-step correction per Sections 5 and 6, with field-level values for the IA transaction and the Re-Roll option to use.

**[N].7 Recommended Preventive Actions**
Follow-up items specific to this item's pattern: cost review, BOM validation, IA processing controls, IB authorization confirmation, WAC monitoring, or IT coordination as applicable.



---

## Section 9: Analysis Checklist

Use this checklist for each Cardex variance investigation:

**Identification**
- [ ] Read QtyVar and AmtVar from the Curr bal row (`ukid = 999999999999`)
- [ ] Read cost method from `dt` on the Curr bal row (`ukid = 999999999999`): `02` = WAC, `07` = Standard, `09` = Actual
- [ ] Read cost level from `dt` on the Beg bal row (`ukid = 0`): `1`, `2`, or `3` — determines correct aggregation scope for F4111 vs F41021 comparison
- [ ] In RapidReconciler, confirm values in the Cardex Integrity pop-up (Quantity, Amount, QtyVar, AmtVar)
- [ ] Determine variance type: dollar-only (QtyVar = 0) or quantity + amount (QtyVar ≠ 0)

**Beginning Balance**
- [ ] Note Beg bal date, runqty, and runamt
- [ ] Confirm: Beg bal runqty + net transaction qty = Curr bal runqty (F4111 internal consistency check)
- [ ] Note implied unit cost at Beg bal; confirm rounding vs prevailing WAC is immaterial
- [ ] If internal consistency fails, investigate whether the Beg bal itself is the source

**Cardex Analysis**
- [ ] Sum `qty` and `val` by dt code
- [ ] If QtyVar = 0: confirm net qty = 0 (pure cost differential); proceed with dollar-only path
- [ ] If QtyVar ≠ 0: decompose AmtVar into Component A (QtyVar × WAC) and Component B (residual)
- [ ] Chart `cost` over time — stable cost rules out WAC escalation as a driver
- [ ] Identify any IK transactions; compare cost to prevailing PI cost on same date
- [ ] Identify any zero-qty PI revaluations and the magnitude of their cost adjustment
- [ ] Identify any IB rows; confirm whether they are system WAC recalculations (no IB expected) or manual P4105 overrides (IB present); confirm any manual IB was authorised
- [ ] Check for backdated transactions (`transdate` significantly earlier than adjacent `periodends`)
- [ ] If dollar-only: quantify cost differential; decompose into sub-components where applicable
- [ ] If quantity variance: identify IA volume and pattern; check for a gap consistent with a single failed F41021 update

**Cost Method-Specific Checks (Method 02 — WAC)**
- [ ] Scan `runqty` for any negative value at any row — negative qty corrupts WAC (Section 5i)
- [ ] Trace OV/PV pairs: confirm PV voucher match cost adjustments are expected and match the invoice
- [ ] Note opening WAC (Beg bal implied cost) vs current WAC — flag material increases even if reconciled
- [ ] Confirm no unauthorised IB rows from manual P4105 overrides

**Cost Method-Specific Checks (Method 07 — Standard Cost)**
- [ ] Check RapidReconciler Integrity Report 6 (or run R30543) for component/ledger mismatch
- [ ] If standard cost was updated recently, confirm R30837 WIP Revaluation was run from R30835
- [ ] Verify cost component sum in F30026 equals F4105 method 07 value for the item

**JDE Validation (Section 6)**
- [ ] Export F4111; exclude ILIPCD = "X" rows; summarize qty and extended amount
- [ ] Compare to F41021 on-hand qty and value
- [ ] If qty matches but amount doesn't: dollar-only IA path (Steps 5.2–5.6)
- [ ] If qty doesn't match: query F4111 IA rows for ILIPCD ≠ "P" to identify any transactions that did not complete
- [ ] If unposted IA found: post in JDE; recheck F41021
- [ ] If all IAs posted but gap remains: coordinate with IT for F41021 SQL correction (Step 5.7.2)
- [ ] If gap pre-dates RR go-live: determine which system was accurate; correct accordingly (Step 5.7.3)
- [ ] For dollar-only IA in average cost environment: disable UDC 40/AV P4114 (Y→N) before posting; restore immediately after
- [ ] Post dollars-only IA (qty blank, unit cost blank); verify in F4111; re-summarize to confirm tie

**RapidReconciler Resolution (Section 7)**
- [ ] Select appropriate Re-Roll option (Re-Roll Item / Zero Beg Bal / Remove CX Var)
- [ ] Verify item details in Re-Roll dialog before executing
- [ ] Confirm QtyVar = 0 and AmtVar = 0 after next nightly refresh

**Documentation**
- [ ] Document root cause, correction posted, and date
- [ ] Note any open follow-up items (IA processing controls, IB authorization, IT coordination)
- [ ] Mark as "Worked" in RapidReconciler

---

## Section 10: Glossary

| Term | Definition |
|---|---|
| **Cardex** | Item-level perpetual inventory ledger (F4111 in JD Edwards) showing all movements |
| **WAC** | Weighted Average Cost (cost method 02) — the running average unit cost recalculated after each qualifying receipt; formula: (QOH × Current Cost + Trans Qty × Trans Cost) / (QOH + Trans Qty) |
| **Amount Variance** | Difference between the F4111 transaction-based value summary and the F41021 on-hand value |
| **Quantity Variance** | Difference between the F4111 transaction-based quantity summary and the F41021 on-hand quantity |
| **Stranded Balance** | A GL dollar amount that remains after all physical inventory has been depleted to zero quantity |
| **Balance Forward** | The back-calculated beginning balance RapidReconciler derives from the F41021 snapshot at go-live; serves as the reconciliation starting point |
| **Cost Method** | The JD Edwards Sales/Inventory costing method assigned to an item in F4105 / P4105; stored in the `dt` field of the Curr bal row (`ukid = 999999999999`) in the Item Roll Forward |
| **Cost Level** | The JD Edwards Inventory Cost Level controlling the granularity at which on-hand balance and average cost are maintained; stored in the `dt` field of the Beg bal row (`ukid = 0`); Level 1 = item/branch, Level 2 = item/branch with location/lot qty tracking, Level 3 = item/branch/location/lot (required for Actual Cost) |
| **IK** | Kit or assembly transaction type — a receipt of a finished kit or assembly into inventory at BOM cost |
| **IM** | Manufacturing Issue — a material issue to a work order; GL is updated by Manufacturing Accounting (R31802A) nightly, not in real time |
| **OV** | Purchase Order Receipt — increases on-hand inventory; triggers WAC recalculation if cost differs from current WAC |
| **PV** | Voucher Match — A/P invoice matched to a PO receipt; if invoiced cost differs from receipt cost, triggers a second WAC recalculation; appears as zero or nominal qty with a non-zero `val` |
| **PI** | Purchase Invoice or Period Invoice; when qty = 0, it is a cost revaluation entry that resets WAC without a physical receipt |
| **IA** | Inventory Adjustment — quantity or dollars-only correction; high-volume items may have hundreds of IA transactions per period; an IA that fails to update F41021 is the most common source of quantity variances |
| **IB** | Inventory Balance — covers zero balance adjustments, Re-Roll entries, and P4105 manual cost revisions; created by manual P4105 changes but **not** by system-driven WAC recalculations; presence on a WAC item warrants authorisation confirmation |
| **ILIPCD** | Item Ledger Internal Posting Code in F4111; rows where this = "X" are memo transactions and must be excluded from cardex reconciliation |
| **F4105** | JD Edwards Item Cost file — stores all cost method buckets in the primary unit of measure; the Sales/Inventory cost method set here determines how inventory transactions are valued |
| **F4111** | JD Edwards item ledger (transaction detail) table |
| **F41021** | JD Edwards item location (on-hand balance) table |
| **F0911** | JD Edwards GL detail table |
| **F30026** | JD Edwards cost components table — stores individual cost components (A1, B1, C1, etc.) for standard cost items; sum must equal the F4105 method 07 value |
| **P4105** | JD Edwards Cost Revisions program — used to set or manually change item costs; manual changes create IB transactions |
| **P4114** | JD Edwards Inventory Adjustments program |
| **R30543** | JD Edwards Cost Component/Ledger Integrity Report — identifies standard cost items where F4105 method 07 does not equal the sum of F30026 components |
| **UDC 40/AV** | User Defined Code table controlling which programs affect weighted average cost recalculation; P4114 must be set to "N" during a dollars-only IA in average cost environments |
| **Re-Roll** | RapidReconciler function to recalculate or synchronize internal balances to match JD Edwards; no Undo |
| **RapidReconciler** | Third-party reconciliation tool that compares F4111 (cardex) to F41021 (on-hand) and F0911 (GL) nightly |
| **BOM** | Bill of Materials — the component cost structure used to price IK assembly receipts |

---

---

*Guide version: April 2026 (v3) | Integrates: cardex_variance.md (RapidReconciler/JDE resolution procedure), transaction-detail-analysis-guide.md Section 1 (Claude automated analysis specification), inventory-key-concepts.md (beginning balance calculation and reconciliation framework) | Maintain in shared finance repository for reuse across future Cardex reviews.*
