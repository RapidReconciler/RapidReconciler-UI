#!/usr/bin/env python3
"""Package the V8 UI as a versioned release: a zip, a manifest, and a .sha256 (UI-211).

GitHub Pages serves `main`, so until UI-211 "released" meant "merged" and nothing could
check the UI against the Services it calls. This cuts the V8 app surface at a tag.

What goes in the zip is MEASURED from the pages, not listed by hand:

  * Entry pages: `login.html`, `sso-landing.html`, and every `RRV8/*.html` (top level
    only; `RRV8/_uitest/` is a test page).
  * Everything those pages load, followed transitively: <script src>, <link href>,
    <img src/srcset>, <source>, <video>/<audio>, <iframe>, <object>, <embed>, inline
    style url(), and in CSS url() and @import. A loaded reference that resolves to a
    file that does not exist REFUSES the package: a page that would 404 on an asset
    must not ship.
  * Quoted path literals in scripts (inline and .js), resolved against every page that
    loads the script. This catches assets loaded by code. A literal counts only when
    the file exists, since a string is not proof of a load.

Navigation (<a href>, and .html literals in scripts) is not a load. A navigation target
inside the package is fine; one outside it (the knowledge base stays on Pages) is listed
in the manifest under `linksOutside`, for the Web App deploy leg (QAv8) to resolve.
An entry ending in "/" is a directory a script joins names onto at runtime
('../RRUniversity/' + rec.url in Tools/home-search.js): every link under it leaves the
package, and no file list could name them.

The release declares the oldest Services release it runs against, from
`v8-release.properties` at the repo root (`min-services-version=8.0.47`). The packager
REFUSES without a valid version there. `none` is refused too: every V8 page calls
Services, so a UI with no Services floor is an omission, not a decision.

Usage:
  python .github/scripts/package_v8_release.py --version 8.0.0 --out dist [--commit SHA]

Exit 0 on success (prints the floor and the file count), 2 on a refusal.
"""
import argparse
import hashlib
import html.parser
import json
import os
import re
import subprocess
import sys
import zipfile

PROPERTIES = 'v8-release.properties'
FLOOR_KEY = 'min-services-version'
DOCS_KEY = 'docs-base-url'
DOCS_RE = re.compile(r'^https://[^\s?#"\'<>]+/$')
# The same shape release-ssis.yml / release-dacpac.yml accept, minus "none".
VERSION_RE = re.compile(r'^[0-9]+(\.[0-9]+){1,3}([-.][0-9A-Za-z.]+)?$')
ROOT_ENTRIES = ('login.html', 'sso-landing.html')
SURFACE_DIR = 'RRV8'
ARTIFACT_PREFIX = 'rapidreconciler-v8-ui-'

ASSET_EXT = ('js', 'mjs', 'css', 'json', 'woff', 'woff2', 'ttf', 'otf', 'eot',
             'png', 'svg', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'avif', 'mp4', 'webm', 'pdf')
PAGE_EXT = ('html', 'htm')
LITERAL_RE = re.compile(
    r'''(['"`])([^'"`\s<>()\\{}$]+?\.(?:%s))(?:[?#][^'"`\s]*)?\1'''
    % '|'.join(ASSET_EXT + PAGE_EXT), re.IGNORECASE)
# A directory a script joins a name onto at runtime: '../RRUniversity/' + rec.url, or
# `../Scenarios/${slug}.html`. No file is named, so LITERAL_RE cannot see these links.
PREFIX_RE = re.compile(r'''(['"])([^'"`\s<>()\\{}$]+/)\1\s*\+|`([^'"`\s<>()\\{}$]+/)\$\{''')
# A page a script loads into a frame: iframe.src = '../Tools/analysis-workbook.html'. The
# Export Analyzer's handshake checks location.origin, so that page must share V8's origin.
FRAME_SRC_RE = re.compile(
    r'''(?:\.src\s*=|setAttribute\(\s*['"]src['"]\s*,)\s*(['"])([^'"\s]+?\.html?)(?:[?#][^'"]*)?\1''',
    re.IGNORECASE)
