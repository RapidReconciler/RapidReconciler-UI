# RapidReconciler Analysis Workbooks — Formatting Specification

This document defines the structure, layout, and visual conventions for analysis workbooks produced from RapidReconciler exports. It is the canonical reference for any new analysis or any update to an existing one.

The spec covers two analysis families:

- **Transactional** — a single primary variance with a single root cause. Used when the report's purpose is to explain *one* number.
- **Multi-Finding** — a catalog of distinct findings, each with its own scope and resolution path. Used when the report's purpose is to inventory issues across many records.

Each guide identifies which family it belongs to. The two families share most of the visual chrome (brand strip, headline, subline, caution note, footer, palette, page setup) and diverge in the body of the analysis sheet.

---

## Section 1: File Naming

Output files use a per-document pattern that identifies both the report type and the specific run:

```
{Report Name} Analysis for {key identifier}.xlsx
```

The `{key identifier}` is the smallest piece of information that uniquely distinguishes one analysis run from another, so users can keep multiple analyses side-by-side without overwriting. The exact format is specified per guide; common patterns are:

| Anchor type | Identifier format | Example pattern |
|---|---|---|
| Item-focused (transactional) | item ID + primary location | `… for {item} {branch}.xlsx` |
| Document-focused (transactional) | document ID + document type | `… for {doc} {DT}.xlsx` |
| Period-end (multi-finding) | period being closed | `… {YYYY-MM-DD}.xlsx` |
| Snapshot (multi-finding) | analysis date | `… {YYYY-MM-DD}.xlsx` |

If no single distinguishing field is available, fall back to the analysis date in `YYYY-MM-DD` form.

---

## Section 2: Workbook Structure

Every output workbook contains exactly two sheets:

| Tab Position | Sheet | Contents |
|---|---|---|
| **1 (left)** | **Analysis** | The card-based analysis. Sheet name: `Analysis`. Active sheet on open. |
| **2 (right)** | **Source** | The original export data, with permitted modifications described in Section 10. |

The Analysis sheet must be the leftmost tab and must be set as the active sheet so it displays when the workbook is opened.

**Default cell selection on both sheets must be A1.** When openpyxl saves a workbook it preserves whatever cell happened to be selected during construction, which produces inconsistent behavior — a workbook that opens with the cursor parked at K11 of the source sheet because that's where the build script last touched a cell. Set both sheets explicitly to A1 before saving:

```python
analysis_ws.sheet_view.selection[0].activeCell = "A1"
analysis_ws.sheet_view.selection[0].sqref = "A1"
source_ws.sheet_view.selection[0].activeCell = "A1"
source_ws.sheet_view.selection[0].sqref = "A1"
```

This is independent of the freeze panes setting on the source sheet — the freeze panes are at row 3, but the cursor still parks at A1 by default.

The source sheet must remain recognizable as the original export. Permitted modifications are limited to clarifying what is already there, not augmenting it:

- **Row highlights** matching priority colours (Section 10)
- **AutoFilter** on the header row
- **Freeze panes** so the header stays visible
- **Sorting** when the export's native order obscures the analysis (most exports require ascending chronological order on a date column)
- **Removing legacy explanatory blocks** ("HIGHLIGHT KEY" legends, color keys, summary blocks) that earlier output formats added below the data
- **Cleaning legacy per-cell text colours and fills** that earlier formats applied as a row-level highlight (this includes any pre-existing colours from a prior analysis pass)
- **Adjusting column widths** if the export ships with widths that clip data

Do not add columns, formulas, or comments to the source sheet beyond this list.

---

## Section 3: Choosing the Analysis Template

The first decision when generating an analysis is which of the two templates applies. The decision turns on the structure of the data, not the size of it.

| Template | Use when… |
|---|---|
| **Transactional (single-finding)** | The report explains one variance with one root cause. The reader's job is to understand *this* number. |
| **Multi-Finding** | The report enumerates distinct issues across many records. Each finding has its own scope and its own resolution. The reader's job is to triage *which* issues to work first. |

The Multi-Finding family covers two sub-cases that share the same layout:

- **Configuration snapshot** — the data is a static state (item setup, GL class assignment, frozen cost integrity). No period concept; no aggregate dollar variance.
- **Period transactional** — the data is per-account-per-period activity awaiting resolution before close. Has a period-end anchor and often a meaningful aggregate dollar variance.

Both sub-cases use the same Issue Summary + Finding cards + Action Plan structure. They differ only in their headline anchor (Section 4) and whether a dollar total appears in the subline.

---

## Section 4: Headline Anchor Rule

The headline carries the **operational anchor most useful to the reader** — the answer to "what is this analysis about?" in a single phrase. The choice depends on the report's purpose:

| Report family | Headline anchor | Example phrasing |
|---|---|---|
| Transactional, item-focused | Item ID and primary location | `Cardex Variance — Item {n}, Branch {b}` |
| Transactional, document-focused | Document ID | `Transaction Detail — Document {doc} ({DT})` |
| Multi-finding, period-end report | Period being closed | `End of Day Variance — Period Ending {YYYY-MM-DD}` |
| Multi-finding, configuration snapshot | Analysis date | `GL Class Integrity — {Month DD, YYYY}` |

The principle: the headline names what makes *this* run distinct from the next one. For a period-end report run on the same data twice, the period being closed is constant; for a configuration snapshot run on the same chart of accounts twice, the analysis date is what changes.

For period-end reports run against historical data, put the period in the headline and put the analysis date in the secondary context strip ("Generated {date} (against data through {period end})"). The headline is the operational anchor; the secondary context disambiguates *when* the analysis was run.

---

## Section 5: Layout — Common Elements

Every Analysis sheet starts with the same five rows of chrome before the body diverges by template. Throughout the spec, "merge A:E" means columns A through E of that row are merged into a single cell.

### 5.1 Brand Strip

Row 1 is a thin navy bar — pure visual signal that this is a RapidReconciler analysis.

| Property | Value |
|---|---|
| Fill | `1F3864` (navy) |
| Height | 6pt |
| Merge | A:E |

### 5.2 Headline

Row 2. The page's primary subject in noun-phrase form, per Section 4.

| Property | Value |
|---|---|
| Fill | `1F3864` (navy) |
| Font | Arial 20pt bold, white `FFFFFF` |
| Alignment | Left, indent 1, wrap text |
| Height | 38pt |
| Merge | A:E |

### 5.3 Subline

Row 3. A single sentence in plain English that gives the bottom-line answer the headline implies. The content depends on template:

- **Transactional**: the variance amount and the priority verdict (e.g., `$X variance · Priority N · {action label}`).
- **Multi-finding (with dollar variance)**: the aggregate dollar number and a count of findings (e.g., `$X net variance — N findings across M companies, K rows`).
- **Multi-finding (configuration, no dollar variance)**: a count summary (e.g., `K configuration findings across M companies — N type-A, P type-B`).
- **Multi-finding (positive primary check)**: state the positive answer first (e.g., `{Primary check} intact — 0 breaks across K rows · N secondary anomalies in {columns}`).

| Property | Value |
|---|---|
| Fill | `D6E4F0` (light blue) |
| Font | Arial 12pt bold, navy `1F3864` |
| Alignment | Left, indent 1, wrap text |
| Height | 24pt |
| Merge | A:E |

### 5.4 Secondary Context Strip

Row 4. Reference fields that contextualize the headline without crowding it: companies, batch types, periods, generation date, dataset boundaries. Format as a single line of label-value pairs separated by extra whitespace.

| Property | Value |
|---|---|
| Fill | `FFFFFF` (white) |
| Font | Arial 10pt, dark grey `404040` |
| Alignment | Left, indent 1, wrap text |
| Height | 18pt |
| Merge | A:E |

### 5.5 Spacer

Row 5. Empty row at 12pt height for visual separation before the body begins.

### 5.6 Caution Note (near the bottom of the sheet)

A wheat-coloured note positioned immediately above the footer. The wheat fill is intentionally outside the priority palette — it signals "be careful before acting" rather than indicating severity.

| Property | Value |
|---|---|
| Fill | `F5DEB3` (wheat) |
| Font | Arial 11pt italic, black |
| Alignment | Left, indent 1, wrap text, vertical center |
| Height | 70pt minimum (taller if content requires) |
| Merge | A:E |

