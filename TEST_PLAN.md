# RapidReconciler Help Desk — Test Plan

Covers the three customer-facing surfaces:

1. **Cover page** (`rapidreconciler-help.html`)
2. **RR University** (`RRUniversity/rapidreconciler-university.html`)
3. **Help Desk** (`HelpDesk/troubleshooting.html`) + the 10 scenario pages
4. **Log Analyzer** (`HelpDesk/log-analyzer.html`)

Each test lists: **Name** · **Input / steps** · **Expected**.

---

## 0. Setup

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 0.1 | Local server reachable | Open <http://localhost:8765/rapidreconciler-help.html> in Edge | Cover page renders, no console errors. |
| 0.2 | Deployed site reachable | Open <https://docs-dev.rapidreconciler.getgsi.com/rapidreconciler-help.html> | Cover page renders, GSI logo visible. |
| 0.3 | In-app `/help.html` redirect | Open `RRUniversity/help.html` directly | Auto-redirects to `rapidreconciler-help.html` within 1 second, no back-button entry. |

---

## 1. Cover page (`rapidreconciler-help.html`)

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 1.1 | Chrome renders | Load the page | GSI top bar (logo), pale-blue welcome banner ("RapidReconciler Help / Start here."), navy-gradient hero, two destination cards, tagline band, footer all visible. |
| 1.2 | GSI logo opens corporate site | Click the GSI logo in the top bar | New tab opens at `getgsi.com`. |
| 1.3 | University card navigates | Click anywhere on the blue "Open University" card | Lands on `RRUniversity/rapidreconciler-university.html`. |
| 1.4 | Help Desk card navigates | Click anywhere on the orange "Open Help Desk" card | Lands on `HelpDesk/troubleshooting.html`. |
| 1.5 | University sample questions visible | Read the blue card | Blue accent stripe, blue "SOUNDS LIKE" label, three italicised quoted questions visible: *"How do I run an inventory reconciliation?" / "What does the GL Class column mean?" / "How do I create a transfer order?"* |
| 1.6 | Help Desk sample questions visible | Read the orange card | Orange accent stripe, orange "SOUNDS LIKE" label, three italicised quoted questions visible: *"Why is the System Status light red?" / "I can't log in to RapidReconciler." / "Why is the page blank after I log in?"* |
| 1.7 | Card hover state | Hover each card | Card lifts slightly (-6px translateY) and shadow deepens. |
| 1.8 | Mobile layout | Resize browser to ≤760 px wide | Cards stack vertically, padding shrinks, fonts scale down, all text remains readable. |

---

## 2. RR University (`RRUniversity/rapidreconciler-university.html`)

### 2.1 Chrome + welcome banner

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 2.1.1 | GSI top bar | Load page | GSI logo top-left, white strip across top, clickable → getgsi.com. |
| 2.1.2 | Welcome banner | Look at the pale-blue strip | Blue 4 px left stripe, white-circle book icon (blue), "RapidReconciler University" title, lede subtitle, two welcome-meta buttons on the right (`App Basics`, `UI Reference`). |
| 2.1.3 | App Basics meta link | Click the "App Basics" button | Lands on `getting-started-with-rapidreconciler.html`. |
| 2.1.4 | UI Reference meta link | Click the "UI Reference" button | Lands on `ui-reference.html`. |
| 2.1.5 | Hero rendering | Look at the navy gradient hero | "Knowledge base" pill eyebrow, headline **"Find the *how-to* for any task."** with "how-to" in blue-bright, one-line subtitle, four module pills, search input, no module pill checked by default. |

### 2.2 Module pills (filter)

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 2.2.1 | Default pill state | First load in a fresh browser profile (after clearing `rru-search-filters-v1` from localStorage) | Only **Inventory** is checked; A/P / Transfers / Administrators are unchecked. (Matches `DEFAULT_FILTERS = { inventory: true, ap: false, transfers: false, administrators: false }` in the page JS and the "Default: only Inventory ON" note in CLAUDE.md.) |
| 2.2.2 | Toggle Inventory | Click the Inventory pill | Pill turns solid blue with white text. Reload — Inventory stays checked (localStorage persisted). |
| 2.2.3 | Toggle multiple modules | Click A/P and Transfers | Both pills become solid blue. Reload — both stay checked. |
| 2.2.4 | Uncheck a pill | Click a checked pill | Pill returns to translucent / outlined style. |
| 2.2.5 | Each pill reveals its role card | Open the Onboarding and Workflow drawer. Toggle each of Inventory / A/P / Transfers / Administrators ON one at a time | After each toggle, the **corresponding** role card appears in the drawer with the matching accent stripe (blue / orange / green / navy). Toggle the same pill OFF: that specific card disappears, the others stay as they were. |
| 2.2.6 | Each pill reveals its Browse-all group | Open the Browse all documents drawer. Toggle each module pill ON one at a time | After each toggle, the corresponding doc group title + its doc list appears inside the drawer. The "Getting started & general" group stays visible regardless. Toggle OFF: that group hides. |

