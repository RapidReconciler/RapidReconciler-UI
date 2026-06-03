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
1. **Client Details doesn't populate Name / Contact 1 / RR Admin Email on load.** They
   come from the contract at card creation but render blank until an email import fills
   them. Blocks **Send prep** ("no Contact 1 on file") — and in the real sequence you send
   prep *before* any import. Populate the editable form from the saved client on open.
2. **RR Admin Email lifecycle.** Make it (a) **required**, (b) **asked for in the
   installation-prep questionnaire** so it returns in the submission, (c) **filled on
   import**, and (d) **flagged when blank** (not shown as a quiet optional blank). It
   silently-missing is what grays out Go-live handoff at the finish line.
3. **Seeded-admin identity is tangled.** Go-live card showed `edward.gutkowski@getgsi.com`,
   RR Team showed `ap-team@mauromfg.example.com`, neither matched the entered Contact 2.
   Verify the handoff seeds the RR Administrator **email that was entered**, never the
   logged-in user or a default.
4. **First-sign-in deep-link resumes the current GSI session** instead of landing as the
   seeded RR Administrator — defeats "see what your customer sees" entirely. The
   `login.html?resetKey=` flow must **clear/override any existing V8 session** so it runs
   set-password and signs in as the customer's admin (the dev token in `localStorage`
   currently hijacks it).
5. **Prep email link** — replace the raw GitHub URL with a labeled **"RR Installation
   Prep"** hyperlink (real href; needn't be live in practice).

### B. Flow / structure
6. **Move company-data + Go-live to *after* the Databases step.** Today they live on the
   Install Bundle tab, so Junior registers a DB on the Databases tab and must backtrack two
   tabs to finish. Make it a one-way march:
   `Client Details → Topology → Install Bundle (generate + heartbeat) → Databases (register → company data → go live) → done.`
7. **Hide "Simulate company data" until a database is registered** (matches its server-side
   guard; today it dangles an action that 400s). Surface it where Junior *is* when it's due.
8. **Practice client card → explainer companion card.** First time Junior lands on the
   card, a practice-only card decodes the 3 pills (Agent / Database / Services), says why
   they're dim and what greens each, explains the coach callout, and **hosts the
   "Open Client Details" button** (read, *then* click). Fix the **truncated pill labels**
   ("No datab…", "Not yet d…").
9. **Named triage lanes** on Client Management — *Action Required* / *Waiting on Customer* /
   *Live* — that cards flow through **automatically** (the agent reporting in is the mover).
   Junior should always know "is this mine right now, or am I waiting on them?" The coach
   callout should flip to **"Waiting on the customer"** during the two customer-dependent
   pauses (prep submission, install).
10. **Reality-vs-practice bridge note** between bundle generation and DB registration: in
    real life you've sent the bundle (that *is* the go-ahead to the customer's teams) and
    the card waits in the triage queue for days; in practice we fast-forward it. Make the
    "The DB team has completed their install" banner honest about being a shortcut.
11. **Demote check source tags** (VALC / Agent). They look like buttons and use internal
    jargon; their only value is diagnostic. Hide from the default row; surface on expand or
    on a failing row only.
12. **Databases row → collapse technical knobs** (start-service `▷`, RAM, Category, Job
    Name) behind the `▸` expander. Clean row = name + status. The bare play icon currently
    reads as "another simulate button." Explain PENDING; refresh the stale "click Add
    Database" banner once a DB is added.
13. **Disabled Go-live button must state its blocking reason loudly** — not gray out with a
    faint side hint.
14. **Licensing as an explicit, contract-driven step.** The contract specifies the licensed
    **company numbers** (distinct from the seat *count* on Client Details). Licensing should
    list all discovered companies as unlicensed; Junior licenses the contracted ones — "or
    it never gets done." For practice to teach it, **`Simulate company data` should seed a
    few sample companies** (some on-contract, some not) so the pick is rehearsable; today
    the tab is barren and unexplained.
15. **RR Team should show only the customer's team** (the seeded admin) for a clean lesson;
    dev/internal seed users (`@getgsi.com`, `rrdemo`) bleed in via the shared dev database
    and would never appear for a real customer.
16. **Create Client modal → wider/shorter two-column layout** + a one-line intro
    ("This is the customer's card — fill it in from the signed contract").

### C. Teaching / copy
17. **Drawer intro rewrite** — open with the mission ("a contract was signed; your job is
    onboarding") + a plain six-stop overview, instead of jargon. Drop the dev-only
    "Verify the email importer" link from Junior's view.
18. **Per-tab practice coaching strip** in Manage Client (what this tab is for · what to do ·
    "Save & Next"), carrying the "whose job is it" framing. Visually distinct from the real
    "Import from email" banner. Keep the good existing inline field hints.
19. **Stage the "installation prep" term** — define it once, when it's actionable, not
    sprinkled (card coach + Import banner) before Junior has met it. Simplify the first card
    coach to the one fact Junior needs at card creation.
20. **Define "topology" (and friends) at first use** + recurring-term tooltips.
21. **Reword "Company data is showing" → "Company data has loaded."** "Showing" reads like
    a data-exposure alarm to a nervous reader.
22. **Install Progress: add a dot-color legend** (green = ready / amber = fix before the
    finish / grey = waiting / red = blocking) and frame it as a *live readiness checklist,
    not an exam*. Note the only clickable things on it are the orange practice shortcuts.
23. **"Install bundle" reassurance** — one line: *"an install bundle is just the installer
    the customer's IT runs on their server; it never touches your computer."*

### D. Leave alone (worked well — don't over-engineer)
- **Add Database** modal: clear label, one sensible option, obvious action.
- The **Save & Next** wayfinding pattern (build *on* it, don't replace it).
- The existing inline field hints on Client Details.

## Notes
- Several items compound: the RR Admin Email lifecycle (#2) is the root cause of the
  grayed-out handoff (#13) and the seeded-identity confusion (#3).
- The triage-lane work (#9) is the largest single item and the one that most changes the
  Client Management page; consider it its own chunk.
