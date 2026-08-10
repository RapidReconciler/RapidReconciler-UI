# DMAAI Reference — how JDE is *supposed* to post (transaction-variance families)

**Status:** DRAFT 2026-07-06 — owner (DMAAI SME) to curate. Scoped to the
transaction-variance AAI families: **31xx** (manufacturing), **41xx** (inventory),
**42xx** (sales), **43xx** (purchasing), **IT** (transfers). NOT all-inclusive —
lines marked **[VERIFY]** are supplemented from JDE-canonical knowledge or thin in
the repo and need sign-off before they become AI grounding.

## Why this exists — the three-layer expert model
The Transaction-Variance AI needs to reason from *how JDE should post*, not from
whatever it recalls per run. Three layers; an expert diagnosis is the gap between them:

1. **Intended** — how each AAI is *supposed* to route and offset. Universal JDE
   truth, permanent, client-independent. **This document.**
2. **Actual config** — the client's real F4095 routing. We have it: the analyzer's
   DMAAI routing model (`modules.*` in `dmaai-analysis-latest.json`).
3. **Actual postings** — what really hit cardex/GL this period. We have it: the
   transaction fingerprint (`_txvFingerprint` on the details page).

**Consumers:** (1) the AiService gateway injects a compact core as grounding on
every AI card + a future "Ask the DMAAI expert" box; (2) analysts/juniors read it
directly (junior-support training — the exit-strategy deliverable).

## The posting model (how to read every table below)
- Each inventory movement writes an **F4111 cardex** row (item ledger) and a
  matching **F0911 GL** row via a DMAAI-routed account. Reconciliation compares the
  two; a variance = they disagree on **account**, **period**, or **amount**.
