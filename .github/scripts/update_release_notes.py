#!/usr/bin/env python3
"""Append entries to release-notes.html for new commits in a BEFORE..AFTER range.

Invoked by .github/workflows/update-release-notes.yml on every push to main.

Publish model: **opt-in via `Release-Note:` trailer.** A commit only produces
an entry if its body contains a `Release-Note:` line. The trailer's content
(everything from the colon through end-of-body, minus other trailer blocks
like Co-Authored-By) becomes the entry text — the commit subject and body
are NOT published. This keeps engineering-detailed commit messages (which
often contain customer doc numbers, dollar amounts, etc.) off the customer-
facing page; authors write a deliberately customer-safe note in the trailer.

A commit with no `Release-Note:` trailer is silently skipped.

Filtering rules (always win, even with a Release-Note: trailer):
  - Subject or body contains: [skip release notes], [skip-release-notes], [skip ci]
  - Subject starts with:      "chore: refresh search indices"   (auto-regen workflow)
  - Subject starts with:      "chore: append release notes"     (this workflow's own commits)

Trailer format examples:

  Release-Note: One-line customer-safe summary of what shipped.

  Release-Note:
  Multi-paragraph notes are also fine — everything from the colon
  through the end of the body (minus trailing Co-Authored-By etc.)
  becomes the entry. Blank lines separate paragraphs in the rendered output.
"""

import html
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

NOTES_FILE  = Path("release-notes.html")
MARKER      = "<!-- RELEASE_NOTES_INSERTION_POINT -->"
# Empty-state placeholder pattern. Removed from the page (along with its
# explanatory comment) the first time a real entry is inserted.
EMPTY_STATE_RE = re.compile(
    r'\n\n  <!-- Empty-state placeholder\..*?</div>\n',
    re.DOTALL,
)

# Cap on how many <article class="rn-entry"> blocks live on the page. After
# every prepend the script trims the oldest entries past this count so the
# file doesn't grow indefinitely. Older changes remain reachable via the
# GitHub commit-history link in the page footer.
MAX_ENTRIES = 100

SKIP_MARKERS  = ("[skip release notes]", "[skip-release-notes]", "[skip ci]")
SKIP_PREFIXES = ("chore: refresh search indices", "chore: append release notes")

# git log format: SHA \x1f ISODATE \x1f SUBJECT \x1f BODY \x1e (one record per commit)
GIT_FMT = "%H%x1f%aI%x1f%s%x1f%b%x1e"

# Known git trailer keys we strip from the body so the release-notes entry
# shows the prose only. A line starting with one of these followed by ": "
# at the very end of the body is treated as a trailer.
TRAILER_KEYS = (
    "co-authored-by", "signed-off-by", "reviewed-by", "acked-by",
    "reported-by", "tested-by", "helped-by", "suggested-by",
    "fixes", "closes", "resolves", "refs",
)
TRAILER_RE = re.compile(
    r"^(?:" + "|".join(TRAILER_KEYS) + r"):\s",
    re.IGNORECASE,
)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def get_commits(before: str, after: str):
    if not before or before == "0" * 40:
        ref_range = "HEAD~1..HEAD"
    else:
        ref_range = f"{before}..{after}"
    out = run(["git", "log", "--reverse", "--no-merges", f"--pretty=format:{GIT_FMT}", ref_range])
    commits = []
    for record in (r for r in out.strip("\x1e").split("\x1e") if r.strip()):
        parts = record.strip().split("\x1f")
        if len(parts) < 4:
            continue
        commits.append({
            "sha":     parts[0],
            "date":    parts[1],
            "subject": parts[2],
            "body":    parts[3].strip(),
        })
    return commits


def should_skip(commit) -> bool:
    full = commit["subject"] + "\n" + commit["body"]
    if any(m in full for m in SKIP_MARKERS):
        return True
    if any(commit["subject"].startswith(p) for p in SKIP_PREFIXES):
        return True
    return False


def strip_trailers(body: str) -> str:
    # Drop trailing trailer-block lines whose key matches a known git trailer.
    # Conservative: only strips a known set so a sentence like "Note: ..." at
    # the end of a body paragraph isn't accidentally treated as a trailer.
    lines = body.split("\n")
    while lines and TRAILER_RE.match(lines[-1] or ""):
        lines.pop()
    # Also strip any blank line that fell at the new end of the body
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).rstrip()


# Matches the start of a Release-Note: trailer line. Case-insensitive so
# "Release-Note:", "release-note:", and "RELEASE-NOTE:" all work.
RELEASE_NOTE_LINE_RE = re.compile(r"^Release-Note:[ \t]*(.*)$", re.IGNORECASE)


