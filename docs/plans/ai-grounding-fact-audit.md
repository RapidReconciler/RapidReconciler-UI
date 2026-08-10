# AI grounding fact audit

Read-only audit, 2026-08-10. Every AI grounding block in V8 plus the
server-side block VALC prepends to every call. No file was edited, no
database was written. Every claim below carries the query or file that
settles it.

Triggered by the inverted variance sign in `ANALYST_GROUNDING`. That one
is already corrected in `config.js` (line now reads `ledger − cardex`)
and is documented in `docs/plans/txv-card-tie-out-audit.md` finding F3.
Its copies in the knowledge base are NOT corrected. See W7.

## Read first

`AiService.DMAAI_GROUNDING` is the worst block in the platform and it is
prepended to every `/api/v1/ai/explain` call on every surface. Four of
its claims are wrong. I fired the live model at `localhost:8080` and it
reproduced three of them verbatim in one sentence each. Nothing
downstream overrides them. This is the block to fix first, and it lives
in a repo no other agent is touching, so it can go immediately.

Separately, `_analystPrompt` in `home.html` computes the
transaction-variance facts and then never puts them in the prompt. The
Home analyst Ask-AI box asks the model for "the current issue and its
likely cause" while handing it no data about the current issue. Proven
live. That is S1 and it is more damaging than any single wrong sentence.

## Verdict

I checked every checkable claim in ten blocks, which comes to roughly
150 once the server block's AAI catalog is counted entry by entry. Ten
claims are wrong, spread across seven findings. Five more are
misleading and nine are uncorroborated. The worst is `_analystPrompt`
dropping its own facts, because it makes every guard inside
`_analystTxFacts` inert and leaves the server DMAAI block as the only
substantive grounding on that path. The worst wrong sentence is
`AiService.DMAAI_GROUNDING`'s AAI catalog, which misidentifies two AAI
pairs, one JDE program number and the model table's document type. The
analyst-facing card copy in `RRV8.txv` is sound apart from two claims,
and the four passthrough catalogs in `config.js` are in better shape
than the server block they sit under.

**Amendment, 2026-08-10.** Three verdicts above have moved since this
was written, so the counts in the paragraph above are stale. `NZR` was
cleared on a query against a derived table and is now a failed clear;
see the warning at the head of the Cleared section for the general rule
that miss produced. The card behind it, `DMAAI Net Zero`, has since been
withdrawn outright rather than reworded. U2 (AAI 3210) and U3 (no AAI 3140) are both resolved
in the grounding's favour against Oracle's published JD Edwards 9.2
manufacturing AAI documentation, which outranks this repo on AAI
identity and should be the first source consulted on the next pass. The
in-transit AAI conflict raised under M4 is settled by owner ruling.

## Process finding: the wrong claims cluster by kind, not by author

Four categories of error repeat, and each one points at a maintenance
gap rather than a slip.

