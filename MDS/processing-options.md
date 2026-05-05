# JD Edwards Inventory Programs — Processing Options & Variance Reference

This reference is intended to support transaction detail analysis in RapidReconciler. For each inventory program, it lists the processing options most likely to have caused a variance and the sub-type it will appear as on the Transactions page.

---

## P4112 — Inventory Issues (Document Type: II)

**AAIs Invoked:** 4122 (Inventory), 4124 (Expense/COGS offset), 4141 (Std Cost Variance)

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | Allow Entry of GL Account | **Accounts** | Operator manually enters an account for the 4124 offset side. The entered account is written to F0911, but F4111 retains the AAI-assigned account — guaranteed account mismatch. |
| Process | 2 | Allow Override of GL Account | **Accounts** | Same as Option 1. A post-population override produces the same F4111/F0911 split. |
| Process | 3 | Cost Method | **Accounts** | If the cost method used differs from the item standard in F4105, a variance is written to AAI 4141. A misconfigured 4141 account will appear as an account mismatch. |

> **When you see an II transaction on the Transactions page:** Check whether processing options 1 or 2 are enabled in the version used. If either is on, the operator likely entered a manual account. Confirm by comparing the F0911 account (Section 3 of the detail report) to the expected AAI 4124 account (Section 6).

---

## P4113 — Inventory Transfers (Document Type: IT)

**AAIs Invoked:** 4122 (From — Inventory), 4124 (To — Inventory), 4141 (Std Cost Variance)

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 2 | Interbranch Transfer | **Accounts / Transfers** | If not set to generate interbranch entries, only the issuing branch receives a GL entry. The receiving side posts to the item ledger but not the GL — single-sided transaction. |
| Process | 3 | Override Unit Cost | **Accounts** | A manually entered cost that differs from the F4105 standard generates a 4141 variance entry. |

> **When you see an IT transaction on the Transactions page:** First determine whether this is a same-branch or interbranch transfer. Single-sided IT transfers are expected behavior for certain configurations — confirm by checking whether the GL nets to $0 (Section 3). If the account differs between F4111 and F0911, compare the GL class codes of the From and To locations — different codes will invoke different AAI 4122/4124 entries.

---

## P4114 — Inventory Adjustments (Document Type: IA)

**AAIs Invoked:** 4122 (Inventory), 4124 (Expense/COGS offset), 4141 (Std Cost Variance)
**Also uses:** UDC 40/AV for average cost item offset account

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | Allow Entry of GL Account | **Accounts** | Operator manually enters the 4124 offset account. F0911 reflects the entered account; F4111 retains the AAI account — account mismatch. |
| Process | 2 | Cost Method | **Accounts** | If the cost method used differs from the item standard, a 4141 variance entry is created. |
| Process | 3 | Average Cost Adjustment Account | **Accounts** | For average cost items, controls whether the offset is AAI 4124 or UDC 40/AV. If 40/AV is not set up or points to the wrong account, the offset posts incorrectly. |

> **When you see an IA transaction on the Transactions page:** Check whether the item is average cost (method 02). If so, verify UDC 40/AV is configured correctly for the GL class code. If the item is standard cost, check whether processing option 1 is enabled in the version used and whether a manual account was entered.

---

## P4116 — Inventory Reclassifications (Document Type: IR)

**AAIs Invoked:** 4122 (From Item — Inventory credit), 4124 (To Item — Inventory debit), 4141 (Std Cost Variance)

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | Cost Method | **Accounts** | If the From and To items have different standard costs, a 4141 variance is generated. A misconfigured 4141 account produces an account mismatch. |
| Process | 2 | Allow Override of Unit Cost | **Accounts** | A manually entered cost that differs from the F4105 standard generates a 4141 entry. |

> **When you see an IR transaction on the Transactions page:** Check whether the From and To items have different GL class codes (Section 6 of the detail report will show both). A different GL class code on each item will produce different AAI lookups and is the most common cause of IR account mismatches. Also check whether the two items carry different standard costs, which would generate a 4141 entry.

---

## R41413 / R41610 — Cycle Count & Tag Count Update (Document Types: WK / WS)

**AAIs Invoked:** 4152 (Inventory), 4154 (COGS/Variance offset)

| Program | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Both | GL Date option | GL Date | **Periods** | If the count entry date and the batch update date span a period end, the item ledger date falls in one period while the GL date falls in another — period mismatch. |
| R41413 | Proof/Final Mode | Final Mode | **Accounts / Periods** | Running in final mode when data is not ready creates permanent F4111 and F0911 entries. These cannot be undone without a reversing adjustment. |

> **When you see a WK or WS transaction on the Transactions page:** The sub-type will almost always be **Periods**. Confirm by comparing the fiscal period in F4111 (Section 2) to the GL date in F0911 (Section 3). If they differ, the count entry and the update batch ran in different periods. The corrective action is a manual journal entry to move the variance to the correct period.

---

## R41052 — Future Cost Update (Document Type: IB)

**AAIs Invoked:** 4172 (Inventory), 4174 (Expense/COGS offset)

| Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|
| From Cost Method | Incorrect source cost method | **Accounts** | Using the wrong source method means the starting value for the revaluation is incorrect — the IB entry will not fully correct the inventory value. |
| GL Date | GL date spans a period end | **Periods** | If the cost rollup runs after the period-end snapshot but before the nightly import, the IB entry may appear in a different period than the GL entry. |
| Proof/Final Mode | Final mode run prematurely | **Accounts / Periods** | Permanent F4111 and F0911 entries are created. Cannot be undone without a reversing IA adjustment. |

> **When you see an IB transaction on the Transactions page:** Confirm whether a cost rollup (R41052) was run during or near the period end. IB transactions are written to F4111 and appear in the perpetual balance immediately. If the corresponding F0911 entry posted in a different period, a period mismatch will result. Check the GL date in Section 3 against the item ledger date in Section 2.

---

## Flexible Accounting — Additional Variance Risk

Flexible Accounting (F4096) is partially supported in P4112, P4113, P4114, and P4116. If enabled, it dynamically constructs the business unit portion of the account from transaction fields rather than reading it from the DMAAI.

| Scenario | Variance Sub-Type | Notes |
|---|---|---|
| Manual account entry (P4112 / P4114 PO 1) | **Accounts** | Flexible Accounting is **not** applied to manually entered accounts. The AAI-assigned account is written to F4111; the manual account to F0911. |
| AAI 4122 or 4124 set up in F4096 but DMAAI business unit not left blank | **Accounts** | If the DMAAI has a hard-coded business unit AND a Flexible Accounting rule exists, the hard-coded value overrides the flex rule — the accounts will not match. |
| XT4111Z1 enabled but flex rules not defined for all GL class codes | **Accounts** | Items without a flex rule fall back to the standard DMAAI. If the standard DMAAI account differs from the expected flexed account, a mismatch results. |

> **When Flexible Accounting is active:** Use Integrity Report 0 (JDE DMAAs) in RapidReconciler to view both F4095 and F4096 entries side by side for the GL class code in question. Section 6 of the Transaction Detail report will show which entry was used.

---

## Quick Lookup — Variance Sub-Type to Likely Cause

| Document Type | Sub-Type | First Thing to Check |
|---|---|---|
| **II** | Accounts | Is PO 1 or PO 2 enabled in the version? Was a manual account entered? |
| **IT** | Transfers | Is this interbranch? Do the From and To locations have different GL class codes? |
| **IT** | Accounts | Do the From and To branch/plants use different AAI 4122/4124 configurations? |
| **IA** | Accounts | Is the item average cost? Check UDC 40/AV. Is PO 1 enabled? Was a manual account entered? |
| **IR** | Accounts | Do the From and To items have different GL class codes? Do they have different standard costs (4141)? |
| **WK / WS** | Periods | Did the count update batch run in a different period than the count entry date? |
| **IB** | Periods | Did R41052 run near a period end? Compare F4111 date to F0911 GL date. |
| **IB** | Accounts | Is AAI 4172 or 4174 misconfigured? Was the wrong From Cost Method specified? |
| **Any** | Accounts | Is Flexible Accounting active? Check Integrity Report 0 and Section 6 of the detail report. |

# JD Edwards Purchasing Programs — Processing Options & Variance Reference

This reference supports transaction detail analysis in RapidReconciler. For each purchasing program, it lists the processing options and configurations most likely to have caused a variance, and the sub-type it will appear as on the Transactions page.

> **Note on purchasing variances:** Several purchasing AAIs (4332, 4335, 4337, 4340) are **not written to F4111**. Variances from these AAIs appear only in F0911 and will show as one-sided GL entries on the Transactions page — the cardex side will be absent or will net to zero. This is expected behavior, not a data error.

---

## P4312 — Purchase Order Receipts (Document Type: OP / OV)

**AAIs Invoked:** 4310 (Inventory), 4320 (RNV credit), 4335 (Std Cost Variance — not written to F4111), 4337 (Material Burden — not written to F4111), 4350/4355 (Tax), 4385/4390 (Landed Cost), 4400/4405 (Zero Balance)

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | Cost Method for Receipt | **Accounts** | Controls which cost is used to value the receipt in F4111. If different from the standard cost in F4105, a variance is written to AAI 4335. A misconfigured 4335 account produces an account mismatch. |
| Process | 2 | GL Date Source | **Periods** | Controls whether the GL date is the system date or the PO promised date. If the promised date falls in a prior period, the receipt posts to a different period than the item ledger entry date — period mismatch. |
| Process | 3 | Standard Cost Variance Account | **Accounts** | If receiving at a cost different from the F4105 standard and AAI 4335 is not configured, the variance has nowhere to post — receipt will error or post to an unexpected account. |
| Process | 4 | Landed Cost at Receipt | **Accounts** | Enables landed cost processing at receipt (AAIs 4385/4390). If AAI 4385 is misconfigured, landed cost entries post to the wrong inventory account. **Do not enable if Material Burden (4337) is also in use.** |
| Process | 5 | Material Burden | **Accounts** | Enables Material Burden (AAI 4337). If 4337 is not configured, the credit side of the burden entry has no account — the receipt will error. Burden is only valid for purchased items (stocking type "P"). |
| Defaults | — | Line Type Inventory Interface | **Accounts** | For line types with interface "A" or "B", the account source for RNV and variance AAIs differs from standard stock items. A misconfigured line type produces an unexpected account on the RNV (4320) side. |

