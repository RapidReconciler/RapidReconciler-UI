# Inventory Roll Forward Analysis Guide

## RapidReconciler — Inventory Roll Forward Report Reference

---

## Section 1: Using Claude for Automated Analysis

Claude can perform a full Inventory Roll Forward analysis automatically and return an updated `.xlsx` workbook with the multi-finding analysis written to a card-layout sheet, the source sheet equipped with AutoFilter and freeze panes (with selective row highlights for anomalous rows), and findings categorized by priority. This eliminates manual annotation and ensures consistent output across analysts.

### 1.1 First Request in a Session

On the first request, upload **three files** together:

1. This guide (`inv-account-roll-forward-analysis.md`)
2. The shared formatting spec (`excel-output-formatting-spec.md`)
3. The Roll Forward report (`.xlsx`)

Then use the following prompt:

> *"Analyze this file using the Inventory Roll Forward Analysis Guide and the formatting spec, then produce an updated copy of the Excel file with the multi-finding analysis sheet."*

Claude will read both documents, work through the analysis procedure against the Excel data, build the workbook per the formatting spec, and return the file.

### 1.2 Follow-On Requests in the Same Session

Once the guide and formatting spec have been uploaded in a session, Claude retains them in context for the remainder of the conversation. Subsequent Roll Forward reports **do not require re-uploading**. Simply upload the new `.xlsx` and use a shorter prompt:

> *"Analyze this file and return it with the analysis sheet."*

Start a new session when switching to a different guide version or when the conversation has been idle long enough that context may have been lost. When in doubt, include the guide and the formatting spec again — Claude will use them and ignore the duplication.

### 1.3 Output Specification

The output workbook follows the conventions defined in the **shared formatting spec** (`excel-output-formatting-spec.md`) — file naming pattern, sheet structure, card layout, colour palette, priority calculation, source-sheet handling, adaptive row heights, and floating text box specifications all live in that document so they stay consistent across all RapidReconciler analysis guides.

This section captures only the **Inventory Roll Forward-specific** content that the formatting spec needs from this guide.

**Template family** (formatting spec, Section 3): **Multi-Finding, period-end report.** The report's primary check is GL and variance roll-forward continuity (GLOK and VarOK). When GLOK and VarOK are intact across all rows, findings cover the secondary anomalies surfaced by the OOB and CardexVar columns.

**File naming** (formatting spec, Section 1): `Account Roll Forward Analysis {YYYY-MM-DD}.xlsx`. Use the period being closed (most recent PeriodEnds value in the export) — this is a period-end report.

**Source sheet name:** `Roll Forward`. **Sorting is not required** for analysis correctness — the export is typically already in Company → Account → Period order, which is the natural reading order. Apply AutoFilter on the header row and freeze panes per the formatting spec.

**Headline anchor** (formatting spec, Section 4): period being closed (most recent period in the dataset).

> `Account Roll Forward — Period Ending {YYYY-MM-DD}`

If the report is run against historical data (the most recent period in the dataset is older than the current calendar period), include the analysis date in the secondary context strip: `Generated {date} (against data through {period end})`.

**Subline** (formatting spec, Section 5.3): answer the report's primary check first, then the secondary anomaly count:

- When GLOK and VarOK are intact: `GL and variance roll forwards intact — 0 GLOK breaks, 0 VarOK breaks across {N} rows · {K} secondary anomalies in OOB and CardexVar`
- When breaks exist: `{N} GLOK breaks, {M} VarOK breaks across {K} rows · {n} additional anomalies`

**Secondary context strip** (formatting spec, Section 5.4) carries: generation date, period range covered, companies in scope, account count.

**Issue Summary table** (formatting spec, Section 7.1): one row per distinct finding, sorted by priority. Columns: Issue label, Scope (companies / account ranges), Detail (concentration patterns, biggest amount, key counts), Rows count, Priority badge.

**Finding cards** (formatting spec, Section 7.2): findings depend on what the data surfaces. Common findings:

- `GLOK breaks — F0902 vs F0911 misalignment` (P1) — only included when GLOK = "no" rows exist
- `VarOK breaks — variance roll forward discontinuity` (P1) — only included when VarOK = "no" rows exist
- `Historical OOB > {threshold}` (P1) — F0902/F0911 disagreements in closed historical periods (typically threshold $100; adjust based on the data scale)
- `Persistent stuck OOB on a single account` (P2) — same small OOB value across many consecutive periods on one account; signature of a stuck rounding artifact in F0902
- `End-period CardexVar with material residual` (P2) — accounts where end-period OOB and CardexVar do not fully offset, leaving an unexplained residual

When the data shows clear sub-patterns within a finding (recurring concentration on one account, single-incident vs systematic patterns, currency-specific clusters), describe these in the Pattern field rather than splitting into separate findings.

Each card has the standard Scope / Pattern / Resolution sub-fields. **Do not use a "Root Cause" sub-field** — Inventory Roll Forward catalogues anomalies; the Pattern field characterizes what the data shows.

**End-period OOB is expected** per the guide's Section 4.4 and is not a finding on its own. Only include end-period accounts in findings when the residual after offsetting CardexVar is material (typically > $100 absolute, threshold adjusted to data scale).

**Priority assignment** (formatting spec, Section 9.3, rule-based):

| Priority | Conditions |
|---|---|
| **P1** | GLOK = "no" or VarOK = "no" — actual roll-forward chain break; OR historical OOB above the materiality threshold (defaults to $100 absolute) |
| **P2** | Persistent stuck OOB pattern (same small value across many periods on one account); OR end-period CardexVar residual above the materiality threshold |
| **P3** | Informational; not typically used for this report |

