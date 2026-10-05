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
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import package_v8_release as pkg  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

FIXTURE = {
    'v8-release.properties': '# floor\nmin-services-version=8.0.47\n',
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
        self.set_properties('min-services-version=\n')
        self.assertEqual(pkg.main(['--version', '8.0.0', '--out', self.out, '--root', self.root]), 2)
        self.set_properties('min-services-version=8.0.47\n')
        self.assertEqual(pkg.main(['--version', '8.0.0', '--out', self.out, '--root', self.root]), 0)

    def test_a_bad_release_version_refuses(self):
        with self.assertRaises(pkg.Refusal):
            pkg.package(self.root, 'ui-v8.0.0', self.out)


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


if __name__ == '__main__':
    unittest.main(verbosity=2)
