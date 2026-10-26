#!/usr/bin/env python
"""Keep WORKLIST.md and its GitHub issues in step without anyone remembering to (HK-47).

WHY. VALC's Development page reads the GitHub issues, and they change only when
Tools/worklist-to-issues.py runs. On 2026-10-26 it had not run since the morning: 17 closes, a batch of
owner rulings and seven merges sat in WORKLIST.md all day while VALC still showed them open and waiting on
the owner. The owner: "We also need to do a better job of keeping the worklist synced with github."

TWO MODES.

  Stop hook (no argument; the harness sends a JSON payload on stdin). Runs the LIVE sync when either
    * WORKLIST.md or WORKLIST-DONE.md changed since the last successful sync (the sync's own state file,
      worklist-sync-state.json, carries their fingerprint), or
    * the last successful sync is more than STALE_MIN minutes old, so a close made with VALC's Close button
      (which only GitHub knows about) reaches WORKLIST.md within the hour.
  Otherwise it does nothing and says nothing. The sync takes its own lock, so two sessions ending a turn at
  once cannot both post; the loser exits 3 and this hook says so and moves on. A FAILED sync (any other
  non-zero exit, or a timeout) blocks the end of the turn ONCE with the reason, so it reaches the model
  rather than a log nobody reads; stop_hook_active stops that from looping.

  --status (SessionStart). One line: when the last sync ran and how it went, whether the worklist changed
  since, and GitHub's open worklist issues against the live rows. Reads only.

Every run's outcome is also written to worklist-sync-hook.json beside the map.

    python Tools/worklist-sync-hook.py --self-test
"""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SYNC = os.path.join(HERE, "worklist-to-issues.py")
STALE_MIN = 60
TIMEOUT_S = 240
_sync_mod = None


def sync_module():
    """worklist-to-issues.py, imported by path for its constants and readers. Import only: no main()."""
    global _sync_mod
    if _sync_mod is None:
        spec = importlib.util.spec_from_file_location("worklist_to_issues", SYNC)
        _sync_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_sync_mod)
    return _sync_mod


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def age_min(iso, now):
    try:
        return (now - datetime.fromisoformat(iso)).total_seconds() / 60
    except (TypeError, ValueError):
        return None


def due(state, fp_now, now):
    """(run?, why). No state, a changed fingerprint, or an old sync: run. Otherwise: don't."""
    if not state:
        return True, "no successful sync recorded yet"
    if state.get("fingerprint") != fp_now:
        return True, "the worklist changed since the last sync"
    a = age_min(state.get("synced_at"), now)
    if a is None or a > STALE_MIN:
        return True, "the last sync is over %d min old (picks up closes made in VALC)" % STALE_MIN
    return False, ""


def tail(text, n=8):
    lines = [l for l in (text or "").splitlines() if l.strip()]
    return "\n".join(lines[-n:])


def summary(state):
    if not state:
        return "synced"
    return ("synced: %s created, %s updated, %s unchanged, %s closed, %s moved from VALC; GitHub open = %s live rows"
            % (state.get("created", "?"), state.get("updated", "?"), state.get("unchanged", "?"),
               state.get("closed", "?"), state.get("moved_from_valc", "?"), state.get("open_issues", "?")))


def stop(payload, run=None, now=None):
    """The Stop hook. Returns (stdout JSON or None, the record written to worklist-sync-hook.json or None)."""
    m = sync_module()
    if (payload or {}).get("stop_hook_active"):
        return None, None
    now = now or datetime.now(timezone.utc)
    go, why = due(read_json(m.STATE_FILE), m.fingerprint(), now)
    if not go:
        return None, None
    run = run or (lambda: subprocess.run([sys.executable, SYNC], capture_output=True, text=True, encoding="utf-8",
                                         errors="replace", timeout=TIMEOUT_S, cwd=HERE,
                                         env=dict(os.environ, PYTHONIOENCODING="utf-8")))
    try:
        r = run()
        code, out = r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        code, out = -1, "the sync did not finish within %d s" % TIMEOUT_S
    record = {"ran_at": now.isoformat(timespec="seconds"), "why": why, "exit": code, "tail": tail(out)}
    if code == 0:
        return {"systemMessage": "Worklist -> GitHub (%s): %s" % (why, summary(read_json(m.STATE_FILE)))}, record
    if code == 3:
        return {"systemMessage": "Worklist -> GitHub: another session's sync is running; the next turn's "
                                 "hook syncs whatever it missed."}, record
    return {"decision": "block",
            "reason": ("The worklist -> GitHub issue sync FAILED (exit %s), so VALC's Development page no longer "
                       "matches WORKLIST.md. Last lines:\n%s\nFix the cause and re-run "
                       "`python Tools/worklist-to-issues.py`, or tell the owner why it cannot be synced now."
                       % (code, tail(out)))}, record


