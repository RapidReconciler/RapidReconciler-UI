# Transaction-variance card tie-out audit

Read-only audit, measured 2026-08-10 against `RapidReconciler_Demo1`,
`RapidReconciler_Demo2` and `RapidReconciler_Demo3`. No database was
written. Every number below carries the query that produced it.

## Verdict

The card set itself ties. Across all three databases the cards partition
`RCardexLedgerCompare2 where recstatus = 1` exactly: every row lands on
one card, the per-card row counts and amounts sum to the residual to the
cent, and no row is claimed twice. What does not tie is the link
above the cards. `v6ui_raccountsummary.Variance`, the figure Home's
period widget and its bands show, is a different measure from the card
residual and cannot equal it. The worst single gap is Demo3 company
30002, period 2022-08-31: the widget shows **$2,359.39** where the card
set holds **zero rows and $0.00**. The `home.html` claim that the two
tie "to the penny" and therefore act as a dacpac-drift detector is
false, and the detector detects nothing.

## Tolerance applied (E)

`RCardexLedgerCompare2.CardexAmount`, `.LedgerAmount` and `.Variance` are
all `float(53)`:

```sql
select c.name, t.name from sys.columns c
join sys.types t on t.user_type_id = c.user_type_id
where c.object_id = object_id('RCardexLedgerCompare2') order by c.column_id;
```

So every comparison in this audit casts to `decimal(28,6)` or
`decimal(28,8)` and compares an absolute difference. No `ROUND(float,2)`
appears anywhere. Two tolerances, both taken from the code rather than
invented:

- **$0.005** for "is this row's own arithmetic self-consistent". Half a
  cent, below the 2-decimal grain every surface displays.
- **`RCompanies.Threshold`** for "does this document reach the worklist".
  It is an `int` and reads `1` on all seven companies across the three
  databases, so the netting gate is **$1.00**, not half a cent. This
  matters: it is the gate `usp8_txv_net` and `v6_008_reconcile` apply.

```sql
select rtrim(CompanyNumber), cast(Threshold as varchar(30)) from RCompanies order by 2;
-- Demo1: 80002=1 80008=1 | Demo2: 80003..80041 all 1 | Demo3: 30001=1 30002=1
```

`v6ui_raccountsummary` already rounds every measure to 2 decimals inside
the view, so its side of any comparison is 2dp by construction.

## The chain, junction by junction

### A. Conservation

**A1. The card set partitions the residual exactly.** SQL replica of
`RRV8.txv.code()` from `config.js`: SubType through the `SUBTYPE` map,
else `Type` through `{sales, purchasing, mfg}` to a `T-*` terminal, else
`T-INV`.

```sql
;with c as (select *, lower(rtrim(ltrim(isnull(SubType,'')))) as st,
                      lower(rtrim(ltrim(isnull(Type,''))))    as ty
            from RCardexLedgerCompare2 where recstatus = 1),
      m as (select c.*, case st
              when 'make to order' then 'MTO' when 'intercompany' then 'ICO'
              when 'transfers' then 'TRF' when 'direct ship' then 'DS'
              when 'accounts' then 'ACCT' when 'periods' then 'PER'
              when 'vouchers' then 'VCHR' when 'duplicate sales' then 'DUP'
              when 'transfer integrity' then 'TXI'
              when 'completion not journaled' then 'CNJ'
              when 'offsetting entries' then 'OFF'
              when 'non-stock sales lines' then 'NSL'
              when 'non-stock charge lines' then 'NCL'
              when 'sales not journaled' then 'SNJ'
              when 'cross-batch completion' then 'XBC'
              when 'mfg cost mismatch' then 'MCM'
              when 'dmaai net zero' then 'NZR' else '' end as stcode from c)
select case when stcode <> '' then stcode
            when ty = 'sales' then 'T-SALES' when ty = 'purchasing' then 'T-PURCH'
            when ty = 'mfg' then 'T-MFG' else 'T-INV' end as cardcode
,      count(*), cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
from m group by case when stcode <> '' then stcode
            when ty = 'sales' then 'T-SALES' when ty = 'purchasing' then 'T-PURCH'
            when ty = 'mfg' then 'T-MFG' else 'T-INV' end order by 2 desc;
```

