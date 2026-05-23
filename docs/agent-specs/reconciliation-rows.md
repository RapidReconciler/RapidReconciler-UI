# Reconciliation rows endpoint

| Field | Value |
|---|---|
| **Status** | Ready to implement |
| **Endpoint** | `POST /inventory/reconciliation/rows` (+ `/in-transit` and `/po-receipts` siblings) |
| **Controller** | `ReconciliationController` (new method on existing controller) |
| **Repository** | `AccountSummaryRepository.findAll(...)` &mdash; **already exists in the jar** |
| **Sproc** | `usp6GetRInvAccountSummary` &mdash; already deployed in `RapidReconciler_Dev`, captured at [`RRV8/sprocs/usp6getrinvaccountsummary.sql`](../../RRV8/sprocs/usp6getrinvaccountsummary.sql) |
| **View** | `v6ui_raccountsummary` &mdash; already deployed, captured at [`RRV8/views/v6ui_raccountsummary.sql`](../../RRV8/views/v6ui_raccountsummary.sql) |

## Use case

The Reconciliation page&rsquo;s &ldquo;Variance contributors&rdquo;
card breaks the period&rsquo;s OOB down by Business Unit, Account,
and Subsidiary. The current `POST /inventory/reconciliation-filtered`
returns SUMMARY ONLY &mdash; one valuation block, one variance block,
no per-tuple rows &mdash; so the contributors card has no per-
dimension data to render. V8 today falls back to a single-row
synthesis that yields meaningless single bars; the card surfaces an
empty state pointing at this spec.

Once this endpoint ships, V8&rsquo;s contributors card paints real
bars with no client change &mdash; the wiring (parallel `rrFetch`
+ row-aware fast path in `adaptLegacyResponse`) is already in place.

## Request DTO

**Reuse the existing `ReconciliationRequest`.** No new request type
is needed. Same `period` + Item-wrapped filter arrays the existing
`inventoryReconciliationFiltered(...)` method takes:

```java
public class ReconciliationRequest {
    private String period;                       // ISO YYYY-MM-DD
    private List<Item> currencies;
    private List<Item> companies;
    private List<Item> objects;
    private List<Item> businessUnits;
    private List<Item> subsidiaries;
    private int pieLevel;                        // unused for rows; ignore
    // ... existing getters / setters
}
```

The Item shape (`{id, checked, show}`) is the same the existing
filtered endpoint expects. **Bare string arrays would 400** &mdash;
keep the wrap.

## Response DTO

New POJO. Lombok or plain getters/setters &mdash; match the rest of
the controller&rsquo;s response classes.

```java
package coral.rapidreconciler.client.services.controller;

import java.util.List;
import java.util.Map;

public class ReconciliationRowsResponse {
    private List<Map<String, Object>> rows;

    public ReconciliationRowsResponse() {}

    public ReconciliationRowsResponse(List<Map<String, Object>> rows) {
        this.rows = rows;
    }

    public List<Map<String, Object>> getRows()              { return rows; }
    public void setRows(List<Map<String, Object>> rows)     { this.rows = rows; }
}
```

`Map<String, Object>` matches what `AccountSummaryRepository.findAll`
already returns &mdash; Jackson serializes column names as JSON keys.
Column names from `v6ui_raccountsummary` should already match what
V8 expects (`period, companyNumber, businessUnit, object, subsidiary,
currency, longAccount, shortAccount, glBalance, perpetualBalance,
outOfBalance` plus the variance components). If the view emits
PascalCase or flat-variance columns, the cheapest fix is to patch
the view&rsquo;s SELECT aliases &mdash; V8&rsquo;s
`adaptLegacyResponse` row mapper expects the camelCase shape.

## Controller method

Add to `coral.rapidreconciler.client.services.controller.ReconciliationController`:

```java
@Autowired
private AccountSummaryRepository accountSummaryRepository;

@Autowired
private UserRequest userRequest;            // already injected on this controller

@RequestMapping(value = "/inventory/reconciliation/rows", method = RequestMethod.POST)
public ReconciliationRowsResponse inventoryReconciliationRows(
        @RequestBody ReconciliationRequest req) throws Exception {
    ReconciliationFilter filter = toFilter(req);
    List<Map<String, Object>> rows =
        accountSummaryRepository.findAll(userRequest, filter, Tab.INVENTORY);
    return new ReconciliationRowsResponse(rows);
}

@RequestMapping(value = "/in-transit/reconciliation/rows", method = RequestMethod.POST)
public ReconciliationRowsResponse inTransitReconciliationRows(
        @RequestBody ReconciliationRequest req) throws Exception {
    ReconciliationFilter filter = toFilter(req);
    List<Map<String, Object>> rows =
        accountSummaryRepository.findAll(userRequest, filter, Tab.IN_TRANSIT);
    return new ReconciliationRowsResponse(rows);
}

@RequestMapping(value = "/po-receipts/reconciliation/rows", method = RequestMethod.POST)
public ReconciliationRowsResponse poReceiptsReconciliationRows(
        @RequestBody ReconciliationRequest req) throws Exception {
    ReconciliationFilter filter = toFilter(req);
    List<Map<String, Object>> rows =
        accountSummaryRepository.findAll(userRequest, filter, Tab.PO_RECEIPTS);
    return new ReconciliationRowsResponse(rows);
}

// Helper — already exists if the existing reconciliation methods
// use a similar conversion. If not, this is the same pattern:
private ReconciliationFilter toFilter(ReconciliationRequest req) {
    ReconciliationFilter f = new ReconciliationFilter();
    f.setPeriod(req.getPeriod());
    f.setCurrencies(toIds(req.getCurrencies()));
    f.setCompanies(toIds(req.getCompanies()));
    f.setBusinessUnits(toIds(req.getBusinessUnits()));
    f.setObjects(toIds(req.getObjects()));
    f.setSubsidiaries(toIds(req.getSubsidiaries()));
    return f;
}

private List<String> toIds(List<Item> items) {
    if (items == null) return Collections.emptyList();
    return items.stream()
        .filter(i -> i.isChecked())   // honor the {id, checked, show} narrowing
        .map(Item::getId)
        .collect(Collectors.toList());
}
```