The materiality threshold is data-dependent — for datasets where the typical inventory account balance is in the millions, $1,000 may be a more appropriate threshold than $100. State the threshold used in the secondary context or the Pattern field of the relevant finding so the reader knows what was filtered.

**Sub-tables** (formatting spec, Section 7.3): use sub-tables for the actionable subset of each finding. Common patterns:

- For historical OOB: sub-table all rows above the materiality threshold, sorted by Company → Account → Period ascending.
- For persistent stuck OOB: no sub-table needed — the finding is one account across many periods; describe in the Pattern field.
- For end-period CardexVar residuals: sub-table all rows above the materiality threshold, sorted by Company → Account → Period ascending.

**Action Plan** (formatting spec, Section 7.4): in execution order. Typical sequence:

1. Investigate any recurring patterns first — a single account showing OOB across multiple periods is the strongest signal of a systematic issue.
2. For any persistent stuck OOB (same value, same account, many periods), run R099102 (Account Balance Repost) scoped tightly to that company and account. Test in non-production first; involve the JD Edwards admin.
3. For one-time historical OOB incidents that have already healed in subsequent periods, document the incident for the audit trail; no active correction is needed.
4. For clusters of OOBs on the same date across multiple accounts, investigate whether a single posting incident explains them all.
5. For end-period CardexVar residuals, run the Cardex Variance Analysis report for each affected account to identify the specific F4111 records that don't reconcile. First check: confirm R30837 (WIP Revaluation) was run after the most recent R30835 (Frozen Standard Update).
6. After any R099102 or other corrections, refresh RapidReconciler and re-run the report to confirm anomalies have cleared.
7. When GLOK and VarOK are intact, state explicitly that no batch posting, R099102, or Reroll is required for chain continuity — continue periodic monitoring at each refresh.

Include the standard period-close gate caution: do not post period-close journal entries until variance is at expected levels.

**Source sheet handling** (formatting spec, Section 10): **Pattern C — highlight only the anomalous rows.** Roll Forward exports typically have hundreds of rows where most are clean and a small subset (~5-15%) are anomalous. Apply priority fills only to the rows referenced by findings (P1 historical OOB rows in light-red, P2 stuck-OOB and end-period-residual rows in amber); leave the rest unhighlighted so the anomalies stand out against a clean background.

### 1.4 Notes and Limitations

- Claude identifies GLOK = "no" and VarOK = "no" rows directly from column values. It then examines surrounding periods to determine the likely cause (prior-period UnpostBatch, OOB amount, JE activity, or reset artifact).
- The VarOK baseline timestamp is read from column T of the baseline rows. Claude uses this to contextualize historic VarOK = "no" rows that occurred before the most recent reset.
- Floating-point precision artifacts are rounded to two decimal places throughout.
- Claude cannot access JD Edwards to verify batch details, confirm OOB causes, or check R099102 results. Findings requiring JD Edwards investigation are flagged inside the Resolution sub-field of the relevant Finding card.
- For exports with more than 200 accounts, consider specifying a company or account range in the prompt to focus the analysis.
- **End-period OOB is expected** per Section 4.4 and is not flagged as a finding on its own — only when the residual after offsetting CardexVar is material does it become a finding.
- The materiality threshold for OOB and CardexVar findings is data-dependent. The default is $100 absolute, but it should scale with the typical account balance in the dataset. Claude states the threshold used in the analysis output.

---

## Overview

The Inventory Roll Forward report in RapidReconciler provides a multi-period view of how GL account balances and inventory reconciliation variances move through time. Each row in the report represents the aggregated activity for a single GL account in a single period — the sum total of all transactions for that account in that month.

The report serves two distinct purposes:

1. **GL Roll Forward (columns A–K):** Verifies that the GL balance for each inventory account rolls forward correctly from period to period — that is, the ending balance of one period equals the beginning balance of the next.

2. **Variance Roll Forward (columns L–T):** Verifies that the net reconciliation variance (perpetual vs. GL) also rolls forward correctly, and accounts for all components that explain why the perpetual inventory differs from the GL.

> **Who should use this guide:** JD Edwards cost accountantts and inventory accountantts responsible for investigating and resolving multi-period GL and variance continuity issues in RapidReconciler.

> **Important:** All corrections are made in JD Edwards. RapidReconciler displays the roll forward data for visibility but does not modify JD Edwards data.

---

## Section 2: Report Structure

### 2.1 How the Report Is Organized

The report is sorted by **CompanyNumber → PeriodEnds → LongAccount**. Each unique combination of company and account appears once per period, from the baseline period through the current (end) period.

**Period markers in GLOK (column J):**

| Value | Meaning |
|---|---|
| **baseline** | The earliest period in the dataset. BegGL = 0; EndGL = the opening balance loaded at that point. |
| **yes** | The GL rolled forward correctly from the prior period. BegGL(n) = EndGL(n−1). |
| **no** | The GL did **not** roll forward correctly. BegGL(n) ≠ EndGL(n−1). See Section 4. |
| **end** | The most recent period in the dataset — the current snapshot. |

**Period markers in VarOK (column T):**

| Value | Meaning |
|---|---|
| **[timestamp]** | The baseline period for variance tracking. The timestamp shown is the date and time RapidReconciler was last reset. The BegVar for this period represents the starting reconciliation variance at the time of reset. |
| **yes** | The variance rolled forward correctly. BegVar(n) = Variance(n−1). |
| **no** | The variance did **not** roll forward correctly. BegVar(n) ≠ Variance(n−1). See Section 5. |
| **end — [timestamp]** | The most recent period. The timestamp indicates when the current snapshot was generated. |

