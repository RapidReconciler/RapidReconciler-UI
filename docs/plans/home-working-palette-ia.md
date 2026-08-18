# Home working-palette IA — Accountant + Analyst sub-views

**Status:** approved 2026-07-02; building the structure now. Detail-page polish
for the July 15 demo is low priority — get the structure in, then pivot hard to
standing up the 3 demo DBs.

> **pt.2 shipped-state reconciliation (2026-07-02, UI #308) — read this first.**
> The plan below is the original IA; several pieces evolved when they shipped.
> Where this note and the plan disagree, this note is current:
>
> - **Perpetual "At-a-Glance"** shipped as an **item-grain rollup** (lot detail
>   off), tightened columns, on-hand rounded, an **Amount total** row, a **25-bar
>   contributor strip**, plus **row search + column sort** (sort persists). A
>   **Full-details → Reports** link replaces an in-place expand.
> - **Residual Optimizer** shipped on **both** the Home Perpetual palette and the
>   Full Perpetual page: ✨ **AI cutoff** (natural break + refine), an
>   **Inventory / Filtered** view switch, a **± dial**, and **Excel export**
>   (Inventory + Filtered). The residual model is **unified to cumulative-smallest**
>   across both surfaces so the optimizer + dial behave identically.
> - **`inventory-asof.html` was NOT retired** (the plan's "Ports & retirements"
>   says to retire it). It was **reshaped into the "Full Perpetual Details" page**:
>   topbar / footer / report-buttons / amount-card / period-chart / contributors /
>   beige-residual-bar all removed → now just **AI band + Residual Optimizer + the
>   full grid**. Reached from **Reports → Accounting → Full Perpetual**.
> - **Reports hub** (new): two white-card columns **Analyst | Accounting**. Three
>   **Data Integrity** reports (UOM / Frozen Cost / GL-Class) list with **red/green
>   dots** (any flagged rows = red) + **direct Excel download** (`buildAuditWorkbook`).
>   Full Perpetual moved to the **Accounting** column.
> - **Analyst view** now matches the accountant shell: left rail retired, **top AI
>   band + OOB graph**, sub-nav **Workspace | Reports** (2 tabs, not the planned
>   3× Set Up / Data Integrity / Troubleshooting), and a **white-card grouped list**
>   (Set Up / Troubleshooting groups).
> - **Company what-if-exclude pill** (new): session-only, Home-wide, banner-backed
>   (e.g. excluding Co 00073 drops the book from −$32.3M to −$185K). The bottom
>   cluster is now **4 uniform pills: Database / View / Companies / Account**.
> - **Perpetual contributor bar-click drill** remains **deferred** (see the
>   "Deferred" section at the end — still tabled).
> - Fix: an Excel-export `_buildAuditSheet` name collision was resolved by renaming
>   the new one to `_buildStyledSheet`.

## Concept

`home.html` becomes the single working surface for both the **Accountant** and
**Analyst** views. Layout:

```
┌───────────────────────────────────────────────────────────────┐
│ TOP ROW (fixed in both views)                                    │
│   AI band (left ~1/3, bot-like)  |  Out-of-balance-by-period graph│
├───────────────────────────────────────────────────────────────┤
│ SUB-NAV tab strip  (sub-views for the current view)              │
├───────────────────────────────────────────────────────────────┤
│ WORKING PALETTE  (renders the active (view, sub-view) only)      │
└───────────────────────────────────────────────────────────────┘
```

- **Top-level view** (Accountant / Analyst / Admin) = the existing `data-view-role`
  on `<body>` + the "View:" chip. No change to that mechanism.
- **Sub-view** = new second axis. A tab strip under the fixed top row switches the
  palette within the current view.
- **One scope, one loader:** every palette reads the same live scope
  (company/period) and the same `_invRows` / per-DB loader. Palettes **lazy-render
  and lazy-fetch** — only the active palette builds its DOM and hits its endpoint.
  This is the whole point: no duplicate scope code, scoping bugs go away, and we
  retire standalone pages.

## View / sub-view map

### Accountant — 3 sub-views (the real build; demo hero)
A clean drill hierarchy **company → account → item**:

| Tab (L→R) | Grain | Source | Status |
|---|---|---|---|
| **Rec** | per **company** — GL vs perpetual net + variance components ("Where you stand" grid) | `_invRows` (`v6ui_raccountsummary`), summed to company | EXISTS |
| **Account** | per **account** — which GL accounts roll into each company's total | **same `_invRows`, un-rolled**: account rows grouped under a company subtotal that ties to the Rec company line | NEW — **no new data/endpoint** |
| **Perpetual** | per **item** — as-of item balances + Ask band + GL-class contributor | `usp6getasof_v2` (company+period scoped only) | PORT from `inventory-asof.html` |

- **Account view** answers Karen's "which accounts make up this balance?" It's
  the same grid shell (GL / Perpetual / Unposted / End of Day / Out of balance),
  rows = accounts (number + `AccountDescription`, e.g. "Raw Materials Inventory")
  grouped under company subtotals. The subtotal must equal the Rec company line —
  that visual tie-out is the transparency sell. Backed by the `RInvAccountList`
  fix (0 → 17 real accounts on Demo1, 2026-07-02).
- **Perpetual** is the heavier fetch (`usp6getasof_v2`, item grain, can only be
  narrowed by company+period — not object/BU/sub). Lazy-load on tab activation.

### Analyst — 3 sub-views (summary cards → existing pages; mostly cosmetic)
Workflow arc **configure → verify → fix**. Each sub-view is a small set of
summary cards that **deep-link to the pages that already exist** — no logic port.

| Tab | Contains (cards link out to) |
|---|---|
| **Set Up** | Model DMAAI + DMAAI Review → `accounting-dmaais.html` |
| **Data Integrity** | the As Of report pills → (from `inventory-asof.html`) |
| **Troubleshooting** | Transactions → `inventory-transactions.html`; Cardex Variance → cardex-variance page |

- Gated on the analyst role claim (`perms.dm`), same as the existing Analyst lane.

## State model

- `<body data-view-role="accountant|analyst|admin">` — unchanged (view).
- Add a sub-view axis, e.g. `data-subview` on the palette container (or a small
  `_subView` state per view, persisted in the scope key / localStorage so it
  survives a repaint + reload, like the existing scope state).
- **Sub-nav strip** under the top row: renders the current view's tabs, marks the
  active one, click → set sub-view → `renderWorkingPalette()`.
- `renderWorkingPalette()` shows the one matching palette `<section>` and hides the
  rest; builds DOM + fetches only for the active palette (guard with a
  `_built[subview]` flag so repaints don't refetch).
- Rides the existing repaint triggers (data load, DB / company / period / role
  switch) and self-gates by (role, sub-view) — same shape as
  `renderAccountantPanels()` today.

## Ports & retirements

- **Account palette** — new; a grouping variant over the existing Rec grid shell
  (`renderAcctSnapshot` already has the company-group `<tbody>` structure — add an
  account-detail rendering mode).
- **Perpetual palette** — port the as-of perpetual grid + horizontal "Ask about
  this inventory" band + GL-class contributor dimension out of
  `inventory-asof.html` into a home palette.
- **Data Integrity** — surface the 3 As Of report pills as analyst cards.
- **Retire `inventory-asof.html`** once Perpetual + Data Integrity are in — repoint
  the workbar "Perpetual" entry + any Home redirects (same play as the
  `inventory-reconciliation.html` retirement done 2026-07-02).
- **Stays standalone (linked from analyst cards, not folded in):**
  `inventory-transactions.html`, the cardex-variance page, `accounting-dmaais.html`.
- **`inventory-account-rollforward.html`** — distinct from Accountant "Account
  view" (roll-forward is multi-period Beg→End + GLOK/VarOK; Account view is the
  current-period per-account snapshot). It **stays standalone** (it's the
  rec-page retirement target + hosts the System Status diagnostic). Reconcile
  whether it becomes an analyst card or folds in **post-demo**.

## Build sequence (this morning → then demo DBs)

1. **Scaffold:** sub-nav tab strip + sub-view state + `renderWorkingPalette()`
   container; make the current Rec panel the `rec` palette.
2. **Account palette:** account-detail grouping over the Rec grid shell (no new
   data), company subtotals tie to Rec.
3. **Analyst palettes:** 3 sub-views × summary cards linking to existing pages
   (light/cosmetic).
4. **Perpetual palette:** port from `inventory-asof.html` (lazy fetch).
5. **Retire `inventory-asof.html`:** repoint nav; grep for stragglers.

Then **switch hard to the 3 demo DBs** (Demo1 fixed today; Demo2/Demo3 = TR/NA
sanitize + rename + reload per the NA/TR runbook). Detail-palette polish is
low-priority until the DBs are up.

## Deferred — Perpetual contributor bar drill (tabled 2026-07-02)

The Perpetual contributor strip (BU / Object / Subsidiary / Branch plant / GL
class) is now a **de-emphasized** supporting visual: compact bars (68px track),
top **25** by materiality (largest |$|), laid out in code order; per-bar $/count
labels only show at <=12 bars, otherwise hover carries the detail.

**Tabled interaction:** the bars are *not* clickable yet. First-instinct on a bar
chart is to click a bar, so plan a real **drill**, not the free-text row search:

- Click a bar -> set a `_perpContribFilter = { dim, value }` (e.g. Branch = "2")
  and filter the grid to rows where that dimension value matches. Distinct from
  `_perpSearchFilter` (which scans all columns as text and would over-match a
  short code like "2").
- Active bar gets a selected state; a clearable chip ("Branch 2 x") near the
  toolbar; re-click or chip-x clears. Composes with residual/search/view + the
  count line.
- The on-hand headline stays the full period total (a filter narrows the grid,
  not the scope) - same rule as row search.
- Open question for the owner: does a bar click filter **in place** on Home, or
  deep-link to the Full Perpetual page pre-filtered? Lean in-place (keeps the
  glance a glance); revisit at demo-polish time.
