# Transaction Variance deep audit protocol

## What this is

The ordered checks to run when someone asks for a deep audit of Transaction
Variance. Each step gives the command, what a pass looks like, and the defect it
exists to catch.

It is not an audit record. Two of those already exist and are referenced from
steps 7 and 8 rather than repeated here.

## Why it exists

The same defect shapes kept reaching the analyst, one card at a time. Every check
below is here because it shipped broken, not because it seemed prudent. Where a
step carries a measurement, that measurement is real and dated, so a later run can
tell whether the thing regressed or was never fixed.

A note on order. Steps 0 through 5 are ordered by how badly each one has misled an
investigation, not by cost. Freshness is first because a stale page invalidates
every result that follows it, and the day that cost was the day this document was
written.

## Step 0. Freshness

Prove the browser is running current code before believing any browser result.

```
document.documentElement.innerHTML.indexOf('<a known marker from your edit>') > -1
```

Paste that in the browser console, not PowerShell. It must print `true`.

**The defect.** A cached page cost most of a session. The server was serving the
corrected file, every check against the server passed, and the browser was running
the previous copy. Worse, the staleness was partial: a freshly fetched
`sidebar.js` rendered new text over old HTML, which reads as "the page updated"
and hides the problem.

`.claude/serve.ps1` now sends `Cache-Control: no-store`, so this should not recur
on the dev server. It is still step 0, because the failure is silent and it
invalidates everything after it. Note that file is untracked, so a fresh clone
does not have the fix.

## Step 1. Data widths

Compare every text column's declared width against the longest value actually in
it, then compare the sprocs' temp tables and declared variables against those
sources.

The query is in the appendix. It reports declared and longest per column.

**Pass.** No temp-table column or declared variable is narrower than the source it
is populated from.

**The defect.** `usp6compare2` declared `#outputtable.Comment VARCHAR(50)` and
`SubType VARCHAR(18)` against sources of `nvarchar(100)` and `nvarchar(30)`.
Measured on `RapidReconciler_Demo3` on 2026-08-12: comment reached 97 characters
with 2,047 rows over 50, subtype reached 24 with 1,889 rows over 18. Every
document that overflowed threw `String or binary data would be truncated` and
returned nothing.

**Two traps inside this step.**

A variable assignment truncates in silence. `declare @x nvarchar(50) = (select
...)` raises nothing and hands back a clipped string, so grep declarations as well
as table definitions. The header comment on this procedure had been clipped for
an unknown length of time with no symptom.

The source is not always the table you expect. DMAAI routing lives in
`RAccountInstr` and `RAccountInstrExp`, not the `F4095` extract, and those two
split by side: `RAccountInstr` holds zero rows for 4220 because 4220 is the
expense side. Reading one table and concluding is how a card came to assert
something the data did not support.

## Step 2. Error paths and masking

Force each failure mode and read what the analyst is actually told.

**Pass.** Every message names a cause the code can know, and suggests a remedy
that can work.

After Agent #104, the three codes mean one thing each:

| Code | Meaning |
|---|---|
| 401 | a token was sent and rejected |
| 403 | no `Authorization: Bearer` header reached the agent |
| 500 | the handler threw |

**The defect.** Before #104, `/error` was not in the agent's `permitAll` list. An
uncaught exception forwards to `/error` as a fresh dispatch carrying no
authentication, so the chain denied it and returned 403. A SQL truncation reached
the analyst as "your session is not authenticated for this database, sign out and
sign in again." That advice could never work, and it was followed twice before
anyone doubted it.

**The 30 second test that settles an auth-looking failure.** Send the same request
body with an explicit `Authorization` header, once for input that works and once
for input that fails. If a valid token returns 200 for one and 403 for the other,
it is not authentication. Diff the inputs, not the transport.

## Step 3. Producer and consumer coverage

For every shared helper, enumerate its call sites, then confirm the verification
instrument covers all of them.

```bash
grep -rn "_txAnnotateHeaderCells(" RRV8/
```

**Pass.** Every call site is exercised by whatever proves the helper works.

**The defect.** UI-91 verified header-cell definitions by intercepting
`XLSX.writeFile` and reported 29 of 29. The Transaction Details path calls
`XLSX.write` to an ArrayBuffer for the analyzer handoff and never trips a
`writeFile` interceptor, so a live `ReferenceError: cols is not defined` shipped
and broke that export for everyone. The verification was structurally incapable of
seeing the broken call site.

Grep the helper, not the API. An interceptor on one API proves nothing about a
path that uses a different one.

## Step 4. The reporting sink

For every message the code can produce, prove it reaches the screen.

**Pass.** The message renders. Not that it is generated, that it renders.

**The defect.** `export-guard.js` computes why an export failed but does not own
presentation: it reports through whatever function the page passes.
`inventory-transactions.html` passed `flashStatus`, which was a `console.log` stub
with no element behind it. The guard composed the correct, actionable reason on
every click and printed it where no analyst would look, on success as well as
failure. The button appeared dead in both directions.

Current sinks are recorded in the `reference_export_status_sink` memory. Two traps
live there: caching the element at definition time when the element is declared
later in the document caches `null` forever, and `textContent` renders `&mdash;`
literally because the guard emits HTML entities.

## Step 5. Scope matrix

A defect can be invisible in one scope and fatal in another.

