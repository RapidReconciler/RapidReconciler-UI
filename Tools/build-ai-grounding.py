#!/usr/bin/env python3
"""
build-ai-grounding.py -- Generate the in-app AI grounding catalogs FROM the
knowledge-base docs, so RRV8/config.js no longer carries hand-authored
paraphrases that silently drift from the real docs.

WHAT IT DOES
------------
RRV8/config.js exposes six grounding catalogs that six AI surfaces read and
inject into the /api/v1/ai/explain prompt:

    window.RRV8.ACCT_GROUNDING
    window.RRV8.ANALYST_GROUNDING
    window.RRV8.CARDEX_GROUNDING
    window.RRV8.ROLLFORWARD_GROUNDING
    window.RRV8.ASOF_GROUNDING
    window.RRV8.ADMIN_GROUNDING

Those six assignments live inside a marker-delimited block (mirrors the repo's
release-notes insertion-point pattern):

    // <<AI-GROUNDING GENERATED START -- do not edit by hand>>
    ... the six assignments ...
    // <<AI-GROUNDING GENERATED END>>

This script rewrites that block. For every topic in GENERATE (below) it extracts
the authoritative readable text from that topic's SOURCE docs and emits a fresh
`window.RRV8.<TOPIC>_GROUNDING = [ ... ].join('\\n');` assignment. Every other
topic is PASSED THROUGH verbatim -- its current hand-authored content is kept
byte-for-byte so a working catalog never regresses.

The six *consuming* AI surfaces are never touched: the RRV8.*_GROUNDING interface
is preserved exactly; only the string CONTENT changes.

TOPIC -> SOURCE MAP
-------------------
ADMIN is generated from the RRUniversity administrator docs. The five analyst
catalogs (ACCT, ANALYST, CARDEX, ROLLFORWARD, ASOF) are passthrough-pending:
their current content is a tightly distilled, SME-curated POLICY, not a doc
excerpt, and the AnalysisGuides/*.md files are long-form references with no
liftable concise grounding section. A mechanical extractor would only dump or
truncate them -- a regression. They stay hand-authored until a clean, distilled
source (or a summarization step) exists. See docs/plans/ai-grounding-from-docs.md.

USAGE
-----
    python build-ai-grounding.py            # run from anywhere; paths are repo-relative
    python build-ai-grounding.py --check    # verify block is up to date; non-zero if stale

No third-party dependencies (stdlib html.parser) so it runs in CI with no pip
install and on a box that cannot install Python packages.
"""

from __future__ import annotations

import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_JS = REPO_ROOT / "RRV8" / "config.js"

MARKER_START = "  // <<AI-GROUNDING GENERATED START -- do not edit by hand>>"
MARKER_END = "  // <<AI-GROUNDING GENERATED END>>"

# Topics regenerated from docs on every run. Everything else in the block is
# preserved verbatim. Flip a topic to "generated" by adding it here AND giving
# it a SOURCES entry.
GENERATE = ("ADMIN",)

# TOPIC -> ordered list of source doc paths (repo-relative). Only topics in
# GENERATE are read; the rest are documentation of intent.
SOURCES = {
    # administrator-start-here.html is intentionally EXCLUDED: it's an
    # onboarding hub (data-retention prose, a vocabulary glossary, a self-check
    # quiz) that is noise on every admin AI call. Ground on the four PROCEDURE
    # docs only ("all signal, no noise"). Add it back only if answers show a
    # concrete orientation gap that isn't better fixed in a procedure doc.
    "ADMIN": [
        "RRUniversity/administrator-managing-users.html",
        "RRUniversity/administrator-managing-companies.html",
        "RRUniversity/administrator-complex-password.html",
        "RRUniversity/rapidreconciler-licensing.html",
    ],
    # Passthrough-pending -- needs a clean, distilled source before it can be
    # generated without regressing the working hand-authored grounding:
    "ACCT": [],         # SOURCE OF TRUTH docs/plans/accounting-reference.md (prose, no liftable policy block)
    "ANALYST": [],      # AnalysisGuides/transaction-detail-analysis.md (1381-line reference, needs distillation)
    "CARDEX": [],       # AnalysisGuides/cardex-variance-analysis.md (749-line reference, needs distillation)
    "ROLLFORWARD": [],  # AnalysisGuides/inv-account-roll-forward-analysis.md (709-line reference, needs distillation)
    "ASOF": [],         # no dedicated as-of guide; perpetual/residual model lives across pages
}