> **When you see an OP/OV transaction on the Transactions page:** Check the cost method in the version's processing options. For standard cost environments, compare the receipt cost in Section 2 (F4111) to the F4105 standard cost in Section 6 — any difference will generate a 4335 entry. If the sub-type is **Periods**, check whether the GL date processing option is set to use the promised date rather than the system date.

---

## P4314 — Voucher Match (Document Type: PV)

**AAIs Invoked:** 4320 (RNV debit), 4330 (Purchase Price Variance — written to F4111), 4332 (Cost of Sales Variance — not written to F4111), 4335 (additional std cost variance — not written to F4111), 4340 (Exchange Rate Variance — not written to F4111), PC (A/P Trade)

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | Voucher Match Variance Account | **Accounts** | Controls whether purchase price variances at voucher match are written to AAI 4330 (variance account) or back to the inventory account. Requires the Voucher Match Variance Account flag to also be checked in the Line Type definition. Mismatch between this option and the Line Type flag produces an unexpected account. |
| Process | 2 | GL Date | **Periods** | If the voucher GL date falls in a different period than the original receipt, the RNV debit (4320) posts in a different period than the RNV credit — period mismatch on the RNV account. |
| Process | 3 | Exchange Rate Variance Account | **Accounts** | For foreign currency POs, controls where exchange rate variances (AAI 4340) post. If 4340 is not configured, the exchange rate variance has no account and the match will error or post unexpectedly. |
| Defaults | — | Line Type — Voucher Match Variance Account flag | **Accounts** | If this flag is unchecked in the Line Type definition, purchase price variances are written back to the account on the PO line rather than AAI 4330 — regardless of the processing option setting. This is a common source of unexpected accounts on voucher match transactions. |

> **When you see a PV transaction on the Transactions page:** First determine whether this is a price variance (invoice amount differs from receipt amount) or a period mismatch. For price variances, check whether AAI 4330 is configured and whether the Voucher Match Variance Account flag is checked in the Line Type — both must be set for 4330 to be used. For period mismatches, compare the voucher GL date to the original receipt date.

### AAI 4332 — Goods Sold Prior to Voucher Match

AAI 4332 is invoked automatically at voucher match when the current on-hand quantity is less than the quantity being vouchered — meaning some or all of the goods have already been sold. It is **not written to F4111** and will appear as a one-sided GL entry.

| Trigger Condition | Variance Sub-Type | What to Look For |
|---|---|---|
| On-hand qty < qty being vouchered | **Accounts** | The 4332 account appears in F0911 (Section 3) with no corresponding F4111 entry. Confirm by checking current on-hand quantity at the time the voucher was matched. |
| AAI 4332 not configured | **Accounts** | If 4332 is missing, the COGS portion of the variance has no account — the voucher match will error or post to an unexpected account. |

---

## P43250 — Movement & Disposition / Receipt Routing (Document Types: OP / OV)

**AAIs Invoked:** 4365 (Prior to Receipt Liability), 4370 (Routing Operation), 4375 (Expense — for dispositioned items)

| Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|
| Routing Step Configuration | Operation accounts not defined for each step | **Accounts** | Each routing step requires its own AAI 4365/4370 configuration. If a step is missing, the movement posts to an unexpected account or errors. |
| Disposition | Item dispositioned off during routing | **Accounts** | Items removed from routing (scrap, return to vendor) debit AAI 4375. If 4375 is not configured or points to the wrong expense account, the disposition posts incorrectly. |

> **When you see a routing-related transaction on the Transactions page:** Identify which routing step the variance originates from using the order data in Section 5. Compare the expected AAI 4365/4370 account for that step to what posted in F0911 (Section 3). Receipt routing variances are almost always caused by a missing or misconfigured step-level AAI.

---

## P43214 — Stand Alone Landed Cost (Document Type: OV)

**AAIs Invoked:** 4385 (Inventory or Landed Cost), 4390 (Landed Cost Temporary Liability), 4332 (if on-hand qty < qty being costed)

| Scenario | Variance Sub-Type | How It Causes a Variance |
|---|---|---|
| AAI 4385 misconfigured | **Accounts** | Landed cost credits the 4390 liability and debits 4385. If 4385 points to the wrong inventory account, the landed cost posts to an incorrect GL account — account mismatch between F4111 and F0911. |
| AAI 4332 invoked (on-hand < qty) | **Accounts** | Same behavior as voucher match — if goods have been sold, 4332 is invoked for the sold portion. 4332 is not written to F4111, producing a one-sided GL entry. |
| Landed cost applied at receipt instead of via P43214 when Material Burden is active | **Accounts** | Applying landed cost at receipt (P4312) while Material Burden (4337) is also enabled produces duplicate cost entries. Use P43214 as the standalone program instead. |

