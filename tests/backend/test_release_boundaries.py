import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.server import create_app

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "pilot" / "catalog.json"

class TestReleaseBoundaries(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.settings = AppSettings(
            app_stage="pilot",
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            settings=self.settings,
            catalog_provider=lambda: self.fixture
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_approved_pilot_recipes_are_accessible(self):
        for rid in ["k1", "k2", "k3", "k4", "k5"]:
            resp = self.client.get(f"/api/catalog/{rid}")
            self.assertEqual(resp.status_code, 200, f"Recipe {rid} should be accessible in pilot")
            data = resp.json()
            self.assertEqual(data["id"], rid)

    def test_unreleased_recipes_are_blocked_with_404(self):
        unreleased_ids = ["k16", "k20", "c1", "c10", "unknown_recipe", "fake99"]
        for rid in unreleased_ids:
            resp = self.client.get(f"/api/catalog/{rid}")
            self.assertEqual(resp.status_code, 404, f"Recipe {rid} should return 404 in pilot stage")
            self.assertIn("not available or not released", resp.json().get("detail", "").lower())

    def test_fail_closed_empty_manifest_blocks_all(self):
        # Режим строгой изоляции: пустой манифест по умолчанию без провайдера и без артефакта
        empty_app = create_app(dist_dir=Path(self.tmp_dir.name), settings=self.settings)
        locked_client = TestClient(empty_app)

        catalog_resp = locked_client.get("/api/catalog")
        self.assertEqual(catalog_resp.status_code, 200)
        self.assertEqual(len(catalog_resp.json()["recipes"]), 0)
        self.assertEqual(len(catalog_resp.json()["released_ids"]), 0)

        # Даже k1 недоступен
        k1_resp = locked_client.get("/api/catalog/k1")
        self.assertEqual(k1_resp.status_code, 404)

if __name__ == "__main__":
    unittest.main()