### 2.2 Key Structural Rules

- **One row per account per period** — each row is the aggregate of all transactions on that account in that period. There is no transaction-level detail in this report; use the Transaction Detail report for individual document investigation.
- **The baseline period is not a "zero" period** — it represents the opening balance at the time RapidReconciler was first configured or last reset. The BegGL and BegVar on the baseline row may be non-zero.
- **VarOK baseline date ≠ GLOK baseline date** — the GLOK baseline is the earliest period loaded into the dataset. The VarOK baseline is the date RapidReconciler was last reset, which is recorded as a timestamp in column T of the baseline row. These are often different.
- **Floating-point artifacts** — amounts may display extended decimal precision (e.g., `-23823286.899999999`). These are IEEE 754 representation artifacts from the export and do not indicate data errors. Round to two decimal places for analysis.

---

## Section 3: Column Reference

### 3.1 GL Roll Forward Columns (A–K)

| Column | Name | Description |
|---|---|---|
| **A** | PeriodEnds | The last day of the fiscal period this row represents |
| **B** | CompanyNumber | JD Edwards company number |
| **C** | ShortAccount | Abbreviated account identifier |
| **D** | LongAccount | Full GL account number in BusinessUnit.ObjectAccount format |
| **E** | Currency | Currency code for this account |
| **F** | Rate | Exchange rate (1.0 = domestic or no conversion) |
| **G** | BegGL | Beginning GL balance for the period (from F0902) — should equal prior period EndGL |
| **H** | PerGL | Net GL activity posted during the period (from F0911) |
| **I** | EndGL | Ending GL balance: BegGL + PerGL + UnpostBatch |
| **J** | GLOK | Roll forward accuracy flag: `baseline`, `yes`, `no`, or `end` |
| **K** | UnpostBatch | Total amount of approved but unposted GL batches as of the report date. These are included in EndGL but have not yet updated F0902. |

> **EndGL formula:** `EndGL = BegGL + PerGL + UnpostBatch`. The UnpostBatch amount is included in EndGL because RapidReconciler shows the full balance including approved-but-unposted amounts. When these batches post, EndGL will not change, but the split between PerGL and UnpostBatch will shift.

### 3.2 Variance Roll Forward Columns (L–T)

| Column | Name | Description |
|---|---|---|
| **L** | PerCX | Net cardex (item ledger F4111) activity for the period |
| **M** | Perpetual | Ending perpetual inventory balance (running total of all F4111 activity) |
| **N** | BegVar | Beginning reconciliation variance — the Variance carried forward from the prior period |
| **O** | EndofDay | End of Day transactions: F4111 cardex entries with no matching F0911 GL entry (batch programs have not yet run) |
| **P** | Variance | Net reconciliation variance for the period: the difference between Perpetual and EndGL, explained by the sum of EndofDay + JEs + OOB + CardexVar |
| **Q** | JEs | Journal entries that affect the reconciliation — GL-only entries or manual journal entries posted to inventory accounts without a cardex counterpart |
| **R** | OOB | Out of Balance: the difference between F0902 (account balance table) and F0911 (GL detail table) for the same account and period. Should be zero in a clean system. |
| **S** | CardexVar | Cardex integrity variance: F4111 discrepancies that cannot be attributed to any other variance source |
| **T** | VarOK | Variance roll forward accuracy flag: `[timestamp]` (baseline), `yes`, `no`, or `end — [timestamp]` |

> **Variance formula:** `Variance = EndofDay + JEs + OOB + CardexVar`. The Variance represents the net perpetual vs. GL difference for the period after accounting for all known sources. If VarOK = "yes", then `BegVar(n) = Variance(n−1)` — the variance carried into the current period matches what the prior period left behind.

---

## Section 4: GLOK — GL Roll Forward Logic

### 4.1 How GLOK Is Calculated

For each period after the baseline, RapidReconciler checks:

```
BegGL(current period) = EndGL(prior period)?
```

If yes → GLOK = `yes`
If no  → GLOK = `no`

The baseline period always shows GLOK = `baseline`. The most recent period shows GLOK = `end`.

### 4.2 What Causes GLOK = "no"

GLOK = "no" means the GL balance did not carry forward cleanly between periods. There are two distinct causes, and they require different corrective actions.

**Cause 1 — Late-posting batch (prior period UnpostBatch was non-zero)**

