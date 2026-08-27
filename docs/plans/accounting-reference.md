# Accounting Reference — how the reconciliation accountant should treat each situation

**Status:** DRAFTED 2026-07-07, EXTENDED 2026-08-27, **OWNER SME PASS APPLIED 2026-08-27.** This is the
accountant counterpart to [`dmaai-reference.md`](dmaai-reference.md): a curated
playbook of *how to treat* an inventory-to-GL reconciliation, so the AI reasons
from **your firm's policy** instead of generic LLM accounting (which drifts run to
run). Lines marked **[OWNER]** are policy decisions the owner set.

**Every SME call this document carried is answered and written in.** §11 is now the
record of what was ruled, not a queue. Four sections described behaviour the product
does not have and have been **corrected against the shipped code**, not merely
confirmed: the entry-line floor (§5), the offset account (§5), the period close (§6)
and the accountant-to-analyst feedback (§7). Where an answer names a product gap
rather than a doc correction, the section says what ships today and points at the
worklist row — it never describes the gap as though it works.

## Why this exists — same model as DMAAI
The accountant-facing AI (the per-company AI box, the drill auto-analysis, the Ask
box) needs consistent accounting judgment, not improvisation. Today that guidance
is scattered inline across prompts (materiality floors, timing exclusion, component
ownership, sign conventions). This document consolidates it into one owner-editable
source.

**Consumers:** (1) the client injects a compact core (`RRV8.ACCT_GROUNDING` in
`RRV8/config.js`) as grounding on every accountant AI surface; (2) accountants /
juniors read it directly (junior-support training — the exit-strategy deliverable).

**Keep in sync — and know which kind of sync it is.** `RRV8.ACCT_GROUNDING` is the
AI's compact copy of this doc, and it is **hand-maintained**, not generated.
Verified 2026-08-27: `Tools/build-ai-grounding.py` lists `ACCT` outside its
`GENERATE` tuple with an empty source list, so the generator copies the current
constant through byte-for-byte on every run. The analyst catalogs (`ANALYST`,
`CARDEX`) *are* generated, from `AnalysisGuides/_catalog/…` — do not assume the
accountant side works the same way. So changing policy here changes no AI answer
until someone edits the constant to match, which is exactly the drift this document
exists to prevent.

A curated Markdown source already exists as a proposal at
`AnalysisGuides/_grounding/acct.md`, waiting on the owner sign-off gate below. Moving
`ACCT` onto the generated path means promoting that file to
`AnalysisGuides/_catalog/accountant/acct.md`, adding `ACCT` to `GENERATE` and giving
it a `SOURCES` entry — the generator's own comments spell out that path. That is the
durable fix for the sync problem; until it happens, the constant is a second copy.

⚠ **The live constant carries a wrong sentence about cardex, and so does the
proposal.** `ACCT_GROUNDING` says cardex variance self-heals on the analyst's
roll-forward refresh. Two different things are being conflated: a **roll-forward
variance break** does self-heal, because the full period timeline is recomputed on
every refresh; **cardex variance** is F4111 not summing to F41021 for an item and it
does not self-heal at all — it is fixed in JDE at the source, or synced in place by
the analyst once JDE is validated ([[reference_cardex_variance_demo_and_reason]],
[[reference_varok_break_resolution]]). The accountant conclusion is unchanged (never
journal it), but the reason given is wrong, and a wrong reason invites a wrong answer
the first time someone asks why. Correct the constant when this document is signed off.

## RR's role — the line that keeps this from becoming an ERP
**RR reconciles and produces the entry; JDE posts and remembers.** RR is not the
book of record. It surfaces the gap, explains it, and assembles the correcting
entry the accountant reviews and exports to post in JDE. Anything that requires RR
to *remember state across periods, post, or run a schedule* is JDE's job, not RR's.

---

## 1. Materiality — when a gap is worth acting on
- Out-of-balance under **$100** (absolute) → **immaterial** regardless of %.
  [OWNER — set 2026-07-07, **re-confirmed current 2026-08-27**; matches `RRV8/config.js:498`.]
- GL balance under **$1,000** → **dormant / near-zero**; a % of a ~0 balance is
  meaningless, so frame by **absolute amount** and suppress the %.
  [OWNER — **re-confirmed current 2026-08-27**; matches `RRV8/config.js:498`.]
