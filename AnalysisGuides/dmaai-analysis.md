# DMAAI Analysis Guide

## RapidReconciler — DMAAI Entry Integrity (Integrity Report 2)

---

## Section 1: Using Claude for Automated Analysis

Claude can perform a full DMAAI Entry Integrity analysis automatically and return an updated `.xlsx` workbook with the analysis written to a card-layout sheet, the source sheet equipped with AutoFilter and freeze panes, and each finding categorized by priority. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`dmaai-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The Integrity Report 2 export (`.xlsx`)

If the AAI table descriptions reference (`distribution-aais.md`) is available, include it as a fourth file. It is used to populate the issue scope text with table-purpose context.

Then use the following prompt:

> *"Analyze this file using the DMAAI Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the multi-finding analysis sheet."*

Claude will read both documents, work through the analysis procedure against the Excel data, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent Integrity Report 2 reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **DMAAI-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Multi-Finding, configuration snapshot.** Each finding catalogues one type of DMAAI mismatch; there is no single primary variance. The reader's job is to triage which mismatches to fix first.

**File naming** (formatting spec, Section 1): `DMAAI Entry Integrity Analysis {YYYY-MM-DD}.xlsx`. Use the analysis date — DMAAI is a configuration snapshot with no period concept.

**Source sheet name:** `Integrity`. **Sorting is not required.** Apply AutoFilter on the header row and freeze panes per the formatting spec.

**Headline anchor** (formatting spec, Section 4): analysis date.

> `DMAAI Entry Integrity — {Month DD, YYYY}`

**Subline** (formatting spec, Section 5.3): a count summary, e.g., `{N} configuration findings across {M} companies — {n1} BU mismatches, {n2} object mismatches, {n3} net-zero verifications`.

**Secondary context strip** (formatting spec, Section 5.4) carries: source tables compared (F4095 against the model table 4152), companies in scope, and total row count.

**Issue Summary table** (formatting spec, Section 7.1): one row per distinct finding, sorted by priority. Columns: Issue label, Scope (companies/branches/tables), Detail (table description from `distribution-aais.md` if available, plus distinguishing characteristics), Rows count, Priority badge.

**Finding cards** (formatting spec, Section 7.2): one card per finding type. Use the Section 6 issue-type names from this guide as finding titles:

- `Mismatch — Business Unit` (the most systematic — single setup error affects every transaction in that table)
- `Mismatch — Object Account` (account-level discrepancy with the model)
- `Mismatch — Object Account (Work Order Cost Type A1)` — treat as a separate finding when work-order mismatches dominate the data
- `Net Zero — Verification Required` (informational; do not auto-classify as an error)

Each card has the standard Scope / Pattern / Resolution sub-fields. **Do not use a "Root Cause" sub-field** — DMAAI is a configuration snapshot, not an event log. The Pattern field characterizes what the data shows; the Resolution names the JDE corrective steps.

**Priority assignment** (formatting spec, Section 9.3, rule-based by issue severity):

| Priority | Issue type |
|---|---|
| **P1** | Business Unit mismatch — every transaction routes to the wrong company |
| **P2** | Object Account mismatch — account-level discrepancies; transactions hit the wrong GL account |
| **P3** | Net Zero — informational; flagged for verification, not auto-classified as an error |

For exports with systematic BU mismatches across many tables for the same company, group the findings into a single card whose Scope describes the affected tables and companies, rather than emitting one card per table.

**Sub-tables** (formatting spec, Section 7.3): not used in DMAAI — the volume is typically too large and there is no clean ranking criterion. The Issue Summary table substitutes for sub-tables; readers filter the source sheet for full details.

**Action Plan** (formatting spec, Section 7.4): in execution order. Typical sequence:

1. Investigate any BU mismatches first (P1) — confirm which side (DMAAI or model) is correct, with the accounting team.
2. Update the incorrect side in P40950 (DMAAI maintenance) or in the model table maintenance program.
3. Address Object Account mismatches (P2) by table or by company group.
4. Verify net-zero findings (P3) — do not auto-classify; confirm with the accounting team whether each is intentional.
5. Re-run Integrity Report 2 after corrections to confirm findings have cleared.

**Source sheet handling** (formatting spec, Section 10): **Pattern A — no highlights, AutoFilter only.** DMAAI exports typically have hundreds to thousands of rows; row-level highlighting becomes noise at that scale. Readers filter the source sheet by issue type to see specific findings.

### 1.4 Notes and Limitations

- Claude analyzes the data as exported. Account numbers are interpreted from the export columns; the actual JDE DMAAI setup must be verified in JD Edwards.
- Net-zero findings are flagged for verification, not auto-classified as errors. The Pattern field of the Net Zero finding card explains why this category requires accounting review.
- Mismatch resolution requires JDE access to confirm which account (DMAAI or model) is correct. The analysis identifies the discrepancy; it cannot determine intent.
- The analysis cannot determine the intended chart of accounts structure — that must be provided by the accounting team.
- For exports with systematic mismatches across many GL class codes for the same companies, the analysis groups findings by pattern (e.g., a single Finding card scoped to "all OUTG entries in tables 4122, 4126, 4240, 4310 for companies X and Y") to keep the summary workable.
- When table 4365 mismatches include doc type OO (Outside Operations), the analysis treats OO as a separate sub-finding within the Pattern field. Outside Operations is a different transaction flow from direct ship and rental settlement doc types and may require a different GL account.
- Where the AAI table descriptions reference (`distribution-aais.md`) is available and uploaded, the Detail column of the Issue Summary table includes the table purpose (e.g., "4122 — Inventory issue to manufacturing"). Without that reference, the table number alone is shown.

---

## Overview

Integrity Report 2 — **DMAAI Entry Integrity** — compares every active entry in the JD Edwards Distribution/Manufacturing AAI Values table (F4095) against the **Model DMAAI Table** (table 4152, document type PI). It identifies discrepancies in business unit, object account, and subsidiary that would cause transactions to post to incorrect GL accounts during reconciliation.

This guide is a reusable template for analyzing any customer's Integrity Report 2 export. The JD Edwards functionality, report structure, comment types, and analysis procedure are consistent across all environments. The specific companies, GL class codes, account numbers, row counts, and findings described in the analysis output will reflect the customer data in the uploaded export.

> **Who should use this guide:** JD Edwards cost accountantts, inventory accountantts, and RapidReconciler administrators responsible for investigating and resolving DMAAI integrity findings.

> **Important:** All corrections are made in JD Edwards. RapidReconciler displays integrity findings for visibility but does not modify JD Edwards data.

---

## Section 2: What Is Integrity Report 2?

RapidReconciler uses the DMAAI table (F4095) to assign GL accounts to every item ledger and location record during the nightly import from JD Edwards. The assignment logic works as follows:

1. Each item ledger transaction carries a **GL class code** (from the item's item location record, item branch record, or order line).
2. During import, RapidReconciler looks up that GL class code in the **Model DMAAI Table** (4152 PI) to find the correct business unit, object account, and subsidiary.
3. RapidReconciler then checks whether every other balance sheet DMAAI table that references inventory accounts (3110, 3130, 4122, 4126, 4134, 4172, 4240, 4310) is consistent with the model table for the same company and GL class code.
4. Any inconsistency is reported in Integrity Report 2 with a description of the type of mismatch.

**Why this matters:** A single mismatched DMAAI entry can cause every transaction of a given GL class to post to the wrong account — producing a systematic variance that grows each period. Integrity Report 2 surfaces these issues before they compound into large reconciling items at period end.

---

## Section 3: The Model DMAAI Table — Foundation Concept

### What Is the Model DMAAI Table?

The **Model DMAAI Table** is DMAAI table **4152** with document type **PI** (Physical Inventory). It has been designated as the master reference for inventory GL account assignments in RapidReconciler.

- Table **4152** is hard-coded in RapidReconciler and cannot be changed.
- Document type **PI** is the default; this may be changed by the RR administrator in Company settings to a custom document type (e.g., I9) if PI contains non-inventory GL class codes.
- The model table defines which **GL accounts are perpetual inventory accounts** for each company and GL class code.

### What the Model Table Controls

| Function | Description |
|---|---|
| **Inventory account identification** | Determines which BU/Object/Subsidiary combinations are perpetual inventory accounts |
| **Item ledger assignment** | Appends GL account information to every F4111 record during import |
| **Filter population** | Populates the business unit, object, and subsidiary filters on the RapidReconciler reconciliation page |
| **Satellite table validation** | Used as the reference point for Integrity Report 2 comparisons |

### Tables Validated Against the Model

| Table | Description | Module |
|---|---|---|
| **3110** | Raw Material WIP — Material Issues | Manufacturing |
| **3130** | WIP Completions | Manufacturing |
| **4122** | Inventory Debit (Adjustments, Transfers, Issues) | Inventory |
| **4126** | Received Not Vouchered (RNV) Debit | Purchasing |
| **4134** | In-Transit Inventory | Inventory |
| **4172** | Physical Inventory Adjustment | Inventory |
| **4240** | Cost of Goods Sold | Sales |
| **4310** | Inventory — Purchase Order Receipt | Purchasing |

> **Note:** DMAAI tables 4162 (Inventory Transfer), 4365 (Supplier Direct Ship / Outside Operations Settlement), 4385 (Outbound Logistics), and 4400 (Intercompany/Advanced Pricing) also appear in this report, indicating those tables are also being validated.

### Vetting the Model Table

Before relying on Integrity Report 2 findings, the model table itself must be correct. Integrity Report 1 (Model DMAAI) is used to validate the model table. Each entry should be verified for:

- Correct business unit, object account, and subsidiary for each company/GL class combination
- Inclusion of all stock inventory GL class codes
- Exclusion of non-stock and expense GL class codes from document type PI (or establishment of a dedicated document type)

---

## Section 4: Report Structure and Field Reference

### Export Column Definitions

| Column | Description | Notes |
|---|---|---|
| **CompanyNumber** | JD Edwards company number for which the DMAAI entry exists | Formatted as integer; leading zeros dropped in export |
| **TransactionComp** | Transaction company — typically matches CompanyNumber | May differ for intercompany configurations |
| **TableNumber** | DMAAI table number (e.g., 4122, 4134) | Corresponds to the transaction type being validated |
| **DocType** | Document type on the DMAAI entry (e.g., IA, IB, IR, VV) | Specific to each table; see Section 5 |
| **GLClass** | GL class code on the DMAAI entry | Four-character code from item setup (e.g., OUTG, 6101, 1421) |
| **AAIAccount** | Full account number in the DMAAI entry being reviewed | Format: BU.Object or Object only |
| **ModelAccount** | Full account number from model table 4152 PI | NaN if no model entry exists for this company/GL class |
| **Comment** | RapidReconciler classification of the discrepancy | See Section 6 |
| **FlexBu** | Whether Flexible Accounting is set up for the Business Unit component | Yes/No |
| **FlexSub** | Whether Flexible Accounting is set up for the Subsidiary component | Yes/No |
| **LongAccount** | Long-form account number as displayed in JDE | May include BU + Object + Subsidiary |

### Account Number Format

Account numbers in this report use the format **BU.Object** (e.g., `2.1421` = Business Unit 2, Object Account 1421). When only an object account is shown (e.g., `1421.0`), the business unit is blank in the DMAAI setup and will be sourced from the transaction's branch/plant.

---

## Section 5: DMAAI Tables in This Report

### Manufacturing Tables (3000 Series)

| Table | Document Type | Transaction Type | Description |
|---|---|---|---|
| **3110** | IM | Work Order Material Issue | Debits WIP for materials issued to a work order; credits raw material inventory (AAI 3110 = raw material account). Mismatch here causes material issues to post to wrong inventory account. |
| **3130** | IC | Work Order Completion | Credits WIP and debits the finished goods account on work order completion. Mismatch here affects finished goods valuation. |

> **Cost Type A1 note:** The comment "Mismatch - object OrTy WO CostTy A1" indicates the mismatch applies specifically to work orders with Order Type **WO** and Cost Type **A1** (Actual Cost). Standard cost work orders use a different path and may not be affected.

### Inventory Tables (4100 Series)

| Table | Document Type(s) | Transaction Type | Description |
|---|---|---|---|
| **4122** | IA, II, IJ, IL, IM, IP, IR, IV | Inventory Debit | Primary inventory account for adjustments (IA), internal transfers (II), physical inventory adjustments (IJ), lot transfers (IL), material issues (IM), physical inventory (IP), receipts (IR), and voids (IV). This is the most critical inventory table. |
| **4126** | VV | Received Not Vouchered (RNV) Debit | Debits the RNV account on voucher match. Paired with 4128 (RNV Credit). Present only for companies with purchasing activity: 2, 3, and 22 in this report. |
| **4134** | IB | In-Transit Inventory (Branch Transfer) | Used when inventory is in transit between branch plants. 4134 debits the in-transit account; 4136 credits it on receipt. Must point to different accounts for in-transit tracking to function. |
| **4162** | IX | Inventory Transfer — Cross-Company | Used for inventory transfers between companies. Present for company 2 only in this report. |

### Sales Tables (4200 Series)

| Table | Document Type(s) | Transaction Type | Description |
|---|---|---|---|
| **4220** | SO, C1, C2, CO, SA, SF, SM, SR, SW, SX | Inventory Relief — COGS Credit | Credits inventory on sales shipment; the credit side of the 4240 COGS entry. Paired with 4240. If 4220 and 4240 point to the same account, the debit and credit net to zero. Must point to a different account than 4240 for proper GL separation between COGS and inventory. |
| **4240** | SO, C1, C2, CO, SA, SF, SM, SR, SW, SX | Cost of Goods Sold | Debits COGS and credits inventory on sales shipment. Paired with 4220 (Inventory Relief). Mismatch here causes COGS to post to wrong account. |

> **Net zero note:** The comment `Net zero review - 4240,4220` indicates that the 4240 and 4220 entries for a given company, doc type, and GL class code may point to the same account. See Section 6 and Section 9.

### Purchasing / Order Settlement Tables (4300 Series)

| Table | Document Type(s) | Transaction Type | Description |
|---|---|---|---|
| **4310** | OR | Inventory — Purchase Order Receipt | Debits inventory on PO receipt. Paired with a credit to the RNV account (4320). Mismatch causes PO receipts to post to wrong inventory account. |
| **4365** | OA, OD, OO, OP | Supplier Direct Ship / Outside Operations Settlement | Used for order settlement in supplier direct ship, service and rental, and outside operations scenarios. **Doc type OO (Outside Operations)** posts subcontracted operation costs through this table and may require a different account than doc types OA, OD, and OP — confirm independently. Mismatch here causes settlement transactions to post to the wrong account. |
| **4385** | OB, OC, OM, OP, OR, OW | Outbound Logistics / Order Settlement | Used for outbound logistics processing. Present for companies 2 and 22. |
| **4400** | IV, OB, OC, OP | Intercompany / Advanced Pricing Settlement | Used for intercompany billing and advanced pricing adjustments. Present for companies 2, 3, and 22. |

> **Table 4365 — doc type OO note:** Outside Operations (OO) transactions represent subcontracted work order processing routed through purchasing. This is a different transaction flow from direct ship (OA/OD) and purchase order (OP) settlements. When doc type OO appears in a 4365 mismatch finding, it must be verified independently — the correct account for OO may differ from the correct account for the other doc types in the same table. Do not assume a single correction applies to all doc types in a 4365 finding.

---

## Section 6: Comment / Issue Type Reference

Integrity Report 2 assigns one of the following comments to each row:

### Mismatch — Object Account

> `Mismatch - object`

The object account in the DMAAI entry does not match the object account in the model table (4152 PI) for the same company and GL class code. The account numbers differ in the object component.

**Impact:** Transactions using this DMAAI entry will post to the wrong object account in the GL. Reconciliation variances will accumulate for every transaction of this GL class and doc type.

**Example:** For a given DMAAI table and GL class code, the DMAAI entry may have object 1421 while the model table expects object 1423. Every transaction of that GL class and doc type will post to the wrong object account until corrected.

### Mismatch — Object Account (Work Order Cost Type A1)

> `Mismatch - object OrTy WO CostTy A1`

Same as object account mismatch, but specifically flagged for **Work Order (WO)** transactions with **Cost Type A1** (actual cost). This appears in manufacturing tables 3110 and 3130.

**Impact:** Manufacturing material issues and completions for actual-cost work orders post to the wrong inventory/WIP account.

### Mismatch — Business Unit

> `Mismatch - Business unit`

The business unit in the DMAAI entry does not match the business unit in the model table for the same company and GL class code. The object accounts may match, but the BU differs.

**Impact:** Transactions post to the correct object account but under the wrong business unit — causing GL balances to appear in the wrong branch/plant, department, or division. This can affect all departmental reporting and branch-level reconciliation.

**Example:** For a given company, all GL classes in tables 4122 and 4310 may have a hard-coded business unit in the DMAAI entry while the model table expects no BU (meaning the BU should be sourced from the transaction's branch/plant). Every inventory and purchasing transaction for that company will post to the hard-coded BU regardless of which branch plant was used.

### Net Zero Review

> `Net zero review - 4122,4124`
> `Net zero review - 4126,4128`
> `Net zero review - 4134,4136`
> `Net zero review - 4240,4220`

RapidReconciler has detected that the entries in a paired set of tables (debit and credit) may result in a net-zero posting — meaning the debit and credit sides of the inventory entry land on the same account, or that one side is missing.

**This is a flag for verification, not a confirmed error.** Net zero may be intentional in some configurations (e.g., a clearing account that nets out by design). However, in inventory balance sheet tables, net zero almost always indicates a setup error.

> **Critical:** Do not mark net zero findings as resolved without confirming the account structure in JDE. See Section 9 for the full verification protocol.

---

## Section 7: Report Summary — [Generated from Customer Export]

This section is populated by Claude based on the uploaded Integrity Report 2 export. The following fields and tables will be derived from the actual data and written to the Analysis sheet.

### Report Header

| Field | Value |
|---|---|
| **Report Type** | Integrity Report 2 — DMAAI Entry Integrity |
| **Source Table** | F4095 — Distribution/Manufacturing AAI Values |
| **Period End** | *[Derived from export]* |
| **Export Generated** | *[Derived from export]* |
| **Total Rows** | *[Derived from export]* |
| **Companies** | *[Derived from export]* |
| **DMAAI Tables** | *[Derived from export]* |
| **Model Table** | 4152 / Document Type PI |

### Variance Type Summary

One row per comment type found in the export, with the following columns:

| Column | Description |
|---|---|
| **Comment / Issue Type** | The comment value from the RapidReconciler export |
| **DMAAI Table Description** | Sourced from the DMAAI table reference in this guide and distribution-aais.md |
| **Row Count** | Count of rows with this comment in the export |
| **% of Total** | Row count as a percentage of total export rows |
| **Companies** | Company numbers present for this comment type |
| **Doc Types** | Document types present for this comment type |
| **GL Class Codes Impacted** | Distinct GL class codes present for this comment type |

Color-code rows by severity: Priority 1 (red), Priority 2 (orange), Priority 3 / net zero (yellow).

### Row Count by Company

Summarize total rows, net zero rows, BU mismatch rows, and object account mismatch rows for each company present in the export.

### Row Count by DMAAI Table

Summarize row counts by DMAAI table number, with the primary comment type and companies present for each table.

---

## Section 8: Findings by Priority — [Generated from Customer Export]

This section is populated by Claude based on the uploaded export. One sub-section is written for each distinct finding, grouped and ordered by priority. The structure below defines what each finding sub-section must contain.

### Priority Classification

| Priority | Condition | Severity Label |
|---|---|---|
| **Priority 1** | Business unit mismatch — systematic error affecting all GL class codes for one or more companies | HIGH |
| **Priority 2** | Object account mismatch — confirmed discrepancy between DMAAI entry and model table | HIGH / MEDIUM-HIGH |
| **Priority 3** | Net zero review — requires verification before classification as error | REQUIRES VERIFICATION |

### Finding Sub-Section Template

Each finding is written as follows:

**[Priority X] — [Issue Type]: [Brief Description] ([Tables Affected]) — [Companies Affected]**

**Severity: [HIGH / MEDIUM-HIGH / MEDIUM / REQUIRES VERIFICATION] — [One-sentence summary]**

**What Was Found**
Describe the specific discrepancy: which tables, which companies, which GL class codes, which doc types, and what the AAI account shows versus what the model expects. Include a summary table if multiple tables or companies are involved.

**Root Cause**
Explain the likely cause of the discrepancy based on JDE DMAAI design principles. Present both possible explanations (e.g., DMAAI is wrong vs. model is wrong) without assuming which is correct — this determination requires JDE access and accounting team input.

**Verification Steps**
Step-by-step instructions to locate and confirm the finding in JDE DMAAI (fast path: `DMAAI`).

**Resolution**

> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.

Present as a decision table:

| If... | Then... |
|---|---|
| [Condition A — one account is correct] | [Action A — what to update in JDE] |
| [Condition B — other account is correct] | [Action B — what to update in JDE] |

---

### Doc Type OO in Table 4365 Findings

When doc type **OO (Outside Operations)** appears in a table 4365 mismatch finding alongside other doc types (OA, OD, OP), it must be treated as a **separate sub-finding** with its own verification question. Do not group OO with the direct ship and purchase order settlement doc types and apply a single resolution.

For OO specifically, the verification question is: *"Should Outside Operations subcontract settlements post to the same account as direct ship and rental settlements for this company and GL class code, or to a different account?"*

If the answer is a different account, the 4365 OO entry may be correctly set up (or the model table may not reflect the OO account at all). If the answer is the same account, then the OO mismatch follows the same resolution path as OA/OD/OP.

---

### Net Zero Findings

Net zero findings follow the same sub-section structure but reference the verification protocol in Section 9. They are always labeled Priority 3 and must not be marked as resolved without completing the Section 9 protocol.

For the customer export, net zero findings are grouped by table pair (4122/4124, 4126/4128, 4134/4136, 4240/4220) and summarized together unless a specific company or GL class shows a distinct pattern warranting separate treatment.

---

## Section 9: Net Zero — Verification Protocol

### Step 1: Access DMAAI in JDE

Navigate to the DMAAI setup using fast path **`DMAAI`** from any distribution setup menu. This opens the Distribution/Manufacturing AAI Values (F4095) inquiry screen.

### Step 2: Compare the Table Pair

For each net zero flag, compare the account numbers in the two paired tables:

| Net Zero Comment | Base Table | Check Against |
|---|---|---|
| Net zero review — 4122,4124 | DMAAI 4122 | DMAAI 4124 |
| Net zero review — 4126,4128 | DMAAI 4126 | DMAAI 4128 |
| Net zero review — 4134,4136 | DMAAI 4134 | DMAAI 4136 |
| Net zero review — 4240,4220 | DMAAI 4240 | DMAAI 4220 |

For each combination of **Company**, **Doc Type**, and **GL Class Code**:
1. Note the account number in the base table (4122, 4126, 4134, or 4240)
2. Note the account number in the complement table (4124, 4128, 4136, or 4220)
3. If the accounts are the same → this is the net zero condition

### Step 3: Determine Intent

Ask the accounting team: *Is it intentional that the [4240] and [4220] entries for [GL class] in [company] point to the same account?*

Common reasons for intentional net zero (rare but possible):
- A clearing account where the system self-offsets and a separate journal is used for the actual entry
- A test or placeholder configuration
- Flexible Accounting is expected to override the DMAAI entry

Reasons net zero is almost always an error:
- The complement table (4124, 4128, 4136, or 4220) entry was never set up
- The complement table entry was accidentally set to the same account as the base table
- A DMAAI copy operation duplicated an entry without updating the account

### Step 4: Correct If Necessary

If the net zero is confirmed as an error:
1. Navigate to the complement table entry in DMAAI
2. Update the account to the correct offsetting account (e.g., for 4220, this should be the inventory balance sheet account — typically a different object than the COGS account in 4240)
3. Verify the change is correct by reviewing the AAI design documentation
4. Refresh RapidReconciler after all changes are saved

### Step 5: Document the Review

For entries confirmed as intentional: document the business reason and mark as reviewed. For entries corrected: document the before and after account numbers, date of correction, and who authorized the change.

---

## Section 10: Step-by-Step Analysis Procedure

Use this procedure each time an Integrity Report 2 export is received.

### Step 1: Review the Export Header

Confirm the period-end date and generation timestamp in the first row of the export. Verify this matches the expected reporting period.

### Step 2: Establish the Issue Count Baseline

Sort by the **Comment** column and count rows by comment type. Use this as the baseline to track resolution over subsequent exports.

### Step 3: Compare to Prior Period

Before beginning analysis, compare the current export row counts to the prior period:

- **Row count increased for a known finding** — the issue has grown or new entries have been added with the same mismatch. Determine whether new doc types or GL class codes have been added.
- **Row count unchanged for a known finding** — the issue has not been corrected since the last review. Escalate if the same finding has persisted for two or more consecutive exports.
- **New finding not present in prior export** — treat as a new issue and analyze independently.
- **Finding from prior export no longer present** — confirm the correction was intentional and not masked by a data change.

Document the delta in the Report Summary section of the Analysis sheet.

### Step 4: Inspect New Doc Types in Existing Findings

When a mismatch finding includes a doc type not present in prior exports, analyze that doc type separately before grouping it with the existing finding. Different doc types within the same DMAAI table may represent different transaction flows (e.g., doc type OO = Outside Operations in table 4365 vs. OA/OD = direct ship). The correct account for the new doc type must be confirmed independently.

### Step 5: Address Mismatches Before Net Zero

Mismatch findings (object and business unit) represent confirmed discrepancies where the DMAAI and model table disagree. These should always be prioritized over net zero findings, which require verification before being classified as errors.

### Step 6: Work Mismatches by Company and Table

For each mismatch finding:
1. Identify the company, table, GL class, doc type, and account discrepancy
2. Open DMAAI in JDE and locate the specific entry
3. Compare the AAI entry to the model table entry side-by-side
4. Determine which account is correct (DMAAI or model)
5. Make the correction in the appropriate location (DMAAI entry or model table)

### Step 7: Work Net Zero by Table Pair

For each net zero flag, follow the verification protocol in Section 9. Do not skip verification — mark net zero items as verified (intentional) or corrected, not as automatically resolved.

### Step 8: Verify Corrections

After making corrections in JDE:
1. Trigger a data refresh in RapidReconciler
2. Re-run Integrity Report 2
3. Confirm that corrected items no longer appear in the export
4. Verify that corrections have not introduced new flags

### Step 9: Document Findings

Maintain a running log of:
- Each finding from the export (company, table, GL class, issue type)
- Determination: error or intentional
- Action taken: JDE DMAAI correction, model table update, or verified as intentional
- Date and responsible party
- Prior period row count and current period row count (for tracking)

---

## Section 11: AAI Quick Reference

### Balance Sheet DMAAI Tables Validated by Integrity Report 2

| Table | Module | Transaction Event | Typical Doc Types | Debit / Credit |
|---|---|---|---|---|
| **3110** | Manufacturing | Material issued to work order | IM | Debit WIP; Credit Raw Material |
| **3130** | Manufacturing | Work order completion | IC | Debit Finished Goods; Credit WIP |
| **4122** | Inventory | Inventory adjustment, transfer, receipt | IA, II, IJ, IL, IM, IP, IR, IV | Debit Inventory |
| **4124** | Inventory | Inventory relief (credit side of 4122) | IA, II, IJ, IL, IM, IP, IR, IV | Credit Inventory |
| **4126** | Purchasing | RNV debit (voucher match) | VV | Debit RNV |
| **4128** | Purchasing | RNV credit reversal | VV | Credit RNV |
| **4134** | Inventory | In-transit debit (branch transfer) | IB | Debit In-Transit |
| **4136** | Inventory | In-transit credit on receipt | IB | Credit In-Transit |
| **4162** | Inventory | Cross-company inventory transfer | IX | Debit Inventory — Receiving |
| **4172** | Inventory | Physical inventory adjustment | IJ | Debit/Credit Inventory |
| **4220** | Sales | Inventory relief — COGS credit (paired with 4240) | SO, C1, C2, CO, SA, SF, SM, SR, SW, SX | Credit Inventory |
| **4240** | Sales | Cost of Goods Sold (paired with 4220) | SO, C1, C2, CO, SA, SF, SM, SR, SW, SX | Debit COGS; Credit Inventory |
| **4310** | Purchasing | Inventory on PO receipt | OR | Debit Inventory |
| **4365** | Purchasing / Manufacturing | Supplier Direct Ship, Service & Rental, Outside Operations settlement | OA, OD, OO, OP | Debit settlement account — see doc type note below |
| **4385** | Purchasing | Outbound logistics | OB, OC, OM, OP, OR, OW | Varies |
| **4400** | Sales | Intercompany / Advanced Pricing | IV, OB, OC, OP | Varies |

> **Table 4365 doc type reference:**
> - **OA** — Order Acknowledgment (direct ship)
> - **OD** — Order Direct Ship
> - **OO** — Outside Operations (subcontracted work order processing — different transaction flow; verify account independently)
> - **OP** — Order Purchase

### AAI Key Structure

An AAI entry requires a unique combination of:
- **Company Number**
- **Document Type**
- **GL Class Code**

If a specific combination is not found, JDE searches in this fallback order:
1. Company [X], GL Class [specific code]
2. Company [X], GL Class \*\*\*\* (wildcard)
3. Company 00000, GL Class [specific code]
4. Company 00000, GL Class \*\*\*\* (wildcard)
5. Error if still not found

### GL Class Code Sources by Transaction Type

| Transaction Type | GL Class Code Source |
|---|---|
| Work Orders (issues & completions) | Item Branch level |
| Sales Orders / Purchase Orders | Order line level (copied from Item Location) |
| Inventory Transactions | Item Location level |

### Business Unit in AAI Entries

When the Business Unit field is **blank** in the DMAAI entry:
- The system pulls the BU from the **Branch/Plant on the transaction**
- Exception: If a Project Number is assigned to the BU, the Project Number is used as the BU
- Exception: Sales Update (R42800) processing option 5 controls BU source for sales transactions
- Exception: Flexible Accounting rules (P40296) can override the BU dynamically

When the Business Unit field is **populated** in the DMAAI entry:
- The hard-coded BU is used regardless of the transaction's branch/plant
- This is appropriate only for accounts that are not branch/plant-specific (e.g., corporate accounts)

### Flexible Accounting Notes

Flexible Accounting (P40296) allows the business unit or subsidiary to be dynamically constructed from transaction fields (customer, item, etc.). If FlexBu or FlexSub is **Yes** in the report:
- The BU or subsidiary shown in the AAI account may not be the actual posting BU/Sub
- Flexible Accounting rules must be reviewed in P40296 to determine the actual account
- Per AAI setup requirements, if Flexible Accounting populates the BU, the BU must be left **blank** in the DMAAI entry

In this report, **FlexBu = Yes** for rows where the business unit component of the account is dynamically constructed at posting time. The object account mismatch findings still apply — Flexible Accounting cannot flex the object account, only the business unit or subsidiary.

---

## Section 12: Related Documentation

- [End of Day Analysis Guide](end-of-day-analysis-guide.md) — Reference for EOD variance analysis in RapidReconciler
- [DMAAI Reference Guide](distribution-aais.md) — Complete reference for JDE Distribution and Manufacturing AAIs (F4095), including all table numbers, key structure, fallback sequence, and Flexible Accounting setup
- [Inventory Key Concepts Training Manual](inventory-key-concepts.md) — Foundation concepts including the Model DMAAI Table, GL class code hierarchy, variance sources, and cardex variance

---

*For support, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com)*