The standard text is:

> ⚠ Before making any changes in JD Edwards: test all configuration changes in a non-production environment first. For any GL journal entry, review the Transactions page in RapidReconciler for the affected items to confirm exact amounts and accounts before posting.

Guides may extend the standard text with report-specific cautions (e.g., R099102 only in proof mode first; do not post period-close entries until variance is at expected levels). Keep extensions short.

### 5.7 Footer

Row immediately below the caution note, separated by a small spacer.

| Property | Value |
|---|---|
| Font | Arial 9pt italic, grey `808080` |
| Alignment | Left, indent 1 |
| Height | 18pt |
| Merge | A:E |

Standard text: `Analysis produced using the {Guide Name}  ·  RapidReconciler  ·  {analysis date}`.

---

## Section 6: Layout — Transactional Template

The body between the secondary context strip and the caution note has this structure:

1. **Variance card** — the primary number with priority colour, action label, and rationale
2. **Three sub-cards (WHAT / WHY / HOW)** — Pattern, Root Cause, Resolution
3. **Evidence list** — the source rows that support the analysis, with severity badges and source-sheet hyperlinks

### 6.1 Variance Card

The single most important visual element on the page. Renders the variance number in the priority colour matching the computed priority.

| Sub-element | Description |
|---|---|
| Priority strip | Top row of the card. Fill = priority colour (Section 9.2). Text = "Priority {N} — {action label}" (Section 9.1). 13pt bold. Height 28pt. Merge A:E. |
| Variance number | The dollar amount in the priority colour text. 24pt bold for a single value; 36pt bold if displayed alongside a quantity on a second line. Centered. Merge A:E. Height adapts to font size (typically 50-60pt). |
| Priority rationale | One sentence explaining why this priority was assigned (e.g., "62% of the cardex amount — investigate immediately"). 12pt italic, priority text colour. Merge A:E. Height 24pt. |

For dual-ratio reports, display both ratios in the rationale and identify which one governs (the larger of the two). See Section 9.3.

### 6.2 WHAT / WHY / HOW Sub-Cards

Three short cards immediately below the variance card. Card 1 (WHAT — Pattern) and card 3 (HOW — Resolution) use the navy header on a white body. Card 2 (WHY — Root Cause) uses the medium-blue header (`2E75B6`) on a grey body — the alternating header colour intentionally breaks the three cards apart visually.

| Card | Header text | Body content |
|---|---|---|
| Card 1 | `WHAT IS HAPPENING` | The Pattern from the guide — what the data is showing, in 1-3 sentences. |
| Card 2 | `WHY IT IS HAPPENING` | The Root Cause from the guide — the most likely explanation given the data pattern. Possible causes presented without claiming certainty. |
| Card 3 | `HOW TO RESOLVE` | The Resolution from the guide — numbered steps in execution order. Blank line between numbered steps. |

| Sub-element | Specification |
|---|---|
| Header row | 13pt bold white text on the card's header colour (navy or mid-blue per the table above). Merge A:E. Height 28pt. Indent 2. |
| Body row | 11pt black text on the card's body colour (white or `F2F2F2` grey). Merge A:D (not A:E — the narrower line length is more readable). Indent 2. Wrap text. Vertical alignment top. Height adaptive (Section 11). |

Use blank lines between numbered resolution steps in card 3 to keep the steps visually separated.

### 6.3 Evidence List

The source rows that support the analysis, presented as an indexed list with severity badges and source-sheet hyperlinks.

The Evidence list has a header row and one row per evidence item:

| Column | Width | Content |
|---|---|---|
| A | 24 | Reference label (e.g., `Anchor`, `Counterpart`) |
| B | 30 | Document or item identifier — hyperlinked to the corresponding source row |
| C | 38 | One-line description of why this row matters |
| D | 22 | Amount or quantity, right-aligned |
| E | 22 | Severity badge (Section 6.4) |

Each evidence row's first column is hyperlinked to the corresponding source-sheet row using the syntax `#'{SourceSheetName}'!A{rowNumber}`. The destination row on the source sheet must be highlighted with the matching priority colour so the user gets visual feedback when they click through.