def status(now=None, fetch=None):
    """The SessionStart line. Never raises: a check that cannot run says so."""
    m = sync_module()
    now = now or datetime.now(timezone.utc)
    parts = []
    state, last = read_json(m.STATE_FILE), read_json(os.path.join(m.WORKSPACE, "worklist-sync-hook.json"))
    if state:
        a = age_min(state.get("synced_at"), now)
        parts.append("last good sync %s min ago" % (int(a) if a is not None else "?"))
        try:
            parts.append("worklist %s since" % ("CHANGED" if state.get("fingerprint") != m.fingerprint() else "unchanged"))
        except OSError as e:
            parts.append("worklist not readable (%s)" % e)
    else:
        parts.append("NO successful sync recorded yet")
    if last and last.get("exit") not in (0, None):
        parts.append("the last hook run FAILED (exit %s at %s)" % (last.get("exit"), last.get("ran_at")))
    try:
        live = [r["id"] for r in m.parse(open(m.WORKLIST, encoding="utf-8").read())[0]]
        have = m.open_ids(fetch)
        extra, missing = sorted(set(have) - set(live)), sorted(set(live) - set(have))
        if extra or missing:
            parts.append("DRIFT: GitHub has %d open worklist issues for %d live rows%s%s" % (
                len(have), len(live), "; no issue: " + ", ".join(missing[:6]) if missing else "",
                "; no live row: " + ", ".join(extra[:6]) if extra else ""))
        else:
            parts.append("GitHub open = the %d live rows" % len(live))
    except Exception as e:  # report, never block the session start
        parts.append("GitHub not checked (%s: %s)" % (type(e).__name__, str(e)[:120]))
    return "Worklist <-> GitHub: " + "; ".join(parts) + "."


