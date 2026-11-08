"""tests/backend/test_owner_access_mode.py
Tests for Owner Access Mode and Private Preview Security.
"""
import json
import tempfile
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_db import (
    init_db,
    get_db_connection,
    create_session,
    save_recipe_draft,
    publish_recipe_draft,
    get_admin_catalog_version,
    get_catalog_snapshot,
    save_pilot_user,
    get_pilot_user,
    save_pilot_shopping,
    get_pilot_shopping,
)
from bot.app_settings import AppSettings
from bot.catalog import (
    CatalogService,
    load_static_catalog,
    is_shopping_consistent_with_menu,
)
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

        # Create 20-recipe candidate catalog in dist/released-catalog.json
        recipe_list = [
            {
                "id": f"k{i}",
                "title": f"Recipe {i}",
                "mode": "keto",
                "kcal": 400,
                "ing": [["Шпинат", "100 г"], ["Яйца", "2 шт."]],
            }
            for i in range(1, 21)
        ]
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
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM admin_catalog_versions")
            cur.execute("DELETE FROM admin_recipes")
            for r in recipe_list:
                cur.execute(
                    """
                    INSERT INTO admin_recipes
                    (recipe_id, title, version, status, published_payload_json, approval_marks_json)
                    VALUES (?, ?, 1, 'published', ?, ?)
                    """,
                    (r["id"], r["title"], json.dumps(r, ensure_ascii=False), json.dumps({"approved": False})),
                )
            cur.execute(
                """
                INSERT INTO admin_catalog_versions (version, published_by, recipes_count, snapshot_json)
                VALUES (1, 1084557944, ?, ?)
                """,
                (len(recipe_list), json.dumps(recipe_list, ensure_ascii=False)),
            )

        self.owner_token = "test_owner_token_abc123"
        self.other_token = "test_other_token_xyz789"
        self.expired_token = "test_expired_token_000"
        create_session(OWNER_ID, self.owner_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(OTHER_USER_ID, self.other_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(OWNER_ID, self.expired_token, expires_in_seconds=-10, db_path=self.db_path)

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
        self.catalog_service = CatalogService(dist_dir=self.dist_dir, db_path=self.db_path, app_stage="staging")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_anonymous_catalog_bypass_attempts_blocked(self):
        bypass_paths = [
            "/released-catalog.json",
            "/released-catalog.json/.",
            "/released-catalog.json%2f.",
            "/released-catalog.json/",
            "/released-catalog.json/./",
            "/released-catalog.json?v=123",
            "/catalog.json",
            "/catalog.json/.",
        ]
        for path in bypass_paths:
            res = self.client.get(path)
            self.assertEqual(res.status_code, 401, f"Path {path} returned {res.status_code} instead of 401")
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

    def test_catalog_endpoint_in_owner_mode_requires_owner_session(self):
        # 1. Anonymous request -> 401
        res = self.client.get("/api/catalog")
        self.assertEqual(res.status_code, 401)

        # 2. Invalid session -> 401
        res = self.client.get("/api/catalog", headers={"Authorization": "Bearer bad_token"})
        self.assertEqual(res.status_code, 401)

        # 3. Expired session -> 401
        res = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.expired_token}"})
        self.assertEqual(res.status_code, 401)

        # 4. Other user (not in owner allowlist) -> 403
        res = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.other_token}"})
        self.assertEqual(res.status_code, 403)

        # 5. Valid owner session -> 200, 20 recipes
        res = self.client.get("/api/catalog", headers={"Authorization": f"Bearer {self.owner_token}"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data.get("recipes", [])), 20)
        self.assertEqual(len(data.get("released_ids", [])), 20)

    def test_public_mode_does_not_grant_owner_tier_automatically(self):
        public_settings = AppSettings(
            app_stage="production",
            owner_allowlist=frozenset([OWNER_ID]),
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        public_app = create_app(
            dist_dir=self.dist_dir,
            db_path=self.db_path,
            settings=public_settings,
        )
        pub_client = TestClient(public_app)
        headers = {"Authorization": f"Bearer {self.owner_token}"}
        res = pub_client.get("/api/subscription", headers=headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data.get("is_premium"))
        self.assertNotEqual(data.get("tier"), "owner")
        self.assertGreater(len(data.get("available_products", [])), 0)

    def test_recipe_mutation_preserves_historical_menu_ingredients_and_shopping(self):
        """Proof: after recipe modification, old menu preserves exact ingredients and shopping,
        while new menu uses the updated recipe version.
        """
        # Step 1: Initial catalog version is 1
        initial_v = get_admin_catalog_version(self.db_path)
        cat_id_v1 = f"admin-catalog-v{initial_v}"

        # Menu 1 generated under Version 1
        menu_v1 = {
            "mode": "keto",
            "numDays": 1,
            "meals": 1,
            "portion": 1,
            "saved": True,
            "created": 1794000000,
            "catalog_id": cat_id_v1,
            "days": [{"date": "2026-11-07", "slots": {"breakfast": "k1"}}],
        }
        # Shopping for Menu 1: 100g spinach, 2 eggs
        shopping_items_v1 = [
            {"name": "шпинат", "amountLabel": "100 г", "checked": False, "category": "produce", "linkedRecipeTitles": ["Recipe 1"]},
            {"name": "яйца", "amountLabel": "2 шт.", "checked": False, "category": "dairy", "linkedRecipeTitles": ["Recipe 1"]},
        ]
        self.assertTrue(
            is_shopping_consistent_with_menu(menu_v1, 1, shopping_items_v1, self.catalog_service)
        )

        # Step 2: Admin edits recipe k1 (spinach increases to 350g, eggs to 4)
        updated_k1 = {
            "id": "k1",
            "title": "Сливочная яичница с беконом (Обновлённая)",
            "mode": "keto",
            "kcal": 550,
            "prot": 25.0,
            "fat": 45.0,
            "carb": 3.0,
            "serv": 1,
            "ing": [["Шпинат", "350 г"], ["Яйца", "4 шт."]],
            "steps": ["Обжарить шпинат", "Вбить яйца и довести до готовности"],
        }
        save_recipe_draft(
            "k1",
            updated_k1,
            approval_marks={"approved": True, "approved_by": 1084557944, "source": "Draft revision test"},
            db_path=self.db_path,
        )
        publish_recipe_draft("k1", 1084557944, db_path=self.db_path)
        self.catalog_service.invalidate_cache()

        new_v = get_admin_catalog_version(self.db_path)
        self.assertEqual(new_v, initial_v + 1)
        cat_id_v2 = f"admin-catalog-v{new_v}"

        # Step 3: Menu 2 generated under Version 2
        menu_v2 = {
            "mode": "keto",
            "numDays": 1,
            "meals": 1,
            "portion": 1,
            "saved": True,
            "created": 1794000001,
            "catalog_id": cat_id_v2,
            "days": [{"date": "2026-11-07", "slots": {"breakfast": "k1"}}],
        }
        shopping_items_v2 = [
            {"name": "шпинат", "amountLabel": "350 г", "checked": False, "category": "produce", "linkedRecipeTitles": ["Сливочная яичница с беконом (Обновлённая)"]},
            {"name": "яйца", "amountLabel": "4 шт.", "checked": False, "category": "dairy", "linkedRecipeTitles": ["Сливочная яичница с беконом (Обновлённая)"]},
        ]
        self.assertTrue(
            is_shopping_consistent_with_menu(menu_v2, 1, shopping_items_v2, self.catalog_service)
        )

        # CRITICAL INVARIANT:
        # 1. Historical Menu 1 STILL validates against its original 100g / 2 pcs!
        self.assertTrue(
            is_shopping_consistent_with_menu(menu_v1, 1, shopping_items_v1, self.catalog_service),
            "Old menu must preserve historical ingredients and shopping consistency!",
        )
        # 2. Historical Menu 1 REJECTS the new 350g shopping items!
        self.assertFalse(
            is_shopping_consistent_with_menu(menu_v1, 1, shopping_items_v2, self.catalog_service),
            "Old menu must reject newer recipe quantities!",
        )
        # 3. Recipe lookup with catalog_id="admin-catalog-v1" returns exact 100g
        k1_snap1 = self.catalog_service.get_recipe_by_id("k1", catalog_id=cat_id_v1)
        self.assertEqual(k1_snap1["ing"], [["Шпинат", "100 г"], ["Яйца", "2 шт."]])

        # 4. Recipe lookup with catalog_id="admin-catalog-v2" returns exact 350g
        k1_snap2 = self.catalog_service.get_recipe_by_id("k1", catalog_id=cat_id_v2)
        self.assertEqual(k1_snap2["ing"], [["Шпинат", "350 г"], ["Яйца", "4 шт."]])

    def test_legacy_menu_without_catalog_id_preserved_without_silent_mutation(self):
        """Legacy menus with catalog_id=None must remain intact without silent rewriting."""
        legacy_menu = GeneratedMenuModel(
            mode="keto",
            numDays=3,
            meals=2,
            portion=1,
            saved=True,
            created=1794000000,
            catalog_id=None,
            days=[
                DayMenuModel(date="2026-11-07", slots={"breakfast": "k1", "dinner": "k2"}),
                DayMenuModel(date="2026-11-08", slots={"breakfast": "k1", "dinner": "k2"}),
                DayMenuModel(date="2026-11-09", slots={"breakfast": "k1", "dinner": "k2"}),
            ],
        )
        data = legacy_menu.model_dump()
        self.assertIsNone(data.get("catalog_id"))
        restored = GeneratedMenuModel.model_validate(data)
        self.assertIsNone(restored.catalog_id, "catalog_id must remain None, no silent mutation allowed")

if __name__ == "__main__":
    unittest.main()