Row heights are adaptive (Section 11).

### 6.4 Severity Badges (Transactional Only)

Evidence rows carry a severity badge in column E. The badge is filled in the priority colour and labelled by role:

| Badge | Fill / text | Meaning |
|---|---|---|
| Root cause (P1) | P1 colours | The row that caused the variance |
| Anchor (P2) | P2 colours | The primary subject row (the item or document being analyzed) |
| Related (P2) | P2 colours | A supporting row that helps the reader understand the pattern |
| Informational (P3) | P3 colours | A row mentioned for context but not requiring action |

Multi-finding reports do **not** use severity badges. They use priority badges in the Issue Summary table instead (Section 7.1).

---

## Section 7: Layout — Multi-Finding Template

The body between the secondary context strip and the caution note has this structure:

1. **Issue Summary table** — at-a-glance partition of the findings
2. **Finding cards** — one per finding, each with Scope / Pattern / Resolution
3. **Sub-tables under selected Finding cards** — the actionable subset of rows for that finding (when applicable)
4. **Action Plan** — recommended actions in execution order

### 7.1 Issue Summary Table

A compact table near the top of the analysis that lets the reader see all findings at a glance, sorted by priority.

| Column | Width | Content |
|---|---|---|
| A | 24 | Issue label — short noun phrase identifying the finding |
| B | 30 | Scope — companies, branches, types affected |
| C | 38 | Detail — distinguishing characteristics, biggest item, key counts |
| D | 22 | Rows count or amount, right-aligned |
| E | 22 | Priority badge (`P1`, `P2`, `P3`) filled in priority colour |

Sort the rows by priority ascending, then within the same priority by absolute amount or row count descending — whichever is more meaningful for that report.

The header row uses the `D6E4F0` light-blue fill with navy `1F3864` 11pt bold text. Data rows alternate white and `F2F2F2` grey. The priority badge cell takes its priority fill (Section 9.2). Row height is adaptive (Section 11) — the longest cell content drives the height.

### 7.2 Finding Cards

One card per finding. The card has a coloured header banner identifying the finding and three sub-fields (Scope, Pattern, Resolution).

| Sub-element | Specification |
|---|---|
| Title bar | 13pt bold, in priority text colour, on priority fill colour. Text: `FINDING {n} — {title}    [Priority {N}]`. Merge A:E. Indent 2. Height 28pt. |
| Scope row | "Scope" label in column A (11pt bold navy), body in B:E merged (11pt). What is covered: which companies, branches, accounts, items, periods, status combinations. White fill. Adaptive height. |
| Pattern row | "Pattern" label in column A, body in B:E. Why is this happening — the data signal explained, plus any sub-patterns within the finding worth flagging (without making them separate findings). Grey `F2F2F2` fill. Adaptive height. |
| Resolution row | "Resolution" label in column A, body in B:E. Numbered steps in execution order. Blank line between steps. White fill. Adaptive height. |

After the last sub-field row, emit a 10pt spacer row before the next element (sub-table or next finding).

**Sub-fields differ from the transactional WHAT/WHY/HOW cards:**

| Transactional | Multi-Finding | Why different |
|---|---|---|
| WHAT (Pattern) | Scope | Multi-finding catalogues distinct issues; Scope tells the reader which records are covered. |
| WHY (Root Cause) | Pattern | "Root Cause" implies certainty about a single explanation. In a configuration report Claude is cataloguing, not diagnosing — Pattern characterizes what the data shows without claiming to know why. |
| HOW (Resolution) | Resolution | Same. |

For configuration analyses in particular, **never use a "Root Cause" sub-field** — there is no way to determine root cause from a configuration snapshot. Use Pattern instead.

### 7.3 Sub-Tables Under Finding Cards

When a Finding's data has an actionable subset that's worth listing inline, emit a sub-table immediately below the Finding card. The sub-table shows the **rows that drive the next decision**, not the full data for the finding.

**When to emit a sub-table:**

| Finding has… | Sub-table approach |
|---|---|
| ≤30 rows total | Inline the full data — no need for filtering |
| A small ranked subset (e.g., top 10 by absolute variance, items with QOH > 0) | Inline the actionable subset; point to source AutoFilter for the rest |
| Many rows with no clean ranking criterion | No sub-table; point to source AutoFilter |

