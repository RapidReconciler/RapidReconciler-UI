# Plan: Bootstrap the RapidReconciler-DB repo + dual-repo Claude workflow

**Status:** Spec ready. Not yet executed. Pick up in a fresh session when ready.

**Source of this plan:** discussion in session-transcript on 2026-05-12 covering
how to manage the RapidReconciler product DB (Microsoft SQL Server) under
source control with the existing deploy tool, plus how to attach Claude Code
to a second private repo alongside this one.

**Related plan:** `docs/plans/dmaai-system-context.md` (different feature, also
deferred — independent).

---

## Goal

Stand up a second private GitHub repo (`RapidReconciler-DB`) that holds the
product database as an SSDT (`.sqlproj`) project, with source control, release
artifacts, and inline documentation. The customer-facing docs portal stays in
this repo (`RapidReconciler-UI`). Each repo gets its own Claude Code session,
its own `CLAUDE.md`, and its own permission allowlist.

## Architecture decisions already locked in

These were settled in the source conversation. **Do not re-derive in a future
session unless the user says otherwise.**

- **Deploy model: Pattern B (bundled-script per release).** The customer's
  deploy tool consumes one `Release_v<X.Y.Z>.sql` per upgrade. Not per-script
  migrations (Pattern A). Not DACPAC-publish-at-customer-site.
- **Source of truth: `.sqlproj`** (state-based). The release scripts are
  generated artifacts, checked in for audit.