**Unchecked AAI identity.** Four of the nine wrong claims are an AAI
number paired with the wrong purpose (`4126/4128`, `4134/4136`, `4152`
document type, and the voucher card's F4111 assumption). All four sit in
text authored from recall rather than from
`RRUniversity/inventory-distribution-aais.html`, which is the repo's one
complete AAI table and settles every one of them. Nothing in CI compares
grounding AAI claims against that table. That is the single change that
would have caught four of nine.

**Inference from a batch number.** `XBC` asserts that a stamped batch
proves the journal was written. `ANALYST_GROUNDING` forbids exactly that
inference in two separate bullets, `T-MFG` forbids it, and `CNJ` exists
because it is false. The same wrong inference was already fixed once in
the policy text and never swept out of the card copy. A policy
correction that does not grep the card catalog is half a fix.

**Specimen figures presented as pattern properties.** `ANALYST_GROUNDING`
contains a bullet that forbids quoting a count or percentage not given
for the install being read, and the same block then states "about two
thirds", "exceeds HALF", "about 1.7%" and "about 0.2%" as properties of
MTO and TXI. Those figures do reproduce on Demo1 and Demo3, which are
the datasets they came from, so they are honest measurements presented
at the wrong altitude. The rule exists; it is applied to `CNJ` and not
to its neighbours.

**Comment drift in `RRV8.txv`.** Five block comments in `META` sit above
the wrong entry, including the `WITHDRAWN SERVER-SIDE` warning that
belongs to `SNJ` and now sits above `OFF`. Maintainer-facing only, but
it means the one warning in the file is attached to a live card and the
dead card carries none.

---

# Findings

Ordered by severity. Commit grouping is called out per finding. Anchor
text is given instead of line numbers because `config.js` and
`home.html` are being edited by other agents while this is written.

## S1. WRONG. `_analystPrompt` never puts its facts in the prompt

**File.** `C:/source/repos/RapidReconciler-AI/RRV8/home.html`

**Anchor.** `function _analystPrompt(q, facts) {`

**Current text, verbatim and complete.**

```js
  function _analystPrompt(q, facts) {
    return 'You are RapidReconciler AI, a senior JDE inventory-reconciliation consultant advising an analyst.\n'
      // The glossary is the SHARED constant (config.js RRV8.GLOSSARY), not a copy.
      // It LEADS: a DMAAI reference is prepended server-side as the system prompt and is
      // dense with pairing language, and a definition that merely competes with it loses --
      // proven by shipping one mid-prompt and watching it lose twice.
      + (window.RRV8 && RRV8.GLOSSARY ? RRV8.GLOSSARY + '\n' : '')
      + 'IF THE QUESTION IS "WHAT IS X" AND X IS IN THAT GLOSSARY, answer from the glossary and nothing else.\n'
      + 'WHO IS ASKING: a reconciliation ANALYST. They work orders, documents, order types, programs and item movement — and they fix things at the source in JD Edwards. They are NOT posting the entries: do not answer in debits, credits, offsetting legs or which account is charged unless they ask about an account specifically. Wrong subject reads as unhelpful even when it is correct.\n'
      + 'Question: ' + q + '\n'
      + 'Answer in AT MOST 2 lines, UNDER 60 words total: the current issue and its likely cause, then the single corrective action — or, if nothing is current, "recent periods are clean, nothing to act on."\n'
      + 'A definitional question ("what is X") is answered by DEFINING X plainly with a concrete JDE example, not by reporting the current figures.\n'
      + (window.RRV8 && RRV8.AI_REGISTER ? RRV8.AI_REGISTER : '');
  }
```

**What is actually true.** The `facts` parameter is never referenced in
the body. Everything `_analystTxFacts` computes, including the UI-72
cold-surface guard documented in its own header comment, is discarded at
the call site. `ANALYST_GROUNDING` is absent too: the only consumer of
that catalog is `inventory-transactions.html`. So the Home analyst
transaction path reaches the model carrying `GLOSSARY`, a role line, the
question, a layout instruction and `AI_REGISTER`, and nothing else. Its
only substantive domain grounding is the server's `DMAAI_GROUNDING`,
which is the block with four wrong facts in it.

**Proof.** Reconstructed the shipped prompt from `config.js` and posted
it to `localhost:8080/api/v1/ai/explain`. Reply:

> No transaction-variance figures were provided in this message, so I
> can't name the biggest one or its cause. Give me the fingerprint /
> entry lines / model routing and I'll identify the current issue and
> the single corrective action.

"fingerprint / entry lines / model routing" is `DMAAI_GROUNDING`'s HARD
RULES wording surfacing to the analyst. Script:
`scratchpad/mkprompt.py`.

**Reach.** Model input, and the reply renders on screen in the Home
analyst answer band. Both.

**Replacement text.** Insert the facts block and the analyst catalog.
Put `GLOSSARY` first as the existing comment requires, and the facts
immediately before the question, matching `_analystCardexPrompt`.

```js
  function _analystPrompt(q, facts) {
    return 'You are RapidReconciler AI, a senior JDE inventory-reconciliation consultant advising an analyst.\n'
      // The glossary is the SHARED constant (config.js RRV8.GLOSSARY), not a copy.
      // It LEADS: a DMAAI reference is prepended server-side as the system prompt and is
      // dense with pairing language, and a definition that merely competes with it loses --
      // proven by shipping one mid-prompt and watching it lose twice.
      + (window.RRV8 && RRV8.GLOSSARY ? RRV8.GLOSSARY + '\n' : '')
      + 'IF THE QUESTION IS "WHAT IS X" AND X IS IN THAT GLOSSARY, answer from the glossary and nothing else.\n'
      + (window.RRV8 && RRV8.ANALYST_GROUNDING ? RRV8.ANALYST_GROUNDING + '\n' : '')
      + 'WHO IS ASKING: a reconciliation ANALYST. They work orders, documents, order types, programs and item movement — and they fix things at the source in JD Edwards. They are NOT posting the entries: do not answer in debits, credits, offsetting legs or which account is charged unless they ask about an account specifically. Wrong subject reads as unhelpful even when it is correct.\n'
      + 'Facts — the ONLY figures you may cite (never invent a number):\n' + (facts || []).join('\n') + '\n'
      + 'Question: ' + q + '\n'
      + 'Answer in AT MOST 2 lines, UNDER 60 words total: the current issue and its likely cause, then the single corrective action — or, if nothing is current, "recent periods are clean, nothing to act on."\n'
      + 'A definitional question ("what is X") is answered by DEFINING X plainly with a concrete JDE example, not by reporting the current figures.\n'
      + (window.RRV8 && RRV8.AI_REGISTER ? RRV8.AI_REGISTER : '');
  }
```

**Size of fix.** Two inserted lines. Re-verify by firing the same
question with warm data and confirming the reply names a figure from
`_analystTxFacts` and never says "fingerprint".

**Commit.** Alone, in a `home.html` commit. `home.html` is contended by
other agents, so sequence this last and re-read the function before
editing.

---

## S2. WRONG. `DMAAI_GROUNDING` calls 4126/4128 the RNV pair

**File.**
`C:/source/repos/RapidReconciler-Valc/src/main/java/coral/rapidreconciler/valc/service/AiService.java`

**Anchor.** `- 41xx Inventory: 4122/4124 inventory DR/CR`

**Current text, verbatim.**

> `- 41xx Inventory: 4122/4124 inventory DR/CR (adjust/issue/transfer/reclass; on doc type IT it should WASH to zero between branches); 4126/4128 RNV pair; 4134/4136 in-transit (must be DIFFERENT accounts to track goods in motion); 4152 physical-inventory / the model table on doc type PI (RR's account-assignment reference - a missing entry marks cardex "Unassigned"); 4162 cross-company transfer.`

This one line carries four separate wrong claims. They are fixed by one
replacement, so they are written up together.

**S2a. 4126/4128 is not the RNV pair.** It is the zero-balance
adjustment pair. `RRUniversity/inventory-distribution-aais.html:437`
and `:672`: "4126 / 4128 | Inventory / Expense or COGS | Zero balance
adjustment, used when quantity equals zero but dollars remain |
P4112, P4113, P4114, P4116". `RRUniversity/inventory-item-ledger.html:397`
and `RRUniversity/inventory-zero-balance.html:219` agree. RNV is 4320,
which the same grounding line names correctly two clauses later.
Confirmed against the live route data: 4126 appears on doc types
IA, II, IT on Demo1 and never on a purchasing doc type.

```sql
select tablenumber, doctype, count(*) from v8ui_dmaai_routes
where tablenumber in (4126,4128) group by tablenumber, doctype;
-- Demo1: 4126 IA 54 | 4126 II 26 | 4126 IT 54
```

`AnalysisGuides/dmaai-analysis.md:151` calls 4126 "Received Not
Vouchered (RNV) Debit" and is the lone KB source that does. Three KB
docs contradict it. Flag that file to the owner separately; do not
change it as part of this fix.

**S2b. 4134/4136 is not the in-transit pair.** It is the inventory and
expense cost-change pair. `RRUniversity/inventory-distribution-aais.html:439`:
"Records change to COGS when the cost of an item changes. Quantity
Revisions (P41022), Item Branch/Plant (P41026), Batch Cost Maintenance
(R41802)". `RRUniversity/inventory-costing.html:305` and `:306` name
4136 the WIP revaluation credit and 4134 the account R30822 uses for
on-hand revaluation. `AnalysisGuides/transaction-detail-analysis.md:843`
names them "AAI 4134 (Inv Cost Chg)" and "AAI 4136 (Exp Cost Chg)". In
the live route data 4134 appears only on doc type IB, the cost-change
and balance-adjustment type, and never on a transfer type.

```sql
select tablenumber, doctype, count(*) from v8ui_dmaai_routes
where tablenumber in (4134,4136) group by tablenumber, doctype;
-- Demo1: 4134 IB 55   Demo3: 4134 IB 25, 4134 ID 5
```

The "must be DIFFERENT accounts" advice is correct for the real reason,
which is the net-zero pattern at
`AnalysisGuides/transaction-detail-analysis.md:843`. Keep the advice and
fix the label.

**S2c. The model table's document type is not always PI.** It is per
company, from `RCompanies.AAIDocType`. `accounting-model-review.html`
says so in its own comment at "the document type is set per company in
JDE", and `RRV8.GLOSSARY` says so too. Demo1's live value is `99`.

```sql
select rtrim(CompanyNumber), rtrim(DocType), count(*) from v_integrity1_aai_base
group by CompanyNumber, DocType;
select rtrim(CompanyNumber), rtrim(AAIDocType) from RCompanies;
-- Demo1: both companies 99. Demo2, Demo3: PI.
```

**S2d. 4122/4124 are not both inventory.** 4122 is the inventory leg,
4124 is the expense or COGS leg
(`RRUniversity/inventory-distribution-aais.html:435`). They resolve to
the same kind of account only in the transfer case the same clause
already describes.

**Proof they reach the analyst.** Live POST to
`localhost:8080/api/v1/ai/explain`, body `{"prompt": "In two short
lines: what is DMAAI 4126 used for, and what is DMAAI 4134 used for?"}`.
Reply:

> - **4126:** RNV (received-not-vouchered) debit leg, one half of the
> 4126/4128 RNV pair.
> - **4134:** In-transit inventory, one half of the 4134/4136 pair (must
> post to DIFFERENT accounts to track goods in motion).

And `{"prompt": "Two short lines only. 1) Which document type does the
model DMAAI table 4152 use? 2) Which JDE program posts F0911 to
F0902?"}` returns `1) PI (physical inventory).` for the first half.

**Reach.** Model input only, on every AI call on every surface. No
on-screen prose. `GLOSSARY` corrects S2c on the two analyst prompts that
lead with it and nowhere else.

**Replacement text.** Replace the whole `- 41xx Inventory:` line with:

```
        - 41xx Inventory: 4122 inventory / 4124 expense-or-COGS (adjust/issue/transfer/reclass; on doc type IT both legs resolve to inventory and should WASH to zero between branches); 4126/4128 zero-balance adjustment (clears residual value when on-hand quantity reaches zero with dollars still on the row); 4134 inventory cost change / 4136 expense cost change (P4105 manual revision, R30822 revaluation; they must resolve to DIFFERENT accounts or the debit and credit cancel inside the inventory account and the cardex value never reaches the GL); 4141 COGS standard-cost variance on inventory transactions; 4152/4154 physical inventory, and 4152 is RR's model table whose DOCUMENT TYPE IS PER COMPANY (RCompanies.AAIDocType) and is often not PI, so never state a document type for it (a missing entry marks cardex "Unassigned"); 4162 cross-company transfer; 4172/4174 future cost update (R41052).
```

**Size of fix.** One line, one file, no other repo touched.

**Commit.** Group S2, S3, M1, M3, M4 and U1, U4, U5 into a single
`AiService.java` commit. No other agent is holding the Valc repo, and
every one of those edits lands on four adjacent lines of one string
literal, so splitting them would be harder to review than shipping them
together.

---

## S3. WRONG. `DMAAI_GROUNDING` names R09800 as the GL post program

**File.** `AiService.java`

**Anchor.** `R09800 posts F0911 to F0902`

**Current text, verbatim.**

> `R09800 posts F0911 to F0902 (an unposted batch shows as cardex-only).`

**What is actually true.** The program is R09801. `R09801` appears in six
KB files (`AnalysisGuides/gl-batch-analysis.md`,
`inv-account-roll-forward-analysis.md`,
`manufacturing-accounting-flow.md`, `transaction-detail-analysis.md`,
`AnalysisGuides/_grounding/rollforward.md`,
`RRUniversity/inventory-reconciliation.html`). `R09800` appears in
exactly one file in the entire repo, `docs/plans/dmaai-reference.md`,
which is this block's own source doc. `RRV8.ANALYST_GROUNDING` states
"R09801 only updates F0902", so the client and the server contradict
each other on the same fact.

**Proof.** `grep -rn "R09800" .` returns one hit outside the grounding
itself. The live model answers `2) R09800.` to the question above, so an
analyst asking which program to run gets a number that does not exist.

**Reach.** Model input only.

**Replacement text.**

```
R09801 posts F0911 to F0902 (an unposted batch shows as cardex-only).
```

Also correct the same string in `docs/plans/dmaai-reference.md`, which is
the declared source of truth for this block, or the next sync puts it
back.

**Size of fix.** Two single-token edits in two files.

**Commit.** With S2.

---

## S4. WRONG. The voucher card says a voucher never has an item-ledger side

**File.** `C:/source/repos/RapidReconciler-AI/RRV8/config.js`, in
`RRV8.txv` `META`, entry `'VCHR'`.

**Anchor.** `A voucher moves no inventory, so there is no item-ledger side to match against`

**Current text, verbatim.** Two strings in the same entry.

`desc`:

> `A/P voucher variance posted to an inventory account instead of the A/P variance account — DMAAI 4330 routes inventory items there. A voucher moves no inventory, so there is no item-ledger side to match against; the whole amount is the variance.`

`finding.checked[2]`:

> `'Item-ledger side: nothing. A voucher moves no inventory, so there is nothing to match.'`

**What is actually true.** AAI 4330 writes to F4111.
`RRUniversity/inventory-distribution-aais.html:231`: "4330 | Purchase
Price Variance / Inventory | Records variance when invoice amount at
voucher match differs from receipt amount. Requires Voucher Match
Variance Account flag to be checked in Line Type definition. **Written
to F4111.** Match Voucher to Open Receipt (P0411)". That doc flags
4332, 4335 and 4340 as "Not written to F4111" and deliberately does not
flag 4330. Measured on the live population, 1,033 of Demo2's 3,812
voucher rows carry a non-zero cardex amount holding $752,088.82 of
item-ledger value and $156,068.43 of variance. Demo3 has one of seven.

```sql
select tot=count(*),
       cardex_nonzero=sum(case when abs(CardexAmount)>=0.005 then 1 else 0 end),
       cdx_val=cast(sum(case when abs(CardexAmount)>=0.005 then abs(CardexAmount) else 0 end) as decimal(28,2)),
       var_on_those=cast(sum(case when abs(CardexAmount)>=0.005 then Variance else 0 end) as decimal(28,2))
from RCardexLedgerCompare2 where recstatus = 1 and rtrim(SubType) = 'Vouchers';
-- Demo1: 1 | 0 | 0.00 | 0.00
-- Demo2: 3812 | 1033 | 752088.82 | 156068.43
-- Demo3: 7 | 1 | 0.78 | 1038.59
```

The batch-type half of the card is correct: every voucher row on all
three databases carries BatchType V.

**Proof it reaches the analyst.** Live POST, `{"prompt": "One line: an
A/P voucher variance posted to an inventory account. Is there ever an
item-ledger (F4111) row for it?"}`. Reply:

> No. A/P voucher variances (PPV 4330, exchange-rate 4340, etc.) are
> GL-only postings, they hit F0911 but never write an F4111 cardex row.

**Reach.** `desc` and `finding.checked` render on screen in the Details
work panel and the card tooltip, and both go into the model prompt.
Both, and this is the worst of the on-screen ones because it tells the
analyst to stop looking at a column that holds $752K.

**Replacement text.**

`desc`:

```
      desc: 'A/P voucher variance posted to an inventory account instead of the A/P variance account — DMAAI 4330 routes inventory items there. Read the cardex column per row before assuming the whole amount is the variance: most voucher rows carry no item-ledger side, but DMAAI 4330 writes to F4111 when the line type has Voucher Match Variance Account checked, and those rows tie against a real cardex figure.',
```

`finding.checked[2]`:

```
          'Item-ledger side: read per row. A voucher variance normally moves no inventory, but DMAAI 4330 writes to F4111 when the line type has Voucher Match Variance Account checked, so a row carrying a cardex amount is compared against it, not against zero.'
```

**Size of fix.** Two strings in one `META` entry.

**Commit.** Group S4, S5, M5 and M6 into a single `config.js` commit.
`config.js` is contended by four agents, so re-read the `VCHR` and `XBC`
entries immediately before editing.

---

## S5. WRONG. `XBC` infers a written journal from a stamped batch

**File.** `RRV8/config.js`, `RRV8.txv` `META`, entry `'XBC'`.

**Anchor.** `so R31802A ran and wrote the journal in the same step`

**Current text, verbatim.** `finding.checked[2]`:

> `'Batch present on the item-ledger row, so R31802A ran and wrote the journal in the same step.'`

**What is actually true.** `RRV8.ANALYST_GROUNDING` states the opposite
twice, in the block that is the declared policy for this surface: "a
batch number PRESENT means only that R31802A processed the row, it is
NOT a guarantee the journal entry was written: R31802A is OBSERVED
stamping the cardex batch and writing NO completion entry for a subset
of each run. Never infer 'the entry therefore exists' from a batch
number." And: "The BATCH NUMBER is a research handle... it is NOT
evidence the transaction reached the GL." `T-MFG` says the same. The
`CNJ` card exists because the inference fails: on Demo1, 320 rows carry
a stamped batch and no GL completion, and on Demo3, 125 do.

```sql
select rtrim(SubType), count(*) n,
       sum(case when isnull(Batch,0)=0 then 1 else 0 end) batch_zero
from RCardexLedgerCompare2 where recstatus = 1
  and rtrim(SubType) in ('Cross-Batch Completion','Completion Not Journaled')
group by SubType;
-- Demo1: Completion Not Journaled 320 / 0 zero-batch | Cross-Batch Completion 3 / 0
-- Demo3: Completion Not Journaled 125 / 0 zero-batch | Cross-Batch Completion 450 / 0
```

Every row on both cards has a batch. The batch therefore discriminates
nothing between them, and `XBC`'s own first two `checked` bullets
already carry the real evidence (an F0911 completion exists, and the two
sides tie at work-order grain). The third bullet adds a forbidden
inference for no gain.

**Reach.** `finding.checked` renders on screen in the findings panel that
the analyst files as their investigation report, and it goes to the
model. Both. An investigation report that asserts a batch proves posting
is wrong in front of a third-party reader in the Audit Center.

**Replacement text.** `finding.checked[2]`:

```
          'Batch present on the item-ledger row, so R31802A processed it. That is not evidence the journal was written; the F0911 completion found above is.'
```

**Size of fix.** One string.

**Commit.** With S4.

---

## S6. WRONG. The variance sign is still inverted in the knowledge base

**Files and anchors.**

1. `AnalysisGuides/transaction-detail-analysis.md`, anchor
   `The variance is \`cardex − ledger\` for that document and nothing else.`
2. `AnalysisGuides/_grounding/analyst.md`, anchor
   `Variance = cardex − ledger for that document.`
3. `docs/plans/analyst-grounding-distillation.md`, anchor
   `Per-document reconciliation (cardex − ledger for the same doc)`

**Current text, verbatim.**

1. > `A transaction variance reconciles **one document**: the F4111 (item ledger / cardex) extended value against the F0911 (GL / ledger) for the *same* company, document, and account. The variance is \`cardex − ledger\` for that document and nothing else. Two habits follow from this:`
2. > `- A transaction variance reconciles ONE document: F4111 (item ledger / cardex) extended value vs F0911 (GL / ledger) for the SAME document and account. Variance = cardex − ledger for that document. Explain each document on its own terms.`
3. > `- Per-document reconciliation (cardex − ledger for the same doc) → guide §3.10`

**What is actually true.** The stored and displayed column is
`LedgerAmount − CardexAmount`, deliberately.

```sql
select count(*) rows_,
       max(abs(Variance-(LedgerAmount-CardexAmount))) dev_ledger_minus_cardex,
       max(abs(Variance-(CardexAmount-LedgerAmount))) dev_cardex_minus_ledger
from RCardexLedgerCompare2 where recstatus = 1;
-- Demo1  5341 | 4.7e-12 | 198929.62
-- Demo2  4684 | 7.0e-12 | 281397.92
-- Demo3  2093 | 2.9e-11 | 685913.64
```

`RapidReconciler-DB/RapidReconciler/dbo/Stored Procedures/usp6_009_account_summary.sql:314`
documents the flip in the code: `sum(case when batch > 0 and manualentry = 0
then ledgeramount - cardexamount else 0 end) as transactionvariance
-- GL - CX (same perspective as OOB); was CX - GL`.

**Why this matters after the `config.js` fix.**
`transaction-detail-analysis.md` is the declared SOURCE OF TRUTH for
`ANALYST_GROUNDING`, `_grounding/analyst.md` is the generator seed that
`Tools/build-ai-grounding.py` will read when ANALYST flips from
passthrough to generated (`SOURCES["ANALYST"]` already names its
successor), and an analyst reads the guide directly. Leaving these
un-fixed means the corrected `config.js` line is one regenerator run
from reverting.

**Reach.** The guide is read by humans, not the model. `_grounding/analyst.md`
reaches nothing today and reaches the model on the next generator
promotion.

**Replacement text.**

1. In `transaction-detail-analysis.md`:

```
A transaction variance reconciles **one document**: the F4111 (item ledger / cardex) extended value against the F0911 (GL / ledger) for the *same* company, document, and account. The variance is `ledger − cardex` for that document and nothing else, so a POSITIVE variance means the GL carries more value than the item ledger and a NEGATIVE variance means the item ledger carries more. Two habits follow from this:
```

2. In `_grounding/analyst.md`:

```
- A transaction variance reconciles ONE document: F4111 (item ledger / cardex) extended value vs F0911 (GL / ledger) for the SAME document and account. Variance = ledger − cardex for that document. So a POSITIVE variance means the GL carries more value than the item ledger, and a NEGATIVE variance means the item ledger carries more. Never state a direction without applying that subtraction. Explain each document on its own terms.
```

3. In `analyst-grounding-distillation.md`:

```
- Per-document reconciliation (ledger − cardex for the same doc) → guide §3.10
```

**Size of fix.** Three strings in three files, none of them contended.

**Commit.** Group S6 and S7 into one commit under `AnalysisGuides/` plus
`docs/plans/`. Neither file is held by another agent.

---

## S7. WRONG. The cardex catalog's aggregation grain ignores cost method

**File.** `C:/source/repos/RapidReconciler-AI/AnalysisGuides/_catalog/analyst/cardex.md`,
inside the ` ```grounding ` fence.

**Anchor.** `USE THE RIGHT AGGREGATION SCOPE: cost-level 1 and 2 items reconcile at branch/item`

**Current text, verbatim.**

> `- USE THE RIGHT AGGREGATION SCOPE: cost-level 1 and 2 items reconcile at branch/item (all locations and lots summed together); cost-level 3 items reconcile per location and lot. Comparing at the wrong grain manufactures a false variance.`

**What is actually true.** The grain is set by cost METHOD and cost
level together, and cost level alone gets it wrong for standard-cost
items.
`RapidReconciler-DB/RapidReconciler/dbo/Stored Procedures/usp8_cardex_variance.sql:46`:

```sql
case when a.costmethod in ('02','09') and b.costlevel = '1' then 'item'
     when a.costmethod in ('02','09') and b.costlevel = '2' then 'branch'
     else 'loclot' end as grainlevel
```

So cost level 1 reconciles at item with no branch at all, not
"branch/item". Cost level 2 reconciles at branch only for cost methods
02 and 09. A standard-cost item (method 07) reconciles per location and
lot at every cost level, and so does any other method. Demo1's live
worklist is 99% that case:

```sql
select rtrim(CostMethod) cm, rtrim(CostLevel) cl, rtrim(GrainLevel) gl, count(*) n
from v8ui_cardexworklist group by CostMethod, CostLevel, GrainLevel;
-- Demo1: 02 | 2 | branch | 8      and      07 | 2 | loclot | 1283
```

Following the current bullet on those 1,283 rows means summing all
locations and lots for a cost-level-2 item, which is exactly the false
variance the bullet's own last sentence warns about.

**Reach.** Nothing today. This file is the PROMOTED source of truth for
`RRV8.CARDEX_GROUNDING` and `Tools/build-ai-grounding.py` has
`GENERATE = ("ADMIN", "CARDEX")`, but the generator has not been run
since this catalog was authored: `config.js` `CARDEX_GROUNDING` still
carries the older seven-bullet text and none of the catalog's three new
bullets. Fix it before the generator runs or it ships wrong.

**Replacement text.**

```
- USE THE RIGHT AGGREGATION SCOPE, and it is set by cost METHOD as well as cost level. An average-cost item (method 02) or actual-cost item (method 09) reconciles at ITEM when its cost level is 1 (branch not in the key), at BRANCH/ITEM when its cost level is 2, and per LOCATION AND LOT when its cost level is 3. A standard-cost item (method 07) reconciles per LOCATION AND LOT at every cost level, and so does any other cost method. Comparing at the wrong grain manufactures a false variance.
```

**Size of fix.** One fenced bullet. Re-run
`python Tools/build-ai-grounding.py` afterwards, or the catalog and
`config.js` stay out of step. Note that `Tools/build-ai-grounding.py`
itself is modified in the working tree by another agent, so confirm the
generator is stable before running it.

**Commit.** With S6.

---

# MISLEADING

Same treatment as WRONG: replacement text given. M2 is absent because
`4122/4124 inventory DR/CR` is wrong rather than misleading and is
written up as S2d.

## M1. `DMAAI_GROUNDING` opens by asserting every move posts both sides

**File.** `AiService.java`. **Anchor.** `HOW JDE POSTS: Every inventory move writes an F4111 cardex row and a matching F0911 GL row`

**Current text.**

> `HOW JDE POSTS: Every inventory move writes an F4111 cardex row and a matching F0911 GL row via a DMAAI-routed account; a variance = the two disagree on account, period, or amount.`

**Why it misleads.** It primes the model to treat a one-sided row as
impossible, and one-sided rows are most of what the product surfaces.
The same block lists 4332, 4335 and 4340 as GL-only three lines later.
`ANALYST_GROUNDING` devotes two bullets to non-stock lines that post to
the GL and write no F4111 row. `ANALYST_GROUNDING` also states that IM
and IC are written to F4111 with no batch and no G/L date until R31802A
runs. This sentence is the first thing the model reads on every call.

**Replacement text.**

```
        HOW JDE POSTS: an inventory move normally writes an F4111 cardex row and a matching F0911 GL row via a DMAAI-routed account, and a variance = the two disagree on account, period, or amount. One-sided is normal in named cases, not a contradiction: a non-stock line (F40205 Inventory Interface N) posts to the GL and writes no F4111 row; 4332/4335/4340 are GL-only; and manufacturing IM/IC rows are written to F4111 with no batch and no G/L date until R31802A stamps them and writes the journal. Never say a one-sided row cannot exist.
```

**Reach.** Model input only, every call. **Commit.** With S2.

## M3. `DMAAI_GROUNDING` still calls 4365/4370 unconfirmed

**File.** `AiService.java`. **Anchor.** `4365/4370 are unconfirmed`

**Current text.**

> `4365/4370 are unconfirmed (RR docs say direct-ship/outside-ops settlement; Oracle documents 4375 for routing) - verify against the client's F4095.`

**Why it misleads.** The KB has since settled it.
`RRUniversity/inventory-distribution-aais.html:237`: "4365 / 4370 |
Prior to Receipt/Completion Liability / Routing Operation | Records
journal entries at specified steps in a receipt route. Movement &
Disposition (P43250)". So the hedge is stale and its parenthetical
misreports what the RR docs say. 4365 is live in Demo3 on doc types OA,
OD, OP.

**Replacement text.**

```
4365/4370 receipt-routing liability / routing operation (journal entries at named steps in a receipt route, P43250);
```

**Reach.** Model input only. **Commit.** With S2.

## M4. `DMAAI_GROUNDING` names 4245 as the in-transit debit unconditionally

**File.** `AiService.java`. **Anchor.** `on ST transfer shipments 4245 becomes Inventory In-Transit`

**Current text.** Two places, the 42xx catalog line and the closing IT
Transfers line.

> `4245 A/R trade - but on ST transfer shipments 4245 becomes Inventory In-Transit and must equal 43xx 4320 or every transfer leaves a residual;`

> `- IT Transfers: internal branch-to-branch uses 4122/4124 (wash to zero); sales-side ST 4245 must resolve to the SAME clearing account as purchase-side OT 4320.`

**Why it misleads.** Which AAI carries the in-transit debit depends on
the transfer pricing. `RRUniversity/transfer-order-reference.html:737`
gives 4220 as the In Transit debit on a transfer at cost, and `:764`
gives 4245 on a transfer at cost plus, with `:782` stating the
difference explicitly. `RRV8.ANALYST_GROUNDING` names "the 4220 / 4245
in-transit clearing account", which matches that doc. So the server
block sends the analyst to check 4245 on transfers where 4220 is the
account that matters.

**KB conflict, SETTLED 2026-08-10 by owner ruling.** The in-transit
debit is **4220 on a transfer at cost** and **4245 on a transfer at cost
plus**. `transfer-order-reference.html:737` and `:764` were already
right. `RRUniversity/inventory-distribution-aais.html` put the debit on
4245 in all cases and said 4220 and 4240 "self-cancel within the ST doc
and are not the cross-cycle clearing pair"; that callout has been
rewritten to carry both cases. `AnalysisGuides/dmaai-analysis.md` no
longer records this as an open question. The replacement text below
already tells the model to read the pricing first, so it matches the
ruling and needs no further change.

**Still open, in a file this pass does not own.**
`Tools/analyzer-engine.js:126` asserts 4220 is "NOT the in-transit
clearing account", `:130` puts that role on 4245 unconditionally, and
`:1988` notes "in-transit uses 4245 / 4320". The analyzer's
`transfer_clearing` check in `Tools/analysis-workbook.html` compares
4245 against 4320 and therefore never tests a transfer-at-cost install,
while its own finding label reads "Transfer clearing mismatch (4220 vs
4320 resolve differently)". Owner call on whether the check should cover
both pairings.

