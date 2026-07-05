# Analyst-view redesign (home.html)

**Status:** increment 1 built 2026-07-05 (autonomous, owner delegated — UI-4).
**Owner review:** live, read-only verified for no console errors; layout is the owner's eye.

## Why

The accountant home became a real triage surface this cycle: a per-company
reconciliation worklist, GL roll-forward, Perpetual at-a-glance, an AI band.
The **analyst** view kept the same top AI band + sub-nav (Workspace | Reports)
but the **Workspace** was still just a four-row link list (Model DMAAI Review,
DMAAI Analysis, Transactions, Cardex Variance). It named the analyst's tools
but didn't tell them **where the work is** this period.

The analyst owns the half of reconciliation the accountant can't touch:
roll-forward **breaks**. The accountant worklist literally hands red-dot
companies to the analyst ("Roll-forward break — hand to your analyst to
re-roll"). So the analyst's home should open on **exactly that queue** — the
companies whose roll-forward didn't hold — in the same card language.

## Design language (reuse, don't reinvent)

Match the accountant worklist: `.wl-card` / `.wl-dot` / `.wl-break`, red dot =
break, plain-English cause line, `.wl-actions` buttons. Data comes from the
same `_acctData.companies` the accountant renders (`c.co / c.oob / c.ccy /
c.breaks`), so the two views never disagree about which companies broke. All
helpers used are module-level (`_ccyAmt`, `esc`, `_coNames`).

## Increment 1 — Roll-Forward Integrity worklist (BUILT)

On the analyst **Workspace** sub-view, above the existing tools list:

- **Header** — "Roll-forward integrity" + a one-line lede.
- **Break cards** (biggest |oob| first): red dot, `Co <n>` + name, a "roll
  didn't hold" cause line, and two actions — **Open Roll Forward**
  (`inventory-account-rollforward.html`, the analyst's fix surface) and
  **Cardex Variance** (`inventory-cardex-variance.html`, the usual root cause).
- **Clean summary** — "N companies rolled clean" when some are fine, or a full
  all-clear state when none broke.
- Degrades gracefully: no `_acctData` yet → the panel stays empty (the tools
  list below still shows), so a slow/there's-no-recon-data DB never breaks the
  view.

The existing Set Up / Troubleshooting link card is **kept** below the worklist,
relabeled as the analyst's tools — the worklist is the "what to do now", the
list is "everything else I reach for".

## Later increments (owner direction)

2. **Inline break detail** — expand a break card to show the earliest broken
   period + the per-account gap (from the roll-forward feed) without leaving
   Home, mirroring the accountant GL drill.
3. **Cardex variance count** — a live count on the Cardex Variance tool row
   (how many items drifted), same fetch the accountant integrity dots use.
4. **Transaction-variance worklist** — F4111-vs-F0911 document count per
   company, so the analyst sees transaction breaks alongside roll breaks.

Increments 2–4 add fetches + drill modals; hold for the owner's call on how
much diagnostic depth belongs on Home vs. the dedicated pages.
