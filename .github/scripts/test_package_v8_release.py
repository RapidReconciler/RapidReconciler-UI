#!/usr/bin/env python3
"""Tests for package_v8_release (UI-211): what the V8 UI release contains, and when it refuses.

The fixture is a small repo tree written to a temp dir, shaped like the real one: root
entry pages, RRV8/ pages, shared assets outside RRV8/ (Tools/, Images/), a font loaded
through CSS, a JSON index fetched by a script relative to the PAGE, and files that must
NOT ship (a README, a test page, a Python script, a commented-out <script>).

The last class runs the measurement on this repository itself, so a PR that points a V8
page at a file that does not exist fails here, not on a customer's screen.

Run: python .github/scripts/test_package_v8_release.py
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import package_v8_release as pkg  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

DOCS = 'https://docs.example/kb/'
PROPS = '# floor\nmin-services-version=8.0.47\ndocs-base-url=%s\n' % DOCS

FIXTURE = {
    'v8-release.properties': PROPS,
    'login.html': (
        '<html><head><script src="RRV8/config.js"></script>'
        '<link rel="stylesheet" href="https://fonts.example/x.css"></head><body>'
        '<img src="Images/logo.png" alt="">'
        '<a href="HelpDesk/check.html">Check</a><a href="mailto:x@example.com">mail</a>'
        '<a href="#top">top</a></body></html>'),
    'sso-landing.html': '<html><body><a href="login.html">back</a></body></html>',
    'RRV8/home.html': (
        '<html><head><link rel="stylesheet" href="fonts/fonts.css">'
        '<script src="config.js"></script><script src="vendor/lib.min.js" defer></script>'
        '<script src="../Tools/search.js"></script>'
        '<!-- <script src="gone.js"></script> -->'
        '</head><body style="background:url(bg.svg)">'
        '<a href="admin.html">Admin</a><a href="../RRUniversity/guide.html">Guide</a>'
        '<script>fetch("data/cards.json?v=2"); var t = "not-a-file.json";</script>'
        '</body></html>'),
    'RRV8/admin.html': '<html><head><script src="config.js"></script></head><body></body></html>',
    'RRV8/config.js': "var next = '../login.html';\n",
    'RRV8/fonts/fonts.css': "@font-face { src: url(sans.woff2) format('woff2'); }\n",
    'RRV8/fonts/sans.woff2': 'woff2',
    'RRV8/fonts/unused.woff2': 'never referenced',
    'RRV8/vendor/lib.min.js': '/* lib */',
    'RRV8/bg.svg': '<svg/>',
    'RRV8/data/cards.json': '{}',
    'RRV8/README.md': '# docs, not shipped',
    'RRV8/_uitest/ui.html': '<html><script src="../config.js"></script></html>',
    'RRV8/scripts/extract.py': 'print(1)',
    # A script loaded by an RRV8 page resolves fetch() paths against the PAGE (RRV8/).
    'Tools/search.js': "var INDEX = '../Data/index.json'; var CARDS = 'data/extra.json';\n",
    'RRV8/data/extra.json': '{}',
    'Data/index.json': '[]',
    'Images/logo.png': 'png',
    'HelpDesk/check.html': '<html></html>',
    'RRUniversity/guide.html': '<html></html>',
}

EXPECTED_FILES = sorted([
    'login.html', 'sso-landing.html', 'RRV8/home.html', 'RRV8/admin.html', 'RRV8/config.js',
    'RRV8/fonts/fonts.css', 'RRV8/fonts/sans.woff2', 'RRV8/vendor/lib.min.js', 'RRV8/bg.svg',
    'RRV8/data/cards.json', 'RRV8/data/extra.json', 'Tools/search.js', 'Data/index.json', 'Images/logo.png',
])


def write_tree(root, files):
    for rel, text in files.items():
        p = os.path.join(root, *rel.split('/'))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix='ui211-')
        self.out = os.path.join(self.root, '_dist')
        write_tree(self.root, FIXTURE)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def set_properties(self, text):
        p = os.path.join(self.root, 'v8-release.properties')
        if text is None:
            os.remove(p)
        else:
            with open(p, 'w', encoding='utf-8') as f:
                f.write(text)


class MeasuredFileListTest(FixtureCase):

    def test_the_package_is_exactly_what_the_pages_load(self):
        files, outside, entries = pkg.measure(self.root)
        self.assertEqual(files, EXPECTED_FILES)
        self.assertEqual(entries, ['login.html', 'sso-landing.html', 'RRV8/admin.html', 'RRV8/home.html'])

    def test_what_must_not_ship_does_not(self):
        files, _, _ = pkg.measure(self.root)
        for p in ('RRV8/README.md', 'RRV8/_uitest/ui.html', 'RRV8/scripts/extract.py',
                  'RRV8/fonts/unused.woff2', 'RRV8/gone.js', 'v8-release.properties'):
            self.assertNotIn(p, files)

    def test_navigation_outside_the_package_is_listed_not_packed(self):
        files, outside, _ = pkg.measure(self.root)
        self.assertEqual(outside, ['HelpDesk/check.html', 'RRUniversity/guide.html'])
        self.assertNotIn('RRUniversity/guide.html', files)

    def test_a_link_a_script_builds_at_runtime_is_listed_by_its_prefix(self):
        # Tools/home-search.js builds '../RRUniversity/' + rec.url and '../Scenarios/' + slug
        # + '.html'. Neither string names a file, so until 2026-11-03 neither was listed and
        # every Home search result would 404 on a deployed V8 with linksOutside saying nothing.
        write_tree(self.root, {
            'Tools/search.js': FIXTURE['Tools/search.js']
            + "var a = '../RRUniversity/' + rec.url;\n"
            + "var b = `../Scenarios/${s.slug}.html`;\n"
            + "var c = 'fonts/' + face;\n",              # control: inside RRV8/, which ships
            'Scenarios/scenario-x.html': '<html></html>',
        })
        files, outside, _ = pkg.measure(self.root)
        self.assertEqual(outside, ['HelpDesk/check.html', 'RRUniversity/', 'RRUniversity/guide.html',
                                   'Scenarios/'])
        self.assertNotIn('Scenarios/scenario-x.html', files)

    def test_a_prefix_naming_no_directory_is_not_a_link(self):
        # A string that ends in "/" and is joined to something is not always a path:
        # 'Bearer/' + x or a URL fragment. Only a prefix that resolves to a real directory counts.
        write_tree(self.root, {'Tools/search.js': FIXTURE['Tools/search.js'] + "var u = 'api/v1/' + id;\n"})
        _, outside, _ = pkg.measure(self.root)
        self.assertEqual(outside, ['HelpDesk/check.html', 'RRUniversity/guide.html'])

    def test_a_script_resolves_fetches_against_the_page_that_loads_it(self):
        # 'data/extra.json' in Tools/search.js exists only under RRV8/, the page's dir;
        # resolved against Tools/ (the script's own dir) it names nothing.
        files, _, _ = pkg.measure(self.root)
        self.assertIn('RRV8/data/extra.json', files)
        self.assertIn('Data/index.json', files)   # control: resolves the same from either dir

    def test_a_page_loading_a_missing_file_refuses(self):
        with open(os.path.join(self.root, 'RRV8', 'admin.html'), 'w', encoding='utf-8') as f:
            f.write('<html><head><script src="missing.js"></script></head></html>')
        with self.assertRaises(pkg.Refusal) as cm:
            pkg.measure(self.root)
        self.assertIn('RRV8/missing.js', str(cm.exception))

    def test_a_css_url_to_a_missing_font_refuses(self):
        os.remove(os.path.join(self.root, 'RRV8', 'fonts', 'sans.woff2'))
        with self.assertRaises(pkg.Refusal):
            pkg.measure(self.root)


class FloorTest(FixtureCase):

    def test_no_properties_file_refuses(self):
        self.set_properties(None)
        with self.assertRaises(pkg.Refusal) as cm:
            pkg.package(self.root, '8.0.0', self.out)
        self.assertIn('v8-release.properties', str(cm.exception))
        self.assertFalse(os.path.exists(self.out), 'nothing is written on a refusal')

    def test_no_floor_line_refuses(self):
        self.set_properties('# nothing here\nother=1\n')
        with self.assertRaises(pkg.Refusal):
            pkg.package(self.root, '8.0.0', self.out)

    def test_none_refuses(self):
        self.set_properties('min-services-version=none\n')
        with self.assertRaises(pkg.Refusal) as cm:
            pkg.package(self.root, '8.0.0', self.out)
        self.assertIn('none', str(cm.exception))

    def test_junk_refuses(self):
        self.set_properties('min-services-version=latest\n')
        with self.assertRaises(pkg.Refusal):
            pkg.package(self.root, '8.0.0', self.out)

    def test_the_cli_exits_2_on_a_refusal_and_0_with_a_floor(self):
        self.set_properties('min-services-version=\ndocs-base-url=%s\n' % DOCS)
        self.assertEqual(pkg.main(['--version', '8.0.0', '--out', self.out, '--root', self.root]), 2)
        self.set_properties(PROPS)
        self.assertEqual(pkg.main(['--version', '8.0.0', '--out', self.out, '--root', self.root]), 0)

    def test_a_bad_release_version_refuses(self):
        with self.assertRaises(pkg.Refusal):
            pkg.package(self.root, 'ui-v8.0.0', self.out)


class DocsBaseTest(FixtureCase):
    """Owner ruling 2026-11-03: a deployed V8 links the knowledge base on its published site.

    The zip serves at its own host's root, where ../RRUniversity/ names nothing, so every
    link that leaves the package is rewritten in the shipped bytes to docs-base-url.
    """

    def zipped(self, r, path):
        with zipfile.ZipFile(r['zip']) as z:
            return z.read(path).decode('utf-8')

    def test_no_docs_base_refuses(self):
        self.set_properties('min-services-version=8.0.47\n')
        with self.assertRaises(pkg.Refusal) as cm:
            pkg.package(self.root, '8.0.0', self.out)
        self.assertIn('docs-base-url', str(cm.exception))

    def test_a_docs_base_that_is_not_an_https_directory_refuses(self):
        for bad in ('http://docs.example/kb/', 'https://docs.example/kb', '../RRUniversity/', 'none'):
            self.set_properties('min-services-version=8.0.47\ndocs-base-url=%s\n' % bad)
            with self.assertRaises(pkg.Refusal, msg=bad):
                pkg.package(self.root, '8.0.0', self.out)

    def test_every_link_out_of_the_package_points_at_the_docs_base(self):
        r = pkg.package(self.root, '8.0.0', self.out)
        home = self.zipped(r, 'RRV8/home.html')
        self.assertIn('href="%sRRUniversity/guide.html"' % DOCS, home)
        self.assertNotIn('../RRUniversity/guide.html', home)
        self.assertIn('href="%sHelpDesk/check.html"' % DOCS, self.zipped(r, 'login.html'))
        self.assertIn('href="admin.html"', home)                    # control: inside the package
        self.assertIn('../login.html', self.zipped(r, 'RRV8/config.js'))  # control: a load-side literal

    def test_the_repository_copy_is_untouched(self):
        pkg.package(self.root, '8.0.0', self.out)
        with open(os.path.join(self.root, 'RRV8', 'home.html'), encoding='utf-8') as f:
            self.assertIn('href="../RRUniversity/guide.html"', f.read())

    def test_runtime_prefixes_and_help_panels_are_rewritten_with_their_anchor(self):
        write_tree(self.root, {
            'Tools/search.js': FIXTURE['Tools/search.js']
            + "var a = '../RRUniversity/' + rec.url;\nvar b = `../Scenarios/${s.slug}.html`;\n",
            'Scenarios/scenario-x.html': '<html></html>',
            'RRV8/admin.html': '<html><head><script src="config.js"></script></head>'
                               '<body data-help-src="../RRUniversity/admin-doc.html#section-6"></body></html>',
            'RRUniversity/admin-doc.html': '<html></html>',
        })
        r = pkg.package(self.root, '8.0.0', self.out)
        search = self.zipped(r, 'Tools/search.js')
        self.assertIn("'%sRRUniversity/' + rec.url" % DOCS, search)
        self.assertIn('`%sScenarios/${s.slug}.html`' % DOCS, search)
        self.assertIn("'../Data/index.json'", search)               # control: a load is not rewritten
        self.assertIn('data-help-src="%sRRUniversity/admin-doc.html#section-6"' % DOCS,
                      self.zipped(r, 'RRV8/admin.html'))
        with open(r['manifest'], encoding='utf-8') as f:
            m = json.load(f)
        self.assertEqual(m['docsBaseUrl'], DOCS)
        self.assertIn('RRUniversity/admin-doc.html', m['linksOutside'])

    def test_a_page_a_script_loads_into_an_iframe_ships(self):
        # The Export Analyzer: three V8 pages set iframe.src to ../Tools/analysis-workbook.html
        # and postMessage customer data to it, checked against location.origin. On another
        # origin the handshake drops silently, so the page is a load, not a link.
        write_tree(self.root, {
            'RRV8/admin.html': '<html><head><script src="config.js"></script></head><body><script>'
                               "frame.src = '../Tools/wb.html';</script></body></html>",
            'Tools/wb.html': '<html><head><script src="wb.js"></script></head>'
                             '<body><a href="../RRUniversity/guide.html">g</a></body></html>',
            'Tools/wb.js': '/* wb */',
        })
        r = pkg.package(self.root, '8.0.0', self.out)
        self.assertIn('Tools/wb.html', r['files'])
        self.assertIn('Tools/wb.js', r['files'])
        self.assertNotIn('Tools/wb.html', r['outside'])
        self.assertIn('href="%sRRUniversity/guide.html"' % DOCS, self.zipped(r, 'Tools/wb.html'))

    def test_a_link_the_rewrite_cannot_place_refuses(self):
        # An unquoted attribute is valid HTML the rewrite does not touch. Shipping it would
        # 404 on the deployed host, so the post-rewrite measurement refuses and names it.
        write_tree(self.root, {'RRV8/admin.html': '<html><body><a href=../RRUniversity/guide.html>g</a></body></html>'})
        with self.assertRaises(pkg.Refusal) as cm:
            pkg.package(self.root, '8.0.0', self.out)
        self.assertIn('RRUniversity/guide.html', str(cm.exception))
        self.assertFalse(os.path.exists(self.out), 'nothing is written on a refusal')

    def test_line_endings_survive_the_rewrite(self):
        p = os.path.join(self.root, 'RRV8', 'home.html')
        with open(p, 'rb') as f:
            crlf = f.read().replace(b'\n', b'\r\n').replace(b'<body', b'\r\n<body')
        with open(p, 'wb') as f:
            f.write(crlf)
        r = pkg.package(self.root, '8.0.0', self.out)
        with zipfile.ZipFile(r['zip']) as z:
            self.assertIn(b'\r\n<body', z.read('RRV8/home.html'))


class GitCheckoutParityTest(FixtureCase):
    """In a git work tree the packager sees what CI's checkout sees: tracked files only.

    Measured 2026-11-03: the main clone packed RRV8/data/reconciliation.json (gitignored,
    named only in a comment), so a local package held 56 files and CI's 55.
    """

    def git(self, *args):
        subprocess.run(['git', '-C', self.root, '-c', 'user.name=t', '-c', 'user.email=t@example.com']
                       + list(args), check=True, capture_output=True)

    def setUp(self):
        super().setUp()
        if not shutil.which('git'):
            self.skipTest('git not installed')
        self.git('init', '-q')
        self.git('add', '-A')
        self.git('commit', '-q', '-m', 'fixture')

    def test_an_untracked_file_a_literal_names_does_not_ship(self):
        write_tree(self.root, {'RRV8/data/private.json': '{"real": 1}',
                               'RRV8/config.js': FIXTURE['RRV8/config.js'] + "// see 'data/private.json'\n"})
        self.git('add', 'RRV8/config.js')
        self.git('commit', '-q', '-m', 'comment')
        files, _, _ = pkg.measure(self.root)
        self.assertNotIn('RRV8/data/private.json', files)
        self.assertEqual(files, EXPECTED_FILES)

    def test_an_untracked_file_a_page_loads_refuses_and_says_why(self):
        write_tree(self.root, {'RRV8/new.js': '/* not added */',
                               'RRV8/admin.html': '<html><head><script src="new.js"></script></head></html>'})
        self.git('add', 'RRV8/admin.html')
        self.git('commit', '-q', '-m', 'page')
        with self.assertRaises(pkg.Refusal) as cm:
            pkg.measure(self.root)
        self.assertIn('RRV8/new.js', str(cm.exception))
        self.assertIn('not tracked', str(cm.exception))


class ArtifactTest(FixtureCase):

    def test_zip_manifest_and_sha256_agree(self):
        r = pkg.package(self.root, '8.0.0', self.out, commit='abc123')
        self.assertEqual(os.path.basename(r['zip']), 'rapidreconciler-v8-ui-8.0.0.zip')
        with open(r['manifest'], encoding='utf-8') as f:
            m = json.load(f)
        self.assertEqual(m['version'], '8.0.0')
        self.assertEqual(m['minServicesVersion'], '8.0.47')
        self.assertEqual(m['commit'], 'abc123')
        self.assertEqual([e['path'] for e in m['files']], EXPECTED_FILES)
        with zipfile.ZipFile(r['zip']) as z:
            names = sorted(z.namelist())
            self.assertEqual(names, sorted(EXPECTED_FILES + ['v8-release-manifest.json']))
            for e in m['files']:
                self.assertEqual(hashlib.sha256(z.read(e['path'])).hexdigest().upper(), e['sha256'])
            self.assertEqual(json.loads(z.read('v8-release-manifest.json')), m)
        with open(r['zip'], 'rb') as f:
            zip_sha = hashlib.sha256(f.read()).hexdigest().upper()
        with open(r['sha256'], encoding='ascii') as f:
            self.assertEqual(f.read().split()[0], zip_sha)

    def test_the_same_tree_packs_to_the_same_bytes(self):
        a = pkg.package(self.root, '8.0.0', os.path.join(self.root, '_a'))['zipSha256']
        b = pkg.package(self.root, '8.0.0', os.path.join(self.root, '_b'))['zipSha256']
        self.assertEqual(a, b)


class ThisRepositoryTest(unittest.TestCase):
    """The real V8 surface measures cleanly: no page loads a file that does not exist."""

    def test_the_v8_surface_has_no_broken_load(self):
        files, outside, entries = pkg.measure(REPO)
        self.assertIn('login.html', entries)
        self.assertIn('RRV8/home.html', entries)
        for p in ('RRV8/config.js', 'RRV8/sidebar.js', 'RRV8/fonts/fonts.css', 'RRV8/fonts/open-sans-400.woff2'):
            self.assertIn(p, files)
        for p in ('RRV8/README.md', 'RRV8/_uitest/ui71.html'):
            self.assertNotIn(p, files)

    def test_this_repository_declares_a_floor(self):
        self.assertTrue(pkg.VERSION_RE.match(pkg.read_floor(REPO)))

    def test_this_repository_packs_with_nothing_left_pointing_outside(self):
        # package() re-measures the rewritten bytes and refuses if any link still leaves the
        # package, so a clean run IS the assertion. The Export Analyzer ships inside it.
        out = tempfile.mkdtemp(prefix='ui211-repo-')
        try:
            r = pkg.package(REPO, '8.0.99', out)
            self.assertIn('Tools/analysis-workbook.html', r['files'])
            self.assertNotIn('Tools/analysis-workbook.html', r['outside'])
            self.assertIn('RRUniversity/', r['outside'])
        finally:
            shutil.rmtree(out, ignore_errors=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
