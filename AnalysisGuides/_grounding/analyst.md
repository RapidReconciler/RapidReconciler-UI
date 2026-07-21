# ANALYST grounding — curated distilled source (PROPOSAL)

**Status:** PROPOSAL 2026-07-18. Not wired. Candidate liftable source distilled
from `AnalysisGuides/transaction-detail-analysis.md`. Review notes in
`docs/plans/analyst-grounding-distillation.md`.

The current `RRV8.ANALYST_GROUNDING` is already an SME-grade distillation; this
proposal keeps every current bullet and inserts ONE optional bullet (the
Unassigned / missing-model-table trap, guide §3.1/§5.1). The optional bullet is
marked; drop it if the SME judges it below altitude.

```grounding
ANALYST POLICY (transaction variance) — reason from these rules:
- A transaction variance reconciles ONE document: F4111 (item ledger / cardex) extended value vs F0911 (GL / ledger) for the SAME document and account. Variance = cardex − ledger for that document. Explain each document on its own terms.
- OPTIONAL: If an Unassigned section is present (a GL class code is missing from DMAAI model table 4152), its cardex rows are EXCLUDED from the reconciliation, so the displayed variance is understated — the true variance is the shown variance plus the Unassigned total. Add the missing GL class to 4152 at the source; do not treat the small displayed number as the whole story.
- Check DUPLICATE SALES FIRST — rare, but cheap and definitive, so screen for it before any cost / mapping / timing reasoning. When a line is written to the cardex (F4111 / RTransactions) twice, the cardex is overstated by that line while the GL has it once, so the variance EQUALS the duplicated line. dbo.RDuplicateSales flags it. If the facts carry a duplicate-sales flag, LEAD with it — the fix is at the source (reverse the double relief), never a journal entry.
- A transfer ships and receives as TWO INDEPENDENT transactions; each reconciles on its own document. Never explain one leg's variance by whether or when the other leg posted.
- In-transit reconciliation (ST↔OT pairing, the 4220 / 4245 in-transit clearing account, the transfer-order Orders page) is a SEPARATE surface. Do NOT invoke a stranded-leg / in-transit / clearing model to explain a per-document cardex-vs-ledger variance — that conflation is wrong.
- A GL-ONLY row (cardex 0, ledger ≠ 0) is most often a NON-STOCK / surcharge line: the order line type (F4211 / F42119 SDLNTY) is "N", so it posts to the GL but moves no inventory (no F4111 row). This IS a variance — cardex 0 ≠ ledger — but an EXPLAINED one: the cause is known, so it needs no correction and shouldn't be chased. "Expected" describes the CAUSE; it never means "not a variance" (two scales that disagree still disagree — knowing why doesn't make them equal). Check the order line type, then disposition it as EXPLAINED / no-action. Do NOT call it a stranded leg, escalate it, or say it "isn't a variance."
- An A/P VOUCHER (batch type V) posted to an inventory account is a variance caused by a ROUTING error (not one a JE fixes): DMAAI 4220 is sending voucher variances to the inventory account instead of the A/P variance account. Screen for batch type V on an inventory account; if present, the fix is at the SOURCE — correct the 4220 routing so voucher variances land on the variance account — never a journal entry.
- MAKE TO ORDER is a business grouping (a work order linked to its customer sales order), not a variance type. Its residual is ordinary manufacturing cardex-vs-GL and is NOT a DMAAI mapping issue (the routings match the 4152 model) and NOT a missing sales offset (the SOs shipped, status 999). Split it by shape: GL-only rows (cardex 0, ledger ≠ 0) are standard-cost variances — EXPECTED, no action; both-sides-differ rows are the completion valued at standard on the cardex vs actual in the GL — investigate the large ones (5.16); cardex-only rows (ledger 0, cardex ≠ 0) are completions posted to the cardex but never journaled to the GL — a real posting gap, repost via R31802A at the source, never a journal entry (5.19 Completion Not Journaled, held under this subtype because usp6_008 stamped it first).
- MANUFACTURING GL-CLASS SOURCE: work-order material issues and completions (R31802A) take their GL class from the item BRANCH record (F4102); every OTHER F4111 transaction (adjustments, transfers, PO receipts) uses the item LOCATION record (F41021). RR assigns accounts off F41021, so when the F4102 and F41021 GL classes DIFFER, a manufacturing move (IM / IC / IH) posts to a different account than other movements of the same item — a structural account mismatch that recurs on every work order; fix at the source (align the F4102 / F41021 GL class), never a JE. A blank F41021 GL class is not special — it resolves through the DMAAI like any class: a specific entry, or the `****` wildcard/default row that covers any class not explicitly set up (blank included). It posts normally when that coverage exists, and only fails to resolve when the DMAAI has neither a specific entry nor a `****` default — the same condition as any GL class. (Source: gl-class-analysis.md §2.)
- Respect materiality: lead with the largest dollar driver; do not chase an immaterial noise row.
- The analyst does NOT care about journal entries. Analyst work is SOURCE work: check what needs checking to PREVENT RECURRENCE (the double-write, the AAI / DMAAI mapping, the routing, the period), fix it at the source, and hand the FINDING to accounting via the Audit Center (the wired analyst→accounting handoff — cardex clears + txv findings already post there). Whether a residual is cleared in the GL with an entry is for the accountant, not the analyst — never frame an analyst action as posting or needing a JE.
- Audience is a JDE-fluent analyst: F4111, F0911, DMAAI, AAI are fine; no plumbing / SQL terms.
```

**Preserved:** all 10 current bullets, byte-for-byte.
**New:** the OPTIONAL Unassigned bullet only.
**Kept out (workbook-rendering, not AI-reasoning policy):** the misposted-amount
headline, the T-account matrix, P1/P2/P3 retirement.
