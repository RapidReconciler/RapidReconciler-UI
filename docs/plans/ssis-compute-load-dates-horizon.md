# SSIS — self-deriving full-load horizon (`aaStartDateGr`) — VS worksheet

**Status:** drafted 2026-06-14. Closes the deferred "aaStartDateGr from
bootstrap cutoffs" item. Package (VS) change + one coupled VALC change.

## Problem

`aaStartDateGr` is the full-load history start. It bounds:

- the **Min UKID** watermark task (`… from f4111 where ilcrdj >= '<aaStartDateGr>'`), and
- the transactional source pulls (`… ILCRDJ >= '<aaStartDateGr>' …`).

Today it is supplied **externally**:

- VALC injects a per-run `set_execution_parameter_value` override when an
  operator starts a load through the Deployment Center (this part now resolves
  blank → `MIN(rcompanies.PeriodCutoff) − 90`, and shows "Loading data from …").
- **Every other launch path binds the catalog *environment* value instead** —
  the scheduled SQL-Agent refresh, the install job-step run, and the Phase-3
  on-box agent-executor. That environment default is a hardcoded `'2025-01-01'`
  (`SsisConfigService`), which on a dataset with no 2025 rows makes the watermark
  subquery return **NULL**, the result-set binding fail, and the load die with
  `Where ILICU >=  And …` ("Incorrect syntax near 'And'").

**Can't fix by baking a resolved date into the environment at Build time:**
Build-environment (Step 4) runs *before* Bootstrap seeds `rcompanies`, so
`MIN(PeriodCutoff)` is empty then. The package — which runs after Companies —
is the only place that can reliably derive the horizon.

## Fix: the package derives `aaStartDateGr` when it isn't supplied

### 1. Environment default → empty sentinel (VALC, ships WITH the package change)

`SsisConfigService` line ~209: change
```java
rows.add(str("aaStartDateGr", "2025-01-01"));
```
to an **empty** value:
```java
rows.add(str("aaStartDateGr", ""));   // empty = "derive in Compute Load Dates"
```
> ⚠ **Coupled — do not ship this alone.** `ilcrdj >= ''` fails date conversion,
> so an empty environment value breaks non-VALC runs exactly like `2025` does,
> *until* `Compute Load Dates` (below) resolves empty → a real date. Ship both
> together.

### 2. `Compute Load Dates` resolves the variable

`Compute Load Dates` already runs **after `Companies`**, so `rcompanies` is
populated. Add (or fold into an existing) **Execute SQL Task** at the top of the
container that resolves `@[User::aaStartDateGr]` — honoring a supplied value,
deriving when empty:

- **Connection:** `RRLocal` (the RR target DB).
- **ResultSet:** `Single row` → bind result column 0 back to
  `User::aaStartDateGr` (overwrite).
- **Parameter mapping:** input `User::aaStartDateGr` (the current value) as
  parameter `0` (String / VARCHAR).
- **SQLStatement** (one task, COALESCE form — no precedence branching):

```sql
DECLARE @supplied varchar(10) = ?;   -- current @[User::aaStartDateGr]
SELECT CASE
         WHEN @supplied IS NOT NULL AND LEN(LTRIM(RTRIM(@supplied))) > 0
              THEN @supplied                                   -- honor an explicit value (VALC override or a picked date)
         ELSE CONVERT(varchar(10),
                      DATEADD(day, -90, COALESCE(MIN(PeriodCutoff), CAST('1900-01-01' AS date))),
                      23)                                       -- derive: earliest cutoff − 90 days
       END AS aaStartDateGr
FROM dbo.rcompanies
WHERE PeriodCutoff IS NOT NULL;
```

- **Why `MIN`:** the earliest company's cutoff, so a multi-company load never
  clips an earlier company's history. (Single-company DBs: same thing.)
- **Why `− 90`:** the lead-in window the horizon has always carried.
- **Null-guard (`COALESCE(MIN(PeriodCutoff), '1900-01-01')`):** a brand-new DB
  with no cutoffs yet yields a far-past floor → the watermark query stays
  well-formed and pulls "all history" (the company filter then narrows it to the
  zero seeded companies — harmless), instead of NULL → bind failure.
  - **Alternative (stricter):** replace the `ELSE` with a `RAISERROR('No period
    cutoffs seeded — run Bootstrap first.', 16, 1)` so a full load can't run
    before Bootstrap. Pick the floor for "never errors," the raise for "fail
    loud." Recommend the **floor** — Bootstrap normally precedes a full load
    anyway, and a load with no companies is a no-op.

### 3. Precedence

The resolve task must sit **before** `Min UKID` and any source task that reads
`aaStartDateGr`, inside `Compute Load Dates`. No other constraint changes.

## Result

| Launch path | `aaStartDateGr` source after the fix |
|---|---|
| VALC Deployment Center (operator picks a date) | the picked date (VALC passes it; package honors it) |
| VALC, picker blank | VALC passes `MIN(cutoff)−90`; package honors it |
| Scheduled SQL-Agent refresh | env is empty → **package derives** `MIN(cutoff)−90` |
| Install job-step run | env is empty → **package derives** |
| Phase-3 on-box agent-executor | env is empty → **package derives** |

VALC's resolution stays as the **override** (and powers the "Loading data from
…" hint); the package owns the **default**, so no launch path can fall back to
the wrong window again.

## Verify

1. Build Solution; deploy the `.ispac`; rebuild the environment (so `aaStartDateGr=''`).
2. **VALC full load, blank date:** runs bounded at `MIN(cutoff)−90`; hint shows it.
3. **VALC full load, picked date:** runs bounded at the picked date (override honored).
4. **Scheduled/job run (no VALC):** start the standard job's full-load step
   directly (SSMS → the SQL-Agent job) → confirm `catalog.execution_parameter_values`
   shows the derived date, not blank/2025, and the load completes.
5. **Brand-new DB (no Bootstrap):** confirm the null-guard path (floor or the
   chosen RAISERROR), not a NULL-binding crash.
