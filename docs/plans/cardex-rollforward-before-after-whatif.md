# Cardex roll-forward — side-by-side before/after what-if

**Status:** BUILT 2026-07-15 (uncommitted, attended) — awaiting owner live verify
at `:8765` Demo1/SI-444095. Gated on the Services rebuild (the roll-forward view
fetch 403s until then, so both grids stay empty). Open layout question: the Adjust
modal covers the panel while dialing — see "Known layout gap" below.

Implemented in `RRV8/inventory-cardex-variance.html`: two-grid split (`cxvRollDetail`
→ `.cxv-roll-split` with left `cxvRoll*` + right `cxvRollAfter*`); `_cxWhatIf` /
`renderRollAfter` re-derive per the rule; wired to `_cxDraftSync` (open),
`adjPresets` click, `adjQty/adjAmt` input, `closeAdjust` (clear). Fork-B only
(the after grid is driven solely through the Adjust path).

**Layout — RESOLVED 2026-07-15:** the Adjust modal was converted to an inline
reflow panel (`#cxvAdjustPanel`, opens on the row below the fork cards). No overlay
covers the grids anymore. `.ov`/`.card` CSS left as dead rules.

**Math GROUNDED in the sproc (`usp8_maint_set_beginning_balance`, read 2026-07-15) —
the two-roll before/after DOES work; my earlier "roll doesn't move" call was wrong.**
The adjustment shifts `rinvasof` (bl=1 → target, then rolls forward) by the baseline
delta `dQ`/`dA`; it shifts `rperpetualinv.baselineqoh/aoh` by the SAME delta (the
lockstep the comment calls out) and recomputes `estunits = estunits_old + dQ`. Since
the DISPLAYED variance = on-hand − cardex = −estunits, **displayed variance moves by
−dQ.** So the whole roll shifts uniformly by the baseline delta, and the before/after
is a real, visible change (Clear on SI-444095: `dQ = −3,000`, roll ends 279,569 →
276,569, variance → 0).

**Design SETTLED (owner 2026-07-15): presets retired, four linked fields.** Clear /
Manual / Zero buttons removed. The panel now has four number fields in two columns —
**Beginning balance (qty, amt)** and **Variance to cardex (qty, amt)**. Within a
dimension the two are one lever (baseline ↔ variance, sign per the sproc: `variance =
varCur − (blNew − blCur)`); qty and amt are independent (amount is never derived from
qty). Type whichever you verified in JDE; the other follows and the after-grid
re-derives live. Set variance to 0 to sync. Commit sends the absolute beginning
balance with server preset `manual` (the sproc uses the explicit target). "Clear to
JDE" is now just "type 0 in the variance fields."

**Home reflection = SEPARATE cleared list (owner 2026-07-15):** Approve writes a
per-DB localStorage signal (`rrv8.cardex.cleared.v1.<db>`, keyed co|item|branch, with a
row snapshot). Home's Cost Variance Framework (`renderCardexCards`) EXCLUDES cleared
items from the active cards entirely (skipped in bucketing → out of the totals + drawer)
and lists them in a separate collapsed **"Cleared · N"** section below (newest-first,
per company). NOT tinted-in-place — the owner's call, so cleared items don't pile up in
the active worklist over time. ⚠ localStorage builds up; a collapsed list contains it,
but consider a prune/cap later. Reflects on Home's next load (not live cross-tab).

**Two-button close-out (owner 2026-07-15, revised):** **Clear variance** (moved to the
Adjust panel header, top-right) zeroes the focused item's variance — optimistic client
zero (KPIs + Item Position read 0 immediately, no dependence on the endpoint) + a
best-effort `set-beginning-balance` POST to persist rperpetualinv. **Approved** (replaces
the Item Position "Export to Excel" button) does the behind-the-scenes close-out:
`logActivity` (Audit Center) + close the panel/roll cards. Cancel removed (no dismiss
button by design) — a focus change now hides the panel so no stale panel lingers.
⚠ `exportXlsx` is now an unused function (kept in case export is restored). ⚠ Clear's
server persistence depends on the `set-beginning-balance` endpoint being live in the
Services jar — the visual clear always works, but a real B→C would resurface the
variance until the server side actually persisted (why the original single Clear
"did nothing" — the round-trip failed silently).

