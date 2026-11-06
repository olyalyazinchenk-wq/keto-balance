import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import json
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.config import ADMIN_ID
from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app
from bot.app_db import (
    create_or_get_user,
    create_session,
    get_catalog_snapshot,
    get_admin_catalog_version,
)

TEST_TOKEN = "333444555:REMEDIATION_PUB_VALIDATION_TOKEN"

class TestPublicationValidationAndMenuReproducibility(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "pub_val_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
            app_stage="test",
        )
        self.app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=self.settings)
        self.client = TestClient(self.app)

        # Admin User session
        create_or_get_user(ADMIN_ID, username="admin_tester", db_path=self.db_path)
        self.admin_token = "admin_token_pub_val"
        create_session(ADMIN_ID, self.admin_token, expires_in_seconds=3600, db_path=self.db_path)
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

        # Regular User session
        self.user_id = 9001
        create_or_get_user(self.user_id, username="user_menu", db_path=self.db_path)
        self.user_token = "user_token_menu"
        create_session(self.user_id, self.user_token, expires_in_seconds=3600, db_path=self.db_path)
        self.user_headers = {"Authorization": f"Bearer {self.user_token}"}

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_publish_draft_without_ingredients_fails_422(self):
        """Publishing a draft without ingredients ('ing') must be rejected with HTTP 422."""
        recipe_id = "inc_no_ing"
        draft = {
            "recipe_id": recipe_id,
            "recipe_data": {
                "id": recipe_id,
                "title": "Incomplete Recipe Without Ingredients",
                "kcal": 300,
                "steps": ["Step 1: Just cook it."],
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
            },
        }
        save_resp = self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        self.assertEqual(save_resp.status_code, 200)

        pub_resp = self.client.post(f"/api/admin/recipes/{recipe_id}/publish", headers=self.admin_headers)
        self.assertEqual(pub_resp.status_code, 422, f"Expected 422 on missing ingredients, got {pub_resp.status_code}: {pub_resp.text}")
        self.assertIn("ingredient", pub_resp.json().get("detail", "").lower())

    def test_publish_draft_without_steps_fails_422(self):
        """Publishing a draft without preparation steps ('steps') must be rejected with HTTP 422."""
        recipe_id = "inc_no_steps"
        draft = {
            "recipe_id": recipe_id,
            "recipe_data": {
                "id": recipe_id,
                "title": "Incomplete Recipe Without Steps",
                "kcal": 300,
                "ing": [["Мясо", "200 г"]],
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
            },
        }
        save_resp = self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        self.assertEqual(save_resp.status_code, 200)

        pub_resp = self.client.post(f"/api/admin/recipes/{recipe_id}/publish", headers=self.admin_headers)
        self.assertEqual(pub_resp.status_code, 422, f"Expected 422 on missing steps, got {pub_resp.status_code}: {pub_resp.text}")
        self.assertIn("step", pub_resp.json().get("detail", "").lower())

    def test_publish_draft_unverified_status_fails_422(self):
        """Publishing a draft that has unverified approval marks (approved: False) must be rejected with HTTP 422."""
        recipe_id = "unverified_recipe"
        draft = {
            "recipe_id": recipe_id,
            "recipe_data": {
                "id": recipe_id,
                "title": "Unverified Recipe",
                "kcal": 400,
                "ing": [["Сыр", "100 г"]],
                "steps": ["Step 1: Slice and serve."],
            },
            "approval_marks": {
                "approved": False,
                "notes": "Still unverified",
            },
        }
        save_resp = self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        self.assertEqual(save_resp.status_code, 200)

        pub_resp = self.client.post(f"/api/admin/recipes/{recipe_id}/publish", headers=self.admin_headers)
        self.assertEqual(pub_resp.status_code, 422, f"Expected 422 on unverified status, got {pub_resp.status_code}: {pub_resp.text}")
        self.assertIn("approved", pub_resp.json().get("detail", "").lower())

    def test_publish_succeeds_and_invalidates_user_catalog_cache(self):
        """
        When a verified, complete recipe is published, user catalog cache is invalidated
        and /api/catalog immediately reflects the updated catalog version and recipe.
        """
        # 1. Warm cache of user catalog
        initial_cat_resp = self.client.get("/api/catalog")
        self.assertEqual(initial_cat_resp.status_code, 200)
        initial_cat = initial_cat_resp.json()
        initial_count = len(initial_cat.get("recipes", []))

        # 2. Publish complete verified recipe
        valid_recipe_id = "valid_complete_recipe"
        draft = {
            "recipe_id": valid_recipe_id,
            "recipe_data": {
                "id": valid_recipe_id,
                "title": "Новый проверенный кето-салат",
                "kcal": 350,
                "mode": "keto",
                "ing": [["Огурец", "100 г"], ["Авокадо", "1 шт"], ["Оливковое масло", "15 мл"]],
                "steps": ["Нарежьте огурец и авокадо кубиками.", "Заправьте оливковым маслом и посолите."],
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
                "source": "Клинический протокол КетоБаланс 2026",
            },
        }
        self.client.post("/api/admin/recipes", json=draft, headers=self.admin_headers)
        pub_resp = self.client.post(f"/api/admin/recipes/{valid_recipe_id}/publish", headers=self.admin_headers)
        self.assertEqual(pub_resp.status_code, 200)

        # 3. Cache must be invalidated: /api/catalog immediately reflects the new recipe
        fresh_cat_resp = self.client.get("/api/catalog")
        self.assertEqual(fresh_cat_resp.status_code, 200)
        fresh_cat = fresh_cat_resp.json()
        self.assertEqual(len(fresh_cat.get("recipes", [])), initial_count + 1)
        found_ids = {r["id"] for r in fresh_cat.get("recipes", [])}
        self.assertIn(valid_recipe_id, found_ids)

        # Check single recipe endpoint as well
        rec_resp = self.client.get(f"/api/catalog/{valid_recipe_id}")
        self.assertEqual(rec_resp.status_code, 200)
        self.assertEqual(rec_resp.json()["title"], "Новый проверенный кето-салат")

    def test_saved_user_menu_remains_reproducible_and_intact_across_recipe_updates(self):
        """
        Saved user menus must remain 100% reproducible and intact before and after recipe updates.
        """
        # 1. User saves menu referencing k2
        user_menu = {
            "mode": "keto",
            "numDays": 1,
            "meals": 2,
            "portion": 1,
            "saved": True,
            "created": 1700000000,
            "days": [
                {
                    "date": "2026-11-06",
                    "slots": {
                        "breakfast": "k2",
                        "lunch": "k1",
                    }
                }
            ]
        }
        save_payload = {
            "schema_version": 1,
            "expected_revision": 0,
            "profile": None,
            "state": {
                "schema_version": 1,
                "menu": user_menu,
                "selected_date": "2026-11-06",
                "checked_ingredients": {},
                "checked_steps": {},
                "shopping_batches": 1,
                "shopping_stale": False,
            }
        }
        user_save_resp = self.client.put("/api/user", json=save_payload, headers=self.user_headers)
        self.assertEqual(user_save_resp.status_code, 200)

        # Read user state before admin update
        before_resp = self.client.get("/api/user", headers=self.user_headers)
        self.assertEqual(before_resp.status_code, 200)
        menu_before = before_resp.json()["state"]["menu"]

        # 2. Admin updates recipe k2 (title & kcal) and publishes
        initial_ver = get_admin_catalog_version(self.db_path)
        draft_k2 = {
            "recipe_id": "k2",
            "recipe_data": {
                "id": "k2",
                "title": "Омлет с сыром и прованскими травами (Новая версия)",
                "kcal": 490,
            },
            "approval_marks": {
                "approved": True,
                "approved_by": "Ольга",
                "source": "Клинический протокол 2026",
            },
        }
        self.client.post("/api/admin/recipes", json=draft_k2, headers=self.admin_headers)
        pub_k2 = self.client.post("/api/admin/recipes/k2/publish", headers=self.admin_headers)
        self.assertEqual(pub_k2.status_code, 200)

        # 3. User reads their saved menu AFTER recipe update
        after_resp = self.client.get("/api/user", headers=self.user_headers)
        self.assertEqual(after_resp.status_code, 200)
        menu_after = after_resp.json()["state"]["menu"]

        # The user's saved menu remains 100% identical and intact
        self.assertEqual(menu_before, menu_after)
        self.assertEqual(menu_after["days"][0]["slots"]["breakfast"], "k2")
        self.assertEqual(menu_after["portion"], 1)

        # Historical snapshot v1 still contains the original k2 title
        snap_v1 = get_catalog_snapshot(initial_ver, self.db_path)
        k2_orig = next(r for r in snap_v1 if r["id"] == "k2")
        self.assertEqual(k2_orig["title"], "Омлет с сыром и зеленью")

if __name__ == "__main__":
    unittest.main()