- AAIs work in **offsetting pairs**: one debits, the other credits. A correct pair
  either **washes to zero** (clearing/transfer) or moves value between two
  **different** real accounts. Two failure shapes:
  - a wash pair pointed at **different** accounts (when it should wash) → **residual**;
  - a move pair pointed at the **same** account (when it shouldn't) → silent **net-zero**.

  Net zero only means anything for a **valid pairing** — the debit AAI and the credit AAI
  of the *same* transaction. Two AAIs drawn from different transactions can share an
  account without any defect.
- **Sign:** stored/displayed natural so recon ties to the KPI; in the compare table
  `variance = ledger − cardex`.
- **Account key:** `BusinessUnit.Object.Subsidiary` (e.g. `MFG01.145000` or
  `5000.140000.CC`). The DMAAI supplies the **object** (+ optional subsidiary); the
  **BU** comes from the transaction or a processing option (a frequent mismatch source).

## Posting programs — who writes the GL
| Program | Role | Note for diagnosis |
|---|---|---|
| **R31802A** | Manufacturing accounting | Summarizes GL by (account, batch) across many work orders — one F0911 per account per batch. Cross-WO summarization can read as "GL excess" against a single cardex doc. |
| **R31804** | Variance accounting | Clears WIP to the variance AAIs (3210/3220/3240/3260/3270/3280) by variance type. |
| **R30822** | Frozen cost update | Updates F30026 standard; **must be paired with R30837** or the GL won't reflect the revalue. |
| **R30837** | WIP revaluation | Revalues completed inventory after a standard-cost change; if not run, cardex revalues with **no GL offset**. |
| **R42800** | Sales update | PO 5 (BU source) and PO 1 (GL date) are the top root causes of account/period mismatch on sales. |
| **P4312 / P43214** | PO receipt / landed cost | Receipt + landed-cost accrual routing (43xx). |
| **R09801** | GL post | Posts F0911 batches to F0902; an unposted batch shows as cardex-only. |

---

## Family 31xx — Manufacturing (WIP, completions, variances)
Source: `RRUniversity/inventory-distribution-aais.html` §2; `AnalysisGuides/dmaai-analysis.md` §11; `transaction-detail-analysis.md` §5.9/§5.12.

| AAI | Purpose | Triggers | Intended posting | Common failure → fix |
|---|---|---|---|---|
| **3110** | Inventory / Raw Materials | IM (issue to WO) | **CR** raw inventory; offsets to WIP (3120) | Issue routed to wrong inventory object → reclass to configured account |
| **3120** | Work in process (WIP) — the mfg hub | IM, IH, IC, IV | **DR** on issues + labor, **CR** on completions; every mfg leg offsets here | WIP left un-relieved → a completion/variance AAI is misrouted; trace which leg didn't hit 3120 |
| **3130** | Sub-Assembly / Finished Goods | IC (completion), IS (scrap) | **DR** FG; offsets WIP (3120) | Completion posts to a different object/subsidiary than the model → **reclass** (nets to zero, no P&L); if the model matches cardex, suspect a **post-time account override** or a **historical DMAAI change** (GL historical vs model current) |
| **3210** | Clear Work in Process — COGS the completions did not pick up | **R31804** (**actual costing only**) | **DR** COGS; clears residual WIP | not used under standard costing |
| **3220 / 3240 / 3260 / 3270 / 3280** | Labor / Material / Planned / Engineering / Other variance | IV | **DR or CR** the variance; offsets WIP (3120) | Variance AAI unconfigured → WIP never clears; post JE Dr/Cr inventory ↔ the variance AAI by variance type |
| **3401** | Accruals (payroll / outside operations) | IH | **CR** accrual; offsets WIP (3120) | Labor/outside-op accrual misrouted → reclass |

**Variance axes (R31804):** 3220 = actual vs planned hours · 3240 = actual vs planned material cost · 3260 = planned vs current cost · 3270 = current vs frozen standard · 3280 = mid-cycle rollup / quantity / rounding.
**Program split (Oracle JDE 9.2, verified 2026-07-06):** R31802A posts completion (3110/3120/3130/3401); R31804 posts variances (3210/3220/3240/3260/3270/3280). **3140 is NOT a JDE manufacturing AAI** (confirmed against Oracle 9.2 — removed from scope).

**Load gap — 3120 and 3401 never reach the derived tables.** Their `F4095` rows carry a
**blank document type** (one AAI entry serves all five manufacturing document types), and
all thirteen load levels in `usp6_002b_aai_staging.sql` filter on `mldct != ''`. So
`RAccountInstr` and `v8ui_dmaai_routes` hold nothing for either AAI, and an empty derived
table says nothing about whether the customer configured them. Answer any absence question
against raw `F4095`. **3210 is not part of this gap** — its rows carry real document types
and it loads into `rdmaaistaging` normally. It is absent from `v8ui_dmaai_routes` because
that view is scoped to the DMAAI tables holding inventory accounts, and 3210 holds none.

**Signature failure — standard-cost change after completion (Pattern 5.9):** cardex
shows a zero-qty revaluation row with **no matching GL** because R30822 ran but
R30837 did not. Fix: post JE Dr inventory / Cr variance (3240/3260); configure
R30837 to run from R30822 going forward.

---

## Family 41xx — Inventory (adjustments, transfers, revaluation)
Source: `inventory-distribution-aais.html` §3; `dmaai-analysis.md` §2/§3/§5; `transaction-detail-analysis.md` §5.1/§5.4.

| AAI (pair) | Purpose | Triggers | Intended posting | Common failure → fix |
|---|---|---|---|---|
| **4122 / 4124** | Inventory DR / CR (adjustments, issues, transfers, reclass) | IA, II, IJ, IL, IM, IP, IR, IV, **IT** | move between two **different** accounts (IT should **wash to zero** between branches) | pair on **same** account when it should move → silent net-zero; pair on **different** accounts for IT when it should wash → residual (`itnz`) |
| **4126 / 4128** | Received-not-vouchered DR / CR | VV, IT | wash to zero | same as above for the RNV pair |
| **4134 / 4136** | Inventory cost change — inventory leg / expense-or-COGS leg | IB (P41022 quantity revisions, P41026 item branch/plant, R41802 batch cost maintenance) | 4134 moves the inventory value, 4136 takes the expense or COGS side | pointed at the **same** account → debit and credit cancel inside inventory and the cardex value never reaches the GL. **Not an in-transit AAI** |
| **4152 / 4154** | Physical-inventory adjustment | IJ | offset each other | cycle/tag-count variance misrouted |
| **4162** | Cross-company inventory transfer | IX | **DR** receiving company inventory | interco leg misrouted (see Intercompany card) |
| **4172 / 4174** | Future cost update | (P41052) | offset each other | cost-change revalue misrouted |

**Model DMAAI table (4152 / doc type PI) — the foundation.** RR's account-assignment
reference during import. If an entry is **missing**, F4111 rows are marked
**Unassigned** and drop out of matching (Pattern 5.1). If it's **mismatched** vs the
satellite table, Integrity Report 2 flags "Mismatch — Object" / "Mismatch — BU".

**Cost method drives cardex behavior:** Standard (07) writes cardex at frozen
standard, variances go to GL only (see 43xx 4335/4330); Weighted-avg (02) revalues
cardex on voucher match; Actual (09) writes at WO completion cost.

---

## Family 42xx — Sales (inventory relief, COGS, revenue)
Source: `inventory-distribution-aais.html` §4; `dmaai-analysis.md` §5; `transaction-detail-analysis.md` §5.4.

| AAI | Purpose | Triggers | Intended posting | Common failure → fix |
|---|---|---|---|---|
| **4210** | Inventory (credit side of sale) | SO, C*, S* family | **CR** inventory; offsets COGS (4220) | relief misrouted → account mismatch |
| **4220** | Cost of goods sold | SO, C*, S* | **DR** COGS; offsets 4210 | 4240/4220 on **same** account → net-zero (`nz`) |
| **4230** | Sales / revenue | SO, C*, S* | **CR** revenue; offsets A/R | — |
| **4240** | Inventory (standard sales entry) | SO, C*, S* | **DR**; offsets 4220 | see 4220 |
| **4245** | A/R trade **— on a cost-plus ST it is repurposed as Inventory In-Transit (clearing)** | SO/C*/S* (AR) or **ST at cost plus** (in-transit) | **DR** receivable, or **DR** in-transit at the marked-up price on a cost-plus ST | whichever AAI holds the in-transit debit must resolve to the **same account** as 43xx **4320**, or every transfer leaves a residual (see Transfers) |
| **4250** | Sales-tax liability | SO, C*, S* | **CR** tax | — |
| **4260** | Inter-branch revenue | SO (R42800 PO 2) | **CR** | — |
| **4270 / 4280** | Advanced price adjustment / accrual | (Advanced Pricing) | offset each other | — |

**Signature failure — account mismatch from R42800 PO 5 (BU source):** the DMAAI
expects the BU from one source (e.g. branch on the order) but R42800 PO 5 sources it
elsewhere (e.g. sold-to address), so COGS/inventory land on a different BU than the
model. Fix: align R42800 PO 5 with the DMAAI BU setup; reclass the posted amount.
**Period mismatch:** R42800 PO 1 (GL date source) posting into a different fiscal
period than the transaction date.

---

## Family 43xx — Purchasing (receipts, RNV, variances)
Source: `inventory-distribution-aais.html` §5; `dmaai-analysis.md` §5/§11; `transaction-detail-analysis.md` §3.5/§5.7/§5.8/§5.15.

| AAI | Purpose | Triggers | Intended posting | Notes |
|---|---|---|---|---|
| **4310** | Inventory | OR (receipt) | **DR** inventory; offsets RNV (4320) | — |
| **4315** | Non-stock asset | OV, PV (2-way) | **DR** | — |
| **4320** | Received-not-vouchered (RNV) | OR / voucher | **CR** at receipt, **DR** at voucher match | clearing partner for ST transfers (4245) |
| **4330** | Purchase price variance | PV | **DR** when invoice cost ≠ receipt cost | writes cardex |
| **4332** | Cost-of-sales variance | PV (QOH < qty vouchered) | **DR** the already-sold portion | **non-F4111** (GL-only) |
| **4335** | Standard-cost variance | OV, PV | **DR/CR** receipt vs frozen standard | **non-F4111** (GL-only) |
| **4337** | Material burden | OV | **CR** only (std-cost items, via P4312) | **non-F4111** (GL-only) |
| **4340** | Exchange-rate variance | PV (foreign) | **DR/CR** | **non-F4111** (GL-only) |
| **4322** | Alt to 4320 when the A/P interface is off (line-type constant) | receipt/voucher | RNV substitute | — |
| **4350 / 4355** | Accrued purchasing tax DR / tax-RNV CR | receipt/voucher | tax accrual | — |
| **4365 / 4370** | **[VERIFY — RR vs Oracle]** RR docs call these direct-ship / outside-ops settlement; **Oracle 9.2 documents 4375 for receipt-routing disposition** and does not confirm 4365/4370 semantics — reconcile against this client's F4095 | OA/OD/OO/OP | settlement/routing liability | confirm live |
| **4375** | Receipt-routing disposition (damaged/rejected goods still payable) | (receipt routing) | **DR** disposition account | Oracle-documented routing AAI |
| **4385 / 4390** | Landed cost / temp liability | (P43214) | offset each other | Pattern 5.7 |
| **4400 / 4405** | Zero-balance inventory / COGS | (P4312) | offset each other | zero-qty, non-zero amount |

**Non-F4111 AAIs (4335/4332/4337/4340)** post GL with **no cardex** — they surface
as legitimate GL-only rows, not errors. **"No Cx" batch (Pattern 5.8):** voucher
matched a reversed receipt, or a non-inventory line type → no cardex written.
**Voucher variance (Pattern 5.15):** tax changed between OV receipt and PV match →
GL-only tax difference; post a JE.
**Outside operations (OO):** accounting is governed by the line type's inventory
interface + the **Expense-at-Voucher** option — when set, **no JE at receipt**; cost
and tax are expensed (variances booked) at voucher match. Verify OO independently of
OA/OD/OP. *(Oracle JDE 9.2 Procurement.)*

---

## Family IT — Inter-branch transfers
Source: `dmaai-analysis.md` §3/§5; `inventory-distribution-aais.html` §4.1/§4.3.

- **Internal branch-to-branch (doc type IT):** uses the **4122/4124** (or **4126/4128**)
  inventory pair, which must **wash to zero** between branches (same GL account both
  sides). Analyzer flags `itnz` when the two sides route to **different** accounts.
- **Sales-side transfer shipment (ST) ↔ purchase-side receipt (OT):** read the
  **transfer pricing before naming the AAI** (owner ruling 2026-08-10). On a transfer
  **at cost**, **4220** debits Inventory in Transit at the shipping branch's cost, and
  the price side is neutralized by pointing 4245 and 4230 at the same wash account. On a
  transfer **at cost plus**, **4245** debits Inventory in Transit at the marked-up price,
  4230 records interbranch revenue, and 4220 records real COGS at the shipping branch's
  cost. Either way, whichever AAI took the in-transit debit must resolve to the **same GL
  account** as **4320** (OT receipt, credit in-transit). If they drift, **every transfer
  leaves a permanent residual** on the clearing account — the hardest residual to find,
  because each F0911 looks correct individually. Prevention: hard-code the BU on the ST
  row (don't flex it by branch) so the clearing account stays company-wide-consistent;
  validate 4320 matches.

---

## Analyzer-encoded failure patterns (already codified expertise)
From `dmaai-analysis-latest.json` `fixFirst[].issueType` — these are RR's own DMAAI
rules; the reference AI should recognize them by name:
- **`itnz`** (transfer-net-zero): an IT pair routing to **different** accounts when it
  should wash. Usually a one-sided setup/copy-paste error.
- **`nz`** (net-zero): a move pair (e.g. 4122/4124, or 4240/4220) routing to the
  **same** account when it should move — postings silently cancel.
- **`glsub`** (subsidiary drift): one AAI/GL-class combination whose subsidiary
  deviates from the dominant one across sibling keys — the SB24↔SB25-style drift.

## Card → AAI map (grounds each card's AI framing)
| Card | AAIs in play | First-look cause |
|---|---|---|
| Account Mismatch | any family | DMAAI misconfig · flex accounting · R42800 PO 5 · **post-time override** · **historical config change** |
| Period Mismatch | any | R42800 PO 1 / receipt GL-date POs |
| Make to Order | 31xx (3120→3130) | WIP→FG timing across SO+WO |
| Intercompany | 4162 · OK/SK sales-purchase | counterpart-company leg timing |
| Transfers | IT 4122/4124 · ST/OT 4245↔4320 | branch wash / clearing drift |
| Direct Ship | 43xx 4365 (OD) · sales | SO+PO leg timing |
| Cross-Batch Completion (5.21) | 31xx (3130) | completion journaled in a LATER batch than the one stamped on the cardex; amounts tie at work-order grain — not a variance |
| Mfg Cost Mismatch (5.16) | 31xx (3120→3130) | GL completion exists on the account but the amount differs; cost basis moved between the cardex write and the R31802A run |
| ~~DMAAI Net Zero (5.22)~~ | — | **withdrawn 2026-08-10** — see the note below |
| ~~Unclassified — Mfg~~ | 31xx | **retired 2026-08-05** — 5.21 and 5.16 plus the since-withdrawn 5.22 took the whole manufacturing residual at the time (Demo1 1082→0, Demo3 562→0, Demo2 166→0). Those counts predate the 5.22 withdrawal and have not been re-measured; treat the retirement as provisional until they are. 5.9 and 5.12 remain causes to *reason* about inside 5.16 |
| Unclassified — Purchasing | 43xx | landed cost (5.7) · voucher variance (5.15) · No Cx (5.8) · non-F4111 |
| Unclassified — Sales | 42xx | relief/COGS routing |
| Unclassified — Inventory | 41xx | missing model (5.1) · account mismatch (5.4) |

**DMAAI Net Zero (5.22) was withdrawn, not reworded.** It claimed that 3110 and 3130
resolving to one account made both legs of a manufacturing transaction cancel, and that
3120 was unconfigured. Both halves were wrong. Net zero applies only to a valid DMAAI
pairing: the debit AAI and the credit AAI **of the same transaction**. 3110 and 3130 sit at
opposite ends of two different transactions with WIP between them, so pairing them tests
nothing. The valid manufacturing tests are 3110 against 3120 on the IM and 3120 against
3130 on the IC, and both return zero on all three demo databases under every relaxation
tried. A shared 3110 / 3130 account is assumed intended, particularly at a site running a
single inventory account. 3120 is configured — the rows are in raw `F4095`; they never
reach the derived tables (see Family 31xx above).

## Gaps / to verify (owner)
- **3140** — ✅ resolved via Oracle 9.2: **not a JDE manufacturing AAI**. Removed from scope.
- **4365 / 4370** — RR docs (direct-ship / outside-ops settlement) **conflict with Oracle 9.2**,
  which documents **4375** for receipt-routing disposition and does not confirm 4365/4370.
  Confirm this client's actual F4095 routing + which programs use them (your call).
- **R09801** (GL post) — the program number is settled: `R09801` is what the KB uses in six
  AnalysisGuides files plus `RRUniversity/inventory-reconciliation.html` and
  `po-receipts-reference.html`, and `RRV8.ANALYST_GROUNDING` agrees. This doc carried
  **R09800** until 2026-08-10 and was the only place in the repo that did; the server-side
  `AiService.DMAAI_GROUNDING` had copied it from here. Still worth a worked example of how an
  unposted batch surfaces as cardex-only — it's a financials post program, so it isn't in the
  distribution-AAI docs.
- **Outside operations (OO)** — mechanism added (Expense-at-Voucher / line-type interface);
  still worth a worked example of correct vs incorrect OO account assignment.
- **Flexible Accounting (F4096)** — high-level only; expand if support volume warrants.
- Company/GL-class **instances** are deliberately omitted (public repo hygiene) — this
  doc describes patterns, not customer configs.

## Sources
**RR repo:** `RRUniversity/inventory-distribution-aais.html` (definitive in-repo posting
reference) · `AnalysisGuides/dmaai-analysis.md` · `AnalysisGuides/transaction-detail-analysis.md` ·
`AnalysisGuides/cardex-variance-analysis.md` · `RRV8/data/dmaai-analysis-latest.json`
(`fixFirst` + `modules`) · `docs/plans/dmaai-system-context.md`.
**Oracle JD Edwards 9.2 (verified online 2026-07-06):**
[Manufacturing AAIs](https://docs.oracle.com/en/applications/jd-edwards/supply-chain-manufacturing/9.2/eoapm/understanding-manufacturing-aais.html) ·
[Procurement AAIs / receipt routing / outside operations](https://docs.oracle.com/cd/E16582_01/doc.91/e15131/set_up_proc_system.htm).