**Sub-table structure:**

- Optional caption row above the header, italic, 10pt navy, indent 1, describing what the sub-table contains and how it's filtered (e.g., "Top 10 by absolute variance (of N mismatch rows)")
- Header row: 10pt bold navy on `D6E4F0` light-blue fill; thin top and bottom borders
- Data rows: 10pt black, alternating white and `F2F2F2` grey
- First column is hyperlinked back to the source row via `#'{SourceSheetName}'!A{rowNumber}` — make the link text Arial 10pt, blue `0563C1`, underlined
- Row height is adaptive (Section 11) — long content like account-to-account formulas wraps, and the height must accommodate the wrap

After the last data row, emit a 10pt spacer row.

**Sort order for sub-tables:** by the report's natural reading key, not by magnitude. For most reports that means **Company → Account/Item → Period ascending** — the same order the source data is sorted in. Sorting by magnitude obscures the natural grouping that the source already establishes.

### 7.4 Action Plan

A numbered list of recommended actions in **execution order**, not priority order. The order encodes "do this first, then this, then this" — including dependencies (e.g., investigate the cluster first because the answer informs how to fix the individual rows).

| Column | Width | Content |
|---|---|---|
| A | 24 | Step number, centered, 11pt bold |
| B-D (merged) | combined | Action description, 11pt, wrap text, top-aligned, indent 1 |
| E | 22 | Owner / notes, 10pt, wrap text, top-aligned, indent 1 |

Header row: `#`, `Action`, `Owner / Notes` — navy 10pt bold on light-blue fill. Height 22pt.

Data rows alternate white and `F2F2F2` grey. Adaptive height.

The Action Plan should reference the Findings explicitly ("the N items in Co X (Finding 1)") so a reader who jumps to the Action Plan can navigate back. Include an explicit period-close gate as the final action when applicable: "do not post closing journal entries until {variance} is $0."

---

## Section 8: Floating Note Text Box (Right of the Analysis Content)

A text box positioned to the right of column E (anchored at column F, row 1) displaying a "what does this report check" briefing intended for readers unfamiliar with the report. The box has no border or fill — it sits as plain text alongside the analysis.

Required headings (in order):

1. **{Analysis name}** (16pt bold) — the analysis title
2. **What does this report check?** (13pt bold) — 2-3 sentences explaining the report's purpose
3. **Why does it matter?** (13pt bold) — what's at stake if the issues aren't resolved
4. **What does this workbook show?** (13pt bold) — the structure of the analysis sheet (Issue Summary, Findings, Action Plan)
5. **About this workbook** (13pt bold) — how to use the source sheet (AutoFilter, highlights, hyperlinks)

Body text is 12pt regular Arial. Use 8pt blank paragraphs between sections for spacing.

The text box covers approximately columns F through R, rows 1 through 30. Implementation requires direct XML post-processing — see Section 13.2.

---

## Section 9: Priority

### 9.1 Priority Levels

Three priority levels apply across all templates:

| Priority | Action label | Meaning |
|---|---|---|
| **P1** | investigate immediately | Won't self-resolve, blocks period close, or has a current GL impact |
| **P2** | review within 1 business day | Should be addressed but isn't urgent |
| **P3** | low priority — include in next backlog | Routine, will clear on the next normal processing cycle |

### 9.2 Priority Colours

Lighter fills with darker text for readability. Do not use saturated fills — they make the content hard to read at typical viewing distances and on projected displays.

| Priority | Fill | Text colour |
|---|---|---|
| **P1** | `FFE0E0` (light red) | `8B0000` (dark red) |
| **P2** | `FFF0DC` (light orange) | `6B3A00` (dark brown) |
| **P3** | `FEFBD8` (light yellow) | `4A3B00` (dark olive) |

These colours appear on:

- The variance card priority strip and rationale row (transactional)
- Issue Summary priority badges (multi-finding)
- Finding card title bars (multi-finding)
- Evidence severity badges (transactional)
- Source-sheet row highlights (Section 10)

### 9.3 Priority Assignment

Priority assignment falls into two patterns depending on what the data is.