Cover, at minimum: each demo database, a single company, all companies, the
drill-in URL with its parameters, and **more than one document per card**.

```
?company=<co>&card=<CODE>&period=<YYYY-MM-DD>&expect=1
```

**Pass.** The behaviour holds across the matrix, not just on the first row.

**The defect.** The export failure reproduced only on a drill-in URL, on one
document, while the plain grid page worked. Testing swept 51 rows on a different
document and all 51 passed, which proved nothing about the failing one. A single
passing document is not evidence.

## Step 6. One producer per figure

Any figure shown twice must be computed once.

**Pass.** No hand-written constant sits beside a computed table describing the
same thing.

**The defect.** The Variance Analyzer chip led with the card name while the table
underneath showed an account mismatch. Two different findings on one line, and the
one in the label was the one nothing on screen demonstrated. Earlier, a chip read
"the DMAAI pair nets to zero" above a table reporting an account mismatch, from a
constant held in the card catalog.

The rule generalises: a panel may say only what its own table proves.

## Step 7. Numbers chain (delegated)

Run the chain in `docs/plans/txv-card-tie-out-audit.md`: conservation, exclusivity
and double counting, completeness, and the roll-forward tie. Do not re-derive it,
run it.

Standing rules that override intuition while doing so. `RCardexLedgerCompare2
WHERE recstatus = 1` is the population. Zero rows in a derived table means not
loaded, never not configured, and name the table you measured. The cardex to GL
match key differs per transaction type. Never scope a tie-out through a derived
table.

## Step 8. Claims and assertions (delegated)

```bash
python Tools/check_txv_cards.py
```

**Pass.** Exit 0. `WARN` is acceptable, `FAIL` is not.

This gate now covers two contracts. Cards may only cite assertions the classifier
actually makes, per `docs/plans/txv-claim-assertion-audit.md`. And card copy must
match `Tools/txv-card-copy-standard.json`, which is the single source of truth for
format and is cross-checked against the renderer and the AI prompt so they cannot
drift apart.

21 cards are baselined and produce warnings rather than failures. That is a
backlog, not a pass.

## What this protocol does not cover

**Whether a bullet is a fact or a method note.** This is the distinction that
mattered most, and no gate can see it. The word limit and the banned-phrase list
approximate it. A human still reads the card.

**Whether the finding is correct.** The gate checks that a claim cites an
assertion, not that the assertion is true of these rows.

**Performance, layout and accessibility.** Out of scope here.

**Anything the analyzer does after handoff.** The headless analyzer times out on
larger documents and hands over the raw workbook without the Analysis tab. Known,
open, not covered by any step above.

## Appendix. Copy-paste commands

sqlcmd, with a script path containing no spaces. Read-only queries only. No
writes, no B to C, no reload, no deploys.

```bash
"C:/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd.exe" -S localhost,1433 -U rruser -P rruser -C -h -1 -W -b -d RapidReconciler_Demo3 -i "C:\rrtmp\w1.sql"
```

Step 1, declared width against longest actual value. Tested on Demo3 on
2026-08-12, where it returns `Comment declared=100 longest=97` and `SubType
declared=30 longest=24`. Add table names to the `IN` list to widen the sweep, and
lower the final threshold to see every column.

```sql
SET NOCOUNT ON;
DECLARE @sql nvarchar(max) = N'';
SELECT @sql = @sql + N'SELECT ''' + t.name + N''' AS tbl, ''' + c.name + N''' AS col, '
    + CAST(CASE WHEN ty.name LIKE N'n%' THEN c.max_length/2 ELSE c.max_length END AS nvarchar(10))
    + N' AS declared, MAX(LEN(' + QUOTENAME(c.name) + N')) AS longest FROM ' + QUOTENAME(t.name)
    + N' UNION ALL '
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types  ty ON ty.user_type_id = c.user_type_id
WHERE t.name IN (N'RCardexLedgerCompare2')
  AND ty.name IN (N'varchar', N'nvarchar', N'char', N'nchar')
  AND c.max_length > 0;
SET @sql = LEFT(@sql, LEN(@sql) - 10);
CREATE TABLE #w (tbl sysname, col sysname, declared int, longest int);
INSERT #w EXEC sp_executesql @sql;
SELECT tbl + '.' + col + '  declared=' + CAST(declared AS varchar(10))
     + '  longest=' + CAST(ISNULL(longest,0) AS varchar(10))
FROM #w WHERE ISNULL(longest,0) > 18 ORDER BY longest DESC;
```

Step 1, the narrow declarations to compare against it.

```bash
grep -rnE "(VARCHAR|NVARCHAR)\s*\(\s*[0-9]{1,2}\s*\)" "RapidReconciler/dbo/Stored Procedures/"
```

Step 3, call sites of a helper.

```bash
grep -rn "<helperName>(" RRV8/
```

Step 8, both card contracts.

```bash
python Tools/check_txv_cards.py
```

Parse check before believing any edit landed. There is no node on this box.

```bash
python Tools/parsecheck.py "C:/source/repos/RapidReconciler-AI/RRV8/inventory-transactions.html"
```

## Related

`docs/plans/txv-card-copy-standard.md` explains the format standard and where its
values live. `docs/plans/txv-card-tie-out-audit.md` and
`docs/plans/txv-claim-assertion-audit.md` are the two delegated chains.
