# SSIS date consolidation — VS rebuild worksheet

**Status:** drafted 2026-06-12, approved, **EXECUTED + builds clean 2026-06-12**
(Chunks 1–4 done; zero hardcoded dates remain; GL queries `qryMinGL`/`qryminbatch`
were already injecting `aaStartDateGr`, so only `Min UKID` needed the floor fix).
Remaining: the full-reload parity test (§8). Part of the SSIS package pass
([`ssis-phase1-target-spec.md`](ssis-phase1-target-spec.md) §8). Net-new package
(`RapidReconciler_Prod.dtsx`), full reload test ahead — so this is a deliberate
refactor, not an incremental patch.

## Goal

Make **`aaStartDateGr` the single managed date lever.** Today the per-table load
dates already mostly derive from it, but via **6 near-identical Execute SQL
Tasks + 7 query variables**, and the **inventory floor (`Min UKID`) hardcodes
`'2022-01-01'` three times** — so changing the start date silently does *not*
move the inventory load. This collapses the date logic to one task + one query
and routes everything (incl. inventory) through `aaStartDateGr`.

### Objects: before → after

| | Before | After |
|---|---|---|
| Date query vars | 7 (`qryF3106Date`, `qryf4211date`, `qryf42119date`, `qryF4311Date`, `qryF4801Date`, `qryDateF43121`, `qryJulianStart` + dead `qryJulianStartDate`) | **1** (`qryLoadDates`) |
| Date Execute SQL Tasks | 6 (`F3106/F4211/F42119/F4311/F4801/F43121 Date`) + `Set Julian Start Date` | **1** (`Compute Load Dates`) |
| Dead write-only vars | `DateF4211Gr`, `DateF42119Gr`, `DateF4311Gr`, `minUKID`, `dateCardexDate`, `branchdatejul` | **removed** |
| Dead task | `Branch Date` (only output `branchdatejul`, unread) | **removed** |
| Managed levers | `aaStartDateGr` (but inventory ignored it) | **`aaStartDateGr`** alone; `RefreshDays`/`RefreshDaysRNV` = policy constants |

---

## 1. New variable: `qryLoadDates` (package scope, String, EvaluateAsExpression = True)

Runs against **`RRLocal`** (the target DB) to read each table's high-water mark.
Returns one row; columns bind to the date variables (§3). The base SQL it
evaluates to (with `aaStartDateGr='2022-01-01'`, `RefreshDays=-35`,
`RefreshDaysRNV=-90`):

```sql
DECLARE @start date = '2022-01-01';   -- @[User::aaStartDateGr]
DECLARE @rd    int  = -35;            -- @[User::RefreshDays]
DECLARE @rdrnv int  = -90;            -- @[User::RefreshDaysRNV]

;WITH g AS (
  SELECT
    d3106  = CASE WHEN NOT EXISTS (SELECT 1 FROM F3106)  THEN @start
                  ELSE DATEADD(dd,@rd,   (SELECT MAX(sddicj) FROM F3106))  END,
    d4211  = CASE WHEN NOT EXISTS (SELECT 1 FROM F4211)  THEN @start
                  ELSE DATEADD(dd,@rd,   (SELECT MAX(sdupmj) FROM F4211))  END,
    d42119 = CASE WHEN NOT EXISTS (SELECT 1 FROM F42119) THEN @start
                  ELSE DATEADD(dd,@rd,   (SELECT MAX(sdupmj) FROM F42119)) END,
    d4311  = CASE WHEN NOT EXISTS (SELECT 1 FROM F4311)  THEN @start
                  ELSE DATEADD(dd,@rd,   (SELECT MAX(pdupmj) FROM F4311))  END,
    d43121 = CASE WHEN NOT EXISTS (SELECT 1 FROM F43121) THEN DATEADD(yy,-2,@start)
                  ELSE DATEADD(dd,@rdrnv,(SELECT MAX(prupmj) FROM F43121)) END
)
SELECT
  -- start-date Julian (one value -> three consumers: F4801, aaStartF0015, startdatejul)
  f4801_jul     = (CASE WHEN YEAR(@start)>2000 THEN 100000 ELSE 0 END)+(YEAR(@start)%100)*1000+DATEPART(dayofyear,@start),
  aastart_jul   = (CASE WHEN YEAR(@start)>2000 THEN 100000 ELSE 0 END)+(YEAR(@start)%100)*1000+DATEPART(dayofyear,@start),
  startdate_jul = (CASE WHEN YEAR(@start)>2000 THEN 100000 ELSE 0 END)+(YEAR(@start)%100)*1000+DATEPART(dayofyear,@start),
  -- per-table Julian (CYYDDD); Gregorian only where actually read
  f3106_jul  = (CASE WHEN YEAR(d3106)>2000  THEN 100000 ELSE 0 END)+(YEAR(d3106)%100)*1000 +DATEPART(dayofyear,d3106),
  f3106_gr   = CONVERT(char(10),d3106,120),
  f4211_jul  = (CASE WHEN YEAR(d4211)>2000  THEN 100000 ELSE 0 END)+(YEAR(d4211)%100)*1000 +DATEPART(dayofyear,d4211),
  f42119_jul = (CASE WHEN YEAR(d42119)>2000 THEN 100000 ELSE 0 END)+(YEAR(d42119)%100)*1000+DATEPART(dayofyear,d42119),
  f4311_jul  = (CASE WHEN YEAR(d4311)>2000  THEN 100000 ELSE 0 END)+(YEAR(d4311)%100)*1000 +DATEPART(dayofyear,d4311),
  f43121_jul = (CASE WHEN YEAR(d43121)>2000 THEN 100000 ELSE 0 END)+(YEAR(d43121)%100)*1000+DATEPART(dayofyear,d43121),
  f43121_gr  = CONVERT(char(10),d43121,120)
FROM g;
```