- Otherwise judge by the out-of-balance as a share of the GL balance, where **well
  under about 1% is immaterial**. [OWNER 2026-08-27 — and the softness is the point.]
  **This is deliberately not a hard band, and writing it as `>= 1%` would be a
  regression.** A hard boundary makes 0.99% and 1.01% categorically different, which
  is not how the judgment works; the soft form lets a 1.2% gap on a large balance be
  weighed against a 0.9% gap on a small one. The shipped grounding says it the soft
  way (`RRV8/config.js:498`, read 2026-08-27) and this line now matches it. An earlier
  draft here stated a hard `>= 1%` band — that was the doc drifting from the product,
  not a policy the owner set.
- **Judge materiality over the most recent TWO loaded periods, not one.** One period
  gives an amount; two show whether it recurs, and recurrence is what separates a
  one-off correcting entry from something that needs a source fix. The periods are
  whatever the database actually loaded, in its own fiscal calendar — not necessarily
  month-ends and not necessarily adjacent on a calendar. Say which two were used.
  (Owner ruling 2026-08-20, raised to a platform-wide definition of "current";
  authored once as `_core.md` INV-5 and composed into every generated catalog.)
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
| Cardex | `CardexVar` | Analyst | The item ledger does not sum to on-hand for an item (F4111 vs F41021). **Cannot be journaled** — people try. Fixed in JDE at the source, or synced in place by the analyst once JDE is validated. |

**Rule:** the adjusting-entry amount is **carry-forward + transactions + manual
entries** only. It excludes unposted / end-of-day timing and cardex. Journaling the
full out-of-balance when timing is present over-corrects and creates a new gap next
period. (Wired 2026-07-07: `_oeBuild` + the timing soft-warning.)

**The six components are an identity, and two of them SUBTRACT:**

```
BegVar + Variance + JEs + CardexVar − UnpostBatch − EndofDay = OOB
```

Measured 2026-08-19 across all three demo databases on every row where the
out-of-balance is at least a dollar: zero misses on two of them, and four misses of
exactly one cent on the third (one account, four periods) — float dust, so a check
needs a one-cent tolerance plus a float epsilon rather than an exact compare. It holds
at company grain as well, and the error does not grow with the number of accounts
summed. **Adding the two timing components instead of subtracting them does not
produce a small error — it doubles it**, because unposted GL is already inside the
ending GL figure and has to come back out to reconcile against perpetual.
([[reference_inventory_variance_taxonomy]].)

**Show every component, zeros included.** In an equation a hidden term and a zero term
are indistinguishable, so dropping zeros defeats the tie-out the drawer is claiming.
One exception, owner 2026-08-19: the per-account chip row hides Cardex **when it is
zero**, because it is the analyst's and the chips have to fit one line — conditionally,
never unconditionally, since on an account where it carries an amount the chips would
otherwise sum to something other than the stated total.

**Diagnostic split that decides two of the rows.** Distinguish End of Day from
Transactions by *what reached the GL*, not by which gap it is. GL got **zero** —
nothing posted, no batch, the sales or manufacturing update has not run — that is End
of Day, and the fix is finishing the process. GL got a **different non-zero amount** —
it did reach the GL, just not in full — that is a transaction variance and it is
journal-able. A 10-versus-5 break is a transaction variance, not End of Day (owner
correction 2026-06-09).

## 3. Reclass vs. journal entry
- A transaction posted to the **wrong period or wrong account** → **reclass** (move
  it), not a new balancing JE. [OWNER — confirmed 2026-08-27; the shipped grounding
  states it the same way at `RRV8/config.js:500`.]
- **A reclass is the ACCOUNTANT's.** It moves already-posted value between accounts,
  which makes it a financial transaction, and financial transactions are the
  accountant's lane. [OWNER ruling 2026-08-27, closing a call open since 2026-07-07.]
  It was already the shipped answer in six places in `RRV8/config.js` (:500, :524,
  :525, :1466, :1688, :2336, :2383 — read 2026-08-27); the question was open on paper
  only.
- **But read it as TWO LANES, not one owner, because a misposting always needs both.**
  The accountant reclassifies what already posted; the analyst fixes the source so the
  next posting lands correctly and the reclass is not needed again next period. Always
  both, and the two are not alternatives — a reclass with no source fix buys one
  period. The shipped non-stock guidance is the worked example: correct the GL class on
  the items so non-stock lines stop resolving to inventory (analyst), **and**
  reclassify the already-posted non-stock value out of the inventory account
  (accountant).