> **When you see an OV transaction from P43214 on the Transactions page:** Check whether the 4385 account matches the inventory account expected for the item's GL class code. Also check whether 4332 was invoked — look for a GL entry in F0911 (Section 3) with no corresponding F4111 entry on the same document.

---

## Material Burden — AAI 4337 (P4312 Only)

Material Burden is a credit-only entry generated exclusively by the receipts program. It is **not invoked by voucher match** and is **not written to F4111**.

| Condition | Variance Sub-Type | How It Causes a Variance |
|---|---|---|
| 4337 not configured for GL class code | **Accounts** | The burden credit has no account — the receipt will error or post to an unexpected account. |
| Landed cost also applied at receipt | **Accounts** | Combining landed cost at receipt with Material Burden produces duplicate cost additions. Use standalone landed cost (P43214) instead. |
| Item is manufactured (stocking type "M") | **Accounts** | Material Burden is for purchased items only. Applying it to manufactured items produces an unexpected credit that does not match any corresponding F4111 entry. |

> **When Material Burden is active:** A credit to 4337 will appear in F0911 with no matching F4111 entry. This is expected. If the 4337 credit is posting to the wrong account, verify the AAI is configured for the correct GL class code and that the item's stocking type is "P".

---

## Quick Lookup — Variance Sub-Type to Likely Cause

| Document Type | Sub-Type | First Thing to Check |
|---|---|---|
| **OP / OV** (Receipt) | Accounts | What cost method is in the version's PO? Does the receipt cost match the F4105 standard? Is AAI 4335 configured? Is Material Burden (4337) enabled? |
| **OP / OV** (Receipt) | Periods | Is the GL date PO set to use the promised date? Does the promised date fall in a prior period? |
| **PV** (Voucher Match) | Accounts | Is the Voucher Match Variance Account flag checked in the Line Type? Is AAI 4330 configured? Was 4332 invoked (on-hand < qty vouchered)? |
| **PV** (Voucher Match) | Periods | Does the voucher GL date fall in a different period than the original receipt? |
| **OV** (Landed Cost) | Accounts | Is AAI 4385 configured for the correct GL class code? Was 4332 invoked? Is Material Burden also active? |
| **OP / OV** (Routing) | Accounts | Is AAI 4365/4370 configured for every routing step? Was an item dispositioned off (check 4375)? |
| **Any** | Accounts (one-sided) | Is this a non-F4111 AAI (4332, 4335, 4337, 4340)? These produce GL-only entries with no cardex counterpart — confirm whether this is expected before treating it as an error. |

# JD Edwards Sales Programs — Processing Options & Variance Reference

This reference supports transaction detail analysis in RapidReconciler. For each sales program, it lists the processing options and configurations most likely to have caused a variance, and the sub-type it will appear as on the Transactions page.

> **Note on sales variances:** Sales transactions are End of Day by nature — the item ledger (F4111) is updated at ship confirmation while the GL (F0911) is not updated until Sales Update (R42800) runs, typically nightly. A transaction that appears in the End of Day variance section is not yet in F0911 at all. It will only appear on the Transactions page after Sales Update runs and a mismatch exists between what posted to F4111 and F0911.

---

## P4210 — Sales Order Entry

No journal entries are created at Sales Order Entry. However, two processing options set here carry forward to affect which AAIs are invoked during Sales Update.

| Tab | Option # | Setting | Downstream Variance Risk |
|---|---|---|---|
| Defaults | — | Interbranch Order Flag | If interbranch processing is enabled here but AAI 4260 (Interbranch Revenue) is not configured, Sales Update will error on affected orders. |
| Interop | — | Advanced Pricing | If Advanced Pricing adjustments are attached to the order and AAIs 4270/4280 are not configured for the applicable adjustment types, Sales Update will fail to post the adjustment entries — producing a one-sided GL entry. |

> **When you see a sales transaction on the Transactions page that originated from an interbranch order:** Confirm whether AAI 4260 is configured for the GL class code and company. Interbranch revenue posts separately from standard revenue (4230) and requires its own AAI entry.

---

## R42800 — Sales Update (Document Types: RI / RR / RC)

