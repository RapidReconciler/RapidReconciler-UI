# AN-5: re-measure of the unclassified Manufacturing residual

**Date:** 2026-08-27
**Type:** measurement only. No classifier change. No card proposed from plausibility.

Every figure in AN-1 and AN-13 predates seven weeks of card work. AN-5 exists
because DAC-40, DAC-41, DAC-42 and DAC-43 were all written against the session-#29
numbers, and each of them assumes a residual that may no longer be there.

**Population, identical to AN-1 and AN-13 so the figures stay comparable:**

```sql
select *
from   RCardexLedgerCompare2
where  recstatus = 1
and    rtrim(Type) = 'Mfg'
and    isnull(SubType, '') = ''
```

Netting threshold throughout: `abs(...) < 0.005`, a tolerance rather than a
rounded comparison.

**Hygiene:** aggregate only, following AN-1. Row counts, dollar sums of
`Variance`, and JDE document-type / order-type / batch-type signatures. No
account, item, company, order, batch or document identifiers appear anywhere in
this document. The identifiers behind each finding are recorded in the untracked
workspace `WORKLIST.md`.

---

## 1. Baseline

| DB | Companies with residual | Rows | Variance |
|---|---:|---:|---:|
| Demo1 | 1 | 546 | -108,835.44 |
| Demo2 | 1 | 2 | 1,936.37 |
| Demo3 | 2 | 41 | -200,459.36 |
| **All three** | | **589** | **-307,358.43** |

Demo2's manufacturing residual is two rows. It is finished as a subject.

---

## 2. Axis one: WIP scope

Rows whose account carries a `Work in Process` description in `RInvAccountList`.

| DB | Residual rows | WIP rows | WIP share of rows | WIP variance | WIP share of dollars |
|---|---:|---:|---:|---:|---:|
| Demo1 | 546 | 524 | 95.9% | -107,229.72 | 98.5% |
| Demo2 | 2 | 0 | 0% | 0.00 | 0% |
| Demo3 | 41 | 0 | 0% | 0.00 | 0% |

**Demo1 after excluding WIP: 22 rows, -1,605.72.** Every remaining shape is a
single-digit row count on Finished Goods or Purchased Parts accounts; the largest
single group is -1,184.72.

The Demo1 WIP population is one shape, not several. 474 of the 524 rows are
document type `IM` on work orders at batch type 0, carrying -106,373.08. The
remaining 50 rows split across `IM` and `IC` on two other work-order types and
total -856 between them.

**Demo2 and Demo3 have no WIP rows at all.** The three databases do not share a
condition, which is what DAC-41 said on 2026-08-05 and is still true.

> This axis is a measurement, not a recommendation. Excluding by account
> description would remove rows that reach their account through the raw-material
> and finished-goods AAIs, which is the retraction DAC-41 already carries. The
> number above says how much is at stake, not what to do about it.

---

## 3. Axis two: work-order grain

Grouping the residual at (company, order number, account, document type), the
grain established by owner ruling on 2026-08-05.

| DB | Residual rows | Groups formed | Groups netting to zero | Rows reclaimed |
|---|---:|---:|---:|---:|
| Demo1 | 546 | 540 | 0 | 0 |
| Demo2 | 2 | 2 | 0 | 0 |
| Demo3 | 41 | 41 | 0 | 0 |

**The work-order grain reclaims nothing from the residual on any database.** Not
a small amount. Zero rows and zero dollars, on all three.

**The reason matters more than the result.** `RCardexLedgerCompare2` is a
reconciling-items table, not the full comparison:

| DB | `RCardexLedgerCompare` | `RCardexLedgerCompare2` | compare2 share |
|---|---:|---:|---:|
| Demo1 | 1,717,136 | 5,583 | 0.33% |
| Demo2 | 477,324 | 4,819 | 1.01% |
| Demo3 | 1,244,917 | 2,095 | 0.17% |

Every row in compare2 carries a non-zero variance by construction — a check for
`abs(Variance) < 0.005` returns zero rows on all three databases. A matched pair
never enters the table. So a group can only net to zero if **both** unreconciled
halves are present, and they are not: Demo3 holds 2,042 cardex-only rows against
19 ledger-only rows.

