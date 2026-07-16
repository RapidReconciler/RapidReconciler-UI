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

DMAAI grounding lives server-side (`AiService.DMAAI_GROUNDING`); there is no
client mirror. Any client surface reasoning about the model DMAAI (4152) either
hand-rolls its own definition or relies on the server injecting one.

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

## Deferred — consolidation backlog (correct today, drift-prone)

These surfaces hand-roll their reconciliation policy inline instead of pulling the
shared catalog. **None is wrong today.** The risk is silent drift the next time
the SME edits a catalog and these copies don't get the change — the same shape as
the original Home bug. Deferred deliberately: rerouting them changes live AI
narration and wants SME eyes on the output, and a wrong AI answer to an AI-first
buyer is the fatal case. Do these attended.

- `accounting-model-review.html` `assessExclusions`/`draftNote` — inline DMAAI 4152
  exclusion policy while the real `DMAAI_GROUNDING` is server-side. Add a client
  mirror, or confirm + document that the server injects it on every call.
- `inventory-account-rollforward.html` `triggerTodoAi` (~:915) — inline
  corrective-lever policy, no catalog. Candidate: a `ROLLFORWARD_GROUNDING` block.
- `inventory-asof.html` `asofAsk` (~:2860) — inline perpetual/residual definitions,
  no catalog.
- `home.html` `renderAiBriefing` (~:5846), `fetchJeAiSummary` (~:9458),
  `_auditCoSummary` (~:9803) — accountant-facing prose that skips `ACCT_GROUNDING`.
  Inline rules agree with the catalog today.

## Not a problem

No fact-blind surface. Definitional-only prompts (`asofAsk` kind `calc`) send no
facts by design, which is correct. `admin-claude-assistant.html` `testConnection`
is a hard-coded connectivity ping, not analytical.