A batch was approved but unposted at period-end (visible in the prior period's UnpostBatch column). It subsequently posted after the period closed, retroactively changing the prior period's F0902 balance. The gap between BegGL(current) and EndGL(prior) will equal the prior period UnpostBatch amount exactly.

```
Period N closes:
  EndGL(N) = BegGL(N) + PerGL(N) + UnpostBatch(N)
  UnpostBatch shows $X in column K

Between period N and period N+1:
  Unposted batch posts → F0902 updated for period N
  EndGL(N) effectively becomes BegGL(N) + PerGL(N) only
  But RapidReconciler already recorded the pre-posting EndGL(N)

Period N+1 opens:
  BegGL(N+1) was locked at the old EndGL(N)
  After the batch posts, EndGL(N) ≠ BegGL(N+1)
  → GLOK(N+1) = "no"
```

**Resolution:**

> ⚠ **Before making any changes in JD Edwards:** Test all configuration changes in a non-production environment first. For any scenario where a GL journal entry may be required, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting. Post the outstanding batches — approve in **P0011**, then post with **R09801**. GLOK self-corrects at the next RapidReconciler refresh. No journal entry or R099102 run is required.

**Cause 2 — F0902/F0911 misalignment (prior period UnpostBatch was zero)**

All batches were confirmed posted, yet BegGL(current) still does not equal EndGL(prior). This means the account balance table (F0902) is out of sync with the GL detail table (F0911) — the two tables disagree on what the period balance should be. No unposted batch explains the gap.

Common causes include: a failed database transaction during posting, a year-end or period close that left F0902 in an inconsistent state, or a direct update to F0902 that was not reflected in F0911.

**Resolution:** Run **R099102 (Account Balance Repost)** to regenerate F0902 from F0911 detail:

1. Identify the affected company, fiscal year, and account numbers.
2. Navigate to R099102 via the General Accounting reports menu or fast path.
3. Set data selection to the specific company, fiscal year, and account range.
4. Run in **proof mode** first to confirm which accounts and periods will be affected.
5. Run in **final mode** to regenerate the F0902 balances from F0911.
6. Confirm account balances match F0911 totals after the run.
7. At the next RapidReconciler refresh, verify GLOK returns to "yes".

> **Caution:** R099102 replaces F0902 balances entirely for the selected accounts and periods. Use precise data selection to avoid unintended impact on accounts outside the problem area. Involve your JD Edwards administrator and finance team before running in final mode.

**Cause 3 — Data load issue (consecutive "no" rows with PerGL = 0 but changing BegGL)**

Multiple consecutive periods show GLOK = "no" for the same account, column H (PerGL) contains zeros across those periods, yet the GL balance in column G (BegGL) is changing from period to period. This pattern cannot be explained by a late-posting batch or an F0902/F0911 misalignment — it indicates that the RapidReconciler database has loaded incomplete or inconsistent data from F0911.

The combination of zero PerGL (no GL activity) and a changing BegGL (the opening balance shifts without any recorded transactions) means the data imported into RapidReconciler does not match what exists in JD Edwards for those periods.

**Resolution:** This requires a RapidReconciler administrator action — the F0911 data must be truncated and reimported from JD Edwards:

1. Contact your RapidReconciler administrator or GSI support.
2. The administrator must truncate the F0911 table within RapidReconciler to remove the inconsistent data.
3. Trigger a fresh JD Edwards data import. A user with the **Import JDE** function enabled under their Authorized Functions can perform an ad hoc import (Admin > Users > lock icon > Authorized Functions > Import JDE). Note: this permission is rarely recommended and should not be assigned without consulting GSI.
4. After the import completes, verify the Roll Forward report to confirm PerGL values are populated correctly and consecutive GLOK = "no" rows have resolved.

> **Important:** This is an uncommon condition that indicates a systemic data integrity problem in the RapidReconciler database, not in JD Edwards itself. Do not attempt to correct individual account balances — the entire F0911 dataset for the affected company must be reloaded.

### 4.3 Reading a GLOK = "no" Row

**Decision workflow:**

1. **Are there multiple consecutive GLOK = "no" rows for the same account, with PerGL = 0 in column H but BegGL changing in column G?** → Cause 3 (data load issue). Contact your RapidReconciler administrator to truncate F0911 and reimport JD Edwards data.
2. Look at the **prior period's UnpostBatch** (column K of the row one period earlier for the same account).
3. Calculate the gap: `BegGL(current) − EndGL(prior)`.
4. **If the gap equals the prior period's UnpostBatch** → Cause 1 (late-posting batch). Post outstanding batches; GLOK self-corrects.
5. **If the prior period UnpostBatch was zero** → Cause 2 (F0902/F0911 misalignment). Run R099102.
6. If unclear, query F0902 and F0911 directly for the account and period to confirm whether the two tables agree.

### 4.4 GLOK and UnpostBatch in the End Period

In the current (end) period, GLOK = `end` regardless of whether UnpostBatch is zero. The UnpostBatch column in the end period is critical: it shows how much of the current EndGL is not yet posted to F0902. These amounts will cause GLOK = "no" in the next period if the batches post after period-end.

**Rule:** If any account shows a large UnpostBatch in the end period, expect GLOK = "no" on that account in the following period — unless the batch posts before the next period-end data is imported into RapidReconciler.

---

## Section 5: VarOK — Variance Roll Forward Logic

### 5.1 How VarOK Is Calculated

For each period after the VarOK baseline, RapidReconciler checks:

```
BegVar(current period) = Variance(prior period)?
```

If yes → VarOK = `yes`
If no  → VarOK = `no`

The baseline period always shows VarOK = the RapidReconciler reset timestamp. The most recent period shows VarOK = `end — [timestamp]`.

### 5.2 What the VarOK Baseline Date Means

The timestamp shown in column T of the baseline row is the **date and time RapidReconciler was last reset**. This is not the same as the GLOK baseline period (which is the earliest period in the dataset).

A reset clears the accumulated variance history and starts fresh from the current reconciliation state. After a reset:

- All BegVar values for the reset period are set to the current Variance at that point
- The VarOK roll forward chain starts from zero for the next period
- Historical VarOK = "no" rows before a reset are expected — they reflect the state before the reset corrected things

### 5.3 What Causes VarOK = "no"

| Cause | What to Look For | Resolution |
|---|---|---|
| **Late-posting batch** | GLOK = "no" on the same period and account; prior period UnpostBatch was non-zero | Same root cause as GLOK failure; resolves when batches post and RR refreshes |
| **RapidReconciler reset** | BegVar jumps discontinuously from prior period Variance; subsequent period BegVar = 0 | Expected after a reset; document for audit |
| **Out of Balance (OOB)** | Non-zero OOB in column R in a **closed historical period** alongside VarOK = "no"; F0902 vs F0911 misalignment. OOB in the current (end) period is expected and not a cause for action. | Run R099102 (Account Balance Repost) for the affected account and period |
| **Retroactive journal entry** | Non-zero JEs in column Q; GL-only entry posted to a prior period's inventory account | Investigate who posted the entry; recode if incorrect |
| **Cardex integrity issue** | Non-zero CardexVar in column S | Run Cardex Variance report; investigate F4111 discrepancies |
| **Aged VarOK = "no" (> 3 periods old)** | VarOK = "no" rows that are more than 3 periods older than the current (end) period | Use the Reroll function on the Companies page in RapidReconciler — see Section 5.5 |

### 5.4 Reading a VarOK = "no" Row

When you see VarOK = "no":

1. **Is the "no" more than 3 periods older than the current (end) period?** → Use the Reroll function — see Section 5.5.
2. Compare `BegVar(current)` to `Variance(prior period)`. Note the difference.
3. Check column R (OOB) — a non-zero OOB in a **closed historical period** is the most serious cause and should be addressed first. OOB in the current (end) period is expected and does not require investigation.
4. Check column Q (JEs) — significant JE activity may explain variance jumps but should be investigated.
5. Check whether GLOK = "no" on the same row — if both fail, a late-posting batch is the most likely common cause.
6. Check the next period's BegVar — if it equals zero rather than carrying this period's Variance, a RapidReconciler reset occurred between the two periods.

### 5.5 Aged VarOK = "no" — Use Reroll

When VarOK = "no" rows are more than 3 periods older than the current period, the variance roll forward has drifted too far from the current state to self-correct through normal batch posting or R099102 operations. The recommended resolution is to use the **Reroll** function in RapidReconciler, which recalculates the perpetual balance for the affected company from the baseline date forward.

**How to identify aged VarOK = "no":**
- Filter column T for "no"
- Note the period in column A for each "no" row
- If the period is more than 3 months before the current (end) period date, it qualifies as aged

**Resolution — use the Reroll function:**

1. Navigate to **Admin > Companies** in the RapidReconciler main navigation panel. Administrator rights are required for this option to be visible.
2. The Companies page lists all licensed companies. Locate the affected company.
3. Click the **Reroll** link in the far-right column of that company's row.
4. Confirm the action when prompted. Reroll recalculates the perpetual balance for the company from the baseline date forward — this process may take several minutes depending on data volume.
5. After the reroll completes, return to the Roll Forward report and refresh. Verify that the aged VarOK = "no" rows have resolved.

> **Note on Reroll:** Reroll is typically used when transactions have been backdated more than one period, or when the variance roll forward chain has drifted beyond what incremental corrections can address. It does not change JD Edwards data — it only recalculates RapidReconciler's internal perpetual balance history. Only RapidReconciler administrators can access the Companies page and perform a reroll.

> **When to contact GSI:** If the Reroll does not resolve the aged VarOK = "no" rows, or if the same accounts show persistent failures across multiple rerolls, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com) for investigation.