**AAIs Invoked:** 4210 (Inventory credit), 4220 (COGS debit), 4230 (Revenue), 4240 (Inventory — standard entry), 4245 (A/R Trade — when A/R bypassed), 4250 (Sales Tax), 4260 (Interbranch Revenue), 4270 (Advanced Price Adjustment), 4280 (Advanced Price Accruals)
**Financial AAIs:** RC (Accounts Receivable), RT (Sales Tax)

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Defaults | 1 | GL Date Source | **Periods** | Controls whether the GL date is the invoice date or the system date. If the invoice date falls in a prior period, the GL entry posts in a different period than the item ledger ship confirmation date — period mismatch. |
| Defaults | 2 | A/R Bypass | **Accounts** | Setting this to "1" bypasses the standard A/R entry and instead posts to AAI 4245. If 4245 is not configured or points to the wrong account, the receivable posts incorrectly. |
| Defaults | 3 | Cost of Goods Sold | **Accounts** | Controls whether the COGS side of the entry uses AAI 4220 or AAI 4240. Switching between these mid-period without updating the AAI configuration produces an account mismatch. |
| Defaults | 5 | Business Unit Source | **Accounts** | Controls where the business unit portion of the account is sourced from: Subsequent Cost Center, Branch/Plant on the order, or Sold-To Address Book Number. If this differs from what the AAI expects, all sales entries for affected orders post to the wrong business unit. This is one of the most impactful settings in R42800. |
| Update | 1 | Interbranch Revenue | **Accounts** | Enables AAI 4260 for interbranch orders. If enabled here but not in P4210, or if 4260 is not configured for the GL class code, interbranch revenue posts to 4230 instead — or errors. |
| Update | 2 | A/R Bypass (Update tab) | **Accounts** | Secondary control for A/R bypass. Must be consistent with the Defaults tab setting. Inconsistency between versions produces different accounting for different order types. |
| Update | 3 | Summarize GL Entries | **Accounts / Periods** | Controls whether GL entries are written in detail or summarized by account. Summarized entries can obscure individual transaction mismatches and make Transactions page drill-down less useful. Does not change which accounts are used, but affects whether individual document numbers are traceable in F0911. |
| Print | — | Version | **Accounts** | Different versions of R42800 may have different processing option settings. If multiple versions are in use (e.g., one for domestic, one for intercompany), confirm which version processed the order in question before diagnosing the variance. |

> **When you see an RI/RR/RC transaction on the Transactions page:** Start with processing option 5 (Business Unit Source) on the Defaults tab — this single setting is the most common cause of systematic account mismatches across all sales transactions in a given version. Then check the GL date option (Defaults 1) for period mismatches. For COGS-side mismatches, compare whether the version uses AAI 4220 or 4240 (Defaults 3) and verify that AAI is correctly configured for the item's GL class code.

### GL Class Code Source — Sales Transactions

The GL class code for sales AAIs (4210, 4220, 4230, 4240) is sourced from the **Item Location table (F41021)**, not the Item Branch table (F4102). For non-stock line types, it is sourced from the Line Type definition. This is the same behavior as inventory programs and the same mismatch risk applies.

| Inventory Interface | GL Class Code Source |
|---|---|
| **Y and D** | Item Location (F41021) |
| **N** | Line Type definition |

> If F41021 and F4102 carry different GL class codes for the same item, the sales transaction will post using the F41021 value while other reports or inquiries may show the F4102 value — making the variance difficult to trace without checking both tables.

---

## Advanced Pricing — AAIs 4270 and 4280

Advanced Pricing adjustments (discounts, markups, accruals) post through R42800 but use a different GL class code source than the line item.

| Scenario | Variance Sub-Type | How It Causes a Variance |
|---|---|---|
| GL class code blank in Price Adjustment Definition (P4071) | **Accounts** | If the adjustment definition does not specify a GL class code, the system falls back to the line item GL class code. If the AAI is not set up for that GL class code, the adjustment posts to an unexpected account or errors. |
| AAI 4270 configured but 4280 not configured (or vice versa) | **Accounts** | 4270 (adjustment) and 4280 (accrual offset) work as a pair. A missing or misconfigured 4280 leaves the accrual side without an account. |
| Flexible Accounting rule defined for 4270 but DMAAI business unit not left blank | **Accounts** | Same as standard flex behavior — if the DMAAI has a hard-coded business unit and a Flexible Accounting rule also exists for 4270, the hard-coded value overrides the flex rule. |

> **When you see an Advanced Pricing adjustment on the Transactions page:** Check the Price Adjustment Definition (P4071) for the adjustment type — the GL class code field there determines which AAI 4270/4280 entry is used. If it is blank, the line item's GL class code is used instead. Confirm which AAI entry was actually selected by reviewing Section 6 of the Transaction Detail report.

---

## Interbranch Sales — AAI 4260

AAI 4260 records interbranch revenue when goods are sold from one branch/plant and billed from another. It is invoked only when both P4210 and R42800 processing options are configured for interbranch processing.

| Condition | Variance Sub-Type | How It Causes a Variance |
|---|---|---|
| 4260 not configured for GL class code | **Accounts** | Interbranch revenue has no account — Sales Update will error with message 0381 specifying AAI 4260 as missing. |
| Interbranch enabled in one program but not the other | **Accounts** | If P4210 enables interbranch but R42800 does not (or vice versa), the revenue entry does not post as expected — standard 4230 revenue is used instead, or the entry is omitted. |
| 4260 configured but points to same account as 4230 | **Accounts** | Technically valid but makes interbranch revenue indistinguishable from standard revenue in the GL — may appear correct in RapidReconciler but obscures intercompany accounting. |

---

## Flexible Accounting — Sales (R42800)