Notes:
- Julian formula `CYYDDD` matches the existing tasks (`>2000` retained — moot
  for our ≥2020 dates, kept for byte-parity in the test).
- `F43121` (Receipts) seeds **2 years before** the start (`DATEADD(yy,-2,@start)`)
  and keeps `RefreshDaysRNV` — per the receipts-history rule. `DateF43121Gr` is no
  longer a *seed*, just an output.
- `F42119` normalized to `RefreshDays` (the old `-1` is gone).
- Gregorian columns emitted **only** for `F3106` + `F43121` (the only `*Gr` vars
  that are read). `F4211Gr/F42119Gr/F4311Gr` are dropped (§5).

### SSIS expression form (paste into `qryLoadDates` → Expression)

Complete, paste-ready. Only three injection points (`@[User::…]`); everything
else is one literal. The `%` inside the string is literal (not SSIS modulo):

```
"DECLARE @start date = '" + @[User::aaStartDateGr] + "'; DECLARE @rd int = " + @[User::RefreshDays] + "; DECLARE @rdrnv int = " + @[User::RefreshDaysRNV] + "; ;WITH g AS ( SELECT d3106 = CASE WHEN NOT EXISTS (SELECT 1 FROM F3106) THEN @start ELSE DATEADD(dd,@rd,(SELECT MAX(sddicj) FROM F3106)) END, d4211 = CASE WHEN NOT EXISTS (SELECT 1 FROM F4211) THEN @start ELSE DATEADD(dd,@rd,(SELECT MAX(sdupmj) FROM F4211)) END, d42119 = CASE WHEN NOT EXISTS (SELECT 1 FROM F42119) THEN @start ELSE DATEADD(dd,@rd,(SELECT MAX(sdupmj) FROM F42119)) END, d4311 = CASE WHEN NOT EXISTS (SELECT 1 FROM F4311) THEN @start ELSE DATEADD(dd,@rd,(SELECT MAX(pdupmj) FROM F4311)) END, d43121 = CASE WHEN NOT EXISTS (SELECT 1 FROM F43121) THEN DATEADD(yy,-2,@start) ELSE DATEADD(dd,@rdrnv,(SELECT MAX(prupmj) FROM F43121)) END ) SELECT f4801_jul = (CASE WHEN YEAR(@start)>2000 THEN 100000 ELSE 0 END)+(YEAR(@start)%100)*1000+DATEPART(dayofyear,@start), aastart_jul = (CASE WHEN YEAR(@start)>2000 THEN 100000 ELSE 0 END)+(YEAR(@start)%100)*1000+DATEPART(dayofyear,@start), startdate_jul = (CASE WHEN YEAR(@start)>2000 THEN 100000 ELSE 0 END)+(YEAR(@start)%100)*1000+DATEPART(dayofyear,@start), f3106_jul = (CASE WHEN YEAR(d3106)>2000 THEN 100000 ELSE 0 END)+(YEAR(d3106)%100)*1000+DATEPART(dayofyear,d3106), f3106_gr = CONVERT(char(10),d3106,120), f4211_jul = (CASE WHEN YEAR(d4211)>2000 THEN 100000 ELSE 0 END)+(YEAR(d4211)%100)*1000+DATEPART(dayofyear,d4211), f42119_jul = (CASE WHEN YEAR(d42119)>2000 THEN 100000 ELSE 0 END)+(YEAR(d42119)%100)*1000+DATEPART(dayofyear,d42119), f4311_jul = (CASE WHEN YEAR(d4311)>2000 THEN 100000 ELSE 0 END)+(YEAR(d4311)%100)*1000+DATEPART(dayofyear,d4311), f43121_jul = (CASE WHEN YEAR(d43121)>2000 THEN 100000 ELSE 0 END)+(YEAR(d43121)%100)*1000+DATEPART(dayofyear,d43121), f43121_gr = CONVERT(char(10),d43121,120) FROM g;"
```

