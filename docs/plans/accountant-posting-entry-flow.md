# Accountant posting-entry flow — one entry path, export, exclude carry-forward

**Status:** SPEC 2026-07-07, **corrected against the source 2026-08-19** (UI-21).
Endpoints + journey locked. Read the correction log at the bottom before
building: three of the original seven changes were partly or wholly shipped
under names this doc did not use, and two of its "locked decisions" were
overtaken by later rulings.

**The worklist row is the later decision wherever the two disagree.** Row:
`WORKLIST.md`, UI-21. All four original `[CONFIRM]`s were answered 2026-07-07
and **the answers live in the row, not here**.

## The two endpoints (locked)
- **A — START:** the accountant is signed in, on the **Overview** tab, current
  period, and wants to create Co 80002's posting entry. One obvious "create the
  entry" affordance on the card. Works even though 80002 reads *immaterial* —
  she is choosing to post.
- **B — RESULT:** a **balanced adjusting entry for Co 80002** that is correct by
  construction (accountant-owned gap, one offset per account, timing excluded),
  reviewed, exportable as a keying reference, and marked complete, so 80002 flips
  to *Adjusted*. She keys it into JDE by hand. **JDE is the book of record.**

## The journey (A → B)
1. Overview → Co 80002 card → click **"Balancing Entry →"** (or the clickable Out
   number — same destination).
2. **Accounts, scoped to 80002** — per-account roll-up + Offset-account column;
   AI auto-read fires; a cue frames it as *building the entry*.
3. Type an offset per out-of-balance row → **Adjusting Entry →** → the preview
   modal (paired Date/Account/Debit/Credit, balanced, Perpetual→GL, timing
   warning and near-zero handling).
4. Review; optionally export as a keying reference.
5. Finalize → logs the entry → 80002 → *Adjusted*.
6. Key it into JDE from the export or the screen. **B reached.**

## The change list (all in `RRV8/home.html` unless noted)

