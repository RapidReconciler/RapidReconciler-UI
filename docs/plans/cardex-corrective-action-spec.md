# Cardex Corrective Action &mdash; Production Spec

**Status:** design / not yet implemented &middot; **Companion mockup:** [`cardex-corrective-action-mockup.html`](cardex-corrective-action-mockup.html) &middot; **Target repo:** `RapidReconciler-DB` (dev &rarr; QA workflow) with new agent endpoints in `RapidReconciler-Agent`.

This spec turns the mockup into three buildable pieces:

1. **Netting rewrite** of `usp6_006b_cardex_variance` &mdash; account-partitioned, cost-method/level-aware, with the display fields set correctly.
2. **`radjustledger`** &mdash; a before-image audit table that makes beginning-balance edits reversible.
3. **`usp6_maint_set_beginning_balance`** (apply) and **`usp6_maint_undo_beginning_balance`** (undo) &mdash; one reversible primitive that replaces all three legacy Re-Roll options.

All SQL targets **compat level 140** (engine floor SQL 2019; the level is pinned at 140 on purpose) per `feedback_sql_compat_floor` (floor raised 2026-06-06; required for V8). The shipped `usp8_*` build happens to be compat-100-clean already, so no rework — but new SQL may now use `CONCAT_WS`, `STRING_SPLIT`/`STRING_AGG`, `TRIM`, `IIF`, `TRY_CAST`, `OFFSET/FETCH`, JSON, `CREATE OR ALTER`, etc. (avoid only the SQL 2022 constructs listed in the workspace `CLAUDE.md` floor section). Canonical rules in `project_cardex_netting_rules`.

---

## 0. The two anchors (carried over from the design discussion)

Every operation keeps two anchors in lockstep, plus one rollup:

| Anchor | Table / columns | Drives |
|---|---|---|
| Variance baseline | `rperpetualinv.baselineqoh / baselineaoh` | the cardex variance (`estunits`, `baselinevar`) |
| Valuation balance-forward | `rinvasof` `bl=1` row `quantityonhand / amountonhand` | the period roll-forward (Valuation) |
| Account rollup | `raccountsummary` | account-level out-of-balance |

Variance math (unchanged, the delta-of-deltas):

```
estunits    = (quantityincardex - baselineqic) - (quantityonhand - baselineqoh)
baselinevar = round((amountincardex - baselineaic) - (amountonhand - baselineaoh), 2)
```

---

## 1. Netting rewrite &mdash; `usp6_006b_cardex_variance`

### 1.1 What's wrong today

The current proc computes per-row `estunits/baselinevar`, then nets `lot &rarr; location &rarr; branch` **uniformly** with `0.05 / 0.09 / threshold` tolerances. Three defects:

- **Ignores cost method and cost level** &mdash; over-nets method-07 and Level-3 items (which must stay at location/lot) up to branch.
- **Netting keys never include the account** (`branchplant, shortitem [, location, lot], threshold`) &mdash; so it can net *across* GL accounts and silently cancel the GL-class-change offsets that must survive.
- **Display fields end up inconsistent** &mdash; a surviving row shows its own partial `estunits/baselinevar`, not the group net, and `reason` is flipped/cleared row-by-row.

### 1.2 The grain (canonical rule)

One row represents the total at `account &times; grain`; the grain comes from cost method + cost level; **the account (company + longaccount) is never crossed**:

| Method | Level | Grain |
|---|---|---|
| 07 Standard | any | location / lot |
| 02 WAC | 1 | item (all branches/locations/lots) |
| 02 WAC | 2 | branch + item |
| 02 WAC | 3 | location / lot |
| 09 Actual | by level, like 02 | *(assumption &mdash; confirm)* |

### 1.3 New flow

Keep step 1 (per-row `estunits/baselinevar` on `rperpetualinv`). **Replace** the netting cascade with: derive a grain key per row, aggregate to a netted table, set display fields from the net.

**Grain key (account always leads):**

