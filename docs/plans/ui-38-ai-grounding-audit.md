# UI-38 — AI-assistant grounding audit

**Date:** 2026-07-16. **Scope:** every AI surface in `RRV8/`.
**Method:** read-only inventory of each `/api/v1/ai/explain` call site — which
grounding catalog it uses, whether it passes the live on-screen figures, whether
the per-tier transform applies — then fix the wiring gaps. Fixes verified live at
`:8765` (clean load, buttons present, zero console errors).

## Verdict

The two failure modes that triggered this audit are both closed and did not
regress:

- **Wrong grounding.** The Home Ask box splits correctly — cardex questions hit
  `CARDEX_GROUNDING` + live cardex facts, transaction questions hit
  `ANALYST_GROUNDING`. The earlier bug (a cardex question answered from the
  transaction playbook) is gone.
- **Fact-blind.** Every analytical surface passes the live figures into the
  prompt. No "clean, nothing to act on" path fires while an unpassed variance
  sits on screen.

The real live exposure was the **privacy tier**. "Scrubbed" exists to mask entity
identity while keeping the reconciliation substance — it is the tier a demo
presenter flips to on purpose. Two surfaces never got a scrubbed branch, so they
sent the real company number at exactly the tier meant to hide it.

## Grounding catalogs (client, `config.js`)

| Catalog | Scope |
|---|---|
| `ACCT_GROUNDING` | Accountant reconciliation policy |
| `ANALYST_GROUNDING` | Transaction variance (F4111 vs F0911, per document) |
| `CARDEX_GROUNDING` | Cardex variance (F4111 vs F41021 on-hand, account-blind) |

Two more were added in the session #15 consolidation:

| Catalog | Scope |
|---|---|
| `ROLLFORWARD_GROUNDING` | Account roll-forward corrective levers (GL-side before variance) |
| `ASOF_GROUNDING` | Perpetual-inventory + residual-noise definitions |

DMAAI grounding lives server-side (`AiService.DMAAI_GROUNDING`) and — confirmed
this pass — `AiService.complete()` prepends it to the system prompt of **every**
`/api/v1/ai/explain` call. So every client surface already reasons from the
authoritative model-DMAAI (4152) rules without a client mirror. Adding one would
be a second copy to drift, so we deliberately did not.

## Fixed this pass

1. **`accounting-model-review.html` — `assessExclusions` + `draftNote`.** The tier
   check was `var basic = _aiTier() === 'grounded'`, so *scrubbed* fell into the
   *full* branch and sent `Company <n>` alongside the GL codes and amounts. Added
   a scrubbed branch that masks the company ("the entity under review") while
   keeping the reconciliation facts — the same convention `renderAiBriefing`
   already uses (mask the identity, keep the figures).
2. **`home.html` — `askAnalyst`.** It gated only on `off`; `_analystTxFacts` and
   `_analystCardexFacts` sent `Co <n>` at every non-off tier. Threaded a `scrub`
   flag into both builders; the company now renders "Entity A" at scrubbed,
   currency and amounts unchanged.

## Consolidated (session #15, attended go-ahead)

The six surfaces that hand-rolled reconciliation policy inline now pull the shared
catalog, so a future SME edit propagates instead of leaving stale copies. Each was
verified live at `:8765` (page loads clean, catalogs present, an AI round-trip
returns 200 with both groundings in the chain).

- `home.html` `renderAiBriefing`, `fetchJeAiSummary`, `_auditCoSummary` — now
  prepend `ACCT_GROUNDING`, matching the convention already used by the Home Ask
  boxes (`askAcct` / worklist cause analysis). The three prompts keep their own
  task and format rules; the catalog supplies the shared policy.
- `inventory-account-rollforward.html` `triggerTodoAi` — its inline corrective-lever
  system prompt is now `ROLLFORWARD_GROUNDING` (new catalog), with the old inline
  string kept as a fallback if `config.js` fails to load.
- `inventory-asof.html` `asofAsk` — the perpetual and residual-noise definitions
  moved to `ASOF_GROUNDING` (new catalog); the calc and free-text prompts prepend
  it and drop the duplicated definition text. Page-feature help (the Company
  selector, Excel sheets) stays inline — it's page-specific, not reconciliation
  policy.
- `accounting-model-review.html` `assessExclusions`/`draftNote` — no client mirror
  added. The DMAAI 4152 policy is already injected server-side on every call (see
  above); the inline text is task framing, not a policy definition. Added a code
  comment recording that so the next reader doesn't "fix" it by duplicating the
  server block.

## Not a problem

No fact-blind surface. Definitional-only prompts (`asofAsk` kind `calc`) send no
facts by design, which is correct. `admin-claude-assistant.html` `testConnection`
is a hard-coded connectivity ping, not analytical.
