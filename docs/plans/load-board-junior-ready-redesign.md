# Step 5 — Junior-ready load-staging redesign

**Status:** spec, locked for build 2026-07-04 (owner-reviewed). Autonomous batch: build →
redeploy VALC (non-elevated) → self-verify → one proof reload. Owner does F4211/F4311 after
this lands.

**Definition of done:** a junior can run a load confidently — guided Data Load card, one-click
per-group Reload, a plain-language activity log, a calm board that shows health at a glance,
high-contrast controls — and the flakiness is gone. A new-looking, *functioning* load-staging
process.

**Scope:** `RapidReconciler-Valc` only — `templates/deployment.html` (card, board, reload
buttons, activity log), `service/SsisDeployService` + `dashboard/DeploymentController` (backend),
CSS (contrast). **No DB or SSIS-package changes** — the group fan-out + `RunInvSupp`/`RunOrders`
params already shipped in `ssis-v8.0-beta.9` and are live in Demo1.

## Build order (value-first; each independently deployable + verifiable)

### 5d — Recovery path (backend + group-header Reload)  ← first, highest value
- `DeploymentController.ssisRun` endpoint: accept `mode=PRELOAD_GROUPS` + `groups[]` + `mce`.
- `SsisDeployService.ssisRun`: extend the exec-param block (today sets `RunInv/RunGL/RunReceipts`,
  ~L259-263) to the **five** flags — set each `Run*` true only if its group is in `groups[]`,
  else false; set `MaxConcurrentExecutables` from `mce` per run.
- `deployment.html` `instRenderTableCounts` (~L5768, the group-header render): add a **Reload**
  button per group header; map group name → flag
  (Inventory→RunInv · Inventory Supplemental→RunInvSupp · General Ledger→RunGL · Orders→RunOrders
  · Receipts→RunReceipts); POST `ssis-run{mode:'PRELOAD_GROUPS', groups:[that one], mce}`.
  Light confirm: *"Reload &lt;group&gt;? This re-pulls its tables from the JDE source."*
  Button disabled while any load/deploy is in flight (activity lock). **Companies = no button.**

### 5a — Data Load card (layout locked)
- Remove R1 title, R3 agent row, and the static `<p class="wf-row-hint">` (L1909).
- **R2** one-line status (✓ / Loading… / No load yet / ✗ Failed).
- **R4** horizon under `▸ Advanced` (+ raw MCE number).
- **R5+R6** effort `Serial ▾` (Serial=1 default, Faster=4) **inline with `LOAD DATA`**;
  running → `Stop load` + spinner.
- Agent surfaces only as an **inline blocker** when stopped (disables `LOAD DATA`); hidden otherwise.

### 5-log — Activity log (Load Progress card)
- New endpoint `ssis-activity?executionId=` → curated read: `catalog.executable_statistics`
  (timeline + per-container timing) + `RSsisLoadLog` (row counts, "no source data") +
  `event_messages` filtered to `OnError`/`OnWarning` (translated). Each entry keeps its raw
  message for `[details]`.
- Card renders a plain-language stream. Vocabulary: **group names + F# + counts + durations**;
  verbs **Started · Loaded · Rebuilding indexes · No source data · Done · Stopped · Failed**;
  only errors/warnings translated, raw text behind `[details]`.

### 5-board — Slim + calm the board (resolves #7)
- **Drop green band tint** (✓ carries "done"). **Drop per-table sub-rows** (staging/apply/rebuild
  → they live in the log now). One line per table: **dot · table (F#) · rows / expected**.
  Keep "no source data" + the group Reload.
- Counts **tick live from `sys.dm_db_partition_stats`** (cheap metadata, exact row_count — no
  `COUNT(*)`, no table scan). **Guard overlapping polls** (skip if prior in-flight, stop once
  terminal). **Retire the heavy timeline CTE** (`SsisDeployService:585`) from the board path —
  the activity log owns the catalog timeline now.

### 5c — Contrast pass
- Fix button + spinner contrast/visibility on the touched surfaces (`LOAD DATA`, `Stop`,
  `Reload`, spinner) so a junior can always see what's happening.

## Locked decisions
Audience = junior GSI support/tech (F# OK) · Data Load layout (R1/R3 removed, effort inline,
one-line status, agent exception-only) · drop green tint · counts tick live (partition_stats) ·
`[details]` escape hatch · Reload = re-pull only + light confirm (copy approved) · **no**
auto-reconcile (nudge instead) · **effort Serial=1 (default) / Faster=4** · Companies = no Reload ·
activity-log style = author's pick, tweakable later.

## Verification (how the owner comes back to something trustworthy)
- **Structural:** confirm the edited templates/Java wire correctly (read back).
- **Live read-only** (2nd Chrome tab, never the owner's session): no console errors; card + board
  render; group headers show Reload; counts tick; activity log renders; contrast legible.
- **Backend:** confirm `ssis-run` receives the right per-group flags (network/console).
- **Functional proof:** run **one Inventory Supplemental reload** end-to-end (lightest group) —
  button → correct flags → package runs only that group → board ticks → activity log shows it →
  package reaches `Complete` (validates the partial-reload fan-in flagged in 3b). **Monitor CPU
  with ONE cheap detached watcher** ([[feedback_low_diagnostic_footprint]]); a temporary swamp
  during the reload is acceptable — report the peak and confirm it settles.

## Owner on return
- **Commit authority** for the batch (held until "commit").
- **Visual eye-check** — owner is the eyes for the UI.

## Risks watched
- Activity-log translation quality (curation; wording tweakable on return).
- Partial-reload `Complete` fan-in correctness — proven only by the proof reload (the reason it's
  in the plan).
- Counts trustworthy (partition_stats.row_count is exact/maintained, not approximate).
