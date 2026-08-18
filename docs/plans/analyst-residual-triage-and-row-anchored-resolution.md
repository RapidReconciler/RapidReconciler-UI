# Analyst residual triage + row-anchored resolution

**Status:** design (attended build) · **Date:** 2026-07-13 · **Owner-designed with Claude**

Covers three connected changes to the analyst Transaction-Variance flow:
1. a Full-plan AI pass that triages the "Unclassified" residual so the analyst
   reviews clusters, not rows;
2. two classifier additions that keep nameable patterns out of the residual in
   the first place;
3. a row-anchored resolution model so an analyst's "complete" survives both a
   B&rarr;C rebuild and a later classifier change.

The unifying idea the owner set: **the right data in the right place makes the
right analysis.** The Transaction Detail workbook already assembles every fact a
call needs (F4111, both F0911 legs, the RR summary, the order-line history with
line types, the DMAAI mismatch flags). The AI on Full should read that assembled
context and reason like an analyst over it, at the scale of hundreds of
documents, so the owner never clicks through hundreds of workbooks by hand.

---

## One catalog, three consumers &mdash; no mixed messages

The same analytical knowledge drives three surfaces an analyst sees, and they
must never disagree. We watched them disagree: for doc 1125744 the analyzer
pop-up said "unposted batch" (wrong &mdash; F4111 PC is not a GL flag), the
classifier dumped it in Unclassified, and the grounding held the correct
account-mismatch rule. Three stories, one document.

The fix is a single **pattern catalog** &mdash; the analysis guide
(`AnalysisGuides/transaction-detail-analysis.md`) &mdash; where each pattern is
`{signature, card, WHY, HOW}`: how to detect it (PC / batch / line type /
account / BU), which card it maps to, the root cause, the corrective action.
Three consumers derive from it:

| Consumer | Derives | Location |
|---|---|---|
| **Classifier** | signature &rarr; card | `usp8_txv_*` (DB) |
| **AI grounding** | the compact reasoning copy | `ANALYST_GROUNDING` (config.js), `DMAAI_GROUNDING` (VALC) |
| **Analyzer pop-up** | signature &rarr; WHAT / WHY / HOW | `Tools/analyzer-engine.js` |

