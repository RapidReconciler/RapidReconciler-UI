# Manage Client — Guided Setup Wizard — plan

**Status:** Spec / not started. Captures the guided onboarding wizard
decided across session 2026-06-01, building on the practice sandbox
([practice-client-and-import-testing.md](practice-client-and-import-testing.md)).

## Goal

Turn the Manage Client modal into a **guided, one-page-at-a-time setup
wizard** so a new hire is walked through a customer install in the real
order, instead of free-clicking tabs and guessing the next step. The
Clients-grid card's next-step action drops you into the wizard; each page
has a **Next** button; you advance one page at a time.

## Page sequence

`Client Details → Topology → Install Prep → Databases`

Each page gets a **Next** button (in the modal footer slot for that tab).
Next advances to the following page; the final page's button closes the
wizard.

## Per-page gating

- **Client Details — Next disabled until mandatory fields are filled:**
  - **Name** (already required at Create)
  - **Primary Contact** (already required at Create)
  - **UI Version** — an explicit V7/V8 choice (defaults V7, but the pick
    determines which SPA the customer gets)
  - **Domain URL** — see below; currently a *hidden* input, must become a
    visible, editable, required field on Client Details.
  - **Save advances `setup_step` past `NEW`** (the earlier decision):
    saving/Next on Client Details is the "I've reviewed the record"
    signal that flips the card ladder forward.

- **Topology / Install Prep / Databases:** Next requirements TBD per page
  as we build them (e.g. Topology Next requires a topology + the App
  Server row; Install Prep Next requires the bundle generated; etc.).

## Domain URL + the Cloudflare connectivity test

- **Domain URL is GSI-typed.** It cross-references the customer's **A
  record at our ISP (Cloudflare)**.
- **Connectivity test:** resolve the Domain URL and confirm it returns
  the **App Server's internal IP**. That validates the A record points
  where it should.
- **Dependency:** the test needs the App Server's internal IP, which
  comes from the **installation-prep email** (its `SERVER NAMES &
  INTERNAL IPs → Application Server (internal IP: …)` line — already in
  the format). So the import email must carry the App Server internal IP
  for this check to run. (It does today.)
- This check belongs on the Install Prep page's progress list (future
  slice); Client Details just captures the Domain URL.

## Navigation model — context-dependent

- **Practice client → STRICT:** later pages stay locked until reached via
  Next, in order. A true one-way wizard that enforces the learning path.
- **Live clients → SOFT:** Next guides forward, but any tab stays
  clickable (matches today's downstream gating, which only locks
  Databases/Companies/Users until an App Server row exists). Experienced
  support can jump around.
- Discriminator: the client's `is_practice` flag (already on the DTO).

## Card entry

The Clients-grid card's next-step for a freshly-created client should
**begin the wizard** rather than jump to "Send installation prep":

- `setup_step = NEW` (just created) → "Finish setting up the client —
  start with Client Details" → opens the modal at Client Details (step 1).
- After Client Details Save (setup_step advances) → the existing
  ladder continues ("Send installation prep", etc.).
- Requires `setupStep` on `AgentStatusDto` + set in `snapshot()` so
  `populateNextStep` ([DashboardController.java](../../RapidReconciler-Valc/src/main/java/coral/rapidreconciler/valc/dashboard/DashboardController.java))
  can branch on it.

## Build order (incremental slices)

1. **Domain URL field** — make it a visible, editable, required input on
   Client Details (it's a hidden input today).
2. **Client Details Next** — footer button next to Save; enabled when
   Name + Primary Contact + UI Version + Domain URL are filled; on click,
   saves, advances `setup_step`, and moves to Topology.
3. **Card entry** — `setup_step`-aware next-step: NEW → "start setup"
   (opens Client Details); add `setupStep` to the DTO + snapshot.
4. **Strict-vs-soft nav** — lock later tabs for the practice client;
   leave soft for live.
5. **Next on Topology / Install Prep / Databases** — page by page.
6. **Domain → App-Server-internal-IP connectivity test** on Install Prep.

## Open / deferred

- Exact mandatory-field set for Topology / Install Prep / Databases Next.
- How the Cloudflare DNS resolution check runs (agent-side vs VALC-side).
- Whether "Next" on the last page closes the modal or shows a summary.
