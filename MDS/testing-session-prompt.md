# Handoff prompt for new session — scenario testing

Copy everything below the line into a fresh Claude conversation. Attach the
current `troubleshooting.html` (and optionally `start-here-monitor.html`) when
you start.

---

I'm starting a testing session for the **GSI RR troubleshooting hub** (the HTML page I'm attaching). I want to test the matcher accuracy and UI behavior across realistic scenarios. Here's what you need to know.

## What the hub is

A single-page HTML troubleshooting tool for GSI's Helpdesk Tech team supporting RapidReconciler. It contains 28 scenario cards across six categories: network (10), database (5), certificate (5), install (4), application (2), and migration (2). Cards are tagged with tier 1, 2, or 3.

## The four input cards

The page has a row labeled "Inputs" with four cards. Each accepts a different kind of evidence and routes it through the same scoring pipeline, scoped differently:

- **Email** — paste a customer email (text). Scored against all categories. Has a session-persistent variable `pastedEmail` that gets carried into escalation handoffs and JSM tickets. Also has a "Redirect to Sales" button for commercial questions (renewal quotes, pricing) that opens a prefilled mailto to `gsisales@getgsi.com`.

- **Agent Log** — paste an agent `.out` log or SQL error output, or drop a `.txt` / `.log` file. Scored against all categories. 5 MB cap, trimmed to 200 KB for matching.

- **Browser Console** — drop or paste a screenshot. Tesseract.js OCR runs locally, then:
  - Pre-cleans Angular/popover DOM noise (`popover=`, `ng-*=`, `class=`, font-file 404s, `Found a 'popover' attribute with an invalid value` warnings).
  - **Gates results behind a positive-signal detector** that looks for real network/cert/JS errors (`net::ERR_*`, `ERR_NAME_NOT_RESOLVED`, `ERR_CERT_*`, `NXDOMAIN`, `CORS policy`, `Mixed Content`, certificate warnings, `Uncaught TypeError`, `Failed to load resource` not on noise URLs, HTTP 4xx/5xx not on noise URLs).
  - If no positive signal: shows a green "Console looks clean" banner instead of weak matches.
  - If positive signal: scores against `network`/`certificate`/`install` cards only, with a "Detected console error: {pattern}" note above the matches.

- **App Screen** — drop or paste a screenshot of the RapidReconciler UI. OCR runs, no preclean, scored against `application`/`database`/`migration` cards only. No positive-signal gate.

## Cross-card hints (recently added — please test these)

Both Browser Console and App Screen now have **wrong-card pattern detectors**. When the OCR'd text contains tokens distinctive to a different card, an amber "Looks like a {browser console / app screen / agent log} screenshot — try the {Other Card} card instead" banner appears below the empty state OR above weak matches (top score ≤ 2). The detection vocabulary:

- **App Screen detects**: console tokens (`net::ERR_`, `Failed to load resource`, `DevTools`, `base.js`, etc.) → suggests Browser Console; agent-log tokens (stack traces, `SqlException`, `Microsoft.SqlServer`, `.Dts.Runtime`, `SSIS package`, `SSMS`) → suggests Agent Log.
- **Browser Console detects**: app-UI tokens (`Inventory Validation`, `Companies tab`, `System Status`, `Reconciliation`, `Out of Balance`, `Carry Forward`, `Variance Calculation`) → suggests App Screen; same agent-log tokens → suggests Agent Log.

The page does NOT try to detect "is this a RapidReconciler screenshot" — that was deliberately rejected as too brittle. Wrong-card detection only works in the negative direction (does this look like one of the OTHER known image types).

## Escalation flow

Each scenario card detail pane has two buttons:
- **Email escalation** — opens a `mailto:` to the next-up tier with To/Subject/Body prefilled. Body includes the troubleshooting steps from the card; if `pastedEmail` is set, the customer's email is appended below. URL budget is 1900 chars; over-budget bodies fall back to clipboard with a stub mailto and a toast reminder.
- **Create JSM ticket** — opens Jira Create Issue dialog with summary/description prefilled. Same URL-budget fallback pattern.

Tier 3 cards (developer-owned) are terminal — no escalation buttons rendered.

## What I want to test

Please ask me one focused question at a time so we can work through scenarios systematically. Possible test dimensions:

1. **Matcher accuracy** — give the page a realistic email/log/screenshot and verify the right scenario card surfaces as the top match.
2. **OCR robustness** — test screenshots with poor lighting, low resolution, anti-aliased fonts, etc., and see how the matcher handles OCR mis-reads.
3. **Cross-card hint quality** — verify the wrong-card detector fires on the right inputs and stays silent on the right inputs.
4. **Escalation flow** — verify the prefilled email/JSM contains the right content for various card+pasted-email combinations.
5. **Edge cases** — empty inputs, very long inputs, special characters, non-English text, multiple errors in one screenshot, ambiguous screenshots that could match multiple cards.
6. **UI behavior** — card expand/collapse interactions, the "Show input cards" recovery affordance, the Sales redirect form validation.

## How to help me test

The best way to test the matcher is to construct realistic test inputs (sample emails, log snippets, OCR'd screenshot text) and walk through what we'd expect to see. You can extract the actual matcher code from the file and run it in Python or Node to verify behavior — the helpers we'll likely need are: `tokenizeEmail`, `scoreCardForEmail`, `EMAIL_STOPWORDS`, `EMAIL_PHRASE_BONUSES`, `precleanConsoleText`, `detectConsoleSignal`, `OCR_CONFIG`, `detectWrongCard`. Card data is in HTML attributes — `data-id`, `data-tier`, `data-category`, `data-search` on each `<article class="ts-card">`.

For UI behavior I can describe what I see and you can walk me through what should happen.

When you suggest fixes or improvements, please be conservative — this hub has had a lot of iteration and the user (me) prefers small targeted changes over large refactors. Always run a regression suite after a change to make sure earlier scenarios still pass.

## Important context to NOT relitigate

These are decisions already made and validated:

- **No image-classification ML** — deliberately rejected. Wrong-card detection is the lighter alternative.
- **Per-card scoping is intentional** — Browser Console scoring application cards would re-create the false-positive problem the scoping was designed to fix.
- **`mailto:` URL fallback to clipboard at 1900 chars** is the correct pattern — most mail clients cap around 2000.
- **Sales redirect requires customer email** as required field — the CC value is the whole point of the feature.
- **The "Inputs" label and four-card layout** is the current UI; previous iterations had a single email pane or three vertical bars. Don't suggest going back.

Ready when you are. Ask me what scenario I want to test first.