**Replacement text.** 42xx line clause:

```
4245 A/R trade, but on ST transfer shipments it is repurposed to Inventory In-Transit;
```

IT Transfers line:

```
        - IT Transfers: internal branch-to-branch uses 4122/4124 (wash to zero). On an ST/OT transfer the sales-side In-Transit debit comes from 4220 when transferring at cost and from 4245 when transferring at cost plus, so READ THE TRANSFER PRICING before naming the AAI. Whichever one fired must resolve to the SAME clearing account as the purchase-side OT 4320 credit, or every transfer leaves a residual.
```

**Reach.** Model input only. **Commit.** With S2.

## M5. `MCM` calls WIP revaluation optional

**File.** `RRV8/config.js`, `RRV8.txv` `META`, entry `'MCM'`, `desc`.

**Anchor.** `WIP revaluation is optional under standard costing`

**Current text.**

> `WIP revaluation is optional under standard costing, needs the variance AAI configured for the routing, and skips work orders already closed.`

**Why it misleads.** The KB treats it as required, not optional.
`AnalysisGuides/cardex-variance-analysis.md:232`: "WIP Revaluation
(R30837) must be run from R30822 when standards change".
`AnalysisGuides/frozen-cost-integrity-analysis.md:469`: "R30837 (WIP
Revaluation) must be run to revalue open WIP to the new standard.
Failing to run R30837 will produce a Standard Cost Change row in F4111
with no matching GL entry". "Optional" reads as "you may reasonably skip
it", which is the decision that creates this card. The closed-work-order
half is correct: the same source scopes it to open orders, status < 99.

