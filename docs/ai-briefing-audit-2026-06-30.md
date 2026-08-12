# Home AI Briefing — deep-dive audit (Dev), 2026-06-30

**Scope:** every period in the Dev database (`RapidReconciler_Dev`), the Home
left-rail "RapidReconciler AI" briefing. Checked for accuracy ("lies"), trends,
wording, and the panel-size / clipping issue in the screenshot.

**Bottom line:** the briefing is **accurate** (no numeric lies found) but it is
**noisy, verbose, inconsistent, and historical-heavy**, which is exactly why it
reads as "not worth it." The single biggest offender — a live-ops *"Service
healthy"* line injected into every period — also silently **broke the briefing on
every fully-reconciled period**. I fixed the four clear-cut problems tonight
(uncommitted on Dev for your review); the higher-leverage product calls are in
**Recommendations** for your sign-off.

---

## How this was tested

- Pulled the live roll-forward the briefing actually reads
  (`POST /inventory/integrity {report:'v6ui_raccountsummary'}`, 195 rows) →
  ground truth per period/company/component.
- Replayed the **exact** briefing prompt the page builds to
  `POST /api/v1/ai/explain` for all **13 periods**, as an Administrator, and
  compared the AI's output to ground truth.
- Ran the open period **3×** to measure run-to-run variability.
- Measured the rail's rendered height vs. common laptop viewports to quantify the
  clipping.
- Server side (VALC `AiService`): model `claude-sonnet-4-6`, `maxTokens 1024`,
  **temperature unset (SDK default ≈ 1.0)**, no server system prompt, **no
  post-processing** — the whole instruction set is the client prompt, and nothing
  trims/serializes the model's reply.

## The data (Dev ground truth)

Two companies every period: **00900 (USD)**, **00050 (GBP)**. Latest/open period =
**2016-08-27**; the other 12 are closed. `breaks = 0` everywhere (no GL OK / Var OK
breaks), and **Cardex / Unposted GL batches / End of Day are zero in every
period** — so the Analyst tier and the red "needs attention" state never appear in
this dataset.

Material net out-of-balances (abs > 1):

| Period | Co | Net | Largest driver | Note |
|---|---|---|---|---|
| 2015-10-31 | 00050 GBP | -47.68 | Manual entries (-2,995 vs +2,947) | trivial |
| 2015-11-28 | 00900 USD | -29,245.59 | Manual entries (-68,172 vs +38,926) | rolls fwd, cleared Dec |
| 2016-02-27 | 00050 GBP | 2,310.03 | Transactions (+2,310) | rolls into Apr 2 |
| 2016-04-02 | 00050 GBP | 9,163.95 | Transactions (+6,854; carry +2,310) | the screenshot |
| 2016-04-02 | 00900 USD | -739.73 | Manual entries (-151,866 vs +151,127) | residual of offset |
| 2016-04-30 | 00900 USD | -101.16 | Transactions (+75,339 vs -74,701) | trivial residual |
| 2016-07-02 | 00050 GBP | -93.87 | Manual entries (-748 vs +654) | trivial |
| 2016-07-30 | 00050 GBP | -18,674.74 | Manual entries (-18,843) | rolls into open period |
| 2016-08-27 | 00050 GBP | -18,521.83 | **Carry forward (-18,675)** | **open — traces to Jul 30 JE** |
| 2016-08-27 | 00900 USD | -3,881.41 | Manual entries (-3,448) | open |

**Key structural truth the AI mostly misses:** Co 00900 reconciles to **$0.04**
almost every period because Transactions and Manual entries are huge (±$70K–150K)
but mirror each other to the penny. Citing those components is meaningless when the
net is pennies. And the imbalances form a **chain**: a period's net becomes the next
period's carry forward (verified: Jul 30 net -18,675 → Aug 27 carry forward -18,675;
Apr 2 net 9,164 → Apr 30 carry forward 9,164, then cleared). The compelling story is
the chain, not any single period.

---

## Findings

### 1. Accuracy — no lies, but two soft-accuracy risks
The numbers the AI cites (nets, drivers, traces) **match ground truth** in every
period I checked. The Apr 2 screenshot figures (£9,163.95 / -$739.73) are correct,
and the open-period trace ("the £18.5K is a Jul 30 manual entry rolling forward") is
**correct and is the genuine AHA**. Two things border on the "lies" you worried
about:

- **Component arithmetic.** The screenshot said *"~£2K carry forward … combined
  with ~£7K transactions … produced the ~£9K net."* That's adding components, which
  the prompt explicitly forbids — it's true *here* (same sign) but would be a flat
  lie in the common offsetting case. It happens because temperature is high.
- **Speculative "missing journal entry."** The AI says *"the Accountant likely
  needed to post an offsetting entry"* even where there were **no** manual entries
  (Apr 2 Co 00050) or where the net is a tiny residual of two offsetting $150K legs.
  That asserts a cause the data doesn't support.

### 2. The "Service healthy — Admin" line (root-cause of the worst behavior)
`/home/status-summary` returns `admin.items:["Service healthy"]`. The briefing
injected that as a **tier-0 (top priority)** item on **every period**. Consequences:

- It's pure noise — a non-actionable "all clear" that you said should never show.
- It is **not period-scoped** (same current state on a 2015 closed period), so it's
  nonsensical on historical periods.
- **It broke every fully-reconciled period (5 of 13).** With "Service healthy" as
  the *only* item, the model replied *"no actual reconciliation data items were
  included … I cannot triage … Please provide the reconciliation items."* That
  isn't JSON, so the page fell back to its non-AI renderer, which then printed
  **"Look first at Service healthy."** A clean month should say "Everything
  reconciles" — instead it showed confused noise.

### 3. Verbosity → the panel clipping
Points ran **40–60 words**, multi-clause, despite the prompt saying "one short
line." The verdict rendered **5 lines**. Measured against the rail
(`height: calc(100vh-36px)` with `overflow:hidden`):

| Laptop viewport | Result for a realistic historical briefing (≈919px of content) |
|---|---|
| 1080p | fits (125px spare) |
| 900px | **clips 55px** |
| 800px | **clips 155px** |
| 768px (very common) | **clips 187px** |

Below ~900px the lower points **and the "Review the details" CTA** were cut off with
no scrollbar. That's the screenshot.

### 4. Inconsistency (temperature ≈ 1.0)
Same period (open), three runs → three different verdicts, and the "Service healthy"
line appeared in two runs but not the third. A prospect re-opening the same period
sees different text each time. After my prompt fix, word caps and the closed-period
rule are *still* violated intermittently (e.g. a closed period's verdict said
"offset them **this period**"). Wording can't fully fix this — **temperature can.**

### 5. Materiality — trivia gets top billing
The item filter is `abs(net) > 1`, so **£48, £94, $101** residuals are surfaced as
findings with the same gravity as a £19K break. That dilutes every "where to look
first" read and is a big part of the "no AHA" feeling.

### 6. Historical-heavy, low payoff
11 of 13 periods are closed, and the AI dutifully narrates "this period is closed,
too late, the Accountant owned it" — descriptive but *so what?* for a prospect. The
value is concentrated in the **open** period and in the **trend**, neither of which
the feature leads with.

### 7. No cross-period narrative — the missing AHA
Each period is briefed in isolation. The data tells a clean story end-to-end
(imbalances arise → roll forward as carry forward → get cleared a period or two
later; the open £18.5K traces to one specific Jul 30 manual entry). A prospect
"this is worth it" moment is a **trend read**, e.g. *"Co 00050 has carried an
unoffset manual entry forward for two periods; here's where it started and what
clears it."* The briefing has the trail data to do this and doesn't.

### 8. Demo-data gap (affects the July 15 demo directly)
Because Cardex/Unposted/End-of-Day are all zero and there are no GL/Var breaks, the
demo **never** shows the Analyst tier, the red "needs attention" state, or 3 of the
6 variance components. The role-tiered triage and the full taxonomy — a core selling
point — can't be demonstrated on this data.

---

## What I fixed tonight (uncommitted, Dev)

All in `RRV8/home.html`; live-verified by reloading and replaying.

