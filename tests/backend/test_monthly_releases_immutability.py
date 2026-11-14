import unittest
import json
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.catalog import CatalogService, is_shopping_consistent_with_menu
from bot.server import create_app
from bot.app_db import init_db, create_session

OWNER_ID = 1084557944
NORMAL_USER_ID = 555666777

class TestMonthlyReleasesImmutability(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parent.parent.parent
        self.dist_dir = self.root / "dist"
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_monthly.db"
        init_db(self.db_path)

        self.owner_token = "tok_owner_monthly_immutability"
        self.normal_token = "tok_normal_monthly_immutability"
        create_session(OWNER_ID, self.owner_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(NORMAL_USER_ID, self.normal_token, expires_in_seconds=86400, db_path=self.db_path)

        self.settings = AppSettings(
            app_stage="pilot",
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
        self.catalog_service = CatalogService(dist_dir=self.dist_dir, db_path=self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_november_catalog_version_and_isolation(self):
        # 1. Owner fetching November version via API
        res_nov_owner = self.client.get(
            "/api/catalog?catalog_id=released-catalog-202611-v1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_nov_owner.status_code, 200)
        data_nov_owner = res_nov_owner.json()
        self.assertEqual(data_nov_owner["catalog_id"], "released-catalog-202611-v1")
        self.assertEqual(data_nov_owner["catalog_month"], "2026-11")
        self.assertEqual(len(data_nov_owner["recipes"]), 36)

        # 2. Non-owner fetching November version: candidate c* recipes are isolated
        res_nov_normal = self.client.get(
            "/api/catalog?catalog_id=released-catalog-202611-v1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res_nov_normal.status_code, 200)
        data_nov_normal = res_nov_normal.json()
        self.assertEqual(data_nov_normal["catalog_id"], "released-catalog-202611-v1")
        # Only public released recipes returned
        self.assertEqual(len(data_nov_normal["recipes"]), 5)
        self.assertEqual(data_nov_normal["access"], "preview")
        for r in data_nov_normal["recipes"]:
            self.assertFalse(str(r["id"]).startswith("c"), "c* carnivore candidates must not leak to normal users")

    def test_december_catalog_version_and_isolation(self):
        # 1. Owner fetching December version
        res_dec_owner = self.client.get(
            "/api/catalog?catalog_id=released-catalog-202612-v1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_dec_owner.status_code, 200)
        data_dec_owner = res_dec_owner.json()
        self.assertEqual(data_dec_owner["catalog_id"], "released-catalog-202612-v1")
        self.assertEqual(data_dec_owner["catalog_month"], "2026-12")
        self.assertEqual(data_dec_owner["editorial_status"], "draft_for_owner_review")
        self.assertEqual(len(data_dec_owner["recipes"]), 40)

        # Recipe c17 exists for owner
        rec_c17 = self.catalog_service.get_recipe_by_id("c17", catalog_id="released-catalog-202612-v1", is_owner=True)
        self.assertIsNotNone(rec_c17)
        self.assertEqual(rec_c17["title"], "Томлёная баранья голяшка в собственном соку")

        # Recipe c17 is blocked for normal user
        rec_c17_normal = self.catalog_service.get_recipe_by_id("c17", catalog_id="released-catalog-202612-v1", is_owner=False)
        self.assertIsNone(rec_c17_normal)

        # Normal user requesting December catalog gets 403 Forbidden
        res_dec_normal = self.client.get(
            "/api/catalog?catalog_id=released-catalog-202612-v1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res_dec_normal.status_code, 403)
        self.assertIn("owner review", res_dec_normal.json().get("detail", "").lower())

    def test_catalogs_registry_endpoint(self):
        # 1. Owner gets list with all catalogs accessible
        res_owner = self.client.get("/api/catalogs", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res_owner.status_code, 200)
        cats_owner = res_owner.json().get("catalogs", [])
        dec_owner = next((c for c in cats_owner if c["catalog_id"] == "released-catalog-202612-v1"), None)
        self.assertIsNotNone(dec_owner)
        self.assertTrue(dec_owner["accessible"])
        self.assertEqual(dec_owner["total_recipes"], 40)

        # 2. Normal user gets December catalog marked accessible: False
        res_normal = self.client.get("/api/catalogs", headers={"Authorization": f"Bearer {self.normal_token}"})
        self.assertEqual(res_normal.status_code, 200)
        cats_normal = res_normal.json().get("catalogs", [])
        dec_normal = next((c for c in cats_normal if c["catalog_id"] == "released-catalog-202612-v1"), None)
        self.assertIsNotNone(dec_normal)
        self.assertFalse(dec_normal["accessible"])

    def test_december_candidate_recipes_have_all_required_fields(self):
        dec_cat = self.catalog_service.get_catalog_data_for_version("released-catalog-202612-v1", is_owner=True)
        self.assertIsNotNone(dec_cat)
        dec_recipes = {r["id"]: r for r in dec_cat["recipes"]}
        for rid in ["k21", "k22", "c17", "c18"]:
            self.assertIn(rid, dec_recipes)
            r = dec_recipes[rid]
            # Verify all required Recipe fields exist
            for field in ["time", "diff", "emoji", "g", "cost", "make", "freeze", "fam", "batch", "store", "ing", "steps"]:
                self.assertIn(field, r, f"Recipe {rid} missing required field '{field}'")
            self.assertIsInstance(r["time"], int)
            self.assertGreater(r["time"], 0)
            self.assertLessEqual(r["time"], 240, f"Recipe {rid} time must be <= 240 min")

        # Verify k22 ingredients match docs/release/monthly-editorial-package-202612.md
        k22_ing_names = [item[0] for item in dec_recipes["k22"]["ing"]]
        for expected in ["Цветная капуста", "Сливки 33%", "Бекон", "Сливочное масло", "Бульон костный", "Мускатный орех"]:
            self.assertIn(expected, k22_ing_names)

    def test_historical_november_menu_immutability(self):
        # Saved November menu preserves its exact catalog_id and recipe lookups
        nov_menu = {
            "mode": "carnivore",
            "numDays": 28,
            "meals": 1,
            "portion": 1,
            "month": "2026-11",
            "catalog_id": "released-catalog-202611-v1",
            "days": [{"date": f"2026-11-{i+1:02d}", "slots": {"dinner": "c1"}} for i in range(28)],
        }
        # In November, c1 was Ribeye steak with tallow
        rec = self.catalog_service.get_recipe_by_id("c1", catalog_id=nov_menu["catalog_id"], is_owner=True)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["title"], "Стейк на сковороде с топлёным маслом")

    def test_unknown_version_strictly_returns_404_no_fallback(self):
        res = self.client.get(
            "/api/catalog?catalog_id=released-catalog-209999-v1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res.status_code, 404)
        self.assertIn("not found", res.json().get("detail", "").lower())
