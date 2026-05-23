# Agent endpoint specs &mdash; staging area

This folder holds **planned-endpoint specs for the RR data-services
agent** that V8 needs but the current agent doesn&rsquo;t yet expose.
Each file is a self-contained brief the agent team (or a future
contributor) can read cold and implement against.

## Why this folder exists

Until the dedicated `RapidReconciler-Agent` repo is created (see
[`project_agent_repo_plan`](../../../.claude/projects/C--source-repos-RapidReconciler-AI/memory/project_agent_repo_plan.md))
these specs live here in the V8 repo as a staging area. When the
agent repo exists, the contents of this folder migrate to its
`specs/` directory verbatim &mdash; the format is intentionally
copy-paste compatible.

## Conventions

Every spec carries:

- **Status** &mdash; `Ready to implement`, `Needs design`, `Blocked`,
  or `Shipped`.
- **Use case** &mdash; the V8 feature that needs this endpoint and why
  the current surface doesn&rsquo;t cover it.
- **Request DTO** &mdash; existing or new, with Jackson field naming
  spelled out.
- **Response DTO** &mdash; same.
- **Controller method (Spring)** &mdash; complete Java, paste-ready.
- **Data dependencies** &mdash; sprocs / views / repositories the
  method calls.
- **Demo reference** &mdash; the captured snapshot under
  `RRV8/data/*.json` that mirrors what the response should produce.
- **Wiring on the V8 side** &mdash; what fetches it today, and how
  V8 degrades when the endpoint isn&rsquo;t live yet.

## Current specs

| File | Status | Blocking V8 feature |
|---|---|---|
| [reconciliation-rows.md](reconciliation-rows.md) | Ready to implement | Reconciliation page → Variance contributors card (BU/Account/Subsidiary breakdown) |

When you add another, mirror the section structure in
`reconciliation-rows.md` so the format stays consistent.
