"""tests/backend/test_owner_access_mode.py
Tests for Owner Access Mode and Private Preview Security.
"""
import json
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_db import init_db, create_session
from bot.app_settings import AppSettings
from bot.catalog import load_static_catalog
from bot.pilot_models import GeneratedMenuModel, DayMenuModel
from bot.server import create_app

OWNER_ID = 1084557944
OTHER_USER_ID = 999999999

class TestOwnerAccessMode(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.db_path = self.dir_path / "test_owner.db"
        self.dist_dir = self.dir_path / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)

        # Create dummy index.html in dist
        (self.dist_dir / "index.html").write_text("<html><body>KetoBalance</body></html>", encoding="utf-8")

        # Create 20-recipe catalog in dist/released-catalog.json
        recipe_list = [{"id": f"k{i}", "title": f"Recipe {i}", "mode": "keto"} for i in range(1, 21)]
        cat_data = {
            "schema_version": 1,
            "catalog_id": "released-catalog-v1",
            "test_only": False,
            "released_ids": [f"k{i}" for i in range(1, 21)],
            "recipes": recipe_list,
            "nutrition_status": "unverified",
        }
        (self.dist_dir / "released-catalog.json").write_text(json.dumps(cat_data), encoding="utf-8")

        init_db(self.db_path)
        self.owner_token = "test_owner_token_abc123"
        self.other_token = "test_other_token_xyz789"
        create_session(OWNER_ID, self.owner_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(OTHER_USER_ID, self.other_token, expires_in_seconds=86400, db_path=self.db_path)

        self.settings = AppSettings(
            app_stage="staging",
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            allow_anonymous_preview=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        self.app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=self.settings,
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_anonymous_direct_catalog_json_blocked(self):
        res = self.client.get("/released-catalog.json")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Owner session required", res.json().get("detail", ""))

    def test_owner_subscription_has_owner_tier_and_empty_products(self):
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("is_premium"))
        self.assertEqual(data.get("tier"), "owner")
        self.assertEqual(data.get("status"), "active")
        self.assertEqual(data.get("available_products"), [])

    def test_non_owner_subscription_forbidden_by_allowlist(self):
        headers = {"Authorization": f"Bearer {self.other_token}"}
        res = self.client.get("/api/subscription", headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Access denied", res.json().get("detail", ""))

    def test_catalog_endpoint_returns_20_recipes_from_dist(self):
        res = self.client.get("/api/catalog")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data.get("recipes", [])), 20)
        self.assertEqual(len(data.get("released_ids", [])), 20)

    def test_generated_menu_catalog_id_persistence(self):
        menu = GeneratedMenuModel(
            mode="keto",
            numDays=7,
            meals=3,
            portion=1,
            saved=True,
            created=1794000000,
            catalog_id="released-catalog-v1",
            days=[DayMenuModel(date="2026-11-07", slots={"m1": "k1", "m2": "k2", "m3": "k3"})],
        )
        data = menu.model_dump()
        self.assertEqual(data.get("catalog_id"), "released-catalog-v1")
        restored = GeneratedMenuModel.model_validate(data)
        self.assertEqual(restored.catalog_id, "released-catalog-v1")

if __name__ == "__main__":
    unittest.main()