---

## Section 6: Variance Component Reference

The **Variance** column (P) represents the total reconciliation difference between the perpetual inventory (F4111) and the GL (F0902) for the period. It is composed of four distinct sources:

### 6.1 End of Day (Column O)

Cardex transactions (F4111) that have no matching GL entry (F0911) because the batch program that creates the GL entry has not yet run. These are expected for sales (awaiting R42800) and manufacturing (awaiting R31802A) transactions.

**Normal behavior:** End of Day balances clear when nightly batch programs run. A persistent End of Day balance indicates a batch program did not run or encountered errors.

**What to investigate:** Run the End of Day Analysis report to identify which transactions are in queue and which batch programs need to run.

### 6.2 Journal Entries (Column Q)

GL entries that affect the inventory account balance but have no corresponding cardex (F4111) record. These are typically:
- Manual journal entries posted directly to inventory accounts
- Intercompany or allocation entries that update F0911 without a cardex counterpart
- Reversal entries

**Normal behavior:** Small JE balances are common and may represent rounding, allocation, or cost adjustment activity. Large or unexpected JE balances require investigation.

**What to investigate:** Use the Transaction Detail report for the affected account to identify which GL entries have no cardex counterpart (GL-only entries, Section 5.2 of the Transaction Detail Analysis Guide).

### 6.3 Out of Balance (Column R)

The difference between F0902 (account balance table) and F0911 (account ledger detail table) for the same account and period. In a healthy system, F0902 is the summarized result of all F0911 postings and should equal the sum of F0911 for that account and period.

**OOB in the current (end) period is expected and does not require corrective action.** F0902 is a period-summary table that is finalized when a period closes; during an open period, F0902 and F0911 will naturally diverge as transactions post throughout the month. Only historical (closed) periods with a non-zero OOB represent a potential data integrity issue.

**A non-zero OOB in a closed (historical) period** typically indicates a failed database transaction, an aborted year-end close, or a direct update to F0902 that was not reflected in F0911. In this case: run **R099102 (Account Balance Repost)** in proof mode first to identify affected accounts and periods. Run in final mode to regenerate F0902 from F0911. Involve your JD Edwards administrator before running in final mode. Only act on historical OOB if it is accompanied by a VarOK = "no" flag or is otherwise causing a visible reconciliation break.

### 6.4 Cardex Variance (Column S)

Item ledger integrity variances — discrepancies within F4111 itself that cannot be attributed to End of Day, JEs, or OOB. These typically arise from:
- Cost change revaluations (Standard Cost Change rows) without corresponding GL entries
- F4111 records with incorrect or missing data
- Missing WIP Revaluation (R30837) runs after standard cost updates

**What to investigate:** Run the Cardex Variance Analysis report in RapidReconciler for the affected accounts. See the Cardex Variance Analysis Guide for the investigation procedure.