- This is exactly the role axis in §7 applied to one action: the analyst's lane is
  making JDE post correctly going forward, the accountant's is the GL's current state
  being wrong. A misposting is both at once, which is why it reads as ambiguous until
  you split it.
- A roll-forward **break** (red dot) is **not the accountant's and not a JE**, and
  there is no manual lever to prescribe. RR recomputes the entire period timeline on
  every refresh with no days-back window, so a recompute-fixable break clears on the
  next run on its own. A break that survives a refresh goes to the customer's own IT
  department. **Never prescribe a re-roll** — the manual per-company re-roll was
  retired and its card was cut from the roll-forward page
  ([[reference_varok_break_resolution]]).

## 4. Carry-forward — amortization / absorption
A large carry-forward is the prior period's unresolved balance rolling in. Options:
- **Book it now** — one adjusting entry this period.
- **Absorb over N periods** — when the carry-forward is **> 25% of the company's GL
  balance OR > $50,000** (whichever hits first) [OWNER — set 2026-07-07,
  **re-confirmed current 2026-08-27**], the accountant may spread it over
  **about 6 periods** (default N) rather than take it all at once, to avoid a lumpy P&L
  hit. [OWNER — N=6 set 2026-07-07, **re-confirmed current 2026-08-27**.] Both figures
  match the shipped grounding at `RRV8/config.js:501`.

**How RR helps (and where it stops):** RR *advises only* — when the threshold hits,
the per-company AI read flags the large carry-forward and states the per-period figure
(**carry-forward ÷ 6**). RR does **not** build the fractional entry, track the
remaining balance, or auto-generate future entries — the **schedule lives in JDE**
(recurring JE / allocation). [OWNER — boundary confirmed 2026-07-07]  *(Advisory only:
no split-builder, no deferral account, no schedule — UI-20.)*

## 5. The adjusting entry — mechanics
- One offset account **per inventory account**, entered on the grid — no generic
  clearing account (self-clearing, correctly classified).
- **Per-line offsets are already MANDATORY in the shipped product, and they gate the
  Complete button.** Corrected 2026-08-27: an earlier draft of this section described
  a single configurable clearing account as v1 behaviour and per-account offsets as an
  aspiration. **Both halves of that were wrong.** There is no single-clearing-account
  path in the product — the Complete control is disabled unless the entry balances
  **and** every row carries a real offset account
  (`RRV8/home.html:8033`, `doneBtn.disabled = !balanced || hasDefault`, read
  2026-08-27), and the button's own tooltip says a real offset is needed on every row.
  The shipped grounding says the same (`RRV8/config.js:502`). Write this as the normal
  path, because it is the only path.
- **The mapping PERSISTS as of 2026-08-27 (UI-162).** `dbo.RGlOffsetAccount` stores it per
  database, keyed company + GL account, behind `GET`/`PUT`/`DELETE
  /inventory/gl-offset-account`; V8 pre-fills each row from it. Deliberately server-side
  rather than browser storage, because this is accounting configuration a second
  accountant on another machine must see. Two guards the accountant should know about:
  every pre-filled value carries a provenance line naming where it came from, and a
  **retired** offset pre-fills nothing and names itself in red rather than silently
  seeding a dead account. Before this shipped the mapping was retyped every period and
  a page reload lost it.
- ⚠ **What is actually missing is PERSISTENCE, and that is a product gap — UI-162.**
  The per-line offsets the accountant types are held in memory only and are cleared on
  a database switch, so the same offsets are re-keyed every period. [OWNER ruling
  2026-08-27: they should persist.] Until UI-162 ships, do not tell an accountant the
  offsets are remembered — they are not, and the entry is re-keyed from scratch each
  time.
- Direction: **[OWNER — Perpetual → GL selected 2026-07-07]** reconcile toward the
  GL figure; the "Flip direction" control lets you verify the Dr/Cr both ways.
- Excludes timing (§2). Two lines per gap (original account + its offset), classic
  Date · Account · Debit · Credit.
- **Currencies are never mixed.** The worksheet is built per company, and a company's
  accounts carry one currency. (As built in the balancing-entry matrix, 2026-06-30.)