Flexible Accounting for sales is applied during R42800 and allows the business unit and subsidiary to be constructed dynamically from combinations of transaction fields (customer, item, category codes, etc.).

**AAIs that can be flexed for sales:** 4220, 4230, 4240, 4245, 4250, 4270, 4280

| Scenario | Variance Sub-Type | How It Causes a Variance |
|---|---|---|
| Flex rule defined but DMAAI business unit not left blank | **Accounts** | The hard-coded DMAAI business unit overrides the flex rule — all transactions use the hard-coded account regardless of the flex configuration. |
| Flex rule not defined for all GL class codes in use | **Accounts** | Items without a matching flex rule fall back to the standard DMAAI. If the standard DMAAI account differs from the expected flexed account, a mismatch results. |
| Setup Method set to "C" (Combination) with conflicting Object and AAI rules | **Accounts** | Object takes precedence over AAI in Combination mode. If Object and AAI rules point to different accounts, the Object rule always wins — AAI-based flex is effectively ignored. |
| Selective version approach — only some R42800 versions have flex enabled | **Accounts** | If flex is active in one version but not another, the same item/customer combination will post to different accounts depending on which version processed the order. |

> **When Flexible Accounting is active for sales:** Use Integrity Report 0 (JDE DMAAs) in RapidReconciler to view both F4095 and F4096 entries for the GL class code in question. Section 6 of the Transaction Detail report will show which entry was selected. Also confirm which R42800 version processed the order — flex behavior is version-specific.

---

## Quick Lookup — Variance Sub-Type to Likely Cause

| Document Type | Sub-Type | First Thing to Check |
|---|---|---|
| **RI / RR / RC** | Accounts | What is PO 5 (Business Unit Source) in the R42800 version? Does the business unit in F0911 match what the AAI would produce for that branch/plant? |
| **RI / RR / RC** | Accounts (COGS side) | Does the version use AAI 4220 or 4240 (PO 3)? Is that AAI correctly configured for the item's GL class code? |
| **RI / RR / RC** | Accounts (A/R side) | Is A/R bypass enabled (PO 2)? Is AAI 4245 configured? Does RC match the customer's GL Distribution setting in P03013? |
| **RI / RR / RC** | Periods | Is the GL date set to invoice date (PO 1)? Does the invoice date fall in a prior period? |
| **RI / RR / RC** | Accounts (interbranch) | Is AAI 4260 configured for the GL class code? Are both P4210 and R42800 set to enable interbranch? |
| **RI / RR / RC** | Accounts (Advanced Pricing) | Is the GL class code populated in the Price Adjustment Definition (P4071)? Are both AAIs 4270 and 4280 configured? |
| **Any sales** | Accounts | Is Flexible Accounting active for R42800? Check Integrity Report 0 and Section 6 of the Transaction Detail. Is the DMAAI business unit left blank for flexed AAIs? |
| **Any sales** | Accounts | Does F41021 carry a different GL class code than F4102 for this item? Sales transactions use F41021 — confirm the correct class code is in place. |

# JD Edwards Manufacturing Programs — Processing Options & Variance Reference

This reference supports transaction detail analysis in RapidReconciler. For each manufacturing program, it lists the processing options and configurations most likely to have caused a variance, and the sub-type it will appear as on the Transactions page.

> **Note on manufacturing variances:** Manufacturing is an End of Day process. Item ledger records (F4111) for material issues (IM) and completions (IC) are created throughout the day, but no GL entries exist until Manufacturing Accounting (R31802A) runs — typically nightly. Transactions in the End of Day variance section have not yet been processed by R31802A. They will only appear on the Transactions page after R31802A runs and a mismatch exists between F4111 and F0911.

> **Critical GL class code rule for manufacturing:** The credit side of a material issue (IM) uses the GL class codes of the **individual components** to reduce raw material inventory (AAI 3110). All other manufacturing transaction types — including the debit side of IM — use the GL class code of the **parent item**. This split-class-code behavior is unique to manufacturing and is the most common source of misdiagnosed account mismatches on the Transactions page.

---

## R31802A — Manufacturing Accounting (Document Types: IM / IH / IC / IS)

R31802A is the central manufacturing accounting program. It generates all GL entries for material issues, labor, completions, and scrap. No GL entries exist for any manufacturing transaction until this program runs in final mode.

**AAIs Invoked:**