The grounding already follows this discipline (config.js: "SOURCE OF TRUTH = the
guide, keep in sync"). This extends it to the classifier and the analyzer. **Any
knowledge change touches all three in the same pass**, against a lightweight sync
checklist kept in the catalog. No compiler enforces it (three languages, three
repos), so the discipline *is* the mechanism &mdash; and the analyzer is
owner-held WIP, so its edits are attended, not autonomous. First two catalog
entries to reconcile: the PC-unposted bug (1125744) and the non-stock hedge
(1125513).

---

## The residual, defined

The "Unclassified" cards are the txv classifier's leftover:
`RCardexLedgerCompare2` rows with `recstatus = 1`, a blank `SubType`, grouped by
`Type` (Sales / Mfg / Inventory / Purchasing). They are heterogeneous by
construction &mdash; whatever the named cards could not claim lands here &mdash; so
handling them one row at a time is the most expensive path through the
least-organized data.

### Worked example (Demo1, Co 80002, period 2025-07-31, "Unclassified &mdash; Sales")

17 rows, net **$5,309.51**. A four-query pass splits cleanly into two clusters
that tie out exactly to the card total:

| Cluster | Rows | Net | Shape | Root cause |
|---|---|---|---|---|
| **A &mdash; BU mismatch** | 14 | +$7,118.12 | cardex &ne; 0, ledger = 0, batch > 0 | stock ships (line type S/W); cardex relieved to the **9999998 model** inventory account, GL relief posted to the real **9999842** BU |
| **B &mdash; non-stock mis-routing** | 3 | &minus;$1,808.61 | cardex = 0, ledger &ne; 0, batch > 0 | non-stock lines (**line type N**) whose GL value posted to the inventory account instead of a P&amp;L / clearing account |

7,118.12 &minus; 1,808.61 = 5,309.51. Nothing left over.

**Specimens:** doc `1125744` (Cluster A), doc `1125513` (Cluster B).

**Line type is the discriminator.** S/W (shippable / work-order) vs N
(non-stock) is what separates the two clusters and names each corrective action.
This is why the SDLNTY field has to reach the analyst surface &mdash; see the UI-35
dependency below.

### Two field-semantics facts this rests on
- **F4111 `PC` is not a GL flag.** It marks whether the row was updated into
  JDE's `F41112`, not whether it posted to GL. The GL-posted signal is the
  **batch number**: batch > 0 &rArr; it should be in GL. A cardex-only variance
  with a live batch is *posted*, so it is an account mismatch, not an unposted
  batch. (See memory `reference_f4111_pc_field_not_gl`.)
- **Non-stock is only "expected" off inventory.** A non-stock line (type N)
  posting to a P&amp;L account is normal and should be suppressed. A non-stock
  line posting to the *inventory* account (like 1125513) is a genuine routing
  variance to fix. The account it landed on is the tiebreaker.

---

## Part 1 &mdash; Full-plan analyst pass (downstream)

On Full, the AI grades the residual the way an analyst would, over the same
fields the workbook exposes.

- **Cluster deterministically by shape** &mdash; variance sign (cardex-only vs
  GL-only), the shared inventory account, and the order-type / line-type family.
  The heavy lifting is a `GROUP BY`, not a guess.
- **Per cluster, emit:** a representative document, the named corrective action,
  and a drafted finding into the card &rarr; Audit loop (the UI-34 spine).
- **Analyst reviews clusters, not rows.** For the worked example: two clusters,
  two corrective actions, two approvals &mdash; not seventeen workbooks.

**Tier ladder** (per `project_ai_tier_distinction_ladder`):
- *Grounded (base):* per-row facts (accounts, batch, line type, flags). Analyst
  still groups.
- *Scrubbed (mid):* cross-row clustering &mdash; "these 14 share the model-BU
  signature."
- *Full:* cluster + diagnose + name the corrective action + draft the finding.
  This is where the AI genuinely does the analyst's first pass.

The corrective action is what makes a cluster a *win* rather than a label: every
cluster the pass emits must carry a defined next step (align the AAI, correct the
non-stock routing, reclass the period), or it stays in the true-residual bucket
for a human.

---

## Part 2 &mdash; Classifier additions (upstream)

Every row the classifier names correctly is a row that never reaches the hunt,
*and* a row with a stable card. Two additions cover the worked example's 17:

1. **BU-level account mismatch** in `usp8_txv_account_mismatch`: when the cardex
   inventory account's BU (9999998 model) differs from the GL posting BU
   (9999842) for the same document, mint an **Account Mismatch** card. Claims
   Cluster A (14 of 17).
2. **Non-stock mis-routing** &mdash; needs the order line type (SDLNTY) in the txv
   payload (UI-35). A non-stock line (type N) on an inventory account &rarr; a
   **Non-stock** card; a non-stock line on a P&amp;L account &rarr; not a variance,
   suppressed. Claims Cluster B (3 of 17).

Net effect on the worked example: the residual card drops from **17 &rarr; 0**.
The survey (below) will say how much of the *whole* residual, across all three
DBs, these two plus any newly-found patterns can reclaim.

---

## Part 3 &mdash; Row-anchored resolution (the lifecycle fix)

### The problem
Resolution is keyed by **card_code** (`<co>|<cardCode>|<period>` &mdash;
`RTxvCardResolution.CardCode`). card_code was chosen because it survives B&rarr;C
row churn, but it is a *label*. When we improve the classifier and the label
changes, a completed card orphans its resolution and the new cards render fresh
&mdash; the analyst is asked to redo finished work.

### The fix
Anchor resolution to the document's **business identity**: `company + document +
account + period`. Carry the **variance amount as a convergence signature**.
card_code becomes purely presentational.

- **Reclassification-safe:** the resolved rows keep their flag and appear under
  whatever card now groups them, already resolved. Work follows the rows.
- **Churn-safe:** the business key is invariant across B&rarr;C (unlike a
  surrogate row id); `glxref` already carries the document on
  `RCardexLedgerCompare2`.
- **"Complete" is computed,** not stored on the label: a card reads complete when
  all its *current* rows are resolved.
- **Convergence reopen** fires only when a row's variance changes or a new
  document enters the group &mdash; a real data shift asks for another look; a
  pure relabel does not.

### Why this is not over-building versioning
`project_rr_tool_not_system_of_record` says overwrite, don't version. Row
anchoring is not a version history &mdash; it is choosing the *correct key* for a
single current-state record. The edge case makes it lighter than it sounds: if
the analyst truly fixed the source, the next B&rarr;C the variance is simply gone,
so there is nothing to carry or reopen. The lifecycle only matters for
**dispositions** ("accepted / noted," not fixed), and a disposition is inherently
about the underlying rows &mdash; which is exactly why it should key to them.

### Migration
Existing `RTxvCardResolution` records are card_code-keyed. Transition options:
(a) re-key in place by resolving each record's card back to its document set at
migration time; or (b) carry both keys during a transition window and prefer the
document key. Given the demo DBs are the only populated instances and pre-demo,
(a) is cleanest.

---

## Sequencing

1. **Land the classifier additions and row-anchored resolution before analysts
   complete cards in earnest.** Every classifier change *after* completions
   triggers the reconciliation; doing it while the residual is still a scratch
   pad avoids that entirely.
2. **UI-35 gates the non-stock card.** The BU-mismatch card can ship first; the
   non-stock card waits on SDLNTY in the payload.
3. Row-anchored resolution should land *with or before* the classifier changes so
   the first reclassification already carries completions correctly.

---

## Dependencies & open owner calls

- **UI-35** (SDLNTY in the txv payload) &mdash; prerequisite for the non-stock card.
- **`RTxvCardResolution`** schema + agent change for the document key.
- **Corrective-action copy** per card &mdash; SME wording (owner).
- **Non-stock-on-P&amp;L:** fully suppress, or show as informational? (owner)
- **Convergence tolerance:** what variance delta reopens a resolved row? (owner)

## Related
- `docs/usp8-txv-classifier-design.md` (DB repo) &mdash; the 10-card classifier.
- `AnalysisGuides/transaction-detail-analysis.md` &mdash; ANALYST_GROUNDING source.
- Memory: `reference_f4111_pc_field_not_gl`, `project_analyst_accountant_role_split`,
  `reference_txv_reconciliation_model`, `project_ai_tier_distinction_ladder`.
