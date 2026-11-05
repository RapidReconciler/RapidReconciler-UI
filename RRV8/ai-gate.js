/* ai-gate.js -- THE ONE PRODUCER for every AI call a V8 page makes (UI-240 slice 2).
 *
 *   <script src="config.js"></script>
 *   <script src="ai-gate.js"></script>          NOT deferred: a page builds its gate at load
 *
 *   var gate = RRV8.aiGate({
 *     fetch:    rrFetch,          // the page's VALC-aware fetch: (area, opts) -> Promise
 *     activeDb: activeDb,         // () -> the active database claim object ({ n, uuid, ... })
 *     level:    _recsummaryLevel  // optional: (feature) -> tier; default RRAI.get(feature) || 'full'
 *   });
 *   gate.explain(prompt, { feature: 'ask' }).then(function (r) { ... });
 *
 * WHY THIS IS A FILE. Home held this block inline (aiHealth, the off-state sentences, aiOffWhy, aiExplain).
 * RRV8/transit.html needs the same gate, and a second copy would be a second producer for the tier check,
 * the configured-state check and every off-state sentence: two readers of one setting, free to disagree,
 * which is the shape VLC-63 increment 2 was opened to remove. So the code moved here unchanged, with its
 * comments, and Home keeps every function name it had as a one-line delegate.
 *
 * The page's own helpers arrive through `env` rather than being read as globals, because each page declares
 * them inside its own IIFE. A gate is built once per page; its health cache belongs to that gate and is keyed
 * by active database exactly as Home's was.
 *
 * Tools/test-ai-explain-gate.js, test-ai-feature-levels.js, test-ai-plan-cap.js, test-ai-plan-tier.js and
 * test-ai-what-was-sent.js run THIS file, wired through Home's delegates, and their mutation arms mutate it.
 */
