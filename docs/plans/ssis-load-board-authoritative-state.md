# SSIS load board — one authoritative state, computed server-side

**Status:** proposed (2026-06-24). Companion to
`ssis-load-orchestration-hardening.md` (that doc hardened *run / stop / kill*;
this one fixes *observe* — what the Step-6 Tables board displays per row).

---

## 1. The problem — we play whack-a-mole with the board

Every session fixes one board symptom and a new one surfaces:

- green ✓ on tables that loaded 0 rows ("no source data"),
- spinners that never stop after a load is **Canceled**,
- a sub-step reading "pending" while its rows are visibly climbing,
- green / durations / "Succeeded" surviving a Clear,
- "load progress isn't detailed enough" (raised, then dropped).

These are not independent bugs. They are all the same defect surfacing in
different cells.

## 2. Root cause — the board *infers* state on the client

`instRenderTableCounts` (deployment.html) derives each row's state from a
patchwork of **indirect** signals, none of which is the actual task status:

- a done-set accumulated **only** from `OnPostExecute` events
  (`_instDonePhases`),
- live final-table row counts, staging row counts (`hasSource`),
- a "did the count climb since last poll" heuristic (`climbed`),
- a live `ALTER INDEX` probe (`rebuilding`),
- task execution **order** memorized client-side (`_instTaskOrder`,
  `instTableStarted`).

The running predicate is therefore purely local and **has no "the run is over"
gate**:

```
running = !fullyDone && (instTableStarted || hasSource || rebuilding || climbed)
```

Nothing in that expression knows the **execution's overall status**. After a
Canceled run, a task that *started* but never posted `OnPostExecute` still has
staging rows + a climbed count → `running` stays true forever → a spinner that
can't stop. Each past fix added one more inference rule; the next edge case
breaks it. That is the whack-a-mole engine.

## 3. Evidence — decoding the canceled run (exec 10334, 2026-06-24)

A Dev full load was stopped mid-flight (Canceled at phase 3/9, ~3.58M rows
landed). The catalog tells the exact truth the board got wrong:

| Task | OnPre (started) | OnPost (finished) | Board showed | Truth |
|---|---|---|---|---|
| `Copy F0911 to Staging` | yes | **yes** | staging 3.04M | done |
| `Merge into F0911` | yes | **no** | "pending" **+ spinner** | **canceled mid-merge** (176 rows landed) |
| `Get F4111 New` | yes | **no** | spinner | **canceled mid-pull** (3.19M landed) |

`Merge into F0911` *started* (that is the 176 rows) but never posted
`OnPostExecute` because it was canceled. The done-set says "pending"; the
row-climb heuristic says "running" → a permanent spinner. Both client signals
are individually true; **neither knows the execution was Canceled.**

## 4. Settled facts the design rests on

Verified on exec 10334 at the **dev/prod logging level** (`LOGGING_LEVEL = 1`,
Basic — no Verbose/Performance needed):

- `catalog.executions.status` gives the authoritative overall state
  (Running / Succeeded / Canceled / Failed / Stopping / Pending).
- `catalog.event_messages` carries per-task **OnPreExecute** (started) and
  **OnPostExecute** (finished-ok) — 266 rows for this run.
- `catalog.executable_statistics` carries per-task `execution_result`
  (0 = success) + duration — **39 rows present even at Basic logging**, so we
  do not depend on a raised logging level.
- final-table row count + `Staging_*` row count are already queried.

Everything needed to compute the true state per task **exists in the catalog
at the production logging level.** The truth is on the server; the bug is that
we recompute a worse version of it on the client.

## 5. Target design — one `state`, computed once on the server

Move the decision to the server. Compute a single state per displayed row and
per sub-step, return it on the existing `ssis-table-counts` payload, and make
the frontend a dumb renderer.

### 5.1 The state enum (the whole contract)

| `state` | computed when | render |
|---|---|---|
| `not_started` | task has no OnPreExecute | grey, count only, no spinner |
| `running` | started, not finished, **AND execution status = Running/Stopping** | spinner |
| `done` | finished (OnPostExecute) with `execution_result = 0` | green ✓ + duration |
| `empty` | `done` **and** 0 rows **and** the run **Succeeded** | green, "no source data" |
| `incomplete` | started, not finished, **AND execution is terminal** (Canceled/Failed/EndedUnexpectedly) | no spinner, "canceled — partial (N rows)" |
| `failed` | finished with `execution_result <> 0`, or the execution failed on this task | red + the task error |

### 5.2 The master rule that kills the bug class

> **When the execution is terminal, no row is ever `running`.**