### 2.3 Search

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 2.3.1 | Empty search hides results | Clear the search box | Results panel hidden; Onboarding + Browse-all drawers visible. |
| 2.3.2 | Single-word query | Type `cardex` | Within ~200 ms results appear. Status line: "N matches across M docs". Result tree shows doc titles with section anchors beneath. |
| 2.3.3 | Multi-word query | Type `weighted average` | Results filter narrowly. Top hit is a section that contains both terms. |
| 2.3.4 | Stemmed match | Type `reconciling` | Returns matches for "reconcile", "reconciliation", "reconciled" (Lunr stemming). |
| 2.3.5 | Wildcard fallback | Type `RNV` | Some results returned (3-tier matching fallback). |
| 2.3.6 | No-results state | Type `xyzqwertynonsense` | Empty-state message "No matches" appears. |
| 2.3.7 | Esc clears search | Focus search, press Esc | Search clears, results hide, default panel returns. |
| 2.3.8 | Module filter affects results | Toggle only Inventory ON, type `inventory` | Results only show Inventory documents plus the always-on general docs. AP / Transfers / Administrator-prefixed docs are absent. |
| 2.3.9 | General docs always visible | Toggle ALL modules OFF, type `getting started` | `start-here-*`, `getting-started-*`, `ui-reference.html` results still appear. |
| 2.3.10 | Keyword query narrows to titles | All pills ON. Type `gl class code` (no question phrasing) | Status line shows a **small** set (≈8 matches / 2 docs). Top hit is "GL Class Code Management & Change Procedures". Every result page has "GL class code" in its title or section heading. |
| 2.3.11 | Question query opens full search | All pills ON. Type `how are gl class codes used` | Status line shows a **wider** set (~20+ matches across 10+ docs). Hits include docs that only mention GL class codes in the body (Cardex, Transfer Order, Purchase Order). |
| 2.3.12 | Trailing `?` triggers question mode | Type `gl class code?` | Wider result set, same as the natural-language question — even though no question word at the start. |
| 2.3.12a | Trailing `?` does not bust Lunr | Type `how is weighted average cost calculated?` then the same query without `?`. Compare counts. | Both queries return the **same** result count and the **same** top hits. Trailing `?` does NOT cause a wider, looser result set (regression for the bug where `?` fell through to Lunr's OR tier). |
| 2.3.12b | Trailing `.` / `!` handled same | Type `How do I close a period.` and `transfer order!` | Each behaves as if the trailing punctuation weren't there — same counts, same ranking. |
| 2.3.12c | Troubleshooting suppressed for pure how-do-I questions | Type `How do I close a period` | Top hits are **Start Here — Inventory** + other Start-Here docs. **No Troubleshooting docs appear in results at all** (Period Close Troubleshooting and Reports & Exports Troubleshooting both filtered out — the user has no trouble intent). |
| 2.3.12d | Troubleshooting suppression catches title-only docs too | Type `How do I log in` | **No** Login & Access Troubleshooting in results (filename is `login-and-access.html` but the page title says "Login & Access Troubleshooting" — the suppression checks page_title, not just URL). |
| 2.3.12e | Workflow doc still wins where it should | Type `How do I run an inventory reconciliation?` | Top hit is **Inventory Reconciliation Walkthrough**. Reports & Exports Troubleshooting (previously #2) is gone — suppressed by trouble-intent absence. |
| 2.3.12f | Trouble-intent question lets Troubleshooting back in | Type `My period close failed` or `Period close error` (each in turn) | Period Close Troubleshooting is the **top** hit. Trouble words (`failed`, `error`) detected → suppression skipped. |
| 2.3.12g | Trouble-intent contractions detected | Type `Why isn't my period close working?` or `I can't run reconciliation` | Trouble intent detected (`isn't`, `can't`, `not working`). Troubleshooting docs included where relevant. |
| 2.3.12h | Keyword mode unaffected by trouble logic | Type `period close` (no question, no trouble word) | Period Close Troubleshooting appears because keyword mode applies title-only narrowing (both tokens in its title) — the trouble-intent filter only runs in question mode. |
| 2.3.13 | Question-word detection | Try in turn: `what is rnv`, `how do I close a period`, `why is variance flagged`, `can I edit a transfer` | Each returns the full body search (wider list). |
| 2.3.14 | Keyword detection | Try in turn: `rnv`, `period close`, `transfer order`, `cardex variance` | Each returns the narrow title-only result set. |
| 2.3.15 | Title-only fallback when narrow is empty | Type a keyword that exists only in body text (e.g. an obscure phrase you remember from a doc body but not any heading) | Results still appear — falls back to body matches so the user is never stuck with zero results. |
| 2.3.16 | Dynamic coach — empty state | Load the page. Don't type anything. | An italic line below the search input reads: *Type **keywords** for a tight list of docs whose titles match, or phrase as a **question** ("how do I close a period?") for the full content of every doc.* |
| 2.3.17 | Dynamic coach — keyword + narrowed | Type `gl class code` | Coach updates to: *Showing **title matches only**. Phrase as a question ("how do I…?") to widen the search across full doc text.* |
| 2.3.18 | Dynamic coach — keyword + body fallback | Type a keyword that doesn't land in any title (e.g. an obscure body-only phrase) | Coach updates to: *Phrase as a question ("how do I…?") to search across the full doc text.* (no "title matches only" wording — the narrowing didn't catch it). |
| 2.3.19 | Dynamic coach — question, no trouble intent | Type `how do I close a period` | Coach updates to: *Showing **instructional docs**. Add `error`, `fail`, or `fix` if you also want Troubleshooting.* `error` / `fail` / `fix` are styled as small code chips. |
| 2.3.20 | Dynamic coach — question with trouble intent | Type `How do I fix the red status light?` | Coach updates to: ***Troubleshooting docs included** — your query mentions a problem.* |
| 2.3.21 | Dynamic coach — declarative trouble statement | Type `My period close failed` (no question phrasing, no `?`) | Coach updates to the same trouble-included message as 2.3.20 — declarative trouble statements get the same treatment as trouble-intent questions. |
| 2.3.22 | Dynamic coach — contractions count as trouble | Type `I can't run reconciliation` | Coach shows trouble-included message (`can't` detected via the phrasal regex). |
| 2.3.23 | Dynamic coach — zero results | Type `xyzqwertynonsense` | Coach updates to: ***No matches.** Try fewer terms, check spelling, or rephrase as a question ("how do I…?").* The standard nothing-found message still appears in the results panel below. |
| 2.3.24 | Dynamic coach — Esc returns to empty | Type any query, then press Esc | Coach reverts to the empty-state intro from 2.3.16. |
| 2.3.25 | Dynamic coach — updates as user types | Type characters one at a time: `g`, `gl`, `gl `, `gl class`, then a trailing `?` | Coach updates after each 100ms debounced render — keyword message while typing, switches to trouble-or-instructional once the query qualifies as a question, etc. No flicker, no stale text. |

### 2.4 Drawers

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 2.4.1 | Onboarding & Workflow drawer opens | Toggle all four module pills ON. Click the "Onboarding and Workflow" pale-blue summary bar | Drawer expands and shows **four distinct role cards**: Inventory Accounting (blue stripe), Accounts Payable (orange stripe), Transfers (green stripe), Administrators (navy stripe). Each card has an Onboarding link and a Workflow link in its footer. |
| 2.4.2 | Role-card buttons | Click VIEW DETAILS on the Inventory card | Lands on `start-here-inventory.html`. |
| 2.4.3 | Browse all documents drawer opens | Click "Browse all documents" summary bar | Drawer expands; 32 docs grouped by module (Getting started & general, Inventory, A/P, Transfers, Administrators). |
| 2.4.4 | Browse-all doc link | Click any doc title in Browse-all | Lands on the linked document with no console errors. |

### 2.5 Cross-page navigation

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 2.5.1 | Self-contained | Inspect the page for any link to `rapidreconciler-hub.html`, `GSIRRSales/*`, or `GSIRRTech/*` | None should exist. University is self-contained customer-facing surface. |

---

## 3. Help Desk (`HelpDesk/troubleshooting.html`)

### 3.1 Chrome + welcome banner

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 3.1.1 | GSI top bar | Load page | GSI logo top-left. |
| 3.1.2 | Welcome banner | Look at the pale-blue strip | Orange 4 px left stripe, white-circle question-mark icon (blue), "RapidReconciler Help Desk" title, lede subtitle, two welcome-meta buttons on the right (`Start Here`, `Log Analyzer`). |
| 3.1.3 | Start Here meta link | Click "Start Here" | Lands on `start-here-helpdesk-tech.html`. |
| 3.1.4 | Log Analyzer meta link | Click "Log Analyzer" | Lands on `log-analyzer.html`. |
| 3.1.5 | Hero | Look at the navy gradient hero | Headline **"Why isn't it `working?`"** with "working?" highlighted in yellow. 6-row paste-friendly textarea below. Keyboard hint row below the textarea. |

### 3.2 Search (scenarios)

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 3.2.1 | Empty search hides results | Clear the textarea | Results panel hidden; Browse-all drawer visible. |
| 3.2.2 | Bullseye: status light red | Paste `Why is the System Status light red?` | Within ~200 ms results appear. **Top result: "System status light is red".** Status line counts ≥4 matches. |
| 3.2.3 | Bullseye: I can't log in | Paste `I can't log in to RapidReconciler.` | **Top result: "I can't log in".** Other login-adjacent scenarios appear below. |
| 3.2.4 | Bullseye: blank page | Paste `Why is the page blank after I log in?` | Only result: "No data visible after logging in". |
| 3.2.5 | Typo tolerance | Paste `Why is the staus light red?` (note: `staus` is a typo) | Bullseye scenarios still surface (Levenshtein fuzzy match for tokens ≥4 chars). |
| 3.2.6 | No-results state | Paste `purple unicorn` | "No matches" message appears with the tip line. |
| 3.2.7 | `/` keyboard focus | Click outside the textarea, press `/` | Focus moves to the textarea. |
| 3.2.8 | Esc keyboard blur | Focus textarea, press Esc | Textarea loses focus. |
| 3.2.9 | Ctrl+A paste-replace | Focus textarea, press Ctrl+A | All textarea content selected. |
| 3.2.10 | Race-condition guard | Type slowly: `s`, `sy`, `sys`, `syst`, `syste`, `system` quickly | Final render reflects only `system` query — no stale "s" or "sy" results sticking around. |
| 3.2.11 | Search tips drawer | Click "Search tips ▾" below the textarea | Drawer expands inside the navy hero with a translucent panel. Four bullets visible: paste/plain-language, relevance scoring, runbook + email-button mention, `/`+Esc shortcuts. Click again — closes. |

### 3.3 Drawer

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 3.3.1 | Browse all scenarios drawer | Click "Browse all scenarios" summary | Drawer expands. All 10 scenarios listed alphabetically by title. Each has a category pill. Clicking any title navigates to that scenario. |

### 3.4 Scenario pages — common smoke test (run on **each** of the 10)

For each scenario in `Scenarios/`:

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 3.4.1 | Page loads | Open the scenario page | Hero, breadcrumb, symptoms ("What you're seeing"), step cards, escalate block (if present), footer all render without console errors. |
| 3.4.2 | Breadcrumb works | Click "Help Desk" in the breadcrumb | Returns to Help Desk landing. |
| 3.4.3 | Footer rrsupport mailto | Click `rrsupport@getgsi.com` in the footer | Mail client opens a new email to that address. |

### 3.5 Scenario-specific tests

| # | Scenario | Test | Expected |
|---|---|---|---|
| 3.5.1 | **scenario-customer-no-data** | Click `Generate IT email` without picking a radio in Step 3 | Alert: "Please answer Step 3 first — pick 'Just me' or 'Everyone'..." Page scrolls to the fieldset. |
| 3.5.2 | **scenario-customer-no-data** | Pick **Just me** → click Generate IT email | Mail client opens. Subject: `RapidReconciler — blank page, no data after logging in`. Body opens with "I checked with coworkers — only I am affected" and lists workstation-investigation items (local firewall, Group Policy, machine DNS, security profile). |
| 3.5.3 | **scenario-customer-no-data** | Pick **Everyone** → click Generate IT email | Same subject. Body opens with "multiple users are affected at the same time" and lists corporate-side items (web filter / DNS filter / endpoint security recent change, Windows update, other `*.getgsi.com` blocked, mobile-hotspot test). |
| 3.5.4 | **scenario-domain-url-not-resolving** | Read Step 1 | Title is "Confirm the URL and hard-refresh". URL `rapidreconciler.getgsi.com` clearly shown. Three-item checklist. Inline blue Generate IT email handoff. |
| 3.5.5 | **scenario-domain-url-not-resolving** | Click Generate IT email | Subject: `RapidReconciler — page won't load`. Body has the three network-test bullets. Closes with "For assistance with any of the above, contact RR support at rrsupport@getgsi.com." |
| 3.5.6 | **scenario-rr-job-running-long** | Read hero | Title: "RapidReconciler job running longer than usual" (in title tag, breadcrumb, h1, footer). Lede describes the flashing-amber + hover-popup flow. |
| 3.5.7 | **scenario-rr-job-running-long** | Click Generate IT email | Body has "standard fix" block (SSMS → SQL Server Agent → Job Activity Monitor → Stop Job → wait for rollback → re-run) PLUS "if-hangs-again" block (Activity Monitor blocking, `DBCC OPENTRAN`, TempDB log size, free disk, recent SQL Server changes). |
| 3.5.8 | **scenario-system-status-light-red** | Click Generate IT email | Body has three labeled blocks: disk-and-TempDB, SQL Agent Job History, SSIS execution report. Subject: `RapidReconciler — system status light is red`. |
| 3.5.9 | **scenario-login-backend-connect-timeout** ("I can't log in") | Click Generate IT email in Option 2 | Subject: `RapidReconciler — login error, can you help?`. Body has the four technical checks (internal network reachability, `rr-valc-agent` service, browser console log capture, forward to RR support). Reference image URL included. |
| 3.5.10 | **scenario-login-backend-connect-timeout** | Click Generate administrator email in Option 1 | Subject: `RapidReconciler — please help me reset my password`. Body is a short polite "please reset my password" message. |
| 3.5.11 | **scenario-user-no-companies-session-refresh** | Read | Two visible steps: Step 1 "Log out and back in", Step 2 "Refresh the company selector widget". Email RR support escalate block at the bottom. |
| 3.5.12 | **scenario-cert-not-secure-warning** | Read Step 4 (IT handoff) | `Generate IT email` button generates body with technical cert / network checks. |
| 3.5.13 | **scenario-inventory-validation-red-variance** | Walk Step 3 | Four sub-paths: GLOK=No prior period, GLOK=No 2+ periods old, GLOK=No all-zeros, VarOK=No / GLOK=Yes admin handoff. Each path's hand-off card and button works. |
| 3.5.14 | **scenario-excel-export-button-no-response** | Click Generate administrator email in Step 1 | Drafts "please click Restart Service for me" message. |
| 3.5.15 | **scenario-sql-agent-stale-data** | Read | Three-state status-light framing (amber refresh / red see other scenario / green job-didn't-run). Cross-link to red-status scenario works. |

### 3.6 Self-contained check

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 3.6.1 | No links out to hub / sales / tech | Inspect all anchors on the Help Desk page and on each scenario page | No `href` points to `rapidreconciler-hub.html`, `GSIRRSales/*`, or `GSIRRTech/*`. (Cross-links to other Scenarios/* and to RRUniversity/* are fine.) |

---

## 4. Log Analyzer (`HelpDesk/log-analyzer.html`)

### 4.1 Chrome

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 4.1.1 | No orange internal banner | Load page | No "GSI Internal Use Only" sticky strip at the very top. Page opens directly into the GSI top bar. |
| 4.1.2 | GSI top bar | Look at the top | GSI logo on a white strip, clickable → getgsi.com. |
| 4.1.3 | Welcome banner | Look below the GSI bar | Pale-blue strip with a terminal-prompt icon and "RR Help Desk · Log Analyzer / Internal triage tool — paste a log, get a verdict in seconds." |
| 4.1.4 | Hero | Look at the navy gradient | Headline **"Paste a log. *Surface* what matters."** with "Surface" in blue-bright. One-line sub. |
| 4.1.5 | Two input cards visible | Look below the hero | Blue-accent "Browser console" card on the left; orange-accent "RR agent log" card on the right. Both overlap into the hero with a -60 px margin. |
| 4.1.6 | Output area empty on load | Look below the cards | No verdict, no concerning lines, no benign noise section visible until input is provided. |

### 4.2 Browser console card

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 4.2.1 | Card content | Read the card | Code-bracket icon, "BROWSER CONSOLE" eyebrow, "DevTools console output" title, 4-step numbered list (F12 → Console icon → right-click → Save as…), textarea, Analyze + Clear buttons. |
| 4.2.2 | Healthy console paste | Paste `base.js:5 URL Visited: /Reconciliation` | Verdict: **Looks OK** (green pill), 1 line, output context "Analyzing browser console · 1 line". The line appears in the Benign noise section under "Agent loaded (URL Visited)". |
| 4.2.3 | Critical: Uncaught exception | Paste `base.js:80 Uncaught TypeError: Cannot read property "foo" of undefined` | Verdict: **Critical** (red pill). Concerning lines section shows the "Uncaught JS exception (general)" group expanded with the line and rule note. |
| 4.2.4 | Flag: DNS not resolved | Paste `net::ERR_NAME_NOT_RESOLVED` | Verdict: **Review** (orange pill). Concerning lines shows "DNS / name not resolved" with a runbook link to `scenario-domain-url-not-resolving.html`. |
| 4.2.5 | Critical: cert failure | Paste `net::ERR_CERT_DATE_INVALID` | Verdict: **Critical**. Concerning lines shows "TLS certificate failure" with a runbook link to `scenario-cert-not-secure-warning.html`. |
| 4.2.6 | Noise suppression | Paste `Tracking Prevention blocked access to storage` | Verdict: **Looks OK**. Line appears under Benign noise → "Edge tracking prevention". |
| 4.2.7 | Multi-line stitching | Paste a two-line input where line 2 starts with `    at (anonymous) @ base.js:80` (4 leading spaces) | Both lines stitched into one logical entry. Total lines reported as 1. |
| 4.2.8 | Auto-analyze on input | Paste text and wait 300 ms without clicking Analyze | Analysis fires automatically (220 ms debounce). |
| 4.2.9 | Manual Analyze button | Type text quickly then click Analyze | Analysis runs immediately on click. |
| 4.2.10 | Clear button | Click Clear | Textarea empties. Output area resets (no verdict shown). Cursor focused back in the textarea. |

### 4.3 RR agent log card

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 4.3.1 | Card content | Read the card | Stacked-server icon, "RR AGENT LOG" eyebrow, ".out.log file" title, 3-step list naming `C:\Program Files\Rapid Reconciler\logs` and "most recent .out.log". File-meta line ("No file selected"), textarea, "Choose log file" + Clear buttons. |
| 4.3.2 | File picker opens | Click "Choose log file" | OS file dialog opens, filtered to `.log .out .txt`. |
| 4.3.3 | Pick a file | Pick any `.out.log` file from your machine | File-meta line shows a small document icon + filename in monospace + size (e.g. `agent.out.log · 12 KB`). Textarea fills with the file contents. Analysis fires automatically. Output context shows "Analyzing RR agent log · N lines". |
| 4.3.4 | Pick the same file twice | Click "Choose log file" → pick the same file again | The file-meta line refreshes and analysis re-runs (input value reset on click ensures the change event fires). |
| 4.3.5 | Cancel the file picker | Click "Choose log file" → press Esc / close the dialog without picking | No `rrhome.out.log` or stale file appears. Output area stays as it was. |
| 4.3.6 | Healthy agent log | Pick a file containing `INFO Database connectivity: [OK]` and `Started AgentApplication in 4.2 seconds` | Verdict: **Looks OK**. Benign noise / Healthy signals lists those entries. |
| 4.3.7 | Critical agent log | Pick a file containing an `ERROR` level line and stack-trace lines | Verdict: **Critical**. Concerning lines shows "ERROR level" and "Stack trace" groups. |
| 4.3.8 | Flag: Connection refused | Pick a file containing `Connection refused: api.getgsi.com:443` | Verdict: **Review**. Concerning lines shows "Connection failure". |
| 4.3.9 | Flag: Instance start timeout | Pick a file containing `Instance did not start after 60 seconds` | Concerning lines shows "Instance start timeout" with a runbook link to `scenario-rr-job-running-long.html`. |
| 4.3.10 | Stack-trace stitching | Pick a file whose ERROR line is followed by indented `at com.gsi…` frames | The stack frames are stitched onto the ERROR line as a single logical entry. |
| 4.3.11 | Manual paste fallback | Paste raw agent log contents directly into the textarea (no file picker) | Auto-analyze still runs, output area populates. |
| 4.3.12 | Clear button | Click Clear | Textarea empties. File-meta returns to "No file selected". File input is reset (picking the same file again still fires change). Output area resets if it was driven by the agent card. |

### 4.4 Output area

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 4.4.1 | Verdict color | Trigger an OK / Review / Critical case | Background colour matches: green soft / orange pale / red soft respectively. Pill colour matches (green / orange / red). |
| 4.4.2 | Context line | After any analysis | Italic line above the verdict: "Analyzing **browser console** · N lines" or "Analyzing **RR agent log** · N lines" with the medium-weight accent on the source. |
| 4.4.3 | Concerning vs benign split | Trigger a mixed log with both critical/flag and noise/good entries | Both sections render. Concerning lines defaults to expanded; Benign noise defaults to collapsed (`<details open>` only on non-noise). |
| 4.4.4 | Switching cards | Paste in console card, then pick a file in agent card | Output area replaces the console verdict with the agent verdict. Context line switches from "browser console" to "RR agent log". |
| 4.4.5 | Clear one card while the other has output | Console verdict is shown; click Clear on the agent card | Output area is NOT cleared (the agent card wasn't driving the current output). |

---

## 5. Visual / cross-cutting

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 5.1 | Color scheme consistent | Open cover, University, Help Desk, Log Analyzer in turn | Same navy gradient hero, same pale-blue welcome banner pattern, same GSI top bar, same footer. Blue accent in University, orange in Help Desk; both colours appear in Log Analyzer. |
| 5.2 | Fonts loaded | Inspect headings vs body | Source Sans 3 on titles / eyebrows, Open Sans on body, JetBrains Mono in code blocks and log textareas. |
| 5.3 | No broken images | Use DevTools Network tab → filter to images on each page | No 404s. The GSI logo, the cert-warning screenshot, the red-status screenshot, the rr-valc-services screenshot, the inventory-red screenshot, the Edge-local-network-access screenshot all load. |
| 5.4 | No console errors | Open each page with DevTools Console open | No red errors. Warnings tolerated but should be minimal. |
| 5.5 | Cross-browser | Repeat smoke tests in Chrome and Edge | Behaviour identical. |
| 5.6 | Mobile viewport | Resize to 375 px wide on each page | Welcome-meta cards wrap, hero text scales, input cards stack vertically, all interactive targets remain ≥36 px tall. |

---

## 6. Regression spot-checks

| # | Name | Input / steps | Expected |
|---|---|---|---|
| 6.1 | RR University search after module-pill toggle | Toggle Inventory on, search `RNV`, toggle Inventory off, repeat search | Result count changes between the two toggle states. localStorage updates. |
| 6.2 | Help Desk search scoring | Search `system status light red` | First result is `System status light is red`. Inventory Validation appears later. |
| 6.3 | Help Desk search scoring | Search `log in` | First result is `I can't log in`. |
| 6.4 | Scenario cross-links | On `scenario-rr-job-running-long`, click the cross-link in the lede | Lands on `scenario-system-status-light-red`. Reverse works too. |
| 6.5 | All `composeITEmail` buttons open mailto: | Click `Generate IT email` on each scenario that has one | OS mail client opens. Subject + body match the per-scenario content described in §3.5. |
| 6.6 | All `composeAdministratorEmail` buttons open mailto: | Click on the login + excel-export + inventory-validation admin handoffs | OS mail client opens. Subject + body match expected. |

---

## Pass / fail tracking

Mark each row pass / fail / blocked as you go. Open issues for any fail. The 10 customer scenarios should each have an explicit pass on the §3.4 common smoke + any §3.5 row that names them.
