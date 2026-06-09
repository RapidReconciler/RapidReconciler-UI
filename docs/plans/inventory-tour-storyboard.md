# Inventory Self-Guided Tour — Storyboard

**Status:** Draft for owner redline · **Created:** 2026-06-08
**Format:** Standalone shareable page on the **public** GitHub Pages repo — a
narrated walkthrough Sales can email as a feeler. No login, no running stack.
**Audience:** Both halves of a discovery call — **business/finance AND
technical/IT** — each scanning for resolutions to *their own* pain. JDE-fluent;
not sold yet. (See *Personas* below; the tour must land for both.)
**Doubles as:** the demo the CEO missed, and a UX punch-list for the live
inventory pages (see *Redesign flag* on each scene).
**Source material:** owner's *RR Internal Training Inventory.pptx* (32 slides) —
the canonical concept deck (DMAAIs, GL class codes, costing, back-end process
control, managing the cardex, transaction timings, sources of variance, cardex
date logic, accounting methods, balance forward). The Sources-of-Variance scale
(deck slides 23–24) is Scene 1's cold open.
**Positioning line (deck slide 5):** *"A software solution for JD Edwards
inventory, goods in transit and received-not-vouchered that streamlines
reconciliations by replacing tedious manual tasks with automated processes and
defined corrective actions."* — use as the cold-open subtitle.

> **Sanitization is load-bearing.** This ships publicly. Every value in it uses
> the fictional dataset below — no real account/company/branch/item/doc numbers,
> names, or totals, and the DB-name header label gets scrubbed. See the
> checklist at the end.

---

## The fictional dataset (define once, reuse everywhere)

One coherent story thread so every screen ties together:

- **Company:** `4200 — Cascade Manufacturing Co.` (fictional)
- **Branch/Plant:** `M30` (main plant)
- **Period:** close of `06 / 2026`
- **The planted problem:** at period close, perpetual inventory is **out of
  balance with the GL by `$18,450`**.
- **Where it lives:** the variance traces to the **Cardex Variance** component,
  then to one finished good — item **`WIDGET-200`** at `M30` — showing
  quantity/amount drift (a depleted standard-cost residual left behind by
  unposted movement). Supporting cast: `GEAR-114`, `BRKT-50`.
- **The accounts:** Inventory–Finished Goods `4200.140000`; variance offset
  `4200.514000` (Inventory Adjustments).
- **The fix:** a reversible beginning-balance adjustment on `WIDGET-200`
  brings perpetual back in line; the JE posts `4200.140000` / `4200.514000`.
- **The payoff:** re-run Account Roll Forward → the integrity light goes
  **green** → "ready to close."

All dollar figures, dates, and ledger rows in the tour are invented to fit this
thread. Never sourced from `data/*.json` (those hold real customer data).

---

## Personas & pain points

Two different people with two different skill sets — both usually in the
discovery call. The variance is the **handoff** between them.

| | **Business / Finance** (controller, cost accountant) | **Technical / IT** (JDE/system analyst, data owner) |
|---|---|---|
| **The pain** | "Does inventory tie to the GL? By how much — is it material? Give me the entry to post." | "Why did the cardex drift? Can I correct the data, and how do I stop it recurring?" |
| **Owns** | The reconciliation result + the **balancing journal entry**. | **Cardex variance resolution** + **systematic/procedural prevention**. |
| **Does NOT do** | Resolve cardex drift (technical skill set). | Calculate/post the balancing entry. |
| **Their scenes** | 3 (headline), 7 (the entry), 8 (close-ready). As-Of is their *backup proof*. | 4–6 (cardex worklist + fix), Transactions (prevention). |

**The handoff (the spine):** Finance surfaces "we're off by `$18,450` here" →
Technical investigates the cardex drift and either **corrects the data** (the
perpetual number was simply wrong) or confirms it's a **real difference** →
Finance posts the balancing entry on what's genuinely real. The product — and
the tour — should make that handoff legible, and let each persona see *their*
pain resolved.

