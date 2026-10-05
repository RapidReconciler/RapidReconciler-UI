#!/usr/bin/env python3
"""worklist-issues-on-session-delete.py -- PreToolUse hook: sync WORKLIST rows to GitHub issues
before a session is deleted.

Owner ruling 2026-10-05: "This should be run automatically when I ask to delete a session."
Rows filed in a session were reaching GitHub only when someone remembered to run
Tools/worklist-to-issues.py; on 2026-10-05, 13 live rows had no issue (HK-37), so the
Development page and the dev-box runner could not see them.

Wired in ~/.claude/settings.json (user scope, so it fires from any session's working folder):

    PreToolUse  matcher mcp__ccd_session_mgmt__delete_session   (Claude deletes ANOTHER session)
    UserPromptSubmit                                             (the owner ASKS to delete one)

The prompt trigger exists because delete_session refuses the session it runs in, so "delete
this session", the usual ask, never reaches the tool hook (found 2026-10-05, the first live
ask). A prompt that does not ask to delete a session returns at once with no output. When both
fire for one request, the second skips: a sync within 5 minutes is not repeated.

It runs the sync LIVE (the owner authorised it for this event), never blocks the delete, and
reports through BOTH sinks: `systemMessage` (shown to the owner) and `additionalContext` (read
by Claude). The full output is kept in C:/source/repos/worklist-issues-last-sync.log.

It fires only when Claude deletes a session through that tool. A session deleted from the app's
own UI, without asking Claude, does not reach any hook this can register.

    python Tools/worklist-issues-on-session-delete.py --self-test
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SYNC = os.path.join(HERE, "worklist-to-issues.py")
LOG = r"C:\source\repos\worklist-issues-last-sync.log"
TIMEOUT_S = 240


def summarise(output, code):
    """One line from the sync's own output: what it created, updated, closed and refused."""
    created = len(re.findall(r"^\s+\S+\s+->\s+\S+\s+create\b", output, re.M))
    updated = len(re.findall(r"^\s+\S+\s+->\s+\S+\s+update #\d+", output, re.M))
    refused = len(re.findall(r"^\s+REFUSED\b", output, re.M))
    closed = re.search(r"close pass: (\d+) closed", output)
    live = re.search(r"live rows: (\d+)", output)
    if code != 0 or live is None:
        tail = " | ".join(l.strip() for l in output.strip().splitlines()[-3:])
        return False, ("Worklist -> GitHub issue sync FAILED before the delete (exit %s): %s. Full output: %s"
                       % (code, tail or "no output", LOG))
    return True, ("Worklist -> GitHub issues synced before the delete: %s live rows; %d created, %d updated, "
                  "%s closed, %d refused (UI rows: the UI repo is public). Full output: %s"
                  % (live.group(1), created, updated, closed.group(1) if closed else "?", refused, LOG))


# "delete this session", "delete the session", "can you delete these sessions" ...
ASKS_TO_DELETE = re.compile(r"\b(delete|remove)\b[^.\n?!]{0,40}\bsessions?\b", re.I)
RECENT_S = 300


def recently_synced():
    """True when a sync finished within RECENT_S: the prompt hook and the tool hook both fire
    when the owner asks Claude to delete ANOTHER session, and one sync is enough."""
    try:
        return (datetime.now().timestamp() - os.path.getmtime(LOG)) < RECENT_S
    except OSError:
        return False


def run():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception:
        payload = {}
    event = payload.get("hook_event_name") or "PreToolUse"
    if event == "UserPromptSubmit":
        # 2026-10-05: "delete this session" can never reach the tool (delete_session refuses the
        # session it runs in), so the owner's ASK is the trigger. Any other prompt: no output.
        if not ASKS_TO_DELETE.search(payload.get("prompt") or ""):
            return 0
    if recently_synced():
        line = ("Worklist -> GitHub issues: synced less than %d minutes ago, not run again. Last output: %s"
                % (RECENT_S // 60, LOG))
        print(json.dumps({"systemMessage": line,
                          "hookSpecificOutput": {"hookEventName": event, "additionalContext": line}}))
        return 0
    try:
        p = subprocess.run([sys.executable, SYNC], capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=TIMEOUT_S, cwd=os.path.dirname(HERE))
        output, code = (p.stdout or "") + (p.stderr or ""), p.returncode
    except subprocess.TimeoutExpired as e:
        output, code = (e.stdout or "") if isinstance(e.stdout, str) else "", "timeout after %ss" % TIMEOUT_S
    except Exception as e:  # never let the hook itself stop a delete
        output, code = "", "could not start: %s" % e
    try:
        with open(LOG, "w", encoding="utf-8") as f:
            f.write("# %s  exit=%s\n%s" % (datetime.now(timezone.utc).isoformat(), code, output))
    except OSError:
        pass
    ok, line = summarise(output, code)
    print(json.dumps({
        "systemMessage": line,
        "hookSpecificOutput": {"hookEventName": event, "additionalContext": line},
    }))
    return 0


def self_test():
    good = ("live rows: 24; sections: 24; chunks: 20\n"
            "  VLC-135  -> RapidReconciler-Valc     update #338  ['worklist']\n"
            "  VLC-162  -> RapidReconciler-Valc     create       ['worklist']\n"
            "  REFUSED UI-209: no PRIVATE repo for prefix UI\n"
            "close pass: 0 closed, 0 warned (left open)\n")
    ok, line = summarise(good, 0)
    assert ok and "1 created, 1 updated, 0 closed, 1 refused" in line and "24 live rows" in line, line
    # The sync refuses to run on a bad chunk table: exit non-zero, no "live rows" line.
    ok, line = summarise("REFUSING: chunk x names VLC-9, which is not a live row\n", 1)
    assert not ok and "FAILED" in line and "REFUSING" in line, line
    ok, line = summarise("", "timeout after 240s")
    assert not ok and "timeout" in line, line
    for p in ["delete this session", "Delete the session please", "can you delete these sessions?",
              "remove that old session"]:
        assert ASKS_TO_DELETE.search(p), p
    for p in ["commit", "run the live checks", "delete the stale branch", "the session cookie expired",
              "deleted rows. This session went well"]:
        assert not ASKS_TO_DELETE.search(p), p
    print("self-test: 5/5 ok")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if sys.argv[1:] == ["--self-test"] else run())
