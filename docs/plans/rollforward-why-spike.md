# Roll-Forward "Why" Spike — GL Account Roll Forward, Co 30001, Jun 2022

**Read-only diagnostic. No writes, no re-roll, no B->C. Decides whether an AI
"explain the roll-forward break" feature is viable or a confident-wrong trap.**

**Verdict: A — it decomposes cleanly into a single nameable cause.**
The -68,972.11 is a real, isolated GL source discrepancy (F0902 balances vs
F0911 detail), not a roll-state artifact. A re-roll will not fix it — it will
reproduce the same number. An AI explainer is viable *if* it is grounded to the
correct axis. There is a live trap: the cardex axis carries a different-but-
nearby number (69,307.75) that a naive AI would grab and be wrong.

---

## 1. Instance located

| Item | Value |
|---|---|
| Database | `RapidReconciler_Demo3` (Golden Harvest / former TR / Demo3 lineage) |
| Company | 30001 |
| Account | `B009902.1121` (short account `00990210`, object 1121, BU B009902) |
| Report table | `raccountsummary` (built by `usp6_009_account_summary`; rebuilt by `usp8_rebuild_gl_rollforward`) |
| UI view / card | `v6ui_raccountsummary`, columns `GLOK` (roll status), `BegGL`, `PerGL`, `EndGL` |
| Broken row | period ending 2022-06-30, `glrollok = 'no'` |

Co 30001 exists only in Demo3 (85 summary rows). Demo1/Demo2 have none.
Only one account in Co 30001 breaks in Jun 2022: `B009902.1121`. The whole
-68,972.11 sits on that one account — no split.

## 2. The arithmetic of -68,972.11

`glrollok` is a pure GL-continuity check: does *prior period ending GL* equal
*this period beginning GL*? For `B009902.1121`:

| Period | BegGL (F0902 cum) | PerGL (F0911 activity) | EndGL = Beg+Per-Unposted | glrollok |
|---|---:|---:|---:|---|
| May 2022 | 23,992,794.77 | 3,442,564.05 | **27,435,358.82** | yes |
| Jun 2022 | **27,366,386.71** | 2,545,081.20 | 29,911,467.91 | **no** |

The break = **BegGL(Jun) − EndGL(May) = 27,366,386.71 − 27,435,358.82 = −68,972.11.**
The June opening balance (from F0902) came in 68,972.11 *lower* than the May
computed close. Every other month in FY rolls `yes`. This is a one-time
permanent discontinuity at the May->Jun boundary; it does not reverse.

- `BegGL` is F0902-derived: cumulative `GBAPYC + GBAN01..GBAN(n-1)`.
- `PerGL` is F0911-derived: `SUM(LedgerAmount)` from `rcardexledgercompare`,
  which equals `SUM(Amount)` from `vcr_F0911` to the penny (23,956 posted rows).

So the break lives between two GL sources: **F0902 (balances) and F0911 (detail).**
Note the fiscal year is October-start (GBFY=22 buckets begin Oct 2022), so May 2022
is GBFY=21, period 8 (`GBAN08`).

## 3. Decomposition — against F0911 detail, month by month

Comparing F0902's stored period bucket to the posted F0911 detail for the same
account, every adjacent period ties exactly; only May is off:

| Period | F0902 bucket | F0911 detail | Diff |
|---|---:|---:|---:|
| Apr 2022 (GBAN07) | 405,551.04 | 405,551.04 | 0.00 |
| **May 2022 (GBAN08)** | **3,373,591.94** | **3,442,564.05** | **−68,972.11** |
| Jun 2022 (GBAN09) | 2,545,081.20 | 2,545,081.20 | 0.00 |
| Jul 2022 (GBAN10) | −393,027.63 | −393,027.63 | 0.00 |

Bucketed to the penny:

| Bucket | $ | Note |
|---|---:|---|
| (a) Unposted F0911 (PostingCode != 'P') | 0.00 | none exist in May/Jun for this account — all detail posted |
| (b) Timing / offsetting adjacent period | 0.00 | Apr, Jun, Jul all tie exactly; no offset to absorb it |
| (c) **Posted F0911 detail in excess of F0902 balance (May)** | **−68,972.11** | the entire delta |
| (d) Sign/amount mismatch | 0.00 | signs consistent; single net gap |
| **Total** | **−68,972.11** | **sums exactly, zero residual** |

