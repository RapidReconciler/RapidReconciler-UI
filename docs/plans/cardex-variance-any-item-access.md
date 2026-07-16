# Cardex Variance for any item (UI-39)

**Status:** built, uncommitted, pending owner deploy + Services rebuild + live verification.
**Date:** 2026-07-16 (session #13).

## Why

An analyst working a reconciliation can find a discrepancy in JDE, come to
RapidReconciler, and see the item tie out — no cardex variance flagged. They
still need to align the item: set the RapidReconciler-side balance to what JDE
should show, which deliberately creates a variance that then rides the normal
worklist and clear/route flow.

The Cardex Variance page couldn't do this. Its whole dataset is the variance
worklist (`v6ui_itemrollintegritydialog`, which filters `WHERE reason <> ''`),
so a tied-out item is simply absent — deep-linking one landed on an empty page.
The access point is the **Full Perpetual Details** page (`inventory-asof.html`),
where the analyst is already looking at the item.

## Design (owner decisions locked 2026-07-16)

- **Any item, not just flagged ones.** Production path, no fallback — a
  dedicated by-item data path, not a handoff hack.
- **Align reuses the beginning-balance write.** No new write logic. Setting the
  balance on a tied item creates a variance; that is the point.
- **Verb: "Adjust balances," not "clear variance"** — fits both the worklist
  item and the tied-out item.
- **Access affordance:** a standalone icon next to the existing preview eye in
  the pinned action cell — not a toggleable data column (which would get
  reordered, hidden, and swept into the Excel export).

## What was built

**DB — `RapidReconciler-DB`**
- New proc `dbo.usp8_item_position(@companynumber, @itemnumber, @branchplant=null)`.
  Mirrors the data-row shape of `v6ui_itemrollintegritydialog` exactly (24
  columns incl. `ItemID`, `Currency`, `UnitCost`, `AmountOnHand`, `Threshold`),
  but drops the `reason <> ''` filter, adds the item filter, and uses
  `OUTER APPLY` on `rtransactions` so an item with no aged transactions still
  returns. Modeled into the `.sqlproj`; UTF-8 BOM + CRLF.
  *Casing follows the sibling view; DAC-13 will normalize the cluster.*

**Services — `RapidReconciler-Agent`**
- `ItemPositionRepository` calls the proc (branch passed as SQL `NULL` when
  blank). New endpoint `POST /inventory/as-of/item-position` on `AsOfController`,
  reusing the `AsOfDetailsRequest` bean, with the same JWT company-scope guard as
  `/inventory/as-of/details` and the same `{total, data, aggregates}` envelope as
  `/inventory/integrity`.

**UI — `RapidReconciler-AI/RRV8`**
- `inventory-asof.html`: standalone "Adjust balances" icon in the pinned
  `col-preview` cell (navy, distinct from the blue ledger-preview eye); click
  navigates to `inventory-cardex-variance.html?item&company&branch&from=perpetual`.
  Column widened to hold both icons; icons stay out of the column chooser and the
  export.
- `inventory-cardex-variance.html`:
  - `_offWorklistRows` holder, fetched on demand from the new endpoint when the
    focused item isn't on the worklist. Kept separate from `DATA` so it bypasses
    the near-zero "zombie" filter (a tied item is here on purpose).
  - `focusRows()` falls back to `_offWorklistRows`; `_focusIsOffWorklist()` drives
    the framing.
  - The action band no longer disables everything on a tied item opened this way;
    it keeps the Adjust path live with an "adjust balances / align to JDE" note.
  - `openAdjust()` finds the off-worklist row; the commit link relabels to
    "adjust balances" and `confirmAdjust()` branches to `_cxAlignBalances()`,
    which commits the **typed** beginning balance (no forced-zero, no cleared-store
    record, logged as an adjustment), then reloads so the freshly-created variance
    appears through the normal worklist path.
- `API.md`: endpoint documented.

## Open call for owner (surfaced, not guessed)

The existing single commit (`confirmAdjust`) force-zeros the variance to tie — a
no-op on a tied item. To make "align creates a variance" real, the off-worklist
commit was built to persist the typed balance instead. That is an interpretation
of "align does whatever it does now"; confirm the commit semantics on live review.

## Pending (owner's hands)

1. Deploy `usp8_item_position` to the demo DBs.
2. Rebuild Services to pick up the new endpoint (until then the page 404s
   gracefully — tied items show "No cardex variance on record").
3. Live-verify the full flow: perpetual grid → Adjust balances icon → cardex page
   focuses the item → enter a balance → commit → variance created → normal flow.

## Verification done pre-deploy

Both pages load clean in the browser (no JS/syntax errors), deep link is honored,
and the missing endpoint degrades gracefully. Full-flow verification waits on the
deploy + rebuild above.