A specimen makes it concrete. The work order DAC-40 cites has **exactly one row**
in compare2 — cardex amount present, ledger amount zero. The GL batch that row is
supposed to pair with does not exist in compare2 under any row. There is no
stranded second half to find.

**Consequence for DAC-40:** the grain change belongs upstream, in the merge that
builds `RCardexLedgerCompare`, and its effect is to stop rows from becoming
reconciling items in the first place. It is not a netting pass over compare2, and
anyone who implements it as one will measure zero and read it as a no-op.

---

## 4. Both axes together

Identical to axis one alone, on every database. The grain axis contributes
nothing to combine.

| DB | Baseline | After WIP | After grain | After both |
|---|---:|---:|---:|---:|
| Demo1 | -108,835.44 | -1,605.72 | -108,835.44 | -1,605.72 |
| Demo2 | 1,936.37 | 1,936.37 | 1,936.37 | 1,936.37 |
| Demo3 | -200,459.36 | -200,459.36 | -200,459.36 | -200,459.36 |

---

## 5. Which existing SubTypes shrink

**None.** The population these fixes target has already been claimed.

The manufacturing cards now standing:

| DB | SubType | Rows | Variance |
|---|---|---:|---:|
| Demo1 | Make to Order | 2,865 | -43,502.66 |
| Demo1 | Accounts | 732 | 1.04 |
| Demo1 | Mfg Cost Mismatch | 533 | 160,208.13 |
| Demo1 | Completion Not Journaled | 320 | -60,360.50 |
| Demo1 | Cross-Batch Completion | 3 | -2,263.17 |
| Demo3 | Cross-Batch Completion | 450 | -11,006,129.37 |
| Demo3 | Completion Not Journaled | 125 | -1,620,264.09 |
| Demo3 | Mfg Cost Mismatch | 71 | -103,408.77 |

**The 11,006,129.37 that DAC-40 was filed to remove is already carded.** Demo3's
`Cross-Batch Completion` holds 450 rows at exactly that amount — the same row
count and the same figure DAC-40 measured on 2026-08-05. It is not sitting in
Unclassified and it is not unexplained. It carries a card whose name states the
cause.

That does not make DAC-40 wrong. It changes what the fix buys: not moving dollars
out of Unclassified, but deciding whether a variance that is equal at the correct
grain should be reported at all. That is the question the owner ruled on, and this
measurement is why the acceptance test has to be a roll-forward tie-out rather
than a residual count.

---

## 6. Verdict: no new manufacturing card is warranted

Three reasons, one per database.

**Demo1** is one condition carrying 98.5% of its dollars, and DAC-41 already
names it. A card would duplicate an open row.

**Demo2** is two rows.

**Demo3's 41 rows sit on two accounts, one per company, and both are the same
object account with the same description.** Corrected 2026-08-27: an earlier draft
of this section said "a single account", which came from grouping by account
*description* rather than by account. The two are distinct accounts in distinct
business units that happen to share both a description and an object account, so
the pattern is a repeated one rather than a single point. One of the two also
carries the DAC-69 roll-forward break.

The shapes are `IM` across four work-order types plus two `IC` rows, all at batch
type 0. The two largest groups are -144,885.87 in a single row and -106,504.20
across sixteen.

**Investigated 2026-08-27, and there is no third finding here.** Demo3's account
summary carries exactly **one object account** — three short accounts in one
company, two in the other, and nothing else. Every inventory finding on this
database lands on one of those five rows because there is nowhere else for one to
land. The apparent convergence is an artifact of scope, not a shared cause.

The remainder DAC-69 cross-references was a **sign error on the two timing
components**, already found and fixed on 2026-08-19: the two subtract rather than
add, and adding them puts the error at exactly twice the timing amount. Verified
independently here — the signed identity holds on every row of all three
databases. The roll-forward break on the same account is unrelated, with a
decomposition error of 18 cents.

