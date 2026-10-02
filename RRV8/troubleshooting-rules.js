/* ============================================================================
   RRV8.troubleshooting — what V8 says about one GET admin/troubleshooting read
   (UI-209).

   ONE producer for the verdict. admin-troubleshooting.html renders these rows,
   and Home's Troubleshooting card rolls the same rows up into its dots, so the
   card can never say "working" about a database the page calls failing.

   A row is { area, key, label, state, fact, todo, tech }:
     state  ok | warn | fail | unknown
     fact   what was found, in finance language (agent text is escaped by the
            renderer, never trusted as markup)
     todo   what the administrator does; this file's own copy, may carry <b>
     tech   the technical line, for the downloaded diagnostics only

   VOICE (feedback_rr_product_voice): V8 readers are finance, so no SQL object
   names; and every escalation goes to the customer's OWN IT department, never
   to GSI (owner rule 2026-07-21). GSI appears only as a place the server
   connects to.

   The RULES behind the agent's facts are VALC's (ported agent-side in
   TroubleshootingService); the reconcile verdict below follows VALC's
   DatabaseHealthService.systemStatusRule order: a failed scheduled run first,
   then open log errors.

   Tested by Tools/test-troubleshooting-rules.js, which loads this file as-is.
   ============================================================================ */
(function (global) {
  'use strict';

  var IT = 'your IT department';
  var RANK = { fail: 0, warn: 1, unknown: 2, ok: 3 };
  var AREAS = ['Connections', 'Data loads', 'Database server'];

  // The agent sends SQL Server's own local times as text ("2026-09-30 15:00:27.396",
  // "2026-07-12 22:43:56"). Shown in that clock as written: converting through the
  // browser's time zone would invent an offset nobody measured.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtWhen(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''));
    if (!m) return s ? String(s) : '';
    var h = +m[4], ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] + ', ' + h + ':' + m[5] + ' ' + ap;
  }
  function fmtMinutes(sec) {
    if (sec == null || isNaN(sec)) return '';
    var min = Math.round(sec / 60);
    return min < 1 ? 'under a minute' : (min === 1 ? '1 minute' : min + ' minutes');
  }

  function stateOf(agentStatus) {
    return agentStatus === 'ok' ? 'ok' : agentStatus === 'fail' ? 'fail' : agentStatus === 'warning' ? 'warn' : 'unknown';
  }
  function checkByName(data, name) {
    var list = (data && data.checks) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].name === name) return list[i];
    return null;
  }
  function assign(base, more) { for (var k in more) if (Object.prototype.hasOwnProperty.call(more, k)) base[k] = more[k]; return base; }

  function rowFromCheck(data, area, name, label, words) {
    var c = checkByName(data, name);
    if (!c) {
      return { area: area, key: name, label: label, state: 'unknown', fact: 'This check did not run.',
        todo: 'Run the checks again. If this row stays empty, the RapidReconciler server may need updating; ' + IT + ' can tell from the downloaded diagnostics.',
        tech: 'No ' + name + ' in the response.' };
    }
    var state = stateOf(c.status);
    var w = words(state, c) || {};
    return { area: area, key: name, label: label, state: state,
      fact: w.fact != null ? w.fact : (c.text || ''),
      todo: state === 'ok' ? '' : (w.todo || ''),
      tech: [c.text, c.detail].filter(Boolean).join(' — ') };
  }

  function connectionRows(data, ms) {
    return [
      { area: 'Connections', key: 'browser', label: 'This computer to the server', state: 'ok',
        fact: 'Reached the RapidReconciler server in ' + ms + ' ms.', todo: '', tech: 'Browser round trip for this read: ' + ms + ' ms.' },
      rowFromCheck(data, 'Connections', 'sql.reachable', 'Server to its database', function (state) {
        return state === 'ok' ? { fact: 'Connected.' }
          : { todo: 'Ask ' + IT + ' to check that SQL Server is running on the database server and accepts connections from the RapidReconciler server.' };
      }),
      rowFromCheck(data, 'Connections', 'valc.reachable', 'Server to GSI', function (state) {
        if (state === 'ok') return { fact: 'Connected to GSI’s sign-in and licensing service.' };
        if (state === 'fail') return { todo: 'Ask ' + IT + ' to allow outbound HTTPS (port 443) from the RapidReconciler server to GSI. The downloaded diagnostics have the address and the error.' };
        return { todo: 'Run the checks again in a few minutes. If this stays amber, give the downloaded diagnostics to ' + IT + '.' };
      })
    ];
  }

  function refreshRow(data) {
    return rowFromCheck(data, 'Data loads', 'sql.last_job_status', 'Nightly data refresh', function (state, c) {
      if (state === 'ok') return {};
      if (state === 'fail') return { todo: 'Ask ' + IT + ' to open the refresh job’s history in SQL Server Agent on the database server. The step that failed names the cause.' };
      // The two amber cases are told apart by the agent's own sentence
      // (InstallDiagnosticsCollector.lastRefreshRule: "...has not run since." for a
      // missed night, "...it usually takes about N." for an overlong run). Change
      // those words there and the advice here falls through to the generic line.
      var text = String(c.text || '');
      if (/has not run since/i.test(text)) return { todo: 'Check <b>SQL Server Agent</b> below first. If it is running, ask ' + IT + ' to check that the RapidReconciler refresh job is enabled and scheduled.' };
      if (/usually takes/i.test(text)) return { todo: 'If it is still running in an hour, ask ' + IT + ' to check the database server for a blocked job.' };
      return { todo: 'Ask ' + IT + ' to confirm the RapidReconciler refresh job has run on the database server.' };
    });
  }

  function importRow(data) {
    var s = (data && data.ssis) || {};
    var base = { area: 'Data loads', key: 'ssis', label: 'JD Edwards import' };
    var tech = [s.reason, s.executionId != null ? 'execution ' + s.executionId : '', s.status,
      s.startTime ? 'started ' + s.startTime : '', s.endTime ? 'ended ' + s.endTime : ''].filter(Boolean).join(' · ');
    if (!s.readable) return assign(base, { state: 'unknown', fact: 'Couldn’t read the import history.', todo: 'Give the downloaded diagnostics to ' + IT + '; they say why the history could not be read.', tech: tech });
    if (s.executionId == null) return assign(base, { state: 'warn', fact: 'No JD Edwards import has run for this database yet.', todo: 'Ask ' + IT + ' to check that the RapidReconciler import is deployed and scheduled on the database server.', tech: tech || 'No catalog execution for this database.' });
    var st = String(s.status || '');
    if (/^(failed|ended unexpectedly)$/i.test(st)) return assign(base, { state: 'fail', fact: 'The last import, started ' + fmtWhen(s.startTime) + ', failed.', todo: 'Give the downloaded diagnostics to ' + IT + '. They list the errors the import recorded.', tech: tech });
    if (/^cancel/i.test(st)) return assign(base, { state: 'warn', fact: 'The last import, started ' + fmtWhen(s.startTime) + ', was cancelled before it finished.', todo: 'The next nightly refresh runs it again. If imports keep stopping, give the downloaded diagnostics to ' + IT + '.', tech: tech });
    if (/^(running|created|pending|stopping)$/i.test(st)) return assign(base, { state: 'ok', fact: 'An import is running now (started ' + fmtWhen(s.startTime) + ').', todo: '', tech: tech });
    if (/^(succeeded|completed)$/i.test(st)) {
      var took = fmtMinutes(s.durationSeconds);
      return assign(base, { state: 'ok', fact: 'The last import finished ' + fmtWhen(s.endTime) + (took ? ' and took ' + took : '') + '.', todo: '', tech: tech });
    }
    return assign(base, { state: 'unknown', fact: 'The last import reads “' + st + '”.', todo: 'Give the downloaded diagnostics to ' + IT + '.', tech: tech });
  }

  function scheduledText(sch) {
    if (!sch) return '';
    if (sch.error) return 'Scheduled run unreadable: ' + sch.error;
    if (sch.kind === 'RUN') return 'Last scheduled run ' + (sch.runAt || '') + ', SQL Agent status ' + sch.runStatus + (sch.firstError ? ': ' + sch.firstError : '');
    return sch.kind ? 'Scheduled run: ' + sch.kind + (sch.job ? ' (' + sch.job + (sch.step ? ', ' + sch.step : '') + ')' : '') : '';
  }

  function reconcileRow(data) {
    var r = (data && data.reconcile) || {};
    var sch = r.scheduled || {};
    var errs = Array.isArray(r.currentErrors) ? r.currentErrors : [];
    var base = { area: 'Data loads', key: 'reconcile', label: 'Reconciliation run' };
    var tech = [r.reason, errs.length + ' open error row(s), ' + (r.resolvedErrors || 0) + ' cleared by a later run', scheduledText(sch)].filter(Boolean).join(' · ');
    if (!r.readable) return assign(base, { state: 'unknown', fact: 'Couldn’t read the reconciliation log.', todo: 'Give the downloaded diagnostics to ' + IT + '; they say why the log could not be read.', tech: tech });
    // DAC-82, as VALC rules it: SQL Agent fails a step on an error the batch survived,
    // so a failed SCHEDULED run outranks a log that reads clean.
    if (sch.kind === 'RUN' && sch.runStatus === 0) return assign(base, { state: 'fail', fact: 'The last scheduled reconciliation, ' + fmtWhen(sch.runAt) + ', stopped on an error.', todo: 'Give the downloaded diagnostics to ' + IT + '. They include the error SQL Server recorded.', tech: tech });
    if (errs.length) {
      var newest = errs[0] && errs[0].startTime;
      return assign(base, { state: 'warn',
        fact: errs.length === 1 ? 'The reconciliation reported an error that no later run has cleared (' + fmtWhen(newest) + ').'
                                : 'The reconciliation reported ' + errs.length + ' errors that no later run has cleared (newest ' + fmtWhen(newest) + ').',
        todo: 'Give the downloaded diagnostics to ' + IT + '. They list each error and the step it came from.', tech: tech });
    }
    if (!r.lastCompleted) return assign(base, { state: 'warn', fact: 'No reconciliation run has finished on this database yet.', todo: 'The first run follows the first data refresh. If the refresh has run and this stays amber, give the downloaded diagnostics to ' + IT + '.', tech: tech });
    return assign(base, { state: 'ok', fact: 'The last run finished ' + fmtWhen(r.lastCompleted) + '.', todo: '', tech: tech });
  }

  function serverRows(data) {
    return [
      rowFromCheck(data, 'Database server', 'sql.agent_service', 'SQL Server Agent', function (state) {
        return state === 'fail'
          ? { todo: 'Ask ' + IT + ' to start the SQL Server Agent service on the database server and set it to start automatically. The nightly refresh needs it.' }
          : { todo: 'Ask ' + IT + ' to set the SQL Server Agent service to start automatically, so a server restart doesn’t stop the nightly refresh.' };
      }),
      rowFromCheck(data, 'Database server', 'sql.disk_free_mb', 'Data drive space', function () {
        return { todo: 'Ask ' + IT + ' to free up space on the database server’s data drive, or extend it.' };
      }),
      rowFromCheck(data, 'Database server', 'sql.jde_job_present', 'Refresh job', function (state) {
        return state === 'ok' ? { fact: 'The nightly refresh job is set up.' }
          : { fact: 'The nightly refresh job isn’t set up on the database server.', todo: 'Ask ' + IT + ' to check the RapidReconciler refresh job in SQL Server Agent on the database server.' };
      })
    ];
  }

  /** Every row, in display order, grouped by area. `ms` is the browser's round trip for the read. */
  function rows(data, ms) {
    return connectionRows(data, ms).concat([refreshRow(data), importRow(data), reconcileRow(data)], serverRows(data));
  }

  /** The worst state among `list` (ok when empty). */
  function worst(list) {
    var w = 'ok';
    for (var i = 0; i < (list || []).length; i++) if (RANK[list[i].state] < RANK[w]) w = list[i].state;
    return w;
  }

  /** Per-area roll-up for Home's card: [{ area, state, needs }] in display order. */
  function byArea(list) {
    return AREAS.map(function (a) {
      var mine = (list || []).filter(function (r) { return r.area === a; });
      return { area: a, state: worst(mine), needs: mine.filter(function (r) { return r.state !== 'ok'; }).length };
    });
  }

  global.RRV8 = global.RRV8 || {};
  global.RRV8.troubleshooting = {
    rows: rows, worst: worst, byArea: byArea, fmtWhen: fmtWhen, scheduledText: scheduledText,
    RANK: RANK, AREAS: AREAS, IT: IT
  };
})(typeof window !== 'undefined' ? window : this);
