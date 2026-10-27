import json
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from bot.server import create_app


class TestReleaseVersion(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dist_path = Path(self.temp_dir.name)
        self.assets_dir = self.dist_path / "assets"
        self.assets_dir.mkdir(parents=True, exist_ok=True)

        self.index_file = self.dist_path / "index.html"
        self.index_file.write_text("<html><body>Кето Баланс</body></html>", encoding="utf-8")

        self.js_file = self.assets_dir / "index-abc12345.js"
        self.js_file.write_text("console.log('asset');", encoding="utf-8")

        self.release_data = {
            "buildId": "abc1234567890def",
            "gitSha": "2cb84d1aeddf332125d7a9bd0bd33b4ba825c503",
            "builtAt": "2026-10-26T12:00:00.000Z",
            "assets": ["index-abc12345.js"],
        }
        self.release_file = self.dist_path / "release.json"
        self.release_file.write_text(json.dumps(self.release_data, indent=2), encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_version_endpoint_returns_release_metadata_and_no_store(self):
        app = create_app(dist_dir=self.dist_path)
        client = TestClient(app)
        response = client.get("/api/version")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("buildId"), "abc1234567890def")
        self.assertEqual(data.get("gitSha"), "2cb84d1aeddf332125d7a9bd0bd33b4ba825c503")
        cache_control = response.headers.get("cache-control", "")
        self.assertIn("no-store", cache_control)

    def test_version_endpoint_returns_503_when_release_json_missing(self):
        self.release_file.unlink()
        app = create_app(dist_dir=self.dist_path)
        client = TestClient(app)
        response = client.get("/api/version")
        self.assertEqual(response.status_code, 503)
        cache_control = response.headers.get("cache-control", "")
        self.assertIn("no-store", cache_control)

    def test_index_html_has_no_store_cache_control(self):
        app = create_app(dist_dir=self.dist_path)
        client = TestClient(app)
        response = client.get("/")
        self.assertEqual(response.status_code, 200)
        cache_control = response.headers.get("cache-control", "")
        self.assertIn("no-store", cache_control)

    def test_hashed_assets_have_immutable_cache_control(self):
        app = create_app(dist_dir=self.dist_path)
        client = TestClient(app)
        response = client.get("/assets/index-abc12345.js")
        self.assertEqual(response.status_code, 200)
        cache_control = response.headers.get("cache-control", "")
        self.assertIn("immutable", cache_control)
        self.assertIn("max-age", cache_control)

    def test_unknown_api_endpoints_remain_404(self):
        app = create_app(dist_dir=self.dist_path)
        client = TestClient(app)
        response = client.get("/api/nonexistent")
        self.assertEqual(response.status_code, 404)

    def test_sources_and_secrets_are_never_exposed(self):
        app = create_app(dist_dir=self.dist_path)
        client = TestClient(app)
        for path in ["/.env", "/../.env", "/server.py", "/bot/server.py"]:
            response = client.get(path)
            self.assertIn(response.status_code, [403, 404])


if __name__ == "__main__":
    unittest.main()