# A short, human-readable label per generated topic used in the block header.
TOPIC_LABELS = {
    "ADMIN": "RapidReconciler University administrator docs",
}

# --------------------------------------------------------------------------
# HTML -> readable plain text extraction (stdlib only)
# --------------------------------------------------------------------------

# Whole subtrees to drop -- chrome, nav, scripts, icons, controls.
SKIP_TAGS = frozenset(
    ("script", "style", "nav", "header", "footer", "aside", "svg", "button",
     "form", "select", "option", "noscript", "template")
)

# Any element whose class list intersects these is dropped with its subtree.
SKIP_CLASSES = frozenset(
    ("page-header", "doc-feedback", "feedback-band", "breadcrumb", "doc-header",
     "section-nav", "view-nav", "topic-nav", "tab-nav", "tabs", "sidebar",
     "sidebar-nav", "toc", "doc-toc", "back-to-top", "page-meta", "skip-link",
     "topic-footer-nav", "view-switcher", "doc-nav", "crumbs")
)

# Block-level elements that each start a fresh output line.
BLOCK_TAGS = frozenset(
    ("h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote",
     "dt", "dd", "caption", "figcaption")
)
HEADING_TAGS = frozenset(("h1", "h2", "h3", "h4", "h5", "h6"))
VOID_TAGS = frozenset(
    ("br", "hr", "img", "meta", "link", "input", "source", "col", "area", "wbr")
)


def _classes(attrs):
    for k, v in attrs:
        if k == "class" and v:
            return v.split()
    return []


