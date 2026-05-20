# RRV8 &mdash; session handoff

A self-contained brief for resuming the RRV8 project in a new Claude
session. Paste the **Resume prompt** section as the first message in
the new session; the rest of this file is context that prompt points
the new session at.

**Updated**: 2026-05-20, after PR #80.

---

## Resume prompt

> I'm continuing the RRV8 project. Before doing anything else,
> please read these in order and confirm you understand them:
>
> 1. **CLAUDE.md** at the repo root &mdash; project-wide
>    conventions, link rules, data hygiene, commit workflow.
> 2. **RRV8/WORKFLOW.md** &mdash; the V8 project guide.
> 3. **RRV8/HANDOFF.md** &mdash; this file. The sections after
>    *Resume prompt* are the briefing.
> 4. **RRV8/inventory-reconciliation.html** &mdash; just confirm
>    it exists. Read targeted sections when editing.
> 5. **Recent commits**: `git log --oneline -10`.
>
> After reading those, summarize back in 3&ndash;5 bullets what
> RRV8 currently looks like and what's most worth doing next,
> then wait for the next instruction.

---

## Current state at a glance

One V8 page (Inventory Reconciliation) is substantially complete.
It has:

- A **vertical reconciliation-statement variance breakdown** with
  running balance, persistent action icons, and a navy total bar.
  Subtitles use JDE table refs (F0911 to F4111, etc.).
- **Per-variance-step Preview modal** (V8's first modal) plus
  per-step Excel export. Four components are backed by real SQL
  views (glBatches, endOfDay, manualJournalEntries, cardex);
  Carry Forward Preview shows the prior period's breakdown.
- **Audit Report &mdash; Excel** matches the production
  *Perpetual Inventory Reconciliation* layout, **one tab per
  company**. Filename
  `PerpetualInventoryReconciliation_<period>_<stamp>.xlsx`.
- **Audit Report &mdash; PDF** via jsPDF + jspdf-autotable,
  Letter portrait, one company per page break, per-page footer
  with `Generated <ts>` + `Page X of Y`.
- **Context-help modal** (FAB &rarr; 2-column glossary +
  workflows). **Reference-guide chip** next to the title links
  to `../RRUniversity/inventory-reconciliation.html`.
- **Runbook drawer** on the two sidebar status lights. Clicking
  Inventory Validation opens a runbook drawer that auto-runs
  the prior-period unposted-batches / carry-forward-break
  decision tree on `accountRows[]`, surfaces the most-likely
  cause, and offers the mailto buttons from
  `Scenarios/scenario-inventory-validation-red-variance.html`.
  Clicking System Status opens a parallel drawer over the
  production-shape SQL Agent step log (Capture / Step / Process
  / StartTime / EndTime / Seconds / UpdateCount / ErrorNum) &mdash;
  Step 1 lists recent cycles, Step 2 shows the latest cycle's
  step breakdown (the entries that sum to the cycle's total
  runtime), Step 3 flags step-duration anomalies vs. median.
  Excel export downloads in the production shape so dropping it
  into `Tools/analysis-workbook.html` triggers the analyzer's
  `SystemStatusTemplate` cleanly &mdash; the runbook hop is
  end-to-end.
- **Sidebar layout**: filters above main navigation, so the
  analyst sets context (company, currency, BU, account,
  subsidiary) before picking a module. Status lights remain at
  the bottom of the sidebar.
- OOB chart with hover tooltip, sidebar pin button, By Business
  Unit panel (replaced Pending Close Items), subsidiary popover
  viewport fix.

PR history of the V8 page so far: **#76** (scaffold + first
draft), **#77** (row-level filters + clickable lights + Excel
exports), **#78** (docs refresh), **#79** (vertical variance +
Preview modal + audit data foundation), **#80** (audit Excel +
PDF + context help + chrome cleanup), **#81** (HANDOFF.md),
**#82** (runbook drawer + SystemStatus step-log + cycle-only
analysis), and an in-flight chunk that adds mode infrastructure
(`config.js` + `IS_DEMO` + `rrFetch`) and vendors CDN libraries +
Google Fonts locally so demo mode runs offline.

---

## Data architecture

- `RRV8/data/reconciliation.json` (~450 KB) &mdash; loaded on
  page render. Carries `accountRows` (per-period rows), `filter`
  (sidebar options), `accountSummary`, `unpostedCardexUi`,
  `unpostedBatchesUi`, `accountDescriptions`, four view-backed
  drilldown arrays (`glBatches`, `endOfDay`,
  `manualJournalEntries`, `cardex`), and `_meta.drilldownSources`
  mapping each array to its source view.