---

## Section 7: Common Patterns and Root Causes

### 7.1 GLOK = "no" Caused by Late-Posting Batch

**How to identify:**
- GLOK = "no" on period N+1
- Period N has a non-zero UnpostBatch in column K
- Gap between BegGL(N+1) and EndGL(N) equals the prior period UnpostBatch amount

**What happened:** A batch was approved but unposted at period-end. When it posted later, it retroactively changed the prior period's F0902 balance. RapidReconciler had already recorded the pre-posting EndGL, so BegGL of the next period no longer matched.

**Resolution:**
1. Open Batch Approval (**P0011**) in JD Edwards.
2. Locate the outstanding batches by company and account.
3. Approve any batches with Approval Status = Pending.
4. Run the GL Posting program (**R09801**) to post approved batches.
5. Confirm posting status shows **D** (Done) in P0011.
6. At the next RapidReconciler refresh, verify GLOK returns to "yes".

Post all unposted batches before period-end to prevent recurrence. See Section 4.2 for the full decision workflow between late-batch and R099102 scenarios.

### 7.2 GLOK = "no" With No Unposted Batch (F0902/F0911 Misalignment)

**How to identify:**
- GLOK = "no" on period N+1
- Prior period UnpostBatch in column K is zero
- All batches for the prior period have been confirmed posted (posting status = D in P0011)
- Gap between BegGL and prior EndGL cannot be explained by any pending batch

**What happened:** The account balance table (F0902) is out of sync with the GL detail table (F0911). F0902 is the summary that F0911 feeds into when batches post — if they disagree, the source of truth is F0911 and F0902 must be regenerated.

**Resolution:** Run R099102 (Account Balance Repost):
1. Identify the affected company, fiscal year, and account numbers.
2. Navigate to R099102 via the General Accounting reports menu or fast path.
3. Set data selection to the specific company, fiscal year, and account range.
4. Run in **proof mode** first — review which accounts and periods will be affected.
5. Run in **final mode** to regenerate F0902 from F0911.
6. Verify account balances in the trial balance match F0911 totals.
7. At the next RapidReconciler refresh, confirm GLOK returns to "yes".

> **Caution:** R099102 replaces F0902 balances entirely for selected accounts and periods. Use precise data selection. Involve your JD Edwards administrator before running in final mode.

### 7.3 GLOK = "no" — Consecutive Periods with Zero PerGL and Changing BegGL (Data Load Issue)

**How to identify:**
- Two or more consecutive GLOK = "no" rows for the same account
- Column H (PerGL) shows zero across those periods — no GL activity recorded
- Column G (BegGL) is changing from period to period despite the zero PerGL
- The pattern cannot be attributed to a specific unposted batch

**What happened:** RapidReconciler has loaded incomplete or inconsistent data from F0911. A correctly loaded dataset would either show zero PerGL with a stable BegGL (no transactions) or a non-zero PerGL explaining any change in the balance. When BegGL changes without any PerGL to account for it, the imported data is internally inconsistent — this is a data load problem within RapidReconciler, not a JD Edwards issue.

**Resolution:** This requires a RapidReconciler administrator to truncate and reimport the F0911 data:

1. Contact your RapidReconciler administrator or GSI support at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com).
2. The administrator must truncate the F0911 table in the RapidReconciler database to remove the inconsistent data.
3. Trigger a fresh JD Edwards data import using the **Import JDE** authorized function (Admin > Users > lock icon > Authorized Functions). This permission should only be assigned in consultation with GSI.
4. After the import completes, refresh the Roll Forward report and confirm that PerGL values are correctly populated and the consecutive GLOK = "no" pattern has resolved.

> **Do not attempt to correct individual account balances manually.** The entire F0911 dataset for the affected company must be reloaded. Individual corrections will not address the underlying data integrity problem.

### 7.4 VarOK = "no" With Large OOB

**How to identify:**
- VarOK = "no" in a closed historical period
- Column R (OOB) shows a significant non-zero amount in that same period
- F0902 and F0911 disagree for the affected account and period

> **Note:** OOB in the current (end) period is expected and does not trigger this pattern. Only investigate OOB when it appears in a closed historical period alongside a VarOK = "no" flag.

**What happened:** The account balance table (F0902) was not updated correctly — either a posting failed partway through, a year-end close left F0902 in an inconsistent state, or F0902 was modified directly.

**Resolution:**
1. Query F0902 and F0911 for the affected account and period to confirm the discrepancy.
2. Run R099102 in proof mode to identify the scope.
3. Run R099102 in final mode to regenerate F0902 from F0911.
4. Verify the OOB clears at the next RapidReconciler refresh.

### 7.5 VarOK = "no" After a RapidReconciler Reset

**How to identify:**
- BegVar jumps discontinuously from the prior period's Variance
- The following period's BegVar resets to zero
- The VarOK baseline timestamp in column T is close to the "no" periods

**What happened:** RapidReconciler was reset, which cleared the accumulated variance history. The reset period shows VarOK = "no" because BegVar was set to the current state rather than carrying forward from the prior period.

**Resolution:** No action required. Document the reset date for audit purposes. VarOK = "no" on reset-adjacent periods is expected and does not indicate a data error.

### 7.6 Persistent End of Day Balance

**How to identify:**
- End of Day (column O) is non-zero in the end period
- The same accounts show End of Day balances in multiple consecutive periods

**What happened:** Batch programs (R42800 for sales, R31802A for manufacturing) did not run or encountered errors, leaving cardex transactions unmatched by GL entries.

**Resolution:** Run the End of Day Analysis report to identify which transactions are pending and why the batch programs did not clear them.

