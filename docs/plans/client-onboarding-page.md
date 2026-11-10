# One page per client, in install order (VLC-272)

**Status:** plan, 2026-11-10. Owner: "Yes, plan it", after asking whether Manage database belongs on the client
page because installing a customer means bouncing between the client card and the Deployment Center.
**Spans:** RapidReconciler-Valc (pages, scripts, routes), RapidReconciler-AI (Using VALC, Services Documentation).
**Builds on:** `onboarding-process-flow.md` (the flow review), `deployment-center-manage-database-merge.md` (the
2026-06-17 ruling that Manage database is database-centric, new or existing, which this plan keeps).

---

## The problem, measured

The steps are grouped by component, not by what each one waits for. One new customer crosses between pages three
times:

| Real step | Where it is today |
|---|---|
| Client Details, Topology, Agent Installer | Clients › Manage Client (a 960×720 modal) |
| Readiness, Install, SSIS package, SSIS environment, Bootstrap, Load, Schedule | Deployment Center › Manage database |
| Licensing, RR Team (go-live), SSO | back on Clients › Manage Client |

The two walkthroughs split at the same seams. That is why VLC-271 needed "Back to onboarding" plumbing
(`data-coach-then-href`, `&walk=install`) to carry the user from one page to the other and back.

What each step really waits for, read from the code and from the 2026-11-10 live rehearsal (VLC-270):

- **Licensing needs Bootstrap, not the full load.** Bootstrap seeds `rcompanies`; `SsisConfigService` documents
  Bootstrap as the step that "unlocks licensing/handoff". On the rehearsal, 80002 and 80003 were licensed after
  Bootstrap and before Load, and reached the broker publish (12 company/database pairs).
- **The load reads licensed modules, not licensed companies.** `SsisConfigService` derives `ModInv` / `ModRnv` from
  the client's modules; `SsisDeployService` skips Receipts when RNV is unlicensed. No company list goes into the
  load. (Read from the code; not separately measured.)
- **The go-live gate is Bootstrap too, in code.** "Company data has loaded" (`InstallChecksController`) is green
  when any database reports a non-empty `rcompanies`, which Bootstrap writes. The handoff server check itself only
  requires Contact 2 (`GoLiveHandoffService`).

So the owner's "we can't license or assign user rights until data is loaded" is right about the order, and the
gate is Bootstrap. Whether go-live should also wait for the full load is decision D1 below.

Sizes that set the cost:
- Manage database tab: `deployment.html` lines 63 to 1062 (about 1,000 lines of markup), driven by one inline
  script of about 5,760 lines shared with Fleet Upgrades and Release history (129 `inst*` functions, 10 `md*`).
- Manage Client: seven panels in `dashboard.html` (16,339 lines). The SSO panel already copies the Deployment
  Center's band styles into the modal, so the band look is not new to that page.
- Entry points to move (in the Valc repo): 2 callers of `openManageClient`, and 7 links to `/valc/deployment?`
  (the header load chip in `admin-nav.html`, Troubleshooting's "Deployment Center →", the client card's Add
  Database, the help doc, and three reloads inside `deployment.html`).

---

## The layout

### A client page, sections in the order the work can happen

`/valc/clients/{id}` replaces the Manage Client modal. A left rail lists the sections; each later section shows
locked, with the reason, until what it waits for is done.