**Workflow restructure (owner 2026-07-15):** both roll cards are now HIDDEN until an
Adjust opens them (revealed in `openAdjust`, hidden in `closeAdjust`; `renderRollBand`
no longer shows the detail section on focus). Cards relabelled **Current Roll Forward**
/ **Projected Roll Forward**, subtext removed. Attestation + Cancel/**Apply & stamp**
moved out of the fields panel INTO the Projected card — the analyst stamps it there
once the projection reads right. On Apply: commit `set-beginning-balance` →
`RRV8.logActivity` (Audit Center entry, same spine as the source-fix log) → close →
reload. The Home cardex light is server-derived (off the worklist / `rperpetualinv`
which the sproc sets to variance 0), so it refreshes on Home's next load — NOT a
cardStore write. ⚠ If Home actually reads `RCardexVariance` (nightly-MERGE table the
sproc does NOT touch), it would lag until the nightly run — verify on Home.

**Projection extends to the whole view (2026-07-15):** during an active what-if the
Item Position grid's Qty Var / Amt Var columns and the scope-bar QTY VAR / AMT VAR
KPIs re-render to the projected variance (green, `.proj`), distributed across lots by
factor. ON HAND and VALUE stay actual (a beginning-balance adjustment doesn't move
them). Reverts to actual on cancel; on Apply the reload shows the real post-adjustment
numbers. `_cxProj` holds the factors; set in `_cxWhatIf`, cleared in `_cxWhatIfClear`.

**Still to verify live (owner Apply):** the client preview shifts every period
uniformly by `dQ`/`dA`; the server rolls forward via `v6_006_asof_rollforward`.
Confirm they match on a real Apply — especially the amount roll and any negative
clamping — and adjust the preview if the server does more than a flat shift.

## The idea

Split the roll-forward panel into two grids.

- **Left = static "before."** The roll-forward exactly as loaded from RR — the
  red `break` tag still showing where on-hand walked off the recorded movement.
- **Right = live "after."** Driven by the **JDE-ties (Fork B) Adjust** action.
  As the analyst picks a beginning-balance preset (Clear-to-JDE / Zero /
  Manual), the right grid re-derives the whole roll from that new baseline and
  the break dissolves in real time. The ending ties to cardex. Commit only
  after they like what they see.

This is the workflow, not decoration: the analyst *sees the sync land* before
committing it.

## Scope

- **Fork B only.** The right grid belongs solely to the "JDE ties — sync RR"
  path. Fork A ("JDE was off") changes nothing in RR (cardex is king; RR
  re-reads JDE on the next refresh), so there is no "after" to project — no
  right grid there.
- **Live what-if**, not post-commit. The right grid updates as the modal
  inputs change, client-side. Commit persists via the existing
  `/inventory/set-beginning-balance` (`usp8_maint_set_beginning_balance`), and
  the server re-derives identically.

## The rule that makes or breaks it: RE-DERIVE, don't SHIFT

The break tag is a period-to-period test:
`on-hand[t] − (on-hand[t-1] + recorded movement[t])`.

If the right grid merely adds the adjustment delta to every row (a constant
shift), the ending ties but the adjacent-period gap is unchanged — **the break
tag stays lit on the "after,"** reading as "the fix failed." Wrong.

Re-derive on-hand from the adjusted baseline, mirroring the server
(`inventory-cardex-variance.html:1004` "the roll-forward re-derives from here
through the current period"):

```
right_onhand[t] = adjusted_BL + Σ (recorded period movement up to t)
right_onhand_amt[t] = adjusted_BL_amt + Σ (recorded period amount up to t)
```

Re-derived this way the roll is internally consistent by construction — every
break clears — and under Clear-to-JDE the ending lands on cardex. The break
vanished because on-hand was rebuilt from the ledger instead of the walked-off
perpetual snapshot. Recompute the break tags on the right grid off the
re-derived series (they resolve to zero for a clean sync).

## Preset → adjusted_BL

- **Clear-to-JDE:** `adjusted_BL = current_BL + (cardex_ending − perpetual_ending)`
  — i.e. the delta that drives the ending variance to zero. (Confirm the
  server's Clear-to-JDE math and mirror it exactly so preview == committed.)
- **Zero:** `adjusted_BL = 0` (and amt = 0).
- **Manual:** the typed beginning qty / amt.

## Data — already sufficient

The `v8ui_item_rollforward` view returns everything the client needs to
re-derive: `BL` flag, `QuantityonHand`, `AmountonHand`, `PeriodQuantity`,
`PeriodAmount`, `PeriodEnds` (see the render at
`inventory-cardex-variance.html:692-707`). No payload change required.

## Verify at build time (attended)

- `:8765`, Demo1, item **SI-444095** (seeded −3,000, no recorded movement
  behind it).
- Open JDE-ties → Adjust → Clear-to-JDE: the right grid re-derives, the break
  tag clears, the ending ties to cardex — live, before commit.
- Zero / Manual behave sensibly (Zero → flat-from-zero roll).
- Right grid absent in Fork A.
- Non-Demo1 / pre-rebuild: right grid honors the same 403 "loads after the
  next Services rebuild" fallback as the left grid — no throw, no broken grid.