### 7.7 Accounts with Persistent JE Balances

**How to identify:**
- Column Q (JEs) is consistently non-zero across multiple periods for the same account
- The JE amounts do not net to zero over time

**What happened:** Manual journal entries are being posted to inventory accounts without corresponding cardex records, creating a systematic one-sided balance.

**Resolution:** Use the Transaction Detail report to identify all GL-only entries on the affected account. Determine whether the entries are valid (intercompany allocations, legitimate adjustments) or erroneous (miscoded entries that should be on expense accounts). Post correcting journal entries for any erroneous amounts.

### 7.8 VarOK = "no" — Aged (More Than 3 Periods Old)

**How to identify:**
- VarOK = "no" rows exist in column T
- The period in column A for the "no" rows is more than 3 months before the current (end) period

**What happened:** The variance roll forward chain for the affected company has drifted too far from the current state to self-correct through normal remediation. Backdated transactions, repeated resets, or prolonged unresolved variances can push the roll forward chain into a state where incremental corrections are no longer practical.

**Resolution:** Use the **Reroll** function in RapidReconciler:

1. Navigate to **Admin > Companies** in the RapidReconciler main navigation panel. Administrator rights are required.
2. Locate the affected company in the Companies list.
3. Click the **Reroll** link in the far-right column of that company's row.
4. Confirm when prompted. Reroll recalculates the perpetual balance from the baseline date forward. Allow several minutes for the process to complete depending on data volume.
5. Refresh the Roll Forward report and confirm aged VarOK = "no" rows have resolved.

> **Reroll does not modify JD Edwards data.** It only recalculates RapidReconciler's internal perpetual balance history. If the same aged VarOK = "no" rows persist after a reroll, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com).

---

## Section 8: Step-by-Step Analysis Procedure

Use this procedure for every Roll Forward export:

**Step 1 — Note the Baseline Dates**

Identify the GLOK baseline period (earliest period in the dataset) and the VarOK baseline date (timestamp in column T of the baseline rows). These establish the reference points for all roll forward checks.

**Step 2 — Scan for GLOK = "no" Rows**

Filter column J for "no". For each occurrence:
- Check whether consecutive "no" rows exist for the same account with PerGL = 0 in column H but a changing BegGL in column G — if so, this is a data load issue requiring F0911 truncation and reimport (see Section 7.3)
- Otherwise, check the prior period's UnpostBatch (column K) and calculate the gap between BegGL(current) and EndGL(prior)
- If the gap matches the prior UnpostBatch → late-posting batch; post batches and GLOK self-corrects (Section 7.1)
- If the prior UnpostBatch was zero → F0902/F0911 misalignment; run R099102 (Section 7.2)

**Step 3 — Scan for VarOK = "no" Rows**

Filter column T for "no". For each occurrence:
- **First, check the period age:** if the "no" is more than 3 periods older than the current (end) period, use the Reroll function on the Companies page (Section 7.8 and Section 5.5)
- Otherwise: compare BegVar to prior period Variance; check OOB (column R) first — non-zero OOB is always the highest priority; check JEs (column Q) for unexpected manual entry activity; note whether GLOK is also "no" on the same row

**Step 4 — Review the End Period (GLOK = "end")**

All rows where GLOK = "end" represent the current state of the reconciliation. For each end-period row:
- Note any non-zero UnpostBatch — these will affect the next period's GLOK
- Note the Variance (column P) — the net reconciliation difference going into the next period
- Check for non-zero OOB, CardexVar, or End of Day

**Step 5 — Summarize by Variance Component**

Total the End of Day, JEs, OOB, and CardexVar columns across all end-period rows to understand the overall composition of the current variance:
- End of Day: normal in-flight activity; should clear with nightly batch runs
- JEs: investigate if large or growing
- OOB: expected and informational in the current (end) period; only investigate non-zero OOB in closed historical periods, and only if accompanied by a VarOK = "no" flag or a visible reconciliation break
- CardexVar: investigate via Cardex Variance report

**Step 6 — Assess Unposted Batch Exposure**

Sum the UnpostBatch column for all end-period rows. This total represents the amount of the current EndGL that is not yet in F0902. Accounts with large UnpostBatch values are at risk of generating GLOK = "no" in the next period.

**Step 7 — Document Findings**

Record findings on the Analysis sheet following the formatting rules in the shared formatting spec.

**Step 8 — Follow Up**

After corrections are made (batches posted, R099102 run, cardex variances resolved), confirm that:
- GLOK = "no" rows resolve to "yes" at the next refresh
- VarOK = "no" rows resolve to "yes" or are documented as reset artifacts
- OOB returns to zero
- End of Day clears

---

## Section 9: GL Batch Posting Reference

When GLOK = "no" is caused by a late-posting batch, the resolution path runs through the JD Edwards GL batch system. This section provides the reference needed to identify, approve, and post outstanding batches without leaving the Roll Forward guide.

### 9.1 Batch Processing Flow

Every GL transaction in JD Edwards is grouped into a batch before it updates account balances. A batch must pass through two sequential steps before F0902 is updated:

```
Transaction entered in JD Edwards
        ↓
Batch created in F0011 (Batch Control Records)
Batch status: Approved = blank, Posted = blank
        ↓
Manual or automatic approval
Batch status: Approved = A, Posted = blank
        ↓
Posting program runs (R09801)
        ↓
Post succeeds → F0902 updated
Batch status: Approved = A, Posted = D (Done)
        ↓
Post fails → Error written to F0011
Batch status: Approved = A, Posted = E (Error)
```

**Key tables:**

