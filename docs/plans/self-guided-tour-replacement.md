# Plan: Self-guided tour — band-walkthrough on the live V8 home page

**Status:** active direction as of 2026-06-28. **Supersedes** the earlier
"RapidReconciler Assist" help-portal tour, which is **dead** — the analyzer, KB,
and Help Desk surfaces have been integrated into V8, so there is no separate
Assist product to tour. The tour is now of the live V8 app itself, entered from
the home page. (The original Assist plan is preserved at the bottom for context.)

---

## Concept

The V8 home page's **role bands** — Today's To Do, Administrator, Analyst,
Accountant, Support — *are* the tour spine. **One band = one tour stop = one
value prop.** A "tour / prospect mode" overlays the live home page: lean bars at
rest; a spotlight + dim + stepper walks band by band; each spotlit band reveals a
plain-English value proposition (and optionally a few specifics).

Reusing the real page means the prospect sees the actual product — **zero drift
between the demo and what they bought.** It doubles as new-hire onboarding
(self-teaching, the owner's exit-strategy goal).

## Why this over the old approach

- **Assist is gone.** Its surfaces live in V8 now, so a separate help-portal tour
  has nothing distinct to sell.
- **The band structure already encodes the product's mental model** (role lanes
  by cadence — see memory `project_home_role_lanes`). The walkthrough is the page
  explaining itself, not bolted-on marketing.

## Design — tour mode is a gated overlay, not the everyday page

A daily admin opening this page dozens of times wants the lean bars they have
now. The marketing layer appears **only behind a tour / prospect flag**. This
fits `docs/plans/v8-demo-prod-mode.md` rather than fighting it.

**Resting state (every user):** `pill + status + chevron`. Green bands read
uniformly **"All clear"** — shipped to the live page 2026-06-28 (`setSectStatus`
normalizes `ok`-level headlines; amber/red keep their specific, informative
text). This is the only live-page change made for this effort so far.

**Tour mode adds:**
1. A per-band one-line **value descriptor** (shown only in tour mode).
2. **Walkthrough chrome** — spotlight on the active band, dim the rest, a
   Back/Next stepper with progress dots, wired to the existing collapsible bands.
3. A **"Take the tour"** entry point + an exit.
4. **Strips prospect-irrelevant chrome** in tour mode: the internal context line
   (`DB · companies · period`) and the operational top chips (Connected / Data
   current / Period) — plumbing a prospect can't parse.

A concept mockup of this state was built 2026-06-28 (guided-tour mode: lean bars,
one band spotlit with its value prop, Back/Next stepper).

## Draft band value lines (owner to wordsmith)

| Band | Value line | Specifics (optional, when spotlit) |
|---|---|---|
| Today's to do | "Just what needs attention today — and a clean slate when there's nothing." | — |
| Administrator | "Your system stays healthy, current, and fully in your control." | — |
| Analyst | "Match your inventory to the general ledger and explain every difference." | Account roll-forward, period by period · Cardex variance, found & explained · DMAAI review built in |
| Accountant | "Close each period knowing the numbers are in balance." | — |
| Support | "Answers from the knowledge base, the moment you need them." | — |

## Open questions

- **Entry point** — where does "Take the tour" live: home itself, the hub /
  launchpad, or the public help cover?
- **Prospect data** — the bands need a believable but **sanitized** dataset
  (when used as a sales tool the page is publicly shareable, so the
  real-customer-data rule applies). Demo/prod-mode is the vehicle.
- **Depth** — does the tour drill *into* a band's page (e.g. open the Analyst
  reconciliation view) or stay on the home overview? Overview-only is simpler and
  safer; drill-in is more convincing.
- **`tour.js` disposition** — the in-app 90-second cross-page spotlight engine:
  retire it, or keep it for in-app onboarding of existing customers?

---

## Retired approach (for context) — the "Assist" help-portal tour

Dead as of 2026-06-28. The original plan (2026-05-19/20) forked
`GSIRRSales/rr-self-guided-tour.html` into a new
`GSIRRSales/rr-assist-self-guided-tour.html` to demo a separately-sellable
"RapidReconciler Assist" product — the help portal (Export Analyzer + RR
University + Help Desk + Log Analyzer). That product no longer exists as a
distinct surface: its pieces are integrated into V8. The decisions logged then
(file location in `GSIRRSales/`, KB type stack, stills-only demo content, hybrid
coexistence with `tour.js`) are obsolete for this effort.

`GSIRRSales/rr-self-guided-tour.html` (the full-app "RapidReconciler Demo") is a
separate artifact and is unaffected by this doc.
