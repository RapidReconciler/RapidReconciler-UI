#!/usr/bin/env python3
"""Exercise the rule-8 heredoc gate by running it as the harness runs it.

Asserts on the process exit code, not on the regex -- the regex is the
author's guess about what the harness sends; the exit code is what the
harness acts on. Every blocking case here is a command shape that was
actually typed in a session that paid for rule 8.
"""

import json
import os
import subprocess
import sys

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "no-heredoc-hook.py")

BLOCK = 2
ALLOW = 0

CASES = [
    # (expected_exit, tool_name, command, why)
    (BLOCK, "Bash", "cat > /tmp/f.sql <<EOF\nselect 1;\nEOF", "the canonical file-write heredoc"),
    (BLOCK, "Bash", "cat > f.html <<'HTML'\n<p>x</p>\nHTML", "quoted delimiter"),
    (BLOCK, "Bash", 'cat > f.js <<"JS"\nvar a = 1;\nJS', "double-quoted delimiter"),
    (BLOCK, "Bash", "cat <<-EOF\n\tindented\n\tEOF", "tab-stripping form"),
    (BLOCK, "Bash", "python - << PY\nprint(1)\nPY", "space before the delimiter"),
    (BLOCK, "Bash", "psql -d valc << SQL\nselect count(*) from client;\nSQL", "piping SQL in"),

    (ALLOW, "Bash", 'grep -n "<<" Tools/foo.sh', "searching FOR a heredoc is not writing one"),
    (ALLOW, "Bash", "grep -rn '<<' .", "same, single quotes"),
    (ALLOW, "Bash", 'wc -l <<< "one line"', "here-STRING is a different operator"),
    (ALLOW, "Bash", "echo hello && ls -la", "ordinary command"),
    (ALLOW, "Bash", "python x.py < input.txt", "plain redirect in"),
    (ALLOW, "Bash", "git log --format=%h", "no angle brackets at all"),

    (ALLOW, "Write", "cat > f <<EOF", "not the Bash tool -- Write is the sanctioned path"),
    (ALLOW, "PowerShell", "git commit -m @'\nmsg\n'@", "PS here-strings are endorsed by the tool doc"),
]


def run(tool_name, command):
    payload = json.dumps({"tool_name": tool_name, "tool_input": {"command": command}})
    proc = subprocess.run(
        [sys.executable, HOOK],
        input=payload,
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stderr


def main():
    failures = []
    blocked = 0
    allowed = 0

    for expected, tool, command, why in CASES:
        code, stderr = run(tool, command)
        if code != expected:
            failures.append(
                "  {0}: expected exit {1}, got {2}\n    cmd: {3!r}".format(
                    why, expected, code, command
                )
            )
            continue
        if expected == BLOCK:
            blocked += 1
            if "rule 8" not in stderr:
                failures.append("  {0}: blocked but the reason never reached stderr".format(why))
        else:
            allowed += 1

    # Controls. A gate that blocks everything and a gate that blocks nothing
    # both pass a one-sided suite, so both arms have to be non-empty.
    if blocked == 0:
        failures.append("  CONTROL: nothing was blocked -- the gate is inert")
    if allowed == 0:
        failures.append("  CONTROL: nothing was allowed -- the gate blocks everything")

    # Mutation arm: feed the gate garbage it cannot parse. It must fail OPEN,
    # because a hook that crashes closed stops all work on this box.
    proc = subprocess.run(
        [sys.executable, HOOK], input="not json at all", capture_output=True, text=True
    )
    if proc.returncode != 0:
        failures.append(
            "  MUTATION: unparseable input exited {0}; the gate must fail open".format(
                proc.returncode
            )
        )

    print("blocked {0} / allowed {1} / {2} cases".format(blocked, allowed, len(CASES)))
    if failures:
        print("\nFAIL:")
        print("\n".join(failures))
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
