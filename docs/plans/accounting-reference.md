# Accounting Reference — how the reconciliation accountant should treat each situation

**Status:** DRAFT 2026-07-07 — owner (accounting SME) to curate. This is the
accountant counterpart to [`dmaai-reference.md`](dmaai-reference.md): a curated
playbook of *how to treat* an inventory-to-GL reconciliation, so the AI reasons
from **your firm's policy** instead of generic LLM accounting (which drifts run to
run). Lines marked **[OWNER]** are policy decisions only you can set; **[VERIFY]**
are drawn from what the code already implies and want your sign-off.

## Why this exists — same model as DMAAI
The accountant-facing AI (the per-company AI box, the drill auto-analysis, the Ask
box) needs consistent accounting judgment, not improvisation. Today that guidance
is scattered inline across prompts (materiality floors, timing exclusion, component
ownership, sign conventions). This document consolidates it into one owner-editable
source.

**Consumers:** (1) the client injects a compact core (`RRV8.ACCT_GROUNDING` in
`RRV8/config.js`) as grounding on every accountant AI surface; (2) accountants /
juniors read it directly (junior-support training — the exit-strategy deliverable).

**Keep in sync:** `RRV8.ACCT_GROUNDING` is the AI's compact copy of this doc. When
you change policy here, update that constant to match (same discipline as
`dmaai-reference.md` ↔ `AiService.DMAAI_GROUNDING`).

## RR's role — the line that keeps this from becoming an ERP
**RR reconciles and produces the entry; JDE posts and remembers.** RR is not the
book of record. It surfaces the gap, explains it, and assembles the correcting
entry the accountant reviews and exports to post in JDE. Anything that requires RR
to *remember state across periods, post, or run a schedule* is JDE's job, not RR's.

---

## 1. Materiality — when a gap is worth acting on
- Out-of-balance under **$100** (absolute) → **immaterial** regardless of %. [OWNER — floor confirmed 2026-07-07]
- GL balance under **$1,000** → **dormant / near-zero**; a % of a ~0 balance is
  meaningless, so frame by **absolute amount** and suppress the %. [OWNER]
- Otherwise judge by the out-of-balance as a share of the GL balance; well under
  ~1% reads as immaterial. [OWNER — confirm the % band]
- (Wired: `MAT_OOB_FLOOR=100`, `DORMANT_GL_FLOOR=1000` in `home.html`; UI-17.)

## 2. The variance components — what the accountant owns vs. doesn't
The out-of-balance decomposes into components. **Only some are the accountant's to
journal.**

| Component | Field | Owner | Treatment |
|---|---|---|---|
| Carry forward | `BegVar` | **Accountant** | Prior period's unresolved balance rolled in. Journal-able. See §4 (amortization). |
| Transactions | `Variance` | **Accountant** | Item-ledger movement the GL hasn't matched. Journal-able — or **reclass** if it's a period/account misposting (§3). |
| Manual entries | `JEs` | **Accountant** | GL journal entries with no inventory offset. Journal-able. |
| Unposted GL batches | `UnpostBatch` | Operations | **Timing** — not yet posted; self-clears when operations posts. **Never journal.** |
| End of Day | `EndofDay` | Operations | **Timing** — sales/EOD not finalized; self-clears. **Never journal.** |
| Cardex | `CardexVar` | Analyst | A perpetual-vs-item-ledger break → **re-roll**, not a JE. |

**Rule:** the adjusting-entry amount is **carry-forward + transactions + manual
entries** only. It excludes unposted / end-of-day timing and cardex. Journaling the
full out-of-balance when timing is present over-corrects and creates a new gap next
period. (Wired 2026-07-07: `_oeBuild` + the timing soft-warning.)

## 3. Reclass vs. journal entry
- A transaction posted to the **wrong period or wrong account** → **reclass** (move
  it), not a new balancing JE. [OWNER — confirm when you prefer reclass vs JE]
- A roll-forward **break** (red dot) → **analyst re-roll**, not the accountant's and
  not a JE. Hand it off.

## 4. Carry-forward — amortization / absorption
A large carry-forward is the prior period's unresolved balance rolling in. Options:
- **Book it now** — one adjusting entry this period.
- **Absorb over N periods** — when the carry-forward is **> 25% of the company's GL
  balance OR > $50,000** (whichever hits first) [OWNER — threshold confirmed
  2026-07-07], the accountant may spread it over **6 periods** (default N) rather than
  take it all at once, to avoid a lumpy P&L hit. [OWNER — default N=6 confirmed 2026-07-07]

**How RR helps (and where it stops):** RR *advises only* — when the threshold hits,
the per-company AI read flags the large carry-forward and states the per-period figure
(**carry-forward ÷ 6**). RR does **not** build the fractional entry, track the
remaining balance, or auto-generate future entries — the **schedule lives in JDE**
(recurring JE / allocation). [OWNER — boundary confirmed 2026-07-07]  *(Advisory only:
no split-builder, no deferral account, no schedule — UI-20.)*

## 5. The adjusting entry — mechanics
- One offset account **per inventory account**, entered on the grid — no generic
  clearing account (self-clearing, correctly classified). A clearing/suspense
  account is the escape hatch, not the default.
- Direction: **[OWNER — Perpetual → GL selected 2026-07-07]** reconcile toward the
  GL figure; the "Flip direction" control lets you verify the Dr/Cr both ways.
- Excludes timing (§2). Two lines per gap (original account + its offset), classic
  Date · Account · Debit · Credit.

## 6. Period close — sign-off
"Closing the period" in RR = the accountant **attests** the reconciliation is
complete (RR isn't the GL — JDE closes the books). Every company must reach a
terminal disposition — reconciled / immaterial / adjusted / with-analyst — before
sign-off. [OWNER: confirm the disposition set + whether a closed period that
changes should auto-reopen.]

## 7. Conventions & tone
- **Sign:** stored/displayed natural so the reconciliation ties to the KPI; OOB
  `*-1` only in Excel/PDF. (`reference_transactions_sign_convention`.)
- **Audience:** JDE-fluent finance, not IT. Plain accountant English; JDE artifacts
  (F4111, F0911, AAI) are fine, but no plumbing terms (token, endpoint, sproc).
- **Prior/closed periods:** already journaled — never prescribe an entry for them;
  use history only to explain a current balance (a carry-forward's source is the
  prior period).

---

*Author policy here the way you curate `dmaai-reference.md`. When a section
stabilizes, mirror its essence into `RRV8.ACCT_GROUNDING` so the AI reasons from it.*