**Replacement text.**

```
      desc: 'The item ledger and the GL valued the same completion quantity at different unit costs. The variance is quantity times the difference. The usual driver is a cost that moved between the item-ledger write and the accounting run: a frozen cost update moved the standard after the completion posted and WIP revaluation never carried it through. WIP revaluation is a separate step from the cost update and it must be run when standards change, not skipped; it reaches only work orders still open, so anything already closed stays at the old basis.',
```

**Reach.** `desc` renders on screen in the Details work panel and the
card tooltip, and goes to the model. Both. **Commit.** With S4.

## M6. Five `RRV8.txv` block comments sit above the wrong entry

**File.** `RRV8/config.js`, `RRV8.txv` `META`.

**What is wrong.** The comments have slipped relative to the entries
they document:

| Comment anchor | Sits above | Describes |
|---|---|---|
| `Two F0911 legs that cancel, neither on the inventory account. LedgerAmount = 0` | `'VCHR'` | `OFF` |
| `The sales-side analog of CNJ` and `⚠ WITHDRAWN SERVER-SIDE (DB PR #97)` | `'OFF'` | `SNJ` |
| `Every line on the order is non-stock (F40205 Inventory Interface 'N')` | `'XBC'` | `NCL` |
| `// IT cardex-integrity — cost-component setup fix at the source.` | `'SNJ'` | `TXI` |
| `BATCH CANNOT AGGREGATE MANUFACTURING AMOUNTS (owner ruling 2026-08-05)` | the LINKED section header | `XBC` |