---

## 2. New task: `Compute Load Dates` (Execute SQL Task)

- **Connection:** `RRLocal`
- **SQLSourceType:** Variable → **`User::qryLoadDates`**
- **ResultSet:** Single row
- **Placement:** top level, **`Initialize → Compute Load Dates → Companies`**
  (rewire the existing `Initialize → Companies` edge through it). Runs once, before
  any container reads a date; reads pre-load target high-water marks (correct).

---

## 3. Result-set bindings (Result Name → Variable)

| Result Name | Variable (package scope) |
|---|---|
| `f4801_jul` | `DateF4801` |
| `aastart_jul` | `aaStartF0015` *(rename to `JulianStart` later)* |
| `startdate_jul` | `startdatejul` |
| `f3106_jul` | `DateF3106` |
| `f3106_gr` | `DateF3106Gr` |
| `f4211_jul` | `DateF4211` |
| `f42119_jul` | `DateF42119` |
| `f4311_jul` | `DateF4311` |
| `f43121_jul` | `DateF43121` |
| `f43121_gr` | `DateF43121Gr` |

---

## 4. Rescope to **package** + sentinel defaults

Move these to package scope (so the one task writes them, any container reads),
set the listed default, and add Description **"computed at runtime by Compute
Load Dates — do not edit"**:

| Variable | Default | Type |
|---|---|---|
| `DateF3106`, `DateF4211`, `DateF42119`, `DateF4311`, `DateF43121`, `DateF4801`, `aaStartF0015`, `startdatejul` | `0` | (existing String) |
| `DateF3106Gr`, `DateF43121Gr` | `1900-01-01` | String |

---

## 5. Delete

**Query vars:** `qryF3106Date`, `qryf4211date`, `qryf42119date`, `qryF4311Date`,
`qryF4801Date`, `qryDateF43121`, `qryJulianStart`, `qryJulianStartDate` (dead).

**Tasks:** `F3106 Date`, `F4211 Date`, `F42119 Date`, `F4311 Date`, `F4801 Date`,
`F43121 Date`, `Set Julian Start Date`, **`Branch Date`** (only output unread).

**Dead vars:** `DateF4211Gr`, `DateF42119Gr`, `DateF4311Gr`, `branchdatejul`,
`minUKID`, `dateCardexDate`.

(VS validation at Build will flag any of these that turns out still-referenced —
restore that one if so.)

---

## 6. Fix `Min UKID` (qryMinUKID) — route inventory through `aaStartDateGr`

Replace the **three** hardcoded `'2022-01-01'` literals with the start date, and
drop the now-dead outputs (`minUKID`, `dateCardexDate` / `BatchDatejul`,
`StartDateJul` — `startdatejul` now comes from `Compute Load Dates`):
- batch-date floor `then '2022-01-01' ... when (max(gldgj))>getdate()` → `@[User::aaStartDateGr]`
- `@gregorian = '2022-01-01'` (StartDateJul) → **remove** (use `Compute Load Dates`)
- `ilcrdj >= '2022-01-01'` (maxUKID filter) → `@[User::aaStartDateGr]`

Keep its live outputs: `maxUKID`, `numBatch`/`minbatch`, `records → InitLoad`.
(Make `qryMinUKID` an expression that injects `@[User::aaStartDateGr]`, like §1.)

---

## 7. Branch / UOM (leave as-is)

`UOM Date` (`dtUOM` is read) stays — master-table (`F4102`) refresh, seed `NULL`,
not horizon-bounded. `Branch Date` is deleted (§5). These are *not* part of the
`aaStartDateGr` horizon by design.

---

## 8. Validate

1. **Build Solution** — catches any dangling reference from the deletes.
2. **Full reload test** — bootstrap + full load on Dev; diff the loaded row
   counts / max dates per table against a run of the old package to confirm parity
   (especially `F43121` 2-yr seed, `F42119` normalization, inventory floor now
   tracking `aaStartDateGr`).