| DB | Cards | Sum of card rows | `recstatus = 1` rows | Sum of card amounts | Residual |
|---|---|---|---|---|---|
| Demo1 | 17 | 5,341 | 5,341 | $283,906.98 | $283,906.98 |
| Demo2 | 5 | 4,684 | 4,684 | $139,169.54 | $139,169.54 |
| Demo3 | 11 | 2,093 | 2,093 | -$12,628,376.16 | -$12,628,376.16 |

Per-card detail (Demo1): MTO 2,865 / -$43,502.66, ACCT 732 / $1.04,
NZR 545 / -$108,833.81, MCM 533 / $160,208.13, CNJ 320 / -$60,360.50,
NCL 144 / $19,203.40, OFF 128 / $126,921.07, ICO 27 / -$104.37,
TRF 15 / $185,272.76, NSL 13 / -$2,428.81, DUP 6 / $5,594.23,
T-SALES 4 / -$2,327.71, TXI 3 / $6,472.40, XBC 3 / -$2,263.17,
T-MFG 1 / -$1.63, T-PURCH 1 / $6.02, VCHR 1 / $50.59.

Demo2: VCHR 3,812 / $101,849.81, PER 672 / -$0.01, T-INV 168 / $32,798.53,
T-PURCH 30 / $2,584.84, NZR 2 / $1,936.37.

Demo3: T-SALES 1,295 / $25,201.30, XBC 450 / -$11,006,129.37,
CNJ 125 / -$1,620,264.09, TXI 101 / $269,325.52, MCM 71 / -$103,408.77,
NZR 30 / -$105,372.88, T-MFG 11 / -$95,086.48, VCHR 7 / $450.24,
T-PURCH 1 / $2.55, NCL 1 / $6,865.78, T-INV 1 / $40.04.

No (company, period) fails conservation. It cannot: `SubType` is one
column and the SQL above is total, so the grouping is a partition by
construction. The measurement confirms the client-side classifier
reproduces that partition without loss.

**A2. `Variance` is Ledger minus Cardex, not Cardex minus Ledger.**

```sql
select count(*)
, cast(max(abs(cast(Variance as decimal(28,8))
        - (cast(CardexAmount as decimal(28,8)) - cast(LedgerAmount as decimal(28,8))))) as decimal(28,8))
from RCardexLedgerCompare2 where recstatus = 1;
-- Demo1 5341 | 198929.62000000     Demo2 4684 | 281397.92000000     Demo3 2093 | 685913.64000000

select count(*)
, cast(max(abs(cast(Variance as decimal(28,8))
        - (cast(LedgerAmount as decimal(28,8)) - cast(CardexAmount as decimal(28,8))))) as decimal(28,8))
from RCardexLedgerCompare2 where recstatus = 1;
-- Demo1 5341 | .00000000           Demo2 4684 | .00000000           Demo3 2093 | .00000000
```

Maximum absolute deviation from `LedgerAmount - CardexAmount` is exactly
zero on all three databases and all 12,118 residual rows. The card total
and its own row detail agree perfectly. The stored convention is
deliberate, and `usp6_009_account_summary.sql:314` says so in a comment:
`-- GL - CX (same perspective as OOB); was CX - GL`. The analyst policy
text in `config.js` states the opposite direction (see Findings, F3).

### B. Exclusivity and double counting

**B1. The catalog is 1:1.** `RRV8.txv.SUBTYPE` in `config.js` maps 17
server SubTypes to 17 distinct card codes. `META` carries 21 codes: those
17 plus four `T-*` terminals fed by `Type`. No SubType maps to two cards.
No non-terminal card is fed by two SubTypes.

**B2. Every SubType in the data has a card.** The A1 replica emits a
distinct `unmapped` bucket when a non-empty SubType misses the map. That
bucket is empty on all three databases, and the row counts reconcile
exactly, so there are zero SubType values invisible to the analyst.
SubTypes present: Demo1 15, Demo2 3, Demo3 8, every one mapped.

**B3. The `?card=` drill uses `code()`, not `gridCode()`, so the card row
sets do not double-count.** `inventory-transactions.html:4306` filters on
`txvCardCode(r)`, and `txvCardCode` at line 3883 is
`return RRV8.txv.code(r)`. A row the server left unclassified therefore
appears under exactly one terminal card and cannot also appear under a
named card's drill.

**B4. `gridCode()` does mislabel rows inside a terminal drill.** It runs
independently of the card filter, stamping `r._pattern`, which drives the
pattern chip and the findings engine. Overlap measured:

```sql
select case when lower(rtrim(isnull(Comment,''))) = 'check duplicate sales integrity' then 'DUP'
            when rtrim(upper(OrderType)) = 'OP' and rtrim(upper(DocType)) = 'PV' then 'VCHR'
            when rtrim(upper(OrderType)) = 'WO' and rtrim(upper(DocType)) in ('IM','IC','IH') then 'MCM'
            when rtrim(upper(DocType)) = 'BV' or (rtrim(upper(DocType)) = 'IB'
                 and abs(cast(LedgerAmount as decimal(28,6))) < 0.01) then 'STD-COST'
            when abs(cast(CardexAmount as decimal(28,6))) < 0.01
             and abs(cast(LedgerAmount as decimal(28,6))) >= 0.01 then 'GL-ONLY'
            when abs(cast(LedgerAmount as decimal(28,6))) < 0.01
             and abs(cast(CardexAmount as decimal(28,6))) >= 0.01 then 'CDX-ONLY'
            else 'OTHER' end as gridcode
,      rtrim(Type), count(*), cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
from RCardexLedgerCompare2 where recstatus = 1 and isnull(rtrim(SubType),'') = ''
group by /* same expression */, rtrim(Type) order by 4 desc;
```

Demo1 and Demo2 produce only `GL-ONLY`, `CDX-ONLY`, `STD-COST` and
`OTHER`, which are `GRID`-only codes and never Home cards. No overlap.
Demo3 produces **9 rows / -$93,815.51 coded `MCM`**, a real Home card,
on rows Home counts under `T-MFG`. Detail in Findings, F2.

**B5. The `DUP` branch of `gridCode()` is unexercised.** Zero
unclassified rows carry the comment that triggers it:

```sql
select count(*) from RCardexLedgerCompare2 where recstatus = 1
and isnull(rtrim(SubType),'') = ''
and lower(rtrim(isnull(Comment,''))) = 'check duplicate sales integrity';
-- 0 on all three
```

### C. Completeness

**C1. The analyst-visible view is 1:1 with the residual.** The agent
reads `v8ui_reconcilingitems`
(`RapidReconciler-Agent/.../repository/TransactionsRepository.java:34`),
which wraps `v6ui_reconcilingitems`.

```sql
select count(*), cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
from RCardexLedgerCompare2 where recstatus = 1;
select count(*), cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
from v8ui_reconcilingitems;
select count(*), cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
from v6ui_reconcilingitems;
```

| DB | RCLC2 residual | `v8ui_reconcilingitems` | `v6ui_reconcilingitems` |
|---|---|---|---|
| Demo1 | 5,341 / $283,906.98 | 5,341 / $283,906.98 | 5,341 / $283,906.98 |
| Demo2 | 4,684 / $139,169.54 | 4,684 / $139,169.54 | 4,684 / $139,169.54 |
| Demo3 | 2,093 / -$12,628,376.16 | 2,093 / -$12,628,376.16 | 2,093 / -$12,628,376.16 |

**C2. Nothing is dropped by the view's two inner joins, and nothing is
duplicated by its three left joins.**

```sql
select count(*) from RCardexLedgerCompare2 a where a.recstatus = 1
and not exists (select 1 from RInvAccountList b
  where a.CompanyNumber = b.CompanyNumber and a.ShortAccount = b.ShortAccount);        -- 0, 0, 0
select count(*) from RCardexLedgerCompare2 a where a.recstatus = 1
and not exists (select 1 from v6ui_getcompanies c
  where a.CompanyNumber = c.CompanyNumber);                                            -- 0, 0, 0
select count(*) from (select CompanyNumber, ShortAccount from RInvAccountList
  group by CompanyNumber, ShortAccount having count(*) > 1) x;                          -- 0, 0, 0
select count(*) from (select CompanyNumber, LongAccount, DocType, OrderType
  from ROffsetAccounts where VarSource = 'TRN'
  group by CompanyNumber, LongAccount, DocType, OrderType having count(*) > 1) x;       -- 0, 0, 0
select count(*) from (select CompanyNumber, InventoryAccount, OrderType, DocType,
  DocNumber, PeriodEnds, MfgBatch from RCardexLedgerCompare2WorkNote
  group by CompanyNumber, InventoryAccount, OrderType, DocType, DocNumber,
  PeriodEnds, MfgBatch having count(*) > 1) x;                                          -- 0, 0, 0
select count(*) from vcr_f1113;                                                         -- 0, 0, 0
```