```sql
-- per row, joined rperpetualinv a / ritems b / rinvaccountlist c (longaccount)
,   RTRIM(b.companynumber) + N'~' + RTRIM(c.longaccount)            -- account partition (never crossed)
  + N'~' + RTRIM(CASE WHEN b.costmethod IN ('02','09') AND b.costlevel = '1'
                      THEN N'' ELSE b.branchplant END)              -- branch unless 02/09 L1
  + N'~' + CAST(b.shortitem AS NVARCHAR(12))                        -- item always
  + N'~' + RTRIM(CASE WHEN b.costmethod = '07'
                       OR (b.costmethod IN ('02','09') AND b.costlevel = '3')
                      THEN b.location ELSE N'' END)                 -- loc/lot only at loclot grain
  + N'~' + RTRIM(CASE WHEN b.costmethod = '07'
                       OR (b.costmethod IN ('02','09') AND b.costlevel = '3')
                      THEN b.lot ELSE N'' END)                      AS grainkey
,   CASE WHEN b.costmethod IN ('02','09') AND b.costlevel = '1' THEN 'item'
         WHEN b.costmethod IN ('02','09') AND b.costlevel = '2' THEN 'branch'
         ELSE 'loclot' END                                          AS grainlevel
```

GL class is **not** in the key (account is the partition); a group with >1 class displays `mixed`.

**Netted result table** (new display source). Loaded by **MERGE each run** (not truncate/insert) so the stability counters survive across refreshes &mdash; see &sect;8:

```sql
CREATE TABLE dbo.rcardexvariance (
    cardexvarianceid  INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    grainkey          NVARCHAR(120) NOT NULL,
    companynumber     NCHAR(5)      NOT NULL,
    longaccount       NCHAR(29)     NOT NULL,
    glclass           NVARCHAR(10)  NULL,        -- 'mixed' when >1 in the group
    branchplant       NCHAR(12)     NULL,        -- NULL at item grain (L1)
    shortitem         INT           NOT NULL,
    itemnumber        NVARCHAR(25)  NULL,
    location          NVARCHAR(20)  NULL,        -- NULL unless loclot grain
    lot               NVARCHAR(30)  NULL,        -- NULL unless loclot grain
    costmethod        NCHAR(2)      NULL,
    costlevel         NCHAR(1)      NULL,
    grainlevel        NVARCHAR(10)  NULL,        -- 'item' | 'branch' | 'loclot'
    netqtyvar         DECIMAL(18,6) NOT NULL,
    netamtvar         MONEY         NOT NULL,
    reason            NVARCHAR(10)  NOT NULL,    -- 'Quantity' | 'Amount' | ''
    constituentcount  INT           NOT NULL,
    threshold         MONEY         NULL,
    -- stability gate (section 8): only stable groups become suggestions
    firstseen         DATETIME      NULL,        -- when this group first showed any variance
    stablesince       DATETIME      NULL,        -- when its rounded net last *stopped* changing
    runsstable        INT           NOT NULL,    -- consecutive refreshes with unchanged net
    isstable          BIT           NOT NULL,    -- runsstable >= @minstableruns
    -- corrective action (section 9):
    glchangeoffset    BIT           NOT NULL,    -- item spans >1 account with offsetting net
    suggestedaction   NVARCHAR(48)  NULL,
    actionowner       NVARCHAR(20)  NULL,        -- 'RapidReconciler' | 'JD Edwards' | 'IT'
    needsjdevalidation BIT          NOT NULL,
    changedate        DATETIME      NOT NULL
);
```

**Aggregate (group by grainkey, account never crossed)** &mdash; stage the netted set, then MERGE it into `rcardexvariance` (the MERGE that carries stability is in &sect;8):

```sql
SELECT  grainkey,
        companynumber,
        longaccount,
        CASE WHEN COUNT(DISTINCT glclass) = 1 THEN MAX(glclass) ELSE 'mixed' END,
        CASE WHEN grainlevel = 'item'   THEN NULL ELSE MAX(branchplant) END,
        shortitem,
        MAX(itemnumber),
        CASE WHEN grainlevel = 'loclot' THEN MAX(location) ELSE NULL END,
        CASE WHEN grainlevel = 'loclot' THEN MAX(lot)      ELSE NULL END,
        MAX(costmethod), MAX(costlevel), grainlevel,
        SUM(estunits)                                   AS netqtyvar,
        SUM(baselinevar)                                AS netamtvar,
        COUNT(*)                                        AS constituentcount,
        MAX(threshold)                                  AS threshold,
        CASE WHEN ABS(ROUND(SUM(estunits),2))    > 0.05            THEN 'Quantity'   -- qty tolerance
             WHEN ABS(ROUND(SUM(baselinevar),2)) > MAX(threshold)  THEN 'Amount'     -- $ materiality
             ELSE '' END                                AS reason,
        GETDATE()
FROM    <rperpetualinv a JOIN ritems b JOIN rinvaccountlist c, with grainkey/grainlevel from 1.3>
WHERE   b.shortaccount NOT IN ('xxxxxxxx','yyyyyyyy')   -- exclude trash accounts (same as today)
GROUP BY grainkey, companynumber, longaccount, shortitem, grainlevel
INTO    #netted;   -- (SELECT ... INTO #netted; column list omitted for brevity)
```

