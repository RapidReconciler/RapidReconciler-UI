# Plan: Practice walkthrough — Junior-readiness UX pass

Status: **findings captured, not started** (2026-06-03). Decide scope before building.
Relates to memories `project_practice_flows_per_process`, `project_junior_support_readiness`,
`user_role_exit_strategy`, and the now-shipped `project_go_live_handoff_shipped`.

## Where this came from
A guided "first day" walkthrough of **Practice Creating a New Client** (VALC dashboard,
`dashboard.html`), played as **Junior** — a brand-new hire, no prior context, **no access
to Claude**. Every screen was read cold. The findings below are the spots where the
product assumed knowledge Junior doesn't have, exposed controls that aren't Junior's to
touch, or broke the real flow. The **Step 6 go-live walkthrough** (simulate company data →
hand off → "see what your customer sees") shipped this session as the foundation; this
plan is the UX/teaching pass on top of the whole arc.

## The hard constraint
**Junior has no Claude.** Every piece of guidance discovered in the walkthrough has to be
**delivered in the product itself** — coaching strips, inline definitions, reframed copy,
sequenced actions — not in a chat. If the guidance isn't on the screen, it doesn't exist.

## Organizing principles (apply these everywhere, not just the listed items)
1. **Tell Junior whose job each piece of data is** — *GSI's (from the contract)*, *the
   customer's (from their submission)*, or *the system's (the readiness checks)*. Junior's
   real job is moving work between those parties, not authoring technical facts. This single
   framing dissolves most "this is above my paygrade" moments (Topology, JDE settings, SQL
   creds, RAM/Category).
2. **Distinguish real skills from sandbox fast-forwards.** Real skills happen on live
   customers (create card, import the reply, generate+send bundle, register DB, hand off).
   "Simulate heartbeat" / "Simulate company data" are **practice-only** stand-ins for things
   that happen **automatically** in real life. Every simulate control must say so:
   *"In real life this happens on its own — you'll never click this; it's only here so
   practice doesn't stall."* Otherwise Junior builds a false model of the real job.
3. **One obvious next action per screen.** Never let an out-of-sequence or higher-contrast
   button out-shout the real next step. The drawer already promises "your next click is
   highlighted at every step" — keep that promise on every screen.
4. **The system judges right/wrong, not Junior.** A new hire can't eyeball-validate a
   customer's data. Completeness = flagged required fields; correctness/consistency = the
   Install Progress scoreboard. Point Junior at the scoreboard as the QA, not their eyes.
5. **Define jargon at first use**, with a hover/tap tooltip for recurring terms
   (topology, agent, bundle, services, heartbeat). Don't repeat a term three times before
   defining it.
6. **Teach on the real surfaces, annotated** — practice coaching layered onto the real
   screens (and peeling away for real clients), not a parallel sidebar that teaches a
   layout production doesn't have.

---

## Batch — grouped, in suggested build order

### A. Bugs (break the real flow — fix first)
> **Pass 1 (2026-06-03) resolved the root cause.** The "blank Client Details" was not a
> load bug — `loadClientDetailsTab` *intentionally* blanked Name / Contact 1 / RR Admin /
> JDE fields for a fresh practice client (`practice && setupStep==='NEW'`) "to teach the
> import workflow." That blanking was **too aggressive**: Contact 1 is needed to *send
> prep* (before any import) and the RR Administrator is *contract* data, not server-
> submission data. Fix: **blank only the JDE/environment fields** that genuinely come from
> the submission; keep Name / Contact 1 / Contact 2. This one change cascaded through #1–#4.

1. ~~**Client Details doesn't populate on load.**~~ **DONE (pass 1).** Narrowed the
   practice pre-import blank-list to JDE fields only; Name / Contact 1 / RR Admin stay
   populated from the contract baseline. Send prep works again.