**Why it matters.** The one warning in the file, that a card cannot fire
and its copy describes withdrawn behaviour, is attached to `OFF`, which
is live and holds 128 Demo1 rows. `SNJ`, which is the withdrawn one and
holds zero rows on every database, carries no warning. A maintainer
reading either entry is told the wrong thing.

```sql
select isnull(nullif(rtrim(SubType),''),'(none)'), count(*)
from RCardexLedgerCompare2 where recstatus = 1 group by SubType;
-- 'Sales Not Journaled' absent on Demo1, Demo2 and Demo3.
-- 'Offsetting Entries' = 128 on Demo1.
```

**Reach.** Maintainer-facing only. No analyst or model exposure.

**Replacement.** Move each comment block to immediately above the entry
it describes. No text changes. Already reported as `txv-card-tie-out-audit.md`
finding F4 for the `SNJ` half; this adds the four other slips.

**Commit.** With S4, or separately if the diff gets noisy.

---

# UNCORROBORATED

No replacement text invented for these. Recommendation per item.

| # | Block and claim | Evidence state | Recommendation |
|---|---|---|---|
| U1 | `DMAAI_GROUNDING`: `4337` included in `(4332/4335/4337/4340 are GL-only - no cardex)` | `inventory-distribution-aais.html` marks 4332, 4335 and 4340 "Not written to F4111" and marks 4330 and 4385/4390 as written. It says nothing either way about 4337. No 4337 rows in any demo route table. | Weaken: drop 4337 from the parenthetical, leaving `(4332/4335/4340 are GL-only - no cardex)`. The KB supports the other three and does not support 4337. |
| U2 | `DMAAI_GROUNDING`: `3210 clear-WIP additional COGS (actual costing only)` and 3210 listed under `R31804 posts variances` | **RESOLVED 2026-08-10. The grounding was right and the KB was the incomplete source.** Oracle's JD Edwards 9.2 manufacturing AAI page names 3210 Clear Work in Process, describes it as posting cost of goods sold that the completions did not pick up under actual costing, and lists it among the AAIs R31804 posts. Demo3's raw `F4095` holds 62 rows for 3210. | No change to the grounding. `inventory-distribution-aais.html` now carries 3210 in its 31xx table, its R31804 enumeration and its quick reference; `end-of-day-analysis.md` §8.1 and `transaction-detail-analysis.md` §IV carry it too. |
| U3 | `DMAAI_GROUNDING`: `There is NO AAI 3140.` | **RESOLVED. The claim is correct and it was already sourced.** Oracle's 9.2 manufacturing AAI page lists 3110, 3120, 3130, 3210, 3220, 3240, 3260, 3270, 3280 and 3401, with no 3140. Raw `F4095` returns zero 3140 rows on Demo1, Demo2 and Demo3. `docs/plans/dmaai-reference.md:65` and `:195` recorded it as confirmed against Oracle JDE 9.2 on 2026-07-06, in the very file this grounding block is distilled from. | Leave the grounding as-is. The "sourceless" verdict in the original row was wrong: the source was one file away and this audit did not check it. Same failure mode as the `NZR` false positive, one level up: absence in the KB was read as absence of a source. |
| U4 | `DMAAI_GROUNDING`: `4240 inventory (DR)` | `inventory-distribution-aais.html:211` gives 4240 as "Inventory, Standard sales transaction journal entry" with no direction. Line 218 of the same doc has 4240 as the CREDIT to inventory at the shipping branch on ST. | Weaken: drop the `(DR)` and leave `4240 inventory`. Direction depends on the document. |
| U5 | `DMAAI_GROUNDING`: `3260 (planned vs current)`, `3270 (current vs frozen standard)`, `3280 (rollup/qty/rounding)` | The KB names these Planned Variance, Engineering Variance and Other Variance, with no mechanism description for any of them. The grounding's glosses are plausible and uncited. | Weaken to the KB's own names: `3260 planned variance / 3270 engineering variance / 3280 other variance`. The mechanism gloss adds nothing the analyst acts on and it is the part with no source. |
| U6 | `RRV8.txv` `MCM.action`: `Confirm the variance AAI, 3240 or 3260, is configured for the routings in use.` | The KB links WIP revaluation to 4134/4136 (`inventory-costing.html:305`) and links 3240/3260 to R31804 variance accounting, not to R30837. No source connects either number to WIP revaluation. | Escalate to owner. This is the one corrective instruction in the card that names a specific AAI, so a wrong number sends the analyst to the wrong configuration screen. |
| U7 | `DMAAI_GROUNDING` and `RRV8.txv` `ACCT`/`PER`: `R42800 PO 5 (BU source)` drives account mismatch and `PO 1 (GL date)` drives period mismatch; also `P4312 PO 2`, `P4314 PO 2`, `P4111 PO 1/PO 2` | Consistent across three places in the codebase. I found no KB source stating any of the processing-option numbers. | Escalate to owner. Cheap for an SME to confirm against a live JDE, impossible to confirm from this repo. Leave as-is until confirmed. |
| U8 | `RRV8.txv` `META.SNJ`: the whole entry's `cause`, `desc`, `action` and `finding` | The card is withdrawn server-side and cannot fire. Zero rows carry `'Sales Not Journaled'` on any database. Its copy describes behaviour no proc produces, and the prior audit records why the test was wrong (it keyed on DocNumber, and sales doc type JS posts internal GL document numbers). | Delete the `META` entry and its `SUBTYPE` mapping, or add `'Sales Not Journaled'` to the Phase 4.1 whitelist if the claim is coming back. Already `txv-card-tie-out-audit.md` F4; not re-opened here. |
| U9 | `DMAAI_GROUNDING` AAI catalog omits 4141, 4172/4174, 4315, 4350/4355, 4385/4390 and 4400/4405 | All are documented in `inventory-distribution-aais.html`, and 4172, 4385 and 4400 carry live routes on all three demo databases (Demo1: 4172 on WD, 4385 on OT, 4400 on OL/OM/OO/OP/OT). The catalog is scoped to "transaction-variance families", so this is a coverage gap, not a wrong fact. | Owner call on scope. The S2 replacement adds 4141 and 4172/4174 because they sit on the line being rewritten anyway. Adding 4385/4390 and 4400/4405 needs a decision about how long this block should get. |

