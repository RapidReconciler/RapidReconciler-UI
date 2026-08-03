# Analyst AI Grounding — Distillation Review Package (PROPOSAL ONLY)

**Status:** DRAFT 2026-07-18 — proposal for owner (analyst/accounting SME) review.
**Nothing live has been changed.** `RRV8/config.js` still carries the current
hand-authored catalogs verbatim; `build-ai-grounding.py` still lists all five
analyst topics as passthrough. This document proposes distilled replacements so
the five can *eventually* join the doc-sourced grounding pipeline, and flags
every place the source guide and the current catalog disagree.

## What this is for

`RRV8/config.js` exposes six `RRV8.*_GROUNDING` catalogs. ADMIN is now generated
from HTML docs by `Tools/build-ai-grounding.py`. The other five (ACCT, ANALYST,
CARDEX, ROLLFORWARD, ASOF) are hand-authored policy that a mechanical extractor
would wreck if pointed at their 700–1400-line source references. The goal is a
distilled block per topic at the **same altitude as today's catalog** —
reconciliation *policy the AI reasons from* (signatures, causes, decisions), not
a doc dump — that preserves every substantive rule and, where the guide is
richer, improves on it.

Per memory `feedback_analytical_knowledge_one_source` (one catalog, two
altitudes; change one, sync all): promoting a topic makes its guide the single
upstream source and the catalog a generated downstream artifact. That is the
one-source end state. Until then these stay hand-authored.

## Bottom line — promotion readiness

| Topic | Source guide | Distillation vs current | Recommendation |
|---|---|---|---|
| **ACCT** | `docs/plans/accounting-reference.md` (109 lines, clean, single-source) | Faithful + 2 small adds | **Confident promote** after owner OKs 2 adds. Best candidate. |
| **ANALYST** | `AnalysisGuides/transaction-detail-analysis.md` (1382 lines) | Current is already SME-grade; 1 optional add | **Promote after SME review.** Distillation is equal-or-better; the guide's depth is deliberately compressed. |
| **CARDEX** | `AnalysisGuides/cardex-variance-analysis.md` (749 lines) | Faithful + 3 substantive adds | **Promote after SME review.** Adds close real correctness gaps; trust-boundary rule preserved. |
| **ROLLFORWARD** | `AnalysisGuides/inv-account-roll-forward-analysis.md` (709 lines) | **Guide and catalog encode different knowledge** | **Keep hand-authored; SME review of MERGED block.** Cannot be promoted from the guide alone without regressing. Biggest flag. |
| **ASOF** | *none* | Couldn't cleanly source | **Not promotable yet.** No dedicated guide; model is spread across `cardex-variance-analysis.md` §2.1–2.2 (perpetual) + `inventory-asof.html` UI copy (residual optimizer). |

## Cross-cutting blocker (applies to all five)

