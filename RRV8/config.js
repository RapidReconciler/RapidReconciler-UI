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
 *   mode        — 'demo' | 'staging' | 'prod'. Drives every IS_DEMO
 *                 branch in the page.
 *   authBase    — VALC login endpoint root (null in demo). Production
 *                 example: 'https://rr-valc-spa.cloudapp.net'.
 *   dataPath    — only used in demo mode. Where to fetch the static
 *                 JSON snapshots from. Relative to the HTML.
 *   release     — version label shown in the user menu.
 *   buildStamp  — date the deploy was cut; surfaces in diagnostics.
 *
 * See docs/plans/v8-demo-prod-mode.md for the full design rationale.
 */
window.RR_CONFIG = {
  mode:       'demo',
  authBase:   null,
  dataPath:   'data/',
  release:    'V8',
  buildStamp: '2026-05-20'
};