That one gate eliminates spinner-on-canceled, pending-while-running, and
green-on-empty-after-cancel **as a class**, because `running` can only be
emitted while `executions.status` is Running/Stopping. Everything terminal
resolves to `done` / `empty` / `incomplete` / `failed` — never a spinner.

### 5.3 Sub-steps are first-class (fixes "not detailed enough")

Each net-change table's lifecycle is three real catalog tasks, each with its
own pre/post — so each gets its **own** `state`, not a guess derived from the
parent:

- `staging load` (e.g. `Copy F0911 to Staging`)
- `apply` (e.g. `Merge into F0911` / the insert-merge proc)
- `rebuild indexes`

The parent row's `state` is the **min** across its sub-steps (a table is `done`
only when staging + apply + rebuild are all `done`). The board stops inferring
"the apply must be running because rows climbed" — it reads the apply task's
real state.

### 5.4 Server contract

`GET /valc/deployment/ssis-table-counts` returns, per table:

```
{ name, group, rows, expected?,
  state,                       // the enum in 5.1
  durationSec?,                // when done
  substeps: [ { kind: 'staging'|'apply'|'rebuild', state, rows?, durationSec? } ]
}
```

State is computed in one place (a `LoadBoardStatusService`) from a single read
of `executions` + `event_messages` + `executable_statistics`, joined to the
table→task-name map the board already encodes. The execution's overall status
is fetched **once** and passed into every row's computation (that is the gate
that's missing today).

### 5.5 What gets deleted on the client

`instRenderTableCounts` collapses to `switch (t.state)`. These all go away:

- `_instTaskOrder` + `instTableStarted` (started-inference),
- the accumulated `_instDonePhases` + its localStorage persistence
  (`instLoadDonePhases` / `instSaveDonePhases` / `instAccrueDone`),
- `climbed` and the `_instPrevCounts` climb baseline used to drive state,
- the live `ALTER INDEX` `rebuilding` probe inference,
- the per-exec done-set reset dance (`_instDoneExecId` / `_instClearedExecId`
  as *green* drivers — see §6 for what survives).

The client keeps only: render the returned `state`, show the count, draw the
progress header from the server's done/total.

## 6. What user-actions still own (not catalog state)

`state` describes the *execution*. Two things are **user intent**, not catalog
truth, and stay client/endpoint concerns:

- **Clear.** Truncating the tables is an operator action with no catalog
  execution of its own. After a Clear the rows are genuinely empty and the last
  execution's data is gone — so the board shows `not_started` (count 0) and the
  Load Progress panel shows the "cleared" note. The server can express this by
  treating a post-Clear table as having no current data; the simplest path is a
  per-DB "cleared marker" (already prototyped as `_instClearedExecId`) that the
  status service honors so a Cleared run's tasks don't resolve to `done`.
- **Expected-rows baseline.** Pure testing aid, browser-local. Unchanged.

This is why today's Clear-reset edits survive the rework: Clear is orthogonal to
the execution state machine.

## 7. Build order

1. **Lock this state table (5.1) — done by this doc.** Every future "board bug"
   is first checked against the table; if the table says the render is correct,
   it isn't a bug.
2. **`LoadBoardStatusService`** — server-side compute of per-row + per-substep
   `state` from one catalog read, gated on overall execution status.
3. **Extend `ssis-table-counts`** to the 5.4 shape (additive — keep `rows`).
4. **Collapse the client** to `switch (t.state)`; delete the §5.5 inference
   layer.
5. **Honor the Clear marker** in the status service (§6).

## 8. Verification — three real runs, not just the happy path

The cancel and empty cases are where it has always broken, so all three are
required before this is called done:

1. **Full Succeeded load** — every row ends `done`; legitimately-empty source
   tables end `empty`; no row stuck spinning; header reaches 100%.
2. **Canceled mid-flight** (reproduce 10334) — reached tables `done`, the
   in-flight table `incomplete` ("partial — N rows"), un-reached tables
   `not_started`; **zero spinners** after Canceled.
3. **Empty-source table** on a Succeeded run — `empty` + "no source data",
   green; and confirm a *non*-empty table never shows "no source data".

## 9. References

- `ssis-load-orchestration-hardening.md` — the run/stop/kill companion.
- `deployment.html` `instRenderTableCounts` / `instLoadLastExecution` — the code
  this replaces.
- `DeploymentController` `ssis-table-counts` / `ssis-last-execution` — the
  endpoints to extend.
- Evidence: SSISDB exec 10334 (Canceled), `LOGGING_LEVEL=1`, 39
  `executable_statistics` rows / 266 `event_messages`.
