#!/usr/bin/env python3
"""orphan-processes.py -- flag long-lived helper processes that are burning CPU.

    python Tools/orphan-processes.py              # the check (SessionStart hook)
    python Tools/orphan-processes.py --self-test  # proves it catches a real one
    python Tools/orphan-processes.py --watchdog-only [--watchdog-status PATH]

THE NORMAL RUN ALSO REPORTS THE DEV-BOX WATCHDOG (HK-26). The watchdog task
(RapidReconciler-Valc/setup/dev-box-watchdog/) writes
C:/ProgramData/RR-DevWatchdog/state/watchdog-status.json every 5 minutes. This prints a
`!!` line for every incident it has open, for every recovery it performed in
the last 24 hours, and -- the case that matters most -- when the last pass is
older than 20 minutes, because then nothing is watching the box at all.

The watchdog does NOT run this file. It runs as SYSTEM, and SYSTEM must never
execute anything a non-admin account can edit (owner ruling 2026-09-25), so it
carries its own PowerShell port of the rule below. Change the rule here and
change Get-OrphanProcesses in watchdog.ps1 to match.

WHY THIS EXISTS. On 2026-09-24 this box stopped taking RDP and had to be
rebooted from the Azure portal. The cause was a python.exe an earlier session
started on 2026-09-22 15:30 -- a script fed on stdin against dashboard.html
lines 8112-8191 -- that never exited. It spent ~50 hours at a full core. Two
full Valc test runs went red with Postgres connection timeouts in DIFFERENT
tests each time, a single-file grep timed out at 20s, and nothing anywhere
said why. The process was only found by sorting Get-Process by CPU by hand.

WHAT IT FLAGS. A python / node / powershell / pwsh process that is at least
--min-age minutes old AND is busy: either it used >= --min-cpu percent of one
core over a short sample, or it averaged that much over its whole life. Age
alone is not a finding (a persistent shell idles for hours), and CPU alone is
not one either (a build is busy for a few minutes). Both together is the shape
of the 09-24 process.

IT DOES NOT KILL ANYTHING. A process one session thinks is orphaned may be
another session's live work, and stopping it is the owner's call. It prints
the PID, age, CPU, parent and command line, and the stop command to run.

A ZERO IS NOT A RESULT (hard rule 4). "Nothing flagged" is only believable if
the scan saw processes at all, so every run reports how many it examined. The
scan always sees at least one: the python.exe running this file.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

NAMES = ("python.exe", "pythonw.exe", "node.exe", "powershell.exe", "pwsh.exe")
MIN_AGE_MIN = 60
MIN_CPU_PCT = 20.0
SAMPLE_S = 2

# One PowerShell call takes both samples, so the interval is measured by the
# same clock that stamps the CPU counters. CreationDate is emitted as ISO UTC:
# PS 5.1's ConvertTo-Json would otherwise write "/Date(...)/".
_PS = r"""
$names = @(%NAMES%)
function Snap {
  Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name.ToLower() } |
    ForEach-Object { [pscustomobject]@{
      Id = $_.ProcessId; ParentId = $_.ParentProcessId; Name = $_.Name
      Created = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }
      Cpu100ns = [int64]$_.KernelModeTime + [int64]$_.UserModeTime
      Cmd = $_.CommandLine } }
}
$a = @(Snap); $t0 = [DateTime]::UtcNow
Start-Sleep -Seconds %SAMPLE%
$b = @(Snap); $t1 = [DateTime]::UtcNow
$parents = @{}
Get-CimInstance Win32_Process | ForEach-Object { $parents[[string]$_.ProcessId] = $_.Name }   # PS 5.1 JSON: keys must be strings
[pscustomobject]@{ A = $a; B = $b; Seconds = ($t1 - $t0).TotalSeconds
                   Now = $t1.ToString('o'); Parents = $parents } | ConvertTo-Json -Depth 4 -Compress