**Ratio-based** (transactional reports with a clear primary variance):

```
ratio = |variance| / denominator
```

The denominator depends on the report and is defined in the guide. Common patterns:

- **Single-ratio** — `|variance| / max(|cardex_amt|, |ledger_amt|)`. Used when there is one variance value.
- **Dual-ratio** — `governing = max(qty_ratio, amt_ratio)` where each ratio is `|variance| / max(|cardex|, |ledger|)`. Used when the report has both quantity and amount variances; the larger ratio governs. Handles zero-cost items by deferring to whichever side has a meaningful denominator.

| Ratio | Priority |
|---|---|
| ≥ 50% | P1 |
| 10% – 49% | P2 |
| < 10% | P3 |

**Rule-based** (multi-finding reports where priority is a property of the finding type, not a computed ratio):

The rule is defined per guide. Common patterns:

- **By status combination** — particular status pairings map to particular priorities (e.g., a "stuck" status that requires manual intervention is P1; a status that just needs the next processing cycle to run is P3).
- **By age + status** — items in a normal status with recent dates are P3; older items at the same status are P2; items outside normal status range or older than the operational threshold are P1.
- **By issue severity** — categorical: a data integrity error that produces wrong-account postings is P1; a configuration mismatch that produces classification differences is P2; an informational mismatch is P3.

Each guide defines its own rule using one of these patterns. Compute priority **before** rendering any visual element that depends on it (variance card colour, Issue Summary badge, Finding header colour).

### 9.4 Priority on Reports with No Aggregate Variance

When the report has no single primary variance (most multi-finding configuration reports), the variance card from the transactional template is not used — its role is filled by the Issue Summary table. Each Issue Summary row carries its own priority badge derived from the rule for that finding type.

---

## Section 10: Source Sheet Handling

Three patterns apply, chosen by data scale and partition cleanliness:

| Pattern | When | What to apply |
|---|---|---|
| **A — No highlights** | Source has many rows (>~30) AND anomalies are diffuse across most rows | AutoFilter + freeze panes only. Reader filters to find issues. |
| **B — Highlight all rows by issue type** | Source is small (≤~30 rows) AND every row has a clean issue-type assignment | Every row gets a priority fill matching its issue type. Sheet reads like a colour-coded inventory. |
| **C — Highlight only anomalies** | Source has many rows but anomalies are a small subset (~5-15% of rows) | Apply priority fill only to the anomalous rows. Most rows stay clean; the highlighted rows stand out. |

Pattern A is the default for large datasets where most rows are part of normal data flow. Pattern B suits small configuration reports where every row carries an issue type that the reader needs to triage. Pattern C suits multi-period reports where the issues are isolated incidents inside a much larger time series.

**Always do these regardless of pattern:**

- AutoFilter on the header row: `auto_filter.ref = "A2:{LastCol}{LastRow}"`
- Freeze panes at A3 so the header stays visible

**Source sheet hygiene before applying highlights:**

The export may arrive with pre-existing colour fills from a prior analysis pass or from the original report's colour key. **Always clear all existing fills on the data rows before applying the new highlights.** Otherwise old colours bleed through wherever the new pattern doesn't paint.

```python
clear_fill = PatternFill(fill_type=None)
for r in range(3, src.max_row + 1):
    for c in range(1, src.max_column + 1):
        src.cell(row=r, column=c).fill = clear_fill
# Then apply the new highlights per the chosen pattern
```

Apply the same clearing to legacy text colours when the original export uses red/amber font colour as a row-level signal — see Section 13.4.

**Sorting the source sheet:** when the export's native order is descending or otherwise unhelpful for the analysis, sort ascending by the natural sequence key (transaction date, period end). Always sort *before* applying highlights and computing hyperlink references, then re-write everything against the sorted positions.

---

## Section 11: Adaptive Row Heights

Multiple elements need row heights that fit their content rather than a fixed value. Use a wrap-count formula that estimates how many lines the content will occupy at the column width, then sets the row height accordingly.

### 11.1 Where to Apply

