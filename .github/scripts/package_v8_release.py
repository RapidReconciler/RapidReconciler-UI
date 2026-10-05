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
import sys
import zipfile

PROPERTIES = 'v8-release.properties'
FLOOR_KEY = 'min-services-version'
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
    entries = entry_pages(root)
    files = set(entries)
    nav_targets = set()
    broken = []
    script_bases = {}                       # script path -> page dirs that load it
    queue = list(entries)
    seen = set()

    def exists(p):
        return p is not None and os.path.isfile(os.path.join(root, p))

    def add_load(path, where, ref):
        if not exists(path):
            broken.append('%s loads %s (%s), which does not exist' % (where, ref, path or 'outside the repo'))
            return
        if path not in files:
            files.add(path)
            queue.append(path)

    def scan_literals(text, bases, where):
        for m in LITERAL_RE.finditer(text):
            ref = _local(m.group(2))
            if not ref:
                continue
            for base in bases:
                p = _resolve(root, base, ref)
                if exists(p):
                    if _is_page(p):
                        nav_targets.add(p)
                    elif p not in files:
                        files.add(p)
                        queue.append(p)
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
        full = os.path.join(root, path)
        base = os.path.dirname(path)
        ext = path.lower().rsplit('.', 1)[-1]
        if ext in PAGE_EXT:
            with open(full, encoding='utf-8', errors='replace') as f:
                p = _PageRefs()
                p.feed(f.read())
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
            for s in p.scripts:
                scan_literals(s, [base], path)
            for s in p.styles:
                scan_css(s, base, path)
        elif ext in ('js', 'mjs'):
            with open(full, encoding='utf-8', errors='replace') as f:
                text = f.read()
            # fetch() and friends resolve against the PAGE, not the script.
            bases = sorted(script_bases.get(path, set())) + [base]
            scan_literals(text, bases, path)
        elif ext == 'css':
            with open(full, encoding='utf-8', errors='replace') as f:
                scan_css(f.read(), base, path)

    if broken:
        raise Refusal('the V8 surface references files that do not exist:\n  ' + '\n  '.join(sorted(set(broken))))
    outside = sorted(t for t in nav_targets if t not in files)
    return sorted(files), outside, entries


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
    files, outside, entries = measure(root)
    os.makedirs(out_dir, exist_ok=True)
    name = ARTIFACT_PREFIX + version
    manifest = {
        'component': 'ui',
        'version': version,
        'commit': commit,
        'minServicesVersion': floor,
        'entryPages': entries,
        'fileCount': len(files),
        'files': [{'path': p, 'size': os.path.getsize(os.path.join(root, p)),
                   'sha256': sha256_of(os.path.join(root, p))} for p in files],
        'linksOutside': outside,
    }
    manifest_text = json.dumps(manifest, indent=2) + '\n'
    zip_path = os.path.join(out_dir, name + '.zip')
    # Fixed timestamps and order: the same commit packs to the same bytes.
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in files:
            info = zipfile.ZipInfo(p, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(os.path.join(root, p), 'rb') as f:
                z.writestr(info, f.read())
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
    return {'floor': floor, 'files': files, 'outside': outside, 'zip': zip_path,
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
    print('files: %d  links outside the package: %d' % (len(r['files']), len(r['outside'])))
    print('zip: %s  sha256: %s' % (r['zip'], r['zipSha256']))
    if args.github_output:
        with open(args.github_output, 'a', encoding='utf-8') as f:
            f.write('floor=%s\nfile_count=%d\noutside_count=%d\nzip=%s\nmanifest=%s\nsha256=%s\nzip_sha256=%s\n' % (
                r['floor'], len(r['files']), len(r['outside']), r['zip'], r['manifest'], r['sha256'], r['zipSha256']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
