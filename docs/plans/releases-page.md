# VLC-291 &mdash; the Releases page

Owner rulings, 2026-11-14 (session `[52206b]`):

- "Should testing be on its own page so it carries to qa and prod?" &rarr; yes.
- "What is the output for the development queue? I would think it should be a bundle to move to the testing page."
  &rarr; the Development Queue ends at a **drafted bundle**; the Releases page takes it from there.
- "I don't think we need manual tests in dev. we can save those for qa."
- The strip across the top is labelled by step and coloured **green** (nothing waits) or **amber** (something waits
  on someone).
- Step 3's per-line Deploy (VLC-280) is removed; Scratch starts from the last bundle, or from a failed/discarded
  draft since it (recorded); Cut release is added to step 3 once measured.

## Where each step lives

| Page | Steps |
|---|---|
| **Development Queue** (Dev only) | 1 Customer Queue &rarr; 2 Claude Queue &rarr; 3 Cut releases &rarr; 4 Draft bundle. Output: a draft. Tabs: Tasks, Recently Closed, Audit Export. |
| **Releases** (every VALC) | Dev: 1 Test on Scratch &rarr; 2 Publish &rarr; 3 QA approval. QA: Approve &rarr; deploy &rarr; test (automated + manual) &rarr; record. Prod: Approve (needs QA's pass) &rarr; roll out. Tab: Release History. |
| **Support Center, Fleet upgrades band** | Rollout status; QA/Prod approval and Resume/Cancel until phase 3 moves them. |
| **Client Onboarding** | Manage databases (VLC-272). |

## Phase 1 &mdash; Dev (built 2026-11-14)

- `/valc/releases` (`ReleasesController`, `releases.html`), `/api/v1/admin/releases/**`; Developer and Administrator.
  Sidebar entry after the Development Queue, on every VALC.
- Development Queue: steps 3&ndash;5 became 3 Cut releases and 4 Draft bundle; Release History moved to Releases;
  the Audit export stays (SOC record of issues and PRs).
- `DevelopmentLaneService`: `start` (what the test database runs per line against the last bundle and the draft;
  states `last` / `draft` / `other` / `unknown`), `testPlan` (the four automated checks with the newest run's
  results), the start rule in `test`, `release_trains.test_start` (V124) written to the GitHub release as
  `RR-Bundle-Test-Start`. Per-line Deploy, `FleetRolloutService.target` and `AgentRolloutService.installedVersion`
  removed.
- No manual checks on Dev: a dev rollout takes no copy of the checklist and drops an old one; Publish follows the
  automated checks and acknowledged figures. The checklist itself is kept for QA.

## Phase 2 &mdash; Cut release (measure first)

VALC writes bundle releases on GitHub; it is **not known** whether its token can tag the component repos
(Agent, DB, SSIS, UI) and start their release Actions. Measure the token's scopes on each repo. If it can, step 3
offers **Cut release** on each line with unreleased changes, proposing the next version (editable). If it cannot,
widening the token is a security decision for the owner and Daren; until then step 3 names what to cut.

## Phase 3 &mdash; QA and Prod (when the QA VALC is close)

- Releases on QA: Approve for QA (moves off the Support Center band), deploy to the QA databases, the same four
  automated checks, the **manual checklist** (the current list minus "note the UI commit": UI-211 records the
  deployed UI), result written to the bundle's GitHub release.
- Prod approval requires QA's recorded pass, not only QA approval.
- The V8 UI deploy (UI-211) lands here; then the Release Bundles page can retire.
- **Cutover gate:** until phase 3 lands, no manual test is recorded anywhere. Acceptable while no customer runs V8;
  it must land before the first V8 customer. Add it to the QAv8 master plan as a prerequisite.

## Known limits

- One test database, one JDE source (SQL Server). iSeries and Oracle customers get no coverage before QA.
- Publish, Discard and figure acknowledgement are the release-trains routes, Administrator-only, as before.