def main():
    if "--status" in sys.argv:
        print(status())
        return 0
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    out, record = stop(payload)
    if record:
        m = sync_module()
        with contextlib.suppress(OSError):
            with open(os.path.join(m.WORKSPACE, "worklist-sync-hook.json"), "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2)
    if out:
        json.dump(out, sys.stdout)
    return 0


def self_test():
    import tempfile
    from types import SimpleNamespace
    m = sync_module()
    tmp = tempfile.mkdtemp(prefix="sync-hook-test-")
    saved = m.STATE_FILE, m.WORKLIST, m.DONE, m.WORKSPACE
    now = datetime(2026, 10, 26, 21, 0, tzinfo=timezone.utc)
    try:
        m.WORKSPACE = tmp
        m.WORKLIST, m.DONE = os.path.join(tmp, "WORKLIST.md"), os.path.join(tmp, "WORKLIST-DONE.md")
        m.STATE_FILE = os.path.join(tmp, "state.json")
        with open(m.WORKLIST, "w", encoding="utf-8") as f:
            f.write("| ID | Status | What it is | Need from you |\n|---|---|---|---|\n"
                    "| [VLC-1](#vlc-1--a) | ☐ | a | — |\n| [DAC-2](#dac-2--b) | ◐ | b | — |\n")
        with open(m.DONE, "w", encoding="utf-8") as f:
            f.write("### HK-1 — done\n")
        fp = m.fingerprint()
        runs = []

        def fake(code, text="", write_state=None):
            def run():
                runs.append(code)
                if write_state:
                    m.write_state(write_state)
                return SimpleNamespace(returncode=code, stdout=text, stderr="")
            return run

        # 1. Never ran: due. A success reports the counts from the state the sync wrote.
        good = {"synced_at": now.isoformat(), "fingerprint": fp, "created": 1, "updated": 2, "unchanged": 35,
                "closed": 4, "moved_from_valc": 0, "open_issues": 2}
        out, rec = stop({}, run=fake(0, "ok", good), now=now)
        assert runs == [0] and "systemMessage" in out and "2 updated" in out["systemMessage"], out
        assert "no successful sync" in out["systemMessage"] and rec["exit"] == 0, (out, rec)
        # 2. CONTROL: nothing changed and the sync is fresh: no run, no output.
        assert stop({}, run=fake(0), now=now) == (None, None) and runs == [0], "a fresh, unchanged sync must not run"
        # 3. The worklist changed: due.
        with open(m.WORKLIST, "a", encoding="utf-8") as f:
            f.write("\n")
        out, _ = stop({}, run=fake(0, "ok", dict(good, fingerprint=m.fingerprint())), now=now)
        assert runs == [0, 0] and "changed since the last sync" in out["systemMessage"], out
        # 4. Unchanged but over STALE_MIN old: due (VALC closes reach the worklist within the hour).
        later = datetime(2026, 10, 26, 22, 30, tzinfo=timezone.utc)
        out, _ = stop({}, run=fake(0, "ok", dict(good, fingerprint=m.fingerprint(), synced_at=later.isoformat())),
                      now=later.replace(hour=23, minute=45))
        assert runs[-1] == 0 and "over 60 min old" in out["systemMessage"], out
        # 5. A failure BLOCKS once, with the sync's last lines; stop_hook_active stops the loop.
        with open(m.WORKLIST, "a", encoding="utf-8") as f:
            f.write("\n")
        out, rec = stop({}, run=fake(4, "VERIFY FAILED: live rows with NO open issue: VLC-1"), now=now)
        assert out["decision"] == "block" and "VERIFY FAILED" in out["reason"] and rec["exit"] == 4, out
        n = len(runs)
        assert stop({"stop_hook_active": True}, run=fake(4), now=now) == (None, None) and len(runs) == n, \
            "a hook already continuing from a block must not run or block again"
        # 6. Another session holds the lock: said, not blocked.
        out, _ = stop({}, run=fake(3, "LOCKED: another live sync holds it"), now=now)
        assert "another session's sync" in out["systemMessage"] and "decision" not in out, out
        # 7. A timeout is a failure, blocked with its own reason.
        def hang():
            raise subprocess.TimeoutExpired("sync", TIMEOUT_S)
        out, rec = stop({}, run=hang, now=now)
        assert out["decision"] == "block" and "did not finish" in out["reason"] and rec["exit"] == -1, out
        # 8. --status: agreement, drift both ways, and a GitHub read that fails.
        m.write_state(dict(good, fingerprint=m.fingerprint(), synced_at=now.isoformat()))
        lab = lambda *n: [{"name": x} for x in n]
        world = {"RapidReconciler-Valc": [{"number": 7, "title": "[VLC-1] a", "labels": lab("worklist")}],
                 "RapidReconciler-DB": [{"number": 8, "title": "[DAC-2] b", "labels": lab("worklist")}],
                 "RapidReconciler-SSIS": []}
        line = status(now, fetch=world.get)
        assert "GitHub open = the 2 live rows" in line and "unchanged since" in line and "0 min ago" in line, line
        world["RapidReconciler-DB"] = [{"number": 9, "title": "[DAC-9] gone", "labels": lab("worklist")}]
        line = status(now, fetch=world.get)
        assert "DRIFT" in line and "no issue: DAC-2" in line and "no live row: DAC-9" in line, line

        def down(repo):
            raise RuntimeError("gh: HTTP 503")
        line = status(now, fetch=down)
        assert "GitHub not checked (RuntimeError: gh: HTTP 503)" in line, line
        os.remove(m.STATE_FILE)
        assert "NO successful sync recorded yet" in status(now, fetch=world.get)
    finally:
        m.STATE_FILE, m.WORKLIST, m.DONE, m.WORKSPACE = saved
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    print("self-test OK (first run, unchanged control quiet, changed, stale, failure blocks once, "
          "stop_hook_active, lock held, timeout; status agrees, drifts both ways, GitHub down)")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        sys.exit(0)
    try:
        sys.exit(main())
    except Exception as e:  # a broken hook must say so, not die silently
        print(json.dumps({"systemMessage": "worklist-sync-hook.py crashed: %s: %s" % (type(e).__name__, e)}))
        sys.exit(0)
