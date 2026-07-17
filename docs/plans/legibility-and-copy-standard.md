# Legibility & copy standard (UI-41 / UI-43)

**Date:** 2026-07-16. Measured, not guessed — a browser sweep of computed
font-sizes across the tour surfaces at `:8765`, checked against the floor already
on record.

## The floor

Reading text — prose, hints, empty states, status lines, subtext — renders at
**≥ 13.5px** ([[feedback_ui_bullets_and_readable]]). This pass measured against
that floor rather than restyling by taste.

Deliberately **not** governed by the floor:

- **Uppercase micro-labels** (scope-band keys, tier pills). The standard there is
  12.5px ([[project_scope_band_standard]]) — left as-is.
- **Presentation-scale** (enlarging type for remote Teams). That's a demo-bundle
  layer, not a production change. Out of scope for the product pass.

## Method

Per page: walk visible elements whose direct text is ≥ 4 words and mixed-case
(which excludes labels), compute font-size, flag anything under 13.5px, bucket by
selector. Repeatable — the sweep is a short DOM walk.

## Finding

The type scale is **largely compliant already**. The "legibility defect" is a
small, targeted set, not a rewrite. Full catalog:

| Page | Selector | Was | Action |
|---|---|---|---|
| cardex-variance | `.empty` (empty state) | ~12.5 (inherited) | → 13.5 ✅ fixed |
| cardex-variance | `.ledger-empty` (empty state) | 13 | → 13.5 ✅ fixed |
| transactions | `.tx-findings-sub` (subtext) | 12.5 | → 13.5 ✅ fixed |
| transactions | `.tx-findings-status` (status line) | 12.5 | → 13.5 ✅ fixed |
| cardex-variance | `.ledger-head .hint` (in a header row) | 12 | → 13.5 ✅ fixed (s#15) |
| home | `.cx-fw-headline .acct-snap-period` (under a headline) | 12.5 | → 13.5 ✅ fixed (s#15) |
| home | `.cx-container-total` (dense card metadata) | 12 | → 13.5 ✅ fixed (s#15) |
| home | `.cxh-sub2` (card sub-subhead) | 12 | → 13.5 ✅ fixed (s#15) |
| transactions | `.tx-work-panel-apply` (button label) | 13 | → 13.5 ✅ fixed (s#15) |
| transactions | `.tx-work-panel-grid-link` (link label) | 12 | → 13.5 ✅ fixed (s#15) |

**Fixed** = at the floor; verified live — no reflow, no horizontal overflow,
console clean. The six header / dense-card / control cases were the deferred set;
in session #15 the owner gave the go-ahead to take them to the floor and eyeball
alignment during the demo build, so they're now fixed too. If any header or dense
card reads crowded at 13.5px on his screen, the fix is a layout tweak (gap /
line-height), not dropping back below the floor.

## Copy

- `inventory-asof.html` and `inventory-transactions.html` `<title>` read
  "RapidReconciler **Mockup**" — fixed to "&mdash; RapidReconciler" (matches
  `home` / `cardex-variance`). The browser tab no longer says *Mockup* mid-demo.
- Their source comment banners "MOCKUP: Inventory > …" → "RRV8: Inventory > …",
  the convention every other RRV8 page already uses.

## Deferred / attended

- ~~The six deferred legibility cases above~~ — done in session #15 (see the table).
- **Bullets-over-paragraphs + reduce-clicks-to-value** — not a floor question; a
  content/IA judgment per surface. Not attempted here.
- **Title-suffix consistency** — "&mdash; RapidReconciler" vs "&mdash;
  RapidReconciler V8" varies across pages; standardize in the attended copy pass.
