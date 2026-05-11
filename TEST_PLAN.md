# RapidReconciler Help Desk &mdash; Test Plan

Behavior-driven tests for the three customer-facing surfaces:

1. **RR University** (`RRUniversity/rapidreconciler-university.html`)
2. **Help Desk** (`HelpDesk/troubleshooting.html`) + the 22 scenario pages
3. **Log Analyzer** (`HelpDesk/log-analyzer.html`)

Each row lists **Name** &middot; **Expected**. The trigger is folded into the expected text. Smoke-only rows (page renders, link points where it should, hover lifts, layout reflows, fonts loaded, no 404s on images) are intentionally omitted &mdash; this plan only verifies computed behavior, content, and routing logic.

---

## 1. RR University (`RRUniversity/rapidreconciler-university.html`)

### 1.1 Module pills (filter)

| # | Name | Expected |
|---|---|---|
| 1.1.1 | Default pill state | On first load (after clearing `rru-search-filters-v1`), only **Inventory** is checked; A/P / Transfers / Administrators are unchecked. Matches `DEFAULT_FILTERS = { inventory: true, ap: false, transfers: false, administrators: false }` in the page JS and the "Default: only Inventory ON" note in CLAUDE.md. |
| 1.1.2 | Toggle persistence | Toggling a pill ON, reloading: it stays checked (localStorage). |
| 1.1.3 | Multiple modules persist | Multiple ON pills survive reload. |
| 1.1.4 | Uncheck | Clicking a checked pill returns it to outlined style; reload preserves the unchecked state. |
| 1.1.5 | Each pill reveals its role card | Toggling each module ON one at a time reveals the matching role card in the Onboarding drawer (Inventory blue / A/P orange / Transfers green / Administrators navy). Toggling OFF hides only that card. |
| 1.1.6 | Each pill reveals its Browse-all group | Toggling each module ON one at a time reveals the matching doc group in the Browse-all drawer. "Getting started & general" stays visible regardless. |

### 1.2 Search

