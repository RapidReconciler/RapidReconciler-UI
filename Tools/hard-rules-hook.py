#!/usr/bin/env python
"""UserPromptSubmit hook: re-inject Tools/hard-rules.md on every turn.

Memory files are read once at session start and stop binding as the session
grows. The rules that keep getting broken are broken deep into a session, so
they have to arrive per turn instead.

Emits the hook contract on stdout:

    {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                            "additionalContext": "..."}}

Fails OPEN. A hook that blocks the turn because a rules file moved would be a
worse defect than the one it is guarding against, so any error exits 0 with no
injected context. Stdin is drained but unused: the harness sends the prompt
payload, and this hook does not condition on it.
"""

import json
import os
import sys

RULES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hard-rules.md")


def main() -> int:
    try:
        sys.stdin.read()
    except Exception:
        pass

    try:
        with open(RULES, encoding="utf-8") as fh:
            text = fh.read().strip()
    except OSError:
        # No rules file, nothing to inject. Silence beats a broken turn.
        return 0

    if not text:
        return 0

    json.dump(
        {
            "suppressOutput": True,
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": text,
            },
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