| # | Section | Opens when | Done when |
|---|---|---|---|
| 1 | Client Details | always | the first save (gap 16: today's dot is green at Create) |
| 2 | Customer setup: installation prep, Topology, DNS | Client Details saved | App server configured, domain resolves |
| 3 | Agent | Topology has an app server | the agent has reported in |
| 4 | Database: Readiness, Install, Services, SSIS package, SSIS environment + Validate, **Bootstrap** | the agent has reported in | Bootstrap has run on at least one database |
| 5 | Companies: license per database, Check JDE for more companies | Bootstrap has run | at least one company licensed |
| 6 | Data: Load, Schedule | Bootstrap has run | the load finished and the schedule is on |
| 7 | Go-live: RR Team, welcome email, handoff | see D1 | handed off |
| 8 | SSO (if purchased) | handed off | configured, or not purchased |

Section 4 to 6 are the existing Manage database bands, unchanged in what they do, with the customer fixed and a
database picker for that customer only. An existing customer's maintenance (reload, schedule, Services rollback,
remove) happens in the same sections, which is the June ruling's point: the bands serve new and existing databases
alike.

The Licensing tab goes. Section 5 is the one place to license, which settles gap 4's "two places".

### The Deployment Center keeps what spans customers

- **Fleet Upgrades** and **Release history**, unchanged.
- **A fleet database list** (new, read-mostly): every customer's databases with version, Services, last load and
  schedule. Each row opens that client's page at the right section and database. It replaces Manage database as the
  "I know the database, not the customer" entry point.
- `/valc/deployment?clientId=…&databaseId=…` redirects to `/valc/clients/{id}?section=database&databaseId=…`, so the
  header load chip, Troubleshooting links and bookmarks keep working.

### One walkthrough

*Onboard a new client* runs top to bottom on the client page, sections 1 to 8, on the practice client. *Install a
customer database* and its handoff plumbing go: the coach no longer crosses pages. *Ship a release* stays on Fleet
Upgrades.

---

## Decisions for the owner

**Owner 2026-11-10: "I like your 7 step proposal"**, read as D1 to D7 accepted; D6 and D7 as revised under the
release flow below.

| # | Decision | Recommendation (accepted) | Why |
|---|---|---|---|
| D1 | Go-live opens after Bootstrap (what the code allows) or after Load + Schedule | **After Load + Schedule** | The welcome email invites the customer's administrator in; with only companies seeded they sign in to empty screens. Costs one gate on the page, nothing on the server. |
| D2 | Full page or a bigger modal | **Full page** | The bands are two-column cards built for a page width; a modal tall enough for eight sections is a page without a URL, and sections need deep links. |
| D3 | Fleet database list on the Deployment Center | **Yes** | Without it, a tech who knows only the database name has to find the customer first. |
| D4 | Keep a read-only licensing summary on the client page header | **Yes, a count** ("12 companies licensed on 2 databases") | Licensing gets one place to edit, and the count is visible without opening it. |

### Release bundles, and QA sharing this box's databases (owner question 2026-11-10)

Owner: QA will use this box's databases, not a new set, and the same databases serve demos. "Should we be
deploying drafted bundles instead of individual components?"

What VALC does today:
- On a QA or Prod VALC, every deploy path takes only components that belong to a release bundle approved for that
  environment (`ReleaseTrainGate`, VLC-174), and the page binds the pickers to one bundle.
- On a Dev VALC (this box) every component is offered on its own, and *Ship a release* tests a **draft** bundle by
  rolling it out to Dev databases before Publish (VLC-241, VLC-266).

What changes when QA owns these databases:
- **One VALC per database.** A broker runs exactly the instance list its VALC sends and stops anything missing
  from it. If this Dev VALC and the QA VALC both published for Demo1, each would keep undoing the other. So "QA uses
  these databases" means this VALC hands Demo1/2/3 to QA. This is reasoning from the protocol, not a measured
  collision; it is the dev-box-equals-production rule applied before the fact.
- **A shared database must sit at a named bundle.** A QA result, or a demo, means nothing if someone dropped one
  new dacpac onto the database the day before. Individual components then belong only on a database nobody tests
  or demos on.
- **Drafts need somewhere to be tested.** If Dev gave up every database, a draft could only be tested on QA, where
  the gate refuses anything not yet QA-approved. The owner's model below avoids that: Dev keeps a database.