---

# Cleared

Checked and confirmed correct. Do not re-run these.

> ⚠ **Read this before trusting "do not re-run."** One entry below was
> cleared by querying `v8ui_dmaai_routes`, a table RapidReconciler
> derives from `F4095`, to settle whether an AAI was configured in the
> customer's JDE. That measurement cannot answer the question. The
> loader drops AAIs it was never scoped to carry, so a derived table
> returning zero rows tells you about the loader and nothing about JDE.
> The `NZR` entry is corrected in place below and is now a failed clear
> rather than a clear.
>
> The general rule the miss produced: **an absence claim has to be
> measured against the raw source table.** A presence claim can be
> cleared from a derived table, because a row that survived the load
> existed upstream. An absence claim cannot. Anything below that reads
> "zero rows in `v8ui_dmaai_routes`", "not in `RAccountInstr`" or "does
> not appear in the KB" is at best a weaker result than it looks, and
> the next reader should re-measure rather than inherit the verdict.

## `AiService.DMAAI_GROUNDING`

- `Sign: variance = ledger - cardex.` Correct, and it was correct while
  `config.js` was wrong. Max absolute deviation ~1e-11 across 12,118
  rows on three databases.
- `Account key = BusinessUnit.Object.Subsidiary; the DMAAI supplies the
  object (+ optional subsidiary), the BU comes from the transaction or a
  processing option.` Matches `v_integrity1_aai_base` columns
  (`BusUnit`, `Object`, `Subsidiary`, `BUSource`, `SubSource`).
- `3110 raw-material inventory (CR, IM, offsets WIP)`. KB
  `inventory-distribution-aais.html:109` and `:324`.
- `3120 WIP (DR issues/labor, CR completions - the hub every mfg leg
  offsets to)`. KB `:110` and `:325` (IM debit, IH debit, IC credit, IV
  either).
- `3130 finished-goods/sub-assembly (DR, IC/IS)`. KB `:111` and `:326`.
- `3220 (actual vs planned hours)` and `3240 (actual vs planned
  material)` map to the KB's Labor Variance and Material Variance.
- `3401 payroll/outside-ops accrual (CR, IH)`. KB `:117` and `:332`.
- `4122/4124 ... on doc type IT it should WASH to zero between
  branches`. KB `:194`. Confirmed in route data: 4122 carries doc type
  IT on Demo1 and Demo3.
- `4152 ... RR's account-assignment reference`. KB `:198`: "Also used by
  RapidReconciler as the default DMAAI to determine inventory accounts."
- `4162 cross-company transfer`. `AnalysisGuides/dmaai-analysis.md:211`
  and `:512`. Live on Demo1 (IA/II/IT) and Demo2 (IX).
- `4210 inventory relief (CR)`, `4220 COGS (DR)`, `4230 revenue`,
  `4250 tax`, `4260 inter-branch revenue`, `4270/4280 advanced price`.
  KB `:208` to `:217`.
- `4310 inventory receipt (DR)`, `4320 received-not-vouchered (CR at
  receipt, DR at voucher match)`, `4330 purchase-price variance`,
  `4332 cost-of-sales variance`, `4335 standard-cost variance`,
  `4337 material burden`, `4340 exchange-rate variance`,
  `4375 receipt-routing disposition`. KB `:228` to `:239`.
- `4332/4335/4340 are GL-only - no cardex`. KB marks each "Not written
  to F4111" at `:232`, `:233`, `:235`. (The 4337 half is U1.)
- `R31802A posts completion (3110/3120/3130/3401)`. KB `:109` to `:117`.
- `R31804 posts variances (3210/3220/3240/3260/3270/3280)`. Correct in
  full, including 3210. Confirmed against Oracle's JD Edwards 9.2
  manufacturing AAI page; the KB's own list was short and has been
  corrected. See U2.
- `R30822 (frozen-cost update) must be paired with R30837 (WIP
  revaluation)`. Known-good per the brief and confirmed in
  `frozen-cost-integrity-analysis.md:88`, `:142`, `:469`.
- `RECURRENCE LADDER ... confirm against the FULL JDE F4095/P4095 (RR's
  extract is filtered - a real rule can be invisible here)`. Matches
  memory `project_rr_f4095_extract_filtered` and the route data (only
  4152 reaches `v_integrity1_aai_base`).
- `itnz = wash pair on different accounts; nz = move pair on same
  account; glsub = one AAI/GL-class subsidiary deviating from its
  siblings`. Matches `v6_008_net_zero_aais` and the Comment strings in
  `dmaai-analysis.md:270` to `:271`.

## `RRV8.ANALYST_GROUNDING`

- The variance sign, now `ledger − cardex`. Fixed in `config.js` before
  this audit ran. Its KB copies are S6.
- `dbo.RDuplicateSales flags it.` The object exists on Demo1.
- `JDE increments the line number for a genuine partial shipment, so a
  repeated line number is a double relief, not a split.` Matches
  `transaction-detail-analysis.md:1122` almost word for word.
- `MANUFACTURING GL-CLASS SOURCE: ... R31802A ... take their GL class
  from the item BRANCH record (F4102); every OTHER F4111 transaction ...
  uses the item LOCATION record (F41021).` Consistent with the Home
  `_analystIntegrityCheck` gate and memory
  `reference_gl_class_two_levels_item_vs_location`.
- `a manufacturing move (IM / IC / IH)`. Harmless that Home's gate tests
  only IC and IM: no IH rows exist in `RCardexLedgerCompare2` on Demo1
  or Demo3, so the narrower gate never misses one in practice.
