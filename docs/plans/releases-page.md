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
  Database (auto), a broker whose pom version is already tagged, and the installer while the broker is cut in the
  same click (it packages the newest broker RELEASE). Later the same day, on the rebuilt page (no Cut all showed,
  because VALC was its only waiting line and was left out): "Always show. ... Also the broker text should be in the
  fold. I would include valc." So Cut all is always in the head (greyed out with nothing to cut), VALC is in it,
  last, and what it holds back is listed inside the band under "Cut all leaves out". The blocked broker's note now
  says which fix it needs: a pom bump when the newest installer already packages that version (2.10.0 in 8.0.27,
  with Broker #24 after it: pom bumped to 2.10.1), an installer cut when none does.
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
  (First built outside Cut all; included in it the same day, above.)
  Not built yet: which VALC the QA host runs (phase 2 of VLC-307: the QA VALC stamps its version on the approval).

## VLC-311 &mdash; VALC gets its own band; Cut all is bundle lines only; the installer's cut on the broker's line (2026-11-21)

Owner, during the training walk (session `[9f02cb]`), right after cutting broker v2.10.1 from its own line:

- The page then offered no next step. The broker line counts from the broker the newest installer packages, so it
  still read "2 unreleased"; the installer line had no change of its own, so it sat under "No change" with no button;
  and the only way to cut it was **Cut all (2)**, which also held VALC. VALC's first hand run of `image.yml` had just
  failed at the Azure sign-in (`AADSTS70025`), so a VALC cut would have spent `v8.0.1` on a release with no image.
  &rarr; The installer's **Cut release** now sits on the broker's line when the installer carries a released broker.
- "Do we need to separate out a valc release to its own band? ... I see why now." Then "Yes, build both."
  &rarr; This **supersedes** 2026-11-20's "I would include valc" (above). VALC leaves step 3 and Cut all
  (`ReleaseCutService.batch` skips it) for its own band, **VALC release**, below step 7, dashed and lettered V
  (`#js-dv-step-8`), with its own strip card. Reasons: a different pipeline (cut, image, compose file to the QA host,
  not draft/test/publish/QA verdict), a different gate (Azure, not only GitHub), and its count kept step 3 amber
  when every bundle line was clean.
- **The VALC cut waits for a green image run** (`ReleaseCutService.valcImageGate`): the newest finished hand run of
  `image.yml` on `main` must have passed (`GitHubReleaseService.newestCompletedRun`). Never run, red, or unreadable all
  block, on the plan (mode `blocked`, the reason and the run's link) and in `cut()` itself. Runs that `release.yml`
  starts through `workflow_call` are listed under `release.yml`, not `image.yml`, so the gate reads hand runs; a
  release's own image result shows on the band afterwards (digest, or "no image").
- A run-status indicator for a cut on its way: built the next day under VLC-312, below.

## VLC-312 &mdash; cards carry the status and the running indicator; the installer counts what it is built from (2026-11-21)

Owner, the same walk, right after Cut all (2) tagged `installer-v8.0.28` and `ui-v8.0.3`: "There should be an indicator
that the releases are running." (the second time: "If something is running should we have a progress indicator?" came
on the broker cut). Then, mid-build: "Make the cards 2 rows of 4. The cards should have any status notes and indicators
that things are running. The bands have pills and buttons. Status text can be removed."

- **The strip is eight cards, four to a row** (two on a narrow window), the seven steps then VALC release.
- **Cards carry every status note.** Each band's head is its title, pills and buttons; the status line beside the
  title is gone from all eight bands (`js-dv-qu-meta`, `-wl-`, `-nb-`, `-dt-`, `-m5`/`-m6`/`-m7`, `-vr-`). What it said
  moved to the card, or into the band's body when it was a rule or a reason: the customer-clock rule opens band 1, the
  test database opens band 5, and why Draft is off is in band 4's body (the card says "waits for 2 cuts to land").
- **Running.** A cut on its way carries its release run (`ReleaseCutService.runOf`, from
  `GitHubReleaseService.newestRunForRef`: the Actions API lists a tag push's run under the tag): starting, queued,
  running, released (green, catalog not synced yet), failed, or unknown. Step 3's and VALC release's cards name each
  cut with that state and show *running* with a spinner while one is starting, queued or running; step 5's does while
  a test runs. While anything is on its way the page reads the cut plan again every 20 s, and re-reads step 3 and the
  draft when a cut lands. The band's line links the run itself, and its green "Tagged ..." answer clears once the cut
  is no longer on its way.
- **The installer line counts what the installer is built from** (`ReleaseHistoryService.INSTALLER_SHIPPED`:
  `setup/installer`, `.github/workflows/release-installer.yml`, read out of the workflow and `build-installer.ps1`). It
  shares the Agent repo with Services; `release-installer.yml` downloads the Services jar "only so the build's JRE guard
  can prove the bundled JRE runs it. Not packaged." Measured: installers 8.0.21 to 8.0.27 changed none of those paths.
- **One installer button.** With the installer's own line listed, the broker line points to it instead of repeating it.
- **Workflow and Details** (owner, same day: "divide the tab contents into 2 distinct sections: Workflow: Which always
  shows every card and it's status. Details: All of the bands. I an thinking about only displaying the amber bands",
  then "Yes, build it" on these rules). Workflow is the eight cards. Details shows a band when its card is amber, when
  its card was clicked this visit, while a search filters it (1-3 and V), when it was already shown amber this visit
  (none vanishes on a re-read), or with **Show all bands** (per viewer, `valc.dev.showAllBands`). Green and plain
  (white) bands are otherwise left out; until any card is read every band shows. Amber means "waits on someone", so
  VALC release (waiting on infrastructure) and QA verdict (waiting on QA) still show; splitting amber into "you" and
  "others" is left for later, if that turns out to be noise.

## Where each step lives

| Page | Steps |
|---|---|
| **Development Queue** (Dev only) | 1 Customer Queue &rarr; 2 Claude Queue &rarr; 3 Cut releases &rarr; 4 Draft bundle &rarr; 5 Test on Scratch &rarr; 6 Publish &rarr; 7 QA verdict. Output: a bundle published for QA. Then, apart: V VALC release (VLC-311), whose output is a VALC image for the QA host. Tabs: Tasks, Recently Closed, Release History, Audit Export. (VLC-303) |
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
