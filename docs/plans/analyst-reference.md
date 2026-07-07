# Analyst Reference — transaction-variance root-cause → corrective-action knowledge base

**Status:** SCAFFOLD 2026-07-07 (structure + schema only; owner authors the per-module content).
This is the analyst-side companion to the accountant [`accounting-reference.md`](accounting-reference.md)
and mirrors the [[dmaai-reference]] pattern: a curated doc + a compact `RRV8.ANALYST_GROUNDING`
constant (to be added in config.js when content exists), kept in sync, prepended to the analyst AI
reads (`askAnalyst` / `_analystPrompt` / `_analystTxFacts`). Worklist: **UI-24**. Full process design +
the closed-card/convergence model live in [`transaction-variance-process.md`](transaction-variance-process.md).

## Mission (owner-confirmed 2026-07-07)

Drive the recurring transaction-variance residual to **zero at the source** — so inventory-to-GL ties
on its own, period after period, without correcting entries. The analyst finds the root cause of a
variance and fixes it at the SOURCE (config / order-process / re-roll); **the analyst never posts a
journal entry** (that's the accountant — [[project_analyst_accountant_role_split]]). Every module's
corrective-action ladder serves this one goal.

## Structure — two layers, one schema per module

**(A) Foundational layer — DMAAIs.** The AAI-config substrate every order process resolves through.
Do NOT re-author it here — reference the existing **[[dmaai-reference]]** + `AiService.DMAAI_GROUNDING`.
Each process module below cites the specific DMAAIs it touches.

**(B) Process / variance modules.** One section each, all on the same **5-part schema**:
1. **Process** — the JDE flow (docs → F4211/F4311 → F4111/F0911).
2. **Root cause(s)** — why a residual is left (config / timing / missing linkage / sign).
3. **RR signals** — which Transaction-Variance card/subtype + fields surface it (ties to the DAC-16
   10-card taxonomy — the connective tissue between this KB and what the analyst sees).
4. **Corrective-action ladder** — the ONE best SOURCE fix first (DMAAI/config → order/process setup →
   re-roll/reload), by return-on-effort, + anti-patterns. **Never a journal entry** (hand a real,
   unfixable residual to the accountant).
5. **Related DMAAIs** — cross-links into the foundational reference.

---

## Module: MTO (Make-to-Order) processing  `[OWNER — author the content]`

- **Process:** `[OWNER]` — the SO→WO linkage and how MTO legs post (IM/IC) across documents.
- **Root cause(s):** `[OWNER]` — what leaves an MTO residual (linkage break / config / timing).
- **RR signals:** MTO card / subtype in the tx-variance taxonomy; WO-grouped grain (per DAC-16). `[OWNER — refine]`
- **Corrective-action ladder:** `[OWNER]` — the source fix(es), best-first.
- **Related DMAAIs:** `[OWNER]` — which AAIs (e.g., 3120 WIP …) MTO resolves through.

## Module: Intercompany Order processing  `[OWNER — author the content]`

- **Process:** `[OWNER]` — the intercompany order flow (SK/OK order types; F4211.SDSO11 / F4311.PDPS01 = 3).
- **Root cause(s):** `[OWNER]` — what leaves an intercompany residual.
- **RR signals:** Intercompany card / subtype; order-keyed grouping (per DAC-16 SK/OK passes). `[OWNER — refine]`
- **Corrective-action ladder:** `[OWNER]` — the source fix(es), best-first.
- **Related DMAAIs:** `[OWNER]` — which AAIs intercompany resolves through.

## Module: Cardex variance  — see [`transaction-variance-process.md`](transaction-variance-process.md)

⚠ **IN PROGRESS — owner still teaching; NOT scaffolded here yet.** Captured (partial) in the process
doc: roll-integrity module, F41021 on-hand vs. F4111 rolled baseline, three causes (extract-timing /
system glitch / cost-revaluation), the validate-JDE-first flow (authoritative steps sourced from
[`RRUniversity/inventory-cardex-variance.html`](../../RRUniversity/inventory-cardex-variance.html)),
and a settable-tolerance requirement. Fold into this schema once the owner says the module is complete.

## Later modules (room to grow)

Transfers · Direct Ship · Purchasing / Vouchers · Sales — add on the same 5-part schema as the owner
teaches each.
