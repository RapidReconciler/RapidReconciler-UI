# Pattern catalog — proposal (one source, three consumers)

**Proposal for owner (SME) curation · 2026-07-13 · held (references specimens).**

The owner's principle: the txv **classifier**, the **AI grounding**, and the
**analyzer pop-up** must never give different answers for the same document
([[feedback_analytical_knowledge_one_source]]). This proposes the shape of the
single catalog they all derive from, seeded with the patterns proven or found
tonight. The catalog would live in `AnalysisGuides/transaction-detail-analysis.md`
(already the grounding's declared source of truth); this is the structure + a
first draft of entries for you to correct.

## Catalog entry shape

Each pattern is one entry:

```
id:          short-slug
name:        analyst-facing card name
signature:   the deterministic test (fields: PC / batch / line type / account / BU / batchtype / shape)
card:        which txv card it classifies into
why:         1–2 root-cause bullets (the AI grounding + pop-up WHY)
how:         the corrective action (source fix — analyst owns; never a JE)
consumers:   classifier rule · grounding bullet · pop-up WHAT/WHY/HOW
```

The three consumers each render *from the same entry*: the classifier implements
`signature → card`, the grounding is the compact `why`, the pop-up is
`why + how`. Change the entry once; all three follow.

## First discriminators (apply before any pattern)

Two field-meaning rules that gate everything, both learned tonight:

- **`batch` is the GL-posted signal, not `PC`.** F4111 `PC` flags the F41112
  update, not GL posting. **batch > 0 ⇒ posted.** ([[reference_f4111_pc_field_not_gl]])
- **Shape** = cardex-only / GL-only / both-disagree, from the variance legs.
  Combined with batch, shape names most patterns.

## Draft entries (seeded from the survey — you curate the why/how wording)

### `apvoucher-to-inventory`
- **signature:** batchtype `V` on an inventory account.
- **card:** A/P Voucher on Inventory  *(shipped name; catalog draft said "Misposting" — SME pick one)*.
- **why:** an A/P voucher routed through the inventory AAI instead of its
  expense/clearing account.
- **how:** correct DMAAI 4220 routing at the source.
- **✅ WIRED (DAC-28, 2026-07-13):** `usp8_txv_flags` claims `SubType='Vouchers'`;
  both UI classifiers map it → card `VCHR`; card `why` via `CODE_EXPLAIN.VCHR`;
  **AI grounding ✓** (voucher bullet added to `ANALYST_GROUNDING`, config.js).
  **Still open:** analyzer pop-up (held WIP). **Verified live** — Demo2 residual
  4,014→202, Vouchers card = 3,812 rows (~$2M). Biggest pile.

### `bu-account-mismatch`
- **signature:** cardex-only, **batch > 0**, cardex on the inventory *model* BU
  (9999998); GL relief on the real BU (9999842).
- **card:** Account Mismatch.
- **why:** the cardex reconciles against the 4152 inventory model account while
  the GL sale relief posts to the 4240 account — same document, different account.
- **how:** align the DMAAI (4152 model vs 4240 posting) for the item's GL class.
- **specimen:** 1125744.

### `nonstock-to-inventory`
- **signature:** GL-only, order **line type N**, GL on an inventory account.
- **card:** Non-stock Mis-routing.
- **why:** a non-stock line moved no inventory (cardex 0, correct) but its GL
  value posted to inventory instead of a P&L / clearing account.
- **how:** correct the line-type / AAI routing. **Non-stock on a P&L account =
  expected → suppress; on inventory = fix.** (the account is the tiebreaker.)
- **specimen:** 1125513. **gated on UI-35** (needs SDLNTY in the payload).

### `unposted-cardex`
- **signature:** cardex-only, **batch = 0** (never interfaced to GL).
- **card:** Unposted Cardex.
- **why:** the cardex movement was written but no GL batch exists.
- **how:** post / interface the transaction to GL, then confirm the batch.
- **note:** distinct from `bu-account-mismatch` purely by batch. Demo3 Mfg WO
  completions ($12.8M, one item) match this shape but are likely Demo3 in-flux —
  owner to confirm before generalizing.

### `duplicate-sales`
- **signature:** cardex posted twice, GL once (`RDuplicateSales` flags it).
- **card:** Duplicate Sales.
- **why:** the cardex line was relieved twice; the GL has it once, so the
  variance equals the duplicated line.
- **how:** reverse the duplicate F4111 line at the source (never a JE).
- **✅ WIRED (DAC-28, 2026-07-13):** `usp8_txv_flags` claims `SubType='Duplicate Sales'`;
  both UI classifiers map it → card `DUP`; card `why` via `CODE_EXPLAIN.DUP`;
  **AI grounding ✓** (duplicate-sales bullet already in `ANALYST_GROUNDING`).
  **Still open:** analyzer pop-up (held). **Verified live** — Demo1 7 rows, Demo3 2.

### `wo-cost-variance` (residual — group, don't auto-resolve)
- **signature:** both legs post but disagree, WO documents (IC/IM, order type
  WO), batch > 0.
- **card:** Work-Order Cost Variance.
- **why:** inventory (cardex) value and GL value differ — standard vs actual, or
  a cost-roll timing gap.
- **how:** cost review (cost-accounting). No mechanical fix — but **group by work
  order** so the analyst works a WO, not scattered rows.

## The sync checklist (keep it this short — the owner's concern)

Any change to an entry runs this, in one pass, same PR family:

```
[ ] classifier — usp8_txv_* implements signature → card
[ ] grounding  — ANALYST_GROUNDING (config.js) carries the `why` bullet
[ ] pop-up     — analyzer-engine.js renders why + how (attended; held WIP)
[ ] guide      — the catalog entry is the edited source
```

Four lines. If it grows past this it won't get run and the surfaces drift again.
The analyzer line is attended (owner-held file), so an autonomous classifier/
grounding change leaves the pop-up box unchecked with a note, rather than
touching the held file.

## For your curation
- The `why`/`how` wording per entry (SME).
- Card names (analyst-facing).
- `nonstock-to-inventory`: suppress non-stock-on-P&L entirely, or show informational?
- Confirm `unposted-cardex` vs Demo3 in-flux before carding it.