- **Version tracking: extended property + meta table.** Customer DBs carry
  an extended property `ProductReleaseVersion` (already used by the existing
  deploy tool — don't change the name). Mirrored to a `dbo.SchemaVersion`
  table for application code + audit trail.
- **Self-gating release scripts.** Each release script reads the current
  extended property, refuses to run unless the DB is at the expected prior
  version, applies in a transaction, stamps the new version. Customers can't
  accidentally skip releases by applying out of order.
- **Two Claude Code sessions, one per repo.** No shared cwd. Each repo
  carries its own `CLAUDE.md` and `.claude/settings.json`.

## Prerequisites — confirm before starting

The future session should confirm all five before writing files:

1. **The DB repo's GitHub URL** (or `org/name` form for `gh repo clone`).
   The user said it's private and started but didn't share the URL.
2. **Where it lives on disk.** Default recommendation: permanent sibling at
   `C:\source\repos\RapidReconciler-DB\`. Alternative is a temporary worktree
   under `.claude/worktrees/` in this repo, but that's not appropriate for a
   long-lived second repo.
3. **Current `.sqlproj` state.** The user said the project is "started" —
   does it already contain object scripts, or is it just a fresh `.sqlproj`
   file? This determines whether we preserve existing work or start clean.
4. **Baseline schema source.** If there's a current production DB, we need
   either a connection string (to extract via `SqlPackage /Action:Extract`)
   or a recent `.dacpac` / `.bacpac` to import. Without a baseline the
   project starts empty.
5. **Conventions decisions** (see the "Conventions to confirm" section below).
   These shape the `CLAUDE.md` content — guessing them is worse than asking.

---

## Final repo layout (target state)

```
RapidReconciler-DB/
├── RapidReconciler.sqlproj
├── README.md
├── CLAUDE.md
├── .gitignore
├── .gitattributes                 ← enforce CRLF for .sql, LF for .md
├── .claude/
│   ├── settings.json              ← Bash(git fetch *), Bash(SqlPackage *), etc.
│   └── plans/                     ← future Claude plans, mirroring this repo
├── Schema/
│   ├── Tables/                    ← one .sql per table
│   ├── Views/
│   ├── StoredProcedures/
│   ├── Functions/
│   ├── Indexes/                   ← if kept separate from table files
│   └── ExtendedProperties/        ← column-level MS_Description docs
├── Scripts/
│   ├── PreDeploy.sql              ← runs before each release's schema changes
│   ├── PostDeploy.sql             ← runs last; stamps the new version
│   └── Migrations/                ← per-release data migration scripts
│       └── 0.0.0-baseline/        ← seed scripts for fresh installs
├── Releases/
│   ├── Release_v0.0.0-baseline.sql
│   └── Release_v0.0.0-baseline.sha256
├── baseline/                      ← prior-release DACPACs for diffing
│   └── v0.0.0-baseline.dacpac
├── docs/
│   ├── architecture.md
│   ├── release-process.md         ← checklist for cutting a release
│   ├── tables/                    ← per-table "why" docs (only when needed)
│   └── decisions/                 ← ADR-style records of schema decisions
│       └── 0001-bundled-release-pattern.md
└── tools/
    ├── build-release.ps1          ← composes Release_v<X.Y.Z>.sql
    └── verify-release.ps1         ← sandbox-apply + Schema Compare check
```

## Bootstrap steps (in order)

Run these in a fresh Claude Code session pointed at the new DB repo's cwd
(after step 1 has cloned it). The session should `git pull` first.

### 1. Clone the repo

```powershell
gh repo clone <ORG>/<REPO> C:\source\repos\RapidReconciler-DB
```

The org/name comes from prereq #1. After cloning, switch the Claude Code
session's cwd to that directory (or launch a new session rooted there).

### 2. Examine what's already there

```powershell
git log --oneline -10
ls -la
```

Report back: what files / commits are already in the repo? If there's an
existing `.sqlproj`, preserve it and slot it into the target layout.

### 3. Confirm conventions

Surface the open questions (see "Conventions to confirm" below) to the user
and lock in answers before writing CLAUDE.md or any object scripts. **Do not
guess.** A wrong convention encoded into CLAUDE.md becomes a long-running
nuisance — every future session is biased by it.

### 4. Write `.gitignore` and `.gitattributes`

```gitignore
# Visual Studio / MSBuild outputs
bin/
obj/
*.user
*.suo
.vs/

# SSDT intermediate outputs
*.dacpac.deploymentreport.xml
DeploymentContributors/

# Local dev configs
*.dbmdl
*.jfm

# SqlPackage temp
*.deployreport.xml

# Local SQL files (devs may keep local one-offs)
LocalScratch/
```

```gitattributes
# Force CRLF on SQL Server files (SSMS / VS expect Windows line endings)
*.sql       text eol=crlf
*.sqlproj   text eol=crlf
*.refactorlog text eol=crlf

# Markdown stays LF
*.md        text eol=lf

# Binary
*.dacpac    binary
*.bacpac    binary
```

### 5. Write the skeleton directories

Create empty dirs with a `.gitkeep` in each so the structure is committed
from day one: `Schema/Tables/`, `Schema/Views/`, `Schema/StoredProcedures/`,
`Schema/Functions/`, `Schema/Indexes/`, `Schema/ExtendedProperties/`,
`Scripts/Migrations/0.0.0-baseline/`, `Releases/`, `baseline/`,
`docs/tables/`, `docs/decisions/`, `tools/`.

### 6. Write `CLAUDE.md`

Use the template in the next section, filled in with the convention decisions
from step 3.

### 7. Write `.claude/settings.json`

Start with the same patterns as the docs repo (`Bash(git fetch *)` and the
MCP previews that the user actually uses). The user can extend later. Don't
preemptively add `Bash(SqlPackage *)` or similar — let those land as
needed, narrowly scoped.

### 8. Write the release-script template

Save as `tools/release-template.sql`. This is the skeleton that every future
release gets generated from. Full content in the "Templates" section below.

### 9. Write the PreDeploy / PostDeploy templates

`Scripts/PreDeploy.sql` and `Scripts/PostDeploy.sql` with the canonical
locking, version-check, and stamping logic. Templates below.

### 10. Write `Schema/Tables/SchemaVersion.sql`

The 1-row meta table that mirrors the extended property and gives application
code / support an audit trail. Template below.

### 11. Write `tools/build-release.ps1`

PowerShell that composes a `Release_v<X.Y.Z>.sql` from the template + the
auto-generated diff + the migration scripts. Template below.

### 12. Write `tools/verify-release.ps1`

Sandbox verification: restore a baseline backup, apply the new release
script, run Schema Compare against the new DACPAC, fail if there's drift.
Template below.

### 13. Write docs scaffolding

`docs/architecture.md`, `docs/release-process.md`, and
`docs/decisions/0001-bundled-release-pattern.md`. Stub content below — the
user fills in real details.

### 14. Commit everything

One initial commit with everything scaffolded. Push.

```powershell
git add -A
git commit -m "Initial bootstrap: repo structure, release-script template, conventions, docs"
git push origin main
```

### 15. Baseline the schema (separate follow-up)

This is **out of scope** for the bootstrap commit. Once the structure is in
place and the user is happy with it, a separate session imports the actual
schema from the current production DB via `SqlPackage /Action:Extract` or
SSDT's "Import Database" wizard. The baseline DACPAC goes into
`baseline/v0.0.0-baseline.dacpac` and becomes the diff source for the first
real release.

---

## Conventions to confirm in step 3

The future session asks the user these explicitly. Each shapes CLAUDE.md
and the conventions section.

1. **Object naming.** PascalCase (`CustomerAddress`)? snake_case
   (`customer_address`)? Any prefixes (`tbl_`, `vw_`, `sp_`)? My
   recommendation: PascalCase, no prefixes. JDE world commonly uses table
   codes like `F4111` — those stay verbatim since they're external contracts.
2. **Schemas.** All `dbo`, or split (`audit`, `staging`, `report`)? My
   recommendation: start with `dbo` until there's a real reason to split.
3. **Primary keys.** Surrogate `INT IDENTITY` named `<Table>ID`? Composite
   natural keys? My recommendation: surrogate `INT IDENTITY` PKs for app
   tables, natural keys preserved as `UNIQUE` constraints.
4. **Soft-delete model.** `IsDeleted BIT` + `DeletedAtUtc DATETIME2`? Or
   physical deletes? My recommendation: soft-delete only when there's a
   business requirement to recover deleted records or audit them; physical
   deletes otherwise.
5. **Timestamps.** UTC always? Column-name convention (`*Utc` suffix)?
   `DATETIME2(3)` everywhere? My recommendation: yes, yes, yes.
6. **Nullability defaults.** NULL or NOT NULL by default? My recommendation:
   NOT NULL is the default — every NULL column should be a conscious choice.
7. **Triggers.** Use them or avoid them? My recommendation: avoid for app
   logic; OK for audit-only.
8. **Computed columns.** Persisted vs non-persisted defaults? My
   recommendation: persisted unless there's a reason not to.

Capture all answers in `CLAUDE.md` under a "Conventions" section so they
guide every future Claude session in that repo.

---

## Templates

These are the seed files to write into the new repo during bootstrap. Each
gets a brief header explaining its purpose so future readers (human or AI)
understand the role without reading the bootstrap plan.

### CLAUDE.md (template — fill conventions section in step 3)

```markdown
# RapidReconciler-DB — Project Guide for Claude

The product database for RapidReconciler (a GSI product for JD Edwards
inventory reconciliation). Microsoft SQL Server, managed as a Visual Studio
SQL Server Database Project (SSDT, `.sqlproj`).

The customer-facing docs portal lives in a separate repo (RapidReconciler-UI).
Don't try to update docs there from this session — switch repos.

## Repo layout

- `RapidReconciler.sqlproj` — source of truth for the schema
- `Schema/Tables/` — one .sql per table, declarative CREATE
- `Schema/Views/`, `Schema/StoredProcedures/`, `Schema/Functions/`
- `Schema/Indexes/` — index definitions when kept separate from table files
- `Schema/ExtendedProperties/` — MS_Description docs for tables and columns
- `Scripts/PreDeploy.sql` — runs before each release's schema changes
- `Scripts/PostDeploy.sql` — runs after; stamps the new version
- `Scripts/Migrations/<version>/` — hand-authored data migrations per release
- `Releases/Release_v<X.Y.Z>.sql` — bundled artifact our deploy tool runs
- `baseline/v<X.Y.Z>.dacpac` — prior-release schema snapshots for diffing
- `docs/` — architecture, release-process, per-table "why" docs, ADRs
- `tools/` — PowerShell scripts that compose and verify release bundles

## Release model

One bundled `.sql` per release. Customer DBs carry a `ProductReleaseVersion`
extended property; the release script reads it, refuses to apply unless the
current version matches the expected predecessor, applies in a transaction,
stamps the new version, and inserts a row into `dbo.SchemaVersion`.

The deploy tool already exists and consumes these bundled scripts — don't
re-architect the deployment path without an explicit ask.

See `docs/release-process.md` for the full checklist for cutting a release.

## Conventions

<!-- Fill these in after step 3. Format:
   - **Object naming**: PascalCase, no prefixes. JDE table names (F4111 etc.)
     preserved verbatim.
   - **Schemas**: all `dbo` unless there's a strong reason otherwise.
   - **PKs**: surrogate INT IDENTITY named `<Table>ID`; natural keys as UNIQUE.
   - **Soft-delete**: only where business-required; physical otherwise.
   - **Timestamps**: DATETIME2(3) UTC; column names end in `Utc`.
   - **Nullability**: NOT NULL by default.
   - **Triggers**: avoid for app logic; audit-only acceptable.
-->

## Workflow

- Branch per change.
- Edit `Schema/...` files; the schema diff is generated at release time.
- For data migrations: add a script under `Scripts/Migrations/<next-version>/`
  with a `01_`, `02_` numeric prefix so order is explicit.
- Build the `.sqlproj` locally before pushing (catches errors that would
  otherwise surface at release-build time).
- See `docs/release-process.md` for cutting a release.

## Never

- Edit a file in `Releases/` by hand. Those are generated artifacts; if
  something's wrong, fix the source and rebuild.
- Bump the extended property name from `ProductReleaseVersion` — the
  deploy tool depends on it.
- Add raw connection strings or customer credentials to any file in the repo.
- Use `DROP TABLE` in a release without an explicit migration script
  preserving the data or confirming the table is genuinely unused.

## Auto-memory note

Like the docs repo, this project gets its own Claude auto-memory directory
under `~/.claude/projects/<sanitized-cwd>/memory/`. Plans, decisions, and
lessons learned about this repo accumulate there independent of the docs
repo's memory.
```

### Schema/Tables/SchemaVersion.sql

```sql
/* dbo.SchemaVersion — 1-row-per-release audit trail of database upgrades.
   Mirrors the ProductReleaseVersion extended property. Support and
   application code read from this table; the deploy tool reads the
   extended property for the current version. */
CREATE TABLE dbo.SchemaVersion (
    SchemaVersionID  INT           IDENTITY(1,1) NOT NULL,
    Major            INT           NOT NULL,
    Minor            INT           NOT NULL,
    Build            INT           NOT NULL,
    ReleaseTag       NVARCHAR(50)  NOT NULL,
    AppliedAtUtc     DATETIME2(3)  NOT NULL CONSTRAINT DF_SchemaVersion_AppliedAtUtc DEFAULT SYSUTCDATETIME(),
    AppliedBy        NVARCHAR(128) NOT NULL CONSTRAINT DF_SchemaVersion_AppliedBy DEFAULT SUSER_SNAME(),
    NotesShort       NVARCHAR(200) NULL,
    CONSTRAINT PK_SchemaVersion PRIMARY KEY CLUSTERED (SchemaVersionID),
    CONSTRAINT UQ_SchemaVersion_ReleaseTag UNIQUE (ReleaseTag)
);
```

### Scripts/PreDeploy.sql (template)

```sql
/* Pre-deploy fragment — runs BEFORE the schema diff in each release script.
   The release-build script composes this into the final Release_v<X.Y.Z>.sql.

   Purpose:
     - Drop dependent objects that block schema changes (views, computed
       constraints, etc.) — they get recreated in the post-deploy.
     - Backfill data that needs to land before new NOT NULL columns.
     - Pre-flight checks (verify required pre-existing data is present).

   Convention: idempotent. This file runs every release, so guard
   everything with IF EXISTS / IF NOT EXISTS.
*/

-- Example: drop a view that depends on a table we're about to rename a column on.
-- IF OBJECT_ID('dbo.vw_ActiveCustomers', 'V') IS NOT NULL DROP VIEW dbo.vw_ActiveCustomers;
```

### Scripts/PostDeploy.sql (template)

```sql
/* Post-deploy fragment — runs AFTER the schema diff in each release script,
   inside the same transaction. Last step before COMMIT.

   Purpose:
     - Recreate objects dropped in pre-deploy.
     - Seed / update lookup data.
     - Stamp the new version (handled by the release-script wrapper, not here —
       but data migrations that fix up post-schema state belong here).

   Convention: idempotent. MERGE for seed data, IF NOT EXISTS guards.
*/

-- Example: ensure a lookup row exists.
-- MERGE dbo.Industry AS target
-- USING (VALUES (1, 'Oil & Gas')) AS source (IndustryID, Name)
--    ON target.IndustryID = source.IndustryID
-- WHEN NOT MATCHED THEN INSERT (IndustryID, Name) VALUES (source.IndustryID, source.Name);
```

### tools/release-template.sql

```sql
/* ============================================================
   Release {{TARGET_VERSION}}
   Source: git tag {{TARGET_VERSION}} in RapidReconciler-DB
   Generated: {{GENERATED_AT}} by {{GENERATED_BY}}
   SHA-256: {{SHA256}}  (compare against the .sha256 sidecar)
   ============================================================ */

SET XACT_ABORT ON;
SET NOCOUNT ON;

DECLARE @TargetVersion  NVARCHAR(50) = N'{{TARGET_VERSION}}';
DECLARE @ExpectedFrom   NVARCHAR(50) = N'{{EXPECTED_FROM}}';
DECLARE @CurrentVersion NVARCHAR(50);

SELECT @CurrentVersion = CAST(value AS NVARCHAR(50))
FROM sys.fn_listextendedproperty(N'ProductReleaseVersion',
                                  default, default,
                                  default, default,
                                  default, default);

IF @CurrentVersion = @TargetVersion
BEGIN
    PRINT 'Database already at ' + @TargetVersion + '. Nothing to do.';
    RETURN;
END

IF @CurrentVersion IS NULL OR @CurrentVersion <> @ExpectedFrom
BEGIN
    RAISERROR(
      'Refusing to run: expected to upgrade from %s but DB is at %s. Apply intervening releases first, then re-run this one.',
      16, 1, @ExpectedFrom, ISNULL(@CurrentVersion, N'unknown'));
    RETURN;
END

PRINT N'Upgrading from ' + @CurrentVersion + N' to ' + @TargetVersion;

BEGIN TRY
    BEGIN TRANSACTION;

    -- ---------- PRE-DEPLOY ----------
    {{PRE_DEPLOY_SQL}}

    -- ---------- SCHEMA DIFF ----------
    {{SCHEMA_DIFF_SQL}}

    -- ---------- DATA MIGRATIONS ----------
    {{DATA_MIGRATIONS_SQL}}

    -- ---------- POST-DEPLOY ----------
    {{POST_DEPLOY_SQL}}

    -- ---------- STAMP NEW VERSION ----------
    IF EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'ProductReleaseVersion',
                                  default, default, default, default, default, default))
        EXEC sys.sp_updateextendedproperty
            @name  = N'ProductReleaseVersion',
            @value = @TargetVersion;
    ELSE
        EXEC sys.sp_addextendedproperty
            @name  = N'ProductReleaseVersion',
            @value = @TargetVersion;

    INSERT INTO dbo.SchemaVersion (Major, Minor, Build, ReleaseTag, NotesShort)
    VALUES ({{MAJOR}}, {{MINOR}}, {{BUILD}}, @TargetVersion, N'{{NOTES_SHORT}}');

    COMMIT TRANSACTION;
    PRINT N'Upgrade to ' + @TargetVersion + N' completed.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT N'Upgrade FAILED: ' + ERROR_MESSAGE();
    THROW;