| AAI | Account | Transaction Types |
|---|---|---|
| **3110** | Raw Material / Sub-Assembly Inventory | IM credit — uses **component** GL class codes |
| **3120** | Work In Process (WIP) | IM debit, IH debit, IC credit, IS credit |
| **3130** | Finished Goods / Sub-Assembly Inventory | IC debit, IS debit (scrap) |
| **3401** | Payroll Accrual | IH credit |

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | GL Date Source | **Periods** | Controls whether the GL date is the work order completion date or the system date R31802A is run. If the work order was completed in a prior period but R31802A runs in the next period, all entries post in the new period — period mismatch against the F4111 creation date. |
| Process | 2 | Proof or Final Mode | **Accounts / Periods** | Running in final mode before all transactions are posted creates permanent F4111 and F0911 entries. R31802A cannot be run again for the same work order once it has been processed in final mode — corrections require manual journal entries. |
| Process | 3 | Cost Method | **Accounts** | Controls which frozen cost is used to value material issues and completions. If this differs from the cost method used when work order processing (R31410) was run, the per-unit values will not match — producing an amount discrepancy between the item ledger and GL. |
| Defaults | — | Branch/Plant Constants — GL Explanation Field | **Accounts** (traceability) | If set to "1" (part description), journal entries use the item description rather than the part number. Descriptions change over time and make it difficult to trace transactions back to the originating item. Set to "2" (Primary Part Number) for reliable traceability. |

> **When you see an IM transaction on the Transactions page:** The most important first check is whether the account mismatch is on the debit side (WIP — AAI 3120, uses parent GL class code) or the credit side (Raw Material — AAI 3110, uses component GL class codes). A mismatch on the credit side means the component's GL class code is not configured in AAI 3110 — check Section 6 of the Transaction Detail for each component's class code. A mismatch on the debit side means AAI 3120 is misconfigured for the parent item's GL class code.

> **When you see an IC transaction on the Transactions page:** Check AAI 3130 for the parent item's GL class code (Finished Goods debit) and AAI 3120 for the WIP credit. Both use the parent item's GL class code. If the amounts differ, check whether R31802A used a different cost method than R31410 (Work Order Processing).

> **When you see an IH transaction on the Transactions page:** Check AAI 3120 (WIP debit) and AAI 3401 (Payroll Accrual credit). Both use the parent item's GL class code. If the labor rate differs from what is in F30026, check UDC table 31/ER — if an employee's rate is missing or incorrect, the labor entry will be calculated at the wrong rate.

---

## R31804 — Variance Accounting (Document Type: IV)

R31804 clears the WIP account for a work order after all material and labor have been posted. It can only be run once per work order and must be run after R31802A has processed all IM, IH, and IC transactions for that order.

**Formula: WIP = (IM + IH) − IC = IV**

**AAIs Invoked:**

| AAI | Account | Variance Type |
|---|---|---|
| **3120** | Work In Process (WIP) | Debit or credit as required to clear WIP to zero |
| **3220** | Labor Variance | Offset for labor variance |
| **3240** | Material Variance | Offset for material variance |
| **3260** | Planned Variance | Offset for planned variance |
| **3270** | Engineering Variance | Offset for engineering variance |
| **3280** | Other Variance | Offset for other variance / WIP clearance |

| Tab | Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|---|
| Process | 1 | GL Date Source | **Periods** | Same risk as R31802A. If variance accounting runs in a different period than the original IM/IH/IC entries, the IV entries post in a different period — period mismatch. |
| Process | 2 | Proof or Final Mode | **Accounts** | Final mode is irreversible. Running variance accounting before all IM/IH/IC transactions have been processed will clear WIP at an incorrect balance, producing a permanent variance that requires a manual journal entry to correct. |
| Process | 3 | Variance Account Selection | **Accounts** | Controls which variance AAIs (3220–3280) are used. If a variance type occurs but the corresponding AAI is not configured, the variance has no account and R31804 will error or post to an unexpected account. |

> **When you see an IV transaction on the Transactions page:** Identify which variance type produced the mismatch by reviewing the AAI in Section 6 of the Transaction Detail. Then check whether the corresponding variance AAI (3220, 3240, 3260, 3270, or 3280) is configured for the parent item's GL class code. Also confirm that R31804 was not run before all IM/IH/IC transactions were fully processed — a premature run will produce a WIP clearance that does not reflect the true work order cost.

### Variance Types and Their Causes

| Variance Type | AAI | Most Likely Configuration Cause |
|---|---|---|
| **Engineering** (3270) | 3270 | R31410 (Work Order Processing) compared Standard Cost to Current Cost and found differences. Current Cost reflects BOM or routing changes not yet in the standard. |
| **Planned** (3260) | 3260 | A different component was substituted for the one on the BOM, or assembly occurred at a work center with different rates than planned. |
| **Material** (3240) | 3240 | Actual material or labor used differed from the planned amount. Quantity Ordered ≠ Quantity Issued. |
| **Labor Efficiency** (3220) | 3220 | Work center efficiency is not 100%. Only generated if Work Center Efficiency is enabled in Manufacturing Constants. |
| **Other / WIP Clearance** (3280) | 3280 | WIP balance after all IM/IH/IC could not be attributed to a specific variance type — remaining balance cleared here. Common when material is issued for more units than were completed and unused material was not returned. |

---

## R31410 — Work Order Processing

Work Order Processing attaches frozen standards, current costs, and planned costs to the work order at the time it is run. These values are locked to the work order and do not update if costs change afterward.

No GL entries are created by R31410. However, its processing options directly affect the amounts that R31802A and R31804 will use.

