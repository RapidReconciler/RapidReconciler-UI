# DMAAIs page &mdash; analyzer worklist + response table

The DMAAIs page is the V8 surface for the **DMAAI Entry Integrity
analyzer worklist** (see `AnalysisGuides/dmaai-analysis.md`). The
analyzer reads JDE F4095 (integrity report 0), classifies issues,
and emits a workbook. V8 reads that workbook&rsquo;s structured
output and lets the analyst answer the worklist&rsquo;s questions;
answers persist to SQL.

This document is the **canonical spec** for the SQL table side + the
JSON contract V8 consumes. The agent dev can build the table + the
endpoints from this without waiting on V8 testing.

This is a **rewrite** of an earlier version that specced a
worked/note overlay table mirroring the transactions pattern. That
model didn&rsquo;t fit &mdash; DMAAI work isn&rsquo;t row-level
&ldquo;mark this done,&rdquo; it&rsquo;s finding-level &ldquo;answer
this question.&rdquo; The analyzer worklist is the actual unit of
work.

---

## 1. The workflow at a glance

1. Analyst (or scheduled job) runs the DMAAI analyzer against an
   F4095 export. Output: `JDE DMAAIs Analysis {YYYY-MM-DD}.xlsx`
   plus a JSON sidecar (see Section 4).
2. JSON sidecar gets posted to a known location (demo:
   `RRV8/data/dmaai-analysis-latest.json`; prod: agent endpoint
   serves it).
3. V8 fetches the JSON, renders the worklist tables + module tabs.
4. Analyst works through the worklist, setting **Answer** /
   **Decision** / **Status** per finding.
5. Each change persists to `dbo.RIntegrityDMAAIResponse` via
   `POST /inventory/integrity/aai-save-responses` (PROD-TODO).
6. Re-running the analyzer carries forward the prior responses
   (analyzer reads the SQL table, joins by finding identity).

V8 only shows the **latest run** &mdash; no history picker. History
lives in the analyzer&rsquo;s back-catalog of xlsx files + the SQL
table&rsquo;s `AnalysisRunId` audit trail.

---

## 2. Finding identity

Findings have two kinds of ID:

- **`FindingId`** &mdash; sequence-stable label assigned by the
  analyzer (e.g. `F1` for the first FIX FIRST item, `Q14` for the
  14th customer question). Used as a display label and as part of
  the response-table PK.
- **Semantic identity** &mdash; the tuple that uniquely identifies
  what the finding is about, independent of run order:
  `(IssueType, Company, Scope, GLClass)` where:
    - `IssueType` is one of the analyzer&rsquo;s detected pattern
      codes (`nz`, `glsub`, `mc`, `unrec`, `dup`, ...).
    - `Company` is the JDE company number (or empty for
      non-company-scoped findings).
    - `Scope` is the AAI pair or table (`4240-4220`, `4230`,
      `4900`, ...).
    - `GLClass` is the GL class code (or empty when N/A).

The analyzer&rsquo;s carry-forward step uses **semantic identity**
to match prior-run responses to current-run findings. F# / Q#
numbers can shift between runs as new findings appear or old ones
disappear, but a `(nz, 00001, 4240-4220, null)` finding in run N+1
matches the same semantic identity in run N.

---

## 3. SQL table

```sql
CREATE TABLE dbo.RIntegrityDMAAIResponse (
  AnalysisRunId    datetime2     NOT NULL,           -- ISO timestamp of the run
  FindingId        nvarchar(10)  NOT NULL,           -- "F1", "Q14", etc.
  IssueType        nvarchar(20)  NOT NULL,           -- semantic id part 1
  Company          nvarchar(10)  NULL,               -- semantic id part 2 (nullable for cross-company)
  Scope            nvarchar(20)  NULL,               -- semantic id part 3
  GLClass          nvarchar(10)  NULL,               -- semantic id part 4
  Answer           nvarchar(20)  NULL,               -- 'Intended' | 'Needs review' | 'Fixed' | null
  Decision         nvarchar(3000) NULL,              -- free text
  Status           nvarchar(20)  NOT NULL CONSTRAINT DF_RIntegrityDMAAIResponse_Status DEFAULT 'Open',
  LastModifiedBy   nvarchar(50)  NOT NULL,
  LastModifiedDate datetime2     NOT NULL,
  CONSTRAINT PK_RIntegrityDMAAIResponse PRIMARY KEY CLUSTERED (AnalysisRunId, FindingId)
);

-- Index for carry-forward join from prior run to current run.
CREATE NONCLUSTERED INDEX IX_RIntegrityDMAAIResponse_Semantic
  ON dbo.RIntegrityDMAAIResponse (IssueType, Company, Scope, GLClass, AnalysisRunId DESC);
```

