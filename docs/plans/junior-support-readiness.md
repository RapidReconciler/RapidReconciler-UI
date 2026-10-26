# Junior support readiness: gap analysis

Status: first pass, 2026-10-07. Owner goal: a junior support person (GSI staff, using VALC 2.0 and the
customer KB) resolves most issues without the owner.

## Method and its limits

Failure modes come from four places:

- The project's incident history: closed rows in `WORKLIST-DONE.md`, open rows in `WORKLIST.md`, and
  `WORKLIST-LOG.md` (which adds little; it is mostly August analyst work).
- What the diagnostic screens actually say: VALC's Support Center (`templates/home.html`) and
  Troubleshooting page (`templates/troubleshooting.html`, `DatabaseHealthService`, `ssis-check.js`), V8's
  Administrator > Troubleshooting (`RRV8/troubleshooting-rules.js`), and V8's error reader
  (`RRV8/sidebar.js fetchErrorMessage`).
- The self-resolution docs: `Scenarios/` (11 pages), `GSIRRTech/install-scenarios/` (16), the Help Desk
  tools (`log-analyzer.html`, `connection-check.html`, `how-to-analyze-logs.html`) and
  `HelpDesk/start-here-helpdesk-tech.html`.
- This week's shipped behaviour: UI-210, UI-212, UI-213, VLC-151, VLC-157, VLC-178, VLC-112.

**The ranking counts rows, not support tickets.** Almost every row was found on the dev box by the owner or a
build session. Three came from the field (a support-mailbox thread, a real V7 install on a case-sensitive
server, and an AI draft for a real support email). So the order shows how often a failure turned up in the
project's own history. Re-rank against the support mailbox once a junior has worked it for a month.

## Gap table

Gap: **none** (a current runbook covers it), **stale** (a page exists but describes old behaviour), **missing**
(nothing a junior can follow).

| # | Failure mode (rows) | How it shows up | Self-resolution today | Gap | Fix |
|---|---|---|---|---|---|
| 1 | V8 sign-in and permission refusals (15: VLC-59, UI-169, UI-191, VLC-75, VLC-77, VLC-80, VLC-53, VLC-52, UI-177, VLC-61, VLC-49, VLC-31, UI-201, UI-145, UI-125) | V8: the server's own sentence, then `(HTTP nnn)`, then `Reference: <id>` (UI-210/212). Idle sign-out after 30 minutes. | `scenario-login-backend-connect-timeout` lists four login-screen notes, no refusal sentence, no reference; its IT email names only the V7 service. | stale + missing | Updated the login page. New `scenario-error-reference-number`. Reference section in the new Support Verdicts Reference. |
| 2 | Deploy failed, wrong target or wrong version (11: VLC-1, VLC-6, VLC-85, VLC-106, VLC-125, VLC-131, VLC-148, VLC-149, VLC-153, VLC-154, VLC-163) | Support Center "Failed deploys N"; Deployment Center row error. | Using VALC (Deployment Center steps). Nothing tells a junior where to start from the counter. | missing (internal) | Support Center counter table in `GSIRRTech/support-verdicts-reference.html`. |
| 3 | B to C stale, disabled or misreported (10: VLC-178, VLC-136, DAC-82, DAC-81, VLC-139, VLC-27, DAC-83, DAC-85, open VLC-179, DAC-86) | VALC Step 4 verdict: "SQL Agent job J is disabled", "The job's schedule … is disabled", "expected daily at 02:00". V8: "Nightly data refresh … has not run since". | `scenario-sql-agent-stale-data` sends IT on a manual hunt and keys on the V7 header light. | stale | Updated the scenario with V8's Troubleshooting row and the disabled-schedule case. Step 4 table in the reference. |
| 4 | SSIS package, catalog or proxy (9: ISP-6, ISP-7, ISP-8, ISP-9, VLC-17, VLC-162, VLC-170, VLC-176, VLC-151) | Step 3 "What failed"; Check SSIS proxy lines ending "a sysadmin runs install Script 4". | Install scenarios for deploy permission and driver mismatch; none mention the proxy or Script 4. | stale (internal) | Check SSIS section in the reference. An install scenario for the proxy lines is still owed (below). |
| 5 | Error text swallowed or generic (7: UI-212, VLC-169, UI-210, UI-151, UI-154, UI-137, UI-193) | Before: "HTTP 403 on <url>". Now: the server's sentence. | Same as row 1. | missing | Same as row 1. |
| 6 | Services JVM crash or restart loop (8: VLC-60, VLC-88, VLC-150, VLC-160, VLC-167, HK-24, HK-26, VLC-29) | Step 2 "Instance start timeout"; database offline; `hs_err` files. | Agent Documentation describes the backoff and heap cap; no runbook. | missing (internal) | Step 2 line in the reference. A crash-loop install scenario is still owed. |
| 7 | TLS and certificates (7: VLC-35, VLC-38, VLC-42, VLC-147, VLC-177, HK-25, UI-210) | Step 2 PKIX lines; V8 "Security certificate" row; HTTP 400 "requires TLS" on a plain-http probe. | `certificate-management.html` (current); `scenario-cert-not-secure-warning` (browser side). | stale (400 TLS reading) | "Readings that mislead" in the reference; V8 certificate row in the new admin-troubleshooting scenario. |
| 8 | Agent or database reads down when up, or is really offline (6: VLC-97, VLC-118, VLC-120, VLC-155, VLC-173, UI-207) | Support Center "Databases offline"; V8 "database is offline". | `scenario-database-offline` (2026-10-01, current). Does not tell a busy database (amber) from a stopped one. | stale (minor) | Added the amber case to the scenario. |
| 9 | Agent log unreadable, stale or short (6: VLC-157, VLC-176, VLC-152, VLC-166, VLC-180, UI-214) | Step 2 now reads the log through the broker; "Log not read: <why>" when it cannot. | Using VALC is current. Install scenarios, `how-to-analyze-logs.html` and `log-analyzer.html` still ask for a hand-copied V7 `out.log`. | stale | Updated four install scenarios and `how-to-analyze-logs.html`. Step 2 reason table in the reference. |
| 10 | Broker handshake refused (5: VLC-130, VLC-122, VLC-89, VLC-127, VLC-128) | Support Center "Brokers with no heartbeat"; Step 2 "not connected to VALC". | `scenario-clients-grid-not-updating` called V7 the "Current Agent". | stale (internal) | Updated the scenario (V8 and V7 paths). |
| 11 | SQL login or install account (5: VLC-114, ISP-9, VLC-27, DAC-84, VLC-137) | "Reached … SQL Server answered and refused it". | `scenario-post-deploy-rruser-login-error`, `scenario-database-sql-script-fails`. | none | None. |
| 12 | Slow reply misread as a firewall (5: UI-213, UI-171, VLC-39, UI-192, VLC-112) | V8 "Server to GSI" / "Server to its database" amber with elapsed time. | Nothing on the KB side. `connection-check.html` still calls an aborted probe a firewall drop. | missing + tool | New `scenario-admin-troubleshooting-amber-red`. Connection Check filed as a defect (below). |
| 13 | V7 and V8 on one box (5: VLC-112, VLC-179, DAC-86, VLC-93, VLC-177) | Port moved to a free one; V7 job takeover risk. | Using VALC Step 8; Installation Prep "ports are sticky". | none (internal) | None in this pass. |
| 14 | AI plan shows "Not included" (5: UI-145, UI-125, VLC-63, VLC-65, VLC-76) | V8 "Your Plan: Not included". | Fixed in code; no runbook needed unless it recurs. | none | None. |
| 15 | Licensed companies cleared or missing (4: VLC-91, VLC-94, VLC-168, UI-143) | Companies tab empty. | `scenario-companies-tab-empty`, `scenario-user-no-companies-session-refresh`. | none | None. |
| 16 | Excel export or browser local network access (3: UI-207, UI-192, VLC-134) | Export button does nothing. | `scenario-excel-export-button-no-response` (2026-10-01). | none | None. |