`build-ai-grounding.py`'s extractor is a stdlib **`HTMLParser`** (`class
Extractor(HTMLParser)`). All five proposed sources are **Markdown** (`.md`).
Feeding `.md` to the HTML extractor yields garbage. So "join the pipeline"
requires a generator change **regardless of catalog quality** — either:

1. render each curated distilled source to HTML and point `SOURCES` at it, or
2. add a Markdown-aware read path (read a fenced `GROUNDING` block from the
   curated `.md` verbatim — closest to the passthrough intent).

The candidate liftable sources under `AnalysisGuides/_grounding/<topic>.md` (see
below) are written as **already-distilled** curated sections precisely so a
future generator can lift them whole instead of extracting from the long
reference. That is the "clean, distilled source" the passthrough-pending comment
in `build-ai-grounding.py` is waiting on.

---

## 1. ACCT — Accounting policy (reconciliation)

**Source:** `docs/plans/accounting-reference.md`. Short, structured, single-source,
and already the declared SOURCE OF TRUTH for the catalog. The current catalog is
a faithful distillation of it.

### Guide → catalog agreement
Materiality floors ($100 OOB / $1,000 dormant / ~1% band), the six variance
components and who owns each (carry-forward / transactions / manual = accountant;
unposted batch + end-of-day = operations timing, never journal; cardex = analyst
re-roll), reclass-vs-JE, the 25%/$50k carry-forward amortization over ~6 periods
(advise only), one real offset per inventory account, closed-period handling, and
the JDE-fluent audience rule — **all present and accurate in the current
catalog.** No disagreements found.

### Proposed changes (2 small adds, nothing removed)
- **ADD** the direction convention to the adjusting-entry bullet: reconcile
  toward the GL figure (Perpetual→GL, confirmed 2026-07-07 in guide §5) with the
  Flip-direction control to verify Dr/Cr both ways. The catalog currently omits
  direction entirely.
- **ADD** a period-close bullet (guide §6): closing a period in RR is an
  **attestation**, not a GL close — every company reaches a terminal disposition
  (reconciled / immaterial / adjusted / with-analyst) before sign-off; JDE closes
  the books. Reinforces `feedback_rr_utility_not_enforcement` and
  `project_rr_tool_not_system_of_record`.

### SME judgment calls to confirm
- The guide is marked **DRAFT** with `[OWNER]` / `[VERIFY]` tags on the exact
  thresholds. Promoting makes those draft values the live grounding — confirm
  the $100 / $1,000 / ~1% / 25% / $50k / N=6 numbers are final before generating.
- The guide's §7 sign convention ("stored/displayed natural; OOB `*-1` only in
  Excel/PDF") is plumbing detail the current catalog correctly omits — keep it
  out of grounding.

### PROPOSED distilled block (drop-in replacement for `RRV8.ACCT_GROUNDING`)
```js
window.RRV8.ACCT_GROUNDING = [
  'ACCOUNTING POLICY (reconciliation) — reason from these rules:',
  '- RR reconciles inventory to GL; JDE is the book of record. You surface the gap, explain it, and produce the correcting entry the accountant posts in JDE. RR does not post, hold the ledger, or run schedules.',
  '- Materiality: an out-of-balance under $100 is immaterial regardless of %; a GL balance under $1,000 is dormant/near-zero — frame by absolute amount and suppress the %. Otherwise judge by the gap as a share of the GL balance (well under ~1% is immaterial).',
  '- The out-of-balance decomposes into components. ACCOUNTANT-OWNED (journal these): carry forward, transactions, manual entries. NOT the accountant\'s: unposted GL batches + end-of-day (operations timing — self-clears when operations posts, never journal it) and cardex (an analyst re-roll, not a JE). The adjusting entry uses ONLY the accountant-owned amount; never journal the timing.',
  '- Reclass vs JE: a transaction in the wrong period/account is a reclass, not a new balancing JE. A roll-forward break (red dot) is an analyst re-roll, not the accountant\'s and not a JE.',
  '- Large carry-forward: when a company\'s carry-forward exceeds 25% of its GL balance OR $50,000 (whichever first), advise absorbing it over ~6 periods (per-period = carry-forward / 6) rather than booking it all at once, to avoid a lumpy P&L hit. Advise ONLY — do not build the fractional entry; the amortization schedule lives in JDE, not RR.',
  '- Adjusting entry: one real offset account per inventory account (no generic clearing account); excludes timing; two lines per gap (original account + its offset). Direction reconciles toward the GL figure (Perpetual→GL); the Flip-direction control verifies the Dr/Cr both ways.',
  '- Closed/prior periods are already journaled — never prescribe an entry for them; a carry-forward\'s source is the prior period.',
  '- Closing a period in RR is an attestation, not a GL close: every company reaches a terminal disposition (reconciled / immaterial / adjusted / with-analyst) before sign-off. JDE closes the books; RR records that the reconciliation is complete.',
  '- Audience is JDE-fluent finance, not IT: plain accountant English; JDE artifacts (F4111, F0911, AAI) are fine, no plumbing terms.'
].join('\n');
```

---

## 2. ANALYST — Transaction variance policy

**Source:** `AnalysisGuides/transaction-detail-analysis.md` (1382 lines; the
analyzer's own pattern reference, patterns 5.1–5.20 + MTO). The current catalog
is already an SME-grade distillation — it correctly encodes the screen order
(duplicate-sales first, batch-type-V voucher routing, GL-only non-stock line,
in-transit-is-a-separate-surface), the MTO three-shape decomposition, and the
source-fix-not-JE stance.

### Guide → catalog agreement
Every rule in the current catalog traces to the guide:
- Per-document reconciliation (cardex − ledger for the same doc) → guide §3.10
  Rule 6.
- Duplicate-sales-first (`dbo.RDuplicateSales`, variance = duplicated relief,
  source fix) → §5.17.
- Transfer legs independent; in-transit (ST↔OT, 4220/4245) is a separate surface
  → §3.10 Rule 6, §5.18.
- GL-only row = non-stock/surcharge line type N (F40205 Inventory Interface),
  expected, check line type first → §5.2, §3.10 Rule 1.
- A/P voucher (batch type V) on an inventory account = 4220 routing error, source
  fix → §5.15.
- MTO = business grouping, split by shape (GL-only expected; both-differ = 5.16
  investigate large; cardex-only = 5.19 repost via R31802A) → §5.20.

  > **Superseded 2026-08-03.** The "repost via R31802A" remedy recorded above is a
  > fabrication. It has since been removed from the classifier, the analyst guide, the
  > AI grounding, the UI copy and the analyzer engine. There is no repost. A completion
  > reaches F4111 with no batch number and no G/L date, and R31802A stamps the batch and
  > writes the F0911 journal entries in the same step, so a batch on the row means the
  > program already ran. The same run resets Unaccounted Units, which are what drive its
  > selection, so it cannot pick the transaction up a second time. The cardex-only shape
  > is a genuine gap: the run wrote no F0911 completion detail for the order.
  > Vendor-documented as Oracle Support KB 420628, abstract only, body behind the My
  > Oracle Support login, so the remedy is unknown. Match failures are the secondary set,
  > and confirmation is per work order rather than per batch. The rest of the bullet
  > stands: MTO is still a business grouping split by shape, and the GL-only and
  > both-differ branches are unaffected. Current text: `usp8_txv_flags` block `-- D.` and
  > `AnalysisGuides/manufacturing-accounting-flow.md`.
- Materiality lead; analyst does source work, accountant owns JEs; JDE-fluent
  audience → §1.4, §5, §7.

No disagreements found. The catalog compresses the guide faithfully.

### Proposed changes (1 optional add)
- **OPTIONAL ADD** — the Unassigned / missing-model-table rule (guide §3.1, §5.1):
  when a GL class code is missing from DMAAI model table 4152, its cardex rows go
  to the Unassigned section and are **excluded** from the reconciliation, so the
  **displayed variance is understated** (true = F4111 Total + Unassigned Total).
  The AI should not treat a small displayed variance as the whole story when an
  Unassigned section is present. This is a real reasoning trap the current
  catalog doesn't cover. Adds one bullet; SME to decide if it earns its place at
  this altitude (it is arguably analyzer-detects-it territory, but the AI reads
  the same export text).

### SME judgment calls to confirm
- Whether to keep the MTO bullet as long as it is (it is the single longest
  bullet and encodes three sub-decisions). It reads as signal, not noise, per
  `feedback_all_signal_no_noise`, so the proposal keeps it verbatim.
- Analyzer-output specifics (misposted-amount headline, T-account matrix, P1/P2/P3
  retirement) are correctly **excluded** — that is workbook-rendering policy, not
  AI reasoning policy.

### PROPOSED distilled block
Recommend promoting the **current block essentially unchanged** (it is already an
equal-or-better distillation) with the optional Unassigned bullet inserted after
the per-document bullet if the SME approves. Full text with the optional add is in
`AnalysisGuides/_grounding/analyst.md`. Every current bullet is preserved
byte-for-byte; only the optional bullet is new.

---

## 3. CARDEX — Cardex variance policy

**Source:** `AnalysisGuides/cardex-variance-analysis.md` (749 lines). The catalog's
declared SOURCE OF TRUTH is "the analyst's JDE validation workflow (P4111 export +
sum vs F41021 header)," which the guide's Section 6.1 documents in full. The guide
corroborates and enriches the catalog.

### Guide → catalog agreement
- Definition (F4111 sum ≠ F41021 on-hand; QuantityVar on qty, AmountVar on
  extended cost; inventory-internal, not the ledger-vs-GL gap) → guide §2, §2.3.
- Step 1 is always the JDE validation (export F4111, sum, compare to F41021) →
  §6.1.
- Remedy fork: JDE out of balance = real, fix at source in JDE (common case
  F41021 not updating); JDE ties but RR shows variance = RR load/roll artifact,
  fix with reversible Adjust Beginning Balance → §6.1 table, §7.
- Quantity-first; amount-only points at cost/valuation → §2.3, Step 5.
- Cardex variance cannot be journaled → §7, throughout.
- Don't auto-classify glitch vs load-timing; RR can't see live JDE (trust
  boundary) → §2.1 note, §6.1.

No disagreements found.

### Proposed changes (3 substantive adds, nothing removed)
- **ADD** the memo-row exclusion: when summing F4111, **exclude ILIPCD = "X"
  memo rows** (work-order scrap, lot releases, certain warehouse moves) — they
  don't affect on-hand and including them produces a false variance (guide §2.2,
  §6.1 step 2). Without this the AI may tell the analyst to sum every row. Real
  correctness gap.
- **ADD** the cost-level scope rule: level 1/2 items reconcile at branch/item
  (all locations and lots together); level 3 items reconcile per location and lot
  (guide §2.2, §3.4). Wrong aggregation scope manufactures a false variance.
- **ADD** the three Adjust-Beginning-Balance presets by name — **Clear to JDE**
  (variance nets to zero; JDE confirmed correct), **Zero opening**, **Manual**
  (type the known-correct opening) — plus the reversible Adjustment ledger
  (guide §7). The catalog currently names only the generic action.
- **OPTIONAL** tentative root-cause candidates so the AI's "name a likely cause
  tentatively" is SME-grounded, not generic: dollar-only → WAC escalation after a
  higher-cost receipt/revaluation, IK BOM-cost premium, or a post-depletion PI
  revaluation; quantity → an IA that posted to F4111 but didn't update F41021, or
  a pre-go-live gap embedded in the back-calculated beginning balance (guide §5a–5i).
  Keep it tentative to respect the trust boundary.

### SME judgment calls to confirm
- The current catalog names **"P4111"** (Work With Item Ledger) as the JDE
  program; the guide says "the item ledger screen" without the code. P4111 is the
  correct standard JDE inquiry program, so the catalog is *more* specific, not
  wrong. Keep P4111.
- Whether the tentative root-cause bullet is worth the length. It sharpens the
  AI's answer but edges toward the auto-classification the trust-boundary rule
  warns against. Proposal marks it OPTIONAL and keeps every cause hedged.

### PROPOSED distilled block
Full text in `AnalysisGuides/_grounding/cardex.md`. All current bullets preserved;
three adds slotted in; the "DO NOT auto-classify" trust-boundary bullet is kept
intact and the optional root-cause bullet is written to sit under it so the hedge
governs it.

---

## 4. ROLLFORWARD — Account roll-forward policy  ⚠ BIGGEST FLAG

**Source the SOURCES map points at:** `AnalysisGuides/inv-account-roll-forward-analysis.md`.
**Where the catalog actually comes from:** the RRV8 roll-forward assistant page
`RRV8/inventory-account-rollforward.html` and its four live corrective cards
(`admin-reload-gl.html`, `admin-reload-cardex.html`, `inventory-reroll.html`, and
the inline R099102-attest gate). These are **two different altitudes of the same
corrective flow, and they disagree on vocabulary and on one rule.**

### The disagreement (must be reconciled by the owner, not silently merged)
- The **catalog** maps breaks to RR-UI levers: "R099102 repost and **Reload GL**
  fix GL-side breaks; **Re-roll companies** then **Reload Cardex** fix
  variance-side breaks," always GL-side first. Those lever names are real UI
  actions (confirmed: the four corrective cards on the page, with an
  R099102-attest gate that unlocks Reload GL).
- The **guide** never names Reload GL or Reload Cardex. Its corrective vocabulary
  is JDE-side: post batches via **P0011 + R09801**, **R099102** repost, **Reroll**
  on the Companies page, and **truncate + reimport F0911** for a data-load issue.
- **Substantive rule the catalog is MISSING:** the guide distinguishes a
  **late-posting batch** GL break (prior-period UnpostBatch explains the gap) —
  which self-corrects by **posting the batch in JDE, then re-importing** (Reload
  GL), with **no R099102 needed** — from an **F0902/F0911 misalignment** (all
  batches posted, gap remains) which **does** need R099102. The catalog collapses
  all GL-side breaks to "R099102 + Reload GL," which would send an analyst to
  R099102 on a break that only needed a batch posted. The page's own To-Do band
  already says "fix in JD Edwards, then Reload GL" for GL breaks, so the page is
  ahead of its own grounding here.

### Other diagnostic depth in the guide the catalog lacks
- **End-period OOB is expected** — only OOB in a *closed historical* period is a
  problem (guide §6.3, §4.4). Big false-positive suppressor; catalog silent.
- **VarOK breaks adjacent to a reset timestamp are expected artifacts**, not
  errors (guide §5.2, §7.5). Catalog silent.
- **Aged variance breaks (>3 periods old)** are the specific trigger for Re-roll
  (guide §5.5). Catalog says re-roll but not when.
- **Consecutive GLOK=no with PerGL=0 but changing BegGL = a data-load issue** →
  GSI truncate+reimport F0911, not a JDE fix at all (guide §7.3). Catalog silent.

### Why this can't be promoted from the guide alone
Generating ROLLFORWARD from the guide would **drop the Reload GL / Reload Cardex /
Re-roll lever mapping and the R099102-attest gate** — the exact operational
routing the assistant page depends on — and would swap in JDE-program language the
page deliberately abstracts. That's a regression on the one thing this catalog
exists to do. The right move is a **merged** block: keep the RR-UI levers +
GL-precedence, and fold in the guide's diagnostic refinements.

### PROPOSED merged block (drop-in replacement for `RRV8.ROLLFORWARD_GROUNDING`)
```js
window.RRV8.ROLLFORWARD_GROUNDING = [
  'ROLL-FORWARD POLICY (account roll-forward) — reason from these rules:',
  '- The account roll-forward keeps the inventory source-of-truth accurate period over period. A break is either GL-side (the GL roll-forward does not tie, GLOK=no) or variance-side (the cardex-to-GL variance roll-forward does not tie, VarOK=no).',
  '- Four corrective levers, grouped by side: R099102 repost and Reload GL fix GL-side breaks; Re-roll companies then Reload Cardex fix variance-side breaks. Reload GL re-imports F0902 into RR; Reload Cardex rebuilds the cardex from the break period (use only if a re-roll did not hold).',
  '- ALWAYS fix GL-side breaks before variance-side — a GL break feeds the variance, so clearing GL first often clears the variance without a re-roll.',
  '- GL-side breaks split by cause: (a) a late-posting batch (the prior period had an unposted batch that later posted) self-corrects once the batch is posted in JDE and RR re-imports — Reload GL, no R099102 needed; (b) an F0902/F0911 misalignment (all batches posted, gap remains) needs R099102 in JDE first, then Reload GL. Use R099102 only when a batch does not explain the gap.',
  '- End-period (current-period) out-of-balance is EXPECTED while a period is open — do not chase it. Only a non-zero OOB in a closed historical period is a real break. Likewise, a VarOK break next to a reset timestamp is an expected reset artifact, not an error.',
  '- Aged variance breaks (more than ~3 periods old) will not self-correct — Re-roll the affected companies, then Reload Cardex if the re-roll does not hold.',
  '- Consecutive GLOK breaks on one account with no GL activity but a shifting beginning balance are a RapidReconciler data-load problem, not a JDE issue — the fix is a GSI-assisted F0902/F0911 reimport, not a batch post or R099102.',
  '- This is analyst / operations maintenance, never a journal entry: the accountant does not journal a roll-forward break.',
  '- Audience is a JDE-fluent finance analyst: answer in 2-4 sentences, plain finance language; standard JDE program references (R099102, R09801, P0011) are fine; no SQL, endpoint, or table terms.'
].join('\n');
```

### SME judgment calls to confirm
- Confirm the merged block's Reload-GL-vs-R099102 split matches how you want the
  assistant to route. This proposal follows the guide (batch-post self-corrects
  without R099102) and the page's own To-Do copy.
- If ROLLFORWARD is ever generated, its source must be a **curated merged section**
  (see `AnalysisGuides/_grounding/rollforward.md`), not the guide — because the
  guide can't supply the lever names. Alternatively, keep this one permanently
  hand-authored; it is the topic least suited to mechanical generation.
- Keep the inline fallback string in `inventory-account-rollforward.html`
  (`triggerTodoAi`) in sync with whatever ships — it currently mirrors the old
  four-lever text and would drift.

---

## 5. ASOF — Perpetual / as-of inventory

**Source:** none dedicated. The perpetual model is documented in
`cardex-variance-analysis.md` §2.1–2.2 (how RR back-calculates the Balance Forward
from the F41021 go-live snapshot and rolls it forward); the Residual Optimizer is
described only in `RRV8/inventory-asof.html` UI copy (deterministic dust cutoff,
display-only, reversible, "Re-optimize"). No single guide to extract from — this
is the "couldn't cleanly source" topic the task anticipated.

### Guide → catalog agreement
The current 3-bullet catalog (perpetual = opening baseline maintained
transaction-by-transaction, compared to GL; residual noise = zero-qty rows with
tiny valuation the Residual Optimizer hides as a display filter; JDE-fluent
audience) is accurate against both the cardex guide §2.1–2.2 and the asof page
copy. No disagreements.

### Proposed changes (optional, minor)
- **OPTIONAL** clarify that the perpetual baseline is **back-calculated** from the
  F41021 on-hand snapshot at go-live (RR does not load decades of history), which
  is why the *earliest* period opens at a derived Balance Forward — grounds the
  common "why doesn't period 1 start at zero" question (cardex guide §2.1).
- **OPTIONAL** note the Residual Optimizer cutoff is **deterministic and
  reversible** and never deletes or touches material balances (asof page copy).
  The current catalog says "display filter only" — this just sharpens it.

### Recommendation
**Keep hand-authored.** Not promotable until a source exists. The curated section
`AnalysisGuides/_grounding/asof.md` can be the seed of that source (and could later
graduate into a short standalone as-of guide if the model grows).

---

## Files in this proposal (all NEW, nothing live changed)

- `docs/plans/analyst-grounding-distillation.md` — this review package.
- `AnalysisGuides/_grounding/acct.md`
- `AnalysisGuides/_grounding/analyst.md`
- `AnalysisGuides/_grounding/cardex.md`
- `AnalysisGuides/_grounding/rollforward.md`
- `AnalysisGuides/_grounding/asof.md`

Each `_grounding/*.md` carries the proposed distilled block as a ready-to-lift
curated section (clearly marked PROPOSAL), so a future generator step can read the
distilled source instead of extracting from the long reference. None of these
should ship until the owner has reviewed the disagreements above — a drifted
analyst catalog makes the AI confidently teach the wrong reconciliation decision.
