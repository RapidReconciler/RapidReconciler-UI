# Accountant posting-entry flow — one entry path, Mark done, Export, exclude carry-forward

**Status:** SPEC 2026-07-07 — agreed with owner as a **one-pass build** (UI-21).
Endpoints + journey locked; a few `[CONFIRM]` items to resolve in the worklist
sweep before/at build. Autonomous once those are answered.

## The two endpoints (locked)
- **A — START:** Karen signed in, on the **Overview** tab, current period, wants to
  create Co 80002's posting entry. One obvious "create the entry" affordance on the
  card. Works even though 80002 reads *immaterial* (she's choosing to post).
- **B — RESULT:** a **balanced adjusting entry for Co 80002** that is: correct by
  construction (accountant-owned gap, one offset per account, timing excluded);
  **reviewed**; **exportable to Excel as a keying reference** (on demand); and
  **marked done** (one logged check → 80002 flips to *Adjusted*). No attestation
  ceremony. Karen keys it into JDE manually (JDE is the book of record).

## The journey (A → B)
1. Overview → Co 80002 card → click **"Journal Entry →"** (or the clickable Out
   number — same destination).
2. **Accounts, scoped to 80002** — per-account roll-up + Offset-account column; AI
   auto-read fires; a cue frames it as *building the entry*.
3. Type an offset per out-of-balance row → **Preview entry** → **Adjusting Entry**
   modal (paired Date/Account/Debit/Credit, balanced, Perpetual→GL + Flip, timing
   warning + near-zero handling already built).
4. Review; optionally **Export (Excel)** for a keying reference.
5. **Mark done** → logs "Co 80002 entry done" (who/when) → 80002 → *Adjusted*.
6. Key it into JDE from the Excel/screen. **B reached.**

## The one-pass change list (all in `RRV8/home.html` unless noted)
1. **Collapse to one entry path.** Rewire the card's `data-acct-nav="je"` handler
   from `openJeModal(co)` → `_acctGlScopeCo=co; _setSubView('account'); _acctAutoAnalyze(co);`
   (same as the Out-number drill). **Retire `openJeModal`** + `_wireJeModal` /
   `jeExport` / `_jeCell` / `_je*` state + the `#jeModal` HTML block. **Salvage its
   Excel-export logic into change 3.**
2. **"Attest" → "Mark done."** `oeAttestBtn` label → **"Mark done"**; `_oeAttest`
   keeps the logged check + disposition flip, reworded (activity event e.g.
   "Reconciliation entry recorded"). Sweep "attest" in comments.
3. **Export (Excel) in the Adjusting Entry modal** — on-demand button in `#oeModal`
   foot; builds a readable workbook from `e.pairs` (Date/Account/Debit/Credit +
   total) via the salvaged export helper; `RRV8.exportName({surface:'AdjustingEntry',
   company, period})`. Reference-only (manual keying); PDF optional/later.
4. **Entry-building cue** on `renderAccountPalette` when `scopeCo != null` — a short
   banner: *"Building the adjusting entry for Co X — enter an offset account on each
   out-of-balance row, then Preview entry."* Keep "Preview entry" prominent.
5. **Period-close wording** in `renderCloseBar`/`_wireCloseBar`: "Sign off & close
   period" → **"Mark period reviewed & done"**; "Period signed off & closed" →
   "Period reviewed & closed"; reword the log events. (Logged check, no ceremony.)
6. **Confirm immaterial-post path** — verify nothing blocks building + Mark done when
   the AI read says "no action needed" (should already be true; verify in the pass).
7. **Carry-forward exclude toggle** in `#oeModal` — "Exclude carry-forward this
   period." State `_oeExclCF` (default OFF). `_oeBuild`: `je = (exclCF ? 0 : BegVar)
   + Variance + JEs`; rows that go ~0 drop; entry re-nets (stays balanced); show the
   excluded carry-forward total + a note *"Carry-forward $X excluded — handling
   separately."* Same component model as the timing exclusion; ties to the UI-20
   amortization nudge.

## Decisions locked
- Retire `openJeModal` (salvage the Excel export). — owner OK 2026-07-07
- Finalize label = **"Mark done"** (no attestation). — owner OK 2026-07-07
- Carry-forward exclude toggle, **default OFF** (opt-in). — agreed 2026-07-07
- Manual keying; **Excel = reference only** (no P0911 / machine import — line drawn
  for now; future customer asks out of scope). — owner 2026-07-07
- Direction **Perpetual→GL** + Flip; timing exclusion + near-zero handling — already built.

## Open — resolve in the worklist sweep (`[CONFIRM]`)
- [CONFIRM] Allow **Mark done** when carry-forward is deferred (residual remains,
  rolls forward), with a *"carry-forward $X deferred"* note on the disposition — so it
  isn't read as unfinished. (Asked; not yet answered.)
- [CONFIRM] Anything to salvage from `openJeModal` beyond the Excel export (e.g. the
  `v8ui_suggested_je` "suggested entry" logic), or drop entirely?
- [CONFIRM] Export surface/filename token = `AdjustingEntry`? PDF now or later?
- [CONFIRM] Entry-building cue wording / any extra signposting when "Journal Entry"
  lands on the Accounts tab.
