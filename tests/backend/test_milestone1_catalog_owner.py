"""tests/backend/test_milestone1_catalog_owner.py
Tests for Milestone 1:
- Versioned catalog ID lookup and owner access control
- Shopping consistency with owner carnivore recipes
- 404 on unknown catalog version without fallback
- 403 on admin-catalog-v* snapshots for non-owners
- HTTP Cache-Control: private, no-cache and Vary isolation headers
"""
import json
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_db import (
    init_db,
    get_db_connection,
    create_session,
)
from bot.app_settings import AppSettings
from bot.catalog import (
    CatalogService,
    is_shopping_consistent_with_menu,
)
from bot.server import create_app

OWNER_ID = 1084557944
NORMAL_USER_ID = 555666777

class TestMilestone1CatalogOwner(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.db_path = self.dir_path / "test_m1.db"
        self.dist_dir = self.dir_path / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)

        (self.dist_dir / "index.html").write_text("<html><body>KetoBalance</body></html>", encoding="utf-8")

        # Create keto recipes and carnivore candidate recipes
        keto_recipes = [
            {
                "id": f"k{i}",
                "title": f"Keto Recipe {i}",
                "mode": "keto",
                "cat": "lunch",
                "kcal": 400,
                "editorial_status": "approved",
                "ing": [["Шпинат", "100 г"], ["Яйца", "2 шт."]],
            }
            for i in range(1, 21)
        ]
        carnivore_recipes = [
            {
                "id": f"c{i}",
                "title": f"Carnivore Recipe {i}",
                "mode": "carnivore",
                "cat": "dinner",
                "kcal": 600,
                "editorial_status": "review",
                "ing": [["Стейк рибай", "1 шт"], ["Топлёное масло", "1 ст. л."]],
            }
            for i in range(1, 17)
        ]
        all_recipes = keto_recipes + carnivore_recipes

        cat_data = {
            "schema_version": 1,
            "catalog_id": "released-catalog-202611-v1",
            "catalog_month": "2026-11",
            "test_only": False,
            "released_ids": [r["id"] for r in all_recipes],
            "public_released_ids": [r["id"] for r in keto_recipes],
            "owner_review_ids": [r["id"] for r in carnivore_recipes],
            "recipes": all_recipes,
            "nutrition_status": "unverified",
        }
        (self.dist_dir / "released-catalog.json").write_text(
            json.dumps(cat_data, ensure_ascii=False), encoding="utf-8"
        )

        init_db(self.db_path)
        with get_db_connection(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM admin_catalog_versions")
            cur.execute(
                """
                INSERT INTO admin_catalog_versions (version, published_by, recipes_count, snapshot_json)
                VALUES (1, 1084557944, ?, ?)
                """,
                (len(all_recipes), json.dumps(all_recipes, ensure_ascii=False)),
            )

        self.owner_token = "owner_token_m1_test"
        self.normal_token = "normal_token_m1_test"
        create_session(OWNER_ID, self.owner_token, expires_in_seconds=86400, db_path=self.db_path)
        create_session(NORMAL_USER_ID, self.normal_token, expires_in_seconds=86400, db_path=self.db_path)

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
        self.catalog_service = CatalogService(dist_dir=self.dist_dir, db_path=self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_versioned_catalog_lookup_and_owner_isolation(self):
        # 1. Owner can access carnivore candidate recipes by catalog ID
        recipe_c1_owner = self.catalog_service.get_recipe_by_id(
            "c1", catalog_id="released-catalog-202611-v1", is_owner=True
        )
        self.assertIsNotNone(recipe_c1_owner)
        self.assertEqual(recipe_c1_owner["id"], "c1")

        # 2. Non-owner CANNOT access carnivore candidate recipes by catalog ID
        recipe_c1_normal = self.catalog_service.get_recipe_by_id(
            "c1", catalog_id="released-catalog-202611-v1", is_owner=False
        )
        self.assertIsNone(recipe_c1_normal)

        # 3. Non-existent catalog ID returns None (no silent fallback to current)
        recipe_unknown_cat = self.catalog_service.get_recipe_by_id(
            "k1", catalog_id="unknown-catalog-id-999", is_owner=True
        )
        self.assertIsNone(recipe_unknown_cat)

        cat_unknown = self.catalog_service.get_catalog_data_for_version(
            "unknown-catalog-id-999", is_owner=True
        )
        self.assertIsNone(cat_unknown)

    def test_shopping_consistency_with_owner_carnivore_menu(self):
        carnivore_menu = {
            "mode": "carnivore",
            "meals": 1,
            "portion": 1,
            "catalog_id": "released-catalog-202611-v1",
            "days": [
                {
                    "date": "2026-11-08",
                    "slots": {"dinner": "c1"},
                }
            ],
        }
        matching_shopping = [
            {"id": "s1", "name": "Стейк рибай", "amountLabel": "1 шт", "linkedRecipeTitles": ["Carnivore Recipe 1"]},
            {"id": "s2", "name": "Топлёное масло", "amountLabel": "1 ст. л.", "linkedRecipeTitles": ["Carnivore Recipe 1"]},
        ]

        # For owner: consistency should pass
        is_consistent_owner = is_shopping_consistent_with_menu(
            carnivore_menu,
            1,
            matching_shopping,
            catalog_service=self.catalog_service,
            is_owner=True,
        )
        self.assertTrue(is_consistent_owner)

        # For regular user: consistency fails because c1 is not accessible
        is_consistent_normal = is_shopping_consistent_with_menu(
            carnivore_menu,
            1,
            matching_shopping,
            catalog_service=self.catalog_service,
            is_owner=False,
        )
        self.assertFalse(is_consistent_normal)

    def test_unknown_version_returns_404_no_silent_fallback(self):
        # GET /api/catalog with unknown catalog_id
        res_cat = self.client.get(
            "/api/catalog?catalog_id=nonexistent-catalog-v99",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_cat.status_code, 404)
        self.assertIn("nonexistent-catalog-v99", res_cat.json().get("detail", ""))
        self.assertIn("not found", res_cat.json().get("detail", ""))

        # GET /api/recipes/{id} with unknown catalog_id
        res_rec = self.client.get(
            "/api/recipes/k1?catalog_id=nonexistent-catalog-v99",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_rec.status_code, 404)

    def test_admin_catalog_requires_owner_privileges(self):
        # Regular user requesting admin-catalog-v1 gets 403 Forbidden
        res = self.client.get(
            "/api/catalog?catalog_id=admin-catalog-v1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("owner", res.json().get("detail", "").lower())

        # Owner requesting admin-catalog-v1 gets 200 OK
        res_owner = self.client.get(
            "/api/catalog?catalog_id=admin-catalog-v1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_owner.status_code, 200)

    def test_cache_control_and_vary_headers(self):
        # /api/catalog has dynamic isolation headers
        res_cat = self.client.get(
            "/api/catalog",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_cat.status_code, 200)
        self.assertEqual(res_cat.headers.get("cache-control"), "private, no-cache")
        self.assertEqual(res_cat.headers.get("vary"), "Authorization, Cookie, X-User-Id")

        # /api/recipes/k1 has dynamic isolation headers
        res_rec = self.client.get(
            "/api/recipes/k1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_rec.status_code, 200)
        self.assertEqual(res_rec.headers.get("cache-control"), "private, no-cache")
        self.assertEqual(res_rec.headers.get("vary"), "Authorization, Cookie, X-User-Id")

    def test_default_catalog_without_catalog_id_filters_candidate_recipes_for_normal_user(self):
        """
        When an admin snapshot is present in DB, GET /api/catalog without catalog_id
        must return released-catalog-202611-v1 and filter out carnivore candidate recipes
        for normal and unauthenticated users in public/pilot stage.
        """
        pilot_settings = AppSettings(
            app_stage="pilot",
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            allow_anonymous_preview=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        pilot_app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=pilot_settings)
        pilot_client = TestClient(pilot_app)

        # 1. Normal authenticated user
        res_normal = pilot_client.get(
            "/api/catalog",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res_normal.status_code, 200)
        data_normal = res_normal.json()
        self.assertFalse(
            data_normal.get("catalog_id", "").startswith("admin-catalog-v"),
            f"Normal user received admin catalog ID: {data_normal.get('catalog_id')}"
        )
        self.assertEqual(data_normal.get("catalog_id"), "released-catalog-202611-v1")

        # Verify candidate recipes (c1..c16) are NOT in released_ids
        normal_released = set(data_normal.get("released_ids", []))
        leaked_in_ids = [cid for cid in normal_released if cid.startswith("c")]
        self.assertEqual(len(leaked_in_ids), 0, f"Candidate recipes leaked in released_ids: {leaked_in_ids}")

        # Verify candidate recipes are NOT in recipes list
        leaked_in_recipes = [r["id"] for r in data_normal.get("recipes", []) if r.get("id", "").startswith("c")]
        self.assertEqual(len(leaked_in_recipes), 0, f"Candidate recipes leaked in recipes: {leaked_in_recipes}")

        # Verify public keto recipes (k1..k20) ARE present
        self.assertTrue(all(f"k{i}" in normal_released for i in range(1, 21)))

        # 2. Unauthenticated caller
        res_unauth = pilot_client.get("/api/catalog")
        self.assertEqual(res_unauth.status_code, 200)
        data_unauth = res_unauth.json()
        self.assertFalse(data_unauth.get("catalog_id", "").startswith("admin-catalog-v"))
        unauth_released = set(data_unauth.get("released_ids", []))
        self.assertEqual(len([cid for cid in unauth_released if cid.startswith("c")]), 0)

    def test_default_recipe_endpoint_without_catalog_id_blocks_candidate_recipes_for_normal_user(self):
        """
        When an admin snapshot is present in DB, GET /api/catalog/c1 without catalog_id
        must return HTTP 404 for normal users, but 200 for public keto recipes.
        """
        pilot_settings = AppSettings(
            app_stage="pilot",
            owner_allowlist=frozenset([OWNER_ID]),
            allow_demo_auth=False,
            allow_anonymous_preview=False,
            db_path=self.db_path,
            dist_dir=self.dist_dir,
        )
        pilot_app = create_app(dist_dir=self.dist_dir, db_path=self.db_path, settings=pilot_settings)
        pilot_client = TestClient(pilot_app)

        # Normal user requesting candidate c1 -> 404 Not Found
        res_c1_normal = pilot_client.get(
            "/api/catalog/c1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(
            res_c1_normal.status_code, 404,
            f"Candidate c1 must return 404 for normal user, got {res_c1_normal.status_code}"
        )

        # Unauthenticated requesting candidate c1 -> 404 Not Found
        res_c1_unauth = pilot_client.get("/api/catalog/c1")
        self.assertEqual(res_c1_unauth.status_code, 404)

        # Normal user requesting public keto recipe k1 -> 200 OK
        res_k1_normal = pilot_client.get(
            "/api/catalog/k1",
            headers={"Authorization": f"Bearer {self.normal_token}"},
        )
        self.assertEqual(res_k1_normal.status_code, 200)
        self.assertEqual(res_k1_normal.json().get("id"), "k1")

    def test_default_endpoints_allow_owner_access_to_candidate_recipes(self):
        """
        Owner session calling default endpoints without catalog_id
        must receive candidate recipes (c1..c16) with HTTP 200.
        """
        # Owner calling GET /api/catalog
        res_cat_owner = self.client.get(
            "/api/catalog",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_cat_owner.status_code, 200)
        data_owner = res_cat_owner.json()
        owner_released = set(data_owner.get("released_ids", []))
        self.assertTrue(
            all(f"c{i}" in owner_released for i in range(1, 17)),
            "Owner must receive all candidate recipes c1..c16 in default catalog"
        )

        # Owner calling GET /api/catalog/c1
        res_c1_owner = self.client.get(
            "/api/catalog/c1",
            headers={"Authorization": f"Bearer {self.owner_token}"},
        )
        self.assertEqual(res_c1_owner.status_code, 200)
        self.assertEqual(res_c1_owner.json().get("id"), "c1")

if __name__ == "__main__":
    unittest.main()
