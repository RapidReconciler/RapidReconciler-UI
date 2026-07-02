# Home working-palette IA — Accountant + Analyst sub-views

**Status:** approved 2026-07-02; building the structure now. Detail-page polish
for the July 15 demo is low priority — get the structure in, then pivot hard to
standing up the 3 demo DBs.

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
