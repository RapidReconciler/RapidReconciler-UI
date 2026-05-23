# docs/agent-specs/ &mdash; MOVED

Planned-endpoint specs for the RR data-services agent have moved to
their permanent home in the
[`RapidReconciler-Agent`](https://github.com/RapidReconciler/RapidReconciler-Agent)
repo:

**[github.com/RapidReconciler/RapidReconciler-Agent/tree/main/specs](https://github.com/RapidReconciler/RapidReconciler-Agent/tree/main/specs)**

Why: when this folder was created, the agent repo didn't exist. Specs
lived here as a staging area with a documented intent to migrate. The
agent repo now exists (created 2026-05-23), so specs live there
alongside the source they describe.

## What's still here

- This stub README, so existing links in
  [`RRV8/HANDOFF.md`](../../RRV8/HANDOFF.md) and elsewhere still
  resolve.
- [`reconciliation-rows.md`](reconciliation-rows.md) &mdash; a thin
  redirect to the new location.

## Adding new specs

Add new specs directly to
[`RapidReconciler-Agent/specs/`](https://github.com/RapidReconciler/RapidReconciler-Agent/tree/main/specs)
following the format documented in that folder's README. Don't add
new files here.

## When this stub can go away

When every reference in this repo points at the agent repo specs
folder directly. Search this repo for `docs/agent-specs` to find
remaining link targets; once they're all updated, this folder can be
deleted.