**Display fields, set correctly:** the V8 grid reads `rcardexvariance` (one row per group, net values, correct `reason`, grain shown). Rows where `reason = ''` are the netted-clean noise (hidden by default, toggle to show). Drill-down to constituents = the `rperpetualinv` rows whose computed `grainkey` matches.

For legacy back-compat, still set `rperpetualinv.reason` to the **group's** reason (join back on grainkey) so any existing consumer sees a consistent flag; keep the raw per-row `estunits/baselinevar` untouched for audit/drill-down.

> Consistent with `project_remove_getfilteredview_sproc`: netting is server-side (it can't be a client-side filter), and the agent serves `rcardexvariance` rows **raw + JWT-scoped**; the UI still does its own sort/search/column-filter client-side.

---

## 2. `radjustledger` &mdash; before-image audit / undo

```sql
CREATE TABLE dbo.radjustledger (
    adjustid         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    adjusttime       DATETIME      NOT NULL CONSTRAINT DF_radjustledger_t DEFAULT (GETDATE()),
    username         NVARCHAR(50)  NULL,
    itemid           INT           NOT NULL,    -- the line corrected (beginning balance is per itemid)
    companynumber    NCHAR(5)      NULL,
    longaccount      NCHAR(29)     NULL,
    preset           NVARCHAR(12)  NULL,        -- 'manual' | 'zero' | 'clear'
    -- before image (everything undo needs):
    old_baselineqoh  DECIMAL(18,6) NULL,
    old_baselineaoh  MONEY         NULL,
    old_bl_qty       DECIMAL(18,6) NULL,        -- rinvasof bl=1 quantityonhand
    old_bl_amt       MONEY         NULL,        -- rinvasof bl=1 amountonhand
    old_estunits     DECIMAL(18,6) NULL,
    old_baselinevar  MONEY         NULL,
    -- requested target (absolute beginning):
    new_bl_qty       DECIMAL(18,6) NULL,
    new_bl_amt       MONEY         NULL,
    -- result captured post-apply, for the trail:
    res_estunits     DECIMAL(18,6) NULL,
    res_baselinevar  MONEY         NULL,
    status           NVARCHAR(10)  NOT NULL,    -- 'applied' | 'reversed'
    reversetime      DATETIME      NULL
);
```

We persist only the **anchor inputs** (baseline pair + `bl` pair) because everything downstream &mdash; the roll-forward, the variance, the account summary &mdash; is a deterministic function of `(bl, baseline, transactions, GL)`. Undo restores those and re-derives the rest.

---

## 3. Apply &mdash; `usp6_maint_set_beginning_balance`

Replaces and generalizes `usp6_maint_reset_item_balance`: **absolute** target qty *and* amount (the current proc takes a qty delta only and auto-derives the amount), reversible, logged.

```sql
CREATE PROCEDURE dbo.usp6_maint_set_beginning_balance
    @itemid         INT,
    @target_bl_qty  DECIMAL(18,6),
    @target_bl_amt  MONEY,
    @preset         NVARCHAR(12) = 'manual',
    @username       NVARCHAR(50) = NULL,
    @adjustid       INT OUTPUT
AS
```

Steps (one transaction):

1. **Capture before-image** into locals: `baselineqoh/baselineaoh`, `estunits/baselinevar` from `rperpetualinv`; `quantityonhand/amountonhand` from the `rinvasof` `bl=1` row.
2. **Deltas:** `@dq = @target_bl_qty - old_bl_qty`, `@da = @target_bl_amt - old_bl_amt`.
   The variance baseline shifts by the **same** delta as the balance-forward (the lockstep rule the current reroll already follows).
3. **Insert** `radjustledger` (`status='applied'`) with the before-image + targets; `SET @adjustid = SCOPE_IDENTITY()`.
4. **Apply:**
   - `rperpetualinv`: `baselineqoh += @dq`, `baselineaoh += @da`; recompute `estunits/baselinevar` from the formula (§0).
   - `rinvasof` `bl=1` row: `quantityonhand = @target_bl_qty`, `amountonhand = @target_bl_amt`.
   - **Re-roll the item forward** via `v6_006_asof_rollforward` scoped to `@itemid` (the same update `usp6_maint_reset_item_balance` already does).
   - **Re-aggregate `raccountsummary`** for the affected `longaccount` &mdash; *recompute from the item rows*, don't delta-patch:
     `amountonhand = SUM(item amountonhand)`, `balcxvar = SUM(item baselinevar)` (current period), `outofbalance = endingglbalance - amountonhand + balcxvar`. (Re-aggregation is safer than the delta arithmetic in the old proc, which is easy to get sign-wrong.)
   - **Refresh netting** for the affected account: re-run the §1 aggregate scoped to that `companynumber/longaccount` (or accept it on the next nightly `usp6_006b` &mdash; but immediate refresh keeps the grid honest).
5. **Update** the ledger row with `res_estunits/res_baselinevar`.

**Sign check (false-variance case):** F4111 led at load &rarr; F41021 caught up later &rarr; `estunits = -q`. The true opening on-hand was higher by `q`, so the analyst raises the beginning by `q`: `@dq = +q` &rarr; `estunits_new = -q + q = 0`. Correct.

**Presets** (UI computes the target, proc just receives it):
- **Manual** &mdash; analyst types `@target_bl_qty / @target_bl_amt`.
- **Zero opening** &mdash; `0 / 0` (replaces *Zero Beginning Balance*).
- **Clear to JDE** &mdash; `target = current_beginning - current_variance` (replaces *Remove CX Var*). Offered only for **single-line** groups; a multi-line netted group must be resolved to the specific constituent `itemid` first (see §6).

---

## 4. Undo &mdash; `usp6_maint_undo_beginning_balance`

```sql
CREATE PROCEDURE dbo.usp6_maint_undo_beginning_balance
    @adjustid INT
AS
```

1. Read the ledger row; if `status <> 'applied'`, no-op (already reversed).
2. **LIFO guard:** refuse if a *later* `applied` row exists for the same `itemid` (can't unwind an older edit while a newer one stands). Undo newest-first.
3. **Restore** `rinvasof bl=1` to `old_bl_qty/old_bl_amt` and `rperpetualinv` baselines to `old_baselineqoh/old_baselineaoh`; then run the **same** recompute as apply step 4 (variance &rarr; roll-forward &rarr; account summary &rarr; netting refresh).
4. Mark `status='reversed'`, `reversetime=GETDATE()`.

Because the recompute runs against **current** `qic/qoh`, undo lands exactly back if no transactions posted since; if some did, you get old-beginning + all transactions (the correct state), not a corruption.

---

## 5. Agent endpoints (integration point)

Per `feedback_always_spec_new_endpoints`, wire the contract when these land:

| Endpoint | Calls | Replaces |
|---|---|---|
| `POST /inventory/set-beginning-balance` `{itemid, beginQty, beginAmt, preset}` | `usp6_maint_set_beginning_balance` | the old `rollIItem` reroll |
| `POST /inventory/undo-adjustment` `{adjustid}` | `usp6_maint_undo_beginning_balance` | &mdash; (new) |
| `GET  /inventory/adjustment-ledger` | `radjustledger` (JWT-scoped) | &mdash; (new) |
| `POST /inventory/integrity {report:'rcardexvariance'}` *(or a new report id)* | netted rows | the per-row `v6ui_itemrollintegritydialog` for the variance grid |

UI copy stays finance-facing (`feedback_v8_audience_finance_not_it`): no table/proc names in user strings.

---

## 6. Daily noise &mdash; only suggest stable items

Variance moves day to day: in-flight transactions, the lagging table catching up after a load, and (per the analysis guide) **a refresh that runs while transactions are in process throws false positives**. We must not put a moving target on the worklist.

**Rule: a group is suggestable only after its rounded net has held unchanged across `@minstableruns` consecutive refreshes** (default **3**). This also neutralizes the mid-processing-refresh caveat for free &mdash; a blip changes on the next clean run and never reaches `isstable = 1`.

That's why &sect;1 loads `rcardexvariance` by **MERGE on `grainkey`** instead of truncate/insert &mdash; the counters have to survive the run:

```sql
MERGE dbo.rcardexvariance AS t
USING #netted AS s ON t.grainkey = s.grainkey
WHEN MATCHED AND ROUND(t.netqtyvar,2) = ROUND(s.netqtyvar,2)
             AND ROUND(t.netamtvar,2) = ROUND(s.netamtvar,2)
    THEN UPDATE SET t.runsstable = t.runsstable + 1,             -- unchanged: age it
                    t.isstable   = CASE WHEN t.runsstable + 1 >= @minstableruns THEN 1 ELSE 0 END,
                    /* net values, reason, attrs refreshed from s, changedate = GETDATE() */
                    t.changedate = GETDATE()
WHEN MATCHED                                                      -- changed: reset the clock
    THEN UPDATE SET t.netqtyvar = s.netqtyvar, t.netamtvar = s.netamtvar, t.reason = s.reason,
                    t.runsstable = 1, t.isstable = 0, t.stablesince = GETDATE(), t.changedate = GETDATE()
                    /* + refresh attrs */
WHEN NOT MATCHED BY TARGET                                        -- brand new variance
    THEN INSERT (... , firstseen, stablesince, runsstable, isstable, changedate)
         VALUES (... , GETDATE(), GETDATE(), 1, 0, GETDATE())
WHEN NOT MATCHED BY SOURCE                                        -- variance cleared on its own
    THEN DELETE;   -- (optionally archive the deleted row to rcardexvariancehistory first)
```

The worklist (&sect;8) shows only `isstable = 1 AND reason <> ''`. `isstable = 0` rows are **settling** &mdash; visible under a "monitoring" toggle, never auto-suggested. An optional append-only `rcardexvariancehistory` (net per run) supports trend lines but isn't required for the gate.

## 7. Corrective-action classification

The system **suggests**; it cannot fully decide. Choosing dollars-only IA vs F41021 correction vs baseline adjust requires JDE validation (export F4111, exclude `ILIPCD='X'`, compare to F41021). So each stable row carries a *recommended* action, an owner, and `needsjdevalidation`. The one action fully inside RapidReconciler is **Adjust Beginning Balance** (when the analyst confirms the variance is a baseline/false-variance artifact).

**GL-class-change offset detection** (sets `glchangeoffset`): an item (`shortitem`, and `branchplant` for L2/L3) whose rows span **more than one `longaccount` with offsetting `netamtvar`**. We infer it from the data &mdash; the same signal the analyst sees &mdash; rather than a stored JDE flag. Both halves are tagged; neither nets away.

| Signal (on a stable row) | `suggestedaction` | `actionowner` | validate? |
|---|---|---|---|
| `glchangeoffset = 1` | Correct item GL class / post reclassifying JE between the two accounts | JD Edwards | yes |
| `reason='Amount'`, single account | Validate F4111 $ vs F41021 &rarr; dollars-only IA (P4114) **or** Adjust Beginning Balance | JD Edwards / RapidReconciler | yes |
| `reason='Quantity'` | Validate F4111 qty vs F41021 &rarr; F41021 SQL correction **or** Adjust Beginning Balance | IT / RapidReconciler | yes |
| `reason='Amount'`, `costmethod='02'`, negative-runqty signal* | Investigate WAC corruption (P4105); not a beginning-balance fix | JD Edwards | yes |
| stable, determined to be a load/baseline artifact (no JDE change) | Adjust Beginning Balance | RapidReconciler | no |

\* a negative-`runqty` excursion isn't in `rperpetualinv` today; flagging it needs a transaction-history scan (future signal). Until then those land in the generic Amount/Quantity rows.

These are computed in the same `usp6_006b` pass (a `CASE` over `reason / glchangeoffset / costmethod`) and stored on `rcardexvariance` so the worklist and the agent read them directly.

## 8. The action worklist &mdash; "what needs to be done"

The payoff. A served list (and Excel export) of **stable, real** rows, each with its suggested action and the exact numbers, grouped by who acts:

- **In RapidReconciler** &mdash; Adjust Beginning Balance (opens the &sect;3 flow inline; no JDE change).
- **In JD Edwards** &mdash; dollars-only IA, GL-class correction / reclassifying JE (procedure text + amounts from the analysis guide).
- **With IT** &mdash; F41021 SQL correction (exact QtyVar, account/branch/location/lot).

**Status tracking** &mdash; small table (or extend the existing `…cardexledgercompareworknote` infra):

```sql
CREATE TABLE dbo.rcardexworkstatus (
    grainkey    NVARCHAR(120) NOT NULL PRIMARY KEY,
    status      NVARCHAR(12)  NOT NULL,   -- 'New' | 'Working' | 'Worked' | 'Watch'
    note        NVARCHAR(400) NULL,
    workedby    NVARCHAR(50)  NULL,
    workeddate  DATETIME      NULL
);
```

**Worklist view** (`v6ui_cardexworklist`, served raw + JWT-scoped):

```sql
SELECT v.*, ISNULL(w.status,'New') AS status, w.note, w.workedby, w.workeddate
FROM   dbo.rcardexvariance v
LEFT JOIN dbo.rcardexworkstatus w ON w.grainkey = v.grainkey
WHERE  v.isstable = 1 AND v.reason <> '';
```

The grid sorts by `actionowner` then `|netamtvar|`. Applying an Adjust (&sect;3) and the variance clearing flips the row to `Worked` automatically (the next refresh deletes it via MERGE NOT MATCHED BY SOURCE); JDE/IT rows are marked `Worked` by hand once posted, and `Watch` if intentionally deferred. The daily list is therefore just the stable, unworked variances &mdash; noise excluded by construction.

## 9. Decisions captured

- **Adjust grain = `itemid`.** The beginning balance is per `itemid` (both anchors are). A multi-line netted group is drilled to its constituents and the analyst picks the line to correct; **Clear to JDE** auto-target is offered only when the group is a single line. *(This resolves the open question from the mockup.)*
- **Method 09** assumed to follow cost level like 02 &mdash; confirm before coding the grain `CASE`.
- **Re-aggregate, don't delta-patch** `raccountsummary`.
- **LIFO undo** per `itemid`.
- Three legacy Re-Roll options collapse into one logged, reversible primitive (presets in §3). `usp6_maint_reset_item_balance`, `usp6_set_beginning_balances_zero`, and `usp6_maint_reset_cardex_variance` become candidates for the DB-repo deletable-objects list (`project_db_repo_division_and_cleanup`) once the new procs ship.
- **Stability gate before suggestion** &mdash; `@minstableruns` default **3**; the worklist suggests only `isstable = 1`. Settling rows are monitored, never auto-suggested.
- **Suggest, don't determine** &mdash; every row carries a recommended action + owner + `needsjdevalidation`; the final branch is the analyst's after JDE validation. Adjust Beginning Balance is the only fully in-system action.
- **GL-class-change offset is inferred** from the data (item spanning >1 account with offsetting net), not a stored JDE flag.
- **Worklist is grouped by owner** (RapidReconciler / JD Edwards / IT) and tracked in `rcardexworkstatus`; cleared variances auto-drop via the MERGE.

## 10. Build order

1. Schema: `rcardexvariance` (with stability + action columns), `radjustledger`, `rcardexworkstatus` (+ optional `rcardexvariancehistory`).
2. `usp6_006b_cardex_variance` rewrite: grain key &rarr; stage `#netted` &rarr; stability MERGE into `rcardexvariance`; classification `CASE`; set `rperpetualinv.reason` from the group.
3. `usp6_maint_set_beginning_balance` + `usp6_maint_undo_beginning_balance`.
4. `v6ui_cardexworklist` view.
5. Agent endpoints + V8 wiring (mockup &rarr; live page), incl. the worklist + Excel export.
6. Retire the three reroll procs/endpoints.

Validate on a dev DB at compat 140 before the QA publish (`project_dev_to_qa_workflow`).
