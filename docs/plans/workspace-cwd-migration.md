# Plan: Move Claude Code's working directory from `RapidReconciler-AI` up to `C:/source/repos/`

**Status:** **EXECUTED 2026-05-27** in Prompt #1 of the 12-prompt
sequence. Memory dir copied, workspace `CLAUDE.md` written,
per-repo `CLAUDE.md` files created for Agent / Valc / DB / SSIS,
`.claude/settings.local.json` copied up, `RRV8/HANDOFF.md`
resume prompt updated to point at the new CWD. The next session
opens at `C:/source/repos/`.

The smoke-test items below (step 7) get exercised in that next
session.

**Source of this plan:** session conversation on 2026-05-25 about
whether the platform-wide cross-repo work pattern justifies
broadening the CWD. Five repos under `C:/source/repos/` (AI,
Agent, DB, SSIS, Valc) are all RR-platform, nothing unrelated;
every recent session touched 2-3 of them.

---

## Why

Every chunk of work in this codebase now spans multiple repos:
auth touches UI + Agent + Valc; the cardex N+1 fix touched Agent
+ UI; the cutover plan touched UI + Valc; the v359 mining lives
in Agent docs but informs Valc + UI work. With CWD at the single
UI repo, cross-repo commands need `git -C C:/source/repos/...`
absolute paths every time. The mental model is also a fork &mdash;
"the platform" is the five-repo set, but the working tree pretends
it's one repo.

Moving CWD one level up to `C:/source/repos/` matches the work
pattern. Five RR repos as siblings, no unrelated pollution.

## What you gain

- **Relative cross-repo paths**: `git -C RapidReconciler-Agent
  ...` instead of `git -C C:/source/repos/RapidReconciler-Agent
  ...`. Small per-call, big over hundreds of calls.
- **Single grep across the whole platform**: useful for "where
  else does this string appear?" cross-repo refactors.
- **Cross-repo refactors land cleanly**: e.g. the
  `mini-VALC` &rarr; `VALC 2.0` cleanup, if pushed further,
  becomes one find-and-replace pass at the parent.
- **One conversation per cross-repo feature**: no friction
  switching "primary" repo mid-chunk.

## What it costs (one-time migration)

1. **CLAUDE.md scope shifts.** Today's
   `RapidReconciler-AI/CLAUDE.md` is in the auto-load chain
   because CWD is the AI repo. At the parent CWD it becomes a
   child path that Claude Code does NOT auto-load. Either:
   - Promote cross-cutting rules to a new workspace-level
     `C:/source/repos/CLAUDE.md`.
   - Leave per-repo specifics at `RapidReconciler-AI/CLAUDE.md`
     (and add similar per-repo CLAUDE.md files in Agent / Valc /
     DB / SSIS).

2. **Memory directory rebases.** Claude Code encodes the CWD in
   the memory path:
   `~/.claude/projects/C--source-repos-RapidReconciler-AI/memory/`.
   At the new CWD the encoded path becomes
   `~/.claude/projects/C--source-repos/memory/` &mdash; empty by
   default. Accumulated entries
   (`feedback_check_v359_first`, `project_valc_2_naming`,
   `feedback_auto_pull_main`, `feedback_commit_means_full_flow`,
   etc.) would not auto-load until the dir is migrated.

3. **`.claude/settings.json` allowlist + hooks reset.** Permission
   allowlists are per-project. The auto-restart-mini-VALC hook,
   any other hooks, the always-allow patterns &mdash; all
   per-project. Need to copy the file up and re-base any
   path-specific patterns.

4. **Session transcript continuity.** Future sessions opened at
   the new CWD won't surface this CWD's history. Existing
   sessions stay browsable but switching default CWD orphans
   them from "what's recent."

5. **Per-repo conventions need their own home.** Today the UI
   repo's CLAUDE.md carries some V8-specific rules (link path
   conventions, release-notes trailer rules, GH Pages
   deployment) that don't apply to the Agent or Valc repos.
   Splitting the file means new per-repo files have to be
   created so those rules still surface when working in
   their respective repos.

## Pre-flight check

Before starting the migration, confirm:

- [ ] `C:/source/repos/` contains ONLY RR-family repos (verified
      2026-05-25: AI, Agent, DB, SSIS, Valc &mdash; no pollution).
- [ ] No unrelated repos under `C:/source/repos/` that would
      get pulled into the workspace.
- [ ] No in-flight uncommitted work in any of the five repos
      &mdash; the migration is cleanest from a "clean tree
      everywhere" starting point.
- [ ] Mini-VALC, the test agent, and any other dev processes
      are stopped (they hold file handles).

## Migration steps

### 1. Copy the memory directory

```powershell
$src = "$env:USERPROFILE\.claude\projects\C--source-repos-RapidReconciler-AI\memory"
$dst = "$env:USERPROFILE\.claude\projects\C--source-repos\memory"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\projects\C--source-repos" | Out-Null
Copy-Item -Path "$src\*" -Destination $dst -Recurse -Force
```

Verify `MEMORY.md` lands and references the same per-feedback
files (`feedback_*.md` and `project_*.md`).

### 2. Write a workspace-level CLAUDE.md

