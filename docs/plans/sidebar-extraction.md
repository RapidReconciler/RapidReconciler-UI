# Extract the V8 sidebar into a shared component

The sidebar (filters + nav + status panel) is currently inlined into
every V8 main page &mdash; `inventory-reconciliation.html`,
`inventory-transactions.html`, `accounting-dmaais.html`, and any
future page. The DMAAIs build made the cost visible: a single new
Accounting nav block touched three files identically.

This is a focused refactor PR. Worth doing standalone so the diff
is bisectable.

---

## Pattern to copy

`Tools/doc-chrome.js` already does this for the customer-facing doc
pages. The shape:

- One `.js` file renders the chrome (sidebar in this case).
- Each consuming page drops a placeholder element + a `<script>`.
- A data attribute on `<body>` tells the script which page is
  active so it can mark the right nav child.

## Target file layout

- **`RRV8/sidebar.js`** &mdash; renders the full sidebar markup
  (filters + nav + status panel) into the placeholder, wires the
  popover handlers, hydrates the validation + System Status lights
  from the shared `sessionStorage` cache.
- **`RRV8/sidebar.css`** &mdash; sidebar styles, lifted out of each
  page&rsquo;s inline `<style>` block.
- Each page becomes:
  ```html
  <link rel="stylesheet" href="sidebar.css">
  <aside id="sidebar" class="sidebar"></aside>
  <script src="sidebar.js" defer></script>
  ```
  with `<body data-page="transactions">` (or `accounting-dmaais`,
  `reconciliation`, ...).

## State that needs to leave the IIFEs

Per-page IIFEs currently own `_glSelected` (the sidebar filter
selections). Filter popovers mutate this, and `loadData()` reads it
to build the `reconciliationFilter` body for the bulk fetch.

After the extraction:
- `window.RR_SIDEBAR_STATE = { glSelected: { currencies: Set, ... } }`.
- The sidebar.js popovers mutate `RR_SIDEBAR_STATE.glSelected`.
- Each page&rsquo;s `loadData()` reads from `RR_SIDEBAR_STATE.glSelected`
  instead of a local `_glSelected`.
- A `CustomEvent('rrv8-sidebar-filter-changed')` fires on `window`
  when selections change so the page can react (re-fetch).

The validation + System Status lights already read from the shared
`sessionStorage` cache, so no state-extraction work there &mdash;
the markup just moves.

## Edges to verify after extraction

- Sidebar **pin** state (`rrv8-sidebar-pinned-v1` localStorage):
  must hydrate before paint to avoid a flash. The IIFE block does
  this today &mdash; needs to land in `sidebar.js` at module top
  (no DOMContentLoaded wait).
- **Popover positioning**: popovers position relative to the
  filter row that opened them. They&rsquo;re currently appended to
  `<body>` (so they can escape sidebar `overflow:hidden`). Keep
  that behavior.
- **Active state**: `data-page` on `<body>` is the source of truth.
  Sidebar.js sets `.is-active` on the matching child + the parent
  `.sidebar-nav-item` (so the parent module also lights up). If
  no match, no `.is-active` is set (the page is one we haven&rsquo;t
  built yet).
- **System Status drawer**: today the click handler lives in each
  page&rsquo;s IIFE (because it triggers `runSystemStatusAnalyzer`
  which needs the page-level analyzer pipeline). After the
  extraction, sidebar.js fires `CustomEvent('rrv8-status-clicked')`
  on `window` and the page IIFE catches it. Keeps the analyzer
  pipeline page-scoped while letting the sidebar trigger it.

## Pages to update

- `inventory-reconciliation.html`
- `inventory-transactions.html`
- `accounting-dmaais.html`
- (any future V8 main page)

Each loses:
- ~150 lines of sidebar HTML markup
- ~500 lines of sidebar CSS
- ~300 lines of sidebar wiring JS (popover handlers, filter clicks,
  status-light driver)

## Order of operations

1. Build `sidebar.js` + `sidebar.css` as a new pair. Leave existing
   pages untouched.
2. Smoke-test on a single page (Reconciliation) by swapping its
   inline sidebar for the placeholder. Verify filters, popovers,
   nav active state, pin, status lights all still work.
3. Repeat the swap on Transactions and DMAAIs.
4. Final pass: delete the now-dead sidebar code from each IIFE
   (filter popover state, click handlers, status-light driver).

## Out of scope

- Topbar (also duplicated, but smaller and different layout per
  page in places). Could follow the same pattern in a third refactor
  if it earns it.
- The page-header chrome (title + breadcrumb + period pill +
  page-actions). Already standardized per the V8 page-header
  convention; sharing the structure across pages would be a
  third pattern.

## Decision history

- 2026-05-22 session, just after the DMAAIs page added an Accounting
  nav block in three files. Owner asked &ldquo;why is the navigation
  bar a different object on each page&rdquo; &mdash; agreed this is
  a real tech-debt smell and queued it for after the DMAAIs PR
  ships, so the extraction lands as a focused diff a reviewer can
  evaluate independently.