| Element | Drivers of height |
|---|---|
| Issue Summary rows | The longest of the issue label / scope / detail cells |
| Finding card sub-fields (Scope, Pattern, Resolution) | The body text length and explicit newlines |
| Sub-table rows | The longest cell content across all columns |
| Action Plan rows | The action description length |
| Evidence list rows (transactional) | Description text length |
| Variance card body row | Adapts to font size of the variance number |
| WHAT / WHY / HOW card body rows | Body text length and explicit newlines |

Fixed heights are appropriate only for purely structural rows (brand strip, headline, spacer rows, section header rows) where the content is always the same length.

### 11.2 Formula

For a single-cell driver, count the wrap lines based on column width in characters and the explicit newlines:

```python
# For a cell in a column of approximate width `col_chars`
# given content `text`:
explicit_newlines = text.count("\n") + 1
wrap_lines = sum(
    max(1, len(line) // (col_chars - 2))
    for line in text.split("\n")
)
n_lines = max(explicit_newlines, wrap_lines)
row_height = max(min_height, line_height_pt * (n_lines + 1))
```

Reasonable values:

- `line_height_pt` = 14 for 10pt text, 16 for 11pt text
- `min_height` = 18pt for sub-table rows, 28pt for Issue Summary rows, 40pt for Pattern body, 50pt for Resolution body
- `col_chars` for the standard column widths: A=22, B=28, C=36, D=20, E=20

For a multi-cell driver (Issue Summary), compute n_lines for each cell and take the max:

```python
label_lines = max(1, len(label) // 22)
scope_lines = max(1, len(scope) // 28)
detail_lines = max(1, len(detail) // 36)
n_lines = max(label_lines, scope_lines, detail_lines, 2)
row_height = max(28, 16 * (n_lines + 1))
```

For sub-tables, compute the max wrap count across all columns of a row and use a single row height for that row:

```python
max_lines = 1
for col_idx, value in enumerate(row_values, start=1):
    col_letter = get_column_letter(col_idx)
    col_chars = COL_WIDTHS.get(col_letter, 22)
    wrap_lines = max(1, len(str(value)) // (col_chars - 2))
    max_lines = max(max_lines, wrap_lines)
row_height = max(18, 14 * (max_lines + 1))
```

### 11.3 Rule

Whenever an element holds variable-length content from the analysis, compute its height adaptively. Compute the height *after* the cell value is written and *before* moving to the next row.

---

## Section 12: Page Setup

Apply page setup to the Analysis sheet **before** the first `wb.save()` call (Section 13.1).

| Setting | Value |
|---|---|
| Print area | `A1:R{LastRow}` (covers the analysis content plus the floating text box on the right) |
| Orientation | Landscape |
| Paper size | Tabloid (`PAPERSIZE_TABLOID`) |
| Fit to page | Width 1, Height 0 (single page wide, multiple pages tall) |
| Horizontal centering | Enabled |
| Margins | 0.3" all sides |
| Grid lines | Disabled (`sheet_view.showGridLines = False`) |

Standard column widths:

| Column | Width (chars) |
|---|---|
| A | 24 |
| B | 30 |
| C | 38 |
| D | 22 |
| E | 22 |

---

## Section 13: Implementation Notes

### 13.1 Set Page Setup Before the First Save

Set `print_area`, `page_setup`, `page_margins`, `print_options`, and grid line visibility on the Analysis sheet **before** calling `wb.save()` for the first time. Re-opening a saved workbook to add page setup and re-saving causes openpyxl to drop cell styles (fills, fonts, borders), producing a workbook that opens with all formatting stripped.

### 13.2 Inject the Floating Text Box via Direct XML Post-Processing

openpyxl's text-box support is incomplete. Build the text box by:

1. Saving the workbook with openpyxl (no text box yet).
2. Opening the resulting `.xlsx` (a zip archive) and writing `xl/drawings/drawing1.xml` directly with the formatted paragraphs.
3. Adding a relationship in `xl/worksheets/_rels/sheet1.xml.rels` of type `…/relationships/drawing` pointing to `../drawings/drawing1.xml`.
4. Adding a `<drawing xmlns:r="…/relationships" r:id="{rId}"/>` element inside `xl/worksheets/sheet1.xml` immediately before `</worksheet>`. The `xmlns:r` declaration must be on the `<drawing>` tag itself if the worksheet root does not already declare it; otherwise the workbook fails XML parsing.
5. Adding an `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` to `[Content_Types].xml` if not already present.