**Why `(AnalysisRunId, FindingId)` as PK**: every run gets its own
row set. Carry-forward is a LEFT JOIN on semantic identity, copying
the most recent prior Answer/Decision/Status into the new run&rsquo;s
row. F# / Q# don&rsquo;t need to be unique across runs.

**Why semantic columns are also on the response row** (not just on
the finding): cheaper carry-forward index lookup. The analyzer
doesn&rsquo;t need to join through a separate finding table to find
the match.

**Status values**:

- `Open` &mdash; default. No Answer set yet.
- `In Progress` &mdash; Answer = 'Needs review'.
- `Resolved` &mdash; Answer = 'Fixed'. Re-runs check whether the
  finding still surfaces; if yes, the analyzer flips Status to
  `Still Flagged` per the worklist&rsquo;s &ldquo;your fix
  didn&rsquo;t stick&rdquo; logic.
- `Closed by intent` &mdash; Answer = 'Intended'. Persists across
  runs; analyzer skips re-flagging.
- `Still Flagged` &mdash; previously Resolved, but reappeared.

Derivable from `Answer` for the common cases, but stored explicitly
so the carry-forward logic + reporting queries don&rsquo;t have to
recompute it.

---

## 4. JSON sidecar shape

V8 consumes a single JSON file produced alongside the analyzer
xlsx. Lives at `RRV8/data/dmaai-analysis-latest.json` in demo;
agent serves the same shape from
`GET /inventory/integrity/aai-analysis-latest` in prod (PROD-TODO).

```jsonc
{
  "_meta": {
    "title":         "JDE DMAAI's — Configuration Audit Worklist",
    "subline":       "2,814 F4095 rows · 68 flagged across 3 patterns",
    "source":        "JDE F4095 (Distribution AAIs) export",
    "analysisDate":  "2026-05-22",
    "runId":         "2026-05-22T17:16:00",
    "totalRows":     2814,
    "flaggedCount":  68,
    "patternsCount": 3,
    "caveat":        "This program analyzes data based on predetermined patterns..."
  },
  "fixFirst": [
    {
      "id":         "F1",
      "issueType":  "nz",
      "company":    "00001",
      "scope":      "4240-4220",
      "glClass":    null,
      "module":     "Sales",
      "task":       "AAIs 4240 (Dr) and 4220 (Cr) both route to the same Object account on 20 configurations...",
      "docTypes":   "C1, C2, CO  (+ 7 more)",
      "glClasses":  "****, N10, N40  (+ 4 more)",
      "reference":  "Sales tab → find AAIs 4240/4220"
    }
    /* ... */
  ],
  "askCustomer": [
    {
      "id":         "Q1",
      "issueType":  "glsub",
      "company":    "00001",
      "scope":      "4230",
      "glClass":    "P10",
      "module":     "Sales",
      "task":       "AAI 4230 · GL class P10: subsidiary '(blank)' is used on 8 of 9 F4095 rows...",
      "docTypes":   "C1, C2, CO  (+ 6 more)",
      "glClasses":  "P10",
      "reference":  "JDE Data tab → filter Co=00001, AAI=4230, GL=P10"
    }
    /* ... */
  ],
  "ignoreBlurb": "Some AAIs are not configured for every GL class on every company...",
  "modules": {
    "Sales":         [ /* F4095 rows scoped to 4220 / 4230 / 4240 */ ],
    "Inventory":     [ /* 4122 / 4124 / 4134 / 4136 / 4162 / 4172 */ ],
    "Manufacturing": [ /* 3110 / 3130 */ ],
    "Purchasing":    [ /* 4126 / 4128 / 4310 / 4365 / 4385 / 4400 */ ]
  }
}
```