class Extractor(HTMLParser):
    """Walk an HTML doc and collect readable block-level text lines."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # list of dicts: {name, skip}
        self.skip_depth = 0      # >0 means inside a dropped subtree
        self.lines = []          # emitted output lines
        self.buf = []            # current block text fragments
        self.prefix = ""         # prefix for the current block ("- " for li)
        self.in_row = False
        self.row_cells = []
        self.cell_buf = []
        self.in_cell = False
        self.title = None
        self._in_title = False

    # -- block flushing ----------------------------------------------------
    def _flush_block(self):
        text = _collapse(" ".join(self.buf))
        if text:
            self.lines.append(self.prefix + text)
        self.buf = []
        self.prefix = ""

    def _flush_cell(self):
        text = _collapse(" ".join(self.cell_buf))
        if text:
            self.row_cells.append(text)
        self.cell_buf = []
        self.in_cell = False

    def _flush_row(self):
        cells = [c for c in self.row_cells if c]
        if cells:
            self.lines.append(" | ".join(cells))
        self.row_cells = []
        self.in_row = False

    # -- parser hooks ------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
            return
        skip = tag in SKIP_TAGS or bool(set(_classes(attrs)) & SKIP_CLASSES)
        if tag in VOID_TAGS:
            return
        self.stack.append({"name": tag, "skip": skip})
        if skip:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag == "tr":
            self._flush_block()
            self.in_row = True
            self.row_cells = []
            return
        if tag in ("td", "th"):
            self._flush_cell()
            self.in_cell = True
            self.cell_buf = []
            return
        if tag in BLOCK_TAGS:
            self._flush_block()
            self.prefix = "- " if tag == "li" else ""

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
            return
        if tag in VOID_TAGS:
            return
        # Pop the matching stack frame (tolerate minor mismatches).
        popped = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["name"] == tag:
                popped = self.stack[i]
                del self.stack[i:]
                break
        if popped is None:
            return
        if popped["skip"]:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if tag in ("td", "th"):
            self._flush_cell()
            return
        if tag == "tr":
            self._flush_cell()
            self._flush_row()
            return
        if tag in BLOCK_TAGS:
            self._flush_block()

    def handle_data(self, data):
        if self._in_title:
            self.title = _collapse((self.title or "") + " " + data)
            return
        # Inside a dropped subtree (script/style/nav/sidebar/etc.) -> ignore.
        if self.skip_depth:
            return
        if self.in_cell or self.in_row:
            # text inside a table row (in a cell, or stray between cells)
            self.cell_buf.append(data)
        else:
            self.buf.append(data)

    def close(self):
        super().close()
        self._flush_cell()
        self._flush_row()
        self._flush_block()


# Zero-width / BOM / directional marks that leak from source docs and add no
# readable value.
_ZERO_WIDTH_RE = re.compile("[﻿​‌‍⁠]")


def _collapse(s: str) -> str:
    s = _ZERO_WIDTH_RE.sub("", s.replace("\xa0", " "))
    return re.sub(r"\s+", " ", s).strip()


TITLE_SUFFIXES = (
    " — RapidReconciler University",
    " · RapidReconciler University",
    " - RapidReconciler University",
    " — RapidReconciler",
)


def clean_title(t: str | None, fallback: str) -> str:
    if not t:
        return fallback
    t = html.unescape(t)
    for suf in TITLE_SUFFIXES:
        if t.endswith(suf):
            t = t[: -len(suf)]
            break
    return _collapse(t) or fallback


def extract_doc_lines(path: Path) -> tuple[str, list[str]]:
    """Return (title, [readable lines]) for one HTML doc."""
    raw = path.read_text(encoding="utf-8")
    ext = Extractor()
    ext.feed(raw)
    ext.close()
    title = clean_title(ext.title, path.stem)

    seen = set()
    out = []
    for line in ext.lines:
        line = html.unescape(line).strip()
        # Drop trivially short fragments (stray labels, icon glyphs).
        core = line[2:] if line.startswith("- ") else line
        if len(core) < 3:
            continue
        key = re.sub(r"\s+", " ", line.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(line)
    return title, out


# --------------------------------------------------------------------------
# JS string emission
# --------------------------------------------------------------------------

def js_escape(s: str) -> str:
    """Escape a Python string for a single-quoted ES5 string literal."""
    s = s.replace("\\", "\\\\").replace("'", "\\'")
    s = s.replace("\r", "").replace("\n", " ")
    return s


def build_generated_lines(topic: str) -> list[str]:
    """Build the array-of-strings payload for a generated topic."""
    label = TOPIC_LABELS.get(topic, topic)
    lines = [
        "%s GROUNDING -- generated from the %s. Reason from the documented "
        "process below; this is the authoritative text, not a paraphrase."
        % (topic, label),
    ]
    for rel in SOURCES[topic]:
        path = REPO_ROOT / rel
        if not path.exists():
            sys.stderr.write("  WARN: source not found: %s\n" % rel)
            continue
        title, doc_lines = extract_doc_lines(path)
        if not doc_lines:
            continue
        lines.append("")
        lines.append("=== %s (%s) ===" % (title, path.name))
        lines.extend(doc_lines)
    return lines


def render_assignment(topic: str, lines: list[str]) -> str:
    """Render a `window.RRV8.<TOPIC>_GROUNDING = [ ... ].join('\\n');` block."""
    items = ",\r\n".join("    '%s'" % js_escape(l) for l in lines)
    return (
        "  window.RRV8.%s_GROUNDING = [\r\n%s\r\n  ].join('\\n');"
        % (topic, items)
    )


def render_generated_segment(topic: str) -> str:
    """Full segment (comment + assignment) for a generated topic."""
    lines = build_generated_lines(topic)
    comment = (
        "\r\n"
        "  // %s_GROUNDING -- GENERATED from the knowledge-base docs by\r\n"
        "  // Tools/build-ai-grounding.py. DO NOT edit by hand: edit the source\r\n"
        "  // docs and re-run the generator (or let the GHA regenerate on push).\r\n"
        "  // Sources: %s\r\n"
        % (topic, ", ".join(SOURCES[topic]))
    )
    # No trailing newline: the segment ends exactly at the assignment's `;`,
    # matching the span the matcher captured. The newline before the END marker
    # lives in the block's trailing text. Adding one here would accumulate a
    # blank line on every run (non-idempotent).
    return comment + render_assignment(topic, lines)


# --------------------------------------------------------------------------
# config.js block rewrite
# --------------------------------------------------------------------------

ASSIGN_RE = re.compile(
    r"window\.RRV8\.(\w+)_GROUNDING\s*=\s*\[.*?\]\.join\('\\n'\);",
    re.DOTALL,
)


def ensure_markers(text: str) -> str:
    """Insert the START/END markers around the six assignments if absent."""
    if MARKER_START in text and MARKER_END in text:
        return text
    matches = list(ASSIGN_RE.finditer(text))
    if not matches:
        raise SystemExit("ERROR: no RRV8.*_GROUNDING assignments found in config.js")
    first, last = matches[0], matches[-1]
    # Walk back over the comment lines immediately preceding the first assignment.
    line_start = text.rfind("\n", 0, first.start()) + 1
    while True:
        prev_nl = text.rfind("\n", 0, line_start - 1) + 1
        prev_line = text[prev_nl:line_start].strip()
        if prev_line.startswith("//"):
            line_start = prev_nl
            continue
        break
    block_start = line_start
    block_end = last.end()
    new_text = (
        text[:block_start]
        + MARKER_START + "\r\n"
        + text[block_start:block_end]
        + "\r\n" + MARKER_END
        + text[block_end:]
    )
    return new_text


def rewrite_block(text: str) -> str:
    text = ensure_markers(text)
    si = text.index(MARKER_START) + len(MARKER_START)
    ei = text.index(MARKER_END)
    inner = text[si:ei]

    matches = list(ASSIGN_RE.finditer(inner))
    if not matches:
        raise SystemExit("ERROR: no assignments inside the marker block")

    rebuilt = []
    prev_end = 0
    for m in matches:
        topic = m.group(1)
        seg = inner[prev_end:m.end()]
        if topic in GENERATE:
            rebuilt.append(render_generated_segment(topic))
        else:
            rebuilt.append(seg)
        prev_end = m.end()
    # Everything after the last assignment is just the separator before the END
    # marker. Normalize it to a single CRLF so repeated runs stay byte-identical
    # (idempotent) and any accumulated blank lines are collapsed.
    new_inner = "".join(rebuilt) + "\r\n"
    return text[:si] + new_inner + text[ei:]


def main(argv: list[str]) -> int:
    check_only = "--check" in argv[1:]
    original = CONFIG_JS.read_text(encoding="utf-8", newline="")
    updated = rewrite_block(original)

    if check_only:
        if updated != original:
            sys.stderr.write(
                "AI grounding block in RRV8/config.js is STALE -- run "
                "Tools/build-ai-grounding.py to regenerate.\n"
            )
            return 1
        print("AI grounding block is up to date.")
        return 0

    if updated == original:
        print("AI grounding block already up to date -- no change.")
        return 0

    CONFIG_JS.write_text(updated, encoding="utf-8", newline="")
    generated = ", ".join(GENERATE)
    passthrough = ", ".join(
        t for t in ("ACCT", "ANALYST", "CARDEX", "ROLLFORWARD", "ASOF", "ADMIN")
        if t not in GENERATE
    )
    print("Regenerated AI grounding block in %s" % CONFIG_JS)
    print("  generated from docs : %s" % generated)
    print("  passthrough verbatim: %s" % passthrough)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
