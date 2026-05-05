# Frozen Cost Analysis Guide

## RapidReconciler — Frozen Cost Integrity (F4105 vs F30026 Cost Components) Integrity Report 6

---

## Section 1: Using Claude for Automated Analysis

Claude can perform a full Frozen Cost Integrity analysis automatically and return an updated `.xlsx` workbook with the multi-finding analysis written to a card-layout sheet, the source sheet equipped with AutoFilter and freeze panes, and findings categorized by issue type and priority. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`frozen-cost-integrity-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The Integrity Report 6 export (`.xlsx`)

Then use the following prompt:

> *"Analyze this file using the Frozen Cost Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the multi-finding analysis sheet."*

Claude will read both documents, work through the analysis procedure against the Excel data, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent Integrity Report 6 reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **Frozen Cost-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Multi-Finding, configuration snapshot.** Each finding catalogues a class of cost discrepancies between F4105 (Item Cost method 07) and F30026 (Product Cost components). There is no period concept and no aggregate dollar variance, but P1 items with QOH > 0 produce a derived GL understatement.

**File naming** (formatting spec, Section 1): `Frozen Cost Integrity Analysis {YYYY-MM-DD}.xlsx`. Use the analysis date — Frozen Cost Integrity is a configuration snapshot.

**Source sheet name:** `Integrity`. **Sorting is not required.** Apply AutoFilter on the header row and freeze panes per the formatting spec.

**Headline anchor** (formatting spec, Section 4): analysis date.

> `Frozen Cost Integrity — {Month DD, YYYY}`

**Subline** (formatting spec, Section 5.3): a count summary of the three issue types, e.g., `{N} configuration findings across {M} companies and {B} branches — {n1} zero-cost items, {n2} missing components, {n3} cost mismatches`.

**Secondary context strip** (formatting spec, Section 5.4) carries: source tables compared (F4105 vs F30026), companies in scope, stocking types observed.

**Issue Summary table** (formatting spec, Section 7.1): one row per distinct finding, sorted by priority. Columns: Issue label, Scope (companies/branches), Detail (concentration patterns, GL gap from QOH-bearing P1 items if applicable), Rows count, Priority badge.

**Finding cards** (formatting spec, Section 7.2): one card per issue type, mapped to the guide's three issue types (Section 4):

- `Cost in F30026 only — zero-cost inventory` (P1) — F4105 method 07 = 0, F30026 has components; manufacturing transactions value at zero, on-hand inventory undervalued
- `Cost in F4105 only — no F30026 components` (P2) — F4105 has cost, F30026 empty; work-order WIP clears entirely to variance
- `Both populated — F4105 ≠ F30026 sum` (P2) — values disagree; engineering/other variance at R31804

When the data shows clear sub-patterns within a finding (branch concentration, stocking-type concentration, recurring cost-pair pattern), describe these in the Pattern field rather than splitting into separate findings — the resolution path is the same.

Each card has the standard Scope / Pattern / Resolution sub-fields. **Do not use a "Root Cause" sub-field** — Frozen Cost Integrity is a configuration snapshot; the Pattern field characterizes what the data shows.

**Priority assignment** (formatting spec, Section 9.3, rule-based by issue severity):

| Priority | Issue type |
|---|---|
| **P1** | Cost in F30026 only — zero-cost inventory (immediate GL impact when QOH > 0) |
| **P2** | Cost in F4105 only — no F30026 components (every work order produces variance) |
| **P2** | Both populated, mismatch (variance at R31804 on every transaction) |

**Sub-tables** (formatting spec, Section 7.3): use sub-tables for **the actionable subset** of each finding, not the full data. Common patterns:

- For P1 (zero-cost inventory): sub-table the items with QOH > 0 — they represent the immediate GL understatement. Compute and display the GL gap (`QOH × FrzCost` summed) in the finding's Pattern field.
- For P2 (mismatch): sub-table the top 10 by absolute variance — these are the items most worth investigating first.
- For P2 (F4105 only): no sub-table — too many rows with no clean ranking criterion. Point to source AutoFilter.

Sort sub-tables by Company → Branch → Item ascending (the natural source-sheet reading order), not by magnitude.

**Action Plan** (formatting spec, Section 7.4): in execution order. Typical sequence:

1. Confirm with the cost accounting team whether any large F4105-only concentrations (e.g., purchased items in a specific branch) are intentional. A single decision may reclassify many rows.
2. Run R30835 (Frozen Standard Update) for branches with the zero-cost (P1) cluster to create the missing F4105 method 07 records. Test in non-production first.
3. For the QOH-bearing P1 items (the GL-understatement subset), review the RapidReconciler Transactions page and assess whether a revaluation journal entry is needed. Confirm with accounting before posting.
4. Investigate any branch-wide mismatch clusters — likely partial cost rolls. Determine which value is correct and run R30835 for the affected branch.
5. Build F30026 components for any manufactured items with no F30026 build — every work order produces variance until corrected.
6. Run R30837 (WIP Revaluation) for any open work orders on items corrected by R30835. Failure to do so produces persistent cardex-only variances.
7. Refresh RapidReconciler and re-run Integrity Report 6 to confirm corrected items have cleared.

**Source sheet handling** (formatting spec, Section 10): Frozen Cost exports are typically large (hundreds to thousands of rows). **Pattern A — no highlights, AutoFilter only.** Readers filter on `UnitCost = 0` for P1, `FrzCost = 0` for the F4105-only P2 finding, or both > 0 with non-zero variance for the mismatch P2 finding.

### 1.4 Notes and Limitations

- **Space-padded numeric cells:** Cost columns in the export may contain space-padded values rather than true zeros. Strip whitespace from UnitCost and FrzCost before classifying. A cell containing `'    '` (spaces) is treated as zero.
- Cost interpretation (whether a zero UnitCost is a genuine setup error or an intentional non-costed item) requires JDE access to the item setup and cost history — Claude flags the pattern but cannot confirm intent without JDE access.
- The QOH displayed in the Lot column is parsed from the string `QOH N` — Claude extracts this value to identify items with on-hand inventory at the zero-cost condition.
- For exports with many rows (500+), Claude groups findings by pattern (branch, stocking type, cost difference magnitude) in the Pattern field of the relevant card to keep the summary workable rather than listing every row individually.
- If the Prodplant and Prodcost columns are populated, note them in the analysis — cross-plant costing can produce expected differences that are not data errors.
- Non-standard stocking type values (anything other than P, S, M) are flagged in the Pattern field of the relevant finding as data-quality candidates worth reviewing with the item setup team.

---

## Overview

Integrity Report 6 — **Frozen Cost Integrity** — compares the frozen standard unit cost stored in the Item Cost table (F4105, cost method 07) against the sum of cost components in the Product Cost table (F30026). It identifies discrepancies between the two records that would cause material issues, work order completions, and WIP transactions to use an incorrect cost — producing inventory valuation errors and unexplained manufacturing variances.

This guide is a reusable template for analyzing any customer's Integrity Report 6 export. The JD Edwards functionality, report structure, issue types, and analysis procedure are consistent across all environments. The specific companies, items, branch plants, cost values, and findings will reflect the customer data in the uploaded export.

> **Who should use this guide:** JD Edwards cost accountants, manufacturing accountants, and item setup administrators responsible for investigating and resolving frozen cost integrity findings.

> **Important:** All corrections are made in JD Edwards. RapidReconciler displays integrity findings for visibility but does not modify JD Edwards data.

---

## Section 2: Why Frozen Cost Integrity Matters

In JD Edwards EnterpriseOne, the frozen standard cost (cost method 07) is the cost used to value all manufacturing transactions — material issues, work order completions, labor accruals, and variance accounting. This cost is stored in two separate places:

| Record | Table | Program | Contents |
|---|---|---|---|
| **Item Cost (method 07)** | F4105 | P4105 (Item Cost) | Single unit cost per item/branch — the amount used for F4111 (item ledger) valuation |
| **Cost Components** | F30026 | P30026 (Product Cost Revisions) | Itemized cost breakdown by cost type (A1 material, B1–B4 labor/overhead, C1–C4 machine, D1–D2 outside operations, etc.) |

When R30835 (Frozen Standard Update) runs, it is supposed to write the sum of F30026 cost components to F4105 as the new frozen standard. When the two tables are in sync, every manufacturing transaction values correctly and variance accounting clears WIP to zero. When they diverge, transactions use the wrong cost — silently posting to incorrect amounts in both the item ledger and the GL.

### The Three Ways F4105 and F30026 Can Diverge

| Issue Type | Description | Financial Impact |
|---|---|---|
| **Cost in F4105 only** | F4105 has a unit cost but F30026 has no cost components (or components sum to zero) | Material issues and completions post at the F4105 cost. WIP is funded but cannot be reconciled to cost components. Variance accounting will clear a full WIP balance to variance. |
| **Cost in F30026 only** | F30026 has cost components but F4105 method 07 cost is zero | Material issues and completions post at zero cost. Inventory is undervalued. The full F30026 cost will appear as a variance at R31804 — or as an unexplained gain in the item ledger. |
| **Both populated — mismatch** | F4105 unit cost ≠ sum of F30026 components | The difference between the two values will appear as a variance at R31804. If the mismatch is systematic across many items, it can produce large unexplained period-end variances. |

### Connection to Manufacturing Transactions

The frozen cost from F30026 is the valuation basis for:

- **Material issues (IM):** Each component is issued at its F30026 frozen standard cost. If F30026 is zero or missing, the IM posts at zero — raw material inventory is reduced without a corresponding WIP debit.
- **Work order completions (IC):** The parent item is completed to finished goods at its frozen standard cost. If the F4105 cost is zero or incorrect, finished goods inventory is valued incorrectly.
- **Variance accounting (IV):** R31804 computes variances as the difference between actual WIP (IM + IH − IC − IS) and the expected cost. If F4105 and F30026 are out of sync, R31804 will produce unexplained variances that cannot be traced to a genuine efficiency or usage difference.
- **WIP Revaluation (R30837):** If the frozen standard is updated via R30835 while work orders are open, R30837 revalues open WIP to the new standard. If F30026 and F4105 are out of sync, R30837 may not revalue correctly.

---

## Section 3: Report Structure and Field Reference

### Export Column Definitions

| Column | Description | Notes |
|---|---|---|
| **CompanyNumber** | JD Edwards company number | Formatted with leading zeros |
| **BranchPlant** | The branch plant where the item is stocked and costed | Cost records in F30026 are branch-specific |
| **ShortItem** | JD Edwards short item number (internal numeric identifier) | |
| **ItemNumber** | Second item number / customer part number | Primary display identifier in most JDE programs |
| **ThirdItem** | Third item number | May match ItemNumber if not separately configured |
| **CostLevel** | Cost level from the Item Branch record (F4102) | 2 = item/branch level costing; 3 = item/branch/location level. All items in this report should be cost level 2 or 3. |
| **Location** | Specific bin/rack/location within the branch | Blank if location-level costing is not used |
| **Lot** | Lot number if lot-controlled; also used by RapidReconciler to display QOH | The QOH displayed here is the on-hand quantity — useful for assessing financial impact |
| **ST** | Stocking Type from the Item Branch record | S = stock; M = manufactured; P = purchased; see note below |
| **UnitCost** | The frozen standard unit cost from F4105 (cost method 07) | Zero means no method 07 cost record exists |
| **FrzCost** | The sum of all cost components from F30026 | Zero means no cost components exist in F30026 |
| **Variance** | UnitCost − FrzCost | Positive = F4105 exceeds F30026; negative = F30026 exceeds F4105 |
| **Prodplant** | Production plant — the branch that manufactures the item (for purchased items sourced from internal production) | May differ from BranchPlant |
| **Prodcost** | Production cost from the production plant's cost record | Used for cross-plant costing scenarios |

### Stocking Type Reference

| Stocking Type | Description | Expected Cost Pattern |
|---|---|---|
| **S** (Stock) | Standard stocked inventory item | F4105 method 07 cost should match F30026. A divergence typically indicates a cost update error. |
| **M** (Manufactured) | Item produced via work orders | F30026 should have component-level breakdown (A1 material, B1 labor, etc.). F4105 should equal the sum of components. |
| **P** (Purchased) | Item purchased from an external vendor | F30026 may have only an A1 (material) cost component. F4105 should equal F30026. |

> **Note on Stocking Type 1:** An item with Stocking Type `1` is non-standard and may indicate a data entry error in the item setup. Items appearing in Integrity Report 6 with Stocking Type `1` should be reviewed by the item setup team.

---

## Section 4: Issue Type Reference

Integrity Report 6 produces three distinct issue types. Each has different financial implications and resolution paths.

### Issue Type 1 — Cost in F4105 Only (No F30026 Components)

**UnitCost > 0, FrzCost = 0.**

The item has a frozen standard cost in F4105 but no cost component records in F30026 (or all components sum to zero).

**Impact:** Material issues for this item will post at the F4105 unit cost, creating a WIP debit. However, when R31804 runs variance accounting, there are no F30026 components to reconcile against — the entire WIP balance will be cleared to the Other Variance account (AAI 3280). This produces a systematic variance on every work order for this item that cannot be explained by actual vs. planned activity.

**Common causes:**
- The item was set up with a cost in P4105 directly, bypassing the Product Cost Revisions (P30026) program
- A cost roll (R30835) was never run to populate F30026 components
- F30026 components were manually deleted after the item was costed
- The item is a purchased item with a manually maintained F4105 cost and no cost build was performed

**Severity:** HIGH for manufactured items (Stocking Type M). MEDIUM for purchased items (Stocking Type P) where a single A1 component is expected. Assess based on QOH and transaction volume.

### Issue Type 2 — Cost in F30026 Only (No F4105 Method 07)

**UnitCost = 0, FrzCost > 0.**

The item has cost component records in F30026 but F4105 does not have a method 07 (frozen standard) cost record.

**Impact:** All manufacturing transactions for this item — material issues, completions, labor accruals — will post at zero cost. Inventory is systematically undervalued. The full F30026 cost amount will either appear as an unexplained variance at R31804, or as a negative WIP balance. Any inventory quantities on hand are valued at zero in the GL, regardless of what F30026 shows.

**Common causes:**
- R30835 (Frozen Standard Update) was never run after F30026 components were established
- The F4105 method 07 record was manually deleted
- The cost method 07 was not included in the cost method set used during the last cost roll
- The item was added to a new branch plant after the last cost roll and the branch was not included in the R30835 run

**Severity:** HIGH. Zero-cost inventory is a direct valuation error. Items with QOH > 0 represent understated inventory balances in the GL today.

### Issue Type 3 — Both Populated, Values Differ

**UnitCost > 0, FrzCost > 0, UnitCost ≠ FrzCost.**

Both F4105 and F30026 have values, but they do not match. The Variance column shows the difference: positive means F4105 exceeds F30026; negative means F30026 exceeds F4105.

**Impact:** The difference between F4105 and F30026 will appear as a variance at R31804 — specifically as an engineering variance (AAI 3270) if the gap reflects a cost change that was not rolled to the frozen standard, or as an other/WIP clearance variance (AAI 3280) if the source is less clear. If the mismatch is small and consistent across many items, it may indicate a cost roll that partially completed (some branches updated, others not).

**Common causes:**
- R30835 was run for some branches but not all (partial cost roll)
- A component cost was updated in F30026 after the last cost roll
- The frozen standard was manually edited in P4105 without updating F30026 (or vice versa)
- Rounding differences between the two tables (typically small, less than $0.01 per unit)
- The item has a production cost from a different branch (Prodplant/Prodcost) that differs from the receiving branch cost

**Severity:** MEDIUM-HIGH for large variances or items with significant QOH. LOW for rounding differences (< $0.01). Assess based on variance magnitude and transaction volume.

---

## Section 5: Report Summary — [Generated from Customer Export]

This section is populated by Claude based on the uploaded Integrity Report 6 export.

### Report Header

| Field | Value |
|---|---|
| **Report Type** | Integrity Report 6 — Frozen Cost Integrity |
| **Source Tables** | F4105 (Item Cost, method 07) vs F30026 (Product Cost Components) |
| **Period End** | *[Derived from export]* |
| **Export Generated** | *[Derived from export]* |
| **Total Rows** | *[Derived from export]* |
| **Companies** | *[Derived from export]* |
| **Branch Plants** | *[Derived from export]* |
| **Stock Types Present** | *[Derived from export]* |

### Issue Type Summary

One row per issue type found in the export:

| Column | Description |
|---|---|
| **Issue Type** | Cost in F4105 only / Cost in F30026 only / Both populated — mismatch |
| **Row Count** | Count of rows with this issue type |
| **% of Total** | Row count as a percentage of total export rows |
| **Companies Affected** | Company numbers present for this issue type |
| **Branches Affected** | Branch plants present for this issue type |
| **Description** | Plain-language impact statement |

Color-code rows: Priority 2 (orange) for Cost in F4105 only; Priority 1 (red) for Cost in F30026 only; Priority 2 (orange) for Both populated — mismatch. See Section 8 for priority definitions.

### Row Count by Company and Branch

Summarize total rows and each issue type count for each company/branch combination. Flag any company/branch with Priority 1 findings in red.

---

## Section 6: Findings by Priority — [Generated from Customer Export]

This section is populated by Claude based on the uploaded export. One sub-section per issue type, ordered by priority.

### Priority Classification

| Priority | Condition | Severity |
|---|---|---|
| **Priority 1** | Cost in F30026 only — F4105 method 07 = 0; zero-cost inventory | HIGH |
| **Priority 2** | Cost in F4105 only — no F30026 components | MEDIUM-HIGH |
| **Priority 2** | Both populated — values differ | MEDIUM-HIGH |

### Finding Sub-Section Template

Each finding sub-section contains:

**What Was Found**
List all affected items with company, branch, item number, stocking type, F4105 cost, F30026 cost, variance, and QOH where non-zero. Note patterns (e.g., all zero-F4105 items are in the same branch, all mismatches involve the same cost difference).

**Root Cause**
Explain the most likely cause based on the data pattern. Present possible explanations without assuming which is correct — determination requires JDE access.

**Verification Steps**
Step-by-step instructions to locate and confirm the finding in JDE using Item Cost (P4105) and Product Cost Revisions (P30026).

**Resolution**


> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.
Decision table:

| If… | Then… |
|---|---|
| [Condition] | [Action] |

---

## Section 7: Common Root Causes

### Cost in F4105 Only

| Cause | How to Identify | Resolution |
|---|---|---|
| R30835 (Frozen Standard Update) was never run for this item/branch | F30026 is empty or all components are zero | Set up F30026 cost components via P30026, then run R30835 to push them to F4105 |
| Cost was manually entered in P4105 without a cost build | F4105 has a cost but F30026 has no breakdown | Review whether a cost build is appropriate; if not, document the manual cost in F30026 as an A1 component |
| F30026 components were deleted after the item was costed | F4105 has a cost; F30026 records were recently removed | Recreate F30026 components; run R30835 to verify alignment |
| Purchased item — cost maintained manually in F4105 | Stocking Type P; F30026 is intentionally blank | Acceptable for purchased items if F4105 is maintained manually and no cost build is expected — exclude from future runs using item selection criteria |

### Cost in F30026 Only

| Cause | How to Identify | Resolution |
|---|---|---|
| R30835 was not run after F30026 components were established | F30026 has components; F4105 method 07 record is missing | Run R30835 (Frozen Standard Update) for the affected items and branches to create or update the F4105 record |
| Cost method 07 excluded from the cost method set used in the last roll | F4105 has other cost methods (e.g., 01, 02) but not 07 | Confirm cost method 07 is included in the cost method set used by R30835; rerun R30835 |
| F4105 method 07 record was manually deleted | No method 07 record in P4105 | Run R30835 to recreate the record from F30026 components |
| New branch plant added after the last cost roll | Item/branch combination is recent; F30026 was populated but R30835 was not run for the new branch | Include the new branch in the R30835 run scope and rerun |

### Both Populated — Mismatch

| Cause | How to Identify | Resolution |
|---|---|---|
| Partial cost roll — some branches updated, others not | Same item shows the same variance across multiple locations in the same branch | Run R30835 for all affected branches |
| Component cost updated in F30026 after the last cost roll | F30026 component amounts are more recent than the last R30835 run date | Run R30835 to push updated F30026 costs to F4105 |
| Rounding difference | Variance < $0.01 per unit; applies to many items | Assess materiality; a rounding-only variance of < $0.01 on items with low QOH can typically be excluded from correction |
| Manual edit to F4105 without updating F30026 | F4105 was changed in P4105 directly; F30026 reflects different amounts | Determine which is correct; update the incorrect record; run R30835 to verify alignment |
| Cross-plant cost sourcing (Prodplant ≠ BranchPlant) | Prodplant and Prodcost columns populated with a different branch | Review whether the cross-plant cost sourcing is intentional; if so, this finding may be expected behavior |

---

## Section 8: JDE Navigation Reference

| Task | Program | Fast Path / Menu |
|---|---|---|
| View/update F4105 item cost (all methods) | P4105 — Item Cost Maintenance | Fast path: `COST` or Inventory Management > Item Cost |
| View/update F30026 cost components | P30026 — Product Cost Revisions | Fast path: `PRODCOST` or Manufacturing > Product Data Management > Product Cost |
| Run Frozen Standard Update | R30835 — Frozen Standard Update | Manufacturing > Product Data Management > Product Costing Reports |
| Run WIP Revaluation | R30837 — WIP Revaluation | Manufacturing > Product Data Management > Product Costing Reports |
| View work order cost | P4801 — Work Order Entry, Cost tab | Fast path: `WO` or Inventory Management > Work Orders |
| Run Integrity Report 6 | R41416 (component 6) | Inventory Management > Reports > Integrity Reports |

---

## Section 9: Step-by-Step Analysis Procedure

Use this procedure each time an Integrity Report 6 export is received.

**Step 1 — Identify Priority 1 Items First (Cost in F30026 Only)**

Filter the export for rows where UnitCost = 0 and FrzCost > 0. These are zero-cost inventory items. Check the QOH column — items with positive QOH represent understated inventory balances in the GL today. These require the most urgent attention.

**Step 2 — Assess Priority 2A Items (Cost in F4105 Only)**

Filter for rows where FrzCost = 0 and UnitCost > 0. Group by stocking type:
- Stocking Type M (manufactured): these are the most concerning — they indicate the cost build was never completed
- Stocking Type P (purchased): review whether a manual F4105 cost is intentional and F30026 is intentionally blank
- Stocking Type S (stock): investigate whether a cost roll should have populated F30026

**Step 3 — Triage Priority 2B Items (Both Populated — Mismatch)**

For each mismatch row, calculate the absolute variance amount (|UnitCost − FrzCost|). Sort by absolute variance descending. Prioritize items with large variances, significant QOH, or high transaction volume. Rounding differences (< $0.01) can typically be set aside.

**Step 4 — Check for Systematic Patterns**

Before correcting individual items, look for patterns across the full dataset:
- Are all zero-F4105 items in the same branch? This suggests R30835 was not run for that branch.
- Do all mismatches share the same variance amount? This suggests a specific cost component was updated but not rolled.
- Are the same items appearing across multiple locations? This is expected for cost level 2 items — one item can appear once per branch/location combination.

**Step 5 — Verify in JDE**

For each priority finding, confirm the values in JDE using P4105 and P30026 before making any corrections.

**Step 6 — Correct and Rerun**

For F30026 / F4105 mismatches: run R30835 after correcting F30026 components. For manual F4105 corrections: update P4105 and confirm F30026 aligns. After all corrections, trigger a RapidReconciler data refresh and re-run Integrity Report 6. Confirm that corrected items no longer appear.

**Step 7 — Review Open Work Orders**

For any items where the frozen standard cost was corrected, check whether there are open work orders (status < 99) for those items. If so, R30837 (WIP Revaluation) must be run to revalue open WIP to the new standard. Failing to run R30837 will produce a Standard Cost Change row in F4111 with no matching GL entry — a persistent cardex-only variance.

---

## Section 10: Related Documentation

- [Integrity Report 5 Guide](integrity-report5-glclass-analysis.md) — GL class code integrity (F4102 vs F41021). Section 10 of the manufacturing reference notes that F41021/F4102 GL class code mismatches cause manufacturing transactions to post to unexpected accounts — IR5 and IR6 findings often co-occur on the same items.
- [DMAAI Analysis Guide](inventory-integrity-report2-analysis.md) — If F30026 contains GL class codes that are missing from the DMAAI model table (4152 PI), manufacturing transactions will error when R31802A runs. IR2 and IR6 findings can be related.
- [Cardex Variance Analysis Guide](cardex-variance-analysis.md) — Frozen cost errors directly cause cardex variances. A zero-cost F4105 record will produce a cardex variance equal to the full inventory value of every transaction for that item.
- [End of Day Analysis Guide](end-of-day-analysis.md) — Missing R30835 runs and zero-cost records are common contributors to unexplained End of Day variances.
- [Manufacturing Work Order Reference](manufacturing-reference.md) — Full reference for R31802A, R31804, R30835, R30837, and the relationship between F30026 and manufacturing transaction valuation.

---

*For support, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com)*
