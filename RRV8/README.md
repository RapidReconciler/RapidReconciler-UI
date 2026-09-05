# RRV8 &mdash; RapidReconciler V8

&#9888; **CORRECTED 2026-09-05 (HK-7). EVERYTHING THIS FILE SAID ABOUT WHAT V8
*IS* HAD STOPPED BEING TRUE, AND THIS IS THE FIRST FILE A CONTRIBUTOR READS.**
It described V8 as unwired design mockups for customer demos. V8 is
**production-only and agent-backed** &mdash; see the tenet *Production-only
until Inventory is complete* in [WORKFLOW.md](WORKFLOW.md). The pages call
live agent endpoints, sign-in mints a real session token, and there is **no
demo mode** as a product posture. The struck text below is kept rather than
deleted so the next reader can see it was checked, not merely rewritten.

~~Design-exploration HTML pages … **Not production.** … they have no data
wiring, no auth, and no real behavior. Click anything and you'll get a visual
hover state, but nothing meaningful happens.~~

~~Use them for: Stakeholder review · **Customer demos** · Engineering
reference~~ &mdash; the *Customer demos* line is the one to be sure about: it
contradicts the standing rule that RapidReconciler is **not demo-facing**.
Do not reinstate it.

The V8 application surface for the next-generation RapidReconciler app. The
pages render as standalone HTML with no build step, which is what makes them
easy to open locally &mdash; that convenience is all the original text got
right.

&#9888; **What was NOT re-measured in this pass:** the *Data hygiene* section
below, and whether the specific figures it cites still appear on any page.
Treat that section as unverified as of 2026-09-05.

## Pages

**22 tracked `.html` pages under `RRV8/`** as of 2026-09-05
(`git ls-files 'RRV8/*.html' | wc -l`). The accountant / analyst working
palette is `home.html`, with sub-view tabs for General Ledger, Perpetual,
Reconciliation and Reports. The inventory and accounting surfaces alongside it
are `inventory-transactions.html`, `inventory-asof.html`,
`inventory-cardex-variance.html` and `accounting-dmaais.html`; the rest are the
`admin-*` pages.

&#9888; ~~`inventory-reconciliation.html` &mdash; Inventory > Reconciliation
(mockup …)~~ **That page was retired 2026-07-02 in PR #307 (`aaa0af9`)**, which
repointed nav to `home.html` and the account roll-forward page. It was this
file's only listed page, so this section named exactly one page and that page
no longer exists.

&#9888; **Not to be confused with `RRUniversity/inventory-reconciliation.html`,
which is a different, live, tracked file** (a customer knowledge-base doc). A
bulk rename across the repo would break its working links; several
`docs/plans/*.md` entries point at it correctly.

## Data hygiene

All visible data in these pages is **fictional or sanitized**. The values
match the staging Acme test-instance numbers for visual verisimilitude
(`$13,203.53` out of balance, `(280.51)` transactions, etc.) but Acme is
the generic fictional placeholder used elsewhere in the repo. No real
customer account numbers, doc numbers, or personal names appear.

## Local preview

The repo's static server serves these pages too &mdash; if you've got
`localhost:8765` running, open
`http://localhost:8765/RRV8/home.html`.

&#9888; **This line used to point at
`http://localhost:8765/RRV8/inventory-reconciliation.html`, which has 404'd
since 2026-07-02.** `home.html` is tracked and is the working palette, so it is
the right entry point. Corrected 2026-09-05.