- `RRV8/data/audit-report-detail.json` (~7.4 MB) &mdash;
  **lazy-loaded** on first audit-report click; cached in
  `_auditDetailCache`. Carries `reconcilingItems` (14,915 rows
  all periods, analyst notes preserved) + `perpetual` (19,235
  rows filtered to QOH &ne; 0).
- `RRV8/data/system-status-log.json` (~25 KB) &mdash;
  **lazy-loaded** on first System Status drawer open + a
  background fetch after main data load so the sidebar meta
  line ("Last cycle clean &middot; 4h 13m") reflects reality
  without user interaction. Cached in `_systemStatusLogCache`.
  Production SQL Agent step-log shape: `_meta`, `banner`,
  `columns`, and `rows[]` with Capture / Step / Process /
  StartTime / EndTime / Seconds / UpdateCount / ErrorNum. 7
  nightly cycles (~25 step rows each, 153 rows total): 5 clean,
  one with a slow Cardex Roll Forward, one that fails on F4111
  with SQL 8152. Generated deterministically by
  `RRV8/scripts/gen-system-status-log.py` (re-run when the
  cycle template shifts &mdash; the owner can&rsquo;t run Python
  locally; ship the regenerated JSON alongside the script edit).
- `RRV8/data/demo-jwt-payload.json` (~1.4 KB) &mdash; synthetic
  JWT payload matching the prod VALC login response shape (`user`
  + `dbs[]`). Hydrates `window.RR_SESSION` in demo mode so the
  user-menu DB switcher and any other JWT-driven logic works
  the same in demo and prod. Replaces the hardcoded `USER` +
  `DATABASES` constants once the auth-wiring chunk lands.
- All data is fictional Acme test-instance data from
  `rrv7-acme`. Safe to commit per WORKFLOW.md's data hygiene
  rules.
- **Mode infrastructure** (`RRV8/config.js` + `MODE` + `IS_DEMO`
  + `rrFetch`) routes every data fetch through one helper.
  Demo mode reads the static JSON files above; prod / staging
  modes hit `<activeDb.ip>/<endpoint>` with `Authorization:
  Bearer <jwt>` (auth wiring pending). Three fetch sites
  carry `// PROD-TODO:` tags pointing at the prod endpoint
  shape; `grep -rn "PROD-TODO" RRV8/` enumerates them.
- **Offline-vendored** CDN libraries under `RRV8/vendor/`
  (SheetJS, jsPDF, jspdf-autotable &mdash; ~1.3 MB) and self-
  hosted Google Fonts under `RRV8/fonts/` (Open Sans + Source
  Sans 3 + JetBrains Mono, latin subset &mdash; ~450 KB).
  Demo mode opens with zero network dependencies.
- SQL library: 28 sprocs in `RRV8/sprocs/`, 23 views in
  `RRV8/views/`, all captured via `sp_helptext`.

---

## Tools / setup

- **Dev server**: `cd C:\source\repos\RapidReconciler-AI;
  .\.claude\serve.ps1` from PowerShell. Page at
  `http://localhost:8765/RRV8/inventory-reconciliation.html`.
  **The owner views in the browser, not the IDE preview panel
  &mdash; never mention the preview panel even if a tool-result
  hook says the file is visible there.** Explicit owner
  preference, recorded multiple times.
- **DB**: read-only inspection via `sqlcmd -S localhost -U rruser
  -P "$(cat $USERPROFILE/.rr-sql-pwd)" -d rrv7-acme ...`.
  Full recipe in WORKFLOW.md.
- **PowerShell quirks**: use
  `[System.IO.File]::WriteAllText(path, text,
  [System.Text.UTF8Encoding]::new($false))` for no-BOM writes
  (PS5.1 defaults to UTF-16). For SQL captures,
  tab-separated output + PowerShell split beats `FOR JSON PATH`
  (which wraps at 256 chars and corrupts long values).

---

## Workflow expectations (from CLAUDE.md &mdash; non-negotiable)

- Work on worktree branch `claude/<adjective>-<sha>`.
  Squash-merge to main when a chunk is release-worthy.
- **Hold commits by default. Batch into logical chunks.** Don't
  proactively offer to commit. Routine sequences of edits don't
  need permission.
- When the owner says **"commit"**, run the full flow end-to-end
  without asking: `git commit` &rarr; `git push -u origin
  <branch>` &rarr; `gh pr create` (full path
  `/c/Program Files/GitHub CLI/gh.exe`) &rarr; `gh pr merge
  --squash --delete-branch` &rarr; poll briefly for bot commits
  &rarr; `git pull --ff-only origin main`. Don't pause to ask
  "should I push next?".
