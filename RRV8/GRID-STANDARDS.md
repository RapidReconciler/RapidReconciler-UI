# RRV8 &mdash; Grid standards

Living spec for the conventions every V8 grid follows. The first
implementation reference is the Transactions Details grid in
[`inventory-transactions.html`](inventory-transactions.html); other
pages should mirror these conventions verbatim until we have a
shared lib.

This doc is intentionally short. Each convention has a behavioral
rule + the CSS / state hook a future page can copy. When a new
convention earns its place, add it here and apply it to existing
grids in the next commit so the codebase stays consistent.

---

## 1. Header layout

```
+------------------------------------------------------------------+
| Title    [left-cluster controls]            [grid-state cluster] |
+------------------------------------------------------------------+
```

- **Title** sits on the left.
- **Left-cluster controls** (page-specific filters, action buttons,
  state pills like the DMAAI preload indicator) flow naturally after
  the title.
- **Grid-state cluster** is pinned to the far right and contains
  three pills, in this order:
  1. **Excel pill** &mdash; one-click export of the analyst&rsquo;s
     current view (filters + visible columns + drag order).
  2. **Columns pill** &mdash; opens the column chooser popover.
  3. **Row count pill** &mdash; the rightmost element on the page;
     shows `N rows` / `N rows of M` / `Loading…`.

CSS hook: wrap the pills in `<div class="grid-state-cluster">`.
That class applies `margin-left:auto` so the cluster floats to the
right edge regardless of how many controls are to its left.

**Don&rsquo;t** put an Excel button anywhere else on the page (the
page-level `.page-actions` slot is reserved for things that act on
the whole module, not on a single grid). Co-locating export with
the grid header keeps the affordance discoverable and unambiguous
about what data the export covers.

## 2. Pill style

Both grid-state pills share the `.grid-pill` base class so they read
as a matched pair.

- `.grid-pill` &mdash; canonical look: 100px radius, 1px border,
  Source Sans 3 700/12.5px, 5px/10px padding.
- `.grid-pill-export` &mdash; modifier on the Excel export button.
  Standard hover affordance (no special state).
- `.grid-pill-cols` &mdash; modifier on the column chooser button.
  Add `.is-narrowed` when not all columns are visible (amber tint).
- `.grid-pill-count` &mdash; modifier on the row-count span.
  Add `.is-loading` while data is loading (muted italic).

Other pills in the header (filter pills, action buttons) intentionally
use their own classes so the grid-state cluster reads as a distinct
trio. Don&rsquo;t spread `.grid-pill` to unrelated controls.

## 3. Row count text

- Default state: `<N> rows` (formatted with `toLocaleString`).
- Filtered subset of a larger set: `<N> rows of <M>` (`M` is the
  agent&rsquo;s `total`).
- During async load: `Loading…` with `.is-loading` class.
- Pluralization: always plural (`rows`) for now; revisit if a grid
  legitimately bottoms out at 1.

## 4. Excel export

The Excel pill (leftmost in the grid-state cluster) is a one-click
**direct download** of the analyst&rsquo;s current view. Not routed
through the analyzer &mdash; this is a "give me what I see" dump,
not a diagnostic.

The exported workbook respects:
- **Filters** &mdash; only rows currently visible (worked filter,
  active type, chip exclusions) make it into the file.
- **Column visibility** &mdash; only columns the analyst has on.
- **Column order** &mdash; the analyst&rsquo;s drag-to-reorder
  layout is preserved in the .xlsx.

Layout convention:
- Row 1: `<Grid Title> Generated <weekday, full date, time>` &mdash;
  banner merged across all visible columns.
- Row 2: header row (column labels in display order).
- Row 3: **Grand Summaries** &mdash; label in the leftmost
  non-money column, totals in the money columns (Cardex / Ledger /
  Variance). Skip the row entirely if no money columns are visible.
- Row 4+: data rows.

Cell formats:
- Money columns: `$#,##0.00;[Red]($#,##0.00);-` (negatives in red
  parens, zero collapses to `-`).
- Integer-identifier columns (Doc, OrderNumber, Batch, GLXref,
  etc.): plain integers, 0 collapses to blank so empty-looking
  cells stay empty in Excel.
- Worked column: `Yes` / `No` (string), not the checkmark icon.

Filename: `<GridName>_<period>_<YYYYMMDDTHH>.xlsx` &mdash; period
when the grid is period-scoped, dropped otherwise. The legacy SPA
used a similar pattern; staying close keeps muscle memory.

