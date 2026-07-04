# Convert the "Copy F3106" SSIS data flow to the staging + `usp8_apply_f3106` pattern

**Status:** spec, 2026-07-04. **DB side DONE** (ships in `db-v8.0-beta.34`): `dbo.Staging_F3106`
table + `dbo.usp8_apply_f3106` proc are in source + `RapidReconciler.sqlproj`. They are **inert**
until the SSIS package change below lands (nothing populates staging / calls the proc yet — a safe
no-op increment). **SSIS side PENDING** — execute + **load-test with the B→C run** (do NOT ship the
`.dtsx` edit blind; an untested package edit can break the whole nightly load).

## Why

F3106 is the last of the pulled tables still using the legacy **in-flow apply** (OLE-DB Source ->
Lookup Existing Records -> Conditional Split -> insert). That row-by-row lookup pattern is the
"F3106 slow" cost. The other 7 tables were converted to **bulk-land-to-staging + set-based apply
proc**; F3106 was never converted. This brings it to parity.

## Verified current data flow (from `RapidReconciler_Prod.dtsx`, `Package\Orders\Work Orders\Copy F3106`)

- **OLE-DB Source `qryF3106`** (expression-built), against the JDE source:
  `Select * from (Select SDDOCO, SDDOC, SDDGJ, SDICUT, SDICU, SDDICJ, SDUSER, SDDCT, SDPID, SDJOBN
   From <dbowner>F3106 Where SDDICJ >= @DateF3106 ) a Order By SDDICJ`
  — windowed on **SDDICJ** (>= the `DateF3106` watermark variable).
- **Lookup Existing Records `qryF3106RR`** against the RR DB:
  `Select sddoco, sddoc, sddgj, rtrim(sdicut) sdicut, rtrim(sduser) sduser From f3106
   Where SDDICJ >= @DateF3106Gr` — keyed on the 5-col PK.
- **Conditional Split** — outputs **`[New]`** (`ISNULL(<lookup>.d_sddoco)` -> no PK match) and
  **`[Unchanged]`** (matched). **No "Changed" output.** => **INSERT-ONLY**: new rows appended,
  existing rows never updated, nothing deleted.
- **Date Format / Remove Nulls** derived columns: Julian -> datetime for `SDDGJ` and `SDDICJ`.
- Destination: the `[New]` rows insert into `dbo.F3106`. (`pk_f3106` is `IGNORE_DUP_KEY = ON`.)

## Target architecture (mirror the other 7 converted tables)

1. **`Copy F3106` data flow becomes a dumb pipe:** `qryF3106` source -> the existing Date Format
   derived columns (Julian -> datetime) -> **OLE-DB destination (FastLoad) into `dbo.Staging_F3106`**.
   Remove the **Lookup Existing Records**, the **Conditional Split**, and the in-flow F3106 insert.
2. **Control flow:** add an **Execute SQL Task `Apply F3106`** running `EXEC dbo.usp8_apply_f3106;`,
   sequenced after `Copy F3106` (precedence constraint), exactly like the other `Apply F*` tasks.
3. `usp8_apply_f3106` (already shipped) does the set-based insert-only apply: fast-path bulk insert
   on an empty target, else chunked `INSERT ... WHERE NOT EXISTS` by the 5-col PK.

## The `.dtsx` surgery — care required ([[feedback_ssis_xml_edit_reset_layout]])

- Removing the Lookup + Conditional Split components via XML **orphans their `DesignTimeProperties`
  layout CDATA** — delete the whole `<DTS:DesignTimeProperties>` CDATA block for the `Copy F3106`
  data flow in the same pass so the designer can re-lay-out cleanly (do NOT hand-edit coordinates).
- Keep the `qryF3106` source + the Date Format derived columns; only the tail (lookup/split/insert)
  is replaced by the staging destination.
- The `@DateF3106Gr` variable + `qryF3106RR` lookup query become dead once the lookup is gone —
  remove them too (leaving them is harmless but untidy).
- Do the same edit in `setup/ispac-work1/embedded.dtsx` (the ispac build copy) so the deployed
  package matches.

## Staging truncation — handled in the package, NOT in `sp_truncate_staging_tables`

Verified: `sp_truncate_staging_tables` truncates the **target** F-tables (it already includes
`dbo.F3106`), which is what puts the target empty on a reset so `usp8_apply_f3106` takes its
fast path. It does **not** truncate any `Staging_F*` table (none of the 7 converted staging
tables appear there). So `Staging_F3106` must be cleared **before the copy in the SSIS package**,
exactly like the other staging tables (their pre-copy truncate / FastLoad handling). No DB proc
change is needed for this — do it in the `.dtsx` alongside the data-flow rewire.

## Verification (with tomorrow's B→C)

1. Deploy `beta.34` (already carries the table + proc + truncate).
2. Land the `.dtsx` edit; run a dev B->C on Demo1.
3. Confirm: `Staging_F3106` populates during the copy; `dbo.F3106` row count matches the legacy
   result; one `RSsisLoadLog` row `F3106, <n> new, 0 changed`; the `Copy F3106` step time drops
   (no per-row lookup).