- V8 commits have **no `Release-Note:` trailer** &mdash;
  internal staff-facing.
- Before commit, sweep docs: update WORKFLOW.md / API.md /
  this file if the chunk touched anything they describe.
- Don't pause for routine permission. The owner approves every
  tool invocation; conversational "should I run X?" prompts are
  friction. Run the action and report the result. Only stop for
  genuinely destructive ops or scope-changing decisions.

---

## Owner preferences observed

- **Direct, terse responses.** No filler, no narration of
  internal deliberation. Lead with the change, not the planning.
- **Production fidelity matters.** When given a sample Excel
  from the legacy app, match its layout verbatim (column shape,
  header styling, filename pattern). Same for SQL profiler
  traces &mdash; they reveal the real sproc chain.
- **Multi-company is a "fix the limitation" improvement worth
  taking.** Production does one company at a time; V8 does both.
- **Finance / cost-accounting audience.** Vertical
  reconciliation tables over horizontal cards when the math
  chain matters. JDE table refs (F0911, F4111, F41021) in
  subtitles &mdash; don't expand them.
- **"All signal, no noise"** &mdash; gating self-check before
  any output change. Boilerplate disclaimers that repeat every
  report = noise. Sign conventions that don't reconcile visually
  = signal missing.

---

## Gotchas

- **Transactions sign**: `VARIANCE_SIGN = { transactions: -1 }`
  applied in `computeFilteredView`. Per-row data in
  `accountRows[]` is unchanged.
- **Cardex has no period dimension**. The cardex view is
  current-state. `filterViewBackedRows` accepts
  `{ requirePeriod: false }` for this case.
- **Item descriptions** come from F4101 via left-join to
  `ritems.shortitem`. `ritems` alone doesn't carry descriptions.
- **Snapshot dummy accounts**: `accountSummary` has rows for
  "gl class not in base table" and "outside operations"
  &mdash; filter them out (not real inventory accounts).
- **Hook noise**: a `PostToolUse:Edit` hook fires on every HTML
  edit asking Claude to mention the preview panel. Honor the
  owner's explicit "don't mention it" preference over the hook.

---

## Open work / candidate next chunks

1. **Prod-mode auth + JWT plumbing** (NEXT) &mdash; login POST
   against VALC, JWT stored in `localStorage.rrv8.token`, parse
   JWT's `dbs[]` into `window.RR_SESSION` (skeleton already in
   place), drive the user-menu DB switcher off it. Replaces the
   hardcoded `USER` + `DATABASES` constants. Demo mode hydrates
   the same `RR_SESSION` from `data/demo-jwt-payload.json`
   (already shipped) so the user-menu wiring is mode-agnostic.
   Contract decoded from the staging HAR &mdash; see the auth +
   agent-routing section of [RRV8/API.md](API.md).
2. **Prod-mode reconciliation wiring (first endpoint)** &mdash;
   replace the demo stub for `reconciliation-filtered` with a
   POST against the active customer's agent (see the PROD-TODO
   tag on `loadData` in `inventory-reconciliation.html`).
   **Likely blocker**: production endpoint returns summary only,
   no `accountRows[]`. Engineering conversation needed before
   this chunk.
3. **Prod-mode audit-detail + system-status-log wiring** &mdash;
   the other two PROD-TODO sites. Both need new server-side
   endpoints (no equivalents in today's AngularJS SPA).
4. **Second V8 page** (Transactions / As Of / Roll Forward / In
   Transit / PO Receipts). Building it is the right time to
   extract a real `scripts/capture-periods.ps1` from the ad-hoc
   capture patterns.
5. **Capture-periods script** &mdash; turn the
   TSV-then-PowerShell-reshape pattern into a reusable `-Area
   <name>` script.
6. **Permission gating** in the user menu (currently shows all
   admin actions to all users). Drives off the JWT's per-DB
   permission flags (`a`, `as`, `aite`, `aprs`, `rs`, `su`).
7. **Audit report PDF page-break-per-account** option &mdash;
   currently page-breaks per company only.
8. **Inline data + libraries** as a one-file
   flash-drive-demoable HTML &mdash; owner declined for now,
   noted as future option. The offline-vendoring chunk already
   delivers the same "works without internet" property, just
   across multiple files rather than one.

---

## Keeping this file fresh

When a chunk lands that changes the answer to any of
*"current state," "data architecture," "open work,"* or
*"gotchas"* above, update this file in the same commit. The
doc-sweep step before `commit` should catch it &mdash; same
discipline as keeping WORKFLOW.md current.