## What shipped in this pass

Internal (merged): this plan; `GSIRRTech/support-verdicts-reference.html` (every Support Center counter and
Troubleshooting verdict with what it means and what to do, plus the V8-to-VALC map);
`HelpDesk/start-here-helpdesk-tech.html` gains "Diagnose in VALC before you route"; four install scenarios
(agent services, clients grid, database unknown/stopped, post-migration login) name the V8 service and read
the log through Step 2.

Customer-facing (UI #778, owner ruling 2026-10-07): two new scenarios
(`scenario-error-reference-number`, `scenario-admin-troubleshooting-amber-red`) that end with the IT hand-off
card only, updates to the login, stale-data and database-offline scenarios, `how-to-analyze-logs.html`, and the
Log Analyzer's mismatched runbook link. Scenario pages stay out of the "Browse all documents" drawers; readers
find them through Help Desk search and the scenarios list (CLAUDE.md now says so).

Install docs (UI #779, owner rulings 2026-10-07): the AG recovery model as built, every schema upgrade needing
the same temporary SQL access as the install, the on-box JDE checks, the JDE platform changing only the driver
and connection string, and the V8 messaging outbound rule.

## Still owed

- **No verdict links to a runbook.** VALC's bands and V8's rows link only to their page help. Mapping each
  verdict to a scenario is done in the reference page by hand; a link on the band itself would be better.
- **V8 does not show a disabled B to C schedule.** VLC-178's sentence reaches VALC Step 4 only; V8's
  reconciliation row reads the last run, so the customer sees green until the data is visibly old.
- **VALC and V8 colour the same SSIS state differently** (running: amber vs green; cancelled: red vs amber).
- **`connection-check.html` still reads an aborted probe as a firewall drop** and has no slow-answer state
  (UI-213 parity).
- **Install-scenario dates never update.** `.github/scripts/update_doc_dates.py` globs `*.html` in each
  folder, not subfolders, so `GSIRRTech/install-scenarios/` keeps May dates whatever changes.
- **Escalation targets conflict.** Install scenarios say "GSI DBA", "network tech", "senior tech"; the
  Helpdesk Tech page routes to "RR DBA" / "RR Network Tech". Pick one set once the post-transition roles
  are named.
- **Install scenarios still owed:** the Check SSIS proxy lines (Script 4), and a Services crash loop.
- **Log Analyzer rules missing** for ERR_CONNECTION_TIMED_OUT, HTTP 400 "requires TLS" and `Reference:`
  lines.
- **Help Desk page dead code:** `troubleshooting.html` still scripts six "common" cards that no longer
  exist in the HTML.
