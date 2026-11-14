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

## Phase 2 &mdash; Cut release (built 2026-11-14)

**Measured first, 2026-11-14.** The dev VALC's token is `gh auth token` on the dev box (no `RR_GITHUB_TOKEN`, no
`~/.rr-github-token`): an OAuth token with `repo` and `workflow`, admin on all six repos. QA's and Prod's machine-account
token (QAv8 task 12) is never asked, because the Development Queue exists only on the dev VALC. Each repo's release
trigger, read from `.github/workflows` on `main`:

| Line | Releases on | Cut release |
|---|---|---|
| Services | every merge touching its source (`auto-release.yml`) | none: "releases itself" |
| Database | every merge touching `RapidReconciler/**` (`bump-db-version.yml`) | none: "releases itself" |
| SSIS | tag `ssis-v*` | next patch proposed, editable |
| V8 UI | tag `ui-v*` | next patch proposed, editable |
| Agent installer | tag `installer-v*` (packages the newest broker release) | next patch proposed, editable |
| Broker | tag `v*`, refused unless it equals `broker/pom.xml` | the pom's version only, while no tag has it |

`ReleaseCutService` tags `main`'s tip with an annotated tag whose message names who cut it, refuses a line with nothing
waiting, a version not newer than the line's newest release, an existing tag, and a second cut while one is in flight
(45 minutes, or until the catalog has it). Endpoints: `GET /api/v1/admin/development/lane/cut-plan`,
`POST /api/v1/admin/development/lane/cut/{component}`; Developer and Administrator, dev box only.

**Not exercised against GitHub.** No tag was pushed while building it; the first real click is the first live test.
If the dev box ever moves to a machine-account token, that token needs Contents write on the four tagged repos.

## Phase 3 &mdash; QA and Prod (built 2026-11-14, not seen running)

Owner rulings 2026-11-14: the checklist **travels with the bundle**; QA makes the **manual checks only** (the automated
checks stay Dev's); **build now and hold** although no QA VALC exists (the QAv8 names do not resolve).

- **Dev's Publish** writes the active checklist into the release: `RR-Bundle-QA-Check: <text>`, or
  `RR-Bundle-QA-Check-Noted: <text>` for a check passed with a note. Dev had 6 active items on 2026-11-14.
- **QA** (`ReleaseQaService`, Releases page): Approve for QA (the existing approve route) &rarr; Roll out (the Support
  Center's Fleet upgrades band, unchanged) &rarr; Manual checks. On approval the checks the bundle carried (read from its
  `IMPORTED` body) become its `release_train_manual_checks` rows; each is recorded PASS/FAIL; **Record QA's result**
  appends `QA-Tested: PASS|FAIL <upn> <utc>` plus the per-check lines to the release, once. A failed GitHub write records
  nothing. V125 adds `release_trains.qa_tested_result/_by/_at` and the `QA_TESTED` event.
- **Prod**: Sync copies `QA-Tested` like an approval; `approve` and the band's waiting bundle need `PASS`.
- **Not done here:** the band keeps its own Approve (both paths call the same gated route); UI-211's deploy is its own
  row (built, uncommitted, in `_wt/ui-211-valc`, waiting on QAv8 task 9); retiring the Release Bundles page is the
  owner's call.
- **Cutover gate:** a bundle reaches Prod only with QA's recorded pass. Before the first V8 customer: phase 3 merged,
  then one bundle taken through QAv8 end to end.

## Known limits

- One test database, one JDE source (SQL Server). iSeries and Oracle customers get no coverage before QA.
- Publish, Discard and figure acknowledgement are the release-trains routes, Administrator-only, as before.
