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

## VLC-303 &mdash; one Dev lane, one bundle for QA (2026-11-19)

Owner rulings, 2026-11-19 (session `[5ea625]`), after step 3 read green while draft `bundle-20261117-151118` held
installer 8.0.24 / Services 8.0.55 / SSIS 8.0.1 / DB beta.140 / UI 8.0.1 and the newest releases were 8.0.26 / 8.0.56 /
8.0.4 / beta.141 / 8.0.2:

- "We should only have 1 bundle for QA to approve at a time. That bundle should contain all the changes from the last
  approved bundle." A bundle is a full set of versions, so any bundle drafted from the newest releases is cumulative.
- "Step 3 Band should show the repos and merged counts to be included in the next bundle. Opening the band only shows
  the items that are going in the bundle. ... move the release version pills to the draft band. Once the bundle is
  drafted the items in step 3 clear."
- Accepted with it: step 3 keeps Cut release, and marks a change no release carries yet; step 3 counts from the newest
  LIVE bundle (the open draft unless its test failed, else the last published); a draft behind the newest releases is
  replaced (**Redraft**: draft first, then discard) while its test has not started or failed, and its test is refused
  until then; once the test starts it is frozen and later releases wait.
- "Yes, that split": Dev's Test on Scratch, Publish and QA approval move into the Development Queue as steps 5-7 (QA
  verdict), with Release History as a tab; the Releases page is QA's and Prod's only, not on Dev's sidebar, and
  `/valc/releases` on Dev redirects to step 5. Retiring the page outright was rejected: the Development Queue is Dev-only
  (`DevelopmentGate`), so QA and Prod would lose their approval steps.

## VLC-308 / VLC-307 &mdash; step 3 counts from releases; Cut all; Draft in the head; VALC's line (2026-11-20)

Owner, 2026-11-20 (session `[de1edd]`), on the Development Queue with no bundle on the dev VALC, where step 3 read
"no bundle to count from" and offered no cut:

- "Step 3 seems to be dependent on an existing bundle to measure differences. Why can't it use each current release
  and measure from there?" &rarr; **step 3 counts each line from its own newest release** (the catalog's;
  `ReleaseHistoryService.pending`). This **supersedes** VLC-303's "step 3 counts from the newest LIVE bundle" and its
  "once the bundle is drafted the items in step 3 clear": a change now leaves step 3 when its line is cut and the
  release reaches the catalog. What a draft adds for QA stays step 4's list (`draft.lines`). The V8 UI filter reads the
  newest UI release's zip instead of a bundle's.
- "There should also be a button on the band header that cuts all the individual releases" &rarr; **Cut all** in
  step 3's head (`ReleaseCutService.batch` / `cutAll`, `POST /lane/cut-all`). Each line goes through `cut()` with its
  checks; one that fails is reported and the rest still go. Held back, and said beside the button: Services and
  Database (auto), a broker whose pom version is already tagged, the installer while the broker is cut in the same
  click (it packages the newest broker RELEASE), and VALC.
- "Step 4 Draft button should be moved to the band header." &rarr; Draft / Redraft, their blocker and their answer are
  in step 4's head.
- Found while measuring: Draft took the catalog's newest release without looking at cuts in flight, so Cut all followed
  by Draft drafted the OLD releases. Draft and Redraft now refuse while a bundle line's cut is in flight
  (`ReleaseCutService.inFlight`).
- Found while measuring: an installer with no changes of its own could not be cut, so a released broker no installer
  packages never reached a bundle. The installer line now says so and can be cut (`carriesBroker`).
- VLC-307 (owner, same day: "how will I know the valc docker container needs an update?"): **VALC's own line**, last
  and set apart, never in a bundle or in Cut all. From VALC's newest `v8.0.x` tag (git matching-refs, no catalog), only
  commits touching `src/main`, `pom.xml`, `Dockerfile`, `libs`. Its cut tags `v8.0.<patch>` (`release.yml` builds the
  jar, `image.yml` the image and `docker-compose.qav8.yml`); in flight until that tag has a GitHub release. The line
  shows the release's image digest as `deploy-qav8.sh <digest>` for the QA host's administrator. VALC never deploys VALC.
  Not built yet: which VALC the QA host runs (phase 2 of VLC-307: the QA VALC stamps its version on the approval).

## Where each step lives

| Page | Steps |
|---|---|
| **Development Queue** (Dev only) | 1 Customer Queue &rarr; 2 Claude Queue &rarr; 3 Cut releases &rarr; 4 Draft bundle &rarr; 5 Test on Scratch &rarr; 6 Publish &rarr; 7 QA verdict. Output: a bundle published for QA. Tabs: Tasks, Recently Closed, Release History, Audit Export. (VLC-303) |
| **Releases** (QA and Prod) | QA: Approve &rarr; deploy &rarr; test (manual) &rarr; record. Prod: Approve (needs QA's pass) &rarr; roll out. Tab: Release History. Dev's three steps were here from 2026-11-14 to 2026-11-19. |
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