**C3. Reverse test passes.** `v6ui_reconcilingitems` places
`and recstatus = 1` inside its `RInvAccountList` join condition, so no
card rule can reach a non-residual row. C1's exact row-count match
confirms it.

### D. The roll-forward tie

The claim under test is at `home.html:8031-8034`: the `Variance` column
of `v6ui_raccountsummary` "ties, to the penny, to the reconciling-items
view the action cards are built from (the built-in dacpac-drift
detector)".

**D1. It does not tie, anywhere, on any database.**

```sql
;with r as (select CompanyNumber = rtrim(CompanyNumber), PeriodEnds
            ,      rclc2_rows = count(*)
            ,      rclc2_var  = cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
            from RCardexLedgerCompare2 where recstatus = 1
            group by rtrim(CompanyNumber), PeriodEnds),
      s as (select CompanyNumber = rtrim(CompanyNumber), PeriodEnds
            ,      sum_var = cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
            ,      sum_oob = cast(sum(cast(OOB     as decimal(28,6))) as decimal(28,2))
            from v6ui_raccountsummary group by rtrim(CompanyNumber), PeriodEnds)
select isnull(r.CompanyNumber, s.CompanyNumber)
,      convert(char(10), isnull(r.PeriodEnds, s.PeriodEnds), 23)
,      isnull(r.rclc2_rows,0), isnull(r.rclc2_var,0), isnull(s.sum_var,0), isnull(s.sum_oob,0)
,      cast(isnull(r.rclc2_var,0) - isnull(s.sum_var,0) as decimal(28,2)) as d_var
,      cast(isnull(r.rclc2_var,0) - isnull(s.sum_oob,0) as decimal(28,2)) as d_oob
from r full outer join s on r.CompanyNumber = s.CompanyNumber and r.PeriodEnds = s.PeriodEnds
order by 1, 2;
```

Company totals:

| DB | Company | RCLC2 residual | Summary `Variance` | Gap |
|---|---|---|---|---|
| Demo1 | 80002 | $258,285.85 | $258,090.34 | $195.51 |
| Demo1 | 80008 | $25,621.13 | $25,624.29 | -$3.16 |
| Demo2 | 80003 | -$263,619.04 | -$263,618.75 | -$0.29 |
| Demo2 | 80004 | $158,592.58 | $158,592.90 | -$0.32 |
| Demo2 | 80010 | $129,538.46 | $129,538.11 | $0.35 |
| Demo2 | 80013 | $87,209.88 | $87,209.85 | $0.03 |
| Demo2 | 80023 | $27,447.66 | $27,447.97 | -$0.31 |
| Demo3 | 30001 | -$12,397,237.96 | -$12,397,327.66 | $89.70 |
| Demo3 | 30002 | -$231,138.20 | -$230,782.06 | -$356.14 |

Best case is $0.03. Worst company total is $356.14. Worst single
(company, period) is Demo3 30002 / 2022-08-31 at **$2,359.39**, where
RCLC2 holds **zero rows**, followed by Demo3 30002 / 2023-03-31 at
**$2,009.05** and Demo3 30001 / 2022-12-31 at **$460.28**. Demo1 80002's
worst period is 2025-02-27 at $103.30. Demo2's worst is 80023 /
2025-08-31 at $1.70.

**D2. `OOB` is not the measure the claim is about.** `d_oob` above is off
by tens to hundreds of thousands on every row, in both directions: Demo1
80008 / 2025-07-31 differs by $27,212.82; Demo2 80003 / 2025-03-31 by
-$391,450.01; Demo3 30002 / 2023-05-31 by -$774,323.53. `OOB` is
`raccountsummary.outofbalance`, the full account out-of-balance
including carry-forward, cardex variance and journal entries. `Variance`
is `raccountsummary.transactionvariance`. The claim is about `Variance`.

**D3. The gap is fully attributable, and it is structural.**
`usp6_009_account_summary.sql:307-320` computes `transactionvariance`
from `rcardexledgercompare`, the **pre-netting** table:

```sql
sum(case when batch = 0 then cardexamount else 0 end)                      as endofday
, sum(case when batch > 0 and manualentry = 0
           then ledgeramount - cardexamount else 0 end)                    as transactionvariance
from rcardexledgercompare group by periodends, companynumber, shortaccount
```

`v6_008_reconcile`, the source of `RCardexLedgerCompare2`, applies two
further gates that the summary does not:

```sql
where   batchstatus = 0
and     batch > 0
and     manualentry = 0
and     shortaccount not in ('xxxxxxxx','yyyyyyyy', '')
group by batch, batchtype, a.periodends, a.companynumber, a.doctype,
         a.shortaccount, a.docnumber, a.ordertype, threshold
having  round(abs(sum(cardexamount) - sum(ledgeramount)),2) > threshold
```

`batchstatus = 1` is set by `usp6_007_merge_cx_gl.sql` at two grains:
per (batch, company, account, period, doctype) whose net is within
threshold (line 202), and per (company, account, work order, doctype)
across batches for `IC`/`IM`/`IH` whose net is within threshold (line
252). Both are correct for a worklist. Neither is applied to
`transactionvariance`.

The decomposition is exact on every (company, period):

```sql
;with g as (select CompanyNumber = rtrim(CompanyNumber), PeriodEnds
  , bs1_net = cast(sum(case when BatchStatus = 1 then cast(LedgerAmount as decimal(28,6))
                            - cast(CardexAmount as decimal(28,6)) else 0 end) as decimal(28,2))
  , bs0_net = cast(sum(case when BatchStatus = 0 then cast(LedgerAmount as decimal(28,6))
                            - cast(CardexAmount as decimal(28,6)) else 0 end) as decimal(28,2))
  from RCardexLedgerCompare where Batch > 0 and ManualEntry = 0
  and rtrim(isnull(ShortAccount,'')) not in ('xxxxxxxx','yyyyyyyy','')
  group by rtrim(CompanyNumber), PeriodEnds),
 r as (select CompanyNumber = rtrim(CompanyNumber), PeriodEnds
  , resid = cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
  from RCardexLedgerCompare2 where recstatus = 1 group by rtrim(CompanyNumber), PeriodEnds),
 s as (select CompanyNumber = rtrim(CompanyNumber), PeriodEnds
  , sumvar = cast(sum(cast(Variance as decimal(28,6))) as decimal(28,2))
  from v6ui_raccountsummary group by rtrim(CompanyNumber), PeriodEnds)
select isnull(isnull(g.CompanyNumber,r.CompanyNumber),s.CompanyNumber)
, convert(char(10), isnull(isnull(g.PeriodEnds,r.PeriodEnds),s.PeriodEnds), 23)
, isnull(s.sumvar,0) as summary_var, isnull(g.bs1_net,0) as bs1_excluded
, isnull(g.bs0_net,0) as bs0_pool,  isnull(r.resid,0) as rclc2_resid
, cast(isnull(g.bs0_net,0) - isnull(r.resid,0) as decimal(28,2)) as subthresh_dropped
, cast(isnull(s.sumvar,0) - isnull(r.resid,0) as decimal(28,2)) as total_gap
from g full outer join r on g.CompanyNumber = r.CompanyNumber and g.PeriodEnds = r.PeriodEnds
       full outer join s on isnull(g.CompanyNumber,r.CompanyNumber) = s.CompanyNumber
                        and isnull(g.PeriodEnds,r.PeriodEnds) = s.PeriodEnds
order by 1, 2;
```

`total_gap = bs1_excluded + subthresh_dropped` on all 35 measured
(company, period) rows, to the cent. Selected rows:

| DB | Co | Period | Summary `Variance` | RCLC2 residual | `batchstatus=1` | sub-threshold | Gap |
|---|---|---|---|---|---|---|---|
| Demo3 | 30002 | 2022-08-31 | $2,359.39 | $0.00 (0 rows) | $2,359.39 | $0.00 | $2,359.39 |
| Demo3 | 30002 | 2023-03-31 | $81,362.57 | $83,371.62 | -$2,009.05 | $0.00 | -$2,009.05 |
| Demo3 | 30001 | 2022-12-31 | -$401.44 | $58.84 | -$487.09 | $26.81 | -$460.28 |
| Demo3 | 30001 | 2022-08-31 | -$3,544,295.12 | -$3,544,373.52 | $2.23 | $76.17 | $78.40 |
| Demo1 | 80002 | 2025-02-27 | -$13,331.25 | -$13,227.95 | -$102.78 | -$0.52 | -$103.30 |
| Demo1 | 80008 | 2025-01-30 | $13,660.52 | $13,658.55 | $0.00 | $1.97 | $1.97 |

Demo3 30001 leaks sub-threshold value in every one of its 16 periods,
between $12.44 and $76.17 per period.

**D4. The worst slice, traced to one document.** Demo3 company 30002,
period 2022-08-31, at the exact grain `v6_008_reconcile` groups by:

```sql
select Batch, rtrim(BatchType), convert(char(10),PeriodEnds,23), rtrim(CompanyNumber)
, rtrim(DocType), rtrim(ShortAccount), DocNumber, rtrim(OrderType), BatchStatus, count(*)
, cast(round(sum(cast(LedgerAmount as decimal(28,6)))
           - sum(cast(CardexAmount as decimal(28,6))),2) as decimal(28,2))
from RCardexLedgerCompare where DocNumber = 501190 and rtrim(DocType) = 'IM'
group by Batch, rtrim(BatchType), PeriodEnds, rtrim(CompanyNumber), rtrim(DocType)
, rtrim(ShortAccount), DocNumber, rtrim(OrderType), BatchStatus;
-- 3279924 | 0 | 2022-08-31 | 30002 | IM | 00990220 | 501190 | WO | 1 | 3 | 2359.15
```

One row at the reconcile grain, `BatchStatus = 1`, net **+$2,359.15**. It
does not split into offsetting halves. Its three underlying lines are a
GL leg of -$196,110.06 against two cardex legs totalling -$198,469.21. It
appears nowhere in `RCardexLedgerCompare2`, under any `recstatus`:

```sql
select count(*), recstatus from RCardexLedgerCompare2
where DocNumber = 501190 and rtrim(DocType) = 'IM' group by recstatus;   -- no rows
select count(*), recstatus from RCardexLedgerCompare2
where Batch = 3279924 group by recstatus;                                -- no rows
```

The remaining $0.24 of that period's $2,359.39 is sub-threshold noise
across 758 documents that net exactly $0.00 and one that nets $0.18.

## Findings

### F1. REALISED. `v6ui_raccountsummary.Variance` cannot tie to the card residual, and `home.html` says it does

**What is wrong.** `home.html:8031-8034` asserts the summary `Variance`
column ties to the reconciling-items view "to the penny" and calls that
pairing a built-in dacpac-drift detector. The two are different measures
computed from different tables with different filters. They tie on zero
of the 35 (company, period) slices measured and on zero of the 9
company totals.

**Evidence.** D1, D3. Worst slice $2,359.39 on zero rows (Demo3 30002 /
2022-08-31). Worst company total $356.14 (Demo3 30002). Best case $0.03
(Demo2 80013). Gap decomposes exactly into `batchstatus = 1` exclusion
plus sub-threshold document netting on all 35 slices.

**Why it matters more than the dollars.** A drift detector that is
never zero cannot signal drift. It reads as noise, so a genuine dacpac
divergence would land inside the noise floor and go unnoticed. That is
the same failure mode as the `acctSummaryCacheKey` comment removed from
this file on 2026-08-09: a comment asserting a guarantee no code
provides.

**Fix.** Either compute the widget from the residual the cards are built
from, so the number the analyst sees and the number the cards sum to are
the same object, or keep the summary figure and relabel it as what it is
(account-grain transaction variance before netting), and drop the
drift-detector claim. If a drift detector is wanted, build it on a
measure both sides compute identically. Correcting the comment alone is
not enough: the widget currently shows a period total no card can
account for.

### F2. REALISED. Nine Demo3 rows are labelled Mfg Cost Mismatch inside the Unclassified drill, and the mislabel is a `gridCode()` branch-order bug

**What is wrong.** `gridCode()` in `config.js` tests
`OT === 'WO' && DT in (IM, IC, IH) -> 'MCM'` **before** it tests the
GL-only shape. All nine overlapping rows have `CardexAmount = 0.00`, so
they are GL-only entries, and the ladder labels them Mfg Cost Mismatch
instead. Home counts them under `T-MFG`; the pattern chip and the
findings engine inside that drill call them MCM and offer the MCM
investigation report.

**Evidence.** B4, plus:

```sql
select rtrim(CompanyNumber), convert(char(10),PeriodEnds,23), rtrim(OrderType)
, rtrim(DocType), DocNumber, cast(CardexAmount as decimal(28,2))
, cast(LedgerAmount as decimal(28,2)), cast(Variance as decimal(28,2))
from RCardexLedgerCompare2 where recstatus = 1 and isnull(rtrim(SubType),'') = ''
and rtrim(Type) = 'Mfg' and rtrim(upper(OrderType)) = 'WO'
and rtrim(upper(DocType)) in ('IM','IC','IH') order by 8;
```

