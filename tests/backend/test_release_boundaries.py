import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings, PILOT_RECIPE_IDS
from bot.server import create_app

class TestReleaseBoundaries(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.settings = AppSettings(
            app_stage="pilot",
            released_recipe_ids=PILOT_RECIPE_IDS,
            dist_dir=Path(self.tmp_dir.name),
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), settings=self.settings)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_approved_pilot_recipes_are_accessible(self):
        for rid in ["k1", "k5", "k10", "k15"]:
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
        # Режим строгой изоляции: пустой манифест
        strict_settings = AppSettings(
            app_stage="production_locked",
            released_recipe_ids=frozenset(),
            dist_dir=Path(self.tmp_dir.name),
        )
        locked_app = create_app(dist_dir=Path(self.tmp_dir.name), settings=strict_settings)
        locked_client = TestClient(locked_app)

        catalog_resp = locked_client.get("/api/catalog")
        self.assertEqual(catalog_resp.status_code, 200)
        self.assertEqual(len(catalog_resp.json()["recipes"]), 0)

        # Даже k1 недоступен
        k1_resp = locked_client.get("/api/catalog/k1")
        self.assertEqual(k1_resp.status_code, 404)