| Table | Description |
|---|---|
| **F0011** | Batch Control Records — one record per batch; holds approval status and posting status |
| **F0911** | Account Ledger — GL transaction detail; records exist here before and after posting |
| **F0902** | Account Balances — period-end balances; only updated when a batch posts in final mode |

### 9.2 Approval Status Codes

| Code | Status | Description | Action Required |
|---|---|---|---|
| *(blank)* | **Pending** | Batch created but not yet approved. Will not post. | Approve manually via P0011 or configure automatic approval in Company Constants (P0010). |
| **A** | **Approved** | Approved and eligible for posting. | None — ready to post. |
| **D** | **Approved (Auto)** | Approved automatically by system based on company constants. | None — ready to post. |
| **H** | **Hold** | On hold; will not post until released. | Investigate the hold. Release via P0011 once resolved. |
| **R** | **Rejected** | Submitted for approval but rejected. | Review rejection reason. Correct and resubmit. |

### 9.3 Posting Status Codes

| Code | Status | Description | Action Required |
|---|---|---|---|
| *(blank)* | **Unposted** | Not yet posted. May or may not be approved. | Approve if needed, then run R09801. |
| **D** | **Posted** | Fully posted. F0902 has been updated. | None. |
| **E** | **Error** | Posting program ran but failed. F0902 not updated. | Review the error in P0011. Resolve then repost. |
| **P** | **In Process** | Posting program currently running. | Wait for completion. Investigate if status does not change. |

### 9.4 Steps to Post Outstanding Batches

When the Roll Forward shows a non-zero UnpostBatch in column K:

1. Open **Batch Approval (P0011)** in JD Edwards.
2. Search for batches by company, account, or batch number.
3. For batches with Approval Status = blank (Pending): approve the batch.
4. Run **GL Posting (R09801)** to post all approved batches.
5. Confirm posting status shows **D** (Done) in P0011.
6. At the next RapidReconciler import, verify UnpostBatch clears to zero and GLOK returns to "yes" on the following period.

### 9.5 Common Batch Posting Errors

If a batch has Posting Status = **E** (Error), navigate to P0011 and review the error message before attempting to repost.

| Error | Cause | Resolution |
|---|---|---|
| **Invalid Object Account** | Account does not exist in F0901 or is marked non-posting | Add the account or correct the AAI pointing to it; change posting code to "Y" if needed |
| **Invalid Business Unit** | Business unit not in F0006 | Add or correct the business unit; update AAIs referencing it |
| **Amounts Out of Balance** | Debits ≠ credits in the batch | Run the batch proof report; add the missing offsetting entry or remove the orphaned line |
| **Invalid GL Date — Closed Period** | Batch date falls in a closed fiscal period | Re-open the period temporarily, post, then re-close; or change the GL date on the batch |
| **Locked Company** | Company is locked for posting | Confirm with finance team whether the lock is intentional; unlock in P0010 if authorized |

### 9.6 When to Run R099102 Instead of Posting Batches

R099102 (Account Balance Repost) regenerates F0902 from F0911 and is the correct resolution when **all batches are confirmed posted but GLOK is still "no"** — meaning F0902 and F0911 are out of sync for reasons other than an unposted batch.

**Do not run R099102 as a substitute for posting batches.** If UnpostBatch is non-zero, post the batches first. R099102 is only appropriate once all batches are confirmed at Posting Status = D.

**When to use R099102:**

- UnpostBatch = zero and GLOK is still "no"
- OOB (column R) is non-zero in a **closed historical period** and is accompanied by a VarOK = "no" flag or a visible reconciliation break — note that OOB in the current (end) period is expected and does not trigger R099102
- A year-end or period close left F0902 in an inconsistent state

**How to run R099102:**

1. Identify the affected company, fiscal year, and account numbers (use the LongAccount from the Roll Forward report).
2. Navigate to R099102 via the General Accounting reports menu or fast path.
3. Set data selection to the specific company, fiscal year, and account range.
4. Run in **proof mode** first — review which accounts and periods will be affected.
5. Run in **final mode** to regenerate F0902 from F0911.
6. Confirm account balances match F0911 totals after the run.
7. At the next RapidReconciler refresh, verify GLOK returns to "yes" and OOB returns to zero.

> **Caution:** R099102 replaces F0902 balances entirely for the selected accounts and periods. Use precise data selection to avoid unintended impact. Involve your JD Edwards administrator and finance team before running in final mode.

---

## Section 10: Period-End Requirements

Before closing a period using RapidReconciler:

- **UnpostBatch = $0** across all accounts for the period being closed — all approved batches must be posted before EndGL is finalized
- **End of Day = $0** across all accounts — all cardex transactions must have matching GL entries
- **GLOK = "yes"** for all accounts in the closing period (will show "end" in the report but should have been "yes" before it became the end period)
- **VarOK = "yes"** for all accounts — the variance must roll forward cleanly

> **Note on OOB at period-end:** A non-zero OOB in the current (end) period is expected during an open period and is not a blocking condition for period close. After the period closes, OOB should return to zero as F0902 is finalized from F0911 activity. If OOB persists in a closed historical period and is accompanied by a VarOK = "no" flag, run R099102 to resync the tables.

---

## Section 11: Related Documentation

- [GL Batch Analysis Guide](../MDS/gl-batch-analysis-guide.md)
- [End of Day Analysis Guide](../MDS/end-of-day-analysis-guide.md)
- [Transaction Detail Analysis Guide](../MDS/transaction-detail-analysis-guide.md)
- [Cardex Variance Analysis Guide](../MDS/cardex_variance.md)
- [Inventory: Using the Application](../MDS/inventory-using-application.md)

---

*For support, contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com)*