- `A blank F41021 GL class is not special - it resolves through the DMAAI
  like any class: a specific entry, or the **** wildcard/default row.`
  Matches memory `reference_gl_class_blank_dmaai_wildcard`.
- `R09801 only updates F0902 - unposted journal entries still exist in
  F0911.` Correct, and it is the server block that has the wrong number.
- `Neither is the PC field, which is the F41112-update flag.` Matches
  `cardex-variance-analysis.md:433` and `:733`, which state that ILIPCD
  records the F41112 update and is not a posting test.
- `MTO ... the GL side is the larger one in about two thirds of the rows
  and the large majority of the value` and `most of the value sits on
  rows where the gap exceeds HALF the item-ledger amount` and `the value
  also concentrates on very few accounts`. All three reproduce on
  Demo1: 936 of 1,400 both-differ rows have the GL side larger (66.9%),
  those rows hold $108,045.38 of $133,008.90 (81.2%), rows with a gap
  over half the cardex amount hold $110,705.40 of $133,008.90 (83.2%),
  and 7 distinct accounts carry the card with the top one holding
  $89,363.60 (67%). Caveat under M-note below.
- `MTO ... GL-only rows are standard-cost variances; cardex-only rows are
  the COMPLETION-GAP shape.` The three shapes exist in the stated
  proportions on Demo1: 1,088 GL-only, 377 cardex-only, 1,400
  both-differ.
- `CNJ ... a batch and G/L date ABSENT is the literal un-processed
  state`, and the rule that a present batch is not proof. Every CNJ row
  on Demo1 (320) and Demo3 (125) carries a batch.
- `NEVER STATE A COUNT, A BATCH TOTAL OR A PERCENTAGE YOU HAVE NOT BEEN
  GIVEN FOR THIS INSTALL.` Correct as policy. See the process finding
  for where the same block breaks it.
- `TXI ... verified across 16 loaded periods in two companies.` Demo3
  has 16 distinct loaded periods and TXI failures in 6 of them, so the
  window claim matches the source dataset.

## `RRV8.CARDEX_GROUNDING` and `AnalysisGuides/_catalog/analyst/cardex.md`

- `cardex variance = the item ledger (F4111) does not sum to the on-hand
  balance (F41021) for one item ... It is inventory-internal, NOT the
  ledger-vs-GL gap.` Known-good per the brief and consistent with
  `v8ui_cardexworklist`, which carries no account-level variance column.
- `EXCLUDES memo rows (ILIPCD = "X")`. `F4111.ilipcd` exists on all
  three databases. The KB states the exclusion in five places, including
  `cardex-variance-analysis.md:162`, `:459`, `:733` and
  `RRUniversity/inventory-cardex-variance.html:997`. No `X` rows exist in
  any demo (values are blank, `Y`, `S`), which is consistent with
  `inventory-cardex-variance.html:866` saying RR excludes them
  automatically.
- `ADJUST BEGINNING BALANCE has three presets: Clear to JDE, Zero
  opening, Manual ... logged and reversible from the Adjustment ledger.`
  Matches `inventory-cardex-variance.html` (`openAdjust`,
  `renderLedger`).
- `Cardex variance CANNOT be journaled.` Matches memory
  `reference_cardex_inventory_side_account_blind`.
- The aggregation-scope bullet is S7 and is the one wrong claim here.

## `RRV8.ROLLFORWARD_GROUNDING`

- `RapidReconciler recomputes the entire period timeline on every
  refresh, so the variance clears on the next run.` Confirmed:
  `usp6_009_account_summary.sql:31` runs
  `truncate table raccountsummary` and rebuilds every period from
  `v6_009_baseline`. There is no per-period filter.
- `FIRST run Repost Account Balances (R099102) in JD Edwards ... THEN
  reload the GL in RapidReconciler.` Program number matches five KB
  files. Order matches `_analystRollForwardCheck`'s `factDetail`.
- `Never prescribe a re-roll (retired) or Reload Cardex.` Matches
  memories `project_rollforward_reroll_verb_retired` and
  `reference_reload_cardex_purpose`.
- The inline fallback copy at
  `inventory-account-rollforward.html:905` says the same thing as the
  catalog. No drift between the two.

## `RRV8.ASOF_GROUNDING`

- `RESIDUAL NOISE is zero-quantity rows that still carry a tiny
  valuation.` Confirmed: the candidate set is built with
  `if ((Number(rows[i].Quantity) || 0) === 0) candidates.push(rows[i]);`
  in `inventory-asof.html`.
- `The Residual Optimizer finds the natural cutoff.` `_fpOptimalTarget`
  takes the largest absolute gap between consecutive sorted dust
  amounts.
- `a display filter only - material balances are never touched and
  nothing is deleted.` The optimizer's only effect on data is
  `rows.filter(...)` at render. No write, no delete.

## `RRV8.ACCT_GROUNDING`

- `an out-of-balance under $100 is immaterial regardless of %; a GL
  balance under $1,000 is dormant/near-zero.` Matches the
  implementation exactly: `home.html` `var MAT_OOB_FLOOR = 100,
  DORMANT_GL_FLOOR = 1000;`.
- `well under ~1% is immaterial.` Matches
  `material: !nearZero && pct >= 1`.
- The component ownership split (carry forward, transactions, manual
  entries are accountant-owned; unposted GL batches, end-of-day and
  cardex are not) matches `home.html`'s `_srcPreviewKey` and the
  `comps` object.