| # | Name | Expected |
|---|---|---|
| 1.2.1 | Empty query | Results panel hidden; drawers visible. |
| 1.2.2 | Single-word (`cardex`) | Within ~200&nbsp;ms results appear. Status line: "N matches across M docs". Result tree shows doc title &rarr; section anchors. |
| 1.2.3 | Multi-word (`weighted average`) | Narrow result set. Top hit's section contains both terms. |
| 1.2.4 | Stemming (`reconciling`) | Returns hits for "reconcile", "reconciliation", "reconciled". |
| 1.2.5 | Wildcard fallback (`RNV`) | Some results returned via 3-tier fallback. |
| 1.2.6 | No results (`xyzqwertynonsense`) | "No matches" empty-state. |
| 1.2.7 | Esc clears | Search clears, results hide, default panel returns. |
| 1.2.8 | Module filter affects results | Only Inventory ON + query `inventory`: results are Inventory docs plus always-on general docs. A/P / Transfers / Administrator-prefixed docs absent. |
| 1.2.9 | General docs always visible | All modules OFF + query `getting started`: `start-here-*`, `getting-started-*`, `ui-reference.html` still appear. |
| 1.2.10 | Keyword narrows to titles | All pills ON + `gl class code`: small set (&asymp;8 matches / 2 docs). Top hit "GL Class Code Management & Change Procedures". Every result has "GL class code" in title or section heading. |
| 1.2.11 | Question opens body search | All pills ON + `how are gl class codes used`: ~20+ matches across 10+ docs including body-only hits (Cardex, Transfer Order, Purchase Order). |
| 1.2.12 | Trailing `?` triggers question mode | `gl class code?` &rarr; wider set, same as natural-language question. |
| 1.2.13 | Trailing `?` does not bust Lunr | `how is weighted average cost calculated?` and the version without `?` return the **same** count and same top hits (regression for the OR-tier fallthrough bug). |
| 1.2.14 | Trailing `.` / `!` neutral | `How do I close a period.` and `transfer order!` behave as if the punctuation weren't there. |
| 1.2.15 | Pure how-do-I suppresses Troubleshooting | `How do I close a period` &rarr; top hits are Start-Here Inventory and other Start-Here docs. **No** Troubleshooting docs in results (Period Close and Reports & Exports both filtered &mdash; no trouble intent). |
| 1.2.16 | Suppression catches title-only docs | `How do I log in` &rarr; **no** Login & Access Troubleshooting (filename `login-and-access.html` but page title says "Login & Access Troubleshooting" &mdash; suppression checks page_title, not just URL). |
| 1.2.17 | Workflow doc still wins | `How do I run an inventory reconciliation?` &rarr; top hit Inventory Reconciliation Walkthrough; Reports & Exports Troubleshooting suppressed. |
| 1.2.18 | Trouble intent re-enables Troubleshooting | `My period close failed` or `Period close error` &rarr; Period Close Troubleshooting is top hit (`failed` / `error` detected). |
| 1.2.19 | Trouble contractions detected | `Why isn't my period close working?` or `I can't run reconciliation` &rarr; trouble intent detected (`isn't`, `can't`, `not working`); Troubleshooting docs included. |
| 1.2.20 | Keyword mode unaffected by trouble logic | `period close` (no question, no trouble word) &rarr; Period Close Troubleshooting appears via title narrowing; trouble filter only runs in question mode. |
| 1.2.21 | Question-word detection | `what is rnv`, `how do I close a period`, `why is variance flagged`, `can I edit a transfer` each return the body search (wider list). |
| 1.2.22 | Keyword detection | `rnv`, `period close`, `transfer order`, `cardex variance` each return the narrow title-only set. |
| 1.2.23 | Title-only fallback when narrow is empty | A keyword that exists only in body text still returns body matches &mdash; never zero results. |
| 1.2.24 | Coach &mdash; empty state | *Type **keywords** for a tight list of docs whose titles match, or phrase as a **question** ("how do I close a period?") for the full content of every doc.* |
| 1.2.25 | Coach &mdash; keyword + narrowed | `gl class code` &rarr; *Showing **title matches only**. Phrase as a question ("how do I&hellip;?") to widen the search across full doc text.* |
| 1.2.26 | Coach &mdash; keyword + body fallback | Obscure body-only phrase &rarr; *Phrase as a question ("how do I&hellip;?") to search across the full doc text.* (no "title matches only" wording &mdash; the narrowing didn't catch it). |
| 1.2.27 | Coach &mdash; question, no trouble | `how do I close a period` &rarr; *Showing **instructional docs**. Add `error`, `fail`, or `fix` if you also want Troubleshooting.* The three words render as small code chips. |
| 1.2.28 | Coach &mdash; question with trouble | `How do I fix the red status light?` &rarr; ***Troubleshooting docs included** &mdash; your query mentions a problem.* |
| 1.2.29 | Coach &mdash; declarative trouble | `My period close failed` (no `?`) &rarr; same trouble-included message as 1.2.28. |
| 1.2.30 | Coach &mdash; contractions | `I can't run reconciliation` &rarr; trouble-included message (`can't` matches phrasal regex). |
| 1.2.31 | Coach &mdash; zero results | `xyzqwertynonsense` &rarr; ***No matches.** Try fewer terms, check spelling, or rephrase as a question ("how do I&hellip;?").* Standard no-match message still appears in the results panel. |
| 1.2.32 | Coach &mdash; Esc returns to intro | After any query, pressing Esc reverts the coach to the empty-state intro. |
| 1.2.33 | Coach &mdash; debounced updates | Typing one character at a time (`g`, `gl`, `gl `, `gl class`, then trailing `?`) updates the coach after each 100&nbsp;ms debounced render &mdash; keyword message while typing, switches to trouble-or-instructional once the query qualifies as a question. No flicker, no stale text. |

### 1.3 Drawers

| # | Name | Expected |
|---|---|---|
| 1.3.1 | Onboarding drawer | All four pills ON: drawer shows four distinct role cards (Inventory blue / A/P orange / Transfers green / Administrators navy). Each card has an Onboarding link and a Workflow link in its footer. |
| 1.3.2 | Browse-all drawer | Drawer expands; 32 docs grouped by module (Getting started & general, Inventory, A/P, Transfers, Administrators). |

### 1.4 Architecture

| # | Name | Expected |
|---|---|---|
| 1.4.1 | Self-contained | No `href` on the page points to `rapidreconciler-hub.html`, `GSIRRSales/*`, or `GSIRRTech/*`. University is a self-contained customer-facing surface. |

---

## 2. Help Desk (`HelpDesk/troubleshooting.html`)

### 2.1 Search (scenarios)

| # | Name | Expected |
|---|---|---|
| 2.1.1 | Empty query | Results panel hidden; Browse-all drawer visible. |
| 2.1.2 | Bullseye &mdash; status light red | `Why is the System Status light red?` &rarr; top result "System status light is red". &ge;4 matches. |
| 2.1.3 | Bullseye &mdash; can't log in | `I can't log in to RapidReconciler.` &rarr; top result "I can't log in". Login-adjacent scenarios below. |
| 2.1.4 | Bullseye &mdash; blank page | `Why is the page blank after I log in?` &rarr; only result "No data visible after logging in". |
| 2.1.5 | Typo tolerance | `Why is the staus light red?` (note typo `staus`) &rarr; bullseye scenarios still surface (Levenshtein fuzzy match on tokens &ge;4 chars). |
| 2.1.6 | No results | `purple unicorn` &rarr; "No matches" with tip line. |
| 2.1.7 | `/` keyboard focus | Click outside the textarea, press `/` &rarr; focus moves to textarea. |
| 2.1.8 | Esc keyboard blur | Focus textarea, press Esc &rarr; textarea loses focus. |
| 2.1.9 | Race-condition guard | Rapid sequence `s`, `sy`, `sys`, `syst`, `syste`, `system` &rarr; final render reflects only `system`. No stale "s" or "sy" results sticking around. |

### 2.2 Drawer

| # | Name | Expected |
|---|---|---|
| 2.2.1 | Browse-all scenarios | Drawer expands. All 22 scenarios listed alphabetically by title with category pills. Clicking any title navigates to that scenario. |

### 2.3 Scenario-specific behavior

| # | Scenario | Trigger | Expected |
|---|---|---|---|
| 2.3.1 | `customer-no-data` | Click `Generate IT email` with no radio picked in Step 3 | Alert: "Please answer Step 3 first &mdash; pick 'Just me' or 'Everyone'&hellip;" Page scrolls to the fieldset. |
| 2.3.2 | `customer-no-data` | Pick **Just me** &rarr; Generate IT email | Mail client opens. Subject `RapidReconciler &mdash; blank page, no data after logging in`. Body opens with "I checked with coworkers &mdash; only I am affected" and lists workstation items (local firewall, Group Policy, machine DNS, security profile). |
| 2.3.3 | `customer-no-data` | Pick **Everyone** &rarr; Generate IT email | Same subject. Body opens with "multiple users are affected at the same time" and lists corporate-side items (web filter / DNS filter / endpoint security recent change, Windows update, other `*.getgsi.com` blocked, mobile-hotspot test). |
| 2.3.4 | `domain-url-not-resolving` | Generate IT email | Subject `RapidReconciler &mdash; page won't load`. Body has the three network-test bullets. Closes with "For assistance with any of the above, contact RR support at rrsupport@getgsi.com." |
| 2.3.5 | `rr-job-running-long` | Generate IT email | Body has the "standard fix" block (SSMS &rarr; SQL Server Agent &rarr; Job Activity Monitor &rarr; Stop Job &rarr; wait for rollback &rarr; re-run) **plus** the "if-hangs-again" block (Activity Monitor blocking, `DBCC OPENTRAN`, TempDB log size, free disk, recent SQL Server changes). |
| 2.3.6 | `system-status-light-red` | Generate IT email | Body has three labeled blocks: disk-and-TempDB, SQL Agent Job History, SSIS execution report. Subject `RapidReconciler &mdash; system status light is red`. |
| 2.3.7 | `login-backend-connect-timeout` ("I can't log in") | Option 2 &rarr; Generate IT email | Subject `RapidReconciler &mdash; login error, can you help?`. Body has the four technical checks (internal network reachability, `rr-valc-agent` service, browser console log capture, forward to RR support). Reference image URL included. |
| 2.3.8 | `login-backend-connect-timeout` | Option 1 &rarr; Generate administrator email | Subject `RapidReconciler &mdash; please help me reset my password`. Body is a short polite "please reset my password" message. |
| 2.3.9 | `user-no-companies-session-refresh` | Read the page | Two visible steps: "Log out and back in", "Refresh the company selector widget". Email-RR-support escalate block at the bottom. |
| 2.3.10 | `cert-not-secure-warning` | Step 4 &rarr; Generate IT email | Body has the technical cert / network checks. |
| 2.3.11 | `inventory-validation-red-variance` | Walk Step 3 | Four sub-paths: GLOK=No prior period, GLOK=No 2+ periods old, GLOK=No all-zeros, VarOK=No / GLOK=Yes admin handoff. Each path's hand-off card and button works. |
| 2.3.12 | `excel-export-button-no-response` | Step 1 &rarr; Generate administrator email | Drafts a "please click Restart Service for me" message. |
| 2.3.13 | `sql-agent-stale-data` | Read | Three-state status-light framing (amber refresh / red see other scenario / green job-didn't-run). Cross-link to red-status scenario works. |

### 2.4 Architecture

| # | Name | Expected |
|---|---|---|
| 2.4.1 | Self-contained | No `href` on the Help Desk page or any scenario page points to `rapidreconciler-hub.html`, `GSIRRSales/*`, or `GSIRRTech/*`. Cross-links to other `Scenarios/*` and to `RRUniversity/*` are fine. |

---

## 3. Log Analyzer (`HelpDesk/log-analyzer.html`)

### 3.1 Browser console card

| # | Name | Expected |
|---|---|---|
| 3.1.1 | Healthy paste | `base.js:5 URL Visited: /Reconciliation` &rarr; Verdict **Looks OK** (green pill). Output context "Analyzing browser console &middot; 1 line". Line appears under Benign noise &rarr; "Agent loaded (URL Visited)". |
| 3.1.2 | Critical &mdash; uncaught exception | `base.js:80 Uncaught TypeError: Cannot read property "foo" of undefined` &rarr; Verdict **Critical** (red pill). Concerning lines section shows the "Uncaught JS exception (general)" group expanded with the line and rule note. |
| 3.1.3 | Review &mdash; DNS not resolved | `net::ERR_NAME_NOT_RESOLVED` &rarr; Verdict **Review** (orange pill). Concerning lines shows "DNS / name not resolved" with a runbook link to `scenario-domain-url-not-resolving.html`. |
| 3.1.4 | Critical &mdash; cert failure | `net::ERR_CERT_DATE_INVALID` &rarr; Verdict **Critical**. Concerning lines shows "TLS certificate failure" with a runbook link to `scenario-cert-not-secure-warning.html`. |
| 3.1.5 | Benign noise &mdash; tracking prevention | Paste a **single** line `Tracking Prevention blocked access to storage` (no other content) &rarr; Verdict **Looks OK**. Line appears under Benign noise &rarr; "Edge tracking prevention". The orphan continuation line is **not** dropped (regression for the over-aggressive truncated-prefix-drop fixed in 428b3c9). |
| 3.1.6 | Orphan continuation dropped when real entries follow | Paste a log whose first line is a continuation-style fragment and subsequent lines are real entry-starts &rarr; the orphan is dropped; only the real entries are analyzed (preserves truncated-agent-log behavior). |
| 3.1.7 | Mixed: tracking-noise + healthy + critical | Paste three lines: a real `URL Visited` entry, a `Tracking Prevention blocked access to storage` line, and an `Uncaught TypeError` entry &rarr; tracking noise classified under benign Edge tracking prevention, URL Visited under healthy signals, Uncaught TypeError as critical. Verdict **Critical**. |
| 3.1.8 | Multi-line stitching | Paste two lines where line 2 starts with `    at (anonymous) @ base.js:80` (4 leading spaces) &rarr; both lines stitched into one logical entry. Total lines reported = 1. |
| 3.1.9 | Auto-analyze on input | Paste text, wait 300&nbsp;ms without clicking Analyze &rarr; analysis fires automatically (220&nbsp;ms debounce). |
| 3.1.10 | Manual Analyze button | Type text quickly then click Analyze &rarr; analysis runs immediately on click. |
| 3.1.11 | Clear button | Click Clear &rarr; textarea empties, output area resets, cursor refocused in textarea. |

### 3.2 RR agent log card

| # | Name | Expected |
|---|---|---|
| 3.2.1 | File picker filter | Click "Choose log file" &rarr; OS dialog filtered to `.log .out .txt`. |
| 3.2.2 | Pick a file | Pick any `.out.log` file &rarr; file-meta shows document icon + filename (monospace) + size. Textarea fills with file contents. Auto-analysis fires. Output context "Analyzing RR agent log &middot; N lines". |
| 3.2.3 | Pick the same file twice | Re-pick the same file &rarr; file-meta refreshes and analysis re-runs (input value reset on click ensures change event fires). |
| 3.2.4 | Cancel the picker | Esc or close the dialog &rarr; no stale file appears. Output area unchanged. |
| 3.2.5 | Healthy log | File with `INFO Database connectivity: [OK]` and `Started AgentApplication in 4.2 seconds` &rarr; Verdict **Looks OK**. Entries listed under Benign noise / Healthy signals. |
| 3.2.6 | Critical log | File with an `ERROR` level line followed by stack-trace lines &rarr; Verdict **Critical**. Concerning lines shows "ERROR level" and "Stack trace" groups. |
| 3.2.7 | Review &mdash; connection refused | File with `Connection refused: api.getgsi.com:443` &rarr; Verdict **Review**. Concerning lines shows "Connection failure". |
| 3.2.8 | Instance start timeout | File with `Instance did not start after 60 seconds` &rarr; Concerning lines shows "Instance start timeout" with a runbook link to `scenario-rr-job-running-long.html`. |
| 3.2.9 | Stack-trace stitching | ERROR line followed by indented `at com.gsi&hellip;` frames &rarr; stitched onto the ERROR line as one logical entry. |
| 3.2.10 | Manual paste fallback | Paste raw agent log into textarea (no file picker) &rarr; auto-analyze still runs, output populates. |
| 3.2.11 | Clear button | Click Clear &rarr; textarea empties, file-meta returns to "No file selected", file input reset (re-picking same file still fires change), output resets if agent card was driving it. |

### 3.3 Output area

| # | Name | Expected |
|---|---|---|
| 3.3.1 | Verdict color | OK / Review / Critical &rarr; green soft / orange pale / red soft background. Pill colors match. |
| 3.3.2 | Context line | After any analysis &rarr; italic line above the verdict: "Analyzing **browser console** &middot; N lines" or "Analyzing **RR agent log** &middot; N lines" with medium-weight source. |
| 3.3.3 | Concerning vs benign split | Mixed input (critical/flag + noise/good) &rarr; both sections render. Concerning expanded (`<details open>`), Benign collapsed. |
| 3.3.4 | Switching cards | Paste in console card, then pick a file in agent card &rarr; output replaces console verdict with agent verdict. Context line switches source. |
| 3.3.5 | Clear one card only | Console verdict shown; click Clear on agent card &rarr; output area is **not** cleared (agent card wasn't driving the current output). |

---

## 4. Regression spot-checks

| # | Name | Expected |
|---|---|---|
| 4.1 | University search &times; module toggle | Inventory on &rarr; search `RNV` &rarr; toggle Inventory off &rarr; repeat: result count changes between states. localStorage updates. |
| 4.2 | Help Desk scoring (status light) | `system status light red` &rarr; first result `System status light is red`. Inventory Validation appears later. |
| 4.3 | Help Desk scoring (login) | `log in` &rarr; first result `I can't log in`. |
| 4.4 | Scenario cross-links | On `scenario-rr-job-running-long`, click the cross-link in the lede &rarr; lands on `scenario-system-status-light-red`. Reverse works too. |
| 4.5 | `composeITEmail` mailto | Each scenario's "Generate IT email" opens the mail client with subject + body matching the per-scenario row in &sect;2.3. |
| 4.6 | `composeAdministratorEmail` mailto | Login + excel-export + inventory-validation admin handoffs open the mail client with the expected subject + body. |

---

## Pass / fail tracking

Mark each row pass / fail / blocked. Open issues for any fail. Each of the 22 customer scenarios should have an explicit pass on any &sect;2.3 row that names it.