(function () {
  'use strict';

  window.RRV8 = window.RRV8 || {};

  // VLC-63, 2026-09-16. ONE producer for the destination name and one for the band's
  // off-state sentence, declared above every reader. Before this there were THREE
  // wordings for one state on the analyst Home and two of them named a page that does
  // not exist: ":6675 said "the AI panel", `:17172` said "AI settings", and
  // admin-claude-assistant.html's own <h1> and <title> both say "AI Assistant".
  var AI_OFF_WHERE = 'AI Assistant';
  // VLC-186: the sentence for a database whose PLAN has no AI (VALC's AI_NOT_IN_PLAN says the same).
  var AI_NOT_IN_PLAN = 'The AI assistant is not part of this RapidReconciler plan. To add it, contact rrsupport@getgsi.com.';
  var AI_OFF_LEAD_NOTE = 'AI is off for this database — this line is computed from '
                       + 'your data, not written by the AI.';

  window.RRV8.aiGate = function (env) {
    env = env || {};

    // Named `rrFetch` on purpose, and only a pass-through to env.fetch. Tools/v8-callsites.py enumerates
    // call sites by name and skips member calls such as `env.fetch(...)`, so calling env.fetch directly
    // would hide both AI routes from the call-surface gate (A3 would report their literals as orphans) and
    // leave the `_aiExUrl` hand resolution matching nothing (A2b). Under this name the two calls below are
    // ordinary rrFetch sites: the health call resolves from its literal, the explain call from
    // `ai-gate.js::_aiExUrl` in Tools/v8-callsite-overrides.json.
    function rrFetch(area, opts) { return env.fetch(area, opts); }

    // The tier for a feature. Optional in env; the default is Home's _recsummaryLevel() behaviour:
    // RRAI.get(feature), else 'full' (with no RRAI at all, VALC still refuses anything above the feature's level).
    var level = (typeof env.level === 'function') ? env.level : function (feature) {
      try {
        if (window.RRAI) { var g = window.RRAI.get(feature); if (g) return g; }
      } catch (_) {}
      return 'full';
    };

    // ── AI availability, resolved ONCE for the whole page ──────────────────────
    //
    // VLC-63 increment 2. `api/v1/ai/health` returns three fields -- configured,
    // model, maxLevel -- and until now the ONLY reader was loadAiPlan(), which
    // writes the admin chip and returns on its first line when #aiPlanTierLabel is
    // absent. That element lives inside the admin view, which is DETACHED from the
    // DOM for every other role (see _adminViewAnchor). So on an analyst's or an
    // accountant's Home the health call never fired and `configured` was unknown.
    //
    // That is why the owner's ruling -- "stay visible and say why it is
    // unavailable" -- could not be honoured before this: the page had no way to
    // know a server had the assistant switched off.
    //
    // ONE fetch, cached as a promise so N call sites share it rather than each
    // asking. Calling it for every role is safe and was established by reading the
    // chain rather than hoping: /api/v1/ai/** is matched by neither the tenant nor
    // the admin rule in SecurityConfig, so it falls to .anyRequest().authenticated()
    // which a V8 token's ROLE_USER satisfies, and AiController.maxLevelForDb is a
    // pure lookup by database name with no caller identity in it.
    //
    // ⚠ Keyed by ACTIVE DATABASE. Switching databases can switch plans, so the
    // cache is per-db and the page's resetScopedState clears it (Home: _aiHealthReset).
    var _aiHealthCache = {};
    function aiHealth() {
      var dbn = (env.activeDb() && env.activeDb().n) || '';
      if (_aiHealthCache[dbn]) return _aiHealthCache[dbn];
      // A failed health call resolves to UNKNOWN rather than rejecting. An
      // unreachable health endpoint must not be reported to the customer as "your
      // AI is switched off" -- those are different facts and only one of them is
      // actionable by GSI.
      // VLC-234: the uuid too, so VALC answers with this database's feature levels (a name is not a key).
      var _hq = {};
      if (dbn) _hq.db = dbn;
      var _hu = (env.activeDb() && env.activeDb().uuid) ? String(env.activeDb().uuid) : '';
      if (_hu) _hq.database = _hu;
      _aiHealthCache[dbn] = rrFetch('api/v1/ai/health', (dbn || _hu) ? { query: _hq } : undefined)
        .then(function (r) {
          // VLC-186: the same read feeds the tier cap, so the plan chip and the cap cannot disagree.
          if (r && r.maxLevel && window.RRAI && RRAI.setPlan) RRAI.setPlan(dbn, r.maxLevel);
          if (r && r.features && window.RRAI && RRAI.setFeatures) RRAI.setFeatures(dbn, r.features);
          return { configured: !(r && r.configured === false),
                   maxLevel: (r && r.maxLevel) || 'off', known: true };
        })
        .catch(function () { return { configured: true, maxLevel: '', known: false }; });
      return _aiHealthCache[dbn];
    }
    function _aiHealthReset() { _aiHealthCache = {}; }

    // ── THE ONE PRODUCER FOR AN AI EXPLAIN CALL ────────────────────────────────
    //
    // Ten call sites POSTed to api/v1/ai/explain directly, and each had to
    // remember the tier check for itself. Measured 2026-09-15: three did it
    // in-function, one was guarded by its caller, and six had no guard on at least
    // one reachable path -- so with AI switched Off, six surfaces still called out.
    //
    // Resolves to a RESULT OBJECT, never rejects for an unavailable reason:
    //
    //   { ok: true,  text: '...' }
    //   { ok: false, reason: 'tier-off'       , why: <sentence> }
    //   { ok: false, reason: 'not-configured' , why: <sentence> }
    //   { ok: false, reason: 'error'          , why: <sentence> }
    //
    // ⛔ OWNER RULING 2026-09-15: DO NOT SELF-SUPPRESS. The affordance stays
    // visible and says why. The two off-states are different facts and the UI must
    // not merge them -- `tier-off` is the user's own choice at the sidebar AI dock
    // and reads as reversible; `not-configured` is GSI-side and the customer
    // cannot act on it, so it has to name the reason. Hiding a feature the
    // customer is paying for reads as a missing feature and tells nobody who to
    // ask. `why` is the sink for that reason: it is a sentence meant to be
    // RENDERED, not logged.
    //
    // VLC-234: the sentence for a feature the customer's administrator turned off. VALC's
    // AiController.featureSentence says the same for a call it refuses.
    function aiFeatureOffSentence(feature) {
      var name = (window.RRAI && RRAI.FEATURE_NAMES && RRAI.FEATURE_NAMES[feature]) || 'This AI feature';
      return name + ' is turned off for this database. A RapidReconciler administrator can turn it on in ' + AI_OFF_WHERE + '.';
    }
    // Why a feature's level is Off, as { reason, why }. ONE producer for the three Off facts, because they are
    // different facts and each names a different person who can change it:
    //   not-in-plan -- the purchased plan has no AI (VLC-186); GSI changes it.
    //   feature-off -- the customer's administrator set this feature Off (VLC-234); they change it in AI Assistant.
    //   tier-off    -- this browser's own choice, on the non-production AI dock; the reader changes it.
    function aiOffWhy(feature) {
      if (window.RRAI && RRAI.plan && RRAI.plan() === 'off') return { reason: 'not-in-plan', why: AI_NOT_IN_PLAN };
      if (window.RRAI && RRAI.featureOff && RRAI.featureOff(feature)) {
        return { reason: 'feature-off', why: aiFeatureOffSentence(feature) };
      }
      // ⚠ "the AI panel" NAMED NOWHERE. VLC-63, 2026-09-16: the page's own <h1> and <title> are "AI Assistant", and
      // the other off-state sentence on Home said "AI settings", so BOTH wordings sent the reader somewhere that does
      // not exist under that name. Destination comes from AI_OFF_WHERE, one producer.
      return { reason: 'tier-off', why: 'AI is switched off for this session. Turn it on in ' + AI_OFF_WHERE + ' to get a read on this.' };
    }
    function aiExplain(prompt, opts) {
      opts = opts || {};
      // VLC-234: every call names its feature, and the level comes from that feature. A caller that names none is a
      // defect in this page, so it is reported where the answer would have gone instead of silently using the plan.
      var feature = opts.feature;
      if (!feature || !(window.RRAI && RRAI.FEATURES && RRAI.FEATURES.indexOf(feature) >= 0)) {
        return Promise.resolve({ ok: false, reason: 'error',
          why: 'This part of the page did not say which AI feature it belongs to, so nothing was sent.' });
      }
      var lvl = level(feature);
      if (lvl === 'off') {
        var off = aiOffWhy(feature);
        return Promise.resolve({ ok: false, reason: off.reason, why: off.why });
      }
      return aiHealth().then(function (h) {
        if (!h.configured) {
          return { ok: false, reason: 'not-configured',
            why: 'The AI assistant is not switched on for this installation. Contact GSI support to enable it.' };
        }
        // Named `_aiExUrl`, not `url`. v8-callsites.py keys its hand resolutions on
        // "<file>::<identifier>" precisely so the entry survives edits and fails
        // loudly on a rename -- a generic `url` would be a key that means nothing
        // and could collide with the next dynamic site added to this file.
        var _aiExUrl = 'api/v1/ai/explain' + (opts.ctx ? ('?ctx=' + opts.ctx) : '');
        // VLC-186: declare the tier the prompt was built (and masked) with; VALC refuses one above the plan.
        // VLC-234: and the feature and database, from RRAI.declare(), the one producer of those fields.
        var body = RRAI.declare(feature);
        body.prompt = prompt;
        body.level = lvl;
        if (opts.system) body.system = opts.system;
        return rrFetch(_aiExUrl, { method: 'POST', body: body }).then(function (r) {
          var txt = (r && r.text) ? String(r.text).trim() : '';
          // UI-255: `prompt` rides with the answer so its renderer can show what was sent for it
          // (RRAI.showSent looks the posted body up by this exact string; nothing rebuilds it).
          return txt ? { ok: true, text: txt, prompt: prompt }
                     : { ok: false, reason: 'error', why: 'The AI did not return a reading for this.' };
        }).catch(function (err) {
          // VLC-183: a slow answer says so. VLC-186: a plan refusal says why, in VALC's words.
          // `reason` stays 'error' because callers branch on it; only the sentence they show changes.
          return { ok: false, reason: 'error',
                   why: (window.RRV8 && RRV8.aiTimeout && RRV8.aiTimeout(err))
                     || (window.RRV8 && RRV8.aiRefusal && RRV8.aiRefusal(err))
                     || 'The AI could not be reached just now.' };
        });
      });
    }

    return {
      AI_OFF_WHERE: AI_OFF_WHERE,
      AI_NOT_IN_PLAN: AI_NOT_IN_PLAN,
      AI_OFF_LEAD_NOTE: AI_OFF_LEAD_NOTE,
      health: aiHealth,
      resetHealth: _aiHealthReset,
      featureOffSentence: aiFeatureOffSentence,
      offWhy: aiOffWhy,
      explain: aiExplain
    };
  };
})();