CSS_URL_RE = re.compile(r'''url\(\s*(['"]?)([^'")]+)\1\s*\)''', re.IGNORECASE)
CSS_IMPORT_RE = re.compile(r'''@import\s+(['"])([^'"]+)\1''', re.IGNORECASE)


class Refusal(Exception):
    """A reason the release must not be published."""


# ---------------------------------------------------------------- the floor

def read_floor(root):
    path = os.path.join(root, PROPERTIES)
    if not os.path.isfile(path):
        raise Refusal('%s not found at the repo root: a V8 UI release must declare the oldest '
                      'Services release it runs against (%s=<version>)' % (PROPERTIES, FLOOR_KEY))
    value = None
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith(FLOOR_KEY + '='):
                value = line[len(FLOOR_KEY) + 1:].strip()
                break
    if not value:
        raise Refusal('%s has no %s line' % (PROPERTIES, FLOOR_KEY))
    if not VERSION_RE.match(value):
        raise Refusal('%s=%s in %s is not a Services version (such as 8.0.47); "none" is not '
                      'accepted, since every V8 page calls Services' % (FLOOR_KEY, value, PROPERTIES))
    return value


def _property(root, key):
    path = os.path.join(root, PROPERTIES)
    if os.path.isfile(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith(key + '='):
                    return line[len(key) + 1:].strip()
    return None


def read_docs_base(root):
    """Where a deployed V8 links the knowledge base (owner ruling 2026-11-03)."""
    value = _property(root, DOCS_KEY)
    if not value:
        raise Refusal('%s has no %s line: a deployed V8 serves from its own host, where '
                      '../RRUniversity/ names nothing, so the release must say where the knowledge '
                      'base is published' % (PROPERTIES, DOCS_KEY))
    if not DOCS_RE.match(value):
        raise Refusal('%s=%s in %s is not an https:// directory URL ending in "/"'
                      % (DOCS_KEY, value, PROPERTIES))
    return value


# ---------------------------------------------------------------- references

def _local(ref):
    """The path part of a reference that could name a file in the repo, or None."""
    ref = (ref or '').strip()
    if not ref or ref.startswith(('#', '//')):
        return None
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', ref):   # http:, data:, mailto:, javascript:
        return None
    ref = re.split(r"[?#]", ref, maxsplit=1)[0]
    return ref or None


def _resolve(root, base_dir, ref):
    """Repo-relative posix path for ref seen from base_dir, or None when it leaves the repo."""
    if ref.startswith('/'):
        return None                                   # site-absolute: CLAUDE.md forbids them
    joined = os.path.normpath(os.path.join(root, base_dir, ref))
    rel = os.path.relpath(joined, root)
    if rel.startswith('..'):
        return None
    return rel.replace(os.sep, '/')


class _PageRefs(html.parser.HTMLParser):
    LOAD_ATTRS = {
        'script': ('src',), 'img': ('src', 'srcset'), 'source': ('src', 'srcset'),
        'video': ('src', 'poster'), 'audio': ('src',), 'iframe': ('src',), 'embed': ('src',),
        'object': ('data',), 'track': ('src',), 'input': ('src',),
    }
    NAV_LINK_RELS = {'canonical', 'alternate', 'next', 'prev', 'author', 'help', 'license', 'search'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.loads, self.navs, self.scripts, self.styles = [], [], [], []
        self._in = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'link' and a.get('href'):
            rels = set((a.get('rel') or '').lower().split())
            (self.navs if rels and rels <= self.NAV_LINK_RELS else self.loads).append(a['href'])
        elif tag == 'a' and a.get('href'):
            self.navs.append(a['href'])
        if a.get('data-help-src'):              # the "?" panel frames this doc (Tools/help-sidebar.js)
            self.navs.append(a['data-help-src'])
        for attr in self.LOAD_ATTRS.get(tag, ()):
            v = a.get(attr)
            if not v:
                continue
            if attr == 'srcset':
                self.loads.extend(part.strip().split(' ')[0] for part in v.split(',') if part.strip())
            else:
                self.loads.append(v)
        if a.get('style'):
            self.styles.append(a['style'])
        if tag in ('script', 'style'):
            self._in = tag

    def handle_endtag(self, tag):
        if tag == self._in:
            self._in = None

    def handle_data(self, data):
        if self._in == 'script':
            self.scripts.append(data)
        elif self._in == 'style':
            self.styles.append(data)


def _tracked(root):
    """The files git tracks when root is the top of a work tree, else None (no git, or a fixture).

    CI packs a fresh checkout, so a local run that saw gitignored or not-yet-added files
    would measure a different release than the one published.
    """
    try:
        # An empty prefix means root IS the top. Comparing paths instead fails on Windows,
        # where git answers with long names and a temp dir can be spelled EDWARD~1.
        top = subprocess.run(['git', '-C', root, 'rev-parse', '--show-prefix'],
                             capture_output=True, text=True)
        if top.returncode != 0 or top.stdout.strip():
            return None
        out = subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return set(p for p in out.stdout.split('\0') if p)


def _is_page(path):
    return path.lower().rsplit('.', 1)[-1] in PAGE_EXT


def entry_pages(root):
    pages = [p for p in ROOT_ENTRIES if os.path.isfile(os.path.join(root, p))]
    missing = [p for p in ROOT_ENTRIES if p not in pages]
    if missing:
        raise Refusal('entry page(s) missing: ' + ', '.join(missing))
    surface = os.path.join(root, SURFACE_DIR)
    if not os.path.isdir(surface):
        raise Refusal(SURFACE_DIR + '/ not found')
    pages += sorted(SURFACE_DIR + '/' + n for n in os.listdir(surface)
                    if _is_page(n) and os.path.isfile(os.path.join(surface, n)))
    return pages


def measure(root):
    """(files, links_outside, entries): every file the V8 surface needs, measured from its pages."""
    d = measure_detail(root)
    return d['files'], d['outside'], d['entries']


def measure_detail(root, texts=None):
    """measure(), plus each file's references as written (`refs`: path -> {(ref, target)}).

    `texts` (path -> str) replaces a file's content, so the rewritten bytes can be measured
    again before anything ships.
    """
    entries = entry_pages(root)
    files = set(entries)
    nav_targets = set()
    prefixes = set()                        # 'RRUniversity/': a script links under it at runtime
    refs = {}                               # source path -> {(ref as written, target)}
    broken = []
    script_bases = {}                       # script path -> page dirs that load it
    queue = list(entries)
    seen = set()
    tracked = _tracked(root)

    def on_disk(p):
        return p is not None and os.path.isfile(os.path.join(root, p))

    def exists(p):
        return on_disk(p) and (tracked is None or p in tracked)

    def read(path):
        if texts is not None and path in texts:
            return texts[path]
        with open(os.path.join(root, path), encoding='utf-8', errors='replace') as f:
            return f.read()

    def note(where, ref, target):
        refs.setdefault(where, set()).add((ref, target))

    def add_load(path, where, ref):
        if not exists(path):
            if on_disk(path):
                broken.append('%s loads %s (%s), which git has not tracked: git add it, or the release '
                              'CI cuts from a checkout will not contain it' % (where, ref, path))
            else:
                broken.append('%s loads %s (%s), which does not exist' % (where, ref, path or 'outside the repo'))
            return
        if path not in files:
            files.add(path)
            queue.append(path)

    def scan_literals(text, bases, where):
        framed = set()
        for m in FRAME_SRC_RE.finditer(text):
            ref = _local(m.group(2))
            if not ref:
                continue
            targets = [_resolve(root, base, ref) for base in bases]
            hit = next((p for p in targets if exists(p)), None)
            add_load(hit or targets[0], where, ref)
            if hit:
                framed.add(hit)
        for m in LITERAL_RE.finditer(text):
            ref = _local(m.group(2))
            if not ref:
                continue
            for base in bases:
                p = _resolve(root, base, ref)
                if exists(p):
                    if p in framed:
                        pass
                    elif _is_page(p):
                        nav_targets.add(p)
                        note(where, ref, p)
                    elif p not in files:
                        files.add(p)
                        queue.append(p)
                    break
        for m in PREFIX_RE.finditer(text):
            ref = _local(m.group(2) or m.group(3))
            if not ref:
                continue
            for base in bases:
                p = _resolve(root, base, ref)
                if p and p != '.' and os.path.isdir(os.path.join(root, p)):
                    # RRV8/ ships whole as far as links go: its pages are all entry pages.
                    if p != SURFACE_DIR and not p.startswith(SURFACE_DIR + '/'):
                        prefixes.add(p + '/')
                        note(where, ref, p + '/')
                    break

    def scan_css(text, base, where):
        for rx in (CSS_URL_RE, CSS_IMPORT_RE):
            for m in rx.finditer(text):
                ref = _local(m.group(2))
                if ref:
                    add_load(_resolve(root, base, ref), where, ref)

    while queue:
        path = queue.pop(0)
        if path in seen:
            continue
        seen.add(path)
        base = os.path.dirname(path)
        ext = path.lower().rsplit('.', 1)[-1]
        if ext in PAGE_EXT:
            p = _PageRefs()
            p.feed(read(path))
            for ref in p.loads:
                loc = _local(ref)
                if loc:
                    target = _resolve(root, base, loc)
                    add_load(target, path, ref)
                    if target and target.lower().endswith(('.js', '.mjs')):
                        script_bases.setdefault(target, set()).add(base)
            for ref in p.navs:
                loc = _local(ref)
                if loc:
                    t = _resolve(root, base, loc)
                    if exists(t):
                        nav_targets.add(t)
                        note(path, loc, t)
            for s in p.scripts:
                scan_literals(s, [base], path)
            for s in p.styles:
                scan_css(s, base, path)
        elif ext in ('js', 'mjs'):
            # fetch() and friends resolve against the PAGE, not the script.
            bases = sorted(script_bases.get(path, set())) + [base]
            scan_literals(read(path), bases, path)
        elif ext == 'css':
            scan_css(read(path), base, path)

    if broken:
        raise Refusal('the V8 surface references files that do not exist:\n  ' + '\n  '.join(sorted(set(broken))))
    outside = sorted(set(t for t in nav_targets if t not in files) | prefixes)
    out = set(outside)
    refs = {src: sorted(r for r in rs if r[1] in out) for src, rs in refs.items()}
    return {'files': sorted(files), 'outside': outside, 'entries': entries,
            'refs': {src: rs for src, rs in refs.items() if rs and src in files}}


# ---------------------------------------------------------------- the docs rewrite

def rewrite_outside(root, detail, docs_base):
    """path -> rewritten text for every shipped file that links out of the package.

    A deployed V8 serves the zip at its own host's root, where ../RRUniversity/ names
    nothing. Each reference is replaced where it stands as a quoted string (an HTML
    attribute or a script literal), keeping any ?query or #anchor after it. A reference
    in any other shape is left alone, and the re-measurement in package() refuses it.
    """
    out = {}
    for path, rs in detail['refs'].items():
        with open(os.path.join(root, path), 'rb') as f:
            raw = f.read()
        try:
            text = raw.decode('utf-8')              # bytes, so CRLF files keep CRLF
        except UnicodeDecodeError:
            raise Refusal('%s links out of the package but is not UTF-8, so it cannot be rewritten' % path)
        new = text
        for ref, target in sorted(rs, key=lambda r: -len(r[0])):   # longest first: a prefix of another ref
            new = re.sub(r'''(?<=["'`])%s(?=["'`?#$])''' % re.escape(ref),
                         lambda _m, t=target: docs_base + t, new)
        if new != text:
            out[path] = new
    return out


# ---------------------------------------------------------------- packaging

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest().upper()


def package(root, version, out_dir, commit=None):
    if not VERSION_RE.match(version or ''):
        raise Refusal('release version %r is not a version (tag ui-v8.0.0 gives 8.0.0)' % version)
    floor = read_floor(root)
    docs_base = read_docs_base(root)
    detail = measure_detail(root)
    files, outside, entries = detail['files'], detail['outside'], detail['entries']
    rewritten = rewrite_outside(root, detail, docs_base)
    # The rewrite is checked by measuring what will ship, not by trusting the substitution.
    after = measure_detail(root, texts=rewritten)
    if after['outside']:
        left = ['%s -> %s' % (src, ref) for src, rs in sorted(after['refs'].items()) for ref, _ in rs]
        raise Refusal('links still leave the package after pointing them at %s; write each as a quoted '
                      'attribute or string:\n  %s' % (docs_base, '\n  '.join(left or after['outside'])))
    if after['files'] != files:
        raise Refusal('pointing links at %s changed what the pages load: %s'
                      % (docs_base, sorted(set(files) ^ set(after['files']))))

    def shipped(p):
        if p in rewritten:
            return rewritten[p].encode('utf-8')
        with open(os.path.join(root, p), 'rb') as f:
            return f.read()

    os.makedirs(out_dir, exist_ok=True)
    name = ARTIFACT_PREFIX + version
    manifest = {
        'component': 'ui',
        'version': version,
        'commit': commit,
        'minServicesVersion': floor,
        'entryPages': entries,
        'fileCount': len(files),
        'files': [{'path': p, 'size': len(shipped(p)),
                   'sha256': hashlib.sha256(shipped(p)).hexdigest().upper()} for p in files],
        'docsBaseUrl': docs_base,
        'linksOutside': outside,
        'filesRewritten': sorted(rewritten),
    }
    manifest_text = json.dumps(manifest, indent=2) + '\n'
    zip_path = os.path.join(out_dir, name + '.zip')
    # Fixed timestamps and order: the same commit packs to the same bytes.
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in files:
            info = zipfile.ZipInfo(p, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, shipped(p))
        info = zipfile.ZipInfo('v8-release-manifest.json', date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, manifest_text)
    manifest_path = os.path.join(out_dir, name + '.manifest.json')
    with open(manifest_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(manifest_text)
    zip_sha = sha256_of(zip_path)
    sha_path = zip_path + '.sha256'
    with open(sha_path, 'w', encoding='ascii', newline='\n') as f:
        f.write('%s  %s\n' % (zip_sha, os.path.basename(zip_path)))
    return {'floor': floor, 'docsBase': docs_base, 'files': files, 'outside': outside,
            'rewritten': sorted(rewritten), 'zip': zip_path,
            'manifest': manifest_path, 'sha256': sha_path, 'zipSha256': zip_sha}


def main(argv=None):
    ap = argparse.ArgumentParser(description='Package the V8 UI release (UI-211).')
    ap.add_argument('--version', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--root', default='.')
    ap.add_argument('--commit')
    ap.add_argument('--github-output', help='append floor=/zip=/... lines here (GITHUB_OUTPUT)')
    args = ap.parse_args(argv)
    try:
        r = package(os.path.abspath(args.root), args.version, args.out, args.commit)
    except Refusal as e:
        print('::error::REFUSED: ' + str(e).replace('\n', ' '), file=sys.stderr)
        print('REFUSED: ' + str(e))
        return 2
    print('min-services-version: ' + r['floor'])
    print('files: %d  links outside the package: %d, pointed at %s (in %d files)'
          % (len(r['files']), len(r['outside']), r['docsBase'], len(r['rewritten'])))
    print('zip: %s  sha256: %s' % (r['zip'], r['zipSha256']))
    if args.github_output:
        with open(args.github_output, 'a', encoding='utf-8') as f:
            f.write('floor=%s\ndocs_base=%s\nfile_count=%d\noutside_count=%d\nzip=%s\nmanifest=%s\nsha256=%s\nzip_sha256=%s\n' % (
                r['floor'], r['docsBase'], len(r['files']), len(r['outside']), r['zip'], r['manifest'],
                r['sha256'], r['zipSha256']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