**The release flow (owner 2026-11-10):** "development … builds bundles and deploys to the demo db's. The code is
tested and released to QA where it is verified pass or fail. Pass gets approved for release to prod, fail goes back
to development. The Fleet process should be pushing a bundle to the dev databases on this box and QA. Prod will
push bundles to new or existing customers." This is what `ReleaseTrainGate` already enforces (QA approval, then
Prod approval; a withdrawn bundle is approved nowhere, VLC-228).

| VALC | Its databases (all on this box's SQL Server) | What it deploys |
|---|---|---|
| Dev (this box) | `RapidReconciler_Demo3`, `RapidReconciler_Scratch` (new), the practice database | Draft bundles to Demo3 for testing; single components to Scratch only |
| QA | `RapidReconciler_Demo1`, `RapidReconciler_Demo2` (owner 2026-11-10: "Demo1 and 2 go to QA") | Published bundles, verified pass or fail; demos run here (owner ruling 2026-11-01: QAv8 is for GSI testing and demos) |
| Prod | customers | Bundles approved for Prod, to new and existing customers |

| # | Decision | Ruling |
|---|---|---|
| D5 | Shared databases take whole bundles only | **Accepted.** Bundle-only is a property of the database. `RapidReconciler_Scratch` (owner: "You can create a RapidReconciler_Scratch db to support it") is the one Dev database that takes loose components |
| D6 | Testing and demos on the same databases | **Demos move to QA's databases**, which only ever hold published bundles: Demo1 and Demo2 |
| D7 | Where a draft is tested | **On Dev, on Demo3** (revised from "on QA"): QA sees published bundles only, so the gate needs no draft target |

**Sidebar (owner 2026-11-10):** Support Center, Development Queue, Client Management, Release Bundles (formerly
Deployment Center), Troubleshooting, Message Center, Operators. The order is built (in the VLC-271 worktree,
`admin-nav.html`, with a render test). **The rename: "now" (owner 2026-11-10)**, ahead of P4. Until Manage
database leaves the page, the sentences about installing a database say "in Release Bundles, on the Manage
database tab". Sized 2026-11-10: 133 lines in Valc (about 40 of them shown to an operator; the rest are comments
and Flyway migrations, which must not change), 33 test files, 65 files in the UI repo.

**The Development Queue becomes three tabs (owner 2026-11-10, VLC-273):** Tasks (the Customer Queue and Test
Findings as inputs, and a new section for the output, the next release bundle), Recently Released, and Release
History with the Audit export. Planned in its own row.

For the client page this means the Database section picks **one bundle** at the top; Install, SSIS package and
Services take their versions from it, shown read-only. Loose per-component pickers stay only for a bundle-only=off
database on Dev. A real customer only ever receives approved bundles, so the junior learns the same single choice
they will make at a customer.

**Customer-wording rulings (owner 2026-11-10)**, which close the three questions the flow review left open:

- **Scripts (gap 10):** "GSI deploys scripts, the customer needs to provide temporary SQL Server admin credentials
  for database installation." So the customer never runs Script 4; GSI does, with the temporary sysadmin login the
  customer supplies. `rr-installation-prep` asks for those credentials; the install steps say GSI runs the scripts.
- **Meetings (gap 15):** "V8 has a discovery call and install meeting." Every doc says both happen.
- **The prep email (gap 15):** "Do not drop the cert claim." The claim stays, so the checklist it describes has to
  cover certificates; the checklist gains that item rather than the email losing the sentence.

---

## Build phases

Each phase ships on its own and leaves VALC working.

**P0a. `RapidReconciler_Scratch`.** Install it on client 1 through Manage database (the product's own path; the
install login is typed by the owner, never stored). It adds a fourth Services instance to client 1's broker (2 GB
max heap on a box whose commit limit HK-51 just raised), so it is installed once and left. It reads Demo2's JDE source
(owner 2026-11-10: "Use Demo2's for the scratch DB").

