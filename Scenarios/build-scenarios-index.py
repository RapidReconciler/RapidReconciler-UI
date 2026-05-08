#!/usr/bin/env python3
"""
build-scenarios-index.py — Build scenarios-index.json from Scenarios/*.html.

Walks the current directory for `scenario-*.html` files (skipping the template),
extracts each one's metadata + searchable text, and writes scenarios-index.json
next to itself. The Help Desk page (HelpDesk/troubleshooting.html) fetches this
file at search time to surface scenario matches.

Usage
-----
    pip install beautifulsoup4
    python3 build-scenarios-index.py

Run from inside the Scenarios/ directory (or with cwd set to it). Output is
written to ./scenarios-index.json.

Schema
------
    {
      "version":   1,
      "generated": "<iso 8601 utc timestamp>",
      "scenarios": [
        {
          "slug":      "scenario-foo",
          "title":     "Display title",
          "subtitle":  "shorter sub-headline",
          "category":  "Install · migration",
          "data_search": "lowercased searchable body text"
        },
        ...
      ]
    }
"""
from __future__ import annotations

import datetime
import json
import re
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.stderr.write(
        "ERROR: BeautifulSoup is not installed.\n"
        "Install it with:  pip install beautifulsoup4\n"
    )
    sys.exit(1)

SKIP_FILES = {
    "scenario-template.html",
    "scenarios-index.json",
}

# Tags whose contents should be excluded from the searchable body
STRIP_TAGS = ("script", "style", "nav", "footer")


def collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def text_of(el) -> str:
    """Get clean visible text from a BeautifulSoup element."""
    if el is None:
        return ""
    return collapse_ws(el.get_text(" ", strip=True))


def extract_scenario(path: Path) -> dict:
    """Pull title / subtitle / category / data_search out of one scenario page."""
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")

    # Strip non-content elements before any extraction
    for tag in soup.find_all(STRIP_TAGS):
        tag.decompose()
    # Also drop the topnav header (page-level chrome)
    for header in soup.find_all("header", class_=lambda c: c and "topnav" in c):
        header.decompose()

    # ---- category from .hero-eyebrow (e.g. "Scenario · Install") -------------
    category = ""
    eyebrow = soup.select_one(".hero-eyebrow")
    if eyebrow:
        raw = text_of(eyebrow)
        m = re.match(r"^\s*scenario\s*[·\u00B7\u2022\-]+\s*(.+?)\s*$", raw, re.IGNORECASE)
        category = (m.group(1) if m else raw).strip()

    # ---- title + subtitle from <h1 class="hero-title">title <em>subtitle</em>
    title = ""
    subtitle = ""
    h1 = soup.select_one(".hero-title") or soup.find("h1")
    if h1:
        em = h1.find("em")
        if em:
            subtitle = text_of(em).strip(" —–-")
            em.extract()
        title = text_of(h1).strip(" —–-")

    # Fallback: <title> tag (strip site suffix)
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            t = text_of(title_tag)
            title = re.split(r"\s*[—–-]\s*", t, maxsplit=1)[0].strip()

    # ---- data_search: lowercased, punctuation-stripped body text -------------
    body = soup.body or soup
    raw_text = text_of(body)
    # Lowercase, drop punctuation, collapse whitespace
    cleaned = re.sub(r"[^\w\s]", " ", raw_text).lower()
    cleaned = collapse_ws(cleaned)

    return {
        "slug":        path.stem,
        "title":       title,
        "subtitle":    subtitle,
        "category":    category,
        "data_search": cleaned,
    }


def main(argv: list[str]) -> int:
    here = Path(__file__).resolve().parent
    files = sorted(p for p in here.glob("scenario-*.html") if p.name not in SKIP_FILES)

    if not files:
        print(f"No scenario-*.html files found in {here}", file=sys.stderr)
        return 1

    scenarios = []
    for path in files:
        try:
            scenarios.append(extract_scenario(path))
        except Exception as e:
            print(f"  ! {path.name}: {e}", file=sys.stderr)

    out_path = here / "scenarios-index.json"
    payload = {
        "version":   1,
        "generated": datetime.datetime.now(datetime.timezone.utc)
                              .isoformat(timespec="seconds")
                              .replace("+00:00", "Z"),
        "scenarios": scenarios,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {out_path.relative_to(here.parent)} with {len(scenarios)} scenarios")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