If `ReconciliationService` (already injected on this controller as
`reconciliationService`) has an existing filter-conversion helper,
prefer that over the local `toFilter` &mdash; same shape, less
duplication.

## Data dependencies

- **Repository**: `AccountSummaryRepository` (already injected
  elsewhere; `@Autowired` on the new method&rsquo;s controller).
  Method signature: `findAll(UserRequest, ReconciliationFilter, Tab)
  → List<Map<String, Object>>`.
- **Sproc**: `dbo.usp6GetRInvAccountSummary`. Thin wrapper around
  `dbo.usp6getfilteredview` with `@viewname = 'v6ui_raccountsummary'`.
- **View**: `dbo.v6ui_raccountsummary`. One row per (period, company,
  businessUnit, object, subsidiary, currency) tuple.
- **No new SQL is required** &mdash; same chain that already powers
  `data/reconciliation.json`. If the JSON serialization yields the
  wrong key casing, patch the view&rsquo;s SELECT aliases rather
  than adding a Java-side mapper (keeps the response light and
  matches the rest of the agent&rsquo;s pattern).

## Auth & scope

- `userRequest` is the JWT-scoped request bean already injected on
  every controller. The repository&rsquo;s `findAll(userRequest, ...)`
  uses it to scope the result set to the user&rsquo;s allowed
  companies (`dbs[i].i` in the JWT payload). Client never has to
  repeat that constraint.
- `Tab.INVENTORY / IN_TRANSIT / PO_RECEIPTS` selects the underlying
  view variant. Same pattern as the existing
  `inventoryReconciliation(...)` vs `inTransitReconciliation(...)`
  methods.

## V8 wiring (already shipped)

[`inventory-reconciliation.html`](../../RRV8/inventory-reconciliation.html)
in `loadData()` fires two `rrFetch` calls in parallel:

```js
const [legacy, rowsResp] = await Promise.all([
  rrFetch('inventory/reconciliation-filtered', { method: 'POST', body: body }),
  rrFetch('inventory/reconciliation/rows',     { method: 'POST', body: body })
    .catch(err => { console.info('[recon] rows endpoint not yet available:', err && err.message); return null; })
]);
if (rowsResp && (Array.isArray(rowsResp.rows) || Array.isArray(rowsResp.data) || Array.isArray(rowsResp))) {
  legacy.rows = Array.isArray(rowsResp) ? rowsResp
    : (Array.isArray(rowsResp.rows) ? rowsResp.rows : rowsResp.data);
}
currentData = adaptLegacyResponse(legacy, period);
```

`adaptLegacyResponse` already has a row-aware fast path
(`if (legacy && Array.isArray(legacy.rows) && legacy.rows.length > 0)`)
that flips `_hasRowLevelData: true` on the result, which in turn
makes the contributors card&rsquo;s empty-state branch skip
itself and render real bars. No client change needed after the
agent ships this endpoint.

Fallback when the endpoint 404s: V8&rsquo;s
`.catch` returns `null`, `legacy.rows` stays unset, and
`adaptLegacyResponse` falls through to the existing single-row
synthesis path. The contributors card surfaces its &ldquo;needs
row-level data&rdquo; empty state. This is the current behavior.

## Testing

- Hit the new endpoint with the same body the existing
  `/inventory/reconciliation-filtered` test cases use; verify row
  count matches `SELECT COUNT(*) FROM v6ui_raccountsummary WHERE …`
  for the same period + filter scope.
- Compare a sample row against `RRV8/data/reconciliation.json#accountRows`
  &mdash; field names, signs, and types should match exactly so V8
  picks up the response with no client-side mapper.
- Sanity-check the JWT scoping: a user whose `dbs[i].i` is restricted
  to a single company should never see rows from companies outside
  that list, even if the request body asked for them.

## Demo reference

[`RRV8/data/reconciliation.json`](../../RRV8/data/reconciliation.json)
&mdash; 195 rows across 13 periods for the captured test instance.
That file was generated from the same sproc this endpoint will call,
so the response shape should match field-for-field.

## Out of scope for this spec

- **Paging**: V8 takes the full row set per filter scope. The
  cardinality is bounded by `period × company × BU × account ×
  subsidiary × currency`, not transaction volume, so the response
  stays small even on large installs. If a customer turns out to
  have a tuple explosion (10k+ rows per period), revisit with a
  paging story.
- **Streaming / SSE**: not needed at this row volume.
- **`AccountSummaryRepository.findAll` internals**: existing
  implementation. If a performance issue surfaces, it&rsquo;s the
  sproc&rsquo;s problem, not this controller&rsquo;s.