2. **RR Admin Email lifecycle** — *core resolved (pass 1):* it stays populated (contract
   data), so the grayed-out handoff no longer happens. **Revised understanding:** the RR
   Administrator is contract data, **not** something the customer supplies in the prep
   submission — so do **not** add it to the prep questionnaire/import (that was Junior's
   reasonable guess, but wrong for this product's model). **Open (small):** show the field
   as visibly *required* (the Install Progress "Contacts on file" check already warns when
   it's blank for a real client).
3. ~~**Seeded-admin identity tangled.**~~ **NOT A BUG (verified pass 1).** The handoff
   correctly seeds whatever is in Contact 2; the walkthrough's `edward.gutkowski@getgsi.com`
   came from manually typing over the blanked field, and `ap-team@…/RR Administrator` was
   leftover seed data. With #1 fixed, a clean run seeds **Sofia Bianchi** correctly.
4. **First-sign-in identity** — *core resolved (pass 1):* it was NOT a `login.html`
   session-resume bug (login.html does not auto-redirect on an existing token, and the
   reset flow bounces to a clean sign-in rather than auto-logging-in). "Signed in as me"
   was the Contact 2 overwrite from #1. **Open (small follow-up):** after the reset-link
   set-password, the clean sign-in pre-fills `rrv8.lastEmail` (the previous user) instead
   of the customer admin's email — carry the admin email through `?reason=reset-done` so
   the finale pre-fills the right address.
5. ~~**Prep email link.**~~ **DONE (pass 1).** Prep-preview modal now shows a labeled
   **"RR Installation Prep"** link instead of the raw URL.

### B. Flow / structure
> **Pass 2 (2026-06-03) — scoreboard & go-live clarity trio:** #7, #11, #13 done.
> **Pass 5 (2026-06-03) — modal + bridge:** #16, #10 done.
> **Pass 6 (2026-06-03) — pill explainer:** #8 done.
> **Pass 7 (2026-06-03) — DB row + RR Team:** #12, #15 done. **All mediums shipped.**
> Remaining: only the big restructures — #6 no-backtrack march, #9 named triage lanes,
> #14 licensing-as-a-step — each its own focused pass.
6. ~~**Move company-data + Go-live to *after* the Databases step.**~~ **DONE (pass 8,
   browser-verified).** The Go-live handoff card moved from
   the Install Bundle tab to the bottom of the Databases tab; it's now self-contained (the
   practice company-data simulate renders inside the card via `#js-go-live-sim`), painted by
   `paintGoLive` from `loadManageDatabases` (removed from `loadInstallTab`); the scoreboard's
   duplicate company-data simulate is gone; post-action reloads repoint to
   `loadManageDatabases`. One-way march achieved:
   `Client Details → Topology → Install Bundle (generate + heartbeat) → Databases (register → company data → go live) → done.`
   Browser-verified: card paints at the bottom of the Databases tab, the in-card simulate
   greens the gate + enables handoff, and the "see what your customer sees" payoff fires.
7. ~~**Hide "Simulate company data" until a database is registered.**~~ **DONE (pass 2).**
   The practice button is gated on the check no longer reading "No database registered yet,"
   so it no longer dangles a 400-ing action against the real "Next: Databases" step.
   (The *surface-it-where-Junior-is* relocation is part of #6's no-backtrack march.)
8. ~~**Practice client card → explainer companion card** + fix truncated pill labels.~~
   **DONE (pass 6).** A practice-only `.card-pill-guide` panel under the pills (sandbox
   cards only, via `a.practice`) decodes Agent / Database / Services and points at the
   next-action note below. **Adapted:** the original "move Open Client Details into the
   card" sub-idea was superseded — the card coach was simplified in #19 and sits right
   below the decoder, so the decoder points at it rather than duplicating the button.
   **Truncation fixed:** `.pill-state` now wraps (full "No databases" / "Not yet
   deployed") instead of ellipsizing; the pills stay matched-height (grid stretch).
9. **Named triage lanes** on Client Management — *Action Required* / *Waiting on Customer* /
   *Live* — that cards flow through **automatically** (the agent reporting in is the mover).
   Junior should always know "is this mine right now, or am I waiting on them?" The coach
   callout should flip to **"Waiting on the customer"** during the two customer-dependent
   pauses (prep submission, install).
10. ~~**Reality-vs-practice bridge note** between bundle generation and DB registration.~~
    **DONE (pass 5).** The Install Bundle coaching strip now says the next beat is a *wait*
    — in real life the card sits in the queue for days while the customer's team installs;
    in practice the orange shortcuts fast-forward it. *(Making the "DB team has completed
    their install" banner itself honest about being a shortcut folds into #9/#10 polish.)*
11. ~~**Demote check source tags** (VALC / Agent).~~ **DONE (pass 2).** The source pill now
    renders only on rows that need attention (fail / warning); green/pending rows are clean.
12. ~~**Databases row → collapse technical knobs.**~~ **DONE (pass 7).** Category / RAM /
    Job Name moved into the existing per-row detail drawer (editable there; the drawer's
    delegated handlers already served its GL-date toggle, so relocation was safe). Table
    slimmed to 6 columns (disclose · Service · Online Status · Name · Version · Options),
    all `colspan` 9→6. Service start/stop stays on the row (operational, used by real
    support). *(The stale "click Add Database" banner refresh remains a tiny open polish.)*
13. ~~**Disabled Go-live button must state its blocking reason loudly.**~~ **DONE (pass 2).**
    When the handoff button is disabled, its reason now renders as a loud amber callout
    (`.go-live-hint.is-blocked`) instead of faint side text.
14. **Licensing as an explicit, contract-driven step.** The contract specifies the licensed
    **company numbers** (distinct from the seat *count* on Client Details). Licensing should
    list all discovered companies as unlicensed; Junior licenses the contracted ones — "or
    it never gets done." For practice to teach it, **`Simulate company data` should seed a
    few sample companies** (some on-contract, some not) so the pick is rehearsable; today
    the tab is barren and unexplained.
15. ~~**RR Team should show only the customer's team.**~~ **DONE (pass 7) — as an
    explanation, not a filter.** The extra entries are a dev-environment artifact (the
    practice client shares the dev DB's users); a *real* customer's list already shows only
    their own people. Heuristically hiding `@getgsi.com` / `rrdemo` from a live user list
    would be fragile and wrong for production, so instead the RR Team coaching strip now
    says: "in this shared sandbox you'll also see dev-environment accounts — a real
    customer's list shows only their own people."
16. ~~**Create Client modal → wider/shorter two-column layout.**~~ **DONE (pass 5).** Modal
    widened to 640px; fields paired two-up (Name full; Primary Contact + Company Licenses;
    RR Admin Name + Email; Modules full) — four rows instead of six. *(The "this is the
    customer's card, from the contract" intro is already carried by the "From the signed
    contract" card label + the Client Details coaching strip.)*

### C. Teaching / copy — **COMPLETE**
> **Pass 3 (2026-06-03):** #17, #21, #22, #23 done. Card-neatness tweak —
> the **Live** pill moved into the footer next to **Active** (both lifecycle state),
> leaving the top pills row as the three health pills (Agent / Database / Services).
> **Pass 4 (2026-06-03):** #18, #19, #20 done. Bucket C fully shipped.
17. ~~**Drawer intro rewrite** — open with the mission + overview; drop the dev "Verify the
    email importer" link.~~ **DONE (pass 3).** Lede now opens with "a new customer just
    signed a contract, and your job is onboarding"; the dev parser-tests link is removed.
18. ~~**Per-tab practice coaching strip** in Manage Client.~~ **DONE (pass 4).** A blue
    `.mc-coach` strip on each of the six tabs, shown only under `.mc-practice` (so only the
    active practice tab's strip is visible; hidden entirely for real clients). Each carries
    the "whose job is it" framing and points at Save & Next. Existing inline field hints kept.
19. ~~**Stage the "installation prep" term** + simplify the first card coach.~~ **DONE
    (pass 4).** Card coach is now *"New client. Open Client Details to start setting them
    up"*; the term "installation prep" is introduced with a definition (tooltip) on the
    Client Details coaching strip, where it's actionable.
20. ~~**Define "topology" (and friends) at first use** + recurring-term tooltips.~~ **DONE
    (pass 4).** Added a reusable `.term` dotted-underline tooltip pattern; "topology" and
    "installation prep" are defined in plain English at first use (in the coaching strips).
    *(Optional later: extend `.term` tooltips to more labels — agent / bundle / heartbeat /
    services — though most already carry explanatory `title`s / helpText.)*
21. ~~**Reword "Company data is showing" → "Company data has loaded."**~~ **DONE (pass 3).**
    Label + value text + the go-live hint that quotes it all updated.
22. ~~**Install Progress: add a dot-color legend.**~~ **DONE (pass 3).** Compact legend
    (Ready / Fix before go-live / Waiting / Blocking) above the checklist. *(The "only the
    orange buttons are clickable" framing is still worth a coaching line — folds into #18.)*
23. ~~**"Install bundle" reassurance** line.~~ **DONE (pass 3).** Added under the Install
    Bundle intro: *"an install bundle is just the installer the customer's IT runs on their
    server — generating it here never touches your computer."*

### D. Leave alone (worked well — don't over-engineer)
- **Add Database** modal: clear label, one sensible option, obvious action.
- The **Save & Next** wayfinding pattern (build *on* it, don't replace it).
- The existing inline field hints on Client Details.

## Notes
- Several items compound: the RR Admin Email lifecycle (#2) is the root cause of the
  grayed-out handoff (#13) and the seeded-identity confusion (#3).
- The triage-lane work (#9) is the largest single item and the one that most changes the
  Client Management page; consider it its own chunk.
