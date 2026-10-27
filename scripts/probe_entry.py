import argparse
import json
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.request import ProxyHandler, Request, build_opener


class ProbeError(ValueError):
    pass


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        value = data.get('src') if tag == 'script' else data.get('href') if tag == 'link' else None
        if value and re.fullmatch(r'/assets/[A-Za-z0-9_.-]+\.(js|css)', value):
            self.paths.append(value)


def validate_base(base):
    u = urlsplit(base)
    if u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
        raise ProbeError('Expected origin without credentials or query')
    local = u.hostname in ('127.0.0.1', 'localhost', '::1')
    if not u.hostname or u.scheme not in ('https', 'http') or (u.scheme == 'http' and not local):
        raise ProbeError('HTTPS required outside loopback')
    return base.rstrip('/')


def read_http(url):
    local = urlsplit(url).hostname in ('127.0.0.1', 'localhost', '::1')
    opener = build_opener(ProxyHandler({})) if local else build_opener()
    with opener.open(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=10) as response:
        if response.status != 200 or urlsplit(response.url).netloc != urlsplit(url).netloc or urlsplit(response.url).scheme != urlsplit(url).scheme:
            raise ProbeError('Unexpected HTTP status or redirect')
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ProbeError('Unexpected response size')
        return response.headers.get('Content-Type', '').lower(), body


def probe(base, expected=None, read=read_http):
    base = validate_base(base)
    if base.startswith('https://') and not expected:
        raise ProbeError('Public probe needs the local buildId')

    def get_json(path):
        kind, body = read(base + path)
        if 'application/json' not in kind:
            raise ProbeError('API returned non-JSON')
        return json.loads(body)

    kind, html = read(base + '/')
    if 'text/html' not in kind or b'/@vite/client' in html:
        raise ProbeError('Expected built HTML, not Vite dev server')
    health, version, release = (get_json(path) for path in ('/api/health', '/api/version', '/release.json'))
    build_id = version.get('buildId', '')
    if health.get('status') != 'ok' or not re.fullmatch(r'[0-9a-f]{16}', build_id):
        raise ProbeError('Invalid health/version')
    if release.get('buildId') != build_id or (expected and expected != build_id):
        raise ProbeError('Wrong build')
    parser = Assets()
    parser.feed(html.decode('utf-8'))
    chosen = []
    for suffix in ('.js', '.css'):
        item = next ( (path for path in parser.paths if path.endswith(suffix)), None)
        if not item:
            raise ProbeError('Missing built JS/CSS')
        asset_kind, body = read(urljoin(base + '/', item))
        if not body or 'text/html' in asset_kind:
            raise ProbeError('Asset returned HTML/empty body')
        chosen.append(item)
    return {'status': 'ENTRY_PROBE_PASS', 'buildId': build_id, 'assets': chosen}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base')
    parser.add_argument('--expect-build')
    args = parser.parse_args()
    try:
        result = probe(args.base, args.expect_build)
    except Exception as exc:
        print(json.dumps({'status': 'ENTRY_PROBE_BLOCKED', 'errorType': type(exc).__name__}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
