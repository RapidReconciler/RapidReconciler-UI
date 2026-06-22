# Plan: V7 (legacy) databases in the VALC database grid

**Status:** **DEFERRED — decision recorded, do NOT build yet.** Triggers only
when VALC 2.0 genuinely dual-connects to both a customer's V7 and V8 stacks
during cutover. Until then the grid stays V8-only (see §1).

**Source:** Owner question (2026-06-22): *"Should we show V7 databases as
unregistered since VALC may be connecting to both in the future?"* Decision
below. Memory: `project_databases_manually_tracked` (the grid shows only
manually-tracked DBs today), `feedback_production_ready_default` (no
placeholder/theater UI), `user_role_exit_strategy` (labels must teach a junior
the right action), `project_valc_2_naming` (why this lives here, internal, and
NOT in the Coral-facing `rrv8-cutover-plan`).

---

## 1. Decision: NO — and not via the word "unregistered"

Do not surface V7 databases as **"unregistered."** Two reasons:

1. **"Unregistered" prompts the wrong action.** In VALC, *unregistered* means
   "onboard this into V8" — a to-do that ends in **Create / Register Database**.
   A V7 database is the opposite: it lives on the legacy stack on purpose, and
   the only correct action is eventually to **migrate** it — never to "register"
   it into V8. A new hire seeing a V7 DB tagged "unregistered" will try to
   register it. Same failure mode we designed out of the agent-log triage:
   never show a junior something that teaches the wrong reflex.

2. **It is speculative today.** VALC does not dual-connect to V7 now. A V7 row
   would be a placeholder for a capability that doesn't exist, and VALC cannot
   honestly *enumerate* V7 databases without a real connection to them — the
   list would be fabricated or empty. That violates "production-ready by
   default; no theater; delete placeholder UI rather than stub it."

So: keep today's grid showing only the databases VALC actually manages.

---

## 2. Design for WHEN dual-connect is real

When VALC genuinely connects to both stacks during a cutover, surface V7
databases — but as a first-class **legacy / migration** state, not as a config
gap:

- **Status:** a distinct pill, e.g. **`V7 · legacy — pending cutover`**
  (read-only). Visually separate from the V8 lifecycle pills so it never reads
  as "you forgot to register this."
- **Grouping:** ideally their own section / divider in the grid so the block
  reads as a *migration worklist*, not a list of errors.
- **Source of truth:** populate **only** from real discovery (the V7 broker /
  config, or the agent actually reporting them). No synthetic rows — if VALC
  can't see the V7 side, show nothing.
- **Actions:** no **Register** path on a V7 row. The forward action is
  *migrate* (when that flow exists); until then the row is informational.
- Keep the V8 register/onboard path entirely separate so the two never blur.

---

## 3. Trigger to revisit

Build §2 only once VALC 2.0 can actually reach a customer's V7 stack (the
dual-connect cutover scenario). At that point this stops being speculative and
the legacy/migration view becomes real signal. A one-line cross-reference can
be added to `rrv8-cutover-plan.md` then — but the UI specifics stay here
(internal), out of the Coral-facing plan.
