/*
 * RRV8 — runtime configuration
 *
 * The COMMITTED version of this file IS the demo config. Customer-
 * facing prod deploys (and staging) overwrite this file at publish
 * time with their own `window.RR_CONFIG` block — the HTML and the
 * rest of the page are byte-identical between environments.
 *
 * Precedence at boot:
 *   1. ?mode= URL parameter wins (engineer / QA override)
 *   2. window.RR_CONFIG.mode below
 *   3. 'demo' fallback
 *
 * Field reference:
 *   mode          — 'demo' | 'staging' | 'prod'. Drives every IS_DEMO
 *                   branch in the page.
 *   authBase      — VALC login endpoint root. Null = use the per-mode
 *                   default from RR_AUTH_BASES at boot:
 *                     staging → https://staging-valcspa.cloudapp.net
 *                     prod    → https://rr-valc-spa.cloudapp.net
 *                   Set explicitly here to override (e.g. a local
 *                   mock VALC for offline testing).
 *   dataPath      — only used in demo mode. Where to fetch the static
 *                   JSON snapshots from. Relative to the HTML.
 *   statusPollMs  — interval for re-checking v_diagnostic5_job_status
 *                   (System Status light). null = don't poll (the
 *                   demo default — static JSON doesn't change).
 *                   Prod default: 60000 (1 minute).
 *   release       — version label shown in the user menu.
 *   buildStamp    — date the deploy was cut; surfaces in diagnostics.
 *
 * See docs/plans/v8-demo-prod-mode.md for the full design rationale.
 */
window.RR_CONFIG = {
  mode:         'demo',
  authBase:     null,
  dataPath:     'data/',
  statusPollMs: null,
  release:      'V8',
  buildStamp:   '2026-05-20'
};

// Per-mode VALC defaults. Used when RR_CONFIG.authBase is null and
// the resolved MODE is staging or prod. Engineering overrides
// authBase in their customer-specific config.js at deploy time.
window.RR_AUTH_BASES = {
  staging: 'https://staging-valcspa.cloudapp.net',
  prod:    'https://rr-valc-spa.cloudapp.net'
};