| Option # | Setting | Downstream Variance Risk |
|---|---|---|
| Cost Method | Frozen standard cost method | If the cost method specified here differs from the method used in R31802A, per-unit values will not align — producing amount discrepancies in IM and IC entries. |
| BOM Effectivity Date | Date used to select active BOM components | If the effectivity date does not match the actual production date, components that have been added or removed from the BOM may be included or excluded incorrectly — producing planned variances (AAI 3260) at R31804. |
| Routing Effectivity Date | Date used to select active routing operations | Same risk as BOM effectivity — operations not effective as of this date will not be included in the planned cost, producing labor variances (AAI 3220) at R31804. |

> **When variance accounting (IV) produces unexpectedly large engineering or planned variances:** Check whether R31410 was run with the correct effectivity dates. If BOM or routing changes were made after R31410 ran but before manufacturing was completed, the current cost will differ from the frozen standard — producing an engineering variance (3270) even when no actual production error occurred.

---

## R31422 — Hours and Quantities Update (Document Type: IH)

R31422 posts labor and overhead accruals from work order time entries to the item ledger. Like R31802A, it is an End of Day program — F4111 is updated by the time entry, but F0911 is not updated until R31422 runs.

| Option # | Setting | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|
| GL Date Source | Work order date vs. system date | **Periods** | If time entries are recorded in one period but R31422 runs in the next, the IH entries post in the new period — period mismatch. |
| Labor Rate Source | UDC 31/ER vs. work center rate | **Accounts** | If actual labor is charged by individual and UDC table 31/ER is not current, the labor rate used by R31422 will differ from the expected rate — producing an amount discrepancy between F4111 and F0911. |

> **When you see an IH transaction on the Transactions page with an amount discrepancy:** Check UDC table 31/ER for the employee who recorded the time entry. If the rate in 31/ER does not match the current payroll rate, the labor entry will be calculated at an incorrect amount. This table must be maintained in sync with payroll — if it is not, a systematic labor variance will accumulate across all work orders charged by that employee.

---

## Manufacturing Constants — Configuration Issues That Cause Systematic Variances

The following Manufacturing Constants settings are not processing options on individual programs, but misconfiguration produces variances across all work orders in the affected branch/plant.

| Setting | Location | Variance Sub-Type | How It Causes a Variance |
|---|---|---|---|
| **Work Center Efficiency** | Manufacturing Constants | **Accounts** (Labor Efficiency — AAI 3220) | If enabled, creates separate journal entries for labor efficiency variances. If AAI 3220 is not configured for all GL class codes in use, efficiency entries have no account and R31804 will error. |
| **Accounting Cost Quantity (ACQ)** | Manufacturing Constants | **Accounts** (Setup Variance) | ACQ determines setup cost per unit. If left at the default of "1" and setup costs are significant, setup cost per unit is dramatically overstated — producing large unfavorable setup variances on small work orders and large favorable variances on large ones. |
| **Fixed and Variable Overhead** | Manufacturing Constants | **Accounts** | Both are calculated identically as a rate or percentage of labor. If both are configured simultaneously without a clear split, overhead may be double-counted — inflating WIP and producing unexpected variances at R31804. |
| **GL Class Code — F41021 vs. F4102** | Item Branch / Item Location | **Accounts** | Manufacturing journal entries use the GL class code from F41021 (Item Location), not F4102 (Item Branch). If these differ, transactions post to an unexpected account. No warning is generated by JD Edwards when these values differ. |

---

## Quick Lookup — Variance Sub-Type to Likely Cause

| Document Type | Sub-Type | First Thing to Check |
|---|---|---|
| **IM** | Accounts (credit side) | Does the component's GL class code exist in AAI 3110? The credit side uses component GL class codes — check Section 6 for each component. |
| **IM** | Accounts (debit side) | Is AAI 3120 configured for the parent item's GL class code? |
| **IM** | Periods | Did R31802A run in a different period than the material issue date? Check the GL date processing option. |
| **IC** | Accounts | Are AAIs 3130 (Finished Goods debit) and 3120 (WIP credit) configured for the parent GL class code? Did R31802A use the same cost method as R31410? |
| **IC** | Periods | Did R31802A run in a different period than the completion date? |
| **IH** | Accounts | Is UDC 31/ER current for the employee who recorded the time? Does the labor rate match the expected work center rate? |
| **IH** | Periods | Did R31422 run in a different period than the time entry date? |
| **IS** | Accounts | Is AAI 3130 configured as a scrap account for the parent GL class code? Is the scrap account separate from the finished goods account? |
| **IV** | Accounts | Which variance type (3220–3280) is misconfigured? Was R31804 run before all IM/IH/IC transactions were posted? |
| **IV** | Periods | Did R31804 run in a different period than the IM/IH/IC entries it is clearing? |
| **Any manufacturing** | Accounts | Does F41021 carry a different GL class code than F4102 for the parent item or any component? Manufacturing uses F41021 — verify directly. |
| **Any manufacturing** | Accounts | Is Work Center Efficiency enabled in Manufacturing Constants? Is AAI 3220 configured for all GL class codes in use? |

