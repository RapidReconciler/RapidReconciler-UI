# SHARED CORE — cross-role reconciliation invariants (single-source)

**Status:** PROMOTED source of truth for grounding rules that are NOT
role-specific. Authored ONCE here; `Tools/build-ai-grounding.py` composes each
tagged invariant into every role catalog that inherits it, ahead of that
catalog's own bullets. This is the layer that stops a cross-role truth from being
re-typed into the analyst brain, the accountant brain, and the admin brain and
then drifting apart — the exact failure mode UI-52 exists to kill. Mirrors the
`product-chrome-core.css` shared-core / per-surface split.

**Why compose-in, not a 7th constant:** the six consuming surfaces read fixed
`window.RRV8.*_GROUNDING` names. Adding a `CORE_GROUNDING` constant would force
every consumer to read and prepend it — a code change to six surfaces and a new
way to forget one. Instead the generator inlines the relevant core invariants
into each generated catalog, so the consumer interface is untouched and the
single-source property still holds (edit here, regenerate, all inheritors update).

**Format:** each invariant is one `Applies:` line naming the roles and/or topics
that inherit it, immediately followed by a fenced `grounding` block. Tokens are
explicit to avoid the name collision between the transaction topic (`ANALYST`)
and the analyst role (which spans all four analyst topics):

- `role:analyst` — every analyst catalog (transaction, cardex, rollforward, asof)
- `role:accountant` — the accountant catalog (acct)
- `topic:analyst` / `topic:cardex` / `topic:rollforward` / `topic:asof` / `topic:acct` — one catalog only
- `all` — every reconciliation catalog

Comma-separated; the nearest `Applies:` line above a fence governs it. Keep each
line inside a fence a single grounding bullet.

---

## INV-1 — Variance is always a difference (the variance-taxonomy rule)

The correction of 2026-07-20 (memory `reference_variance_is_always_a_difference`).
Lives here so the analyst brain, the accountant brain, and every per-topic
catalog reason from ONE statement of it instead of three drifting paraphrases.

Applies: role:analyst, role:accountant

```grounding
- VARIANCE IS ALWAYS A DIFFERENCE: whenever two figures that should equal each other do not, that gap IS a variance — full stop. "Expected" / "explained" describes the CAUSE of a variance you can account for; it NEVER downgrades the gap to "not a variance" (two scales that disagree still disagree — knowing why does not make them equal). Disposition every variance as EXPLAINED / no-action or UNEXPLAINED / investigate; never as "not a variance," "not a real variance," or "not a variance to chase."
```

## INV-2 — Transactions sign convention

Store/display the natural sign so the reconciliation ties to the KPI the analyst
and accountant read on screen. Memory `reference_transactions_sign_convention`.

Applies: topic:analyst, role:accountant

```grounding
- SIGN CONVENTION: reason in the NATURAL sign shown on screen — the stored and displayed figures already carry it, and the reconciliation ties to the on-screen KPI in that sign. Do not silently flip signs to "make it balance"; a sign flip belongs only in an Excel/PDF out-of-balance column, never in the reasoning.
```

## INV-3 — DMAAI model rules are injected server-side

The authoritative model-DMAAI (4152) policy is prepended by
`AiService.complete()` to every `/api/v1/ai/explain` call. Memory
`reference_dmaai_grounding_server_injected`. Stated here so no role catalog adds a
client-side mirror that would become a second copy to drift.

Applies: topic:analyst, role:accountant

```grounding
- DMAAI ROUTING is already grounded server-side on every AI call (the model-DMAAI 4152 rules). Reason from account derivation and routing as given; do not restate or re-derive the DMAAI model in this catalog — that copy lives once, on the server.
```

## INV-4 — RR is a tool, JDE is the system of record

Memories `project_rr_tool_not_system_of_record`, `feedback_rr_utility_not_enforcement`.

Applies: topic:analyst, role:accountant

```grounding
- RR IS A UTILITY, NOT THE BOOK OF RECORD: JDE is the system of record. RR surfaces the gap, explains it, and drives the source fix or the correcting entry — it does not post to JDE, hold the ledger, gate a close, or enforce attestation. Fixes land at the source (JDE / the operation) or as a journal entry the accountant posts in JDE.
```

## INV-5 — "Current" means the most recent two loaded periods

Owner ruling 2026-08-20, raised to a KB standard definition on his instruction:
**"current" is the most recent TWO periods in the loaded window, not one.** It was
previously written down only as an AI-reasoning window (memory
`project_current_two_periods_principle`); it is now the platform's definition of the
word, so every surface, guide, and generated catalog uses the same one.

Two periods, not one, because a single period cannot show recurrence. An analyst
looking at one month sees an amount; looking at the two most recent sees whether the
amount is a one-off or a pattern, which is what decides between a correcting entry and
a source fix. Note the periods are whatever the DB actually loaded, in its own fiscal
calendar — they are not necessarily month-ends and not necessarily adjacent on a
calendar (Demo1's two most recent are `2025-08-28` and `2025-07-31`).

Applies: all

```grounding
- "CURRENT" MEANS THE MOST RECENT TWO LOADED PERIODS, not one. Read and compare both when judging materiality or recurrence: one period gives an amount, two give a trend, and the trend is what separates a one-off correcting entry from a source fix worth preventing. Use the periods the database actually loaded (they are fiscal, not necessarily month-ends), and say which two you used.
```