def extract_release_note(body: str) -> str | None:
    """Return the customer-facing release-note content from a commit body, or
    None if there's no `Release-Note:` trailer. The content runs from the
    colon through end-of-body, with any following known-trailer block
    (Co-Authored-By, etc.) stripped off the tail.

    Single-line and multi-paragraph forms both work:

        Release-Note: A new persona selector helps you self-route.

        Release-Note:
        Multi-paragraph notes are fine. Paragraphs are separated by
        blank lines and rendered as separate <p> elements.

        Co-Authored-By: ...
    """
    lines = body.split("\n")
    start_idx = None
    first_line_content = ""
    for i, line in enumerate(lines):
        m = RELEASE_NOTE_LINE_RE.match(line or "")
        if m:
            start_idx = i
            first_line_content = m.group(1)
            break
    if start_idx is None:
        return None

    # Collect from the trailer onward, replacing the first line with just
    # the content after "Release-Note:".
    rn_lines = [first_line_content] + lines[start_idx + 1:]

    # Strip any *trailing* known-trailer block (Co-Authored-By, etc.)
    end_idx = len(rn_lines)
    while end_idx > 0 and TRAILER_RE.match(rn_lines[end_idx - 1] or ""):
        end_idx -= 1
    rn_lines = rn_lines[:end_idx]

    # Strip trailing blank lines
    while rn_lines and not rn_lines[-1].strip():
        rn_lines.pop()
    # Strip leading blank lines (e.g. the form where colon is on its own line)
    while rn_lines and not rn_lines[0].strip():
        rn_lines.pop(0)

    content = "\n".join(rn_lines).strip()
    return content or None


def render_paragraphs(text: str) -> str:
    text = text.strip()
    if not text:
        return ""
    out = []
    for paragraph in re.split(r"\n\s*\n", text):
        joined = " ".join(line.strip() for line in paragraph.split("\n") if line.strip())
        if joined:
            out.append(f"      <p>{html.escape(joined)}</p>")
    return "\n".join(out)


def build_entry(commit) -> str:
    # The SHA is kept as a data-attribute for grep / inspect, but is no longer
    # rendered or linked — this page is customer-facing, so we don't expose
    # the GitHub commit history. Body text comes from the Release-Note: trailer
    # only, not the commit subject or full body.
    short_sha   = commit["sha"][:7]
    dt          = datetime.fromisoformat(commit["date"])
    iso_date    = dt.strftime("%Y-%m-%d")
    pretty_date = dt.strftime("%B %-d, %Y")
    paras       = render_paragraphs(commit["release_note"])
    return (
        f'  <article class="rn-entry" data-sha="{short_sha}">\n'
        f'    <div class="rn-entry-meta">\n'
        f'      <time class="rn-entry-date" datetime="{iso_date}">{pretty_date}</time>\n'
        f'    </div>\n'
        f'    <div class="rn-entry-body">\n'
        f'{paras}\n'
        f'    </div>\n'
        f'  </article>'
    )


ARTICLE_RE = re.compile(
    r'  <article class="rn-entry"[^>]*>.*?</article>',
    re.DOTALL,
)


def trim_to_cap(text: str, max_entries: int = MAX_ENTRIES) -> tuple[str, int]:
    """Drop the oldest <article> blocks once total exceeds max_entries.

    Returns (new_text, removed_count). Content after the last article (the
    history-note div and the </main> tag) is preserved verbatim.
    """
    matches = list(ARTICLE_RE.finditer(text))
    if len(matches) <= max_entries:
        return text, 0
    keep_end  = matches[max_entries - 1].end()  # end of the Nth (oldest kept) article
    drop_end  = matches[-1].end()               # end of the very last (oldest) article
    removed   = len(matches) - max_entries
    new_text  = text[:keep_end] + text[drop_end:]
    return new_text, removed


def main(before: str, after: str):
    commits = get_commits(before, after)
    if not commits:
        print("No commits in range.")
        return

    # Filter in two passes: first drop chore / skip-marker commits, then drop
    # commits without a Release-Note: trailer. Attach the extracted note to
    # each commit dict so build_entry() can use it directly.
    keep = []
    skipped_no_trailer = 0
    for c in commits:
        if should_skip(c):
            continue
        note = extract_release_note(c["body"])
        if note is None:
            skipped_no_trailer += 1
            continue
        c["release_note"] = note
        keep.append(c)
    if not keep:
        parts = [f"{len(commits)} commit(s) in range"]
        if skipped_no_trailer:
            parts.append(f"{skipped_no_trailer} had no Release-Note: trailer")
        print(f"Nothing to publish: {', '.join(parts)}.")
        return

    # git log --reverse → oldest-first. We want newest at the top of the page,
    # so reverse here and join with blank-line separators.
    keep_newest_first = list(reversed(keep))
    new_block = "\n\n".join(build_entry(c) for c in keep_newest_first)

    text = NOTES_FILE.read_text(encoding="utf-8")
    if MARKER not in text:
        raise SystemExit(f"Marker '{MARKER}' not found in {NOTES_FILE}")

    # Strip the empty-state placeholder if present — it only shows when the
    # page has zero entries, which is no longer the case after this insert.
    text = EMPTY_STATE_RE.sub("", text)

    pre, post = text.split(MARKER, 1)
    # Normalize the gap between marker and the existing first entry to exactly one blank line.
    post = re.sub(r"^\n+", "\n\n", post, count=1)
    updated = pre + MARKER + "\n\n" + new_block + post

    # Enforce the page-length cap by dropping the oldest entries past MAX_ENTRIES.
    updated, removed = trim_to_cap(updated)

    NOTES_FILE.write_text(updated, encoding="utf-8")
    msg = f"Appended {len(keep)} entry/entries from {len(commits)} commit(s) in range."
    if skipped_no_trailer:
        msg += f" Skipped {skipped_no_trailer} commit(s) without a Release-Note: trailer."
    if removed:
        msg += f" Trimmed {removed} oldest entry/entries to keep page under {MAX_ENTRIES}."
    print(msg)


if __name__ == "__main__":
    main(
        sys.argv[1] if len(sys.argv) > 1 else "",
        sys.argv[2] if len(sys.argv) > 2 else "HEAD",
    )