### 13.3 Highlight Source Rows to Match Hyperlinks

For every sub-table row (or transactional Evidence row) that links to a source-sheet row, apply the matching priority fill across all columns of that source-sheet row. The visual feedback when the user clicks the link and lands on a coloured row is essential — an unhighlighted destination row breaks the workflow.

### 13.4 Source Sheet Sorting and Style Cleanup

When sorting the source sheet, do these in order:

1. Capture the data rows (typically rows 3 to N) as a list of value tuples.
2. Sort the list by the sequence key column.
3. Write the sorted values back to the same row range.
4. **Clear legacy text colours and fills on the data rows.** Many exports apply per-cell text colour (red, amber) as a row-level highlight rather than using fills. Sorting moves the *values* but not the *styles*, so old colours stay attached to their original physical positions and end up colouring the wrong rows. Reset every data cell's font colour to black and fill to none after sorting, then apply the new priority highlights.
5. Recompute all hyperlink references against the sorted positions before writing them.

If the export was not sorted (the analysis is using the native order), still clear pre-existing fills before applying highlights — see Section 10.

### 13.5 Compute Priority Before Rendering Priority-Coloured Elements

Compute the priority assignment (Section 9.3) before rendering any element whose colour or label depends on it. For the transactional template, this means computing priority before writing the variance card. For the multi-finding template, this means computing each finding's priority before writing the Issue Summary row and the Finding card title bar.

### 13.6 Adaptive Row Heights — When to Compute

Compute the adaptive row height *after* the cell value is written but *before* moving on to the next row. For sub-tables specifically, compute the maximum wrap count across all columns before setting the row height — a single column with long content drives the whole row.

### 13.7 Hyperlink Format

Source-sheet hyperlinks use the syntax `#'{SourceSheetName}'!A{rowNumber}` where the sheet name is wrapped in single quotes. The hyperlink target is set on the cell directly, and the cell's font is changed to blue `0563C1` 10pt with underline to make it look like a link.

### 13.8 Reset Cell Selection on Both Sheets Before Saving

openpyxl preserves whichever cell was last referenced during construction as the saved selection. If the build script touches a cell at `K11` to apply a fill, that ends up being the saved cursor position when the workbook is reopened — even though the user expects the cursor at A1. Reset the selection explicitly on both sheets right before the first `wb.save()`:

```python
for ws in (analysis_ws, source_ws):
    ws.sheet_view.selection[0].activeCell = "A1"
    ws.sheet_view.selection[0].sqref = "A1"
```

Do this after page setup is configured (Section 13.1) and before the first save. The Analysis sheet must additionally have `tab_selected=True` so it is the active tab on open; the source sheet should not.

---

## Section 14: Floating Text Box Content Template

Use this template for the right-hand text box. Replace `{Analysis name}` and the description text. Keep the four standard sub-headings unchanged.

```
{Analysis name}

What does this report check?
[2-3 sentences explaining the report's purpose: which JDE tables it
compares, what kind of issue it surfaces.]

Why does it matter?
[2-3 sentences on operational impact: what breaks if these issues
aren't resolved, what depends on this being clean before close.]

What does this workbook show?
[1-2 sentences naming the structural elements: Issue Summary,
Finding cards, Action Plan, sub-tables.]

About this workbook
[1-2 sentences telling the reader how to use the source sheet:
which AutoFilter columns to use, what the row highlights mean, that
sub-table links jump to source rows.]
```

Each sub-heading is a single line at 13pt bold; body text is 12pt regular Arial. Use 8pt blank paragraphs between sections.

---

## Section 15: What's Out of Scope

This spec defines structure and presentation. It does not define:

- The analytical content (which findings to surface, how to interpret a particular variance) — that belongs to each guide
- The priority rule for a specific report (each guide states its own rule, conforming to the patterns in Section 9.3)
- Whether a report uses the transactional or multi-finding template (each guide declares this)

When in doubt about a structural choice, follow the rule that produces the same answer regardless of which guide is asking. When in doubt about an analytical choice, defer to the guide.