Create `C:/source/repos/CLAUDE.md`. Move cross-cutting rules
that apply across all five repos:

- Commit workflow ("commit means full flow," batch commits,
  squash-merge, auto-pull main, force-with-lease Dev cleanup)
- Check-v359-first rule (links to
  `RapidReconciler-Agent/docs/v359-auth.md` + jar-mining recipe)
- VALC 2.0 naming convention (link the memory entry; flag the
  Coral-readability sanitization for cutover plan docs)
- SQL compat floor (links to `RRV8/WORKFLOW.md` section)
- Don't-narrate-preview-panel preference
- Per-repo CWD conventions (where each repo's main work lives)

Keep it 100-150 lines. Don't try to be comprehensive &mdash; link
out to the per-repo CLAUDE.md files for the specifics.

### 3. Trim `RapidReconciler-AI/CLAUDE.md`

Remove the cross-cutting rules now in the workspace CLAUDE.md.
Leave the UI-repo-specific stuff:

- Link path rules (the "../FOLDER/file.html" gotcha)
- Customer-facing data hygiene (no real account numbers, etc.)
- Doc-chrome template
- Release-notes trailer convention
- GH Pages deployment
- The `docs/plans/` convention
- Anything else that's UI-repo-only

### 4. Create per-repo CLAUDE.md files for the other four

Each one 20-50 lines, pointing at the relevant docs. Sketch:

- `RapidReconciler-Agent/CLAUDE.md`:
  - What this repo ships (Services jar, NOT the Agent jar)
  - Tagged-release pattern (`release.yml` + `/release agent`)
  - Where mining recipes live (`docs/jar-mining.md`)
  - SQL compat floor reminder

- `RapidReconciler-Valc/CLAUDE.md`:
  - What this is (the broker + dashboard, ships as VALC 2.0)
  - Tagged-release pattern (`/release valc`)
  - Auto-restart-after-edit rule for `src/main/resources/`
    template changes
  - Hooks file lives at `.claude/settings.json`

- `RapidReconciler-DB/CLAUDE.md`:
  - SSDT project conventions
  - Dev &rarr; QA workflow (per existing memory
    `project_dev_to_qa_workflow`)
  - SQL compat floor reminder

- `RapidReconciler-SSIS/CLAUDE.md`:
  - What this repo is (haven't worked in it yet this session;
    placeholder with a link to docs in GSIRRTech if any).

### 5. Copy `.claude/settings.json` up + rebase paths

```powershell
Copy-Item "C:\source\repos\RapidReconciler-AI\.claude\settings.json" `
          "C:\source\repos\.claude\settings.json"
```

Then open the new file and:

- Replace any absolute paths starting with
  `C:/source/repos/RapidReconciler-AI/` with the appropriate
  parent-relative form (or leave absolute paths since they
  still resolve).
- Confirm allowlist patterns still match the cross-repo
  commands you actually run.

The auto-restart-mini-VALC hook (if it's still in there)
needs its trigger path adjusted to match `RapidReconciler-Valc/`
edits at the new CWD.

### 6. Update `RRV8/HANDOFF.md` resume prompt

The current resume prompt at the top of HANDOFF.md tells the
next session to read CLAUDE.md "at the repo root." After the
migration, "the repo root" is ambiguous &mdash; update the prompt
to spell out:

1. Workspace CLAUDE.md at `C:/source/repos/CLAUDE.md`
2. Per-repo CLAUDE.md files in each of the five repos
3. The session's primary working location (probably still
   `RapidReconciler-AI` since the UI is the canvas for V8 work)

### 7. Smoke test

Open a fresh Claude Code session at `C:/source/repos/` and
verify:

- [ ] CLAUDE.md auto-loaded (workspace one).
- [ ] Memory entries surface in the auto-readback (check for
      `feedback_check_v359_first`).
- [ ] `git -C RapidReconciler-Agent log --oneline -3` resolves.
- [ ] `Grep` across all five repos for a known string returns
      hits from multiple repos.
- [ ] At least one allowlist pattern works without re-prompting.
- [ ] The auto-restart-mini-VALC hook fires when you edit a
      file under `RapidReconciler-Valc/src/`.

If any of those fail, fix before considering the migration done.

## When to skip / defer

- If you're about to do a one-shot in one repo (a quick UI fix,
  for example), staying in the existing CWD is fine.
- If you've got significant uncommitted work across repos, finish
  + commit those before migrating &mdash; cleaner starting state.
- If the next 2-3 chunks are all UI-only and the cross-repo
  pattern won't bite, defer until the cross-repo work resumes
  (the auth shape rewrite chunk in HANDOFF qualifies as a good
  motivator).

## What this plan deliberately does NOT cover

- **Multi-root workspace setups in VS Code / Visual Studio.**
  Those are separate from Claude Code's CWD. Configure them
  alongside but they don't drive this migration.
- **Moving repos to a different parent directory** (e.g.
  consolidating from `C:/source/repos/` to `C:/work/rr/`).
  Out of scope; if you do this, redo the migration plan for the
  new path.
- **The app/docs split decision** discussed in earlier session
  conversations &mdash; that's a repo-structural question,
  independent of where Claude Code's CWD sits.
