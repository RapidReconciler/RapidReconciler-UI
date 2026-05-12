# Plan: DMAAI integrity report as session "system context"

**Status:** Spec ready. Not yet implemented. Pick up in a fresh session.

**Source of this plan:** session-transcript discussion on 2026-05-12 (worktree
`claude/goofy-shamir-47329a`, commits ending at `e75725a`). The customer
confirmed the design and asked to defer the implementation to a future session.

---

## Goal

Let the Analysis Workbook Generator load a customer's DMAAI integrity report
(JDE Integrity Report 2) **once per browser session**, hold it in client-side
memory, and use it to produce a more prescriptive diagnosis when analyzing a
**Transaction Detail** export from the same customer.

Today the analyzer treats every export as standalone. The Transaction Detail
template's diagnoses point at AAIs by name (e.g. "credit AAI 3240 or 3260")
but cannot tell the user the actual GL account those AAIs resolve to, nor
whether the AAI is even configured at this customer. The DMAAI integrity
report contains exactly that information.

The Transaction Detail template is the only beneficiary of this feature for
now. The DMAAI integrity template (which analyzes the integrity report itself)
is unchanged.

---

## Concrete benefit on the field case

For doc 545031 IC at company 00002:

- Pattern 5.6 currently says "Step 3. Post a manual journal entry... debit
  inventory account, credit AAI 3260 (Planned Variance) or AAI 3240 (Material
  Variance)".
