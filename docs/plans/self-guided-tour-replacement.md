# Plan: Replace the 90-second tour with a self-guided tour

**Status:** drafted 2026-05-19, deferred for execution tomorrow.

**Why:** the owner is considering positioning some surface of RR (analyzer + KB + Help Desk) as a separately-sellable product. The current 90-second tour is a cross-page spotlight engine — solid for orienting an existing customer, less effective as a sales demo. The other GSI product already ships an immersive single-page self-guided tour (the pattern lives at `GSIRRSales/rr-self-guided-tour.html`); we want to apply that same pattern here.

---

## Current state — what exists now

### 90-second tour (the one we're replacing)

- **Engine:** `Tools/tour.js` (~480 lines) + `Tools/tour.css` (~148 lines).
- **Mechanics:** single shared engine that runs across multiple pages. A STEPS array drives a flat ordered walkthrough across 5 surfaces; the engine injects a spotlight + tooltip card into whatever page is loaded and uses `sessionStorage` to resume across navigations.
- **Entry points (5 pages):** the "Take the 90-second tour" button on
  - `rapidreconciler-help.html` (cover)
  - `RRUniversity/rapidreconciler-university.html`
  - `HelpDesk/troubleshooting.html`
  - `HelpDesk/log-analyzer.html`
  - `Tools/analysis-workbook.html`
- **Demo content:** `tour.js` already carries a pre-canned demo console paste and other prefilled content — that's reusable for the new tour.

### Self-guided tour pattern (the one we're cloning)

- `GSIRRSales/rr-self-guided-tour.html` — 3,108 lines, single-page immersive demo. Uses a "stages" pattern (`#screen-welcome` → `#screen-app` → `#screen-finish`), a tour rail with step cards (`tour-step-num`, `tour-step-pages`, `tour-emphasis`), a backdrop, a bottom strip, a nav strip with progress. Self-contained — no dependencies on the rest of the KB.
- `GSIRRSales/rr-self-guided-tour-AI.html` — 1,536 lines, secondary AI-focused variant.
- Branding pinned to GSI palette; "doc-type: howto" body attribute. Uses DM Sans + Instrument Serif + DM Mono — a different type stack from the rest of the KB, signaling a distinct product surface.

---

## Proposed approach

### Option A (recommended) — Adapt the existing self-guided template

Clone `GSIRRSales/rr-self-guided-tour.html` to a new location (proposed: `Tools/rapidreconciler-tour.html` at the repo root, or a dedicated `tour/` folder if we want clear product-separation), then rewrite the stage contents for RapidReconciler specifically. Keeps the tour-rail mechanics, branding shape, and stage-transition CSS the existing pattern already proved out.

**Effort:** large but mostly content authoring (replace stage HTML + step text). The structural engine is already there.

### Option B — Build fresh

Write a new self-guided tour from scratch using just the patterns we like from `rr-self-guided-tour.html`, without forking the whole file.

**Effort:** larger; would need to re-derive all the stage mechanics. Not recommended unless we want a meaningfully different shape.

### Option C — Hybrid

Keep `tour.js`'s cross-page spotlight engine for in-app onboarding (separate concern), and build a new self-guided tour for the sales / first-look surface. Two tour systems coexisting.

**Effort:** medium-high; clarifies positioning but creates maintenance overhead.

---

## Tomorrow's execution steps (Option A)

1. **Decide product positioning question:** is this tour replacing the 90-second tour entirely, or living alongside it as a separately-positioned sales-facing surface? See "Open questions" below.

2. **Inventory the demo content** in the current `tour.js` STEPS array — the prefilled console paste, sample doc queries, and "look at this scenario" callouts. These are the substantive content moments we want to preserve in the new tour.

3. **Clone the template** — copy `GSIRRSales/rr-self-guided-tour.html` to the chosen new location. Don't edit `rr-self-guided-tour.html` itself — that's the other product's tour and needs to stay independent.

4. **Rewrite stages for RapidReconciler Assist** (the help portal —
   NOT the live RR app). Suggested stops:
   - `#screen-welcome`: brand intro for Assist; "what Assist gives you"
     hook (variance triage + analyst KB + on-tap troubleshooting)
   - `#screen-app`: tour rail walkthrough across the Assist surfaces:
     - **Export Analyzer** — drop a fixture, see WHAT/WHY/HOW cards,
       JE-flow matrix; this is the wow moment for the Assist demo
     - **RR University** — KB browse + search; the analyst-grade
       reference layer
     - **Help Desk** — scenario search + paste-an-error-message
       triage; the on-tap troubleshooting layer
     - **Log Analyzer** — paste a console log, see signal vs noise
       classification; the "we already know your noisy log lines"
       closer
   - `#screen-finish`: CTA to schedule a demo or self-serve at
     rapidreconciler-help.html (the Assist landing)
   - Keep total stops to ~5–7 (the rr-self-guided-tour has 12+; ours
     can be tighter since Assist is a more focused product surface)