> Tour treatment: signpost scenes by persona ("If you're in finance… / If you
> own the system…") so each viewer in the call finds their thread fast.

---

## Variance taxonomy — the 6 Rec-page cards (the core framing)

### Mental model: the balance scale (owner's training slide)

Two pyramids on a scale. **What posts to one pan must post to the other** —
variance is when they don't, and it hides in specific **gaps** between the
table layers:

```
        INVENTORY pan                         GL pan
   Inv  (summary)                        GL   (summary)
   Balances  F41021   <-- Cardex -->     Balances  F0902   <-- Batches -->
   Details   F4111    <----- End of Day + Transactional -----> Details  F0911
```

- **Cardex** = inventory-internal gap, **F41021 ↔ F4111** → *Adjust inventory*
- **Batches** = GL-internal gap, **F0902 ↔ F0911** → *Post the batch*
- **End of Day + Transactional** = the cross-beam, inventory details ↔ GL details,
  **F4111 ↔ F0911** — *same gap, two fixes:* *Process the order* (unprocessed
  WO/SO) vs *Write JE* (real difference)
- **Inv ↔ GL** at the top = the headline reconciliation itself

(`F0902` = GL account balances — the GL-side mirror of `F41021`. The slide is
already sanitized — just F-table names — so it's reusable / rebuildable as clean
SVG for the cold open.)

> **Term:** customer-facing copy says **gaps**, not "cracks." "Cracks" implies
> JD Edwards is broken; never frame the prospect's ERP as flawed.

### The 6 cards

The headline OOB is broken into **6 variance-source cards**, each with its own
correction path — splitting into **3 that need a journal entry (Finance)** and
**3 fixed by completing a process or correcting data (no JE)**. That split is
*why* the cards exist as separate buckets.

| # | Card | Source / gap | Correction path | JE? | Owner |
|---|---|---|---|---|---|
| 1 | **Carry forward** | Prior-period leftover (time, not a table-tie) | In theory go back a period and fix (never happens) → in practice **book a JE** | **JE** | Finance |
| 2 | **Unposted GL batches** | **F0902 ↔ F0911** — GL details not yet posted to GL balances | **Post the batch** | No | Acct ops |
| 3 | **End of Day** | **F4111 ↔ F0911** — WOs/SOs in F4111 with **no batch number** (haven't run R31802A / R42800) | **Finish the process** (R31802A manufacturing accounting / R42800 sales update) | No | Ops/IT |
| 4 | **Transactions** | **F4111 ↔ F0911** — real item-ledger-vs-GL difference | **Book a JE**, then preventative analysis to stop recurrence | **JE** | Finance + IT |
| 5 | **Cardex** | **F41021 ↔ F4111** — on-hand vs item ledger | **Data fix** (reversible adjust) — *cannot* be JE'd away | No | Tech/IT |
| 6 | **Manual entries** | Adjusting entries (not a table-tie) | **Book a JE** — assumed to true everything back to balance | **JE** | Finance |

> Cards 3 + 4 are the *same gap* (F4111↔F0911) split by cause: unprocessed
> (process it) vs genuine mismatch (JE it). Cards 1 + 6 are time/adjustment
> items, not structural gaps.

**The split that matters:** the **3 JE cards (Carry forward + Transactions +
Manual entries)** are Finance's world — and are exactly what a **balancing-entry
worksheet** would aggregate (this is the concrete shape of the parked Scene 7).
The **3 no-JE cards (Unposted GL batches, End of Day, Cardex)** are
complete-a-process or fix-data → Ops/IT. Cardex is the one people most want to
"JE away" and can't.

Tour mapping: cardex = Scene 5, transactions = Scene 7b, the JE roll-up =
Scene 7; the no-JE/process cards are evidence beats off Scene 3.

---

## Narrative arc

Problem → product → payoff, told as **two value tracks that meet at the
variance**. Persona tag on each scene: **[Finance]**, **[Tech/IT]**, **[Both]**.
Supporting pages are reframed by the role they serve, not as throwaway plumbing.

### Scene 1 — Cold open: the Key Concept (the scale) · [Both]
**Beat:** Open on the **balance-scale mental model** (owner's training slide):
inventory on one pan, GL on the other; what posts to one must post to the other,
and **variance hides in the gaps** between the table layers. "Month-end: does
perpetual tie to GL — and if not, *which gap?*" Establishes the whole product
in one picture and frames the hours of manual digging this normally takes. Then
the reveal: RR is the X-ray that shows which gap and who fixes it.
**Screen:** a clean rebuilt version of the scale graphic (two pyramids:
F41021/F4111 vs F0902/F0911; the four gaps labeled with their fixes).
**Redesign flag:** none (new tour chrome) — but this concept graphic is a reusable
product/training asset beyond the tour.

### Scene 2 — Sign in → Home · [Both]
**Beat:** Get in fast, land on Home, pick **company + period** (`4200`, `06/2026`).
Login is a quick beat, not a dwell.
**Screen:** `home.html` — the scope bar (Working companies / Working period).
**Redesign flag:** **Elevate the scope bar.** Today company+period sit *below*
the admin panels; for an inventory analyst that's the first thing they need.
Promote scope above the fold / above admin chrome so "pick what you're working
on" is the obvious first move.

### Scene 3 — Reconciliation: the answer at a glance ★ (hero scene) · [Finance]
**Beat:** The headline — **perpetual vs GL, out of balance by `$18,450`** — split
across the **6 source cards**, each pre-sorted by how you fix it: **3 need a
journal entry, 3 don't.** "At a glance, RR tells you the number, *and* hands each
piece to the right person with the right fix."
**Screen:** `inventory-reconciliation.html` — hero stat card + the 6
variance-component cards + breakdown.
**Redesign flag:** Strong as-is; keep the hero card dominant. The 6 cards are the
fork in the road — consider visually grouping/marking them **JE vs no-JE** (and
by owner) so a viewer instantly sees which are Finance's and which are Ops/IT's,
rather than reading them as six undifferentiated dollar buckets.

### Scene 4 — Drill into the variance ★ (the handoff) · [Finance → Tech/IT]
**Beat:** Finance clicks the **Cardex Variance** component → hands off to the
technical worklist behind it. This is the role handoff made visible.
**Screen:** the bridge from Reconciliation into Cardex Variance.
**Redesign flag:** **THE BIG ONE.** Today the variance card opens a
look-but-don't-act *preview modal* with no clear path to the full worklist —
a dead-end at the most important turn. Add a prominent **"Open the Cardex
Variance worklist →"** CTA so the drill actually lands on the per-item page.
This fix matters for the live product as much as the tour.

### Scene 5 — Cardex variance (F41021↔F4111): which items, and why · [Tech/IT]
**Beat:** The per-item worklist for the *inventory-internal* break — on-hand
doesn't match the item ledger. `WIDGET-200` at `M30` is the culprit; the row
shows the qty/amount drift and a plain-language reason.
**Screen:** `inventory-cardex-variance.html` worklist.
**Redesign flag:** **Expand "How this works" by default** (it's collapsed today,
so first-timers miss the 4-step flow) and **make the pattern grouping legible** —
plain-language pattern names + the runbook line visible without expanding.

### Scene 6 — The cardex fix: reversible, auditable · [Tech/IT]
**Beat:** Click **Adjust** on `WIDGET-200`, pick a preset (e.g. "Clear to JDE"),
confirm the attestation, **Apply**. Stress: this is an RR-side, **reversible**
correction with a full ledger — JDE is never touched.
**Screen:** the Adjust modal + adjustment ledger.
**Redesign flag:** Solid; keep reversibility + attestation prominent.

### Scene 7 — The finance payoff: the balancing entry · [Finance]
**Beat:** Once the explainable component imbalances are accounted for, RR gives
Finance the **balancing entry** to post in JDE (`4200.140000` / `4200.514000`) —
"hours of digging become a ready-to-post entry."
**Screen:** a **balancing-entry worksheet on the Rec page** *(does not exist yet —
owner's idea).*
**Redesign flag / OPEN DESIGN (PARKED):** This is a new build, not a capture.
Concrete shape (from the 6-card taxonomy): the balancing entry aggregates the
**3 JE cards — Carry forward + Transactions + Manual entries** — and proposes the
journal entry. The 3 no-JE cards (Unposted GL batches, End of Day, Cardex) are
*excluded* — they clear by posting/finishing a process or fixing data, so a JE
would double-count. **This is genuinely net-new — no v359 prior art (it's never
existed; a standing wish-list item), so there's nothing to mine. Greenfield
design.** Tackle as its own task — *one step at a time.* For the first tour pass,
this scene shows the *concept* (a worksheet mock) rather than live math.

### Scene 7b — Transaction variance → prevention: the IT payoff · [Tech/IT]
**Beat:** The *other* technical problem — item-ledger movements that didn't tie
out to the GL. RR matches F4111↔F0911 on **Company / Batch / Doc Type / Doc
Number / Order Type / Account / Period** (deck slide 25) and groups the misses by
likely root cause. The payoff: the **Export Analyzer** reads a JDE export and
returns **WHAT happened / WHY / HOW to fix it, per transaction** — the insight
that previously required a seasoned JDE analyst manually cross-referencing
reports. So IT fixes the cause **once, systematically or procedurally** (an
AAI/posting setup, a skipped step) and stops the variance recurring.
**Screen:** `inventory-transactions.html` (anomaly grouping) → the Export
Analyzer workbook (`Tools/analysis-workbook.html`) WHAT/WHY/HOW cards.
**Framing:** pitch as *"senior-analyst insight, available to anyone in
minutes"* — empower, don't "replace" (the analyst is often the IT person in the
room). This is the **IT-side payoff that mirrors Finance's balancing entry** —
the tour gives each persona its own win. Keep the analyzer's depth here, not in
the slice (Scenes 1/3 are headline + triage).
**Open Q for owner:** worth promoting the analyzer to its *own* scene given how
strong the differentiator is? Parked.

### Scene 8 — Close-readiness + CTA · [Both]
**Beat:** Re-run **Account Roll Forward** → the integrity light is **green**:
"GL and variance roll-forwards intact. You're ready to close." End on
"hours → minutes" + a contact-Sales CTA.
**Screen:** `inventory-account-rollforward.html` analysis card (green badge).
**Redesign flag:** none; the green badge is already a great trust close.

### As-Of — the backup behind the perpetual number · [Finance backup]
**Beat:** Not a headline — it's the **evidence** for the perpetual figure being
reconciled in Scene 3. "Here's exactly what makes up that on-hand number, and you
can **drill any balance to its full transaction ledger in one hover**." Builds
Finance's trust in the number rather than standing on its own.
**Screen:** `inventory-asof.html` perpetual snapshot + hover-to-ledger preview.
**Placement:** a short proof beat hung off Scene 3 (the perpetual side of the
reconciliation), not its own pillar.

---

## Build approach — vertical slice first

1. **Storyboard sign-off** (this doc, redlined by owner).
2. **Vertical slice:** build Scene 1 (intro) + Scene 3 (Reconciliation) at full
   polish first. Owner signs off on the **look + voice** before we invest in the
   rest.
3. **Crank remaining scenes** against the approved template.
4. The redesign flags become live-page fixes during the cosmetics pass — fix the
   screen, then capture it for the tour.

---

## Sanitization checklist (every scene)

- [ ] **DB-name header label** scrubbed — `RapidReconciler_Dev` (hardcoded on
      every page header) → a neutral fictional name, not a real env.
- [ ] **No `data/*.json` real files** used as source — `as-of.json` (real,
      company 00050), `account-rollforward.json` ("real raccountsummary
      snapshot"), `transactions.json` are all off-limits. Build synthetic rows
      from the fictional dataset.
- [ ] **Company / branch** → `4200` / `M30` only.
- [ ] **Items / SKUs** → `WIDGET-200`, `GEAR-114`, `BRKT-50`.
- [ ] **Long accounts** → `4200.140000`, `4200.514000`.
- [ ] **Doc numbers, dates, dollar totals** → invented to fit the thread.
- [ ] Final pass: read every visible string in the shipped tour as *data*, not
      chrome, before it goes public.
