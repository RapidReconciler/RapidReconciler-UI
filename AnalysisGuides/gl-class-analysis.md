# GL Class Analysis Guide

## RapidReconciler — GL Class Integrity (Item Branch to Location Mismatches) Integrity Report 5

---

## Section 1: Using Claude for Automated Analysis

Claude can perform a full GL Class Integrity analysis automatically and return an updated `.xlsx` workbook with the multi-finding analysis written to a card-layout sheet, the source sheet equipped with AutoFilter and freeze panes (and row highlights for small exports), and findings categorized by issue type and priority. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`gl-class-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The Integrity Report 5 export (`.xlsx`)

Then use the following prompt:

> *"Analyze this file using the GL Class Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the multi-finding analysis sheet."*

Claude will read both documents, work through the analysis procedure against the Excel data, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent Integrity Report 5 reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **GL Class Integrity-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Multi-Finding, configuration snapshot.** Each finding catalogues a class of GL class discrepancies between F4102 (Item Branch) and F41021 (Item Location). There is no period concept and no aggregate dollar variance.

**File naming** (formatting spec, Section 1): `GL Class Integrity Analysis {YYYY-MM-DD}.xlsx`. Use the analysis date — GL Class Integrity is a configuration snapshot.

**Source sheet name:** `Integrity`. **Sorting is not required.** Apply AutoFilter on the header row and freeze panes per the formatting spec.

**Headline anchor** (formatting spec, Section 4): analysis date.

> `GL Class Integrity — {Month DD, YYYY}`

**Subline** (formatting spec, Section 5.3): a count summary, e.g., `{N} configuration findings across {M} companies — {n1} blank LocationClass, {n2} GL class mismatches`.

**Secondary context strip** (formatting spec, Section 5.4) carries: source tables compared (F4102 against F41021), companies in scope, stocking types observed.

**Issue Summary table** (formatting spec, Section 7.1): one row per distinct finding, sorted by priority. Columns: Issue label, Scope (companies/branches), Detail (concentration patterns, key counts), Rows count, Priority badge.

**Finding cards** (formatting spec, Section 7.2): one card per issue type. Typical findings:

- `GL Class Mismatch — branch and location codes differ` (P1 — work-order moves via R31802A read the F4102 branch class while all other F4111 moves read the F41021 location class; when the two resolve to different accounts, the same item posts to two accounts depending on transaction type. A blank F41021 class is one case of this split — it routes through the DMAAI `****` default like any class — not a separate finding.)

When the data shows clear sub-patterns within a finding (e.g., a single branch concentration, a recurring branch→location class pair), describe these in the Pattern field rather than splitting into separate findings — the resolution path is the same.

Each card has the standard Scope / Pattern / Resolution sub-fields. **Do not use a "Root Cause" sub-field** — GL Class Integrity is a configuration snapshot; the Pattern field characterizes what the data shows.

**Priority assignment** (formatting spec, Section 9.3, rule-based by issue severity):

| Priority | Issue type |
|---|---|
| **P1** | GL Class Mismatch — branch (F4102) and location (F41021) classes resolve to different accounts, gated on IC/IM manufacturing activity. A blank F41021 class is one case of the split (it routes through the DMAAI `****` default), not a separate issue type. |

**Sub-tables** (formatting spec, Section 7.3): for small exports (≤30 rows total, the typical case for GL Class), inline a sub-table under each Finding card listing the affected item-branch-location records. Sort sub-tables by Company → Branch → Item ascending (the natural source-sheet reading order).

**Action Plan** (formatting spec, Section 7.4): in execution order. Typical sequence:

1. For each mismatch, determine which side is correct (branch or location) and align the other; for systematic patterns (same branch→location class pair across many items), apply the fix as a single batch.
2. A blank F41021 class needs action only when it is part of a mismatch that splits an IC/IM item across two accounts — resolve it as part of that split, not as a blanket cleanup. A blank that resolves through the DMAAI `****` default and reconciles is not a finding.
3. Review historical GL postings for any items whose split was corrected — transactions posted before the correction may have routed to the account for the old class; post a reclassification journal entry if material amounts are involved.
4. Re-run Integrity Report 5 to confirm the corrected items have cleared.

**Source sheet handling** (formatting spec, Section 10): GL Class Integrity exports are typically small. **Pattern B — highlight all rows by issue type** when the export has ≤30 rows and the partition is clean (every row is either Blank or Mismatch). For larger exports, **Pattern A — no highlights, AutoFilter only**.

### 1.4 Notes and Limitations

- **Blank LocationClass detection:** The LocationClass column may contain space-padded values (e.g., four spaces) rather than true empty cells. Claude strips whitespace from GL class fields before classifying rows — a cell containing only spaces is treated as blank, not as a GL class code.
- Claude analyzes the data as exported. A blank LocationClass is treated as just another class — it routes through the DMAAI `****` default and reconciles on its own. It is called out only when it is part of a branch/location split (see Section 2); the StockType column helps identify which blanks sit on items with IC/IM manufacturing activity, where a split would matter.
- GL class code interpretation (whether a code is stock vs. non-stock) requires JDE access to the chart of accounts and DMAAI setup. Claude flags codes that appear unusual based on the data pattern (e.g., 7xxx-range codes when the inventory series is 6xxx) but cannot confirm their purpose without JDE access.
- Mismatch resolution requires JDE access to confirm which GL class (branch or location) is correct for each item.
- For exports with many mismatches following the same GL class pair pattern, Claude groups findings by pattern in the Pattern field of the relevant card to keep the summary workable.

---

## Overview

Integrity Report 5 — **GL Class Integrity** — compares the GL class code on every Item Branch record (F4102) against the GL class code on each corresponding Item Location record (F41021). It identifies discrepancies between the two records that would cause inventory transactions to post to incorrect GL accounts during reconciliation.

This guide is a reusable template for analyzing any customer's Integrity Report 5 export. The JD Edwards functionality, report structure, issue types, and analysis procedure are consistent across all environments. The specific companies, items, branch plants, GL class codes, and findings will reflect the customer data in the uploaded export.

> **Who should use this guide:** JD Edwards cost accountants, inventory accountants, and item setup administrators responsible for investigating and resolving GL class code integrity findings.

> **Important:** All corrections are made in JD Edwards. RapidReconciler displays integrity findings for visibility but does not modify JD Edwards data.

---

## Section 2: Why GL Class Codes Matter

In JD Edwards EnterpriseOne, the GL class code is the bridge between an inventory item and the GL account it posts to. RapidReconciler uses the GL class code from the item location record (F41021) to assign every item ledger transaction (F4111) to the correct inventory account during the nightly import.

The GL class code exists in two places for each item:

| Record | Table | Program | Used By |
|---|---|---|---|
| **Item Branch** | F4102 | P41026 (Item Branch/Plant Info) | Work order material issues and completions (R31802A) |
| **Item Location** | F41021 | P41024 (Item Location Info) | Inventory adjustments (P4114), transfers (P4113), PO receipts (P4312), and all other F4111 transactions |

When the two records carry the same GL class code, all transaction types for that item post to the same inventory account — and reconciliation works cleanly. When they differ, the same physical item will post to different accounts depending on how it is transacted, creating a structural account mismatch.

### A Blank Location GL Class Is Just Another Code

A blank GL class on the Item Location record is not special and is not a finding on its own. It resolves through the DMAAI exactly like any class: either a specific entry, or the `****` wildcard/default row — JDE's catch-all for any class not explicitly set up, blank included. When that coverage exists, a blank-class transaction routes and posts normally.

Reconciliation ties regardless: both the cardex side and the GL side resolve through the same DMAAI, so a blank-class transaction lands on the same account on both sides and reconciles — no variance. RapidReconciler does not police JDE item setup, so a blank class is not a RapidReconciler reconciliation finding by itself.

A blank matters only when it is part of a **branch/location split** — the case covered above, where the F4102 branch class and the F41021 location class route the same item to different accounts. A blank F41021 class is one way the two sides can resolve to different accounts (the location side takes the `****` default while a work-order move takes the F4102 class), and that split is the real, IC/IM-gated finding. A blank that is not part of a split reconciles and needs no action.

---

## Section 3: Report Structure and Field Reference

### Export Column Definitions

| Column | Description | Notes |
|---|---|---|
| **CompanyNumber** | JD Edwards company number | Formatted with leading zeros |
| **BranchPlant** | The branch plant (Item Branch record) where the item is stocked | May differ from company number |
| **ItemNumber** | JD Edwards item number (short format) | |
| **ThirdItem** | Third item number / customer part number | May match ItemNumber if not separately configured |
| **Description** | Item description from the Item Master | |
| **Location** | The specific bin/rack/location within the branch | Blank indicates no location-level tracking |
| **Lot** | Lot number, if lot-controlled | Blank for non-lot items |
| **StockType** | Stocking Type from the Item Branch record | S = stock; N = non-stock. Helps identify which items have IC/IM manufacturing activity, where a branch/location split would matter |
| **BranchClass** | GL class code on the Item Branch record (F4102) | Source for work order transactions |
| **LocationClass** | GL class code on the Item Location record (F41021) | Source for inventory transactions. Blank is just another class — it routes through the DMAAI `****` default; relevant only when it forms a branch/location split |

---

## Section 4: Issue Type Reference

Integrity Report 5 surfaces one finding — the branch/location GL class split — which shows up in two data conditions: rows where both classes are populated but differ, and rows where the location class is blank.

### Blank Location GL Class

**LocationClass field is empty on one or more rows.**

**Impact:** A blank class is not a finding on its own. It resolves through the DMAAI like any class — a specific entry, or the `****` wildcard/default row that covers any class not explicitly set up (blank included) — and reconciles, because the cardex side and the GL side resolve through the same DMAAI and land on the same account. RapidReconciler does not police JDE item setup, so a blank class is not a RapidReconciler reconciliation finding by itself.

**When it matters:** A blank becomes relevant only as one case of the branch/location split below — when a work-order move (R31802A) reads the F4102 branch class and posts to one account while the location side takes the `****` default and posts to another. That split is the real finding, and only on items with IC/IM manufacturing activity.

**Example:** An item with Branch GL class 6180 and a blank Location class. Inventory adjustments and PO receipts route through the `****` default and reconcile; only if this item also has work-order activity — so that R31802A posts to the 6180 account while the location side resolves elsewhere — is there a split to investigate.

### GL Class Mismatch

**BranchClass ≠ LocationClass (both populated, but different values).**

**Impact:** The item will post to different inventory accounts depending on the transaction type — location-sourced transactions (adjustments, transfers, receipts) go to the account for the location GL class, while work order transactions go to the account for the branch GL class. This creates a structural split in the inventory GL balance.

**Severity:** MEDIUM-HIGH. May be intentional in some configurations (e.g., consignment locations, returns locations) but requires verification before classification.

**Example:** An item has Branch GL class 6101 and Location GL class 6102. Inventory adjustments post to the 6102 account; work order material issues post to the 6101 account.

---

## Section 5: Report Summary — [Generated from Customer Export]

This section is populated by Claude based on the uploaded Integrity Report 5 export.

### Report Header

| Field | Value |
|---|---|
| **Report Type** | Integrity Report 5 — GL Class Integrity |
| **Source Tables** | F4102 (Item Branch) vs F41021 (Item Location) |
| **Period End** | *[Derived from export]* |
| **Export Generated** | *[Derived from export]* |
| **Total Rows** | *[Derived from export]* |
| **Companies** | *[Derived from export]* |

### Issue Type Summary

One row per issue type found in the export:

| Column | Description |
|---|---|
| **Issue Type** | Blank LocationClass or GL Class Mismatch |
| **Row Count** | Count of rows with this issue |
| **% of Total** | Row count as a percentage of total export rows |
| **Companies Affected** | Company numbers present for this issue type |
| **Description** | Plain-language description of the finding and its impact |

Color-code rows by the branch/location split: highlight rows where the two classes resolve to different accounts on an item with IC/IM activity (the P1 finding). Blank-location rows that reconcile through the DMAAI `****` default are not a finding and need no highlight.

### Row Count by Company

Summarize total rows, blank LocationClass count, and GL class mismatch count for each company. Flag any company whose rows form a branch/location split on IC/IM items at Priority 1 (red); a blank count on its own is descriptive, not a priority flag.

---

## Section 6: Findings by Priority — [Generated from Customer Export]

This section is populated by Claude based on the uploaded export. One sub-section per issue type, ordered by priority.

### Priority Classification

| Priority | Condition | Severity |
|---|---|---|
| **Priority 1** | Branch/location split — F4102 and F41021 classes resolve to different accounts on an item with IC/IM manufacturing activity (whether both are populated and differ, or the location is blank and takes the `****` default while a work-order move takes the branch class) | HIGH |
| **No finding** | Blank LocationClass that reconciles through the DMAAI `****` default with no offsetting split — RapidReconciler does not police JDE setup | — |

### Finding Sub-Section Template

Each finding sub-section contains:

**What Was Found**
List all affected items with company, branch, item number, description, location, branch class, and location class. Note any patterns (e.g., all blank items at locations with a common suffix, all mismatches in the same GL class pair).

**Root Cause**
Explain the most likely cause based on the data pattern. Common causes are listed in Section 7. Present possible explanations without assuming which is correct — determination requires JDE access and accounting team input.

**Verification Steps**
Step-by-step instructions to locate and confirm the finding in JDE using Item Branch (P41026) and Item Location (P41024).

**Resolution**


> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.
Decision table:

| If… | Then… |
|---|---|
| [Condition — which record is correct] | [Action — what to update in JDE] |

---

## Section 7: Common Root Causes

### Blank Location Class — Only When It Forms a Split

A blank location class is a finding only when it forms a branch/location split on an IC/IM item (the location side takes the DMAAI `****` default while a work-order move takes the F4102 branch class, and the two resolve to different accounts). A blank that reconciles through the `****` default is not a finding and needs no correction. The causes below explain how such a split arises; the resolutions apply only once a genuine split is confirmed, not as blanket cleanup of every blank.

| Cause | How to Identify | Resolution |
|---|---|---|
| Item was received into a new location before GL class was set up | Location record creation date earlier than GL class setup date | If it forms a split, align the F41021 location class with the branch class |
| GL class changed on Item Branch but location records were not updated | Branch GL class differs from the expected value for that product category | Update all location records for the item to match the new branch GL class |
| Consignment / temporary / external location where GL class was not configured | Location code suffix (e.g., -CF, -CONS, -EXT) or description indicates non-standard location | Determine intended GL class for that location type; populate accordingly, or change Stocking Type if truly non-stock |
| Item was set up incorrectly at initial data load | Blank appears on multiple items across the same branch | Bulk update location records via SQL or JDE mass update tool (if available) |

### GL Class Mismatch

| Cause | How to Identify | Resolution |
|---|---|---|
| GL class changed on branch record but not propagated to location records | Branch class is newer/different from location class; same pattern across multiple locations for the same item | Update location records to match the branch record |
| Item intentionally uses different GL classes for different locations | Location code indicates a specific purpose (consignment, returns, demo stock) | Verify intent with accounting team; document if intentional; update DMAAI model if needed |
| Item set up with wrong GL class on one of the records at initial load | No obvious reason for the difference; item description doesn't suggest a multi-class scenario | Determine correct GL class from the chart of accounts and item type; update the incorrect record |
| Two items with different GL classes were consolidated under one item number | Item has a long history and the GL class changed partway through | Review transaction history to determine which GL class was used historically; align both records to the correct current class |

---

## Section 8: JDE Navigation Reference

| Task | Program | Fast Path / Menu |
|---|---|---|
| View/update Item Branch GL class | P41026 — Item Branch/Plant Information | Fast path: `IBP` or Inventory Management > Item Branch |
| View/update Item Location GL class | P41024 — Item Location Information | From P41026 → Location Revisions row exit; or Inventory Inquiry P41202 → row exit |
| View all locations for an item | P41202 — Inventory Inquiry | Fast path: `INQ` |
| View item transaction history | P4111 — Item Ledger Inquiry | Fast path: `CARDEX` |
| Run Integrity Report 5 | R41416 — GL Class Integrity | Inventory Management > Reports > Integrity Reports |

---

## Section 9: Step-by-Step Analysis Procedure

Use this procedure each time an Integrity Report 5 export is received.

**Step 1 — Assess GL Class Mismatches (Splits) First**

Compare the branch and location GL class codes on every row where they differ. Identify patterns:
- Same GL class pair appearing multiple times (e.g., many items with 6101 branch vs 6102 location) suggests a batch GL class change that was not fully propagated
- Single-item mismatches with unusual GL classes (e.g., non-inventory class codes on what appears to be a stock item) suggest item setup errors

A mismatch is a finding only when it splits an item across two accounts on IC/IM manufacturing activity — a work-order move (R31802A) takes the F4102 branch class while other F4111 moves take the F41021 location class.

**Step 2 — Handle Blank Location Classes**

Filter the LocationClass column for blank values. A blank is not a finding on its own — it routes through the DMAAI `****` default and reconciles like any class, and RapidReconciler does not police JDE setup. Treat a blank as a finding only when it forms a split (the location side takes the `****` default while a work-order move takes the branch class, and the two resolve to different accounts). Group any such blanks by branch plant — a cluster at the same branch often indicates one setup-process gap rather than many separate ones.

**Step 3 — Cross-Reference with DMAAI Model Table**

For each GL class code appearing in the report, confirm that it exists in the DMAAI model table (4152 PI) for the relevant company. If a GL class code is not in the model table, RapidReconciler cannot assign an account — and Integrity Report 2 (DMAAI Entry Integrity) should also show a finding for that class.

**Step 4 — Determine Intent for Each Finding**

For each item, determine with the accounting team and item setup team whether the branch or location GL class is correct. Do not assume the branch record is always the source of truth — in some environments the location record is maintained more carefully.

**Step 5 — Correct in JDE**

Update the incorrect record in JDE. After corrections:
1. Trigger a RapidReconciler data refresh
2. Re-run Integrity Report 5
3. Confirm corrected items no longer appear

**Step 6 — Document Findings**

Maintain a log of each finding, the determination (error vs intentional), the action taken, and the date and responsible party.

---

## Section 10: Related Documentation

- [DMAAI Analysis Guide](dmaai-analysis.md) — Reference for Integrity Report 2 (DMAAI Entry Integrity). GL class codes that appear in this report should also be present in the model DMAAI table (4152 PI).
- [Cardex Variance Analysis Guide](cardex-variance-analysis.md) — If a branch/location GL class split has posted an item's work-order and other movements to different accounts, cardex variances may result.
- [End of Day Analysis Guide](end-of-day-analysis.md) — AAI errors caused by missing GL class entries produce End of Day variances.

---

*For support, contact your IT department.*