5. **Update the entry points (5 pages):** the existing "Take the 90-second tour" button HTML stays where it is; just change its `href` from the JS-engine entry to the new tour's URL. Remove the `<script src="Tools/tour.js">` and `<link href="Tools/tour.css">` includes from those 5 pages.

6. **Decide on tour.js / tour.css disposition:**
   - **Delete** if the new tour fully replaces it (Option A).
   - **Keep around** if we go Hybrid (Option C) — but rename to clarify it's the in-app onboarding tour, not the sales tour.

7. **Update the help-page card copy:** the cover page currently says "Take the 90-second tour" — that framing was honest about the cross-page spotlight engine. The new tour will probably feel different (longer, immersive, self-paced). Re-word the button as "See how RapidReconciler works" or similar.

8. **Visual sanity check:** drop on the deployed site, click through all 6–8 stages on desktop + mobile. Check that the existing GSIRRSales tour still works in isolation (we shouldn't have broken it).

9. **Drawer + search-index considerations:** the new tour file is a customer-facing page. Add it to:
   - The University drawer's "Getting started & general" group (or wherever fits best for a "product overview" link).
   - The Help Desk Browse-all drawer.
   - Bump section counts.
   - The search-index regen GHA handles the rest.

---

## Decisions (resolved 2026-05-19 evening, **scope clarified 2026-05-20**)

1. **Productization scope: RapidReconciler Assist (the help portal).**
   On 2026-05-20 the owner rebranded the help portal (KB + Help Desk +
   Export Analyzer + Log Analyzer) as a separately-sellable product
   named **RapidReconciler Assist**, distinct from the live
   **RapidReconciler** app at rapidreconciler.getgsi.com. The new
   self-guided tour is the **Assist** product's demo, not a tour of
   the full RR app. The pre-existing `GSIRRSales/rr-self-guided-tour.html`
   continues to cover the full RR app (rebranded "RapidReconciler Demo"
   on the hub page). The new tour file should be named
   `GSIRRSales/rr-assist-self-guided-tour.html` (the hub page already
   links to this path).

2. **File location: `GSIRRSales/`, same folder as the existing self-guided tour.** This is treated as a **sales artifact**, parallel to `rr-self-guided-tour.html` and `rr-self-guided-tour-AI.html`. Proposed filename: `GSIRRSales/rr-rapidreconciler-tour.html` (or similar -- TBD on the file day-of).

3. **Type stack: KB stack (Open Sans + Source Sans 3).** Stay on the same type stack as the rest of RR. The existing GSIRRSales tour's DM Sans / Instrument Serif is the other product's voice; we don't borrow it.

4. **Demo content: stills only.** Annotated screenshots, not live embedded analyzer demos. Trades demo wow-factor for stability -- a sales artifact has to keep working without ongoing tour maintenance every time the analyzer UI shifts.

5. **Hybrid: keep `tour.js`.** The in-app cross-page 90-second tour stays for onboarding existing customers. The new sales tour is an additional surface, not a replacement. **Implication:** the "Take the 90-second tour" buttons on the 5 destination pages stay as-is -- they continue launching the in-app tour. The new sales tour gets its own separate entry point (probably from `rapidreconciler-help.html` cover, possibly a new card or a sub-link beneath the existing one).

## Day-of execution order (Option A, locked in)

1. Clone `GSIRRSales/rr-self-guided-tour.html` -> new file in `GSIRRSales/`.
2. Replace the type-stack imports (DM Sans / Instrument Serif -> Open Sans / Source Sans 3 / JetBrains Mono).
3. Replace stage contents with RR-specific stills + step text covering: Reconciliation Dashboard, Transactions page, Analyzer hand-off, integrity reports, Help Desk + KB closer.
4. Add a new entry-point on `rapidreconciler-help.html` (TBD: dedicated card, or sub-link under "Take the 90-second tour"). Do NOT touch the existing `Take the 90-second tour` button on the 5 destination pages -- those keep launching `tour.js`.
5. Drawer + index housekeeping: add the new tour file to the customer-facing index (probably the University drawer's Getting Started group + the Help Desk Browse-all drawer). Bump counts.
6. Visual sanity-check on desktop + mobile. Confirm the existing GSIRRSales tour is unaffected.

---

## Risks

- **Scope drift:** rewriting 6–8 stages of polished sales copy and the supporting visuals is the bulk of the work. The mechanical "fork + retheme" is the easy part. Plan for content authoring to be the long pole.
- **Two tours diverging:** if we go Hybrid, the in-app and sales tours will drift in look-and-feel over time unless we're deliberate about keeping them in sync. The repo doesn't have a shared layout system that would enforce that — strategy-2 templating would help here.
- **Demo content staleness:** the existing `tour.js` STEPS bake in specific demo content (a console paste, specific scenarios). The new tour will too. When the analyzer's UI shifts, the tour breaks. Budget for periodic refresh.
