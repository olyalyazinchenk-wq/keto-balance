import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
import ast

ROOT = Path(__file__).resolve().parent.parent.parent

class TestServerSecurity(unittest.TestCase):
    def test_webhook_returns_503_without_db_interaction(self):
        """P04: Webhook must return 503 Service Unavailable and never modify the database."""
        from bot.server import create_app
        with tempfile.TemporaryDirectory() as tmp_dir:
            app = create_app(dist_dir=Path(tmp_dir))
            client = TestClient(app)
            
            response = client.post(
                "/api/payments/webhook",
                json={"order_id": "test_order_p0", "status": "paid", "secret": ""}
            )
            
            self.assertEqual(response.status_code, 503, f"Expected 503, got {response.status_code}: {response.text}")
            self.assertIn("disabled", response.text.lower())

    def test_server_py_has_no_mark_order_paid_import(self):
        """P04: bot/server.py must not import or call mark_order_paid."""
        server_file = ROOT / "bot" / "server.py"
        source = server_file.read_text(encoding="utf-8")
        self.assertNotIn("mark_order_paid", source, "bot/server.py must not contain mark_order_paid")

    def test_unknown_api_endpoints_return_404(self):
        """P04: Unknown API endpoints (/api, /api/, /api/x) must return 404, never falling back to SPA."""
        from bot.server import create_app
        with tempfile.TemporaryDirectory() as tmp_dir:
            dist = Path(tmp_dir)
            (dist / "index.html").write_text("<html><body>SPA</body></html>", encoding="utf-8")
            app = create_app(dist_dir=dist)
            client = TestClient(app)

            for endpoint in ["/api", "/api/", "/api/unknown_endpoint", "/api/v1/users"]:
                r_get = client.get(endpoint)
                self.assertEqual(r_get.status_code, 404, f"Expected 404 for GET {endpoint}, got {r_get.status_code}")
                self.assertNotIn("SPA", r_get.text)

            r_post = client.post("/api/users/fake")
            self.assertEqual(r_post.status_code, 404)
            self.assertNotIn("SPA", r_post.text)

    def test_assets_routes_never_fallback_to_spa(self):
        """P04: /assets, /assets/, and missing assets under /assets/* must return 404, never index.html."""
        from bot.server import create_app
        with tempfile.TemporaryDirectory() as tmp_dir:
            dist = Path(tmp_dir)
            (dist / "index.html").write_text("<html><body>SPA</body></html>", encoding="utf-8")
            assets_dir = dist / "assets"
            assets_dir.mkdir()
            (assets_dir / "main.js").write_text("console.log('main');", encoding="utf-8")
            
            app = create_app(dist_dir=dist)
            client = TestClient(app)

            # Existing asset returns 200
            r_ok = client.get("/assets/main.js")
            self.assertEqual(r_ok.status_code, 200)
            self.assertEqual(r_ok.text, "console.log('main');")

            # Missing assets or bare assets folder must return 404
            for asset_path in ["/assets", "/assets/", "/assets/missing.js", "/assets/missing_no_ext"]:
                r_miss = client.get(asset_path)
                self.assertEqual(r_miss.status_code, 404, f"Expected 404 for {asset_path}, got {r_miss.status_code}")
                self.assertNotIn("SPA", r_miss.text)

    def test_missing_build_returns_503(self):
        """P04: Missing build (empty or missing dist directory) returns 503 on SPA routes."""
        from bot.server import create_app
        with tempfile.TemporaryDirectory() as tmp_dir:
            empty_dist = Path(tmp_dir) / "non_existent_dist"
            app = create_app(dist_dir=empty_dist)
            client = TestClient(app)

            r_root = client.get("/")
            self.assertEqual(r_root.status_code, 503)
            self.assertIn("build missing", r_root.text.lower())

            r_spa = client.get("/profile")
            self.assertEqual(r_spa.status_code, 503)

    def test_path_traversal_is_blocked_with_synthetic_marker(self):
        """P04: Requests attempting path traversal must return 403 or 404, never files outside dist_dir."""
        from bot.server import create_app
        
        with tempfile.TemporaryDirectory() as base_tmp:
            base_path = Path(base_tmp)
            marker_file = base_path / "synthetic_marker_secret.txt"
            marker_content = "SYNTHETIC_TOP_SECRET_MARKER_NEVER_LEAK_P04"
            marker_file.write_text(marker_content, encoding="utf-8")
            
            dist_path = base_path / "dist"
            dist_path.mkdir()
            (dist_path / "index.html").write_text("<html>Synthetic Index</html>", encoding="utf-8")
            (dist_path / "bundle.js").write_text("console.log('synthetic-bundle');", encoding="utf-8")
            
            app = create_app(dist_dir=dist_path)
            client = TestClient(app)
            
            traversal_paths = [
                "/../synthetic_marker_secret.txt",
                "/..\\synthetic_marker_secret.txt",
                "/%2e%2e/synthetic_marker_secret.txt",
                "/%2e%2e%2fsynthetic_marker_secret.txt",
                "/%2e%2e/%2e%2e/synthetic_marker_secret.txt",
            ]
            
            for path in traversal_paths:
                resp = client.get(path)
                self.assertIn(
                    resp.status_code,
                    (403, 404),
                    f"Path traversal for '{path}' was not blocked! Status: {resp.status_code}"
                )
                self.assertNotIn(marker_content, resp.text)

            # 1. Existing synthetic file
            r_ok = client.get("/bundle.js")
            self.assertEqual(r_ok.status_code, 200)
            self.assertEqual(r_ok.text, "console.log('synthetic-bundle');")

            # 2. Missing asset returns 404
            r_missing_asset = client.get("/missing_asset.js")
            self.assertEqual(r_missing_asset.status_code, 404)
            self.assertNotIn("Synthetic Index", r_missing_asset.text)

            # 3. SPA route returns index.html
            r_spa = client.get("/dashboard")
            self.assertEqual(r_spa.status_code, 200)
            self.assertIn("Synthetic Index", r_spa.text)

    def test_server_binds_to_localhost_only(self):
        """P04: main() must configure host='127.0.0.1'."""
        server_file = ROOT / "bot" / "server.py"
        source = server_file.read_text(encoding="utf-8")
        self.assertIn('host="127.0.0.1"', source, "Server must bind to 127.0.0.1 only")
        self.assertNotIn('host="0.0.0.0"', source, "Server must not bind to 0.0.0.0")

if __name__ == '__main__':
    unittest.main()
