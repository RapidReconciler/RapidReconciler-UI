# VALC 2.0 console roles and a Support Center for the help desk (VLC-284)

Written 2026-11-12. Status: **plan only, nothing built.** Worklist rows: VLC-284 (this plan), VLC-286 (the
"Here's your day" band), VLC-283 and VLC-285 (queue filing and queue filters, which build on it).

Everything under "Measured" was read from the Valc source at main `7a78acd` on 2026-11-12. Nothing in it was
tested by sending requests. Everything under "Ruled" is the owner's, with the date. The rest is a recommendation
and says so.

## 1. What the owner ruled (2026-11-12)

1. Three roles. **Helpdesk** sees the Support Center, the Message Center and the User Docs. **Developer** sees the
   Development Queue and all docs. **Administrator** sees everything. Today's two operators are Administrators.
2. A new help desk person does no development work and no customer onboarding. Their outputs are three: an email
   reply, a filing to the Customer Queue, and a fleet upgrade ("sees who is behind and deploys. No more though
   than that").
3. Every role sees and uses the sidebar's Services section (RR App Start and Stop, VALC Rebuild and restart).
4. Prod VALC may write Customer Queue issues to GitHub. Filing must work on Prod, not only on the dev box.
5. The cards at the top of the Support Center go. Every band carries a state and a count (VLC-279 did this for the
   mailbox and Troubleshooting).
6. A "Here's your day" band takes the cards' place (VLC-286). Open: whether AI writes it, or rules rank it and AI
   explains each item.
7. Roles are enforced by the server. Hiding a card or a sidebar entry is not access control.

## 2. Measured: how access is decided today

One role. `users.valc_operator` (migration V63) is a boolean; `ValcUserDetailsService` refuses anyone without it and
grants `ROLE_VALC_OPERATOR`. Two operators exist on the dev VALC. A second flag, `users.release_approver` (V100),
marks who may approve a release.

`SecurityConfig` decides access in two chains: an API chain, where `/api/v1/admin/**` and the client, file-version
and maintenance-script APIs require `ROLE_VALC_OPERATOR`, and a dashboard chain for `/valc/**`. Under the Entra
profile, `EntraSecurityConfig` claims `/valc/**` and admits only active operators.

The exact rule on each path, and two that build step 1 tightens before any role is added, are on the worklist row
(VLC-284), not in this file: this repository is public.

No method security is in use (`@PreAuthorize` appears only in comments), and the templates have no Spring Security
dialect, so the sidebar cannot ask "is this user a Developer" today. The only conditional entry is Development
Queue, on the `developmentEnabled` model attribute.

## 3. Measured: the routes

224 console routes: 84 under `/valc/**` and 140 under `/api/v1/admin/**`. A further set sits outside both prefixes
(`/api/services/**`, `/api/v1/clients/{id}/databases/**`, `/api/v1/file-versions`, `/api/v1/db-maintenance-scripts`).

| Group | Routes | Changes a customer box or database |
|---|---|---|
| Support Center home | 3 | no |
| Support mailbox | 12 | sends email; files a GitHub issue |
| Troubleshooting | 17 | `execute-sql`, `refresh-job-stop` |
| Fleet Upgrades, Release Bundles, deploy | 39 | deploys, rollouts, release-train rollout |
| Database install and manage | 10 | `install/execute`, `decommission-database` |
| SSIS, jobs, data loads | 27 | run, stop, clear tables, schedule, build config |
| Client Management, onboarding | 66 | V7 writes, Services restart |
| Development Queue | 20 | no (GitHub only); dev box only |
| Message Center | 5 | posts to customers' V8 |
| Certificates | 3 | replaces the broker certificate |
| Operators and users | 19 | grants and revokes access |
| Docs | 1 | no |
| Change password | 2 | no |

Many `/valc/deployment/*` reads are shared between pages (Troubleshooting uses `btoc-log`, `db-health`,
`rollforward-summary`, `ssis-last-execution`; Release Bundles uses others), so the map below is by route, not by
controller.

## 4. The role map (recommendation, from the rulings)

Each route gets the lowest role that may call it. Administrator may call everything.

| Group | Helpdesk | Developer | Notes |
|---|---|---|---|
| Support Center home, summary | yes | yes | Ruling 1 gives Developer the Development Queue and docs. Whether a Developer also lands on the Support Center is **open question A**. |
| Support mailbox: read, draft, reply, mark, file | yes | no | Outputs 1 and 2. |
| Troubleshooting: read steps 2 to 6, agent log, band | yes | no | Read-only plus filing. |
| Troubleshooting: `execute-sql` (step 7) | no | no | Administrator only. An output past the three ruled (Claude's reading of "no more than that"). |
| Troubleshooting: `refresh-job-stop` (step 4) | no | no | Administrator only, same reading. |
| Investigation and step filing (VLC-283) | yes | no | Output 2. |
| Fleet upgrades: `rollouts/preview`, `agent-targets`, `rollouts`, `rollouts/{id}/start`, `agent-rollouts` and its status, resume, cancel | yes | no | Output 3. |
| Release Bundles: release trains, publish, approve, UI deploy, `execute-services`, `execute-ssis`, SSIS servers | no | no | Administrator, plus `release_approver` where it applies today. |
| Database install and manage | no | no | Onboarding. |
| SSIS, jobs, data loads | no | no | Onboarding and operations. The read-only ones Troubleshooting needs are listed in the row above. |
| Client Management, onboarding, V7 | no | no | Ruled out for Helpdesk. |
| Development Queue | no | yes | |
| Message Center | yes | no | Ruling 1. It posts to customers; **open question B** is whether a new help desk person posts or only reads. |
| Certificates | no | no | |
| Operators and users | no | no | Administrator only, always. |
| Docs: User Docs | yes | yes | |
| Docs: Tech Docs, `/valc/docs` | no | yes | |
| Services section: `/api/services/**` | yes | yes | Ruling 3: any console role. |
| Change password | yes | yes | |

Fleet upgrades for Helpdesk is the one row that lets a new person change a customer box. The existing eligibility
checks stay as they are (no heartbeat, would move an agent backwards). Nothing new is granted beyond starting a
rollout the page already offers.

## 5. How to enforce it (recommendation)

**Data.** One migration, `V122__console_role.sql`: add `users.console_role` (`HELPDESK`, `DEVELOPER`,
`ADMINISTRATOR`, null for a non-operator), backfilled to `ADMINISTRATOR` wherever `valc_operator` is true, so nobody
loses access on the day it ships. `valc_operator` stays as "may sign in to the console" for one release, then is
derived from the role and dropped later. `release_approver` is unchanged: it is a second key for approvals, not a
role.

**Authorities.** `ValcUserDetailsService` and the Entra mapping grant `ROLE_VALC_OPERATOR` as today (every console
user), plus one of `ROLE_CONSOLE_HELPDESK`, `ROLE_CONSOLE_DEVELOPER`, `ROLE_CONSOLE_ADMIN`.

**One route map, in one class.** A `ConsoleRouteMap` lists every console route pattern with the roles that may call
it, and both chains build their matchers from it. Reasons for a map over annotations:

- Method security is not in use, and 224 routes across 30 controllers annotated by hand is where one gets missed.
- The map is data, so one test can walk it.
- **Default deny.** A console route that is not in the map is Administrator only. A new endpoint added next month
  without a map entry is closed to the help desk, not open.

`/valc/**` and `/api/services/**` are built from the map too, so every console route answers to a console role.

**The test that makes it real.** For every mapping Spring has registered under the console prefixes
(`RequestMappingHandlerMapping`), and for each of the three roles, a MockMvc request must come back 403 when the
map says no, and not 403 when it says yes. A second assertion fails if a registered console route has no map entry
and is not on a short, written list of Administrator-only defaults. A mutation arm removes one entry and requires
the test to go red.

**The page follows the server.** `CurrentUserAdvice` exposes the role to the templates. The sidebar shows only the
entries the role may open, and the Support Center shows only the bands the role may use. A hidden entry is a
courtesy; the 403 is the control.

## 6. The Support Center after the redesign

Top to bottom, for Helpdesk:

1. **Here's your day** (VLC-286). Replaces the four cards.
2. **Support mailbox.** Exists. State and count done in VLC-279. Adds the "open in the Customer Queue" chip
   (VLC-285).
3. **Troubleshooting.** Exists as a band since VLC-279. Without step 7 and without Stop the refresh job for
   Helpdesk. Adds File to the Customer Queue on steps 2 to 5 (VLC-283).
4. **Customer Queue.** New band: what I filed, waiting on the customer, closed today. The data exists
   (`support_queue_links`, `development_requests`, `QueueHistoryService`).
5. **Fleet upgrades.** New band: who is behind, per component, and Deploy. The summary already exists server-side
   (`SupportCenterService.upgrades()`, in `/api/v1/admin/support/summary`); the deploy is the existing
   `rollouts` and `agent-rollouts` endpoints.

Clients and Development Queue stop being cards. They are pages the sidebar already links, for the roles that may
open them.

**Here's your day.** Recommendation, as agreed in the VLC-284 discussion: rules rank the list (overdue email, red
problems, email near its deadline, amber problems, upgrades), joined by customer, and each item has an on-demand AI
explanation, the pattern Draft a reply and Investigate with AI already use. The same facts then always give the same
day, and nothing can be left out. The owner's later wording ("an AI Here's your day band") may mean AI writes it;
that is **open question C**, recorded on VLC-286.

## 7. Filing from Prod (ruling 4)

Measured: `DevelopmentGate` is on only when `valc.env` is `dev`. It gates 20 Development Queue routes, the
investigation filing, queue history, and the two mailbox filing routes; off the dev box they answer 404 and the
page shows no File button. Issue creation is `GitHubReleaseService.createIssue`, called by `SupportQueueService`
(RapidReconciler-Valc, label `customer`) and `InvestigationService` (RapidReconciler-DB, label `investigation`).
The token is resolved in one place, `GitHubReleaseService.resolveGithubToken`.

Plan:

- Split the gate in two. **Customer Queue filing** (mailbox file, investigation file, step file, queue history, the
  queue-state read) is allowed wherever a GitHub token that can create issues is present. **The Development Queue
  itself** (board, lane, bundles) stays dev box only.
- Prod VALC needs a token scoped to create and read issues in RapidReconciler-Valc and RapidReconciler-DB, and
  nothing else. Which token Prod holds today, and its scopes, is **not measured**: it needs a look at the Prod
  service's environment, which this session did not have. A fine-grained token limited to Issues on those two
  repositories is the recommendation.
- When the token is missing or lacks the scope, the File button says so. It must not look filed.

## 8. Build order

Each step is its own pull request with its own tests, and each leaves the console working for today's two
Administrators.

1. **Tighten the two loose rules** named in section 2, with a test. No role change; smallest, and first.
2. **Role column, authorities, route map, the walking test.** Everyone backfilled to Administrator, so nothing
   changes for anyone yet.
3. **Operators page:** assign a role. Sidebar and Support Center follow the role.
4. **Filing off the dev box** (section 7), then **VLC-283** (file from a Troubleshooting step).
5. **Customer Queue band**, with VLC-285's chip and the close shown where it came from.
6. **Fleet upgrades band.**
7. **Here's your day** (VLC-286), and the cards go.
8. Using VALC, the in-app help and the Security and Access doc, in the same pull requests as the behaviour they
   describe.

## 9. Open questions for the owner

- **A.** Does a Developer also see the Support Center, or only the Development Queue and docs?
- **B.** Message Center for Helpdesk: may a new help desk person post to customers, or only read what is live?
- **C.** Here's your day: rules rank and AI explains each item (recommended), AI writes the whole thing, or a
  rule-ranked list under a short AI-written opening?
- **D.** Troubleshooting step 7 (Ad-hoc SQL) and Stop the refresh job: Administrator only, as assumed here?
- **E.** The Services ruling lets Helpdesk rebuild and restart VALC, which signs everyone out for the length of a
  build. Confirmed on 2026-11-12 ("Everyone uses them"); listed so it is a known cost, not a surprise.

## 10. What this plan does not cover

Customer-side roles in V8 (the `roles` table and `AdminUsersController`) are untouched. Per-customer scoping of a
help desk person (seeing only some customers) was not asked for and is not planned.