Demo3 only. 9 rows, all company 30002, all `WO`/`IM`, all cardex 0.00,
total -$93,815.51. Largest is DocNumber 441322, 2022-10-31,
-$54,170.89. Demo1 and Demo2 return zero rows.

**Not a double count.** The `?card=` filter uses `code()`
(`inventory-transactions.html:4306`, `:3883`), so these rows appear in
one card drill only. No dollars are counted twice. The defect is that
the analyst is handed the wrong mechanism and the wrong corrective
action for -$93,815.51 of GL-only value.

**Fix.** Move the `GL-ONLY` and `CDX-ONLY` shape tests ahead of the
`MCM` order-type test in `gridCode()`, or gate the `MCM` branch on both
sides carrying value. A work-order row with no cardex leg is a GL-only
entry regardless of its order type.

### F3. REALISED. The analyst policy text states the variance sign backwards

**What is wrong.** The `ANALYST POLICY (transaction variance)` block in
`config.js` tells the model "Variance = cardex - ledger for that
document". The stored and displayed column is `LedgerAmount -
CardexAmount`, deliberately, per the comment at
`usp6_009_account_summary.sql:314`. Nothing in the UI flips it: a grep of
`inventory-transactions.html`, `home.html` and `variance-sources.js` for
a negation on `Variance` finds none.

**Evidence.** A2. Maximum absolute deviation from `Ledger - Cardex` is
`0.00000000` across 12,118 residual rows on three databases. The
Demo1 anchor pair makes the direction visible: order type `SI` is
+$241,866.00 and `SK` is -$241,970.37 for the same intercompany traffic.

**Consequence.** Any AI narrative that reasons about direction from the
policy line describes an overstatement as an understatement. The
grounding block is what the model reads to decide which side is short.

**Fix.** One-line correction in the policy text to
`Variance = ledger - cardex`. Check the same sentence in
`AnalysisGuides/transaction-detail-analysis.md` before editing, since
another agent owns that file this session.

### F4. LATENT. `SNJ` is a dead card that would abort the classifier if it ever fired

**What is wrong.** `config.js` carries a full `META` entry and a
`SUBTYPE` mapping for `'sales not journaled' -> 'SNJ'`. The claim was
withdrawn from the database on 2026-08-05
(`usp8_txv_flags.sql:461`: `-- J. WITHDRAWN 2026-08-05 -- "Sales Not
Journaled" was WRONG and is removed.`). No proc writes that SubType:

```bash
grep -o "SubType\s*=\s*'[^']*'" usp8_txv_*.sql | sort -u
# 16 distinct values, none of them 'Sales Not Journaled'
```

`'Sales Not Journaled'` is also absent from the Phase 4.1 exclusivity
whitelist at `usp8_txv_classify.sql:125`. So if any future claim wrote
it, Phase 4.1 would `raiserror` at severity 16 and abort the entire
classification run rather than surface the rows.

**Evidence.** Zero rows carry it on any demo (A1 census). This is a hole
in the code, not a live defect.

**Fix.** Remove the `SNJ` `META` and `SUBTYPE` entries, or add
`'Sales Not Journaled'` to the whitelist if the claim is coming back.
Leaving both halves out of sync is what makes the abort possible.

### F5. LATENT. The currency-conversion path can fan out the reconciling-items row set

**What is wrong.** `v6ui_reconcilingitems` left-joins `vcr_f1113` on
`(fromcurr, tocurr, ratetype)` and `a.periodends between d.startdate and
d.enddate`. If more than one rate row satisfies that predicate for a
period, the join multiplies every reconciling row, and the card totals
double-count directly. There is no `distinct` on this view (unlike
`v6ui_raccountsummary`, which carries `select distinct`).

**Evidence.** `select count(*) from vcr_f1113` returns **0** on all three
databases, so `rate` is always null, every `* rate` branch is dead, and
the fan-out cannot occur here. Shape found, unverified. This is
unexercised code, not clean code.

**Fix.** Prove the rate table is unique per (fromcurr, tocurr, ratetype,
date range) on a customer instance that actually has a report currency
before trusting the card totals there. If it is not unique, the join
needs a `top 1` or an aggregate collapse.

## Cleared

Do not re-run these. Each was measured on all three databases.

- **Card partition.** Cards sum to `recstatus = 1` exactly: 5,341 /
  4,684 / 2,093 rows and $283,906.98 / $139,169.54 / -$12,628,376.16.
  The client classifier reproduces the SQL partition with no loss.