END CATCH;
```

### tools/build-release.ps1 (skeleton)

```powershell
<#
.SYNOPSIS
  Compose a Release_v<X.Y.Z>.sql artifact from the .sqlproj build + the
  PreDeploy/PostDeploy fragments + the version-specific data migrations.
.DESCRIPTION
  Steps:
    1. Build the .sqlproj (msbuild RapidReconciler.sqlproj /p:Configuration=Release)
    2. Diff the resulting .dacpac against baseline/v<EXPECTED_FROM>.dacpac
       via SqlPackage /Action:Script. Capture the generated schema-diff SQL.
    3. Read Scripts/PreDeploy.sql, the diff, Scripts/Migrations/<version>/*.sql
       in order, and Scripts/PostDeploy.sql.
    4. Substitute into tools/release-template.sql.
    5. Write Releases/Release_v<TARGET>.sql + .sha256 sidecar.
    6. Optionally tag the git commit.
.PARAMETER TargetVersion
  e.g. 'v1.6.0'
.PARAMETER ExpectedFrom
  e.g. 'v1.5.0'
.PARAMETER NotesShort
  e.g. 'Adds Customer.Region, splits Address'
#>
param(
    [Parameter(Mandatory)] [string] $TargetVersion,
    [Parameter(Mandatory)] [string] $ExpectedFrom,
    [string] $NotesShort = ''
)

# TODO: implement. Future session: write this when actually cutting a real
# release for the first time, not at bootstrap. Don't speculatively code
# everything in the bootstrap commit.
Write-Error "Not yet implemented. See docs/release-process.md."
```

### tools/verify-release.ps1 (skeleton)

```powershell
<#
.SYNOPSIS
  Sandbox-verify a Release_v<X.Y.Z>.sql before tagging it.
.DESCRIPTION
  Steps:
    1. Restore a backup of a reference DB at <EXPECTED_FROM>.
    2. Apply Releases/Release_v<TARGET>.sql via sqlcmd.
    3. Compare resulting schema against the build's .dacpac via SqlPackage
       /Action:Compare. Drift = failure.
    4. Verify dbo.SchemaVersion has the new row and the extended property
       reads as TARGET.
#>
param(
    [Parameter(Mandatory)] [string] $TargetVersion,
    [Parameter(Mandatory)] [string] $ExpectedFrom,
    [Parameter(Mandatory)] [string] $ReferenceBackupPath
)

# TODO: implement at first-release time. See note in build-release.ps1.
Write-Error "Not yet implemented."
```

### docs/architecture.md (stub)

```markdown
# RapidReconciler-DB — Architecture

## Purpose
The product database for RapidReconciler. One database per customer install.

## Hosting model
Microsoft SQL Server (version <FILL>). Customers host on their own
infrastructure; we never have direct access to a customer's DB outside of
support sessions.

## Schemas
- `dbo` — application objects (default)
- <add others as they emerge>

## Major subject areas
<Fill in as the schema fleshes out, e.g.:
- Inventory accounting (F4111, F4102, F41021 mirrors)
- Customer / company config
- Audit / version tracking>

## Key conventions
See `CLAUDE.md` and the per-table docs in `docs/tables/` for specifics.

## Auto-generated reference
Run SchemaSpy from `tools/` on every PR. The generated HTML lives at
`docs/generated/` — link to the table index here once that's stood up.
```

### docs/release-process.md (stub)

```markdown
# Cutting a release

## Pre-release checklist

- [ ] All work for this release merged to `main`.
- [ ] `Scripts/Migrations/<next-version>/` contains every data migration
      needed, in numeric order.
- [ ] `Scripts/PreDeploy.sql` and `Scripts/PostDeploy.sql` reflect any
      release-specific pre / post work.
- [ ] Customer-facing renames or removals have a corresponding update in
      the RapidReconciler-UI docs repo (RRUniversity scenarios, Help Desk
      runbooks, etc.) — flagged for the docs team to land in parallel.

## Build

```powershell
.\tools\build-release.ps1 `
    -TargetVersion v1.6.0 `
    -ExpectedFrom  v1.5.0 `
    -NotesShort    'Adds Customer.Region, splits Address'
```

## Verify

```powershell
.\tools\verify-release.ps1 `
    -TargetVersion v1.6.0 `
    -ExpectedFrom  v1.5.0 `
    -ReferenceBackupPath C:\backups\ref-v1.5.0.bak
```

If verify fails, do **not** tag. Fix the source, rebuild, re-verify.

## Tag and publish

```powershell
git tag v1.6.0
git push origin v1.6.0
gh release create v1.6.0 `
    Releases/Release_v1.6.0.sql `
    Releases/Release_v1.6.0.sha256 `
    bin/Release/RapidReconciler.dacpac `
    --notes-file Releases/Release_v1.6.0.notes.md
```

## Post-release

- [ ] Move the new DACPAC into `baseline/v1.6.0.dacpac` for use as the
      next release's diff source.
- [ ] Commit that DACPAC.
- [ ] Update `docs/architecture.md` if any major subject area shifted.
```

### docs/decisions/0001-bundled-release-pattern.md (stub)

```markdown
# ADR 0001 — Bundled-script release pattern

## Status
Accepted (2026-05-12).

## Context
RapidReconciler has an existing deploy tool that pushes a single `.sql`
script to a customer database per release. We need source control and
documentation around this without changing the deploy tool's contract.

## Decision
- Source of truth: SSDT `.sqlproj` (state-based).
- Release artifact: one `Release_v<X.Y.Z>.sql` per release, generated by
  composing the SqlPackage-generated diff between adjacent DACPACs with
  pre/post-deploy fragments and per-release data migrations.
- Version tracking: `ProductReleaseVersion` extended property on the DB
  (the contract with the deploy tool), mirrored to `dbo.SchemaVersion`
  for application code and support.
- Self-gating: each release script refuses to run unless the DB is at
  the expected prior version, wraps everything in a transaction, and
  rolls back on failure.

## Consequences
- Customer DBs upgraded one release at a time. Skipping a release is
  blocked by the self-gating check. Support occasionally has to walk
  customers through multi-step upgrades.
- The `.sqlproj` becomes the place to make changes; release scripts are
  generated artifacts and not hand-edited.
- We retain auditability (every Release_v<X.Y.Z>.sql is checked in) while
  using a tool that gives us schema-diff for free.

## Alternatives considered
- **Migration-first (DbUp / Flyway)**: ordered scripts as primary source.
  Rejected because it would require replacing the existing deploy tool;
  the tool works and customers trust it.
- **DACPAC publish at customer site (SqlPackage at install time)**: would
  remove the need to ship .sql files but would require deploy-tool
  changes and gives customers less visibility into what's about to run.
```

---

## Verification — what "done" looks like for bootstrap

After step 14:

- [ ] The repo has the layout shown above.
- [ ] `CLAUDE.md` is filled in with the user's actual conventions, not
      placeholders.
- [ ] `Schema/Tables/SchemaVersion.sql` builds cleanly when added to the
      `.sqlproj` (open in VS, right-click project → Add → Existing Item).
- [ ] `.claude/settings.json` exists with at least a couple of useful
      allowlist entries.
- [ ] `docs/release-process.md` reads as a viable checklist (even if some
      tooling isn't built yet).
- [ ] Empty directories have `.gitkeep` files so the structure is visible
      in `git log --stat -1`.

Out of scope for the bootstrap commit (do later):
- Importing the actual baseline schema (separate session).
- Implementing `build-release.ps1` and `verify-release.ps1` for real (do
  when cutting the first real release — premature otherwise).
- Wiring SchemaSpy or a CI workflow (separate sessions).

---

## How to resume

In a fresh Claude Code session, open Claude Code and say:

> "Pick up the plan at `docs/plans/rapidreconciler-db-bootstrap.md` in the
> RapidReconciler-UI repo. The DB repo is at `<URL>`; clone it to
> `C:\source\repos\RapidReconciler-DB`, work through the bootstrap steps
> starting at step 2, and ask me the convention questions in step 3 before
> writing CLAUDE.md."

The plan is self-contained — no need to re-derive the architecture
decisions.

---

## What this plan deliberately does NOT do

- **Does not write a real release script.** Wait until there's a real
  schema diff to capture; speculative release scripts go stale.
- **Does not pick conventions for the user.** The convention questions
  are surfaced; the user answers; only then does CLAUDE.md get written.
- **Does not modify the deploy tool.** It works; we wrap source control
  around it, not under it.
- **Does not set up CI / GitHub Actions.** That's a follow-up after the
  first manual release proves the build path works.
- **Does not import the baseline schema.** Separate, focused session
  once the repo structure is approved.
