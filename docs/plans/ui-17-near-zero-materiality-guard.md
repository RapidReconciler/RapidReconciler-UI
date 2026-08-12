# UI-17 — Near-zero / dormant materiality guard (proposal)

**Delivered 2026-07-06 (autonomous analysis). No code changed — floors are an
accounting call, flagged below for owner sign-off. Logic edits are solo-doable
once the floors are confirmed.**

## The defect (confirmed in code)

`home.html` `wlOverview(c)` (~L8627) builds the deterministic materiality read:

```js
var bal = Math.abs(c.glBal || 0), oob = Math.abs(c.oob || 0);
var pct = bal > 0 ? (oob / bal) * 100 : 0;
var mat = pct < 1 ? 'immaterial' : 'modest but not trivial';
var sit = _ccyAmt(c.ccy, c.oob) + ' out of balance — ' + pctStr + ' of the ' + _ccyAmt(c.ccy, c.glBal) + ' GL balance, ' + mat + '.';
```

**Trigger — Northwind Aggregates LLC (NA, Co 00901):** GL ≈ $0, Inventory ≈ $0, a **$3**
gap. `pct = 3 / ~0 * 100` → reads **"100.0% of the GL balance ... modest but not
trivial."** A trivial $3 reads as an alarming 100%. Compounding it, `wlUnit(c)`
(~L8661) picks `K` and every figure rounds to **$0.0K**, so the card looks empty
while the AI shouts 100%.

Two independent bugs:
1. **% degenerates when the balance ≈ 0** — a percentage of near-zero is meaningless.
2. **K-rounding hides the actual small $** — a near-zero card should show `$3`, not `$0.0K`.

The same misframing feeds the live AI: `_wlCauseFacts(c, exposure)` (~L8438) and the
company prompt pass the balance/oob, so the model can echo "100% of GL balance."

## Proposed floors (ACCOUNTING CALL — owner to confirm the numbers)

| Constant | Meaning | Proposed value | Rationale |
|---|---|---|---|
| `MAT_OOB_FLOOR` | Absolute out-of-balance below which it's immaterial **regardless of %** | **$100** | A $3–$50 inventory gap is trivial; suppress the % entirely. |
| `DORMANT_GL_FLOOR` | GL balance below which the account is "dormant / near-zero" and the % is misleading | **$1,000** | Below this, `oob/bal` produces alarming percentages from noise. |

(Currency note: floors are $-denominated; for GBP/other companies apply the same
numeric floor in that currency, or convert — owner's call. Simplest: same number.)

## Proposed logic change (apply after floors confirmed)

In `wlOverview`, before computing `pct`, add the guard:

```js
var bal = Math.abs(c.glBal || 0), oob = Math.abs(c.oob || 0);
// UI-17 near-zero / dormant guard: a % of a ~0 balance is meaningless. Frame by
// absolute amount, suppress the % (and show the real small $, not $0.0K).
var nearZero = (oob < MAT_OOB_FLOOR) || (bal < DORMANT_GL_FLOOR);
if (nearZero) {
  var exact = _ccyAmt(c.ccy, c.oob);            // full precision, NOT K-rounded
  var dormant = bal < DORMANT_GL_FLOOR;
  var sit = exact + ' out of balance — immaterial'
    + (dormant ? '; this account is dormant (near-zero balance)' : '') + '.';
  var rec = canPost ? 'No action needed — the amount is negligible. Monitor next period.' : '';
  return { sit: sit, rec: rec, nearZero: true };   // flag so the card can render the exact $ + a "dormant" chip
}
```

Then:
- **Card face:** when `nearZero`, render the exact out-of-balance (e.g. `$3`) instead
  of the K-rounded `$0.0K`, and consider a distinct **"dormant / near-zero"** chip so
  all-`$0.0K` rows read as intentional, not broken.
- **AI grounding:** in `_wlCauseFacts` / the company prompt, when `nearZero`, add a
  fact line — e.g. *"This company is dormant / near-zero (GL balance ≈ 0, $3 out of
  balance). Do NOT express the gap as a percentage of the balance; call it immaterial
  by absolute amount."* — so the live AI stops saying "100% of GL balance."

## Follow-up sweep (owner live review)

Once the guard is in, sweep all 9 NA companies for the other scenarios to confirm the
read fits each: large-material, small-material, near-zero/dormant, roll-forward break,
multi-currency. The existing recurrence / "carried forward unchanged" phrasing is good —
keep it.
