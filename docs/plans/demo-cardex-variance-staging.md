# Demo cardex-variance staging plan

Status: documentation phase (2026-07-11). The approach is agreed; the
seeder is not built yet. Open items are at the end.

## The problem

All three demo databases (Demo1, Demo2, Demo3) reconcile clean. There is no
natural cardex variance in any of them. The Home Cardex Variance tab cards
and the sync page both need variances to demonstrate against and to test.

Those variances have to be repeatable. The sync page resolves a variance
during a demo, and resolving it is the point of the demo, so the next demo
needs the same variances back. The staging mechanism therefore has to answer
two questions: how a variance gets created, and how it gets restored for the
next run.

## Why not the two obvious routes

Source-staging (bake a mismatch into F4111 or F0902 in the jde source): the
variance is real and survives a reload, but restoring it after the sync page
resolves it needs a full reload, which is the multi-hour B to C step.
Cumbersome, and it couples every restore to a reload.

The sync page's own Adjustment Ledger (a reversible Adjust Beginning
Balance): tempting because it can undo, but it is circular. It uses the tool
under test to create the tool's own test data, and it does not populate the
Home cards independently. The Home cards read the computed variance from the
RR tables, so the variance has to exist before the sync page is involved.

## The approach: a re-runnable seeder

Stage variances after the load, directly in the RR database, with a seeder
that is fast, idempotent, and re-runnable. It is decoupled from the reload.

Create: for a curated set of items, the seeder sets a beginning-balance
divergence. It moves `RPerpetualInv.baselineqoh` / `baselineaoh` (and the
`RInvasOf` `bl=1` anchor) off the rolled position, so `estunits` and
`baselinevar` compute non-zero. That is a genuine computed variance the Home
cards and the grid read the normal way. It is the sync page's Adjust
Beginning Balance lever run in reverse.

Curate the set to fill the four framework cells (Standard and Average cost,
each crossed with Quantity and Amount variance) and to straddle materiality
(some above `rcompanies.Threshold`, some below) so the materiality filter is
visible in the demo.

Fix: the sync page re-aligns the baseline to GL and the variance resolves.
The seeder and the sync page are inverse operations on the same lever, which
also means the seeder doubles as repeatable test input while the sync page is
still being finished.

Restore: re-run the seeder. One command, seconds, no reload, no source
change. It sets the curated items to the target divergence, so it works
whether the last demo's sync resolved them or a reload cleared them. The
seeder is the restore button.

## Durability

Seeded variances ride on the baseline, and a normal re-roll preserves the
baseline (`usp6_roll_item_from_baseline` changes `bl=1` only on an explicit
zero-beginning-balance). So they persist through normal operation. Only a
full reset or reload recomputes `bl=1` and clears them, so the routine is:
after each VALC bootstrap and reload, run the seeder once.

## Across all three databases

Same mechanism, a different curated set per demo (Demo1 manufacturing, Demo2
distribution, Demo3 food and beverage), each covering the four cards. Demo2
has transfers off, so its transfer card stays empty by design.

## Open items

- The curated sets per database (which items, rough magnitudes, which cards).
  This is demo-narrative and is owner-supplied.
- Where the seeder lives: untracked demo tooling (like the `_scrub` scripts),
  or a `usp8_demo_seed_cardex_variance` proc guarded to the demo databases.
- Sync-page persistence coordination. The seeder must also reset whatever the
  sync fix persists (the per-item cardex / resolution store), so restore is
  clean. Lock this once the sync page's persistence model is finalized.
- Confirm the Home Cardex Variance card query and the grid
  (`v6ui_itemrollintegritydialog`) both surface the seeded variance columns,
  so the seeded values show up everywhere the demo reads them.