- **Every number on the entry is the deterministic reconciliation figure. None of them
  is AI-generated.** The AI writes the summary line and animates the reveal; it never
  produces an amount, because a wrong amount is a wrong journal entry. Agreed guardrail,
  2026-06-30 — do not relax it.
- **There is ONE floor, it is the $100 materiality floor from §1, and it is applied in
  one place.** Corrected 2026-08-27: the earlier draft described a separate sub-dollar
  line-level floor applied only on export. **Neither exists.** The shared builder
  filters accounts on `abs(OOB) >= 100` before any line is composed
  (`RRV8/home.html:7915`, against `MAT_OOB_FLOOR = 100` at `:6822`, read 2026-08-27),
  and the export loop adds no filter of its own — it walks the pairs the builder already
  produced. So **the on-screen worksheet and the exports agree by construction**, not by
  two rules that happen to match, and there is nothing to reconcile between them. The
  floor is per **account**, and the set it admits is exactly the set the Accounts grid
  shows as out of balance. No code change was needed here; the document was wrong.
  [OWNER confirmed as shipped, 2026-08-27.]
- **Export shape — confirmed as shipped, 2026-08-27.** One tab per company. The paste
  block is **three columns: Account Number · Amount · Explanation**, pasted into the
  P0911 Account Distribution grid. (An earlier draft listed a six-column layout with
  Business Unit / Object / Subsidiary broken out; that is not what ships.) Two lines per
  gap — the inventory account, then its offset on the opposite side — with amounts
  signed **Dr positive and Cr in parentheses**. Above the block, a header strip carries
  the company, the period ending and the verification code, and instructs the accountant
  to type `<code> Inv recon` into the JDE Explanation field; below it, a balance check
  that should read zero.
- ⚠ **The Explanation string is capped at 30 characters and that cap is load-bearing.**
  It is sliced to 30 on both the modal and the export path (`RRV8/home.html:8056`), which
  is what keeps the verification code intact all the way into F0911.GLEXA — and the
  unverified-to-verified lifecycle in §6 is a match against exactly that field. Shortening
  the code, lengthening the suffix, or letting the string grow past the cap breaks
  verification silently: the entry posts fine and simply never flips to verified.

## 6. There is no period close — the lifecycle is Journal Entry Complete
**RR has no period close and no attestation. Delete both from your mental model.**
[OWNER ruling 2026-08-27.] This section is **rewritten**, not confirmed: an earlier
draft described the accountant attesting a period complete and every company reaching a
terminal disposition before sign-off. That is gone, and it went for the reasons the
standing rules predict — RR is a tool rather than a system of record, and a utility
rather than law enforcement, so gates and attestations get cut
([[feedback_rr_utility_not_enforcement]], [[project_rr_tool_not_system_of_record]]).

What exists instead is a **per-company Journal Entry Complete marker**, and it has a
two-state lifecycle the accountant should understand, because the second state is not
theirs to set:

- **Unverified.** Completing the entry records one row per company and period — the
  verification code, the amount, the offset account, the entry type — with status
  `unverified`. This fires when the workbook reaches the disk. **An export is not a
  posting**, and the marker says so honestly rather than claiming a correction was made.
- **Verified.** A later load matches the verification code against the Explanation on
  the posted journal entry in the GL (F0911.GLEXA) and flips the row to verified, which
  is what the Audit tab then shows. **Verification is earned by the ledger, not asserted
  by the accountant** — nothing in the browser can set it. Post without typing the code
  into the Explanation and the entry stays awaiting posting forever, which is why the
  30-character cap in §5 matters.
  (Mechanism read from `_oeComplete()`, `RRV8/home.html:8108` and the store call at
  `:8217`, 2026-08-27.)

**When the variance changes after the entry was recorded: FLAG IT, DO NOT TOUCH IT.**
[OWNER ruling 2026-08-27.] The record stands as a true statement of what was journaled
and when — that is its whole value to an auditor months later. Audit shows a *variance
changed since this entry* marker; nothing is rewritten and nothing goes silently stale.
**The auto-reopen idea is dead**, and not because it was rejected on its merits: there
is no close to reopen. A question about reopening a closed period is a question about a
mechanism that does not exist.

## 7. Where the accountant's work comes from — the analyst handoff

### The role axis — stated once, and every section inherits it
Owner-confirmed 2026-08-27, and this is the whole test:

> The analyst's lane is making JDE produce correct postings going forward — even when
> that action itself posts. The accountant's lane is the GL's current state being wrong:
> value in the wrong account, or value that never arrived.

The analyst owns prevention at the source; the accountant owns correcting what the GL
says today. Two consequences that catch people out, both settled by this axis rather
than argued case by case: a **dollars-only inventory adjustment keyed in JDE stays the
ANALYST's even though it posts**, because the axis turns on where the action is taken;
and a **real value gap that never reached the GL is the ACCOUNTANT's even though
nothing posted**, because the GL's current state is wrong. Do not re-derive this per
section — §3's reclass rule and the components table in §2 both just apply it.

⚠ **The axis is analyst-versus-accountant only.** It does not decide whether an RR
Administrator function belongs in an analyst's workflow; that boundary is settled
separately, in the analyst-side companion
([`analyst-reference.md`](analyst-reference.md)), where the ruling is that the ladder
**names the request** as its own step.

### The handoff
The analyst and the accountant are the two ends of one loop
([[project_analyst_accountant_role_split]]).

- **The analyst's deliverable is a finding, not an entry.** Analysts investigate the
  root cause and fix it at the source; they do not post journal entries and, per the
  2026-07-20 rule, do not deal in them at all. A residual they cannot fix at the source
  reaches the accountant as a written finding.
- **The Audit Center is the wired handoff surface.** Cardex clears and transaction-
  variance findings already post there as analyst entries. It is not an unbuilt idea.
- **A finding is what justifies the entry, and it is what an auditor reads months
  later:** what happened, why it happened, what was done to stop it recurring. Treat it
  as the support for the posting, not as background reading.
- **Scope guard:** the Audit Center is a convenience and backup view, not an audit of
  record. RR carries no immutability, versioning or legal-hold machinery, and notes are
  overwritten with a last-edited stamp rather than versioned.
- **Something DOES flow back, and it is a read-only narrative — which is the right
  shape.** [OWNER ruling 2026-08-27.] An earlier draft here claimed the loop was
  documented in one direction only; that was wrong. A pass on the analyst's Home reads
  both the analyst's own card records and the accountant's entry records and tells the
  analyst **what accounting actually did** for that company and period
  (`RRV8/home.html:9874`, read 2026-08-27).
- **It is deliberately careful not to overstate, in two specific ways**, and both are
  worth knowing because they are the two ways an earlier version of that text lied:
  an **export is not a posting**, so an unverified entry reads as exported-not-yet-
  verified rather than as a correction made; and **three of the four dispositions are
  decisions NOT to adjust** — accepting a period as immaterial, handing it to the
  analyst, or calling it timing. Only a posted, verified entry is reported as a journal
  adjustment.
- **It changes nothing on the card, and that is correct.** The feedback is narrative,
  not state: it does not close a card, reopen one, or alter a finding. That is the same
  flag-do-not-mutate rule §6 applies to a variance that moves after the entry was
  recorded — the record stands as a true statement of what happened, and a second actor
  never silently rewrites it.

## 8. Reconciliation honesty — the source-of-truth total vs. the details total
Owner principle 2026-07-07. Whenever a read states a "total to resolve," it must show
**both** the authoritative total **and** the details total, and be up front that the two
will not match exactly. They are computed from different datasets: the authoritative net
variance for a company and period comes from the account roll-forward, while the detail
cards are built from the reconciling-items residual. The difference is whatever was
auto-netted or sits within tolerance.

So the honest shape is: *authoritative figure X; actionable detail cards total Y; the
difference Z is netted or within tolerance and is not individually actionable.* **Never
claim the details sum back to or tie to the source of truth** — that assertion was a
real bug on the analyst side, and the same honesty applies to accountant reads. A stated
but false tie is noise that erodes trust ([[feedback_all_signal_no_noise]]).

## 9. Conventions & tone
- **Sign:** stored/displayed natural so the reconciliation ties to the KPI; OOB
  `*-1` only in Excel/PDF. (`reference_transactions_sign_convention`.)
- **Audience:** JDE-fluent finance, not IT. Plain accountant English; JDE artifacts
  (F4111, F0911, AAI) are fine, but no plumbing terms (token, endpoint, sproc).
  Never expose internal view, procedure or endpoint names in anything the reader sees
  ([[feedback_rr_product_voice]]).
- **Prior/closed periods:** already journaled — never prescribe an entry for them;
  use history only to explain a current balance (a carry-forward's source is the
  prior period).