**P0. Commit VLC-271 as it stands.** Its fixes hold under any layout: the practice handoff that completes, licensing
after Bootstrap, Install reopening on the new database, Load not ticking mid-run. Its page-to-page handoff (gap 2)
is retired in P3; that is about 40 lines of throwaway (34 added in `walkthrough-coach.js`, 3 of CSS, a few in the
two pages).

**P1. Extract Manage database, no visible change.**
- Markup into a Thymeleaf fragment, `fragments/manage-database.html`; the script into `/js/manage-database.js`, with
  the helpers Fleet Upgrades also uses (the results renderer, deploy progress, tab activation) moved to a shared file.
- The Deployment Center renders the fragment, so nothing moves yet.
- Gate: every existing JS test and `DeploymentPageRenderTest` pass against the extracted files; a headless load of
  the Deployment Center shows the same bands. This is the risky phase (one script, shared state), so it goes alone.

**P2. The client page.**
- Route `/valc/clients/{id}`; Client Details, Topology, Agent, RR Team and SSO panels move from the modal into
  page sections; the Database section renders the P1 fragment with the customer fixed.
- `openManageClient` navigates to the page; the modal is removed once both callers move.
- Section locks and reasons from data VALC already has (`/readiness`, db-step markers, Install Progress checks).
- Gate: render tests for the page; a JS test per lock (opens on its condition, says why while locked, arm red).

**P3. Licensing and the one walkthrough.**
- Section 5 hosts the per-database licensing table (today band 6's); the Licensing tab goes.
- *Onboard a new client* re-listed over sections 1 to 8; *Install a customer database* and VLC-271's
  `then-href` handoff removed; the coach tests (`test-vlc255`, `test-vlc271-*`) rewritten for one page.
- Gate: the live rehearsal, Create Client to Exit on the practice client, on one page.

**P4. The Deployment Center becomes Release Bundles.**
- Manage database tab removed; fleet database list added; the redirect for old deep links; the 7 link sites
  repointed.
- The page is renamed **Release Bundles** everywhere an operator reads it (sidebar, title, heading, links, help
  docs, Using VALC). The band inside Fleet Upgrades that is already called "Release bundles" gets another name in
  the same pass, so the page and one of its bands do not share one. The `/valc/deployment` route stays.
- Bundle-only databases: a per-database flag; the Database section's pickers bind to one bundle unless it is off.
- Gate: each old link lands on the right client, section and database (a test per link shape).

**P5. Docs.** Using VALC, help docs per section, `docs/walkthrough-pattern.md`, Services Documentation, and the
VALC sidebar docs sweep (CLAUDE.md). Gaps 11, 12 and 14 are written into the new sections' text here rather than
patched into the old walkthroughs.

---

## What happens to the flow review's gaps

| Gap | Fate |
|---|---|
| 1, 3, 5, 9, 13 | done (VLC-270, VLC-271, #715, VLC-267) |
| 2, 4 | absorbed: one page, one licensing place |
| 6 | Services skip reason is moot once the practice database has a broker (VLC-270); Database release gets its label in P3 |
| 7, 8 | fixed in P3 when the steps are re-listed (Validate part of done; the package version row ticks step 4) |
| 11, 12, 14 | written into the section text in P5 |
| 10, 15 (customer wording) | owner decisions, above |
| 15 (internal docs), 16 | P5, and the Client Details dot in P2 |

---

## Risks

- **P1 is the hard part.** The inline script mixes the install bands with Fleet Upgrades. If the shared state is
  more tangled than the function names suggest, P1 grows; measure the cross-references first and report before
  cutting.
- **Muscle memory.** Techs who open the Deployment Center to reload a database now land on the fleet list, one click
  more. The redirect keeps every existing link working.
- **The coach.** `walkthrough-coach.js` keys steps to band elements; moving bands into a new page changes their
  selectors. P3 rewrites the step lists and their tests together.
