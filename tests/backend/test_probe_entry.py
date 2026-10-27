import json
import unittest

from scripts.probe_entry import probe, ProbeError


class TestProbeEntry(unittest.TestCase):
    def fixture(self):
        build = '0123456789abcdef'
        values = {
            '/': ('text/html', b'<script src="/assets/a.js"></script><link href="/assets/a.css">'),
            '/api/health': ('application/json', b'{"status":"ok"}'),
            '/api/version': ('application/json', json.dumps({'buildId': build}).encode()),
            '/release.json': ('application/json', json.dumps({'buildId': build}).encode()),
            '/assets/a.js': ('text/javascript', b'console.log(1)'),
            '/assets/a.css': ('text/css', b'body{}'),
        }
        return values, lambda url: values[url.removeprefix('http://127.0.0.1:8000')]

    def test_real_shape_passes(self):
        _, read = self.fixture()
        self.assertEqual(probe('http://127.0.0.1:8000', read=read)['status'], 'ENTRY_PROBE_PASS')

    def test_invalid_responses_rejected(self):
        for path, value in [('/api/health', ('text/html', b'app')), ('/', ('text/html', b'<script src="/@vite/client"></script>')), ('/assets/a.css', ('text/html', b'app')), ('/api/version', ('application/json', b'{'))]:
            values, read = self.fixture()
            values[path] = value
            with self.subTest(path=path), self.assertRaises((ProbeError, ValueError)):
                probe('http://127.0.0.1:8000', read=read)

    def test_wrong_build_rejected(self):
        _, read = self.fixture()
        with self.assertRaises(ProbeError):
            probe('http://127.0.0.1:8000', expected='ffffffffffffffff', read=read)

    def test_invalid_origins_rejected_before_read(self):
        def no_read(url):
            self.fail('unexpected network access')
        for base in ('http://example.invalid', 'https://u:p@example.invalid', 'https://example.invalid'):
            with self.subTest(base=base), self.assertRaises(ProbeError):
                probe(base, read=no_read)