1. **Removed the live-ops admin status injection from the briefing** (`_briefItems`).
   The briefing is a *reconciliation* read, not an ops-health read; ops health lives
   on the Admin band/card. **Verified:** the "Service healthy" line is gone on the
   open period, and a reconciled period now returns a clean
   `{"verdict":"All items reconciled…","points":[]}` (and the no-AI fallback now
   says "Everything reconciles for <period>.").

2. **Panel no longer clips** — the rail is `overflow-y:auto; min-height:0` instead of
   `overflow:hidden`, so a long briefing scrolls within the rail and the CTA is
   always reachable.

3. **Prompt tightened for concision + no double attribution + no closed-period
   repetition.** Points went from **40–60 words → 13–23 words**; verdicts ~18.
   Example (Apr 30 historical): *before* a 60-word point → *after* "Co 00900 carry
   forward of ~$740 originated in the Apr 2 period from unresolved transactions —
   Accountant."

4. **Reined in the bad-accuracy patterns in-prompt:** banned verbal component
   summation ("X plus Y produced Z") explicitly, and gated the "unoffset/missing
   journal entry" language to cases where Manual entries is actually the largest
   driver.

These four are safe, reversible, and directly address your asks (kill service
health; fix the panel; make it less verbose). They are **not committed** — review
the diff first.

---

## Recommendations (need your product judgment)

**P1 — Lower the AI temperature for this feature.** One-line server change in
`AiService.complete` (e.g. `.temperature(0.2)`), or a per-feature param. This is the
highest-leverage remaining fix: it makes the demo **deterministic** (same period →
same text) and makes the word caps + closed-period rules actually stick. Needs a
VALC rebuild (yours to run). I did not change server behavior unprompted.

**P2 — Add a materiality floor.** Stop surfacing £48/£94/$101. Suggest a tunable
constant (skip items below, say, ~£250 / ~$250, or below a % of the period's gross
activity). It's a product call (what's "material" to you) so I left it as a
recommendation; I can wire a named, easily-tuned constant on your word.

**P3 — Lead with the open period + a trend line.** The open period is where action
is possible and where the AHA lives. Suggest: verdict about the open period, then a
one-line **trend** ("Co 00050 has carried an unoffset balance forward 2 periods,
originating with a Jul 30 manual entry"), then at most 1–2 other material items.
Demote/limit closed-period description.

**P4 — Seed the demo data for July 15.** Plant a Cardex break and an Unposted-GL-
batch case (and at least one GL/Var break) so the Analyst tier, the red state, and
the full 6-component taxonomy actually appear. Ties into the existing "sanitize
jdesource-dev + rebuild demo data" queue item.

**P5 — Enforce the verdict word cap structurally.** Even after P1, consider the
Anthropic SDK structured-output / a hard client-side guard (e.g. if a point exceeds
N chars, drop to the data-built fallback line). Belt-and-suspenders for the demo.

**P6 — (Noted, not for tonight) the Admin card.** The orphaned service-health
render JS + its dead CSS (`svc-mem-bar/cap`, the `dc-*`/support-search cluster) are
still in `home.html`; they're harmless (self-guarding) but should be excised when
you do the admin card tomorrow.

---

## Appendix — representative before/after (same Dev data)

**Apr 2, 2016 (the screenshot period)**
- *Before:* verdict adds components ("~£2K carry forward combined with ~£7K
  transactions produced ~£9K"); 2 points incl. "Service is healthy … — Admin";
  Co 00900 point ~40 words.
- *After:* `"Co 00050's ~£9K out-of-balance is driven by transactions; the
  Accountant should likely clear or journal it this period."` (18 words) + one
  13-word Co 00900 point, no service line, no arithmetic.

**Apr 30, 2016 (worst verbosity)**
- *Before:* a single 60-word point tracing the $740 carry forward + a service line.
- *After:* `"Co 00900 carry forward of ~$740 originated in the Apr 2 period from
  unresolved transactions — Accountant."` (17 words). *(Residual: the verdict still
  said "offset them this period" on a closed period — fixed only by P1 temperature.)*

**Reconciled period (e.g. Jan 30, 2016)**
- *Before:* model refuses ("no reconciliation data … cannot triage") → page shows
  "Look first at Service healthy."
- *After:* `{"verdict":"All items reconciled; period is closed.","points":[]}`, or
  the clean fallback "Everything reconciles for Jan 30, 2016."
