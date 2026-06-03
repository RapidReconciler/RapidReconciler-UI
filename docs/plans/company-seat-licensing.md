# Plan: Company-seat licensing + module-aware period fields

Status: **planned** (model confirmed with owner 2026-06-03; not started). Corrects how
licensing/scope is wired so it matches the real commercial + reconciliation model.

## Why
The reconciliation unit in RR is the **account** (`BU.OBJ.SUB`), derived **per module**
by DB stored procedures (DMAAIs → an account-summary table per module) — not the
company. VALC must NOT model accounts; they're a product/DB concern and already correct.
Two things in the current VALC model are wrong:

1. **Licensing has no seat count.** v359 had **"Maximum Companies Allowed"**; VALC 2.0
   dropped it (`using-valc.html` records this) and kept only a licensed-companies *list*
   with no cap. But customers buy a **negotiated number of company licenses** (or an
   **unlimited** license). The count is the commercial model; the list just fills seats.
2. **Period/load fields read as blanket company settings.** `Start Date` and `Model DT`
   on the Licensing tab imply they govern every module. They don't (see below), and
   **PO Receipts has no period at all** — it's a current snapshot of open RNV (DMAAI
   4320; F43121 keeps no history, so no as-of is even possible).

## Confirmed model (owner, 2026-06-03)
- **Seat count is per CLIENT** (not per database). Negotiated with sales. May be
  **unlimited**.
- **Accounts are derived by per-module sprocs** — VALC models companies + seat count +
  load horizon, never accounts.
- **Start Date** = initial-load horizon: first day of a fiscal period telling RR how far
  back to pull source data on the initial load (RR doesn't load whole JDE tables).
  Period-based modules (Inventory / In-Transit / Transfers).
- **Model DT** = **inventory-only**: the document type the sprocs use to limit accounts
  to inventory (not expense).
- **Per-company user access is enough** (no BU/branch-level scoping). Unchanged.

## Scope of the fix
### A. Restore the company-seat license (the real gap)
- **Schema:** `clients.max_companies INT NULL` — **NULL = unlimited**.
- **Enforcement:** licensing a company (adding to `client_licensed_companies`) is blocked
  once the client is at its cap; unlimited never blocks. Count is **per client**.
  - *Detail to settle at build:* count **distinct company numbers across the client's
    databases** (a company licensed in both Prod and Test is one seat), and decide
    whether non-Prod (Test/Dev) companies consume seats at all. Lean: count distinct
    companies client-wide; confirm with owner.
- **Add Client / Client Details:** a **"Company licenses"** field — a number, or an
  **Unlimited** toggle (restores v359's "Maximum Companies Allowed"). Sourced from the
  signed contract.
- **Licensing tab:** header shows **"X of N licenses used"** (or **"X of Unlimited"**) —
  makes the *Licensing* relabel meaningful. Block + explain when at cap.

### B. Reframe the period/load fields (labeling, not re-architecting)
- **Start Date** → label as the **initial-load horizon** (period-based data).
- **Model DT** → annotate **inventory-only** (sproc inventory doc-type filter).
- **PO Receipts** → make clear it's a **snapshot of open RNV** with **no period / no
  load horizon** — these fields don't govern it.

### C. Explicitly unchanged
- **Accounts** stay derived by the per-module sprocs. VALC never models them.
- **User access** stays per-company (`ALL` / `LIST`).
- **Module entitlement** stays as-is (client-level `clients.tab_*`) — licensing is a
  *seat count*, not per-module.

## First implementation step
**Mine v359** (legacy VALC SPA + Services jar) for how "Maximum Companies Allowed" was
stored, counted, and enforced (block vs warn; per-client; non-Prod handling) before
wiring — per the check-v359-first rule. Then: V36 migration (`clients.max_companies`) →
enforcement in the licensed-companies POST → Add Client / Client Details field →
Licensing-tab usage display → period-field relabeling.

## Out of scope / notes
- Not touching the account-summary sprocs or any per-module account derivation.
- Relates to the *Licensing* relabel already done (sidebar + Manage Client tab).