100% of the break is bucket (c): **F0902 (Account Balances) understates the
posted F0911 (Account Ledger) detail for period 8 / May 2022 by 68,972.11.**
This is a classic JDE balances-vs-detail integrity gap — detail posted, the
F0902 period bucket not carrying the full amount (or an independent F0902
adjustment). In JDE it is resolved by the Repost/Integrity path (R099102-style),
**not** by an RR re-roll.

## 4. Why this is Verdict A, not C (roll-state artifact)

A roll-state artifact (VarOK-style, `reference_varok_break_resolution`) is an
*RR-internal* continuity break where the source is consistent and only a re-roll
+ reload fixes it. Test: recompute from source — does the break survive?

Here it does. F0902 (3,373,591.94) and F0911 (3,442,564.05) disagree in the raw
JDE tables. `usp6_009` reports that faithfully. `usp8_rebuild_gl_rollforward`'s
own header says it plainly: on an uncorrected source it "simply reproduces the
same GLOK." The gap is in the *source data*, so it is real and nameable, and a
re-roll is the wrong action. Verdict **A**.

## 5. The trap (why grounding matters)

The break is a **GL-vs-GL** condition (F0902 vs F0911). But there is a second,
different variance on the **GL-vs-cardex** axis for the same account/month:

| Axis | Formula | Value |
|---|---|---:|
| **GL roll break (the card)** | F0911 − F0902 | **68,972.11** |
| Cardex/inventory variance | F0911 − F4111 | 69,307.75 |

These are close (differ by 335.64) but distinct, on different axes, with
different causes. The task brief itself hypothesized decomposing "against the
cardex side" — that is the wrong axis for *this* break and would land the AI on
69,307.75. An ungrounded model that reads "off by 68,972.11" and reaches for the
inventory/cardex numbers (`PerCX`, `OOB`, `CardexVar`) produces a confident-wrong
answer. This is exactly the fatal failure mode the spike was meant to catch. The
feature is viable only with hard grounding to the F0902-vs-F0911 axis.

## 6. Groundable data shape (if built)

Scope the explainer to rows where `glrollok = 'no'`. For each such
(company, longaccount, periodends), feed the AI a fixed, pre-computed structure —
never free-form table access:

**Roll-break header (from `raccountsummary` / `v6ui_raccountsummary`):**
- `companynumber`, `longaccount`, `periodends`
- this period: `BegGL` (beginningbalance), `PerGL` (ledgeramount), `EndGL`,
  `UnpostBatch` (unpostedbatchamount)
- prior period: `EndGL_prior`
- `roll_break = BegGL(this) - EndGL(prior)`  ← the headline "off by" number

**Decomposition buckets (pre-aggregated server-side; scope rides in the request
per `feedback_scope_rides_in_request_for_aggregated`):**
- `unposted_f0911` = SUM(`vcr_F0911.Amount`) where `PostingCode <> 'P'`, prior period
- `f0902_bucket` = BegGL(this) − BegGL(prior)  (F0902 implied period movement)
- `f0911_posted` = SUM(`vcr_F0911.Amount`) where `PostingCode = 'P'`, prior period
- `posted_gap` = `f0902_bucket` − `f0911_posted`  ← the nameable cause
- `adjacent_offset` = same gap computed for period±1 (to rule in/out timing)

**Grounding rules the catalog must carry (one source, per
`feedback_analytical_knowledge_one_source`):**
- The GL roll break is an F0902-vs-F0911 discrepancy. Do NOT explain it with
  cardex/F4111 numbers (`PerCX`, `CardexVar`, `OOB`) — different axis.
- If `posted_gap` carries the whole break and no adjacent offset exists:
  cause = "GL balances (F0902) out of sync with posted GL detail (F0911) for
  this account and period — a JDE balances/detail integrity gap; fix in JDE
  (repost/integrity), not an RR re-roll."
- If `unposted_f0911` carries it: cause = "unposted batch(es) in the period."
- If an adjacent period offsets it: cause = "timing — detail posted to an
  adjacent period."
- Never assert a document-level cause. F0902 is a balance, not itemized; the
  break is provable at account/period grain only, not down to a specific F0911 doc.

## 7. Top cause for THIS instance

**F0902 (Account Balances) for account `B009902.1121`, May 2022, understates the
posted F0911 (Account Ledger) detail by exactly 68,972.11.** Balances-vs-detail
integrity gap in the JDE source. All May detail is posted; every adjacent period
reconciles to the penny; no offsetting period exists. Not an RR roll-state
artifact — a re-roll reproduces it. The correct action is a JDE-side repost, and
the AI should say so rather than invent a cardex or timing story.