"""


def _parse_iso(s):
    # .NET 'o' gives 7 fractional digits; Python's fromisoformat wants <= 6.
    if not s:
        return None
    head, _, frac = s.partition(".")
    if frac:
        digits = "".join(ch for ch in frac if ch.isdigit())[:6]
        tz = frac[len("".join(ch for ch in frac if ch.isdigit())):]
        s = head + "." + digits + tz
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def scan(min_age_min=MIN_AGE_MIN, min_cpu_pct=MIN_CPU_PCT, sample_s=SAMPLE_S):
    ps = (_PS.replace("%NAMES%", ",".join("'%s'" % n for n in NAMES))
             .replace("%SAMPLE%", str(sample_s)))
    out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                         capture_output=True, text=True, timeout=60)
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError("process query failed (exit %s): %s"
                           % (out.returncode, (out.stderr or "").strip()[:300]))
    data = json.loads(out.stdout)
    before = {p["Id"]: p for p in (data.get("A") or [])}
    after = data.get("B") or []
    seconds = float(data.get("Seconds") or sample_s) or sample_s
    now = _parse_iso(data["Now"])
    parents = data.get("Parents") or {}

    flagged = []
    for p in after:
        created = _parse_iso(p.get("Created"))
        if created is None:
            continue
        age_s = max((now - created).total_seconds(), 1.0)
        prev = before.get(p["Id"])
        sampled = (100.0 * (p["Cpu100ns"] - prev["Cpu100ns"]) / 1e7 / seconds) if prev else 0.0
        lifetime = 100.0 * p["Cpu100ns"] / 1e7 / age_s
        if age_s >= min_age_min * 60 and max(sampled, lifetime) >= min_cpu_pct:
            flagged.append({
                "pid": p["Id"], "name": p["Name"], "age_h": age_s / 3600,
                "created": created, "sampled": sampled, "lifetime": lifetime,
                "cpu_h": p["Cpu100ns"] / 1e7 / 3600,
                "parent": "%s (%s)" % (p["ParentId"], parents.get(str(p["ParentId"]), "not running")),
                "cmd": (p.get("Cmd") or "(command line not readable)").strip(),
            })
    return len(after), flagged


def report(examined, flagged):
    if not flagged:
        print("Orphan-process check: %d helper process(es) examined (%s), none older than %d min "
              "and busy. (The count includes this check's own python.exe, so a 0 would mean "
              "the scan is broken.)" % (examined, "/".join(NAMES), MIN_AGE_MIN))
        return
    print("!! ORPHAN-PROCESS CHECK: %d long-lived helper process(es) are burning CPU." % len(flagged))
    print("!! Tell the owner BEFORE doing anything else, and do not kill one without asking:")
    print("!! it may be another session's live work. On 2026-09-24 one of these took the box down.")
    for f in flagged:
        print("  PID %d  %s  started %s UTC (%.1fh ago)  CPU now %.0f%% of a core, lifetime avg %.0f%%, "
              "%.1f CPU-hours" % (f["pid"], f["name"], f["created"].strftime("%Y-%m-%d %H:%M"),
                                   f["age_h"], f["sampled"], f["lifetime"], f["cpu_h"]))
        print("      parent %s" % f["parent"])
        print("      cmd    %s" % (f["cmd"][:240] + ("..." if len(f["cmd"]) > 240 else "")))
        print("      stop   Stop-Process -Id %d   (owner's call)" % f["pid"])


def self_test():
    """Spawn a real busy python child and require the scan to flag it.

    A check that has only ever run on a clean box is untested: every run would
    print 'none flagged' whether the detection works or not."""
    busy = subprocess.Popen([sys.executable, "-c", "while True: pass"])
    try:
        time.sleep(1.5)
        examined, flagged = scan(min_age_min=0, min_cpu_pct=MIN_CPU_PCT)
        caught = [f for f in flagged if f["pid"] == busy.pid]
        assert examined >= 2, "scan saw %d processes; it should see at least itself and the child" % examined
        assert caught, "a busy child (PID %d) was NOT flagged; flagged=%s" % (busy.pid, [f["pid"] for f in flagged])
        assert caught[0]["sampled"] >= MIN_CPU_PCT, "child sampled at %.1f%%" % caught[0]["sampled"]
        # Control: the same busy child must NOT be flagged at the real age
        # threshold, or the age gate is not doing anything.
        _, at_real_age = scan()
        assert busy.pid not in [f["pid"] for f in at_real_age], "a 2-second-old process passed the age gate"
    finally:
        busy.kill()
        busy.wait()
    print("self-test OK: busy child PID %d flagged at min-age 0 (%.0f%% of a core), "
          "and not flagged at min-age %d" % (busy.pid, caught[0]["sampled"], MIN_AGE_MIN))


# Inside the folder install-watchdog.ps1 locks (SYSTEM + Administrators write,
# Users read). NOT under C:\source\repos, whose Users:FullControl would let any
# user swap the dir for a junction and redirect a SYSTEM write.
WATCHDOG_STATUS = r"C:\ProgramData\RR-DevWatchdog\state\watchdog-status.json"
WATCHDOG_STALE_MIN = 20
WATCHDOG_INSTALL = r"RapidReconciler-Valc\setup\dev-box-watchdog\install-watchdog.ps1"


def watchdog_lines(path=WATCHDOG_STATUS, now=None):
    """What the session start should know about the watchdog, as print lines.

    Every problem line starts with `!!`. A clean status gives exactly one line
    without it, so a caller can tell 'read it and all is well' from 'printed
    nothing'."""
    now = now or datetime.now(timezone.utc)
    if not os.path.exists(path):
        return ["!! WATCHDOG: no status file at %s -- the dev-box watchdog has never run on this box, "
                "so nothing watches Postgres, VALC or the agents between sessions (install: %s)."
                % (path, WATCHDOG_INSTALL)]
    try:
        with open(path, encoding="utf-8-sig") as fh:   # PS 5.1 writes UTF-8 with a BOM
            st = json.load(fh)
    except Exception as e:
        return ["!! WATCHDOG: status file %s is unreadable (%s)." % (path, e)]
    last = _parse_iso(st.get("lastPassUtc"))
    if last is None:
        return ["!! WATCHDOG: status file %s carries no lastPassUtc." % path]
    age_min = (now - last).total_seconds() / 60
    out = []
    if age_min > WATCHDOG_STALE_MIN:
        out.append("!! WATCHDOG IS NOT RUNNING: its last pass was %s UTC, %.0f min ago (it runs every 5). "
                   "Nothing is watching Postgres, VALC or the agents. Check the RR-DevBox-Watchdog "
                   "scheduled task." % (last.strftime("%Y-%m-%d %H:%M"), age_min))
    as_of = " (as of that stale pass)" if out else ""
    for inc in st.get("openIncidents") or []:
        out.append("!! WATCHDOG INCIDENT [%s] open since %s%s: %s"
                   % (inc.get("key"), inc.get("since"), as_of, inc.get("message")))
    for rec in st.get("recoveries") or []:
        started = _parse_iso(rec.get("startedUtc"))
        if started and (now - started).total_seconds() < 24 * 3600:
            out.append("!! WATCHDOG RECOVERY at %s UTC (%s): %s" % (
                started.strftime("%Y-%m-%d %H:%M"), rec.get("trigger"), rec.get("outcome")))
    if out:
        out.insert(0, "!! DEV-BOX WATCHDOG: tell the owner before anything else. Status: %s" % path)
        return out
    return ["Watchdog: last pass %s UTC (%.0f min ago), every check OK, no recovery in 24h. (%s)"
            % (last.strftime("%Y-%m-%d %H:%M"), age_min, path)]


def _arg(name):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def main():
    if "--self-test" in sys.argv:
        self_test()
        return
    if "--watchdog-only" not in sys.argv:
        try:
            examined, flagged = scan()
        except Exception as e:  # a broken check must SAY it is broken, never print a clean result
            print("!! Orphan-process check could not run: %s" % e)
        else:
            report(examined, flagged)
    try:
        lines = watchdog_lines(_arg("--watchdog-status") or WATCHDOG_STATUS)
    except Exception as e:  # same rule: a broken read says so
        lines = ["!! WATCHDOG: the status check itself failed: %s" % e]
    for line in lines:
        print(line)


if __name__ == "__main__":
    main()
