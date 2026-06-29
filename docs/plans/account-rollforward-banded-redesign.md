# Account Roll Forward — home-style banded redesign

**Owner persona:** Andy the Analyst. His job is keeping the source of truth accurate.
He does **not** care about CardexVar/OOB numbers or per-row break classification. He
wants: *is it accurate, and if not, which of my 4 levers do I pull?* The four levers
are **Reload GL**, **Reload Cardex**, **Re-roll companies**, **R099102 account repost**.

Goal: replace the busy analysis/classifier screen with a **home-style 4-band workflow**.
Green/amber/red tints; reuse the Home band/drawer/context components.

## Decisions locked (2026-06-29)
- 4 bands: **To Do → Context → Corrective Actions → Audit Report**.
- Corrective Actions expands to **4 cards, all live** (no side-muting — GL-fix-first is a
  recommendation, but Andy still needs variance access; TR proved both can be live).
- Reload GL / Reload Cardex cards → **existing admin pages** (`admin-reload-gl.html`,
  `admin-reload-cardex.html`) — port the entry point, retire from admin nav. Nothing new.
- Re-roll card → **new page** (the only new surface), backed by the already-built
  `/inventory/recalc` (re-roll + `usp6_009` rebuild, async, activity-lock-guarded).
- R099102 card → **inline email + attest** (can't launch a JDE batch from here).
- Keep the grid. Excel export = **all rows in the company scope, audit-quality**.
- GL/Variance treated as mutually exclusive in guidance (GL precedence), but all cards stay live.

## Already built this session (feeds this — no rework)
- DB: `RActivityLock` + `usp8_activity_begin/end/status`; B→C wiring; rinvasof-activity
  scoping fix in `usp6_maint_roll_inventory_from_baseline_comp`;
  `usp8_recalc_inventory_rollforward` (+ `usp8_rebuild_gl_rollforward`, fate TBD).
- Agent: `RecalcService` + `RecalcController` — `/inventory/recalc`, `/inventory/rebuild-gl`,
  `/inventory/recalc-status` (async; DB-authoritative progress).
- VALC: deploy busy-gate (`busyReason` + `DB_DEPLOY` lease in `publishDacpac`).
- admin-companies per-company Re-roll button/modal retired.

## Steps (one at a time)
- [ ] **1. Re-roll page** — new page; runs `/inventory/recalc` for the selected companies,
      polled progress, lock-guarded. Self-contained.
- [ ] **2. Band shell + teardown** — restructure `inventory-account-rollforward.html` into
      the 4-band Home pattern; strip the KPI strip, the per-row classifier, and the inline
      action-bar added earlier (superseded).
- [ ] **3. Band 1 — To Do** — count + drawer summarizing the issues (side + accounts/periods).
- [ ] **4. Band 2 — Context** — companies multi/All, JWT-scoped; flows to cards + report.
- [ ] **5. Band 3 — Corrective Actions** — 4 live cards (Reload GL/Cardex → existing pages;
      Re-roll → Step-1 page; R099102 → inline email + attest via the activity-log/ack path).
- [ ] **6. Band 4 — Audit Report** — keep grid; Excel = all rows in scope, audit-quality.
- [ ] **7. Retire admin entry points** — remove Reload GL / Reload Cardex links from admin
      sidebar/home (files stay; entry moves to the band).
- [ ] **8. Cutover** — DB beta.29 tag → agent redeploy → VALC rebuild → UI push → live-verify.

## Open micro-decisions (settle in-flight, non-blocking)
- `usp8_rebuild_gl_rollforward`: wire into the Reload GL page for immediate results, or drop.
- R099102 attestation storage: server-logged via the activity-log/ack path (audit trail).