> Carry this forward: **the database with no timing activity cannot validate a
> timing-sign change.** One of the three has zero rows carrying a non-zero
> end-of-day or unposted amount, so every sign arrangement ties there, including
> the wrong ones. That is why the error shipped.

**Both questions are now settled, and neither produces a card.**

The Demo3 question: no defect. That database carries exactly one object account,
so every inventory finding lands there by necessity.

The Demo1 WIP scope question, investigated 2026-08-27: **the scope is already
correct and nothing should change.** The AAI that routes to the dollars-only WIP
holding account resolves to an account that is not in the inventory account list
and never enters the compare — it is already out. The five accounts the residual
actually sits on are routed to by eleven AAIs including the raw-material and
finished-goods pair, and by the standing ruling those belong *in* scope.
Excluding them would violate the ruling rather than implement it. The only thing
that made them look excludable is that their account description reads
`Work in Process`, and a description is not an AAI.

**What the residual is instead.** Both legs are present on these rows and they
differ, so nothing is missing — this is a tie-out failure, not an absence. 90.5%
of the dollars sit on **one subsidiary account** in **20 rows**, and 90.3% sit in
**13 of those rows at an identical ledger-to-cardex ratio of 10.1491**. The
mechanism is the same on all thirteen with no exceptions: two component items in a
fixed 1:5 quantity ratio, one GL line matching the larger component's cardex
amount to the cent, and a second GL line at an implied unit cost 10.1091 times the
cardex cost. The smaller component's cardex amount reaches the GL nowhere.

The factor is **not** a decimal shift, which would be exactly 10 or 100. Beyond
that the cause is not established: the GL detail table carries no item number, so
a GL line cannot be attributed to an item, and "the component is journaled twice
at two costs" is an inference. Settling it needs the two cost sources, not this
table.

**The finding that matters is a card-scope gap, not a WIP-scope one.** 517 of the
524 rows are material issues, and the `Mfg Cost Mismatch` claim is restricted to
completions — deliberately, so that issues are never netted against completions,
and the restriction is asserted in the proc. Nobody measured what falls outside
it. What falls outside it is 90% of this database's manufacturing residual. Filed
separately.

---

## 7. DAC-28 part 2: close it

Part 2 proposed a card for cardex postings on a model business unit against GL on
a real one. It is not buildable as specified, and it should not be respecified.

- The model business unit exists on **one** database, where it is the business
  unit of **every** account in `RInvAccountList` for that company. Selecting on it
  takes 5,432 of that database's 5,583 compare2 rows. It is not a pattern, it is
  the company's business unit.
- The other two databases have **zero** accounts on it. They use real business
  units.
- The document the pattern was named for is **already claimed** by an existing
  card, at 770.70. It was never in the residual.
- `RCardexLedgerCompare2` carries no business-unit column at all, only an account,
  so both legs of a row share one business unit by construction. The mismatch the
  card describes cannot be expressed in the table it would have to read.

Parts 1 and 3 shipped. With part 2 closed, DAC-28 closes.

---

## 8. Two traps this measurement hit

**`RInvAccountList.BusinessUnit` is `nchar(12)`, right-justified, five leading
spaces.** `rtrim` alone matches nothing and returns a clean, confident zero. The
first pass of section 7 reported no rows on any database and was wrong. Use
`ltrim(rtrim(...))` on every JDE business-unit comparison.

**Scope the residual with `recstatus = 1`.** Without it Demo1 reads 552 rows and
-108,834.55 instead of 546 and -108,835.44, because six rows at `recstatus = 2`
carry 0.89 between them. The difference is immaterial here, would not be
somewhere else, and the figures stop being comparable to AN-1 and AN-13.

---

## 9. What is still unmeasured

- Whether `RAccountInstrExp` rows are loaded from the JDE AAI source or derived by
  expansion. Bears directly on DAC-41, and is read-only.
- Why the GL half of the DAC-40 specimen is absent from compare2 rather than
  present and unpaired. Established here as a fact, not explained.
- Demo1's residual before and after an actual grain change in the upstream merge.
  This document measures compare2 as it stands; it does not simulate the fix.
