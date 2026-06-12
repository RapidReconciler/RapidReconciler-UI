# SSIS data-flow / destination normalization — worksheet

**Status:** drafted 2026-06-12, approved. Polish pass after the date/parallel
restructures. Net-new package, full-reload test ahead.

## Goal

Replace the accumulated per-component hand-tweaks (commit sizes 1k/10k/2.1B,
inconsistent `TABLOCK`/`CHECK_CONSTRAINTS`, buffer MaxRows 100/1k/default) with
**one consistent, capacity-bounded policy**, so resource use is predictable on
any size box — the same goal as the `MaxConcurrentExecutables` throttle.

## Findings (current state)

- **All destinations already FASTLOAD** — good, no row-by-row loads.
- ⚠ **`Copy F4311` destination `MaxInsertCommitSize = 2147483647`** (untuned
  default = one giant transaction → log/tempdb blowup risk on a small box).
- ⚠ **`TABLOCK` missing on several** → fully-logged inserts (bigger log growth).
- ⚠ **`BufferTempStoragePath` empty everywhere** → spills go to system TEMP (C:).
- 🔧 commit / `ROWS_PER_BATCH` / `CHECK_CONSTRAINTS` inconsistent across ~30 dests.
- 🔧 buffer `DefaultBufferMaxRows` hand-set to 100 / 1,000 / default; one 5 MB
  buffer; `EngineThreads = 5`.

## Target policy

### Every OLE DB Destination
- **AccessMode:** FASTLOAD (unchanged).
- **FastLoadOptions:** `TABLOCK,ROWS_PER_BATCH = 10000`
  - `TABLOCK` everywhere → minimal logging into the (empty, full-reload) staging
    tables; smaller log, faster, easier on a small server.
  - **Drop `CHECK_CONSTRAINTS`** — trusted JDE→staging load; PKs/unique are still
    enforced regardless, this only skips CHECK/FK enforcement (faster). *(If any
    staging table has a CHECK/FK you want enforced at load, keep it there — but
    these are copy tables, so none is expected.)*
- **FastLoadMaxInsertCommitSize:** `10000`
  - Fixes the `Copy F4311` 2.1B outlier (bounded transaction) **and** the
    over-conservative `1000`s (fewer commits = faster). Baked, not config-driven
    (it's per-component, not a single package property).

### Every Data Flow Task
- **AutoAdjustBufferSize = `True`** (SQL 2016+; target is 2019) — SSIS sizes
  rows-per-buffer to the actual row width, so wide tables stop being throttled by
  a fixed low MaxRows and narrow tables stop under-filling. **Removes the manual
  MaxRows guessing.**
- **DefaultBufferSize = `10485760`** (10 MB, the default) — conservative; with
  `MaxConcurrentExecutables = 1` only one buffer set is live at a time. Capable
  servers gain throughput from raising the concurrency throttle, not from bigger
  buffers.
- **DefaultBufferMaxRows = `10000`** (reset to default; ignored once AutoAdjust is on).
- **EngineThreads:** leave as-is (`5` / default — conservative is fine).

### Install-time (not a package edit)
- **`BufferTempStoragePath` / `BLOBTempStoragePath`** → point at the customer's
  **data drive** (where the RR DB lives), not the empty default (system TEMP/C:).
  Set per box at install (or via an env-var-backed package expression later).
  Belongs in the install checklist, not baked into the package.

## Execution

This touches **~30 destinations + 31 data flows** — too many to click through
reliably in the designer, and they're all uniform value/attribute edits (no
structural change, no re-encryption). So:

1. **Owner: close `RapidReconciler_Prod.dtsx` in Visual Studio** (so VS doesn't
   clobber/conflict with the file edit).
2. **Claude: apply the policy to every OLE DB Destination + Data Flow via direct
   XML edit**, then validate well-formedness (.NET XML parser) + re-confirm every
   destination/flow matches the policy.
3. **Owner: reopen the package + Build Solution** to confirm SSIS accepts it, then
   the full-reload test validates behavior.

(Alternative: do it manually in the designer per component — same target values —
but the XML pass is far faster and less error-prone for this volume.)

## Validate

1. Build Solution (SSIS accepts the edited properties).
2. Full-reload test — confirm row counts match; watch log/tempdb growth stay
   bounded (the commit-size fix) on the largest tables (F4311, F0911, F4111).