1. **Collapse to one entry path — SHIPPED 2026-08-19.** Rewired the card's `data-acct-nav="je"` handler
   (`home.html`, the `kind === 'je'` branch) from `openJeModal(co)` to the
   Out-number drill: `_acctGlScopeCo=co; _setSubView('account'); _acctAutoAnalyze(co);`.
   **Retired:** `openJeModal` · `_wireJeModal` · `_closeJeModal` · `jeExport` ·
   `_jeCell` · `revealJeMatrix` · `_jeClearingAccount` · the `_je*` state · the
   `#jeModal` HTML block · and ~45 lines of CSS that had no other user (the
   `.ws-matrix` / `.ws-je-*` / `.ws-ai-banner` / skeleton-reveal cluster and four
   keyframes). Measured after: 0 hits for each retired identifier.
   **Salvage — corrected 2026-08-19.** The Excel export needed no salvaging:
   `_oeExport` was already the same report shape. What genuinely died with
   `openJeModal`, and was ported:
     - **`fetchJeAiSummary`** — the AI's one-line read of the assembled entry,
       carrying `ACCT_GROUNDING` + `AI_REGISTER`, Scrubbed-tier entity masking,
       and three anti-drift guardrails in its prompt (don't describe carrying the
       balance forward, don't call inventory accounts intercompany, never name a
       smaller component as the driver). This is the "suggested entry" logic the
       worklist row asks to keep. **It is NOT called `v8ui_suggested_je`** — that
       name appears nowhere in the source and never did. Ported as `_oeAiSummary`,
       grounded on `compose`'s per-entry component subtotals, with a stale-response
       guard the original lacked (the carry-forward toggle can fire a second read
       before the first returns). **One instruction is deliberately not a copy:**
       the original told the model "this entry CLEARS the period, do NOT describe
       carrying the balance forward". With the carry-forward excluded that is false,
       so the clearing claim is now stated only when the entry actually clears.
     - **`_jeWhy`** — builds a real Explanation string ("Inventory reconciliation
       — mostly carry forward"). `_oeExport` hardcoded a generic one; it now carries
       per-account components through `compose` and calls `_jeWhy` per line, so the
       exported Explanation says what drove that account.

2. **Finalize label → "Journal Entry Complete" — SHIPPED 2026-08-19.** The control
   read *"Attest · export & record"*; it is now **"Journal Entry Complete"**,
   `oeAttestBtn` → `oeCompleteBtn`, `_oeAttest` → `_oeComplete`. *attest* is gone
   from this surface entirely (0 hits for `Attest`).
   **⚠ Vocabulary collision — still worth the owner's eye.** The card ships a
   per-company completion control reading **"Mark Complete"** with four disposition
   reasons, one of which is **"Corrected — journal entry posted"**. "Journal Entry
   Complete" is a third phrase for one state. The row asked for it explicitly, so
   it shipped; say the word if the shipped card vocabulary should win instead.
   **RESOLVED 2026-08-19 — the modal's flip was dead.** `_oeAttest` wrote
   `_acctDispo[...] = 'adjusted'`; `_acctDispo` was read only by `_dispoOf`, which
   had **zero callers** since the close bar was retired. Finalizing an entry did not
   flip the company at all — only the card's `Mark Complete` did. Endpoint B was
   never reached by the modal path. **Fixed:** `_oeComplete` now calls `_acctSetDone(co, 'corrected')`,
   the one server-backed store the cards and the Audit tab already read, and
   `_acctDispo`/`_dispoOf` are deleted. One producer of the company's completion
   state instead of two, one of which was a no-op.

3. **Export buttons in the `#oeModal` foot — SHIPPED 2026-08-19.** **Corrected 2026-08-19:** the export
   *logic* exists — `_oeExport` builds the workbook from `e.pairs` and already
   routes the filename through `RRV8.exportName({surface:'AdjustingEntry', company, period})`.
   What was missing is that it fired **only** from inside `_oeAttest`, mandatorily.
   Shipped as two foot buttons plus `_oeExportPdf` (jsPDF + autoTable, matching the
   audit-report house pattern). `_oeExported` tracks whether the CURRENT composition
   has been written, so finalizing doesn't hand over a duplicate download and a
   recorded entry still never exists without its reference. Any rebuild clears it,
   because a file pulled before the carry-forward toggle no longer matches the
   entry on screen.

4. **Entry-building cue** on `renderAccountPalette` when `scopeCo != null`:
   *"Enter offset accounts on the out-of-balance rows, then Preview the adjusting
   entry."* — **SHIPPED 2026-08-19.**

5. **Period-close wording — VOID. Nothing to do.** The original text asked to
   reword `renderCloseBar` / `_wireCloseBar`. **Neither function exists, and
   never did under those names.** The period-close capstone was not renamed, it
   was **retired** (UI-18 reframe): `renderCloseBar` 0 hits, `acctCloseBar` 0,
   `_acctClosed` 0, `"Sign off"` 0, measured at UI main `627ad65`. Completion
   moved per-company onto the worklist cards. The three `"Mark period reviewed"`
   hits belong to the **analyst's** TXV surface, a different role. The three
   `"signed off"` hits are all comments, none user-visible. **RR does not close
   periods — JDE does. No period-close wording anywhere.**

6. **Immaterial companies must be postable.** **Was NOT already true — three
   blocks, measured 2026-08-19; FIXED 2026-08-19:**
     - the scope bar rendered the `Adjusting Entry →` link only when
       `|oob| >= MAT_OOB_FLOOR`, so an immaterial company had **no control at
       all** and nothing explaining its absence — on the exact company endpoint A
       names;
     - `_oeBuild` filters accounts at `|OOB| >= 100`, then drops rows under
       `|je| < 1`, so an immaterial company yields no lines;
     - `_oeAttest` returned **silently** on zero pairs — a gate with no sink.
   The link is now unconditional on a scoped company, and the cue prints the
   company's figure and the floor beside it so the decision is made against
   numbers. The modal reports honestly when there is nothing to journal.

7. **Carry-forward exclude toggle** in `#oeModal` — **SHIPPED 2026-08-19.**
   State `_oeExclCF`, **default OFF**, reset to OFF on every fresh open.
   `je = (exclCF ? 0 : BegVar) + Variance + JEs`; rows that fall under $1 drop;
   the entry re-nets and stays balanced (each line becomes a self-balancing pair,
   so `drTot` always equals `crTot`). The deferred total is printed on the
   toggle, on the balance row, in the workbook and in the activity event.
   Ties to UI-20, which is advise-only.
   **Arithmetic lives in `RRV8.oeEntry.compose` (`RRV8/config.js`), not inline** —
   `home.html` has no module boundary, so inline arithmetic cannot be gated.
   Asserted by `Tools/test-oe-compose.js` against measured
   `RapidReconciler_Demo1.v6ui_raccountsummary` rows.
   **Known gap:** the durable *"carry-forward $X deferred"* stamp on the
   disposition record needs a schema + endpoint change. `beStore._norm` and
   `dispoStore._norm` both whitelist their fields and neither carries free text.
   The activity-log event is the persisted sink until then.

## Decisions locked
- Retire `openJeModal`; port `fetchJeAiSummary` and `_jeWhy` into the single
  path. — owner OK 2026-07-07, salvage list corrected 2026-08-19
- Carry-forward exclude toggle, **default OFF** (opt-in). — agreed 2026-07-07
- Finalize allowed with a carry-forward deferred, stamped so it does not read as
  unfinished. — owner 2026-07-07
- Export token `AdjustingEntry`; **Excel and PDF both ship now**. — owner 2026-07-07
- Direction **Perpetual→GL**; timing exclusion and near-zero handling — built.
  (The *Flip* control was removed by a later owner call, 2026-07-12: one
  direction, not flippable.)
- **Finalize label = "Journal Entry Complete"**, aligning with the UI-18 reframe.
  **NOT "Attest", NOT "Mark done"** — the worklist row supersedes this doc's
  original "Mark done". See the collision noted in change 2.
- **Excel is a keying reference, and it IS P0911-shaped.** — owner 2026-08-19,
  superseding this doc's original "no P0911". See the correction log.

## Correction log — 2026-08-19

This doc was written 2026-07-07 and drifted. What was wrong:

1. **"Excel = reference only (no P0911 / machine import)" was wrong about the
   build, and the owner has ruled the build correct.** `_oeExport` deliberately
   emits a P0911 shape: a *"Paste the rows below into the P0911 Account
   Distribution grid"* header, an `Account Number / Amount / Explanation` grid,
   and a 30-character token built for `F0911.GLEXA` so `RRV8.beStore` can flip
   the entry to Verified on the Audit tab on a later load. Stripping that would
   break the verification loop. **Owner ruling 2026-08-19: keep the P0911
   shaping.** The line the original decision was drawing still holds — there is
   no machine import, no flat file, no batch loader. A person pastes a grid and
   posts it by hand.

2. **"Mark done" was superseded** by the UI-18 reframe to "Journal Entry
   Complete". The worklist row is the later decision.

3. **Change 5 named two functions that do not exist.** A proposed function name
   is not a test of whether work shipped — the same mistake that left UI-12 open
   on paper for weeks while its feature had been live the whole time. Measure the
   behaviour, not the identifier.

4. **`v8ui_suggested_je` does not exist and never did.** The real suggested-entry
   logic is `fetchJeAiSummary`.

5. **Step 3 of the journey was already built.** The in-grid offset capture feeding
   the preview shipped under UI-18 item 6. UI-21 is not a build-from-scratch; it
   is a consolidation onto working code.

6. **The card's link reads "Balancing Entry →", not "Journal Entry →".** The
   Accounts deep-dive's per-account entry is "Adjusting Entry". Both names are
   live and mean different things; don't collapse them by accident.