Module rows carry the F4095 source shape verbatim (CompanyNumber,
TableNumber, DocType, GLClass, AAIAccount, ModelAccount, Comment,
FlexBu, FlexSub, LongAccount). V8 displays them in a grid scoped to
that tab.

---

## 5. Endpoints (deferred)

Per the workflow-first principle, the agent endpoints get pinned
down **after** V8 testing flushes out exact bodies / responses.
Expected shape (best guess for the agent dev to start scaffolding):

| Method | Path | Purpose |
|---|---|---|
| GET  | `/inventory/integrity/aai-analysis-latest` | Returns the latest analysis JSON sidecar. |
| POST | `/inventory/integrity/aai-save-responses`  | Persists analyst answers. Body: `{ analysisRunId, responses: [DmaaiResponse, ...] }`. |
| GET  | `/inventory/integrity/aai-run-list`        | Optional. Returns prior run IDs for an admin history view. V1 of V8 doesn&rsquo;t use this. |

**DTO field naming**: camelCase first-letter-lowercase (Jackson
gotcha is recurring; see `reference_rr_agent_jar.md`). Specifically:

| Java field         | JSON key           | Column           |
|--------------------|--------------------|------------------|
| `analysisRunId`    | `analysisRunId`    | `AnalysisRunId`  |
| `findingId`        | `findingId`        | `FindingId`      |
| `issueType`        | `issueType`        | `IssueType`      |
| `company`          | `company`          | `Company`        |
| `scope`            | `scope`            | `Scope`          |
| `glClass`          | `glClass`          | `GLClass`        |
| `answer`           | `answer`           | `Answer`         |
| `decision`         | `decision`         | `Decision`       |
| `status`           | `status`           | `Status`         |
| `lastModifiedBy`   | `lastModifiedBy`   | `LastModifiedBy` |
| `lastModifiedDate` | `lastModifiedDate` | `LastModifiedDate` |

---

## 6. Build sequence for V8 (the next session)

The current `accounting-dmaais.html` is a **placeholder** &mdash; a
universe-view grid with a worked/note model from an earlier design
direction we&rsquo;ve since abandoned. The next session rebuilds it
as the analyzer worklist:

1. **Extract demo JSON** from the sample workbook
   (`JDE DMAAIs Analysis 2026-05-22.xlsx` in the owner&rsquo;s
   Downloads). Build `RRV8/scripts/extract-dmaai-analysis.py` and
   commit the resulting `RRV8/data/dmaai-analysis-latest.json`.
2. **Strip the placeholder grid** from `accounting-dmaais.html`.
   Keep the V8 chrome (topbar, sidebar, page header).
3. **Pill tab nav** for the five views: Analysis / Sales /
   Inventory / Manufacturing / Purchasing. Single component, new
   CSS pattern. Default open: Analysis.
4. **Headline strip** under the page header: title + subline +
   secondary context (source / date / total rows) + caveat callout.
5. **Analysis tab**: two worklist tables (FIX FIRST + ASK THE
   CUSTOMER) + IGNORE FOR NOW explainer block. Each row has the
   columns from the spec + inline `Answer` dropdown
   (Intended / Needs review / Fixed) + `Decision` text input + a
   `Status` pill.
6. **Module tabs**: V8 grid (search / sort / column chooser / drag
   reorder / Excel export) showing F4095 rows scoped to that
   module&rsquo;s AAI tables.
7. **Local response state**: `_dmaaiResponses` map keyed by
   `findingId` → `{answer, decision, status}`. Optimistic update on
   each change.
8. **Save**: PROD-TODO POST to
   `/inventory/integrity/aai-save-responses`. Demo persists locally
   to `RRV8/data/dmaai-responses.json` so the round-trip simulates
   the SQL store.

---

## 7. Where this came from

- 2026-05-22 session. Initial direction was a worked/note overlay
  pattern; redirected to the analyzer worklist model after the owner
  shared `AnalysisGuides/dmaai-analysis.md` and the sample analyzer
  output workbook.
- See also: `AnalysisGuides/dmaai-analysis.md` (the analyzer
  process), `ExelFormattingSpec/excel-output-formatting-spec.md`
  (the workbook formatting spec).