- With the integrity report loaded the analyzer can verify 3240 IV IS
  configured for company 00002 (4 rows in the customer's report) and can
  name the actual GL account it points at — so Step 3 becomes "credit GL
  account X.Y (the account configured for 3240 IV at company 00002 / GL
  class Z00)".
- The analyzer can also confidently state the symptom is a process-sequencing
  gap rather than a config gap (the canonical guide's diagnosis), instead of
  hedging.

---

## Design — Option A: per-session "system context" file

The DMAAI integrity report is uploaded **once per session** via a small input
area on the analyze workbook page. The parsed config is held in browser state
(in-memory `let` variable, mirrored to `sessionStorage` so a page reload during
the same session preserves it). All subsequent Transaction Detail analyses in
that session consume it.

If the user drops a Transaction Detail export and no DMAAI config has been
loaded yet, surface a one-time inline prompt: *"Want to load your DMAAI
integrity report so we can name the actual GL accounts? Optional — drop it
here."* — non-blocking; the analysis still runs without it.

The DMAAI config is per-customer. Sessions are short-lived (closed tab clears
the storage). No risk of one customer's config bleeding into another's
analysis unless the user explicitly mixes files in one session.

---

## Files to modify

- `Tools/analysis-workbook.html` — all the work lives here.
  - HTML: add a small "System DMAAI" upload control next to the existing file
    drop (or in a sidebar / collapsed panel — see UI notes below).
  - JS: new `SystemContext` module that handles upload → parse → store →
    lookup. Roughly 80–120 lines.
  - JS: `TransactionDetailTemplate.classify()` and `_howFor()` updated to
    consume `SystemContext` if loaded; degrade gracefully if not.
  - Reuse `DMAAITemplate.parse()` — it already turns an integrity report into
    structured rows. No new parsing code needed.

No other files touched. No new dependencies. No build step.

---

## SystemContext module — proposed shape

```js
const SystemContext = (function () {
  const KEY = 'rr-system-dmaai-v1';
  let state = null;  // { rows: [...], loadedAt: ISO, sourceFileName: string }

  function load() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {}
    return state;
  }

  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  async function importFromWorkbook(file) {
    const wb = await readXlsx(file);  // use existing ExcelJS path
    const parsed = DMAAITemplate.parse(wb);  // reuse existing parser
    state = {
      rows: parsed.rows,
      companies: parsed.companies,
      tables: parsed.tables,
      docTypes: parsed.docTypes,
      glClasses: parsed.glClasses,
      loadedAt: new Date().toISOString(),
      sourceFileName: file.name
    };
    save();
    return state;
  }

  function clear() {
    state = null;
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  function isLoaded() { return !!state; }
  function metadata() {
    if (!state) return null;
    return { loadedAt: state.loadedAt, sourceFileName: state.sourceFileName,
             rowCount: state.rows.length, companies: state.companies };
  }

  // The actual useful lookup: for a given (company, doc type, GL class) and
  // table number (e.g. '3240'), return the configured GL account (object + sub)
  // or null if not configured. Used by Pattern 5.6's resolution.
  function lookupAAI({ company, table, docType, glClass }) {
    if (!state) return null;
    return state.rows.find(r =>
      r.companynumber === company &&
      r.tablenumber.startsWith(table) &&  // table is like "3240.0"
      (!docType || r.doctype === docType) &&
      (!glClass || r.glclass === glClass || r.glclass === '****')
    ) || null;
  }

  load();  // hydrate on script load
  return { importFromWorkbook, clear, isLoaded, metadata, lookupAAI };
})();
```

**Storage size sanity check:** customer's report in this session was 1,945
rows, ~112KB raw xlsx, parsed rows would be maybe 200–300KB of JSON in
sessionStorage. Well within the 5MB sessionStorage limit. If a larger
customer hits the cap, fall back to in-memory-only (no persistence across
page reloads in that session) and log a warning.

---

## UI

Smallest viable UI: a compact "System DMAAI" indicator/button on the analyze
workbook page, sitting near the existing file drop zone or in the welcome
banner. Two states:

- **Not loaded:** *"Configure system DMAAI (optional) →"* — clicking opens a
  file picker. After upload, parse and switch to the loaded state.
- **Loaded:** *"System DMAAI: integrity_2023-12-31.xlsx · 1,945 rows · 2
  companies · loaded 5 min ago · Clear"* — clicking Clear drops state.

The label should not compete with the main drop zone. Subtle treatment —
same visual weight as the existing "Tour" button.

Also: when a user drops a Transaction Detail export and no DMAAI is loaded,
show a one-time **inline** suggestion in the result area (not a modal) —
*"Tip: load your DMAAI integrity report to get prescriptive GL-account names
in this analysis."* — dismissible. Use `sessionStorage` to remember dismissal
within the session.

---

## TransactionDetailTemplate integration

Pattern 5.6 is the highest-leverage starting point. Step 3 of the resolution
currently reads:

> "Post a manual journal entry to correct the historic posting on this
> document — debit *<inventory account>* (*<amount>*) for the standard-cost
> adjustment amount, and credit AAI 3260 (Planned Variance) or AAI 3240
> (Material Variance), per your cost-accounting team's convention for
> revaluation differences."

With SystemContext loaded:

1. `SystemContext.lookupAAI({ company: data.company, table: '3240',
   docType: 'IV', glClass: data.glclass })` — look up the configured GL
   account that 3240 resolves to for this customer / company / GL class.
2. If found: replace the generic "AAI 3260/3240" phrasing with the actual
   GL account number (object + sub).
3. If not found (genuinely missing AAI): change the diagnosis from
   "process-sequencing gap" to "configuration gap" — the AAI itself isn't
   configured, which is a different bug and warrants a different first step.

Patterns 5.1, 5.4, 5.5 are future enrichment candidates. Defer them.

---

## Implementation steps (in order)

1. **Add the `SystemContext` module** with `importFromWorkbook` / `clear` /
   `isLoaded` / `metadata` / `lookupAAI`. Hook the existing ExcelJS reader
   and reuse `DMAAITemplate.parse()`. Verify by uploading the customer's
   integrity report and confirming `lookupAAI({ company: '00002', table:
   '3240', docType: 'IV' })` returns a non-null row.

2. **Add the UI control** — small button in the welcome banner. Two states
   (not-loaded / loaded). Wire file picker → `importFromWorkbook` → re-render.

3. **Update Pattern 5.6 only** to consume SystemContext. The resolution text
   for Step 3 gets two branches: with-context (named GL account) and
   without-context (current text, unchanged). Keep `_howFor` clean by adding
   a small helper that builds Step 3 conditionally.

4. **Add the inline "tip" prompt** when a Transaction Detail is analyzed
   without SystemContext loaded. Dismissible.

5. **Browser-verify:** load the customer's `Integrity_2023-12-31_*.xlsx`,
   then drop the `Transaction Detail Analysis for 545031 IC.xlsx` source
   (re-export from the customer), and confirm Pattern 5.6 Step 3 now names
   a real GL account from the integrity report.

6. **Regression-check:** run a Transaction Detail with no SystemContext
   loaded and confirm Pattern 5.6 still produces the current text (no
   regression).

---

## Verification plan — concrete

Use the two existing files from the discussion:

- DMAAI integrity report: `Integrity_2023-12-31_20260512-2050.xlsx`
- Customer Transaction Detail source: regenerate from JDE for doc 545031 IC
  (the analyzer's *output* xlsx that we looked at — `Transaction Detail
  Analysis for 545031 IC.xlsx` — has both the analysis and the source as
  sheets, but the analyzer input is a fresh Transaction Detail xlsx from
  JDE).

Expected after wiring:

- `SystemContext.lookupAAI({ company: '00002', table: '3240', docType: 'IV' })`
  returns a row with non-null `aaiaccount` (or `object` field).
- Pattern 5.6 Step 3 in the rendered Analysis tab names the actual account
  instead of the generic AAI name.
- Page header on the analyze workbook surface shows "System DMAAI:
  Integrity_2023-12-31_20260512-2050.xlsx · 1,945 rows · 2 companies".

---

## Out of scope (deliberately)

- Caching across browser sessions. Per-session only; closed tab clears.
- Cross-customer detection. We trust the user to load the right config for
  the right customer.
- Validation that the loaded report is fresh / current. The UI shows the
  load timestamp; that's the user's responsibility.
- Enriching Patterns 5.1, 5.4, 5.5, 5.11 with SystemContext. Land 5.6 first,
  see what works, then extend.

---

## Estimated effort

- Steps 1+2 (SystemContext + UI): 25–35 minutes
- Step 3 (Pattern 5.6 integration): 10–15 minutes
- Step 4 (inline tip): 5–10 minutes
- Steps 5+6 (verify + regression): 10–15 minutes

Total ≈ **50–75 minutes** of focused implementation in a fresh session, plus
whatever back-and-forth on the UI details.

---

## How to resume

In a new session, ask Claude to read this file and execute the plan. Example
prompt:

> "Pick up the plan at docs/plans/dmaai-system-context.md and implement
> it. Start with step 1 (SystemContext module) and verify it loads my
> Integrity_2023-12-31_20260512-2050.xlsx correctly before moving on."

The plan is self-contained — no need to re-derive the design.