- **`Variance` self-consistency.** Equals `LedgerAmount - CardexAmount`
  with maximum absolute deviation `0.00000000` on all 12,118 residual
  rows. The card total and the row detail agree.
- **Catalog coverage.** Every SubType present in the data maps to a
  card. Zero unmapped SubTypes, zero invisible rows.
- **Catalog 1:1-ness.** 17 SubTypes to 17 distinct codes. No SubType
  feeds two cards; no non-terminal card is fed by two SubTypes.
- **No card-level double counting.** The `?card=` drill filters on
  `code()`, so `gridCode()` cannot pull a row into a second card's row
  set. The overlap in F2 is a labelling defect, not a duplicated dollar.
- **View fidelity.** `v8ui_reconcilingitems` and `v6ui_reconcilingitems`
  are 1:1 with `recstatus = 1` in both row count and amount. Zero rows
  dropped by the `RInvAccountList` or `v6ui_getcompanies` inner joins.
  Zero duplicate keys in `RInvAccountList`, `ROffsetAccounts`
  (`VarSource = 'TRN'`) or `RCardexLedgerCompare2WorkNote`, so the three
  left joins do not fan out.
- **Reverse completeness.** No card rule can select a non-`recstatus = 1`
  row: the predicate sits inside the view's join.
- **Sentinel accounts.** `RCardexLedgerCompare2` carries zero rows on
  `xxxxxxxx` / `yyyyyyyy`, so `v6ui_raccountsummary`'s exclusion of them
  is not a source of the D gap. The `$51,012.00` that separates the raw
  `rcardexledgercompare` sum from the summary on Demo1 80002 is entirely
  the `yyyyyyyy` sentinel, correctly excluded.
- **Sanity anchors.** Demo1 co 80002 Sales by order type: `CW` 81 /
  $99,348.94, `CO` 25 / $25,044.84, `C2` 22 / $9,301.79, `SI` 13 /
  $241,866.00 all reproduce exactly. Demo3 co 30001 1,950 rows / 16
  periods and co 30002 143 rows / 12 periods reproduce exactly.
  Unclassified counts 6 / 198 / 1,308 reproduce exactly.
- **One anchor correction.** `SK` on Demo1 co 80002 Sales measures
  **-$241,970.37**, not +$241,970.37. Row count 14 is right and the
  magnitude is right to the penny, so this is a sign dropped in the
  anchor list, not a data movement. `SI` +$241,866.00 and `SK`
  -$241,970.37 are the two halves of the same intercompany traffic and
  must carry opposite signs.

## What could not be tested

- **The three whitelisted-but-uncatalogued SubTypes.**
  `'Labor/Variances'`, `'Scrap'` and `'Voucher Variance'` are accepted by
  Phase 4.1 (`usp8_txv_classify.sql:125`) and absent from
  `config.js`'s `SUBTYPE` map, so a row carrying one falls to a `T-*`
  terminal and warns once in the console. Zero demo rows carry any of
  them, so the behaviour is asserted by reading, not measured. DAC-52
  documents this as an accepted state.
- **The `DUP` branch of `gridCode()`.** Zero unclassified rows carry
  `Comment = 'check duplicate sales integrity'` on any demo, so the
  highest-precedence grid branch never fires. If it can fire on a row
  whose SubType is already set, the `DUP` label would override a
  server claim, and that path is unmeasured.
- **The currency path.** See F5. `vcr_f1113` is empty on all three
  demos.
- **Classifier stickiness.** Testing whether a stale SubType survives a
  re-run requires clearing and re-running `usp8_txv_classify`, which is a
  write. Not attempted. Every SubType observed is currently mapped, so
  no stale-claim defect is visible either way. The Phase 0a reset at
  `usp8_txv_classify.sql:65` scopes to `GroupCode = ''`, so grouped
  SubTypes (`Transfers` is the demo case, 15 rows / $185,272.76 on Demo1)
  are path-dependent by design and were not re-derived during this
  audit.
- **Browser rendering.** This audit is SQL and source reading only. That
  the Home card headline and the Details grid actually display the
  measured figures was not verified in a browser.
- **Phase 4 assertions in flight.** Both assertions were read, not run:
  4.1 tests whitelist membership only, and 4.2 tests `count(*)` before
  and after, not amounts. Neither would catch F1, F2 or F3. 4.2's
  `print` line does report `cleared_net` and `residual`, but it prints
  them rather than asserting on them, so a conservation break in dollars
  passes silently.