- **Never name the reader in the third person.** A fact block that says "the customer
  should run X" comes straight back out as an answer addressed to the person who *is*
  the customer — measured on the Home day-brief, 2026-08-09. State what is true of the
  data; put instructions to the model in a clearly labelled block that is not for
  quoting.
- **Escalation goes to the customer's own IT department**, never to GSI and never to a
  vendor support address. RR is a customer-maintainable product; routing the reader to
  the vendor contradicts the whole premise (owner rule 2026-07-21).
- **Do not frame JD Edwards as broken.** Variance is a gap, a timing difference, a
  seam — not a crack, a flaw or a bug. The reader runs JDE.
- **A variance is always a difference.** "Expected" or "explained" describes the *cause*
  of a gap you can account for; it never downgrades the gap to "not a variance." Every
  variance gets a disposition — explained / no action, or unexplained / investigate —
  and never the label "not a real variance" (`_core.md` INV-1).

## 10. Implementation notes — not policy, and not for the AI
Kept here so the policy sections above stay in accountant English. None of this belongs
in `ACCT_GROUNDING`.

- **The suggested-entry data source is a known trap.** Build the entry from the
  per-account out-of-balance view that nets to the true company figure, never from the
  older gross view: that one includes structural mapping accounts which net away at
  company level, so an entry built from it overstates wildly — one specimen company
  grossed to +106K against a true net of −3,881 (verified live 2026-06-30,
  [[project_period_end_je_generator]]).
- **Auditor backup** reuses the existing transaction-level audit-detail call rather than
  a new export.
- The on-screen worksheet renders from data the page already holds, so it needs no
  round trip; the Excel export does.

## 11. SME calls — answered 2026-08-27
The queue is closed. This is the record of what was ruled, kept so nobody reopens a
settled question, and so the four **corrections** are not mistaken for confirmations.

| # | Section | Ruling |
|---|---|---|
| 1 | §1 | **Keep the band SOFT** — well under about 1% is immaterial. A hard `>= 1%` is a regression, not a tightening. |
| 2 | §3 | **A reclass is the ACCOUNTANT's**, and every misposting also needs an analyst source fix. Two lanes, always both. |
| 3 | §5 | **CORRECTION.** Per-line offsets are already mandatory and gate the Complete button. There is no single-clearing-account path. The gap is persistence — **UI-162**. |
| 4 | §5 | **CORRECTION.** One floor, `$100`, applied per account in the shared builder. No `$1` line floor, no export-only filter; worksheet and export agree by construction. |
| 5 | §5 | **Confirmed as shipped** — three columns, Account Number / Amount / Explanation, into the P0911 grid. The 30-character Explanation cap is load-bearing. |
| 6 | §6 | **CORRECTION.** No period close and no attestation. Per-company Journal Entry Complete, unverified until the ledger verifies the code. |
| 7 | §6 | **Moot** — there is no close to reopen. A variance that moves after the entry is **flagged, never rewritten**. |
| 8 | §7 | **CORRECTION.** Feedback already flows back, as a read-only narrative that changes nothing on the card. |
| 9 | Cross-cutting | **All four standing numbers re-confirmed current** — `$100` out-of-balance, `$1,000` dormant, 25% / `$50,000` carry-forward, about 6 periods. |

**Two of these are product gaps rather than doc corrections, and the sections above
describe what ships and point here — never the gap as though it works:**

- **UI-162** — per-line offsets are mandatory but nothing persists them across a
  database switch (§5).
- **UI-161** — the cardex tolerance is per company only; the owner's ruling is per
  company **and** per item, with the suppression visible where it acts. Analyst-side, so
  it is carried in [`analyst-reference.md`](analyst-reference.md); noted here because a
  tolerance decides what reaches the accountant as work.

**Still to do before `ACCT_GROUNDING` ships as final, and not an SME question:** the
constant still carries the wrong reason for cardex (see the warning at the top of this
document), and so does the proposal at `AnalysisGuides/_grounding/acct.md`. That is a
defect to fix in those two files, not a policy to decide here.

---

*Author policy here the way you curate `dmaai-reference.md`. When a section
stabilizes, mirror its essence into `RRV8.ACCT_GROUNDING` so the AI reasons from it —
and see the note in §"Keep in sync" on making that mirroring automatic instead of manual.*