- The 25% / $50,000 / six-period carry-forward guidance is declared
  advice-only in the block itself ("Advise ONLY, do not build the
  fractional entry"), and nothing implements it. Policy, not a fact
  claim.

## `RRV8.ADMIN_GROUNDING`

Generated verbatim from four RRUniversity docs by
`Tools/build-ai-grounding.py`, so it cannot disagree with them by
construction. Spot-checked the two behavioural numbers against the code:

- `At 12 months of inactivity, RapidReconciler emails the team member a
  warning: sign in within 14 days.` Matches
  `RapidReconciler-Valc/.../UserInactivityService.java:53`
  (`warn-days:365`) and `:54` (`grace-days:14`).

## `RRV8.AI_REGISTER`

- `Never a percentage of a tie-out.` Consistent with memory
  `feedback_txv_is_a_binary_tie_out` and with
  `ANALYST_GROUNDING`'s TIE OR NO TIE bullet. The five parsed-reply
  exemptions are known-good and not examined.

## `RRV8.GLOSSARY`

- `MODEL DMAAI TABLE: DMAAI 4152 for the company ... Its document type
  comes from the company record, so only that one type is live.`
  Confirmed. `v_integrity1_aai_base` carries exactly one doc type per
  company and it equals `RCompanies.AAIDocType` on all three databases
  (Demo1 `99`, Demo2 and Demo3 `PI`). This is the block that is right
  where the server block is wrong.
- `CARDEX VARIANCE ... It is ACCOUNT-BLIND.` Known-good.
- `REL TYPE / REL ORDER vs ORIG TYPE / ORIG ORDER ... A blank Rel Order
  on a Make to Order row is by design.` `RCardexLedgerCompare2` carries
  `OrigOrder`, `OrigType`, `RelOrder`, `RelType` as separate columns, so
  the two mechanisms are distinct as described.
- `EXCLUDED GL CLASS: a GL class an item uses that has NO 4152 entry.`
  Matches the anti-join in `v_integrity3_exc_glc`.

## `RRV8.txv` card copy, cleared entries

- ❌ `NZR`: **NOT CLEARED. This entry was a false positive and the
  original verdict is withdrawn.** The card copy reads `DMAAI 3110
  (raw-material relief) and 3130 (finished-goods receipt) resolve to ONE
  account for these order types and GL classes ... 3120 (work in
  process) is not configured.` Both halves fail, for different reasons.

  **The 3120 half was measured against the wrong table.** The original
  query ran against `v8ui_dmaai_routes`, which RapidReconciler derives
  from `F4095`, and read zero rows as "not configured." Re-measured
  2026-08-10 against raw `F4095`:

```sql
select mlanum, count(*), sum(case when ltrim(rtrim(isnull(mldct,'')))='' then 1 else 0 end)
from F4095 where mlanum in (3110,3120,3130,3210,3401) group by mlanum;
-- 3120: Demo1 162 rows / 162 blank doctype, Demo2 1 / 1, Demo3 490 / 490
-- 3401: Demo1 117 / 117, Demo3 365 / 365
-- 3210: Demo3 62 rows / 0 blank doctype
-- v8ui_dmaai_routes for the same three databases: 3120, 3210, 3401 all zero
select TableNumber, count(*) from rdmaaistaging group by TableNumber;
-- Demo3: 3210 = 621 expanded rows. 3120 and 3401 absent.
```

  3120 is configured on all three databases. Every row carries a blank
  document type, which is deliberate, because one AAI entry serves all
  five manufacturing document types. That blank is the whole cause: all
  thirteen load levels in `usp6_002b_aai_staging.sql` carry the predicate
  `mldct != '' and f.mlobj != ''`, so a blank-doc-type entry survives no
  level. 3120 and 3401 are the only two AAIs lost this way. That is a
  load defect, tracked separately, and the card is telling the analyst a
  configuration story about a loader gap.

  **3210 is not part of the gap and an earlier revision of this audit
  said it was.** Its rows carry real document types and it loads: 621
  staging rows on Demo3. It is absent from `v8ui_dmaai_routes` only
  because that view is scoped to the DMAAI tables holding inventory
  accounts (`v8ui_dmaai_mismatch_active.sql`), and 3210 holds none.
  Reading absence from a scoped view as absence from the loader is the
  same failure this audit exists to catch.

  **The 3110 = 3130 half is a real measurement of a test that should not
  be run.** SME ruling 2026-08-10: net zero applies only to a valid
  DMAAI pairing, and 3110 with 3130 is not one. The two AAIs sit at
  opposite ends of two different transactions with WIP between them. The
  valid manufacturing net-zero tests are 3110 against 3120 on the IM and
  3120 against 3130 on the IC. Where a customer points 3110 and 3130 at
  one inventory account, assume it was intended, particularly at a site
  running a single inventory account. `manufacturing-accounting-flow.md`
  carries the corrected passage.

  **Resolved 2026-08-10: the `DMAAI Net Zero` card was withdrawn, not
  reworded.** It is gone from the classifier and from the UI card
  catalog. Two reasons. The valid pairing tests — 3110 against 3120 on
  the IM, 3120 against 3130 on the IC — return zero slices on all three
  demo databases under every relaxation tried. And 98% of what the card
  did claim was IM, the one document type that cannot exhibit the
  condition. Rewording would have left a card with nothing to fire on.
  Full reasoning lives in the stored procedure.

- `VCHR`: `Batch type on these documents: V, an A/P voucher.` True for
  every voucher row on all three databases. Only the item-ledger claim
  is wrong (S4).
- `ACCT`: the DMAAI-mismatch mechanism, the PO 1 / PO 2 account-entry
  levers and the R42800 PO 5 lever are internally consistent with
  `DMAAI_GROUNDING`. PO numbers are U7.
- `PER`: `The cardex movement and its GL counterpart landed in different
  months.` Matches the server-side 5.14 detection the comment points at.
- `DUP`: every claim. The repeated-line-number reasoning, the two causes
  and the workfile mechanism all trace to
  `transaction-detail-analysis.md:1122`.
- `TXI`: the narrow-shape framing, the equal-numbers claim about
  zero-extended legs on both sides, the burst pattern and the
  no-vendor-article rule. Consistent with `ANALYST_GROUNDING` and with
  the 2026-08-03 owner ruling that R41543/R41544 are not the remedy.
- `CNJ`: the whole entry, including the KB 420628 ruling-out and the
  do-not-delete-the-batch instruction. Every CNJ row carries a batch, as
  the copy requires.
- `NSL` and `NCL`: the non-stock split. `NSL` requires the non-stock cost
  to tie to the variance and `NCL` covers charge lines with no extended
  cost, which is a real distinction and is stated in both entries.
- `OFF`: `LedgerAmount nets to zero, which does NOT mean the GL entry is
  missing.` 128 rows on Demo1. The 4240/4220 lever matches the KB's
  sales-side pair.
- `MTO`: the three-shape split and the withdrawal of the cost-basis
  cause. Measured above.
- `GRID` shapes `GL-ONLY`, `CDX-ONLY`, `STD-COST`, `OTHER` and the
  `gridCode` ladder. The `DT=BV` / `DT=IB` split matches the `STD-COST`
  copy.
- `SIGNAL` `NON-STOCK`, `DMAAI-MIS`, `UNSCOPED`. Consistent with the
  `NSL` card and with `ANALYST_GROUNDING`'s non-stock bullets.
- `inventory-cardex-variance.html`: `Cost method '+(a.method||'?')+' (07
  = Standard, 02 = Average/WAC)`. Matches
  `cardex-variance-analysis.md:231` and `:232`. It omits 09 (Actual
  Cost), which is a gap, not an error.

## `AnalysisGuides/_catalog/_core.md`

- INV-1 (variance is always a difference), INV-2 (natural sign), INV-4
  (RR is a utility) all match their cited memories.
- INV-3 describes the server injection as "the model-DMAAI (4152)
  rules" and tells catalog authors not to restate DMAAI routing
  client-side. The injected block is in fact a full AAI catalog with
  four wrong entries, so the instruction discourages the one thing that
  would override them. Not a factual error in INV-3 itself. Worth a
  sentence once S2 lands, saying that a client catalog may correct a
  specific server claim by naming it.

---

# Not checkable here

Named with the reason. Shape found and unverified is recorded as
unverified, not as clean.

**JDE program internals.** No JDE instance is reachable from this box.
Every claim about what R31802A, R31804, R099102, R30822, R30837,
R42800, R41413, R41610, P4111, P4112, P4113, P4114 or P43250 actually
does at runtime rests on the KB alone. Where the KB states it I cleared
it against the KB. Where the KB is silent I marked it UNCORROBORATED
rather than reasoning it out. That covers U2, U3, U6 and U7.

**Processing-option numbers.** `P4312 PO 2`, `P4314 PO 2`, `R42800 PO 1`
and `R42800 PO 5` appear in `DMAAI_GROUNDING`, in `RRV8.txv` `ACCT` and
`PER`, and in `ANALYST_GROUNDING`. They agree with each other and with
nothing else. Three consistent copies of one unsourced claim is not
corroboration.

**Oracle KB 420628.** The `CNJ` copy states the article's symptom, its
cause (an issue quantity under 0.0050 blanking the 2-decimal CTS1 on
the F3111 part list), its remedy and that the body was retrieved. I
cannot reach My Oracle Support. The internal reasoning holds: RR does
not load F3111, and a failure that drops the IM entry would suppress
`CNJ` rather than create it. The article's content itself is
unverified.

**Anything measured only on Demo1 or Demo3.** `MTO`, `TXI`, `CNJ`,
`OFF`, `NSL` and `NZR` all trace to investigations run against these
same databases. Their figures reproducing here is a consistency check,
not independent confirmation. A second customer dataset is the only
thing that would settle whether "about two thirds" and "about 1.7%" are
pattern properties or specimen facts. Until then they should be
described as measured on one install, which is what the `CNJ` bullet
already requires and its neighbours do not do.

**Demo2 as a witness.** Demo2 supplies the strongest evidence for S4
(1,033 cardex-bearing voucher rows). Memory `project_demo_data_state`
records Demo2 as carrying contamination. The KB's independent statement
that AAI 4330 is "Written to F4111" is what makes S4 safe to act on;
Demo3's single row is a weaker second witness. If the fix pass wants a
clean measurement, take it from a customer extract rather than Demo2.

**`ADMIN_GROUNDING` process prose.** Generated verbatim from customer
docs, so it is correct by definition against its source. Whether the
source docs describe the shipped behaviour is a separate audit. I
verified only the two inactivity thresholds against
`UserInactivityService.java`. The row-tint bands (green under 6 months,
amber at 6+, red at 12+), the last-administrator exemption and the
set-password link expiry are unverified.

**`AI_REGISTER`'s five parsed-reply exemptions.** Declared known-good in
the brief. Not examined.

**`_analystTxFacts` and `_analystCardexFacts` content.** Every string in
both functions is derived from live figures rather than authored, so
there is no static claim to check. The UI-72 contradiction the brief
mentions is genuinely fixed in `_analystTxFacts`: the cold path now
returns one fact and the `[GUIDANCE, not for quoting]` marker. What I
found instead is that `_analystTxFacts` output never reaches the model
at all (S1), which makes the fix invisible in either direction.