Implementation hook: `exportGridToExcel()` on the page&rsquo;s IIFE.
Wired to a `click` listener on `#grid-export-btn`. Uses SheetJS
(`XLSX.utils.aoa_to_sheet` + `XLSX.writeFile`).

Do NOT route grid exports through the headless analyzer pipeline.
The analyzer is for diagnostic templates (Transaction Detail,
System Status, etc.); a grid dump has no matching template and
opening one in the analyzer would just return the same workbook
with a 404 / detect-failed banner.

## 5. Column visibility

- Default: every column visible. Treat the chooser as
  &ldquo;hide what you don&rsquo;t need&rdquo;, not &ldquo;reveal
  hidden columns&rdquo;.
- Click the Columns pill &rarr; popover with one checkbox per column.
- Popover header has two actions:
  - **Show all** &mdash; turn every column on (visibility only;
    leaves order alone).
  - **Reset to defaults** &mdash; restore each column&rsquo;s
    `defaultOn` AND restore canonical column order. &ldquo;Reset&rdquo;
    means &ldquo;put the grid back the way it shipped.&rdquo;
- Toggle a checkbox &rarr; immediate re-render.
- The chooser lists columns in **current display order** so what the
  analyst sees in the popover matches what they see in the grid.

State + persistence:
- `_state.colVisibility` &mdash; `{colKey: bool}`.
- Saved to `localStorage` under `rrv8-<page>-columns-v1`.
- `loadColVisibility` is forward-compatible: unknown keys in saved
  state are dropped; new columns inherit `defaultOn`.

## 6. Column order (drag-to-reorder)

- Every column header is `draggable="true"` (except the col-export
  action column, which stays pinned at the leftmost position).
- Drag a header onto another &rarr; the dragged column is inserted
  AT the target&rsquo;s position; target + everything to its right
  slides one step right.
- Visual feedback:
  - `is-dragging` &mdash; the column being dragged (opacity 0.35).
  - `is-drag-over` &mdash; the drop target (3px blue insertion bar
    on the left edge).
- The change persists immediately to `localStorage` under
  `rrv8-<page>-col-order-v1`.

State + persistence:
- `_state.colOrder` &mdash; ordered array of column keys.
- `loadColOrder` is forward-compatible: unknown keys dropped, new
  columns appended at the end.
- `visibleColumns()` walks `_state.colOrder`, maps to column
  definitions via `COLUMNS_BY_KEY`, and filters by visibility.

Implementation hook: `wireColumnDrag()` attaches delegated
`dragstart` / `dragover` / `dragleave` / `drop` / `dragend`
listeners to the `<tr>` of the table header. Listeners stay
attached through every header re-render because they live on the
parent. Call it ONCE at page boot after the first
`renderTableHeader()`.

## 7. State key naming

For per-page persistence, use the pattern `rrv8-<page>-<feature>-v1`:

- `rrv8-tx-columns-v1` &mdash; Transactions, visibility
- `rrv8-tx-col-order-v1` &mdash; Transactions, drag order
- (future) `rrv8-recon-columns-v1` &mdash; Reconciliation, visibility

The `-v1` suffix lets us migrate the schema later by bumping to
`-v2` and translating in `loadX`.

---

## Pages applying this standard

| Page | Header layout | `.grid-pill` cluster | Drag-to-reorder | Notes |
|---|---|---|---|---|
| `inventory-transactions.html` (Details grid) | ✓ | ✓ | ✓ | Reference implementation |
| `inventory-reconciliation.html` (variance Preview tables) | &mdash; | &mdash; | &mdash; | Different surface (modal); revisit when modal grids get standardized |

## Conventions we&rsquo;ve NOT yet decided

Leaving as open questions; pick the answer when the first page
needs it:

- **Sortable columns**: click header to sort ascending / descending /
  unsorted (3-state). Visual indicator (caret) on the active column.
- **Column resize**: drag the right edge of a column to widen /
  narrow. Persist per-column width.
- **Sticky header**: thead pins to the top of the scroll container
  on long lists. Transactions already does this.
- **Row hover/select**: hover highlights; click selects (with
  shift-click for range, ctrl/cmd-click for toggle). Transactions
  already does selection.
- **Empty / error states**: Transactions uses `.details-empty` for
  &ldquo;No transactions match&hellip;&rdquo;. Standardize the spinner
  and error-toast wording.
- **Export icons** on action columns: leftmost-col-export model
  (Transactions) vs. action-column-on-the-right.
- **Inline cell editing**: Transactions has the batch-edit modal
  for Worked + Note. We could allow inline edits on the Note column
  directly &mdash; not yet specced.

When you add one, document it here + apply it to existing grids in
the same commit so they stay consistent.
